import React, {
  lazy,
  Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Database,
  Download,
  Edit3,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderSync,
  Gauge,
  HardDrive,
  IndianRupee,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import {
  AccountMode,
  ComplianceDocument,
  ComplianceDocumentCategory,
  ComplianceDocumentStatus,
  Driver,
  DriverStatus,
  NotificationAlertType,
  NotificationChannel,
  NotificationLog,
  NotificationSeverity,
  NotificationStatus,
  OrganizationMember,
  OrgMemberRole,
  ServiceRecord,
  ServiceRecordStatus,
  ServiceRecordType,
  Vehicle,
} from '../types/fleet';
import {
  aggregateDriverSettlements,
  aggregateLogbookByPeriod,
  aggregateVehicleProfitAndLoss,
  evaluateFleetComplianceAlerts,
  evaluateMilestoneExpiryAlerts,
  formatINR,
  formatKm,
  getDaysUntilExpiry,
  getTodayKolkataDate,
  roundCurrency,
  roundKm,
  validateComplianceDocumentInput,
  validateServiceRecordInput,
} from '../lib/calculations';
import {
  exportLogbookCsv15Column,
  generateDriverSettlementPdf,
  generateExecutiveFleetDossierPdf,
  generateLogbookPdfReport,
  generateServiceMaintenancePdf,
  generateVehicleProfitLossPdf,
  generateVehiclesCompliancePdf,
} from '../lib/pdfExport';
import { getSupabaseEnvironmentStatus } from '../lib/supabase';
import {
  connectGoogleDriveOAuth,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  getDriveAccessToken,
  SCOPES,
  setDriveAccessToken,
} from '../lib/firebase';
import {
  buildFleetBackupSnapshot,
  deleteDriveBackupFile,
  downloadDriveBackupJson,
  DriveFileMetadata,
  ensureFzeeLogDriveFolder,
  FZEELOG_DRIVE_FOLDER_NAME,
  listFzeeLogDriveBackups,
  parseAndValidateBackupJson,
  ParsedFleetBackupRestore,
  uploadCsvLogbookToDrive,
  uploadJsonSnapshotToDrive,
} from '../lib/googleDriveBackup';
const Vehicle3DViewer = lazy(() =>
  import('./Vehicle3DViewer').then((m) => ({default: m.Vehicle3DViewer}))
);

const Vehicle3DFallback = () => (
  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
    Loading 3D viewer…
  </div>
);


const SERVICE_TYPES: ServiceRecordType[] = [
  'Preventive Service',
  'Major Overhaul',
  'Tyre & Alignment',
  'Brake & Clutch',
  'CNG / Fuel System',
  'Electrical & Battery',
  'Body & Accident Repair',
  'Other',
];

const DOCUMENT_CATEGORIES: ComplianceDocumentCategory[] = [
  'Insurance Policy',
  'Fitness Certificate (FC)',
  'Commercial Permit',
  'Pollution Certificate (PUC)',
  'Registration Certificate (RC)',
  'Tax Token',
  'Driver License (DL)',
  'Service Invoice',
];

async function computeFileDigest(file: File): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const buf = await file.arrayBuffer();
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', buf);
      const hashArray = Array.from(new Uint8Array(hashBuffer)).slice(0, 8);
      const hex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `SHA256:${hex}`;
    }
  } catch {
    // Fallback below
  }
  return `FILE:${file.size}:${file.lastModified}`;
}

// ============================================================================
// 1. DRIVERS VIEW (Phase 2 Full CRUD, Search/Filter, Archive & Settlement Ledger)
// ============================================================================
export const DriversView: React.FC = () => {
  const {
    drivers,
    vehicles,
    logbookEntries,
    profile,
    saveDriver,
    setDriverArchiveStatus,
  } = useFleet();
  const defaultShare = profile?.defaultDriverSharePct ?? 30;
  const expiryWarnDays = profile?.expiryWarningDays ?? 30;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE_ONLY');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [archiveConfirmDriver, setArchiveConfirmDriver] =
    useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);

  const [formState, setFormState] = useState({
    fullName: '',
    phone: '',
    licenseNumber: '',
    licenseExpiry: '',
    defaultSharePct: defaultShare,
    assignedVehicleId: '',
    status: 'Active' as DriverStatus,
    joiningDate: getTodayKolkataDate(),
    notes: '',
  });

  const settlementRows = useMemo(
    () => aggregateDriverSettlements(drivers, logbookEntries),
    [drivers, logbookEntries]
  );

  const filteredSettlementRows = useMemo(() => {
    return settlementRows.filter(({ driver }) => {
      if (statusFilter === 'ACTIVE_ONLY' && driver.status === 'Archived')
        return false;
      if (
        statusFilter !== 'ALL' &&
        statusFilter !== 'ACTIVE_ONLY' &&
        driver.status !== statusFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${driver.fullName} ${driver.phone} ${driver.licenseNumber} ${driver.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [settlementRows, statusFilter, searchQuery]);

  const openAdd = () => {
    setEditingDriver(null);
    setFormState({
      fullName: '',
      phone: '',
      licenseNumber: '',
      licenseExpiry: '',
      defaultSharePct: defaultShare,
      assignedVehicleId: '',
      status: 'Active',
      joiningDate: getTodayKolkataDate(),
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditingDriver(d);
    setFormState({
      fullName: d.fullName,
      phone: d.phone,
      licenseNumber: d.licenseNumber,
      licenseExpiry: d.licenseExpiry,
      defaultSharePct: d.defaultSharePct,
      assignedVehicleId: d.assignedVehicleId,
      status: d.status,
      joiningDate: d.joiningDate || getTodayKolkataDate(),
      notes: d.notes,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.fullName.trim()) return;
    setSaving(true);
    try {
      await saveDriver(formState, editingDriver?.id);
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Driver Roster, Attendance &amp; Revenue Share Settlements
          </h2>
          <p className="text-sm text-slate-500">
            Manage driver licenses, assigned vehicles, attendance counts, and cumulative driver share payouts.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Add Driver
        </button>
      </div>

      {/* Search & Status Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search driver name, phone, driving license..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full">
          {[
            { id: 'ACTIVE_ONLY', label: 'Active Roster' },
            { id: 'On Leave', label: 'On Leave' },
            { id: 'Archived', label: 'Archived' },
            { id: 'ALL', label: 'All' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredSettlementRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <UserCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            No drivers match your current filter
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Add drivers to assign them to vehicles, track DL expiry dates, and automate driver share calculations in the daily logbook.
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Driver
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Driver &amp; Contact</th>
                  <th className="py-3 px-4">License &amp; Expiry</th>
                  <th className="py-3 px-4">Assigned Vehicle</th>
                  <th className="py-3 px-4 text-right">Share %</th>
                  <th className="py-3 px-4 text-right">Attendance (P/HD/A)</th>
                  <th className="py-3 px-4 text-right">Total KM Driven</th>
                  <th className="py-3 px-4 text-right">Gross Generated</th>
                  <th className="py-3 px-4 text-right">Driver Share Earned</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredSettlementRows.map((row) => {
                  const d = row.driver;
                  const veh = vehicles.find(
                    (v) => v.id === d.assignedVehicleId
                  );
                  const dlDays = getDaysUntilExpiry(d.licenseExpiry);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 text-sm">
                          {d.fullName}
                        </div>
                        <div className="font-mono text-slate-500">
                          {d.phone || 'No phone'} · Joined{' '}
                          {d.joiningDate || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-900">
                          {d.licenseNumber || '—'}
                        </div>
                        <div
                          className={
                            dlDays !== null && dlDays <= expiryWarnDays
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-500'
                          }
                        >
                          Exp: {d.licenseExpiry || '—'}
                          {dlDays !== null ? ` (${dlDays}d)` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {veh ? veh.registrationNumber : 'Unassigned'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                        {d.defaultSharePct}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {row.presentDays}P · {row.halfDays}HD ·{' '}
                        {row.absentOrLeaveDays}A ({row.shiftsCount} shifts)
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-800">
                        {formatKm(row.totalKm)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                        {formatINR(row.grossEarningsGenerated)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-teal-700">
                        {formatINR(row.totalDriverShare)}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        <span
                          className={
                            d.status === 'Active'
                              ? 'text-emerald-700'
                              : d.status === 'On Leave'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(d)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            title="Edit Driver"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchiveConfirmDriver(d)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-md"
                            title={
                              d.status === 'Archived'
                                ? 'Restore Driver'
                                : 'Archive Driver'
                            }
                          >
                            {d.status === 'Archived' ? (
                              <RotateCcw className="w-4 h-4" />
                            ) : (
                              <Archive className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Driver Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingDriver ? 'Edit Driver Record' : 'Add Driver Record'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.fullName}
                    onChange={(e) =>
                      setFormState({ ...formState, fullName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98422 00000"
                    value={formState.phone}
                    onChange={(e) =>
                      setFormState({ ...formState, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    License Number
                  </label>
                  <input
                    type="text"
                    placeholder="TN38-20160048912"
                    value={formState.licenseNumber}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        licenseNumber: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    License Expiry Date
                  </label>
                  <input
                    type="date"
                    value={formState.licenseExpiry}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        licenseExpiry: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Default Driver Share %
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={formState.defaultSharePct}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        defaultSharePct: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Assigned Vehicle
                  </label>
                  <select
                    value={formState.assignedVehicleId}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        assignedVehicleId: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">— Unassigned —</option>
                    {vehicles
                      .filter((v) => v.status !== 'Archived')
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.registrationNumber} ({v.make} {v.model})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Joining Date
                  </label>
                  <input
                    type="date"
                    value={formState.joiningDate}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        joiningDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        status: e.target.value as DriverStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {['Active', 'On Leave', 'Inactive', 'Archived'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={formState.notes}
                  onChange={(e) =>
                    setFormState({ ...formState, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                >
                  {saving ? 'Saving...' : 'Save Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Driver Archive / Restore Confirmation Modal */}
      {archiveConfirmDriver && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              {archiveConfirmDriver.status === 'Archived'
                ? `Restore Driver ${archiveConfirmDriver.fullName}?`
                : `Archive Driver ${archiveConfirmDriver.fullName}?`}
            </h3>
            <p className="text-sm text-slate-600">
              {archiveConfirmDriver.status === 'Archived'
                ? 'Restoring returns this driver to active shift selection.'
                : 'Archiving hides this driver from active shift assignment while preserving all historical shift settlements.'}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setArchiveConfirmDriver(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const next: DriverStatus =
                    archiveConfirmDriver.status === 'Archived'
                      ? 'Active'
                      : 'Archived';
                  await setDriverArchiveStatus(archiveConfirmDriver, next);
                  setArchiveConfirmDriver(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. EARNINGS & EXPENSES VIEW (Interactive Charts, Summaries & Audit Ledger)
// ============================================================================
export const EarningsExpensesView: React.FC = () => {
  const { vehicles, logbookEntries, auditLogs } = useFleet();
  const [chartGranularity, setChartGranularity] = useState<'daily' | 'monthly'>(
    'daily'
  );

  const periodRows = useMemo(
    () =>
      aggregateLogbookByPeriod(logbookEntries, chartGranularity)
        .slice(0, 12)
        .reverse(),
    [logbookEntries, chartGranularity]
  );

  const expenseCategories = useMemo(() => {
    const totals = logbookEntries.reduce(
      (acc, e) => {
        acc.gasFuel = roundCurrency(acc.gasFuel + e.gasFuel);
        acc.redTaxi = roundCurrency(acc.redTaxi + e.redTaxi);
        acc.toll = roundCurrency(acc.toll + e.toll);
        acc.maintenance = roundCurrency(acc.maintenance + e.maintenance);
        acc.otherExpenses = roundCurrency(acc.otherExpenses + e.otherExpenses);
        return acc;
      },
      { gasFuel: 0, redTaxi: 0, toll: 0, maintenance: 0, otherExpenses: 0 }
    );
    const grandTotal = Math.max(
      1,
      totals.gasFuel +
        totals.redTaxi +
        totals.toll +
        totals.maintenance +
        totals.otherExpenses
    );

    return [
      {
        label: 'Gas / Fuel (CNG / Diesel / Petrol)',
        amount: totals.gasFuel,
        pct: roundCurrency((totals.gasFuel / grandTotal) * 100),
        color: 'bg-amber-500',
      },
      {
        label: 'Red Taxi / Platform Commissions',
        amount: totals.redTaxi,
        pct: roundCurrency((totals.redTaxi / grandTotal) * 100),
        color: 'bg-rose-500',
      },
      {
        label: 'Highway & Fastag Tolls',
        amount: totals.toll,
        pct: roundCurrency((totals.toll / grandTotal) * 100),
        color: 'bg-sky-500',
      },
      {
        label: 'Shift Repairs & Maintenance',
        amount: totals.maintenance,
        pct: roundCurrency((totals.maintenance / grandTotal) * 100),
        color: 'bg-indigo-500',
      },
      {
        label: 'Other Configured Operating Expenses',
        amount: totals.otherExpenses,
        pct: roundCurrency((totals.otherExpenses / grandTotal) * 100),
        color: 'bg-slate-500',
      },
    ];
  }, [logbookEntries]);

  const vehicleBreakdown = useMemo(() => {
    return vehicles.map((v) => {
      const entries = logbookEntries.filter((e) => e.vehicleId === v.id);
      const km = entries.reduce((s, e) => roundKm(s + e.kmDay), 0);
      const earnings = entries.reduce(
        (s, e) => roundCurrency(s + e.earnings),
        0
      );
      const driverShare = entries.reduce(
        (s, e) => roundCurrency(s + e.driverShare),
        0
      );
      const gasFuel = entries.reduce((s, e) => roundCurrency(s + e.gasFuel), 0);
      const redTaxi = entries.reduce((s, e) => roundCurrency(s + e.redTaxi), 0);
      const toll = entries.reduce((s, e) => roundCurrency(s + e.toll), 0);
      const maintenance = entries.reduce(
        (s, e) => roundCurrency(s + e.maintenance),
        0
      );
      const totalExpenses = entries.reduce(
        (s, e) => roundCurrency(s + e.totalExpenses),
        0
      );
      const net = entries.reduce(
        (s, e) => roundCurrency(s + e.netBusinessEarnings),
        0
      );
      return {
        vehicle: v,
        shifts: entries.length,
        km,
        earnings,
        driverShare,
        gasFuel,
        redTaxi,
        toll,
        maintenance,
        totalExpenses,
        net,
      };
    });
  }, [vehicles, logbookEntries]);

  const maxPeriodEarnings = Math.max(
    1,
    ...periodRows.map((r) => r.earnings)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Earnings, Operating Expenses &amp; Interactive Financial Charts
          </h2>
          <p className="text-sm text-slate-500">
            Visualizes Daily &amp; Monthly revenue trends, operating expense categories, and vehicle profitability.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setChartGranularity('daily')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              chartGranularity === 'daily'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Daily Trend
          </button>
          <button
            type="button"
            onClick={() => setChartGranularity('monthly')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              chartGranularity === 'monthly'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Monthly Trend
          </button>
        </div>
      </div>

      {/* Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Comparative Bar Chart: Gross vs Op Expenses vs Driver Share vs Net */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {chartGranularity === 'daily' ? 'Daily' : 'Monthly'} Earnings vs
              Expenses &amp; Net Profit Chart
            </h3>
            <p className="text-xs text-slate-500">
              Grouped comparison of Gross Earnings, Operating Expenses, Driver Share, and Net Business Profit (INR).
            </p>
          </div>

          {periodRows.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No logbook entries available to plot chart.
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="h-56 flex items-end gap-3 border-b border-slate-200 pb-2 px-2 overflow-x-auto">
                {periodRows.map((row) => {
                  const grossH = Math.max(
                    6,
                    Math.round((row.earnings / maxPeriodEarnings) * 180)
                  );
                  const expH = Math.max(
                    4,
                    Math.round((row.totalExpenses / maxPeriodEarnings) * 180)
                  );
                  const drvH = Math.max(
                    4,
                    Math.round((row.driverShare / maxPeriodEarnings) * 180)
                  );
                  const netH = Math.max(
                    4,
                    Math.round(
                      (Math.max(0, row.netBusinessEarnings) /
                        maxPeriodEarnings) *
                        180
                    )
                  );

                  return (
                    <div
                      key={row.periodKey}
                      className="flex-1 min-w-[68px] flex flex-col items-center gap-1.5 group"
                    >
                      <div className="text-[10px] font-mono text-slate-600 opacity-90">
                        {formatINR(row.netBusinessEarnings, true)}
                      </div>
                      <div className="w-full flex items-end justify-center gap-1 h-[185px]">
                        <div
                          style={{ height: `${grossH}px` }}
                          className="w-3 bg-slate-800 rounded-t transition-all"
                          title={`${row.periodKey} Gross Earnings: ${formatINR(
                            row.earnings
                          )}`}
                        />
                        <div
                          style={{ height: `${expH}px` }}
                          className="w-3 bg-amber-500 rounded-t transition-all"
                          title={`${
                            row.periodKey
                          } Operating Expenses: ${formatINR(row.totalExpenses)}`}
                        />
                        <div
                          style={{ height: `${drvH}px` }}
                          className="w-3 bg-slate-400 rounded-t transition-all"
                          title={`${row.periodKey} Driver Share: ${formatINR(
                            row.driverShare
                          )}`}
                        />
                        <div
                          style={{ height: `${netH}px` }}
                          className="w-3 bg-teal-600 rounded-t transition-all"
                          title={`${row.periodKey} Net Business: ${formatINR(
                            row.netBusinessEarnings
                          )}`}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-slate-700 whitespace-nowrap">
                        {row.periodKey}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-slate-800 inline-block" />
                  Gross Earnings
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
                  Operating Expenses
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-slate-400 inline-block" />
                  Driver Share
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-teal-600 inline-block" />
                  Net Business Profit
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Operating Expense Breakdown */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Operating Expense Category Breakdown
            </h3>
            <p className="text-xs text-slate-500">
              Distribution across Gas/Fuel, Red Taxi, Toll, Maintenance, and Other (excludes Driver Share).
            </p>
          </div>

          <div className="space-y-3 my-auto">
            {expenseCategories.map((cat) => (
              <div key={cat.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium">
                    {cat.label}
                  </span>
                  <span className="font-mono text-slate-900 font-semibold">
                    {formatINR(cat.amount)} ({cat.pct}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cat.color}`}
                    style={{ width: `${Math.min(100, cat.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Total Operating Expenses
            </span>
            <span className="font-mono font-bold text-amber-800">
              {formatINR(
                expenseCategories.reduce((s, c) => s + c.amount, 0)
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Vehicle Profitability Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Vehicle Profitability Matrix
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Vehicle</th>
                <th className="py-3 px-4 text-right">Shifts</th>
                <th className="py-3 px-4 text-right">Distance</th>
                <th className="py-3 px-4 text-right">Gross Earnings</th>
                <th className="py-3 px-4 text-right">Driver Share</th>
                <th className="py-3 px-4 text-right">Gas/Fuel</th>
                <th className="py-3 px-4 text-right">Red Taxi</th>
                <th className="py-3 px-4 text-right">Toll + Maint</th>
                <th className="py-3 px-4 text-right">Total Op Expenses</th>
                <th className="py-3 px-4 text-right">Net Business Earnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs font-mono">
              {vehicleBreakdown.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-10 text-center font-sans text-slate-500"
                  >
                    No vehicles available to compute profitability.
                  </td>
                </tr>
              ) : (
                vehicleBreakdown.map((row) => (
                  <tr key={row.vehicle.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-sans">
                      <div className="font-mono font-semibold text-slate-900">
                        {row.vehicle.registrationNumber}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.vehicle.make} {row.vehicle.model} ·{' '}
                        {row.vehicle.status}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {row.shifts}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {formatKm(row.km)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900">
                      {formatINR(row.earnings)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {formatINR(row.driverShare)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {formatINR(row.gasFuel)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {formatINR(row.redTaxi)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {formatINR(row.toll + row.maintenance)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-amber-800">
                      {formatINR(row.totalExpenses)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${
                        row.net >= 0 ? 'text-teal-700' : 'text-red-600'
                      }`}
                    >
                      {formatINR(row.net)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit History */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Financial &amp; Fleet Audit Trail
        </h3>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-slate-500">
            No audit events recorded in this session yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {auditLogs.slice(0, 20).map((log) => (
              <div
                key={log.id}
                className="py-2.5 flex items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-slate-800">
                    {log.action}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600 uppercase font-mono text-[11px]">
                    {log.entityType}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-800">{log.summary}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. PHASE 3: PREVENTIVE MAINTENANCE, SERVICE RECORDS & ODOMETER TRACKER
// ============================================================================
export const MaintenanceView: React.FC = () => {
  const {
    profile,
    vehicles,
    logbookEntries,
    serviceRecords,
    isDemoMode,
    saveServiceRecord,
    deleteServiceRecord,
    updateVehicleOdometer,
  } = useFleet();

  const serviceWarningKm = profile?.serviceWarningKm ?? 1000;

  const [vehicleFilter, setVehicleFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Service Record Add/Edit Modal
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ServiceRecord | null>(
    null
  );
  const [deleteConfirmRecord, setDeleteConfirmRecord] =
    useState<ServiceRecord | null>(null);
  const [savingService, setSavingService] = useState(false);
  const [serviceErrors, setServiceErrors] = useState<string[]>([]);

  // Validated Odometer Check-In Modal
  const [odometerModalVehicle, setOdometerModalVehicle] =
    useState<Vehicle | null>(null);
  const [newOdometerInput, setNewOdometerInput] = useState<number>(0);
  const [odometerReason, setOdometerReason] = useState<string>('');
  const [odometerError, setOdometerError] = useState<string | null>(null);
  const [savingOdometer, setSavingOdometer] = useState(false);

  const [formState, setFormState] = useState({
    vehicleId: '',
    serviceDate: getTodayKolkataDate(),
    serviceType: 'Preventive Service' as ServiceRecordType,
    odometerKm: 0,
    nextServiceOdometerKm: 10000,
    nextServiceDate: '',
    workshopName: '',
    invoiceReference: '',
    partsCost: 0,
    laborCost: 0,
    notes: '',
    status: 'Completed' as ServiceRecordStatus,
  });

  const filteredRecords = useMemo(() => {
    return serviceRecords.filter((rec) => {
      if (vehicleFilter !== 'ALL' && rec.vehicleId !== vehicleFilter)
        return false;
      if (typeFilter !== 'ALL' && rec.serviceType !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${rec.vehicleRegNo} ${rec.workshopName} ${rec.invoiceReference} ${rec.serviceType} ${rec.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [serviceRecords, vehicleFilter, typeFilter, searchQuery]);

  const totalServiceSpend = useMemo(
    () =>
      filteredRecords.reduce(
        (sum, r) => roundCurrency(sum + r.totalCost),
        0
      ),
    [filteredRecords]
  );

  const openAddServiceModal = (presetVehicle?: Vehicle) => {
    const activeVehicles = vehicles.filter((v) => v.status !== 'Archived');
    const targetVeh = presetVehicle || activeVehicles[0];
    const currentOdo = targetVeh?.currentOdometerKm || 0;
    const interval = targetVeh?.serviceIntervalKm || 10000;

    setEditingRecord(null);
    setFormState({
      vehicleId: targetVeh?.id || '',
      serviceDate: getTodayKolkataDate(),
      serviceType: 'Preventive Service',
      odometerKm: currentOdo,
      nextServiceOdometerKm: roundKm(currentOdo + interval),
      nextServiceDate: '',
      workshopName: '',
      invoiceReference: '',
      partsCost: 0,
      laborCost: 0,
      notes: '',
      status: 'Completed',
    });
    setServiceErrors([]);
    setServiceModalOpen(true);
  };

  const openEditServiceModal = (rec: ServiceRecord) => {
    setEditingRecord(rec);
    setFormState({
      vehicleId: rec.vehicleId,
      serviceDate: rec.serviceDate,
      serviceType: rec.serviceType,
      odometerKm: rec.odometerKm,
      nextServiceOdometerKm: rec.nextServiceOdometerKm,
      nextServiceDate: rec.nextServiceDate,
      workshopName: rec.workshopName,
      invoiceReference: rec.invoiceReference,
      partsCost: rec.partsCost,
      laborCost: rec.laborCost,
      notes: rec.notes,
      status: rec.status,
    });
    setServiceErrors([]);
    setServiceModalOpen(true);
  };

  const handleVehicleSelectInServiceModal = (vehId: string) => {
    const v = vehicles.find((item) => item.id === vehId);
    const odo = v?.currentOdometerKm || 0;
    const interval = v?.serviceIntervalKm || 10000;
    setFormState((prev) => ({
      ...prev,
      vehicleId: vehId,
      odometerKm: odo,
      nextServiceOdometerKm: roundKm(odo + interval),
    }));
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateServiceRecordInput(formState);
    if (!validation.valid) {
      setServiceErrors(validation.errors);
      return;
    }

    const selectedVeh = vehicles.find((v) => v.id === formState.vehicleId);
    setSavingService(true);
    setServiceErrors([]);
    try {
      await saveServiceRecord(
        {
          vehicleId: formState.vehicleId,
          vehicleRegNo: selectedVeh?.registrationNumber || 'UNKNOWN',
          serviceDate: formState.serviceDate,
          serviceType: formState.serviceType,
          odometerKm: formState.odometerKm,
          nextServiceOdometerKm: formState.nextServiceOdometerKm,
          nextServiceDate: formState.nextServiceDate,
          workshopName: formState.workshopName,
          invoiceReference: formState.invoiceReference,
          partsCost: formState.partsCost,
          laborCost: formState.laborCost,
          notes: formState.notes,
          status: formState.status,
        },
        editingRecord?.id
      );
      setServiceModalOpen(false);
    } catch (err: any) {
      setServiceErrors([err?.message || 'Failed to save service record.']);
    } finally {
      setSavingService(false);
    }
  };

  const openOdometerCheckIn = (veh: Vehicle) => {
    setOdometerModalVehicle(veh);
    setNewOdometerInput(veh.currentOdometerKm);
    setOdometerReason('Inspection Odometer Verification');
    setOdometerError(null);
  };

  const handleSaveOdometerCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!odometerModalVehicle) return;
    setSavingOdometer(true);
    setOdometerError(null);
    try {
      await updateVehicleOdometer(
        odometerModalVehicle,
        newOdometerInput,
        odometerReason
      );
      setOdometerModalVehicle(null);
    } catch (err: any) {
      setOdometerError(err?.message || 'Failed to update odometer.');
    } finally {
      setSavingOdometer(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Preventive Maintenance, Odometer Tracking &amp; Workshop Ledger
          </h2>
          <p className="text-sm text-slate-500">
            Monitors validated odometer readings against scheduled intervals (Alert buffer: {formatKm(serviceWarningKm)}) and records workshop invoices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={filteredRecords.length === 0}
            onClick={() =>
              generateServiceMaintenancePdf({
                businessName:
                  profile?.businessName || 'FzeeLog Fleet Operations',
                serviceRecords: filteredRecords,
                isDemoMode,
              })
            }
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Export Service PDF
          </button>
          <button
            type="button"
            onClick={() => openAddServiceModal()}
            disabled={
              vehicles.filter((v) => v.status !== 'Archived').length === 0
            }
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Log Workshop Service
          </button>
        </div>
      </div>

      {/* Vehicle Odometer & Service Reminder Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vehicles.map((v) => {
          const remainingKm = roundKm(
            v.nextServiceOdometerKm - v.currentOdometerKm
          );
          const progressPct = Math.min(
            100,
            Math.max(
              0,
              ((v.currentOdometerKm - v.lastServiceOdometerKm) /
                Math.max(1, v.serviceIntervalKm)) *
                100
            )
          );
          const isDueSoon = remainingKm <= serviceWarningKm;
          const vehServiceRecords = serviceRecords.filter(
            (r) => r.vehicleId === v.id
          );
          const maintLogs = logbookEntries.filter(
            (e) => e.vehicleId === v.id && e.maintenance > 0
          );
          const totalMaintSpend = roundCurrency(
            maintLogs.reduce((s, e) => s + e.maintenance, 0) +
              vehServiceRecords.reduce((s, r) => s + r.totalCost, 0)
          );

          return (
            <div
              key={v.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-mono font-bold text-base text-slate-900">
                      {v.registrationNumber}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {v.make} {v.model} · Interval:{' '}
                      {formatKm(v.serviceIntervalKm)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold ${
                      remainingKm <= 0
                        ? 'text-red-600'
                        : isDueSoon
                        ? 'text-amber-700'
                        : 'text-teal-700'
                    }`}
                  >
                    {remainingKm <= 0
                      ? 'OVERDUE'
                      : isDueSoon
                      ? 'DUE SOON'
                      : 'HEALTHY'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">
                      Current Validated Odometer
                    </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatKm(v.currentOdometerKm)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Last Service</span>
                    <span className="font-mono text-slate-600">
                      {formatKm(v.lastServiceOdometerKm)} (
                      {v.lastServiceDate || '—'})
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Next Service Target</span>
                    <span className="font-mono text-slate-700">
                      {formatKm(v.nextServiceOdometerKm)} (
                      {v.nextServiceDate || 'TBD'})
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        remainingKm <= 0
                          ? 'bg-red-600'
                          : isDueSoon
                          ? 'bg-amber-500'
                          : 'bg-teal-600'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p
                    className={`text-xs font-mono ${
                      remainingKm <= 0
                        ? 'text-red-600 font-semibold'
                        : isDueSoon
                        ? 'text-amber-700 font-semibold'
                        : 'text-slate-600'
                    }`}
                  >
                    {remainingKm > 0
                      ? `${formatKm(remainingKm)} remaining until service`
                      : `Service overdue by ${formatKm(Math.abs(remainingKm))}`}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">
                    Cumulative Maint. ({vehServiceRecords.length} workshop +{' '}
                    {maintLogs.length} shift)
                  </span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatINR(totalMaintSpend)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openOdometerCheckIn(v)}
                    className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Gauge className="w-3.5 h-3.5 text-slate-600" />
                    Update Odometer
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddServiceModal(v)}
                    className="flex-1 px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Wrench className="w-3.5 h-3.5 text-teal-700" />
                    Record Service
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Workshop Service History Register */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Workshop Service &amp; Preventive Maintenance History (
              {filteredRecords.length} Records · Total:{' '}
              <span className="font-mono">{formatINR(totalServiceSpend)}</span>)
            </h3>
            <p className="text-xs text-slate-500">
              Logging a Completed service automatically updates the vehicle's Last Service, Next Service Target, and Current Odometer.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search workshop, invoice, notes..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Service Types</option>
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Service Date</th>
                <th className="py-3 px-4">Vehicle</th>
                <th className="py-3 px-4">Category &amp; Status</th>
                <th className="py-3 px-4 text-right">Service Odometer</th>
                <th className="py-3 px-4 text-right">Next Target KM</th>
                <th className="py-3 px-4">Workshop &amp; Invoice Ref</th>
                <th className="py-3 px-4 text-right">Parts + Labor</th>
                <th className="py-3 px-4 text-right">Total Cost</th>
                <th className="py-3 px-4">Work Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-10 text-center text-slate-500"
                  >
                    No workshop service records match the current filter. Click "Log Workshop Service" above to add a record.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {rec.serviceDate}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {rec.vehicleRegNo}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        {rec.serviceType}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          rec.status === 'Completed'
                            ? 'text-emerald-700'
                            : rec.status === 'In Workshop'
                            ? 'text-amber-700'
                            : 'text-sky-700'
                        }`}
                      >
                        {rec.status}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-800 whitespace-nowrap">
                      {formatKm(rec.odometerKm)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 whitespace-nowrap">
                      <div>{formatKm(rec.nextServiceOdometerKm)}</div>
                      {rec.nextServiceDate && (
                        <div className="text-[10px] text-slate-400">
                          Due: {rec.nextServiceDate}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        {rec.workshopName}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        Ref: {rec.invoiceReference || 'N/A'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 whitespace-nowrap">
                      {formatINR(rec.partsCost)} + {formatINR(rec.laborCost)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      {formatINR(rec.totalCost)}
                    </td>
                    <td
                      className="py-3 px-4 text-slate-600 max-w-[220px] truncate"
                      title={rec.notes}
                    >
                      {rec.notes || '—'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditServiceModal(rec)}
                          className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                          title="Edit Service Record"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmRecord(rec)}
                          className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete Service Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Workshop Service Modal */}
      {serviceModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingRecord
                  ? 'Edit Workshop Service Record'
                  : 'Log Workshop Service & Update Odometer Schedule'}
              </h3>
              <button
                type="button"
                onClick={() => setServiceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {serviceErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
                {serviceErrors.map((err, i) => (
                  <p key={i}>• {err}</p>
                ))}
              </div>
            )}

            <form onSubmit={handleSaveService} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vehicle *
                  </label>
                  <select
                    required
                    value={formState.vehicleId}
                    onChange={(e) =>
                      handleVehicleSelectInServiceModal(e.target.value)
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {vehicles
                      .filter((v) => v.status !== 'Archived')
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.registrationNumber} ({v.model})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Service Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.serviceDate}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        serviceDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Service Category *
                  </label>
                  <select
                    value={formState.serviceType}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        serviceType: e.target.value as ServiceRecordType,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {SERVICE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Odometer at Service (km) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    required
                    value={formState.odometerKm}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const veh = vehicles.find(
                        (v) => v.id === formState.vehicleId
                      );
                      const interval = veh?.serviceIntervalKm || 10000;
                      setFormState({
                        ...formState,
                        odometerKm: val,
                        nextServiceOdometerKm: roundKm(val + interval),
                      });
                    }}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Next Service Target (km) *
                  </label>
                  <input
                    type="number"
                    min={formState.odometerKm}
                    step="0.1"
                    required
                    value={formState.nextServiceOdometerKm}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        nextServiceOdometerKm: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Next Service Due Date
                  </label>
                  <input
                    type="date"
                    value={formState.nextServiceDate}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        nextServiceDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Authorized Workshop / Service Center Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., ABT Maruti Commercial Workshop — Coimbatore"
                    value={formState.workshopName}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        workshopName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Job Card / Invoice #
                  </label>
                  <input
                    type="text"
                    placeholder="INV-2026-4410"
                    value={formState.invoiceReference}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        invoiceReference: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Spare Parts Cost (INR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.partsCost}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        partsCost: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Workshop Labor Cost (INR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.laborCost}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        laborCost: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Service Status
                  </label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        status: e.target.value as ServiceRecordStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {['Completed', 'Scheduled', 'In Workshop'].map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Replaced Parts &amp; Mechanic Remarks
                </label>
                <input
                  type="text"
                  maxLength={500}
                  placeholder="Synthetic oil, oil filter, CNG cartridge filter, brake pad inspection..."
                  value={formState.notes}
                  onChange={(e) =>
                    setFormState({ ...formState, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  Calculated Total Workshop Invoice (Parts + Labor):
                </span>
                <span className="font-mono font-bold text-sm text-teal-800">
                  {formatINR(
                    roundCurrency(
                      (Number(formState.partsCost) || 0) +
                        (Number(formState.laborCost) || 0)
                    )
                  )}
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setServiceModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingService}
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                >
                  {savingService ? 'Saving...' : 'Save Service Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Validated Odometer Check-In Modal */}
      {odometerModalVehicle && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Validated Odometer Check-In ·{' '}
                {odometerModalVehicle.registrationNumber}
              </h3>
              <button
                type="button"
                onClick={() => setOdometerModalVehicle(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {odometerError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {odometerError}
              </div>
            )}

            <form onSubmit={handleSaveOdometerCheckIn} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between text-xs">
                <span className="text-slate-500">
                  Current Validated Odometer:
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatKm(odometerModalVehicle.currentOdometerKm)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  New Verified Odometer Reading (km) *
                </label>
                <input
                  type="number"
                  min={odometerModalVehicle.currentOdometerKm}
                  step="0.1"
                  required
                  value={newOdometerInput}
                  onChange={(e) => setNewOdometerInput(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Must be greater than or equal to current odometer ({formatKm(odometerModalVehicle.currentOdometerKm)}).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Verification Note
                </label>
                <input
                  type="text"
                  value={odometerReason}
                  onChange={(e) => setOdometerReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOdometerModalVehicle(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOdometer}
                  className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                >
                  {savingOdometer ? 'Updating...' : 'Verify & Update Odometer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Service Record Confirmation Modal */}
      {deleteConfirmRecord && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Delete Service Record for {deleteConfirmRecord.vehicleRegNo}?
            </h3>
            <p className="text-sm text-slate-600">
              This will permanently remove the {deleteConfirmRecord.serviceType}{' '}
              invoice from {deleteConfirmRecord.serviceDate} (
              {formatINR(deleteConfirmRecord.totalCost)}).
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmRecord(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteServiceRecord(deleteConfirmRecord);
                  setDeleteConfirmRecord(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 4. PHASE 3: STATUTORY DOCUMENTS, EXPIRY ALERTS & DOCUMENT UPLOAD HISTORY
// ============================================================================
export const DocumentsExpiryView: React.FC = () => {
  const {
    profile,
    vehicles,
    drivers,
    complianceDocuments,
    saveComplianceDocument,
    deleteComplianceDocument,
    saveNotificationLog,
  } = useFleet();

  const expiryWarnDays = profile?.expiryWarningDays ?? 30;
  const alertEmail = profile?.alertEmail || 'not configured';
  const alertWhatsapp = profile?.whatsappNumber || 'not set';

  const [docStatusFilter, setDocStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [milestoneFilter, setMilestoneFilter] = useState<
    'ALL' | '10D' | '5D' | '1D'
  >('ALL');
  const [dispatchingChannel, setDispatchingChannel] = useState<
    'Email' | 'WhatsApp' | null
  >(null);
  const [dispatchBanner, setDispatchBanner] = useState<{
    message: string;
    whatsappUrl?: string;
    mailtoUrl?: string;
  } | null>(null);

  const milestoneItems = useMemo(
    () => evaluateMilestoneExpiryAlerts(vehicles, drivers),
    [vehicles, drivers]
  );

  const filteredMilestones = useMemo(() => {
    return milestoneItems.filter((item) => {
      if (milestoneFilter === '10D') return item.daysRemaining <= 10;
      if (milestoneFilter === '5D') return item.daysRemaining <= 5;
      if (milestoneFilter === '1D') return item.daysRemaining <= 1;
      return true;
    });
  }, [milestoneItems, milestoneFilter]);

  const handleTriggerExpiryAlert = async (channel: 'Email' | 'WhatsApp') => {
    setDispatchingChannel(channel);
    try {
      if (channel === 'Email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alertEmail)) {
        setDispatchBanner({
          message:
            'Set a valid Alert E-Mail in Settings before dispatching email alerts.',
        });
        return;
      }
      if (channel === 'WhatsApp' && !alertWhatsapp.replace(/\D/g, '')) {
        setDispatchBanner({
          message:
            'Set a WhatsApp number in Settings before dispatching WhatsApp alerts.',
        });
        return;
      }
      const itemsPayload = filteredMilestones.slice(0, 10).map((m) => ({
        entityLabel: m.targetLabel,
        documentLabel: m.documentLabel,
        expiryDate: m.expiryDate,
        daysRemaining: m.daysRemaining,
        milestoneWindow: m.milestoneBucket,
      }));

      const res = await fetch('/api/notifications/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          recipientEmail: alertEmail,
          whatsappNumber: alertWhatsapp,
          businessName: profile?.businessName || 'FzeeLog Fleet Operations',
          accountMode: profile?.accountMode || 'Organization',
          milestoneDays: profile?.alertMilestonesDays || [10, 5, 1],
          expiringItems: itemsPayload,
        }),
      });
      const data = await res.json();
      const preview =
        data?.dispatchReceipt?.messagePreview ||
        `Statutory 10d/5d/1d Expiry Alert (${itemsPayload.length} item(s)) dispatched to ${alertEmail} / +91 ${alertWhatsapp}.`;

      await saveNotificationLog({
        alertType: 'StatutoryExpiry',
        severity: 'WARNING',
        targetLabel:
          channel === 'Email'
            ? `Email Alert -> ${alertEmail}`
            : `WhatsApp Alert -> +91 ${alertWhatsapp}`,
        title: `Statutory Expiry ${channel} Alert Dispatched (${
          channel === 'Email' ? alertEmail : alertWhatsapp
        })`,
        message: preview.slice(0, 900),
        channel: channel === 'Email' ? 'EmailDigest' : 'WhatsApp',
        recipientEmail: alertEmail,
        status: 'Unread',
      });

      setDispatchBanner({
        message:
          channel === 'Email'
            ? `Dispatched 10d/5d/1d Statutory Expiry Email to ${alertEmail} (${itemsPayload.length} monitored certificate(s)).`
            : `Dispatched 10d/5d/1d Statutory Expiry WhatsApp alert to +91 ${alertWhatsapp} (${itemsPayload.length} monitored certificate(s)).`,
        whatsappUrl: data?.dispatchReceipt?.whatsappDeepLink,
        mailtoUrl: data?.dispatchReceipt?.mailtoLink,
      });
    } catch {
      // Fallback
    } finally {
      setDispatchingChannel(null);
    }
  };

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ComplianceDocument | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] =
    useState<ComplianceDocument | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [docErrors, setDocErrors] = useState<string[]>([]);

  const [formState, setFormState] = useState({
    entityType: 'vehicle' as 'vehicle' | 'driver',
    entityId: '',
    documentCategory: 'Insurance Policy' as ComplianceDocumentCategory,
    documentNumber: '',
    issuingAuthority: '',
    issueDate: getTodayKolkataDate(),
    expiryDate: '',
    renewalCost: 0,
    fileName: '',
    fileMimeType: '',
    fileSizeBytes: 0,
    verificationDigest: '',
    notes: '',
    status: 'Active' as ComplianceDocumentStatus,
  });

  const renderDaysStatus = (dateStr: string) => {
    const days = getDaysUntilExpiry(dateStr);
    if (days === null) return <span className="text-slate-400">Not set</span>;
    if (days < 0) {
      return (
        <span className="text-red-600 font-semibold font-mono">
          Expired ({Math.abs(days)}d ago)
        </span>
      );
    }
    if (days <= 1) {
      return (
        <span className="text-red-600 font-bold font-mono">
          1-Day Alert · Due in {days}d ({dateStr})
        </span>
      );
    }
    if (days <= 5) {
      return (
        <span className="text-red-600 font-semibold font-mono">
          5-Day Alert · Due in {days}d ({dateStr})
        </span>
      );
    }
    if (days <= 10) {
      return (
        <span className="text-amber-700 font-semibold font-mono">
          10-Day Alert · Due in {days}d ({dateStr})
        </span>
      );
    }
    if (days <= expiryWarnDays) {
      return (
        <span className="text-amber-700 font-semibold font-mono">
          Due in {days}d ({dateStr})
        </span>
      );
    }
    return (
      <span className="text-emerald-700 font-mono">
        Valid · {days}d ({dateStr})
      </span>
    );
  };

  const filteredDocs = useMemo(() => {
    return complianceDocuments.filter((docItem) => {
      if (docStatusFilter !== 'ALL' && docItem.status !== docStatusFilter)
        return false;
      if (
        categoryFilter !== 'ALL' &&
        docItem.documentCategory !== categoryFilter
      )
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${docItem.entityLabel} ${docItem.documentCategory} ${docItem.documentNumber} ${docItem.issuingAuthority} ${docItem.fileName} ${docItem.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [complianceDocuments, docStatusFilter, categoryFilter, searchQuery]);

  const openUploadModal = () => {
    const firstVeh = vehicles[0];
    setEditingDoc(null);
    setFormState({
      entityType: 'vehicle',
      entityId: firstVeh?.id || '',
      documentCategory: 'Insurance Policy',
      documentNumber: '',
      issuingAuthority: '',
      issueDate: getTodayKolkataDate(),
      expiryDate: '',
      renewalCost: 0,
      fileName: '',
      fileMimeType: '',
      fileSizeBytes: 0,
      verificationDigest: '',
      notes: '',
      status: 'Active',
    });
    setDocErrors([]);
    setUploadModalOpen(true);
  };

  const openEditDocModal = (docItem: ComplianceDocument) => {
    setEditingDoc(docItem);
    setFormState({
      entityType: docItem.entityType,
      entityId: docItem.entityId,
      documentCategory: docItem.documentCategory,
      documentNumber: docItem.documentNumber,
      issuingAuthority: docItem.issuingAuthority,
      issueDate: docItem.issueDate,
      expiryDate: docItem.expiryDate,
      renewalCost: docItem.renewalCost,
      fileName: docItem.fileName,
      fileMimeType: docItem.fileMimeType,
      fileSizeBytes: docItem.fileSizeBytes,
      verificationDigest: docItem.verificationDigest,
      notes: docItem.notes,
      status: docItem.status,
    });
    setDocErrors([]);
    setUploadModalOpen(true);
  };

  const handleFileAttachment = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const digest = await computeFileDigest(file);
    setFormState((prev) => ({
      ...prev,
      fileName: file.name.slice(0, 160),
      fileMimeType: (file.type || 'application/octet-stream').slice(0, 64),
      fileSizeBytes: file.size,
      verificationDigest: digest,
    }));
  };

  const handleSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateComplianceDocumentInput(formState);
    if (!validation.valid) {
      setDocErrors(validation.errors);
      return;
    }

    const entityLabel =
      formState.entityType === 'vehicle'
        ? vehicles.find((v) => v.id === formState.entityId)
            ?.registrationNumber || 'Vehicle'
        : drivers.find((d) => d.id === formState.entityId)?.fullName ||
          'Driver';

    setSavingDoc(true);
    setDocErrors([]);
    try {
      await saveComplianceDocument(
        {
          ...formState,
          entityLabel,
        },
        editingDoc?.id
      );
      setUploadModalOpen(false);
    } catch (err: any) {
      setDocErrors([err?.message || 'Failed to save compliance document.']);
    } finally {
      setSavingDoc(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Statutory Documents, 10d/5d/1d Expiry Alerts &amp; Upload Vault
          </h2>
          <p className="text-sm text-slate-500">
            Track Insurance, Fitness Certificate (FC), Permit, Driver Licence (DL), and Pollution (PUC) expiries with automated 10-day, 5-day, and 1-day Email ({alertEmail}) &amp; WhatsApp (+91 {alertWhatsapp}) alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={dispatchingChannel !== null}
            onClick={() => handleTriggerExpiryAlert('Email')}
            className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Mail className="w-3.5 h-3.5 text-teal-400" />
            {dispatchingChannel === 'Email'
              ? 'Sending...'
              : `Send Expiry Mail (${alertEmail})`}
          </button>
          <button
            type="button"
            disabled={dispatchingChannel !== null}
            onClick={() => handleTriggerExpiryAlert('WhatsApp')}
            className="px-3 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {dispatchingChannel === 'WhatsApp'
              ? 'Sending...'
              : `Send WhatsApp (${alertWhatsapp})`}
          </button>
          <button
            type="button"
            onClick={openUploadModal}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload / Record Certificate Renewal
          </button>
        </div>
      </div>

      {dispatchBanner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-emerald-950">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{dispatchBanner.message}</p>
              <p className="text-emerald-800 mt-0.5">
                Logged to Notification History with 10-day, 5-day, and 1-day statutory countdown verification.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {dispatchBanner.mailtoUrl && (
              <a
                href={dispatchBanner.mailtoUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 rounded-lg hover:bg-emerald-100 flex items-center gap-1"
              >
                <Mail className="w-3.5 h-3.5" />
                Open Mail Client
              </a>
            )}
            {dispatchBanner.whatsappUrl && (
              <a
                href={dispatchBanner.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                Open WhatsApp (+91 {alertWhatsapp})
              </a>
            )}
            <button
              type="button"
              onClick={() => setDispatchBanner(null)}
              className="px-2 py-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 10-Day / 5-Day / 1-Day Advance Expiry Milestone Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-900">
            Automated Statutory Alert Schedule:
          </span>{' '}
          Triggers before <strong>10 Days</strong>, <strong>5 Days</strong>, and{' '}
          <strong>1 Day</strong> for Insurance, FC, Permit, Driver Licence &amp; Pollution (PUC).
        </div>
        <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 self-start sm:self-auto">
          {(
            [
              ['ALL', `All Tracked (${milestoneItems.length})`],
              [
                '10D',
                `≤ 10 Days (${
                  milestoneItems.filter((m) => m.daysRemaining <= 10).length
                })`,
              ],
              [
                '5D',
                `≤ 5 Days (${
                  milestoneItems.filter((m) => m.daysRemaining <= 5).length
                })`,
              ],
              [
                '1D',
                `≤ 1 Day / Expired (${
                  milestoneItems.filter((m) => m.daysRemaining <= 1).length
                })`,
              ],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => setMilestoneFilter(code)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                milestoneFilter === code
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Vehicle Statutory Expiry Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Fleet Vehicle Statutory Expiry Matrix (Auto-Synced from Active Certificates)
          </h3>
          <span className="text-xs font-mono text-slate-500">
            Warning window: ≤ {expiryWarnDays} days
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Vehicle Reg</th>
                <th className="py-3 px-4">Insurance Expiry</th>
                <th className="py-3 px-4">Fitness Certificate (FC)</th>
                <th className="py-3 px-4">Commercial Permit</th>
                <th className="py-3 px-4">Pollution (PUC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {vehicles.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-slate-900">
                      {v.registrationNumber}
                    </div>
                    <div className="text-slate-500">
                      {v.make} {v.model}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div>{v.insuranceProvider || 'Provider N/A'}</div>
                    <div>{renderDaysStatus(v.insuranceExpiry)}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-mono">{v.fcNumber || 'FC N/A'}</div>
                    <div>{renderDaysStatus(v.fcExpiry)}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div>{v.permitType || 'Permit'}</div>
                    <div>{renderDaysStatus(v.permitExpiry)}</div>
                  </td>
                  <td className="py-3 px-4">
                    {renderDaysStatus(v.pollutionExpiry)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Driver License Compliance Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Driver License (DL) Compliance Status
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {drivers.map((d) => (
            <div
              key={d.id}
              className="border border-slate-200 rounded-lg p-3 flex items-center justify-between text-xs"
            >
              <div>
                <p className="font-semibold text-slate-900">{d.fullName}</p>
                <p className="font-mono text-slate-500">
                  {d.licenseNumber || 'No DL #'}
                </p>
              </div>
              <div className="text-right">
                {renderDaysStatus(d.licenseExpiry)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Document Upload & Renewal History Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Uploaded Certificates &amp; Historical Renewal Archive (
              {filteredDocs.length})
            </h3>
            <p className="text-xs text-slate-500">
              Uploading a new Active certificate automatically updates the Vehicle/Driver expiry and marks previous certificates as Superseded.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search policy #, authority, file..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Document Categories</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={docStatusFilter}
              onChange={(e) => setDocStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">Active &amp; Renewal History</option>
              <option value="Active">Active Only</option>
              <option value="Superseded">Superseded History</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Document / Policy #</th>
                <th className="py-3 px-4">Issuing Authority</th>
                <th className="py-3 px-4">Issue → Expiry</th>
                <th className="py-3 px-4 text-right">Renewal Fee</th>
                <th className="py-3 px-4">Attached File &amp; Digest</th>
                <th className="py-3 px-4">Lifecycle</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-10 text-center text-slate-500"
                  >
                    No uploaded compliance documents found for this filter.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((docItem) => (
                  <tr key={docItem.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900">
                        {docItem.entityLabel}
                      </div>
                      <div className="text-[11px] uppercase font-mono text-slate-400">
                        {docItem.entityType}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {docItem.documentCategory}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                      {docItem.documentNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {docItem.issuingAuthority || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-500 text-[11px]">
                        Issued: {docItem.issueDate || '—'}
                      </div>
                      <div>{renderDaysStatus(docItem.expiryDate)}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900">
                      {formatINR(docItem.renewalCost)}
                    </td>
                    <td className="py-3 px-4">
                      {docItem.fileName ? (
                        <div>
                          <div className="font-mono text-teal-800 font-medium truncate max-w-[180px]">
                            <FileCheck className="w-3.5 h-3.5 inline mr-1 text-teal-600" />
                            {docItem.fileName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {(docItem.fileSizeBytes / 1024).toFixed(1)} KB ·{' '}
                            {docItem.verificationDigest}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Metadata only</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      <span
                        className={
                          docItem.status === 'Active'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }
                      >
                        {docItem.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDocModal(docItem)}
                          className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                          title="Edit Certificate"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmDoc(docItem)}
                          className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete Certificate"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload / Edit Compliance Document Modal */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingDoc
                  ? 'Edit Compliance Certificate'
                  : 'Upload Statutory Certificate & Sync Expiry Date'}
              </h3>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {docErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
                {docErrors.map((err, i) => (
                  <p key={i}>• {err}</p>
                ))}
              </div>
            )}

            <form onSubmit={handleSaveDoc} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Applies To *
                  </label>
                  <select
                    value={formState.entityType}
                    onChange={(e) => {
                      const nextType = e.target.value as 'vehicle' | 'driver';
                      const defaultId =
                        nextType === 'vehicle'
                          ? vehicles[0]?.id || ''
                          : drivers[0]?.id || '';
                      setFormState({
                        ...formState,
                        entityType: nextType,
                        entityId: defaultId,
                        documentCategory:
                          nextType === 'driver'
                            ? 'Driver License (DL)'
                            : 'Insurance Policy',
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="vehicle">Fleet Vehicle</option>
                    <option value="driver">Driver</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Select {formState.entityType === 'vehicle' ? 'Vehicle' : 'Driver'} *
                  </label>
                  <select
                    required
                    value={formState.entityId}
                    onChange={(e) =>
                      setFormState({ ...formState, entityId: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {formState.entityType === 'vehicle'
                      ? vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.registrationNumber} ({v.model})
                          </option>
                        ))
                      : drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.fullName}
                          </option>
                        ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Document Category *
                  </label>
                  <select
                    value={formState.documentCategory}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        documentCategory: e.target
                          .value as ComplianceDocumentCategory,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Certificate / Policy / Permit Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., NIA-PCV-2026-884120"
                    value={formState.documentNumber}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        documentNumber: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Issuing Authority / Insurer
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., New India Assurance / RTO Coimbatore"
                    value={formState.issuingAuthority}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        issuingAuthority: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={formState.issueDate}
                    onChange={(e) =>
                      setFormState({ ...formState, issueDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.expiryDate}
                    onChange={(e) =>
                      setFormState({ ...formState, expiryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Renewal Cost (INR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.renewalCost}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        renewalCost: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Lifecycle Status
                  </label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        status: e.target.value as ComplianceDocumentStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {['Active', 'Superseded', 'Archived'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      Attach Scanned Certificate (PDF / Image up to 5 MB)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Computes a SHA-256 verification digest and stores file metadata in the compliance vault.
                    </p>
                  </div>
                  <label className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Choose Certificate File
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleFileAttachment}
                      className="hidden"
                    />
                  </label>
                </div>

                {formState.fileName && (
                  <div className="text-xs font-mono text-teal-900 bg-white border border-slate-200 rounded px-3 py-1.5 flex items-center justify-between">
                    <span>
                      {formState.fileName} (
                      {(formState.fileSizeBytes / 1024).toFixed(1)} KB)
                    </span>
                    <span className="text-slate-500">
                      {formState.verificationDigest}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Compliance &amp; Endorsement Notes
                </label>
                <input
                  type="text"
                  maxLength={500}
                  placeholder="Policy coverage details, RTO inspection track remarks..."
                  value={formState.notes}
                  onChange={(e) =>
                    setFormState({ ...formState, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDoc}
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                >
                  {savingDoc ? 'Saving...' : 'Save & Sync Expiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Compliance Doc Confirmation Modal */}
      {deleteConfirmDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Delete {deleteConfirmDoc.documentCategory} (
              {deleteConfirmDoc.documentNumber})?
            </h3>
            <p className="text-sm text-slate-600">
              This removes the certificate record for{' '}
              {deleteConfirmDoc.entityLabel} from the document vault.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmDoc(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteComplianceDocument(deleteConfirmDoc);
                  setDeleteConfirmDoc(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete Certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 5. PHASE 4: 3D VEHICLE VIEWER & 360° PHOTO SEQUENCE INSPECTOR
// ============================================================================
export const Vehicle3DInspectorView: React.FC = () => {
  const { vehicles } = useFleet();
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    vehicles[0]?.id || ''
  );

  useEffect(() => {
    if (!selectedVehicleId && vehicles.length > 0) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [vehicles, selectedVehicleId]);

  const selectedVehicle =
    vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];

  if (!selectedVehicle) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
        <h2 className="text-lg font-bold text-slate-900">
          3D Vehicle Viewer &amp; 360° Photo Sequence Inspector
        </h2>
        <p className="text-sm text-slate-500">
          Add at least one vehicle in the Vehicles module to launch the interactive Three.js 3D viewer and multi-angle photo calibration studio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Interactive 3D Vehicle Studio &amp; 360° Photo Sequence Inspector
          </h2>
          <p className="text-xs text-slate-500">
            Select any fleet vehicle below to inspect its Three.js WebGL 3D model, upload multi-angle reference photographs, or run AI multi-angle 3D proportion &amp; finish calibration.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
            Active Vehicle:
          </label>
          <select
            value={selectedVehicle.id}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className="px-3 py-2 text-xs font-mono font-semibold border border-slate-300 rounded-lg bg-slate-50 text-slate-900"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.registrationNumber} — {v.make} {v.model} ({v.vehicleType})
              </option>
            ))}
          </select>
        </div>
      </div>

      <Suspense fallback={<Vehicle3DFallback />}>
        <Vehicle3DViewer vehicle={selectedVehicle} />
      </Suspense>
    </div>
  );
};

// ============================================================================
// 6. PHASE 5: DOWNLOADABLE PDF REPORTS, NOTIFICATIONS, BACKUP & SETTINGS
// ============================================================================
export const ReportsView: React.FC = () => {
  const {
    profile,
    vehicles,
    drivers,
    logbookEntries,
    serviceRecords,
    complianceDocuments,
    isDemoMode,
    saveNotificationLog,
  } = useFleet();

  const [selectedVehicleId, setSelectedVehicleId] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [previewTab, setPreviewTab] = useState<
    'vehicle-pnl' | 'driver-settlements' | 'logbook-15col'
  >('vehicle-pnl');
  const [lastDownloadedReport, setLastDownloadedReport] = useState<
    string | null
  >(null);

  const businessName = profile?.businessName || 'FzeeLog Fleet Operations';
  const recipientEmail =
    profile?.intendedGoogleDriveEmail ||
    profile?.intendedDriveEmail ||
    '';

  const filteredLogs = useMemo(() => {
    return logbookEntries.filter((e) => {
      const dateStr = e.date || e.entryDate || '';
      if (selectedVehicleId !== 'ALL' && e.vehicleId !== selectedVehicleId) {
        return false;
      }
      if (monthFilter && !dateStr.startsWith(monthFilter)) {
        return false;
      }
      if (startDateFilter && dateStr < startDateFilter) {
        return false;
      }
      if (endDateFilter && dateStr > endDateFilter) {
        return false;
      }
      return true;
    });
  }, [
    logbookEntries,
    selectedVehicleId,
    monthFilter,
    startDateFilter,
    endDateFilter,
  ]);

  const filteredServiceRecords = useMemo(() => {
    return serviceRecords.filter((s) => {
      if (selectedVehicleId !== 'ALL' && s.vehicleId !== selectedVehicleId) {
        return false;
      }
      if (monthFilter && !s.serviceDate.startsWith(monthFilter)) {
        return false;
      }
      if (startDateFilter && s.serviceDate < startDateFilter) {
        return false;
      }
      if (endDateFilter && s.serviceDate > endDateFilter) {
        return false;
      }
      return true;
    });
  }, [
    serviceRecords,
    selectedVehicleId,
    monthFilter,
    startDateFilter,
    endDateFilter,
  ]);

  const scopedVehicles = useMemo(() => {
    if (selectedVehicleId === 'ALL') return vehicles;
    return vehicles.filter((v) => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  const vehiclePnLRows = useMemo(
    () =>
      aggregateVehicleProfitAndLoss(
        scopedVehicles,
        filteredLogs,
        filteredServiceRecords
      ),
    [scopedVehicles, filteredLogs, filteredServiceRecords]
  );

  const driverSettlements = useMemo(
    () => aggregateDriverSettlements(drivers, filteredLogs),
    [drivers, filteredLogs]
  );

  const activeAlerts = useMemo(
    () =>
      evaluateFleetComplianceAlerts(
        vehicles,
        drivers,
        profile?.expiryAlertDays ?? profile?.expiryWarningDays ?? 30,
        profile?.serviceWarningKm ?? 1000
      ),
    [vehicles, drivers, profile]
  );

  const scopeMetrics = useMemo(() => {
    const totalKm = roundKm(filteredLogs.reduce((s, e) => s + e.kmDay, 0));
    const grossEarnings = roundCurrency(
      filteredLogs.reduce((s, e) => s + e.earnings, 0)
    );
    const driverShare = roundCurrency(
      filteredLogs.reduce((s, e) => s + e.driverShare, 0)
    );
    const logbookOpEx = roundCurrency(
      filteredLogs.reduce((s, e) => s + e.totalExpenses, 0)
    );
    const workshopCost = roundCurrency(
      filteredServiceRecords.reduce((s, r) => s + r.totalCost, 0)
    );
    const netLogbookProfit = roundCurrency(
      filteredLogs.reduce((s, e) => s + e.netBusinessEarnings, 0)
    );
    const netAfterWorkshop = roundCurrency(netLogbookProfit - workshopCost);
    return {
      totalKm,
      grossEarnings,
      driverShare,
      logbookOpEx,
      workshopCost,
      netLogbookProfit,
      netAfterWorkshop,
    };
  }, [filteredLogs, filteredServiceRecords]);

  const dateRangeLabel = useMemo(() => {
    if (monthFilter) return `Month: ${monthFilter}`;
    if (startDateFilter || endDateFilter) {
      return `${startDateFilter || 'Start'} to ${endDateFilter || 'Present'}`;
    }
    return 'All Recorded Dates';
  }, [monthFilter, startDateFilter, endDateFilter]);

  const vehicleScopeLabel = useMemo(() => {
    if (selectedVehicleId === 'ALL') return 'All Fleet Vehicles';
    return (
      vehicles.find((v) => v.id === selectedVehicleId)?.registrationNumber ||
      'Selected Vehicle'
    );
  }, [vehicles, selectedVehicleId]);

  const logReportExportAudit = async (reportTitle: string, detail: string) => {
    setLastDownloadedReport(reportTitle);
    setTimeout(() => setLastDownloadedReport(null), 4000);
    try {
      await saveNotificationLog({
        alertType: 'ReportExport',
        severity: 'INFO',
        targetLabel: vehicleScopeLabel,
        title: `Exported ${reportTitle}`,
        message: `${detail} · Scope: ${vehicleScopeLabel} (${dateRangeLabel}).`,
        recipientEmail,
        channel: 'PDFReport',
        status: 'Dispatched',
      });
    } catch {
      // Non-blocking audit log
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Executive Financial, Compliance &amp; Maintenance Reporting Suite
          </h2>
          <p className="text-sm text-slate-500">
            Generate downloadable PDF and 15-column CSV statements in INR (₹) and kilometres (Asia/Kolkata), with live on-screen verification tables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={vehicles.length === 0 && filteredLogs.length === 0}
            onClick={async () => {
              generateExecutiveFleetDossierPdf({
                businessName,
                ownerName:
                  profile?.displayName || profile?.fullName || 'Fleet Owner',
                intendedDriveEmail: recipientEmail,
                dateRangeLabel,
                vehicles: scopedVehicles,
                drivers,
                entries: filteredLogs,
                serviceRecords: filteredServiceRecords,
                complianceDocuments,
                alerts: activeAlerts,
                isDemoMode,
              });
              await logReportExportAudit(
                'Executive Fleet Dossier PDF',
                `Unified multi-section board dossier (${filteredLogs.length} shifts, ${scopedVehicles.length} vehicles)`
              );
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 shadow-xs"
          >
            <Download className="w-4 h-4 text-teal-400" />
            Download Complete Executive Fleet Dossier (PDF)
          </button>

          <button
            type="button"
            disabled={filteredLogs.length === 0}
            onClick={async () => {
              exportLogbookCsv15Column(
                filteredLogs,
                'FzeeLog_15Col_Logbook',
                profile?.customLogbookHeaders
              );
              await logReportExportAudit(
                '15-Column Logbook CSV',
                `Exported ${filteredLogs.length} daily logbook shifts to 15-column CSV`
              );
            }}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-teal-600" />
            Export 15-Col CSV
          </button>
        </div>
      </div>

      {lastDownloadedReport && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>{lastDownloadedReport}</strong> generated and logged to
              your Notification &amp; Report History ledger.
            </span>
          </div>
          <span className="font-mono text-[11px] text-emerald-700">
            Asia/Kolkata
          </span>
        </div>
      )}

      {/* Global Report Scope Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Vehicle Scope
          </label>
          <select
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">All Fleet Vehicles ({vehicles.length})</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.registrationNumber} — {v.make} {v.model}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Month Filter (YYYY-MM)
          </label>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            From Date
          </label>
          <input
            type="date"
            value={startDateFilter}
            onChange={(e) => setStartDateFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            To Date
          </label>
          <input
            type="date"
            value={endDateFilter}
            onChange={(e) => setEndDateFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              setSelectedVehicleId('ALL');
              setMonthFilter('');
              setStartDateFilter('');
              setEndDateFilter('');
            }}
            className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </button>
        </div>
      </div>

      {/* Scoped KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            Scoped Distance
          </div>
          <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
            {formatKm(scopeMetrics.totalKm)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {filteredLogs.length} shift(s)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            Gross Revenue
          </div>
          <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
            {formatINR(scopeMetrics.grossEarnings)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            15-Col Earnings
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            Driver Share Payout
          </div>
          <div className="text-base font-bold font-mono text-teal-700 mt-0.5">
            {formatINR(scopeMetrics.driverShare)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Separated from OpEx
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            Logbook OpEx
          </div>
          <div className="text-base font-bold font-mono text-amber-700 mt-0.5">
            {formatINR(scopeMetrics.logbookOpEx)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Fuel + Taxi + Toll + Maint
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            Workshop Invoices
          </div>
          <div className="text-base font-bold font-mono text-rose-700 mt-0.5">
            {formatINR(scopeMetrics.workshopCost)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {filteredServiceRecords.length} service record(s)
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-300">
            Net P&amp;L (After Service)
          </div>
          <div className="text-base font-bold font-mono text-teal-400 mt-0.5">
            {formatINR(scopeMetrics.netAfterWorkshop)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Logbook Net: {formatINR(scopeMetrics.netLogbookProfit, true)}
          </div>
        </div>
      </div>

      {/* 6 Downloadable PDF Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: 15-Column Daily Logbook PDF */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-semibold bg-teal-50 text-teal-800 rounded border border-teal-200">
                REPORT 01 · 15-COLUMN LOGBOOK
              </span>
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              15-Column Daily Logbook &amp; Shift Statement
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Exports all 15 user-facing columns (S.NO, Date, Starting KM, Ending KM, KM/DAY, Attendance, Earnings, Unit Price, Driver Share, Gas/Fuel, Red Taxi, Toll, Maintenance, Total Expenses, Source/Remarks).
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500">
              {filteredLogs.length} shift(s)
            </span>
            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={async () => {
                generateLogbookPdfReport({
                  title: '15-Column Daily Logbook & Shift Statement',
                  businessName,
                  dateRangeLabel,
                  vehicleFilterLabel: vehicleScopeLabel,
                  entries: filteredLogs,
                  isDemoMode,
                  customHeaders: profile?.customLogbookHeaders,
                });
                await logReportExportAudit(
                  '15-Column Logbook PDF',
                  `Generated 15-column PDF statement for ${filteredLogs.length} shift(s)`
                );
              }}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download 15-Col PDF
            </button>
          </div>
        </div>

        {/* Card 2: Vehicle Profit & Loss Statement PDF */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-semibold bg-slate-100 text-slate-800 rounded border border-slate-200">
                REPORT 02 · VEHICLE P&amp;L
              </span>
              <IndianRupee className="w-5 h-5 text-slate-800" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Executive Vehicle Profit &amp; Loss (P&amp;L) PDF
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Per-vehicle financial reconciliation combining 15-column logbook revenue, separated Driver Share, operating expenses, and itemized workshop maintenance invoices.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500">
              {vehiclePnLRows.length} vehicle(s)
            </span>
            <button
              type="button"
              disabled={vehiclePnLRows.length === 0}
              onClick={async () => {
                generateVehicleProfitLossPdf({
                  businessName,
                  dateRangeLabel,
                  vehicles: scopedVehicles,
                  entries: filteredLogs,
                  serviceRecords: filteredServiceRecords,
                  isDemoMode,
                });
                await logReportExportAudit(
                  'Vehicle Profit & Loss PDF',
                  `Generated per-vehicle P&L statement across ${vehiclePnLRows.length} vehicle(s)`
                );
              }}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download Vehicle P&amp;L PDF
            </button>
          </div>
        </div>

        {/* Card 3: Driver Attendance & Revenue Share Settlement PDF */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-semibold bg-indigo-50 text-indigo-800 rounded border border-indigo-200">
                REPORT 03 · DRIVER SETTLEMENT
              </span>
              <UserCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Driver Attendance &amp; Share Settlement PDF
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Summarizes Present, Half-Day, and Absent/Leave shift counts, total kilometres driven, gross earnings generated, and net Driver Share payouts per driver.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500">
              {driverSettlements.length} driver(s)
            </span>
            <button
              type="button"
              disabled={driverSettlements.length === 0}
              onClick={async () => {
                generateDriverSettlementPdf({
                  businessName,
                  dateRangeLabel,
                  drivers,
                  entries: filteredLogs,
                  isDemoMode,
                });
                await logReportExportAudit(
                  'Driver Settlement PDF',
                  `Generated driver attendance and share payout statement for ${driverSettlements.length} driver(s)`
                );
              }}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download Driver PDF
            </button>
          </div>
        </div>

        {/* Card 4: Statutory Compliance & Expiry Audit PDF */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-800 rounded border border-emerald-200">
                REPORT 04 · COMPLIANCE AUDIT
              </span>
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Fleet Odometer &amp; Statutory Expiry Audit PDF
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Complete audit of registration numbers, validated odometers, Fitness Certificate (FC), Insurance, Commercial Permit, and Pollution (PUC) expiry dates.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500">
              {scopedVehicles.length} veh · {complianceDocuments.length} certs
            </span>
            <button
              type="button"
              disabled={scopedVehicles.length === 0}
              onClick={async () => {
                generateVehiclesCompliancePdf({
                  businessName,
                  vehicles: scopedVehicles,
                  complianceDocuments,
                  isDemoMode,
                });
                await logReportExportAudit(
                  'Statutory Compliance Audit PDF',
                  `Generated statutory compliance and odometer report (${scopedVehicles.length} vehicles)`
                );
              }}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download Compliance PDF
            </button>
          </div>
        </div>

        {/* Card 5: Preventive Maintenance & Workshop Ledger PDF */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-semibold bg-amber-50 text-amber-800 rounded border border-amber-200">
                REPORT 05 · WORKSHOP LEDGER
              </span>
              <Wrench className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Preventive Maintenance &amp; Workshop Cost PDF
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Itemized workshop service history, odometer intervals, invoice numbers, spare parts cost vs labor cost breakdown, and next due targets.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500">
              {filteredServiceRecords.length} record(s)
            </span>
            <button
              type="button"
              disabled={filteredServiceRecords.length === 0}
              onClick={async () => {
                generateServiceMaintenancePdf({
                  businessName,
                  serviceRecords: filteredServiceRecords,
                  isDemoMode,
                });
                await logReportExportAudit(
                  'Workshop Maintenance PDF',
                  `Generated preventive maintenance PDF (${filteredServiceRecords.length} service records)`
                );
              }}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download Workshop PDF
            </button>
          </div>
        </div>

        {/* Card 6: Unified Executive Fleet Dossier PDF */}
        <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-semibold bg-teal-500/20 text-teal-300 rounded border border-teal-500/30">
                REPORT 06 · FULL BOARD DOSSIER
              </span>
              <ClipboardCheck className="w-5 h-5 text-teal-400" />
            </div>
            <h3 className="text-base font-bold text-white">
              Unified Executive Fleet Board Dossier PDF
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Combines KPIs, Vehicle P&amp;L Matrix, Driver Settlements, Active Compliance Alerts, and 15-Column Shifts into a single multi-page board packet.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">
              Multi-Section PDF
            </span>
            <button
              type="button"
              disabled={scopedVehicles.length === 0 && filteredLogs.length === 0}
              onClick={async () => {
                generateExecutiveFleetDossierPdf({
                  businessName,
                  ownerName:
                    profile?.displayName || profile?.fullName || 'Fleet Owner',
                  intendedDriveEmail: recipientEmail,
                  dateRangeLabel,
                  vehicles: scopedVehicles,
                  drivers,
                  entries: filteredLogs,
                  serviceRecords: filteredServiceRecords,
                  complianceDocuments,
                  alerts: activeAlerts,
                  isDemoMode,
                });
                await logReportExportAudit(
                  'Executive Fleet Dossier PDF',
                  `Generated full multi-section executive dossier`
                );
              }}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-teal-400 rounded-lg hover:bg-teal-300 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download Full Dossier
            </button>
          </div>
        </div>
      </div>

      {/* Interactive On-Screen Report Preview Tables */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Live Interactive Report Verification Preview ({dateRangeLabel})
            </h3>
            <p className="text-xs text-slate-500">
              Inspect exact figures before exporting to PDF or CSV. Driver Share is strictly separated from Operating Expenses.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setPreviewTab('vehicle-pnl')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                previewTab === 'vehicle-pnl'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vehicle P&amp;L ({vehiclePnLRows.length})
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab('driver-settlements')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                previewTab === 'driver-settlements'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Driver Settlements ({driverSettlements.length})
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab('logbook-15col')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                previewTab === 'logbook-15col'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              15-Column Shifts ({filteredLogs.length})
            </button>
          </div>
        </div>

        {previewTab === 'vehicle-pnl' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Vehicle</th>
                  <th className="py-3 px-3 text-right">Shifts</th>
                  <th className="py-3 px-3 text-right">Total KM</th>
                  <th className="py-3 px-3 text-right">Gross Revenue</th>
                  <th className="py-3 px-3 text-right">Driver Share</th>
                  <th className="py-3 px-3 text-right">Logbook OpEx</th>
                  <th className="py-3 px-3 text-right">Workshop Service</th>
                  <th className="py-3 px-3 text-right">Net Logbook</th>
                  <th className="py-3 px-4 text-right">Net After Service</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-mono">
                {vehiclePnLRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-8 text-center font-sans text-slate-500"
                    >
                      No vehicles match the selected scope.
                    </td>
                  </tr>
                ) : (
                  vehiclePnLRows.map((r) => (
                    <tr key={r.vehicleId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-sans">
                        <div className="font-mono font-semibold text-slate-900">
                          {r.registrationNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.makeModel} · {r.status}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {r.shiftsCount}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {formatKm(r.totalKm)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-900">
                        {formatINR(r.grossEarnings)}
                      </td>
                      <td className="py-3 px-3 text-right text-teal-700">
                        {formatINR(r.driverShareTotal)}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-800">
                        {formatINR(r.logbookOperatingExpenses)}
                      </td>
                      <td className="py-3 px-3 text-right text-rose-700">
                        {formatINR(r.workshopServiceCostTotal)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-900">
                        {formatINR(r.netLogbookEarnings)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          r.netAfterWorkshopService >= 0
                            ? 'text-teal-700'
                            : 'text-red-600'
                        }`}
                      >
                        {formatINR(r.netAfterWorkshopService)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {previewTab === 'driver-settlements' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Driver Name</th>
                  <th className="py-3 px-3 text-right">Shifts</th>
                  <th className="py-3 px-3 text-right">Attendance (P/HD/A)</th>
                  <th className="py-3 px-3 text-right">Total KM</th>
                  <th className="py-3 px-3 text-right">Gross Generated</th>
                  <th className="py-3 px-3 text-right">Driver Share Earned</th>
                  <th className="py-3 px-4 text-right">Net Owner Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-mono">
                {driverSettlements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center font-sans text-slate-500"
                    >
                      No driver records found.
                    </td>
                  </tr>
                ) : (
                  driverSettlements.map((d) => (
                    <tr key={d.driverId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                        {d.driverName}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {d.shiftsWorked}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {d.presentDays}P / {d.halfDays}HD / {d.leaveOrAbsentDays}A
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {formatKm(d.totalKmDriven)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-900">
                        {formatINR(d.grossEarningsGenerated)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-teal-700">
                        {formatINR(d.totalDriverShareEarned)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {formatINR(d.netOwnerContribution)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {previewTab === 'logbook-15col' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                  <th className="py-2.5 px-3">
                    1. {profile?.customLogbookHeaders?.sno || 'S.NO'}
                  </th>
                  <th className="py-2.5 px-3">
                    2. {profile?.customLogbookHeaders?.date || 'Date'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    3. {profile?.customLogbookHeaders?.startingKm || 'Start KM'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    4. {profile?.customLogbookHeaders?.endingKm || 'End KM'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    5. {profile?.customLogbookHeaders?.kmDay || 'KM/DAY'}
                  </th>
                  <th className="py-2.5 px-3">
                    6. {profile?.customLogbookHeaders?.attendance || 'Attendance'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    7. {profile?.customLogbookHeaders?.earnings || 'Earnings'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    8. {profile?.customLogbookHeaders?.unitPrice || 'Unit Price'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    9. {profile?.customLogbookHeaders?.driverShare || 'Driver Share'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    10. {profile?.customLogbookHeaders?.gasFuel || 'Gas/Fuel'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    11. {profile?.customLogbookHeaders?.redTaxi || 'Red Taxi'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    12. {profile?.customLogbookHeaders?.toll || 'Toll'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    13. {profile?.customLogbookHeaders?.maintenance || 'Maint'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    14. {profile?.customLogbookHeaders?.totalExpenses || 'Total Exp'}
                  </th>
                  <th className="py-2.5 px-3">
                    15. {profile?.customLogbookHeaders?.sourceRemarks || 'Source/Remarks'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-mono whitespace-nowrap">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={15}
                      className="py-8 text-center font-sans text-slate-500"
                    >
                      No logbook shifts match your current filter.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.slice(0, 25).map((e, idx) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 text-slate-900">
                        {e.date || e.entryDate} ({e.vehicleRegistration})
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {e.startingKm.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {e.endingKm.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold">
                        {e.kmDay.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 font-sans">{e.attendance}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                        {formatINR(e.earnings)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatINR(e.unitPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-teal-700">
                        {formatINR(e.driverShare)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatINR(e.gasFuel)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatINR(e.redTaxi)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatINR(e.toll)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatINR(e.maintenance)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-amber-800">
                        {formatINR(e.totalExpenses)}
                      </td>
                      <td className="py-2.5 px-3 font-sans max-w-[220px] truncate">
                        {e.sourceRemarks}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export const GoogleDriveAndNotificationsView: React.FC<{
  mode: 'backup' | 'notifications';
}> = ({ mode }) => {
  const {
    user,
    profile,
    vehicles,
    drivers,
    logbookEntries,
    serviceRecords,
    complianceDocuments,
    vehicleMedia,
    notificationLogs,
    isDemoMode,
    updateProfileConfig,
    saveNotificationLog,
    updateNotificationStatus,
    deleteNotificationLog,
    restoreFleetSnapshot,
  } = useFleet();

  const targetEmail =
    profile?.alertEmail ||
    profile?.intendedGoogleDriveEmail ||
    profile?.intendedDriveEmail ||
    '';

  const targetWhatsapp = profile?.whatsappNumber || '';

  const [alertEmailInput, setAlertEmailInput] = useState<string>(targetEmail);
  const [whatsappInput, setWhatsappInput] = useState<string>(targetWhatsapp);
  const [expiryDaysInput, setExpiryDaysInput] = useState<number>(
    profile?.expiryAlertDays ?? profile?.expiryWarningDays ?? 30
  );
  const [serviceKmInput, setServiceKmInput] = useState<number>(
    profile?.serviceWarningKm ?? 1000
  );
  const [savedThresholds, setSavedThresholds] = useState(false);

  // Test Email & WhatsApp Dispatch states (10d, 5d, 1d milestones)
  const [testingChannel, setTestingChannel] = useState<
    'Email' | 'WhatsApp' | 'Both' | null
  >(null);
  const [testDispatchReceipt, setTestDispatchReceipt] = useState<{
    dispatchedAt: string;
    generatedAtKolkata: string;
    channel: string;
    recipientEmail: string;
    whatsappNumber: string;
    whatsappE164: string;
    emailPayload: {
      to: string;
      subject: string;
      bodyText: string;
      status: string;
    } | null;
    whatsappPayload: {
      to: string;
      messageText: string;
      waMeLink: string;
      status: string;
    } | null;
  } | null>(null);
  const [copiedTestReceipt, setCopiedTestReceipt] = useState(false);

  // Notification Center filters & states
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<string>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('ALL');
  const [historySearch, setHistorySearch] = useState<string>('');
  const [dispatchingDigest, setDispatchingDigest] = useState(false);
  const [digestPreview, setDigestPreview] = useState<{
    subject: string;
    bodyText: string;
    recipientEmail: string;
    generatedAtKolkata: string;
  } | null>(null);
  const [copiedDigest, setCopiedDigest] = useState(false);
  const [customAlertModalOpen, setCustomAlertModalOpen] = useState(false);
  const [customAlertForm, setCustomAlertForm] = useState({
    alertType: 'StatutoryExpiry' as NotificationAlertType,
    severity: 'WARNING' as NotificationSeverity,
    targetLabel: vehicles[0]?.registrationNumber || 'Fleet Operations',
    title: '',
    message: '',
    channel: 'InApp' as NotificationChannel,
  });

  useEffect(() => {
    if (profile) {
      setAlertEmailInput(
        profile.alertEmail ||
          profile.intendedGoogleDriveEmail ||
          profile.intendedDriveEmail ||
          ''
      );
      setWhatsappInput(profile.whatsappNumber || '');
      setExpiryDaysInput(
        profile.expiryAlertDays ?? profile.expiryWarningDays ?? 30
      );
      setServiceKmInput(profile.serviceWarningKm ?? 1000);
    }
  }, [profile]);

  const milestoneAlerts = useMemo(
    () => evaluateMilestoneExpiryAlerts(vehicles, drivers, [10, 5, 1]),
    [vehicles, drivers]
  );

  const activeAlerts = useMemo(
    () =>
      evaluateFleetComplianceAlerts(
        vehicles,
        drivers,
        expiryDaysInput,
        serviceKmInput
      ),
    [vehicles, drivers, expiryDaysInput, serviceKmInput]
  );

  const filteredActiveAlerts = useMemo(() => {
    if (alertSeverityFilter === 'ALL') return activeAlerts;
    if (alertSeverityFilter === 'CRITICAL_URGENT') {
      return activeAlerts.filter(
        (a) =>
          a.severity === 'EXPIRED' ||
          a.severity === 'URGENT' ||
          a.severity === 'CRITICAL'
      );
    }
    return activeAlerts.filter((a) => a.severity === alertSeverityFilter);
  }, [activeAlerts, alertSeverityFilter]);

  const filteredNotificationLogs = useMemo(() => {
    return notificationLogs.filter((n) => {
      if (historyStatusFilter !== 'ALL' && n.status !== historyStatusFilter) {
        return false;
      }
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const hay = `${n.title} ${n.message} ${n.targetLabel} ${n.alertType} ${n.recipientEmail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notificationLogs, historyStatusFilter, historySearch]);

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfileConfig({
      fullName: profile?.fullName || profile?.displayName || 'Fleet Owner',
      businessName: profile?.businessName || 'FzeeLog Fleet Operations',
      defaultDriverSharePct: profile?.defaultDriverSharePct ?? 30,
      alertEmail: alertEmailInput.trim(),
      whatsappNumber: whatsappInput.trim(),
      alertMilestonesDays: [10, 5, 1],
      intendedDriveEmail: alertEmailInput.trim() || targetEmail,
      expiryWarningDays: expiryDaysInput,
      serviceWarningKm: serviceKmInput,
    });
    setSavedThresholds(true);
    setTimeout(() => setSavedThresholds(false), 3000);
  };

  const handleTriggerTestAlertDispatch = async (
    channel: 'Email' | 'WhatsApp' | 'Both'
  ) => {
    setTestingChannel(channel);
    try {
      const emailToUse = alertEmailInput.trim();
      const waToUse = whatsappInput.trim();

      const response = await fetch('/api/notifications/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          recipientEmail: emailToUse,
          whatsappNumber: waToUse,
          businessName: profile?.businessName || 'FzeeLog Fleet Operations',
          milestoneItems: milestoneAlerts.map((m) => ({
            documentLabel: m.documentLabel,
            targetLabel: m.targetLabel,
            expiryDate: m.expiryDate,
            daysRemaining: m.daysRemaining,
            milestoneBucket: m.milestoneBucket,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to trigger test expiry alert dispatch.');
      }

      const receipt = await response.json();
      setTestDispatchReceipt(receipt);

      if (channel === 'Email' || channel === 'Both') {
        await saveNotificationLog({
          alertType: 'StatutoryExpiry',
          severity: 'WARNING',
          targetLabel: `Email Test → ${emailToUse}`,
          title: `Test Expiry Alert Mail Dispatched to ${emailToUse}`,
          message: `10-Day, 5-Day & 1-Day statutory expiry alert test (Insurance, FC, Permit, Driver Licence, Pollution) sent to ${emailToUse}.`,
          recipientEmail: emailToUse,
          channel: 'EmailDigest',
          status: 'Dispatched',
        });
      }

      if (channel === 'WhatsApp' || channel === 'Both') {
        await saveNotificationLog({
          alertType: 'StatutoryExpiry',
          severity: 'WARNING',
          targetLabel: `WhatsApp Test → +91 ${waToUse}`,
          title: `Test WhatsApp Expiry Alert Dispatched to ${waToUse}`,
          message: `10-Day, 5-Day & 1-Day statutory expiry alert test (Insurance, FC, Permit, Driver Licence, Pollution) sent to WhatsApp ${waToUse}.`,
          recipientEmail: emailToUse,
          channel: 'WhatsApp',
          status: 'Dispatched',
        });
      }
    } finally {
      setTestingChannel(null);
    }
  };

  const handleGenerateAndDispatchDigest = async () => {
    setDispatchingDigest(true);
    try {
      const totalKm = roundKm(logbookEntries.reduce((s, e) => s + e.kmDay, 0));
      const grossEarnings = roundCurrency(
        logbookEntries.reduce((s, e) => s + e.earnings, 0)
      );
      const totalOperatingExpenses = roundCurrency(
        logbookEntries.reduce((s, e) => s + e.totalExpenses, 0)
      );
      const totalDriverShare = roundCurrency(
        logbookEntries.reduce((s, e) => s + e.driverShare, 0)
      );
      const netBusinessEarnings = roundCurrency(
        logbookEntries.reduce((s, e) => s + e.netBusinessEarnings, 0)
      );

      const response = await fetch('/api/notifications/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: profile?.businessName || 'FzeeLog Fleet Operations',
          recipientEmail: targetEmail,
          alerts: activeAlerts.map((a) => ({
            severity: a.severity,
            targetLabel: a.targetLabel,
            documentLabel: a.documentLabel,
            expiryOrDueInfo: a.expiryOrDueInfo,
          })),
          financialSummary: {
            totalKm,
            grossEarnings,
            totalOperatingExpenses,
            totalDriverShare,
            netBusinessEarnings,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate alert digest on server.');
      }

      const data = await response.json();
      const digest = data.digest;
      setDigestPreview(digest);

      await saveNotificationLog({
        alertType: 'FinancialDigest',
        severity:
          digest.criticalCount > 0
            ? 'CRITICAL'
            : digest.warningCount > 0
            ? 'WARNING'
            : 'INFO',
        targetLabel: `${vehicles.length} Vehicles · ${activeAlerts.length} Active Alerts`,
        title: digest.subject.slice(0, 160),
        message: `Asia/Kolkata Alert & Financial Digest prepared for ${targetEmail}. Critical: ${digest.criticalCount}, Warning: ${digest.warningCount}. Net Profit: ${formatINR(netBusinessEarnings)}.`,
        recipientEmail: targetEmail,
        channel: 'EmailDigest',
        status: 'Dispatched',
      });
    } finally {
      setDispatchingDigest(false);
    }
  };

  const handleLogSingleAlert = async (
    item: ReturnType<typeof evaluateFleetComplianceAlerts>[number]
  ) => {
    const mappedType: NotificationAlertType =
      item.targetType === 'Service'
        ? 'ServiceOdometer'
        : item.targetType === 'Driver'
        ? 'DriverLicense'
        : 'StatutoryExpiry';
    const mappedSeverity: NotificationSeverity =
      item.severity === 'EXPIRED' ||
      item.severity === 'URGENT' ||
      item.severity === 'CRITICAL'
        ? 'CRITICAL'
        : 'WARNING';

    await saveNotificationLog({
      alertType: mappedType,
      severity: mappedSeverity,
      targetLabel: item.targetLabel,
      title: item.title,
      message: item.detail,
      recipientEmail: targetEmail,
      channel: 'InApp',
      status: 'Acknowledged',
    });
  };

  const handleSaveCustomAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAlertForm.title.trim() || !customAlertForm.message.trim()) return;
    await saveNotificationLog({
      alertType: customAlertForm.alertType,
      severity: customAlertForm.severity,
      targetLabel: customAlertForm.targetLabel,
      title: customAlertForm.title,
      message: customAlertForm.message,
      recipientEmail: targetEmail,
      channel: customAlertForm.channel,
      status: 'Unread',
    });
    setCustomAlertForm({
      ...customAlertForm,
      title: '',
      message: '',
    });
    setCustomAlertModalOpen(false);
  };

  // Phase 6 Google Drive Backup & Restore Vault States
  const [driveToken, setDriveToken] = useState<string | null>(() =>
    getDriveAccessToken()
  );
  const [connectedDriveEmail, setConnectedDriveEmail] = useState<string>(
    user?.email || ''
  );
  const [driveFolder, setDriveFolder] = useState<DriveFileMetadata | null>(
    null
  );
  const [driveFiles, setDriveFiles] = useState<DriveFileMetadata[]>([]);
  const [driveBusy, setDriveBusy] = useState<boolean>(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState<string | null>(null);
  const [driveErrorMsg, setDriveErrorMsg] = useState<string | null>(null);

  // Destructive confirmation modals (Delete / Overwrite / Restore)
  const [filePendingDelete, setFilePendingDelete] =
    useState<DriveFileMetadata | null>(null);
  const [filePendingOverwrite, setFilePendingOverwrite] =
    useState<DriveFileMetadata | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    sourceLabel: string;
    parsed: ParsedFleetBackupRestore;
  } | null>(null);
  const [restoringBusy, setRestoringBusy] = useState<boolean>(false);
  const localRestoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user?.email) {
      setConnectedDriveEmail(user.email);
    }
    const existingToken = getDriveAccessToken();
    if (existingToken) {
      setDriveToken(existingToken);
    }
  }, [user]);

  const currentSnapshot = useMemo(
    () =>
      buildFleetBackupSnapshot({
        profile,
        vehicles,
        drivers,
        logbookEntries,
        serviceRecords,
        complianceDocuments,
        vehicleMedia,
        notificationLogs,
        isDemoMode,
      }),
    [
      profile,
      vehicles,
      drivers,
      logbookEntries,
      serviceRecords,
      complianceDocuments,
      vehicleMedia,
      notificationLogs,
      isDemoMode,
    ]
  );

  const handleDownloadStructuredBackupJson = () => {
    const blob = new Blob([JSON.stringify(currentSnapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fzeelog-backup-${getTodayKolkataDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refreshDriveVault = async (tokenToUse: string) => {
    setDriveBusy(true);
    setDriveErrorMsg(null);
    try {
      const folder = await ensureFzeeLogDriveFolder(tokenToUse);
      setDriveFolder(folder);
      const files = await listFzeeLogDriveBackups(tokenToUse, folder.id);
      setDriveFiles(files);
    } catch (err: any) {
      const msg = err?.message || 'Failed to sync Google Drive folder.';
      if (msg.includes('401') || msg.includes('403')) {
        setDriveAccessToken(null);
        setDriveToken(null);
      }
      setDriveErrorMsg(msg);
    } finally {
      setDriveBusy(false);
    }
  };

  const handleConnectGoogleDrive = async () => {
    setDriveBusy(true);
    setDriveErrorMsg(null);
    setDriveStatusMsg(null);
    try {
      const { user: authedUser, accessToken } = await connectGoogleDriveOAuth();
      setDriveToken(accessToken);
      setConnectedDriveEmail(authedUser.email || targetEmail);
      const folder = await ensureFzeeLogDriveFolder(accessToken);
      setDriveFolder(folder);
      const files = await listFzeeLogDriveBackups(accessToken, folder.id);
      setDriveFiles(files);
      setDriveStatusMsg(
        `Connected to Google Drive (${authedUser.email || targetEmail}). Folder "${folder.name}" is ready with ${files.length} backup file(s).`
      );
    } catch (err: any) {
      setDriveErrorMsg(
        err?.message || 'Google Drive OAuth authorization was cancelled or failed.'
      );
    } finally {
      setDriveBusy(false);
    }
  };

  const handleUploadNewSnapshotToDrive = async () => {
    if (!driveToken) {
      setDriveErrorMsg(
        'Please click "Connect & Authorize Google Drive" first to grant drive.file access.'
      );
      return;
    }
    setDriveBusy(true);
    setDriveErrorMsg(null);
    setDriveStatusMsg(null);
    try {
      const folder =
        driveFolder || (await ensureFzeeLogDriveFolder(driveToken));
      setDriveFolder(folder);
      const uploaded = await uploadJsonSnapshotToDrive({
        accessToken: driveToken,
        folderId: folder.id,
        snapshot: currentSnapshot,
      });
      const files = await listFzeeLogDriveBackups(driveToken, folder.id);
      setDriveFiles(files);
      setDriveStatusMsg(
        `Uploaded JSON snapshot "${uploaded.name}" to Google Drive folder "${folder.name}".`
      );
      await saveNotificationLog({
        alertType: 'FinancialDigest',
        severity: 'INFO',
        targetLabel: uploaded.name,
        title: `Google Drive Backup Uploaded: ${uploaded.name}`,
        message: `Backed up ${currentSnapshot.summaryCounts.vehicles} vehicles, ${currentSnapshot.summaryCounts.drivers} drivers, and ${currentSnapshot.summaryCounts.dailyLogbookEntries} shift logs to Google Drive (${connectedDriveEmail || targetEmail}).`,
        recipientEmail: connectedDriveEmail || targetEmail,
        channel: 'InApp',
        status: 'Dispatched',
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to upload snapshot to Google Drive.';
      if (msg.includes('401') || msg.includes('403')) {
        setDriveAccessToken(null);
        setDriveToken(null);
      }
      setDriveErrorMsg(msg);
    } finally {
      setDriveBusy(false);
    }
  };

  const handleConfirmOverwriteSnapshot = async () => {
    if (!driveToken || !filePendingOverwrite) return;
    setDriveBusy(true);
    setDriveErrorMsg(null);
    setDriveStatusMsg(null);
    try {
      const folder =
        driveFolder || (await ensureFzeeLogDriveFolder(driveToken));
      const updated = await uploadJsonSnapshotToDrive({
        accessToken: driveToken,
        folderId: folder.id,
        snapshot: currentSnapshot,
        existingFileIdToOverwrite: filePendingOverwrite.id,
      });
      const files = await listFzeeLogDriveBackups(driveToken, folder.id);
      setDriveFiles(files);
      setDriveStatusMsg(
        `Overwrote Google Drive backup "${updated.name}" (${updated.id}) with latest fleet snapshot.`
      );
      setFilePendingOverwrite(null);
    } catch (err: any) {
      setDriveErrorMsg(
        err?.message || 'Failed to overwrite Google Drive backup file.'
      );
    } finally {
      setDriveBusy(false);
    }
  };

  const handleUpload15ColCsvToDrive = async () => {
    if (!driveToken) {
      setDriveErrorMsg(
        'Please click "Connect & Authorize Google Drive" first to grant drive.file access.'
      );
      return;
    }
    setDriveBusy(true);
    setDriveErrorMsg(null);
    setDriveStatusMsg(null);
    try {
      const folder =
        driveFolder || (await ensureFzeeLogDriveFolder(driveToken));
      setDriveFolder(folder);
      const uploaded = await uploadCsvLogbookToDrive({
        accessToken: driveToken,
        folderId: folder.id,
        entries: logbookEntries,
        businessName: profile?.businessName || 'FzeeLog Fleet Operations',
      });
      const files = await listFzeeLogDriveBackups(driveToken, folder.id);
      setDriveFiles(files);
      setDriveStatusMsg(
        `Uploaded 15-Column CSV "${uploaded.name}" (${logbookEntries.length} shift rows) to Google Drive.`
      );
    } catch (err: any) {
      setDriveErrorMsg(
        err?.message || 'Failed to upload 15-Column CSV to Google Drive.'
      );
    } finally {
      setDriveBusy(false);
    }
  };

  const handleConfirmDeleteDriveFile = async () => {
    if (!driveToken || !filePendingDelete) return;
    setDriveBusy(true);
    setDriveErrorMsg(null);
    setDriveStatusMsg(null);
    try {
      await deleteDriveBackupFile(driveToken, filePendingDelete.id);
      const deletedName = filePendingDelete.name;
      setFilePendingDelete(null);
      if (driveFolder) {
        const files = await listFzeeLogDriveBackups(driveToken, driveFolder.id);
        setDriveFiles(files);
      } else {
        setDriveFiles((prev) =>
          prev.filter((f) => f.id !== filePendingDelete.id)
        );
      }
      setDriveStatusMsg(
        `Deleted "${deletedName}" from Google Drive backup folder.`
      );
    } catch (err: any) {
      setDriveErrorMsg(
        err?.message || 'Failed to delete backup file from Google Drive.'
      );
    } finally {
      setDriveBusy(false);
    }
  };

  const handleInspectDriveFileForRestore = async (file: DriveFileMetadata) => {
    if (!driveToken) return;
    setDriveBusy(true);
    setDriveErrorMsg(null);
    try {
      const parsed = await downloadDriveBackupJson(driveToken, file.id);
      setRestorePreview({
        sourceLabel: `Google Drive: ${file.name} (${file.id})`,
        parsed,
      });
    } catch (err: any) {
      setDriveErrorMsg(
        err?.message || 'Failed to download backup file from Google Drive.'
      );
    } finally {
      setDriveBusy(false);
    }
  };

  const handleLocalRestoreFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDriveErrorMsg(null);
    try {
      const text = await file.text();
      const parsed = parseAndValidateBackupJson(text);
      setRestorePreview({
        sourceLabel: `Local File: ${file.name}`,
        parsed,
      });
    } catch (err: any) {
      setDriveErrorMsg(
        err?.message || 'Could not read local JSON backup file.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleExecuteConfirmedRestore = async () => {
    if (!restorePreview || !restorePreview.parsed.valid) return;
    setRestoringBusy(true);
    setDriveErrorMsg(null);
    setDriveStatusMsg(null);
    try {
      const counts = await restoreFleetSnapshot({
        vehicles: restorePreview.parsed.vehicles,
        drivers: restorePreview.parsed.drivers,
        dailyLogbookEntries: restorePreview.parsed.dailyLogbookEntries,
        serviceRecords: restorePreview.parsed.serviceRecords,
        complianceDocuments: restorePreview.parsed.complianceDocuments,
      });
      setDriveStatusMsg(
        `Restore completed from ${restorePreview.sourceLabel}: ${counts.vehiclesRestored} vehicles, ${counts.driversRestored} drivers, ${counts.entriesRestored} daily logbook shifts, ${counts.servicesRestored} service records, and ${counts.docsRestored} compliance documents restored.`
      );
      setRestorePreview(null);
    } catch (err: any) {
      setDriveErrorMsg(err?.message || 'Failed to restore backup archive.');
    } finally {
      setRestoringBusy(false);
    }
  };

  if (mode === 'notifications') {
    const unreadCount = notificationLogs.filter(
      (n) => n.status === 'Unread'
    ).length;

    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Notifications, Configurable Expiry Alerts &amp; Dispatch History
            </h2>
            <p className="text-sm text-slate-500">
              Real-time statutory expiry &amp; preventive service evaluation (Asia/Kolkata) with persistent notification logs for{' '}
              <span className="font-mono font-semibold text-slate-800">
                {targetEmail}
              </span>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={testingChannel !== null}
              onClick={() => handleTriggerTestAlertDispatch('Email')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
            >
              <Mail className="w-3.5 h-3.5 text-teal-400" />
              {testingChannel === 'Email'
                ? 'Sending Test Mail...'
                : `Trigger Test Mail (${alertEmailInput || 'not configured'})`}
            </button>

            <button
              type="button"
              disabled={testingChannel !== null}
              onClick={() => handleTriggerTestAlertDispatch('WhatsApp')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {testingChannel === 'WhatsApp'
                ? 'Sending WhatsApp...'
                : `Trigger Test WhatsApp (${whatsappInput || 'not configured'})`}
            </button>

            <button
              type="button"
              disabled={dispatchingDigest}
              onClick={handleGenerateAndDispatchDigest}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              {dispatchingDigest
                ? 'Preparing Digest...'
                : 'Generate & Log Asia/Kolkata Digest'}
            </button>

            <button
              type="button"
              onClick={() => setCustomAlertModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Custom Reminder
            </button>
          </div>
        </div>

        {/* Live Test Email & WhatsApp Dispatch Receipt Drawer */}
        {testDispatchReceipt && (
          <div className="bg-slate-900 text-white border-2 border-teal-500/60 rounded-xl p-5 space-y-4 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-teal-300">
                  Test Alert Dispatched · {testDispatchReceipt.generatedAtKolkata} IST · 10d / 5d / 1d Expiry Engine
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {testDispatchReceipt.emailPayload && (
                  <a
                    href={`mailto:${encodeURIComponent(
                      testDispatchReceipt.recipientEmail
                    )}?subject=${encodeURIComponent(
                      testDispatchReceipt.emailPayload.subject
                    )}&body=${encodeURIComponent(
                      testDispatchReceipt.emailPayload.bodyText
                    )}`}
                    className="px-3 py-1 text-xs font-semibold bg-slate-800 text-teal-300 border border-teal-500/40 rounded hover:bg-slate-700 flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Open in Mail Client ({testDispatchReceipt.recipientEmail})
                  </a>
                )}
                {testDispatchReceipt.whatsappPayload && (
                  <a
                    href={testDispatchReceipt.whatsappPayload.waMeLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 text-xs font-semibold bg-emerald-500 text-slate-950 rounded hover:bg-emerald-400 flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Send via WhatsApp ({testDispatchReceipt.whatsappNumber})
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const textToCopy = [
                      testDispatchReceipt.emailPayload
                        ? `EMAIL TO: ${testDispatchReceipt.emailPayload.to}\nSUBJECT: ${testDispatchReceipt.emailPayload.subject}\n\n${testDispatchReceipt.emailPayload.bodyText}`
                        : '',
                      testDispatchReceipt.whatsappPayload
                        ? `WHATSAPP TO: ${testDispatchReceipt.whatsappPayload.to}\n\n${testDispatchReceipt.whatsappPayload.messageText}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join('\n\n====================\n\n');
                    navigator.clipboard.writeText(textToCopy);
                    setCopiedTestReceipt(true);
                    setTimeout(() => setCopiedTestReceipt(false), 2500);
                  }}
                  className="px-3 py-1 text-xs font-semibold bg-teal-500 text-slate-950 rounded hover:bg-teal-400 flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedTestReceipt ? 'Copied Payload' : 'Copy Test Payload'}
                </button>
                <button
                  type="button"
                  onClick={() => setTestDispatchReceipt(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {testDispatchReceipt.emailPayload && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-teal-300">
                    <span>EMAIL DISPATCH → {testDispatchReceipt.emailPayload.to}</span>
                    <span className="px-2 py-0.5 bg-teal-950 text-teal-300 rounded border border-teal-700">
                      {testDispatchReceipt.emailPayload.status}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-300">
                    <strong>Subject:</strong> {testDispatchReceipt.emailPayload.subject}
                  </p>
                  <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                    {testDispatchReceipt.emailPayload.bodyText}
                  </pre>
                </div>
              )}

              {testDispatchReceipt.whatsappPayload && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-emerald-400">
                    <span>WHATSAPP DISPATCH → {testDispatchReceipt.whatsappPayload.to}</span>
                    <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-700">
                      {testDispatchReceipt.whatsappPayload.status}
                    </span>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                    {testDispatchReceipt.whatsappPayload.messageText}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Digest Preview Drawer when generated */}
        {digestPreview && (
          <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-teal-300">
                  Asia/Kolkata Dispatch Digest Prepared · {digestPreview.generatedAtKolkata}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Subject: ${digestPreview.subject}\nTo: ${digestPreview.recipientEmail}\n\n${digestPreview.bodyText}`
                    );
                    setCopiedDigest(true);
                    setTimeout(() => setCopiedDigest(false), 2500);
                  }}
                  className="px-3 py-1 text-xs font-semibold bg-teal-500 text-slate-950 rounded hover:bg-teal-400 flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedDigest ? 'Copied Digest' : 'Copy Formatted Digest'}
                </button>
                <button
                  type="button"
                  onClick={() => setDigestPreview(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-xs font-mono text-slate-300">
              <strong>Subject:</strong> {digestPreview.subject} ·{' '}
              <strong>Recipient:</strong> {digestPreview.recipientEmail}
            </div>
            <pre className="text-xs font-mono bg-slate-950 text-slate-200 p-4 rounded-lg border border-slate-800 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {digestPreview.bodyText}
            </pre>
          </div>
        )}

        {/* 10-Day, 5-Day & 1-Day Statutory Expiry Milestone Strip */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                10-Day, 5-Day &amp; 1-Day Statutory Expiry Reminder Schedule (Insurance · FC · Permit · Driver Licence · Pollution)
              </h3>
              <p className="text-xs text-slate-500">
                Automated milestone checks before <strong>10 Days</strong>, <strong>5 Days</strong>, and <strong>1 Day</strong> sent to Email (<span className="font-mono text-slate-800">{alertEmailInput || 'not configured'}</span>) and WhatsApp (<span className="font-mono text-slate-800">{whatsappInput || 'not set'}</span>).
              </p>
            </div>
            <button
              type="button"
              disabled={testingChannel !== null}
              onClick={() => handleTriggerTestAlertDispatch('Both')}
              className="px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-400 hover:bg-teal-300 rounded-lg shrink-0 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Test Both (Email + WhatsApp)
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            {[
              { label: 'Insurance', key: 'Insurance' },
              { label: 'Fitness (FC)', key: 'FC' },
              { label: 'Permit', key: 'Permit' },
              { label: 'Driver Licence', key: 'Driver Licence' },
              { label: 'Pollution (PUC)', key: 'Pollution (PUC)' },
            ].map((cat) => {
              const items = milestoneAlerts.filter(
                (m) => m.documentLabel === cat.key
              );
              const urgentCount = items.filter(
                (m) => m.daysRemaining <= 10
              ).length;
              return (
                <div
                  key={cat.key}
                  className={`p-3 rounded-lg border ${
                    urgentCount > 0
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {cat.label}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-teal-700">
                      10d · 5d · 1d
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {items.length} tracked ·{' '}
                    <strong
                      className={
                        urgentCount > 0 ? 'text-red-700' : 'text-emerald-700'
                      }
                    >
                      {urgentCount} within ≤10d
                    </strong>
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Configurable Alert Threshold Form */}
          <form
            onSubmit={handleSaveThresholds}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Bell className="w-4 h-4 text-teal-600" />
                <h3 className="text-base font-semibold text-slate-900">
                  Email &amp; WhatsApp Alert Recipients
                </h3>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expiry Alert Email ID
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={alertEmailInput}
                    onChange={(e) => setAlertEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  WhatsApp Alert Number (10-digit / E.164)
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    value={whatsappInput}
                    onChange={(e) => setWhatsappInput(e.target.value)}
                    placeholder="9876543210"
                    className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Receives Insurance, FC, Permit, Driver Licence &amp; Pollution alerts <strong>10 days, 5 days, and 1 day</strong> before expiry.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Warning Window (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={expiryDaysInput}
                    onChange={(e) => setExpiryDaysInput(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Service Buffer (km)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={20000}
                    step={100}
                    value={serviceKmInput}
                    onChange={(e) => setServiceKmInput(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-slate-500 truncate">
                {alertEmailInput} · {whatsappInput}
              </span>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 flex items-center gap-1.5 shrink-0"
              >
                <Check className="w-4 h-4 text-teal-400" />
                {savedThresholds ? 'Saved' : 'Save Recipients'}
              </button>
            </div>
          </form>

          {/* Live Triggered Alerts Feed */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Live Evaluated Compliance &amp; Odometer Alerts ({filteredActiveAlerts.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Evaluated in real time against your {expiryDaysInput}-day and {formatKm(serviceKmInput)} thresholds.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full self-start sm:self-auto">
                {[
                  { id: 'ALL', label: `All (${activeAlerts.length})` },
                  { id: 'CRITICAL_URGENT', label: 'Expired / Urgent' },
                  { id: 'WARNING', label: 'Warning' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAlertSeverityFilter(tab.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      alertSeverityFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredActiveAlerts.length === 0 ? (
              <div className="py-10 text-center text-sm text-emerald-700 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                All fleet vehicles and driver licenses are compliant outside your configured warning window.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {filteredActiveAlerts.map((item) => {
                  const isCrit =
                    item.severity === 'EXPIRED' ||
                    item.severity === 'URGENT' ||
                    item.severity === 'CRITICAL';
                  return (
                    <div
                      key={item.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isCrit ? 'text-red-600' : 'text-amber-600'
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {item.title}
                            </span>
                            <span
                              className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                                isCrit
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {item.severity}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-0.5">{item.detail}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLogSingleAlert(item)}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md self-start sm:self-auto shrink-0 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5 text-teal-600" />
                        Acknowledge &amp; Log
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Persistent Notification & Dispatch History Ledger */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Persistent Notification &amp; Dispatch History Ledger ({filteredNotificationLogs.length})
              </h3>
              <p className="text-xs text-slate-500">
                Records all acknowledged compliance alerts, Asia/Kolkata email digests, and PDF/CSV report exports ({unreadCount} unread).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search notifications..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="Unread">Unread</option>
                <option value="Acknowledged">Acknowledged</option>
                <option value="Dispatched">Dispatched</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-3">Type &amp; Channel</th>
                  <th className="py-3 px-3">Target</th>
                  <th className="py-3 px-4">Alert / Digest Summary</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredNotificationLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 text-center text-slate-500"
                    >
                      No notification logs match your current filter.
                    </td>
                  </tr>
                ) : (
                  filteredNotificationLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {log.createdAt.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900">
                          {log.alertType}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {log.channel} · {log.severity}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-800">
                        {log.targetLabel}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-semibold text-slate-900">
                          {log.title}
                        </div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          {log.message}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded ${
                            log.status === 'Unread'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : log.status === 'Dispatched'
                              ? 'bg-teal-50 text-teal-800 border border-teal-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {log.status === 'Unread' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateNotificationStatus(log, 'Acknowledged')
                              }
                              className="px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50 rounded"
                              title="Mark Acknowledged"
                            >
                              Acknowledge
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteNotificationLog(log)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                            title="Delete Log"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Custom Operational Reminder Modal */}
        {customAlertModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  Create Custom Fleet Alert / Operational Reminder
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomAlertModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomAlert} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Alert Type
                    </label>
                    <select
                      value={customAlertForm.alertType}
                      onChange={(e) =>
                        setCustomAlertForm({
                          ...customAlertForm,
                          alertType: e.target.value as NotificationAlertType,
                        })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="StatutoryExpiry">StatutoryExpiry</option>
                      <option value="ServiceOdometer">ServiceOdometer</option>
                      <option value="ServiceDate">ServiceDate</option>
                      <option value="DriverLicense">DriverLicense</option>
                      <option value="FinancialDigest">FinancialDigest</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Severity
                    </label>
                    <select
                      value={customAlertForm.severity}
                      onChange={(e) =>
                        setCustomAlertForm({
                          ...customAlertForm,
                          severity: e.target.value as NotificationSeverity,
                        })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="WARNING">WARNING</option>
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="INFO">INFO</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Target Vehicle / Driver Label
                  </label>
                  <input
                    type="text"
                    required
                    value={customAlertForm.targetLabel}
                    onChange={(e) =>
                      setCustomAlertForm({
                        ...customAlertForm,
                        targetLabel: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Alert Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., TN38AB1234 — Renew State Permit Token"
                    value={customAlertForm.title}
                    onChange={(e) =>
                      setCustomAlertForm({
                        ...customAlertForm,
                        title: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Detailed Message *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Describe the required compliance or workshop action..."
                    value={customAlertForm.message}
                    onChange={(e) =>
                      setCustomAlertForm({
                        ...customAlertForm,
                        message: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCustomAlertModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                  >
                    Save Notification Log
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & OAuth Connection Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Google Drive Cloud Backup, Folder Sync &amp; Restore Vault
          </h2>
          <p className="text-sm text-slate-500">
            Target backup destination:{' '}
            <span className="font-mono font-semibold text-slate-800">
              {targetEmail}
            </span>{' '}
            · OAuth Scope:{' '}
            <span className="font-mono text-xs text-teal-700">
              {SCOPES[0]}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={driveBusy}
            onClick={handleConnectGoogleDrive}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 shadow-xs"
          >
            <HardDrive className="w-4 h-4" />
            {driveToken
              ? `Reconnect Google Drive (${connectedDriveEmail || targetEmail})`
              : 'Connect & Authorize Google Drive'}
          </button>

          {driveToken && (
            <button
              type="button"
              disabled={driveBusy}
              onClick={() => refreshDriveVault(driveToken)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Refresh Drive Folder
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadStructuredBackupJson}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download Local JSON
          </button>

          <input
            ref={localRestoreInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleLocalRestoreFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => localRestoreInputRef.current?.click()}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Restore from Local JSON
          </button>
        </div>
      </div>

      {/* Status & Error Banners */}
      {driveStatusMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-3 text-xs text-emerald-900">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{driveStatusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setDriveStatusMsg(null)}
            className="text-emerald-700 hover:text-emerald-950"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {driveErrorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between gap-3 text-xs text-red-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Google Drive Operation Notice</p>
              <p className="mt-0.5">{driveErrorMsg}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDriveErrorMsg(null)}
            className="text-red-700 hover:text-red-950"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Snapshot Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500 uppercase">
            OAuth Vault Status
          </p>
          <p
            className={`text-sm font-mono font-bold mt-1 ${
              driveToken ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {driveToken ? 'AUTHORIZED (drive.file)' : 'AWAITING TOKEN'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {connectedDriveEmail || targetEmail}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500 uppercase">
            Vehicles &amp; Drivers
          </p>
          <p className="text-lg font-mono font-bold text-slate-900 mt-1">
            {currentSnapshot.summaryCounts.vehicles} /{' '}
            {currentSnapshot.summaryCounts.drivers}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Active &amp; archived roster
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500 uppercase">
            15-Col Shift Logs
          </p>
          <p className="text-lg font-mono font-bold text-slate-900 mt-1">
            {currentSnapshot.summaryCounts.dailyLogbookEntries}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {formatKm(currentSnapshot.financialSummary.totalKmDriven)} logged
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500 uppercase">
            Service &amp; Compliance
          </p>
          <p className="text-lg font-mono font-bold text-slate-900 mt-1">
            {currentSnapshot.summaryCounts.serviceRecords} /{' '}
            {currentSnapshot.summaryCounts.complianceDocuments}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Workshop &amp; statutory docs
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500 uppercase">
            Driver Share Separated
          </p>
          <p className="text-lg font-mono font-bold text-amber-700 mt-1">
            {formatINR(currentSnapshot.financialSummary.driverShareSeparatedInr)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Excluded from Total Expenses
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500 uppercase">
            Net Logbook Profit
          </p>
          <p className="text-lg font-mono font-bold text-teal-700 mt-1">
            {formatINR(currentSnapshot.financialSummary.netLogbookEarningsInr)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            IST: {currentSnapshot.generatedAtKolkata}
          </p>
        </div>
      </div>

      {/* Main Two-Column Cloud Backup Control Panel & Drive File List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Cloud Upload Actions & Folder Metadata */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Google Drive Cloud Sync Actions
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Dedicated Drive Folder:{' '}
                <span className="font-mono font-semibold text-slate-800">
                  {FZEELOG_DRIVE_FOLDER_NAME}
                </span>
              </p>
            </div>
            <FolderSync className="w-5 h-5 text-teal-600 shrink-0" />
          </div>

          {driveFolder ? (
            <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-teal-950">
                  Active Drive Folder Connected
                </span>
                {driveFolder.webViewLink && (
                  <a
                    href={driveFolder.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-teal-700 hover:underline"
                  >
                    Open Folder in Drive ↗
                  </a>
                )}
              </div>
              <p className="font-mono text-[11px] text-teal-800">
                Folder ID: {driveFolder.id}
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              Click <strong>Connect &amp; Authorize Google Drive</strong> to
              verify or create the{' '}
              <span className="font-mono">{FZEELOG_DRIVE_FOLDER_NAME}</span>{' '}
              folder in <span className="font-mono">{targetEmail}</span>.
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              disabled={driveBusy}
              onClick={handleUploadNewSnapshotToDrive}
              className="w-full px-4 py-3 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <FolderSync className="w-4 h-4 text-teal-400" />
                Upload Full JSON Fleet Backup Snapshot to Drive
              </span>
              <span className="font-mono text-[11px] text-slate-300">
                v6.0 JSON
              </span>
            </button>

            <button
              type="button"
              disabled={driveBusy}
              onClick={handleUpload15ColCsvToDrive}
              className="w-full px-4 py-3 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                Upload 15-Column Daily Logbook CSV to Drive
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                {logbookEntries.length} rows
              </span>
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">
              Non-Destructive Cloud Safety Rules:
            </p>
            <p>
              • Uses the least-privilege{' '}
              <span className="font-mono">drive.file</span> OAuth scope so FzeeLog
              only accesses backup files it creates.
            </p>
            <p>
              • Overwriting, deleting, or restoring any snapshot requires explicit
              confirmation with full file details.
            </p>
          </div>
        </div>

        {/* Right Column: Cloud Backup Archive Vault List */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Google Drive Backup Vault ({driveFiles.length})
              </h3>
              <p className="text-xs text-slate-500">
                Snapshots and 15-column CSV exports stored in{' '}
                <span className="font-mono">{FZEELOG_DRIVE_FOLDER_NAME}</span>.
              </p>
            </div>
            {driveBusy && (
              <span className="text-xs font-mono text-teal-700">
                Syncing with Google Drive...
              </span>
            )}
          </div>

          {driveFiles.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-lg space-y-2">
              <HardDrive className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="font-medium text-slate-700">
                {driveToken
                  ? 'No backup archives found in your FzeeLog Google Drive folder yet.'
                  : 'Connect Google Drive to view and manage your cloud backup archives.'}
              </p>
              <p>
                Use &ldquo;Upload Full JSON Fleet Backup Snapshot to Drive&rdquo;
                to create your first cloud restore point.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {driveFiles.map((file) => {
                const isJson =
                  file.mimeType.includes('json') || file.name.endsWith('.json');
                const createdLabel = file.createdTime
                  ? new Date(file.createdTime).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Unknown Date';
                const sizeKb = file.size
                  ? `${Math.max(1, Math.round(Number(file.size) / 1024))} KB`
                  : '—';

                return (
                  <div
                    key={file.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isJson ? (
                          <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                        <span className="font-mono font-semibold text-slate-900 truncate">
                          {file.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Created: {createdLabel} IST · Size: {sizeKb} · ID:{' '}
                        {file.id.slice(0, 14)}...
                      </p>
                      {file.description && (
                        <p className="text-[11px] text-slate-600 line-clamp-1">
                          {file.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                        >
                          View in Drive ↗
                        </a>
                      )}
                      {isJson && (
                        <>
                          <button
                            type="button"
                            disabled={driveBusy}
                            onClick={() => handleInspectDriveFileForRestore(file)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                          >
                            Inspect &amp; Restore
                          </button>
                          <button
                            type="button"
                            disabled={driveBusy}
                            onClick={() => setFilePendingOverwrite(file)}
                            className="px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
                          >
                            Overwrite
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={driveBusy}
                        onClick={() => setFilePendingDelete(file)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                        title="Delete from Google Drive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal 1: Delete Backup File from Google Drive */}
      {filePendingDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold">
                  Confirm Google Drive File Deletion
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFilePendingDelete(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Are you sure you want to permanently delete this backup file from
                your Google Drive folder?
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono space-y-1 text-slate-800">
                <p>
                  <strong>File Name:</strong> {filePendingDelete.name}
                </p>
                <p>
                  <strong>Drive File ID:</strong> {filePendingDelete.id}
                </p>
                <p>
                  <strong>MIME Type:</strong> {filePendingDelete.mimeType}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFilePendingDelete(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={driveBusy}
                onClick={handleConfirmDeleteDriveFile}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {driveBusy ? 'Deleting...' : 'Confirm Delete from Drive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal 2: Overwrite Existing Google Drive Backup */}
      {filePendingOverwrite && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold">
                  Confirm Overwrite of Drive Backup
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFilePendingOverwrite(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                This will overwrite the existing Google Drive file with your
                current fleet state ({currentSnapshot.summaryCounts.vehicles}{' '}
                vehicles, {currentSnapshot.summaryCounts.dailyLogbookEntries}{' '}
                shift logs).
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono space-y-1 text-slate-800">
                <p>
                  <strong>Target File:</strong> {filePendingOverwrite.name}
                </p>
                <p>
                  <strong>Drive File ID:</strong> {filePendingOverwrite.id}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFilePendingOverwrite(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={driveBusy}
                onClick={handleConfirmOverwriteSnapshot}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {driveBusy ? 'Overwriting...' : 'Confirm Overwrite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal 3: Inspect & Restore Fleet Backup Snapshot */}
      {restorePreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Inspect &amp; Confirm Fleet Snapshot Restore
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {restorePreview.sourceLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRestorePreview(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!restorePreview.parsed.valid ? (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
                <p className="font-semibold">Invalid Backup Snapshot</p>
                {restorePreview.parsed.errors.map((err, i) => (
                  <p key={i}>• {err}</p>
                ))}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <p>
                    <strong>Business Name:</strong>{' '}
                    {restorePreview.parsed.businessName}
                  </p>
                  <p>
                    <strong>Snapshot Timestamp:</strong>{' '}
                    <span className="font-mono">
                      {restorePreview.parsed.generatedAt}
                    </span>
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-mono">
                  <div className="p-2.5 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">
                      VEHICLES
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {restorePreview.parsed.vehicles.length}
                    </span>
                  </div>
                  <div className="p-2.5 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">
                      DRIVERS
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {restorePreview.parsed.drivers.length}
                    </span>
                  </div>
                  <div className="p-2.5 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">
                      LOGBOOK SHIFTS
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {restorePreview.parsed.dailyLogbookEntries.length}
                    </span>
                  </div>
                  <div className="p-2.5 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">
                      SERVICE RECORDS
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {restorePreview.parsed.serviceRecords.length}
                    </span>
                  </div>
                  <div className="p-2.5 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">
                      COMPLIANCE DOCS
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {restorePreview.parsed.complianceDocuments.length}
                    </span>
                  </div>
                </div>

                <p className="text-slate-600">
                  Confirming this action will upsert these records into your
                  active {isDemoMode ? 'Demo Workspace' : 'Firestore Database'}{' '}
                  and log a <span className="font-mono">BACKUP_SNAPSHOT_RESTORED</span>{' '}
                  audit event.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestorePreview(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              {restorePreview.parsed.valid && (
                <button
                  type="button"
                  disabled={restoringBusy}
                  onClick={handleExecuteConfirmedRestore}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {restoringBusy
                    ? 'Restoring Records...'
                    : 'Confirm & Restore Fleet Snapshot'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SettingsAndSetupView: React.FC = () => {
  const {
    profile,
    vehicles,
    drivers,
    logbookEntries,
    serviceRecords,
    complianceDocuments,
    auditLogs,
    organizationMembers,
    activeOrgMember,
    setActiveOrgMember,
    saveOrganizationMember,
    deleteOrganizationMember,
    updateProfileConfig,
  } = useFleet();
  const supabaseStatus = getSupabaseEnvironmentStatus();

  const [accountMode, setAccountMode] = useState<AccountMode>(
    profile?.accountMode || 'Organization'
  );
  const [fullName, setFullName] = useState(
    profile?.fullName || profile?.displayName || ''
  );
  const [businessName, setBusinessName] = useState(
    profile?.businessName || 'FzeeLog Fleet Operations'
  );
  const [alertEmail, setAlertEmail] = useState(
    profile?.alertEmail || ''
  );
  const [whatsappNumber, setWhatsappNumber] = useState(
    profile?.whatsappNumber || ''
  );
  const [defaultDriverSharePct, setDefaultDriverSharePct] = useState(
    profile?.defaultDriverSharePct ?? 30
  );
  const [intendedDriveEmail, setIntendedDriveEmail] = useState(
    profile?.intendedDriveEmail ||
      profile?.intendedGoogleDriveEmail ||
      ''
  );
  const [expiryWarningDays, setExpiryWarningDays] = useState(
    profile?.expiryWarningDays ?? profile?.expiryAlertDays ?? 30
  );
  const [serviceWarningKm, setServiceWarningKm] = useState(
    profile?.serviceWarningKm ?? 1000
  );
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('ALL');

  // Organization Multi-User Member Form State
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberWhatsapp, setNewMemberWhatsapp] = useState('');
  const [newMemberRole, setNewMemberRole] =
    useState<OrgMemberRole>('FleetManager');
  const [newMemberPin, setNewMemberPin] = useState('');

  useEffect(() => {
    if (profile) {
      setAccountMode(profile.accountMode || 'Organization');
      setFullName(profile.fullName || profile.displayName || '');
      setBusinessName(profile.businessName);
      setAlertEmail(profile.alertEmail || '');
      setWhatsappNumber(profile.whatsappNumber || '');
      setDefaultDriverSharePct(profile.defaultDriverSharePct);
      setIntendedDriveEmail(
        profile.intendedDriveEmail ||
          profile.intendedGoogleDriveEmail ||
          ''
      );
      setExpiryWarningDays(
        profile.expiryWarningDays ?? profile.expiryAlertDays ?? 30
      );
      setServiceWarningKm(profile.serviceWarningKm ?? 1000);
    }
  }, [profile]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfileConfig({
      accountMode,
      organizationName: businessName,
      fullName,
      businessName,
      alertEmail,
      whatsappNumber,
      alertMilestonesDays: [10, 5, 1],
      defaultDriverSharePct,
      intendedDriveEmail,
      expiryWarningDays,
      serviceWarningKm,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleAddOrgMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;
    if (!newMemberPin.trim()) return;
    await saveOrganizationMember({
      organizationName: businessName,
      fullName: newMemberName.trim(),
      email: newMemberEmail.trim(),
      whatsappNumber: newMemberWhatsapp.trim(),
      role: newMemberRole,
      accessPin: newMemberPin.trim(),
      status: 'Active',
      lastLoginAt: new Date().toISOString(),
    });
    setNewMemberName('');
    setNewMemberEmail('');
    setNewMemberPin('');
  };

  const copyMigrationNote = () => {
    navigator.clipboard.writeText(
      `-- Apply supabase/migrations/001_phase1_schema.sql through 006_phase6_drive_backup_sync.sql in your Supabase SQL Editor\n-- Required Env Vars:\nVITE_SUPABASE_URL="https://<your-project-ref>.supabase.co"\nVITE_SUPABASE_ANON_KEY="<your-anon-publishable-key>"`
    );
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Live Formula & Odometer Integrity Self-Check across all loaded logbook entries
  const integrityDiagnostics = useMemo(() => {
    let formulaVerifiedCount = 0;
    let odometerProgressionValidCount = 0;
    for (const e of logbookEntries) {
      const expectedKm = roundKm(
        (Number(e.endingKm) || 0) - (Number(e.startingKm) || 0)
      );
      const expectedExpenses = roundCurrency(
        (Number(e.gasFuel) || 0) +
          (Number(e.redTaxi) || 0) +
          (Number(e.toll) || 0) +
          (Number(e.maintenance) || 0)
      );
      const expectedNet = roundCurrency(
        (Number(e.earnings) || 0) -
          (Number(e.driverShare) || 0) -
          expectedExpenses
      );
      if (
        Math.abs((Number(e.kmDay) || 0) - expectedKm) <= 0.1 &&
        Math.abs((Number(e.totalExpenses) || 0) - expectedExpenses) <= 0.05 &&
        Math.abs((Number(e.netBusinessEarnings) || 0) - expectedNet) <= 0.05
      ) {
        formulaVerifiedCount++;
      }
      if ((Number(e.endingKm) || 0) >= (Number(e.startingKm) || 0)) {
        odometerProgressionValidCount++;
      }
    }
    return {
      totalEntries: logbookEntries.length,
      formulaVerifiedCount,
      odometerProgressionValidCount,
      allHealthy:
        formulaVerifiedCount === logbookEntries.length &&
        odometerProgressionValidCount === logbookEntries.length,
    };
  }, [logbookEntries]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((item) => {
      if (
        auditEntityFilter !== 'ALL' &&
        item.entityType !== auditEntityFilter
      ) {
        return false;
      }
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        const hay =
          `${item.action} ${item.entityType} ${item.entityId} ${item.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, auditEntityFilter, auditSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Organization / Individual Setup, Multi-User Directory &amp; Alert Configuration
        </h2>
        <p className="text-sm text-slate-500">
          Switch between Organization (multi-user login) and Individual mode, configure Email &amp; WhatsApp 10d/5d/1d expiry alerts, and inspect audit logs.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
            01. Account Mode, Email &amp; WhatsApp Expiry Alert Setup
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Account Usage Mode (Organization vs Individual)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Organization', 'Individual'] as AccountMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAccountMode(m)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                      accountMode === m
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {m === 'Organization' ? (
                      <Building2 className="w-3.5 h-3.5 text-teal-400" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                    )}
                    {m === 'Organization'
                      ? 'Organization (Multi-User)'
                      : 'Individual Use'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Owner / Operator Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {accountMode === 'Organization'
                    ? 'Organization / Fleet Name'
                    : 'Personal Fleet Label'}
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expiry Alert E-Mail ID (10d, 5d, 1d)
                </label>
                <input
                  type="email"
                  required
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expiry Alert WhatsApp Number (10d, 5d, 1d)
                </label>
                <input
                  type="tel"
                  required
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Default Driver Share (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={defaultDriverSharePct}
                  onChange={(e) =>
                    setDefaultDriverSharePct(Number(e.target.value))
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expiry Alert Window (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={expiryWarningDays}
                  onChange={(e) => setExpiryWarningDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Service Reminder (km)
                </label>
                <input
                  type="number"
                  min={100}
                  max={20000}
                  step={100}
                  value={serviceWarningKm}
                  onChange={(e) => setServiceWarningKm(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Intended Google Drive Backup Account
              </label>
              <input
                type="email"
                value={intendedDriveEmail}
                onChange={(e) => setIntendedDriveEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Milestones: 10d, 5d, 1d · INR (₹) · Asia/Kolkata
            </span>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {savedNotice ? 'Configuration Saved' : 'Save Configuration'}
            </button>
          </div>
        </form>

        {/* Organization Multi-User Login & Team Directory */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                01B. Organization Multi-User Login Directory ({organizationMembers.length} Users)
              </h3>
              <p className="text-xs text-slate-500">
                Manage multiple user logins for your organization and switch active operator sessions.
              </p>
            </div>
            <Users className="w-4 h-4 text-teal-600" />
          </div>

          <form
            onSubmit={handleAddOrgMember}
            className="grid grid-cols-1 sm:grid-cols-6 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs"
          >
            <input
              type="text"
              required
              placeholder="User Full Name"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            />
            <input
              type="email"
              required
              placeholder="Email ID"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              className="sm:col-span-2 px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white"
            />
            <select
              value={newMemberRole}
              onChange={(e) =>
                setNewMemberRole(e.target.value as OrgMemberRole)
              }
              className="px-2 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="OrgAdmin">OrgAdmin</option>
              <option value="FleetManager">FleetManager</option>
              <option value="Accountant">Accountant</option>
              <option value="Dispatcher">Dispatcher</option>
              <option value="DriverViewer">DriverViewer</option>
            </select>
            <div className="flex items-center gap-1">
              <input
                type="password"
                required
                minLength={4}
                maxLength={16}
                placeholder="PIN"
                value={newMemberPin}
                onChange={(e) => setNewMemberPin(e.target.value)}
                className="w-14 px-2 py-1.5 font-mono border border-slate-300 rounded bg-white"
              />
              <button
                type="submit"
                className="flex-1 px-2.5 py-1.5 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </form>

          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto text-xs">
            {organizationMembers.map((member) => {
              const isCurrent = activeOrgMember?.id === member.id;
              return (
                <div
                  key={member.id}
                  className="py-2.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {member.fullName}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-slate-100 text-slate-800 rounded">
                        {member.role}
                      </span>
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-teal-50 text-teal-800 border border-teal-200 rounded">
                          ACTIVE LOGIN
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {member.email} · WA: {member.whatsappNumber} · PIN: ••••
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveOrgMember(member)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded ${
                        isCurrent
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {isCurrent ? 'Logged In' : 'Switch User'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteOrganizationMember(member)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Remove Organization User"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-base font-semibold text-slate-900">
              02. Database, OAuth &amp; Formula Integrity Diagnostics
            </h3>
            <Database className="w-4 h-4 text-teal-600" />
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-lg space-y-1">
              <p className="font-semibold text-teal-900">
                Active Cloud Persistence: Firebase Cloud Firestore + Google OAuth
              </p>
              <p className="text-teal-800 font-mono text-[11px]">
                Project: {FIREBASE_PROJECT_ID} · DB:{' '}
                {FIRESTORE_DATABASE_ID.slice(0, 24)}...
              </p>
              <p className="text-teal-700">
                Hardened Zero-Trust Security Rules deployed across profiles, vehicles ({vehicles.length}), drivers ({drivers.length}), daily_logbook_entries ({logbookEntries.length}), service_records ({serviceRecords.length}), compliance_documents ({complianceDocuments.length}), vehicle_media, notification_logs, and audit_logs.
              </p>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-950">
                  15-Column Financial &amp; Odometer Formula Verification
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  {integrityDiagnostics.allHealthy ? '100% PASS' : 'CHECK LOGS'}
                </span>
              </div>
              <p className="text-emerald-800 font-mono text-[11px]">
                Verified {integrityDiagnostics.formulaVerifiedCount}/
                {integrityDiagnostics.totalEntries} shifts (Driver Share
                separated from Total Expenses; Ending KM ≥ Starting KM:{' '}
                {integrityDiagnostics.odometerProgressionValidCount}/
                {integrityDiagnostics.totalEntries}).
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  External Supabase PostgreSQL Environment Check
                </span>
                <span
                  className={`font-mono font-semibold ${
                    supabaseStatus.isConfigured
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {supabaseStatus.isConfigured
                    ? 'CONFIGURED'
                    : 'MISSING ENV SETTINGS'}
                </span>
              </div>

              {!supabaseStatus.isConfigured && (
                <div className="text-slate-600 space-y-1">
                  <p>
                    The following optional Supabase environment variables are not set in this runtime:
                  </p>
                  <ul className="list-disc list-inside font-mono text-amber-800">
                    {supabaseStatus.missingVariables.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                  <p className="pt-1 text-slate-500">
                    PostgreSQL DDL migrations &amp; RLS policies are ready in{' '}
                    <span className="font-mono text-slate-800">
                      001_phase1_schema.sql
                    </span>{' '}
                    through{' '}
                    <span className="font-mono text-slate-800">
                      006_phase6_drive_backup_sync.sql
                    </span>
                    .
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={copyMigrationNote}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedSql
                  ? 'Copied Supabase Env Template'
                  : 'Copy Supabase Env Template'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 03: Immutable Operations Audit Trail Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              03. Immutable Operations Audit Ledger ({filteredAuditLogs.length})
            </h3>
            <p className="text-xs text-slate-500">
              Every create, update, archive, odometer sync, and backup restore operation is recorded with an Asia/Kolkata timestamp.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search action or summary..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <select
              value={auditEntityFilter}
              onChange={(e) => setAuditEntityFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Entities</option>
              <option value="Vehicle">Vehicle</option>
              <option value="Driver">Driver</option>
              <option value="DailyLogbookEntry">DailyLogbookEntry</option>
              <option value="ServiceRecord">ServiceRecord</option>
              <option value="ComplianceDocument">ComplianceDocument</option>
              <option value="VehicleMedia">VehicleMedia</option>
              <option value="NotificationLog">NotificationLog</option>
              <option value="Profile">Profile</option>
            </select>
          </div>
        </div>

        {filteredAuditLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200/70">
            No audit events recorded matching your filter criteria yet. Perform any create, edit, or backup action to populate the ledger.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase bg-slate-50">
                  <th className="py-2.5 px-3">Timestamp (IST)</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity</th>
                  <th className="py-2.5 px-3">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-teal-800 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {log.entityType}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {log.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};



