import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import { AttendanceStatus, DailyLogbookEntry } from '../types/fleet';
import {
  aggregateLogbookByPeriod,
  calculateLogbookFinancials,
  resolveCalculationOptions,
  formatINR,
  formatKm,
  getTodayKolkataDate,
  parseLogbookCsvImport,
  roundCurrency,
  roundKm,
  validateLogbookEntryInput,
} from '../lib/calculations';
import { generateLogbookPdfReport } from '../lib/pdfExport';

type SortField =
  | 'entryDate'
  | 'kmDay'
  | 'earnings'
  | 'unitPrice'
  | 'driverShare'
  | 'totalExpenses'
  | 'netBusinessEarnings';

type LogbookTabMode = 'shifts' | 'daily-summary' | 'monthly-summary';

const DEFAULT_15_COL_HEADERS = {
  sno: '1. S.NO',
  date: '2. Date',
  startingKm: '3. Starting KM',
  endingKm: '4. Ending KM',
  kmDay: '5. KM/DAY',
  attendance: '6. Attendance',
  earnings: '7. Earnings',
  unitPrice: '8. Unit Price',
  driverShare: '9. Driver Share',
  gasFuel: '10. Gas/Fuel',
  redTaxi: '11. Red Taxi',
  toll: '12. Toll',
  maintenance: '13. Maintenance',
  totalExpenses: '14. Total Expenses',
  sourceRemarks: '15. Source/Remarks',
  netBusinessEarnings: 'Net Earnings',
};

export const LogbookView: React.FC<{
  initialVehicleFilter?: string;
}> = ({ initialVehicleFilter = 'ALL' }) => {
  const {
    profile,
    vehicles,
    drivers,
    logbookEntries,
    isDemoMode,
    updateProfileConfig,
    saveLogbookEntry,
    importLogbookEntries,
    deleteLogbookEntry,
    saveNotificationLog,
  } = useFleet();

  const defaultSharePct = profile?.defaultDriverSharePct ?? 30;

  // Sub-tab mode: 15-Column Shifts (default) | Daily Summaries | Monthly Summaries
  const [tabMode, setTabMode] = useState<LogbookTabMode>('shifts');
  const [customizeColsOpen, setCustomizeColsOpen] = useState(false);
  const [colHeaders, setColHeaders] = useState({
    ...DEFAULT_15_COL_HEADERS,
    ...(profile?.customLogbookHeaders || {}),
  });

  // Quick Test Mail & WhatsApp Alert state inside default Logbook view
  const [quickTestBusy, setQuickTestBusy] = useState<
    'Email' | 'WhatsApp' | 'Both' | null
  >(null);
  const [quickTestBanner, setQuickTestBanner] = useState<{
    message: string;
    waMeLink?: string;
    mailtoLink?: string;
  } | null>(null);

  const handleQuickTestAlert = async (
    channel: 'Email' | 'WhatsApp' | 'Both'
  ) => {
    setQuickTestBusy(channel);
    setQuickTestBanner(null);
    try {
      const targetEmail = profile?.alertEmail || '';
      const targetWa = profile?.whatsappNumber || '';
      const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(targetEmail);
      if ((channel === 'Email' || channel === 'Both') && !emailOk) {
        setQuickTestBanner({
          message:
            'Set a valid Alert E-Mail in Settings before sending a test mail.',
        });
        return;
      }
      if ((channel === 'WhatsApp' || channel === 'Both') && !targetWa) {
        setQuickTestBanner({
          message:
            'Set a WhatsApp number in Settings before sending a test alert.',
        });
        return;
      }
      const res = await fetch('/api/notifications/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          recipientEmail: targetEmail,
          whatsappNumber: targetWa,
          businessName: profile?.businessName || 'FzeeLog Fleet Operations',
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || 'Test dispatch failed');
      }
      const data = await res.json();

      if (channel === 'Email' || channel === 'Both') {
        await saveNotificationLog({
          alertType: 'StatutoryExpiry',
          severity: 'WARNING',
          targetLabel: `Email Test → ${targetEmail}`,
          title: `Test Expiry Alert Mail Dispatched to ${targetEmail}`,
          message: `10d/5d/1d statutory expiry alert test (Insurance, FC, Permit, Driver Licence, Pollution) sent to ${targetEmail}.`,
          recipientEmail: targetEmail,
          channel: 'EmailDigest',
          status: 'Dispatched',
        });
      }
      if (channel === 'WhatsApp' || channel === 'Both') {
        await saveNotificationLog({
          alertType: 'StatutoryExpiry',
          severity: 'WARNING',
          targetLabel: `WhatsApp Test → +91 ${targetWa}`,
          title: `Test WhatsApp Expiry Alert Dispatched to ${targetWa}`,
          message: `10d/5d/1d statutory expiry alert test (Insurance, FC, Permit, Driver Licence, Pollution) sent to WhatsApp ${targetWa}.`,
          recipientEmail: targetEmail,
          channel: 'WhatsApp',
          status: 'Dispatched',
        });
      }

      setQuickTestBanner({
        message: `Test ${channel} Expiry Alert (10d, 5d, 1d — Insurance, FC, Permit, Driver Licence, Pollution) dispatched to ${targetEmail} & WhatsApp ${targetWa} at ${data.generatedAtKolkata} IST.`,
        waMeLink: data.whatsappPayload?.waMeLink,
        mailtoLink: data.emailPayload
          ? `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(
              data.emailPayload.subject
            )}&body=${encodeURIComponent(data.emailPayload.bodyText)}`
          : undefined,
      });
    } catch (err: any) {
      setQuickTestBanner({
        message: `Test ${channel} dispatch failed: ${
          err?.message || 'unexpected error'
        }`,
      });
    } finally {
      setQuickTestBusy(null);
    }
  };

  // Inline quick-edit row state for editing directly inside the 15-Column Ledger
  const [inlineRowId, setInlineRowId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<{
    startingKm: number;
    endingKm: number;
    attendance: AttendanceStatus;
    earnings: number;
    driverSharePct: number;
    gasFuel: number;
    redTaxi: number;
    toll: number;
    maintenance: number;
    sourceRemarks: string;
  } | null>(null);

  const startInlineEdit = (entry: DailyLogbookEntry) => {
    setInlineRowId(entry.id);
    setInlineDraft({
      startingKm: entry.startingKm,
      endingKm: entry.endingKm,
      attendance: entry.attendance,
      earnings: entry.earnings,
      driverSharePct: entry.driverSharePct,
      gasFuel: entry.gasFuel,
      redTaxi: entry.redTaxi,
      toll: entry.toll,
      maintenance: entry.maintenance,
      sourceRemarks: entry.sourceRemarks || '',
    });
  };

  const handleSaveInlineEdit = async (entry: DailyLogbookEntry) => {
    if (!inlineDraft) return;
    if (inlineDraft.endingKm < inlineDraft.startingKm) return;
    await saveLogbookEntry(
      {
        ...entry,
        ...inlineDraft,
        entryDate: entry.entryDate || entry.date,
      },
      entry.id
    );
    setInlineRowId(null);
    setInlineDraft(null);
  };

  const handleSaveCustomHeaders = async () => {
    await updateProfileConfig({
      customLogbookHeaders: colHeaders,
    });
    setCustomizeColsOpen(false);
  };

  // Filter states
  const [vehicleFilter, setVehicleFilter] =
    useState<string>(initialVehicleFilter);
  const [driverFilter, setDriverFilter] = useState<string>('ALL');
  const [attendanceFilter, setAttendanceFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sorting & Pagination states
  const [sortField, setSortField] = useState<SortField>('entryDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    if (initialVehicleFilter) {
      setVehicleFilter(initialVehicleFilter);
    }
  }, [initialVehicleFilter]);

  // Reset pagination to page 1 when filters/search/sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    vehicleFilter,
    driverFilter,
    attendanceFilter,
    dateFrom,
    dateTo,
    searchQuery,
    sortField,
    sortDir,
    pageSize,
  ]);

  // Add/Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DailyLogbookEntry | null>(
    null
  );
  const [deleteConfirmEntry, setDeleteConfirmEntry] =
    useState<DailyLogbookEntry | null>(null);

  // CSV / Spreadsheet Import Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(
    null
  );

  const [formState, setFormState] = useState({
    vehicleId: '',
    driverId: '',
    entryDate: getTodayKolkataDate(),
    shiftNumber: 1,
    startingKm: 0,
    endingKm: 0,
    attendance: 'Present' as AttendanceStatus,
    earnings: 0,
    driverSharePct: defaultSharePct,
    manualUnitPrice: 0,
    manualDriverShare: 0,
    odometerCorrectionReason: '',
    gasFuel: 0,
    redTaxi: 0,
    toll: 0,
    maintenance: 0,
    otherExpenses: 0,
    sourceRemarks: '',
  });
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formWarnings, setFormWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const calcOptions = useMemo(
    () => resolveCalculationOptions(profile),
    [profile]
  );

  const liveCalc = useMemo(
    () =>
      calculateLogbookFinancials(
        {
          startingKm: formState.startingKm,
          endingKm: formState.endingKm,
          earnings: formState.earnings,
          driverSharePct: formState.driverSharePct,
          gasFuel: formState.gasFuel,
          redTaxi: formState.redTaxi,
          toll: formState.toll,
          maintenance: formState.maintenance,
          otherExpenses: formState.otherExpenses,
        },
        {
          ...calcOptions,
          manualUnitPrice: Number(formState.manualUnitPrice) || 0,
          manualDriverShare: Number(formState.manualDriverShare) || 0,
        }
      ),
    [formState, calcOptions]
  );

  const filteredAndSortedEntries = useMemo(() => {
    const filtered = logbookEntries.filter((e) => {
      const eDate = e.entryDate || e.date || '';
      if (vehicleFilter !== 'ALL' && e.vehicleId !== vehicleFilter) return false;
      if (driverFilter !== 'ALL' && e.driverId !== driverFilter) return false;
      if (attendanceFilter !== 'ALL' && e.attendance !== attendanceFilter)
        return false;
      if (dateFrom && eDate < dateFrom) return false;
      if (dateTo && eDate > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${e.vehicleRegNo || e.vehicleRegistration} ${e.driverName} ${e.sourceRemarks} ${eDate} ${e.attendance}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'entryDate') {
        const aDate = a.entryDate || a.date || '';
        const bDate = b.entryDate || b.date || '';
        cmp = aDate.localeCompare(bDate);
        if (cmp === 0) cmp = a.shiftNumber - b.shiftNumber;
      } else {
        cmp = (a[sortField] as number) - (b[sortField] as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [
    logbookEntries,
    vehicleFilter,
    driverFilter,
    attendanceFilter,
    dateFrom,
    dateTo,
    searchQuery,
    sortField,
    sortDir,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedEntries.length / pageSize)
  );
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEntries = useMemo(() => {
    const startIdx = (safePage - 1) * pageSize;
    return filteredAndSortedEntries.slice(startIdx, startIdx + pageSize);
  }, [filteredAndSortedEntries, safePage, pageSize]);

  const dailySummaryRows = useMemo(
    () => aggregateLogbookByPeriod(filteredAndSortedEntries, 'daily'),
    [filteredAndSortedEntries]
  );

  const monthlySummaryRows = useMemo(
    () => aggregateLogbookByPeriod(filteredAndSortedEntries, 'monthly'),
    [filteredAndSortedEntries]
  );

  const summaryTotals = useMemo(() => {
    return filteredAndSortedEntries.reduce(
      (acc, e) => {
        acc.kmDay = roundKm(acc.kmDay + e.kmDay);
        acc.earnings = roundCurrency(acc.earnings + e.earnings);
        acc.driverShare = roundCurrency(acc.driverShare + e.driverShare);
        acc.gasFuel = roundCurrency(acc.gasFuel + e.gasFuel);
        acc.redTaxi = roundCurrency(acc.redTaxi + e.redTaxi);
        acc.toll = roundCurrency(acc.toll + e.toll);
        acc.maintenance = roundCurrency(acc.maintenance + e.maintenance);
        acc.otherExpenses = roundCurrency(acc.otherExpenses + e.otherExpenses);
        acc.totalExpenses = roundCurrency(acc.totalExpenses + e.totalExpenses);
        acc.netBusinessEarnings = roundCurrency(
          acc.netBusinessEarnings + e.netBusinessEarnings
        );
        return acc;
      },
      {
        kmDay: 0,
        earnings: 0,
        driverShare: 0,
        gasFuel: 0,
        redTaxi: 0,
        toll: 0,
        maintenance: 0,
        otherExpenses: 0,
        totalExpenses: 0,
        netBusinessEarnings: 0,
      }
    );
  }, [filteredAndSortedEntries]);

  const parsedImportRows = useMemo(() => {
    if (!csvRawText.trim()) return [];
    return parseLogbookCsvImport(
      csvRawText,
      vehicles,
      drivers,
      logbookEntries,
      defaultSharePct
    );
  }, [csvRawText, vehicles, drivers, logbookEntries, defaultSharePct]);

  const validImportRows = useMemo(
    () => parsedImportRows.filter((r) => r.valid),
    [parsedImportRows]
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const applyDatePreset = (preset: 'today' | '7d' | 'month' | 'all') => {
    const todayStr = getTodayKolkataDate();
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
      return;
    }
    if (preset === 'month') {
      setDateFrom(`${todayStr.slice(0, 7)}-01`);
      setDateTo(todayStr);
      return;
    }
    if (preset === '7d') {
      const dt = new Date(`${todayStr}T00:00:00+05:30`);
      dt.setDate(dt.getDate() - 6);
      setDateFrom(dt.toISOString().slice(0, 10));
      setDateTo(todayStr);
    }
  };

  const openAddModal = () => {
    const activeVehicles = vehicles.filter((v) => v.status !== 'Archived');
    const firstVeh = activeVehicles[0];
    const assignedDriver = drivers.find(
      (d) => d.id === firstVeh?.assignedDriverId
    );

    setEditingEntry(null);
    setFormState({
      vehicleId: firstVeh?.id || '',
      driverId: firstVeh?.assignedDriverId || '',
      entryDate: getTodayKolkataDate(),
      shiftNumber: 1,
      startingKm: firstVeh?.currentOdometerKm || 0,
      endingKm: firstVeh?.currentOdometerKm || 0,
      attendance: 'Present',
      earnings: 0,
      driverSharePct: assignedDriver?.defaultSharePct ?? defaultSharePct,
      manualUnitPrice: 0,
      manualDriverShare: 0,
      odometerCorrectionReason: '',
      gasFuel: 0,
      redTaxi: 0,
      toll: 0,
      maintenance: 0,
      otherExpenses: 0,
      sourceRemarks: '',
    });
    setFormErrors([]);
    setFormWarnings([]);
    setModalOpen(true);
  };

  const openEditModal = (entry: DailyLogbookEntry) => {
    setEditingEntry(entry);
    setFormState({
      vehicleId: entry.vehicleId,
      driverId: entry.driverId,
      entryDate: entry.entryDate || entry.date || '',
      shiftNumber: entry.shiftNumber,
      startingKm: entry.startingKm,
      endingKm: entry.endingKm,
      attendance: entry.attendance,
      earnings: entry.earnings,
      driverSharePct: entry.driverSharePct,
      manualUnitPrice: 0,
      manualDriverShare: 0,
      odometerCorrectionReason: entry.odometerCorrectionReason || '',
      gasFuel: entry.gasFuel,
      redTaxi: entry.redTaxi,
      toll: entry.toll,
      maintenance: entry.maintenance,
      otherExpenses: entry.otherExpenses,
      sourceRemarks: entry.sourceRemarks,
    });
    setFormErrors([]);
    setFormWarnings([]);
    setModalOpen(true);
  };

  const handleVehicleChangeInForm = (newVehicleId: string) => {
    const veh = vehicles.find((v) => v.id === newVehicleId);
    const drv = drivers.find((d) => d.id === veh?.assignedDriverId);
    setFormState((prev) => ({
      ...prev,
      vehicleId: newVehicleId,
      driverId: veh?.assignedDriverId || prev.driverId,
      startingKm: veh ? veh.currentOdometerKm : prev.startingKm,
      endingKm: veh ? veh.currentOdometerKm : prev.endingKm,
      driverSharePct: drv?.defaultSharePct ?? prev.driverSharePct,
    }));
  };

  const handleDriverChangeInForm = (newDriverId: string) => {
    const drv = drivers.find((d) => d.id === newDriverId);
    setFormState((prev) => ({
      ...prev,
      driverId: newDriverId,
      driverSharePct: drv ? drv.defaultSharePct : prev.driverSharePct,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedVeh = vehicles.find((v) => v.id === formState.vehicleId);
    const selectedDrv = drivers.find((d) => d.id === formState.driverId);

    const validation = validateLogbookEntryInput(
      formState,
      logbookEntries,
      editingEntry?.id,
      selectedVeh?.currentOdometerKm
    );

    setFormWarnings(validation.warnings);
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }

    setSaving(true);
    setFormErrors([]);
    try {
      await saveLogbookEntry(
        {
          vehicleId: formState.vehicleId,
          vehicleRegNo: selectedVeh?.registrationNumber || 'UNKNOWN',
          driverId: formState.driverId,
          driverName:
            selectedDrv?.fullName ||
            selectedVeh?.assignedDriverName ||
            'Owner / Driver',
          entryDate: formState.entryDate,
          shiftNumber: formState.shiftNumber,
          startingKm: formState.startingKm,
          endingKm: formState.endingKm,
          attendance: formState.attendance,
          earnings: formState.earnings,
          driverSharePct: formState.driverSharePct,
          manualUnitPrice: formState.manualUnitPrice,
          manualDriverShare: formState.manualDriverShare,
          odometerCorrectionReason: formState.odometerCorrectionReason,
          gasFuel: formState.gasFuel,
          redTaxi: formState.redTaxi,
          toll: formState.toll,
          maintenance: formState.maintenance,
          otherExpenses: formState.otherExpenses,
          sourceRemarks: formState.sourceRemarks,
        },
        editingEntry?.id
      );
      setModalOpen(false);
    } catch (err: any) {
      setFormErrors([err?.message || 'Failed to save logbook entry.']);
    } finally {
      setSaving(false);
    }
  };

  const handleExportSpreadsheet = (format: 'csv' | 'xls') => {
    const sep = format === 'xls' ? '\t' : ',';
    const headers = [
      colHeaders.sno,
      colHeaders.date,
      'Vehicle Reg',
      'Shift',
      colHeaders.startingKm,
      colHeaders.endingKm,
      colHeaders.kmDay,
      colHeaders.attendance,
      `${colHeaders.earnings} (INR)`,
      `${colHeaders.unitPrice} (INR/km)`,
      `${colHeaders.driverShare} (INR)`,
      `${colHeaders.gasFuel} (INR)`,
      `${colHeaders.redTaxi} (INR)`,
      `${colHeaders.toll} (INR)`,
      `${colHeaders.maintenance} (INR)`,
      `${colHeaders.totalExpenses} (INR)`,
      'Net Business Earnings (INR)',
      colHeaders.sourceRemarks,
    ];
    const rows = filteredAndSortedEntries.map((e, idx) => [
      idx + 1,
      e.entryDate,
      format === 'csv' ? `"${e.vehicleRegNo}"` : e.vehicleRegNo,
      e.shiftNumber,
      e.startingKm,
      e.endingKm,
      e.kmDay,
      format === 'csv' ? `"${e.attendance}"` : e.attendance,
      e.earnings.toFixed(2),
      e.unitPrice.toFixed(2),
      e.driverShare.toFixed(2),
      e.gasFuel.toFixed(2),
      e.redTaxi.toFixed(2),
      e.toll.toFixed(2),
      e.maintenance.toFixed(2),
      e.totalExpenses.toFixed(2),
      e.netBusinessEarnings.toFixed(2),
      format === 'csv'
        ? `"${(e.sourceRemarks || '').replace(/"/g, '""')}"`
        : (e.sourceRemarks || '').replace(/\t/g, ' '),
    ]);

    const content = [headers.join(sep), ...rows.map((r) => r.join(sep))].join(
      '\n'
    );
    const mime =
      format === 'xls'
        ? 'application/vnd.ms-excel;charset=utf-8'
        : 'text/csv;charset=utf-8';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fzeelog-daily-logbook-${getTodayKolkataDate()}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadImportTemplate = () => {
    const sampleReg = vehicles[0]?.registrationNumber || 'TN-38-CZ-4512';
    const startKm = vehicles[0]?.currentOdometerKm || 54820;
    const endKm = startKm + 240;
    const template = [
      'Date,Vehicle Reg,Shift,Starting KM,Ending KM,Attendance,Earnings,Driver Share %,Gas/Fuel,Red Taxi,Toll,Maintenance,Other Expenses,Source/Remarks',
      `${getTodayKolkataDate()},${sampleReg},1,${startKm},${endKm},Present,4800,30,1050,380,90,0,0,Red Taxi Full Shift Import`,
    ].join('\n');

    setCsvRawText(template);
  };

  const handleFileUploadForImport = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvRawText(reader.result);
        setImportSuccessCount(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (validImportRows.length === 0) return;
    setImporting(true);
    try {
      const count = await importLogbookEntries(
        validImportRows.map((r) => r.payload)
      );
      setImportSuccessCount(count);
      setCsvRawText('');
    } finally {
      setImporting(false);
    }
  };

  const handleExportPdf = () => {
    const vehLabel =
      vehicleFilter === 'ALL'
        ? 'All Vehicles'
        : vehicles.find((v) => v.id === vehicleFilter)?.registrationNumber ||
          'Selected Vehicle';
    const dateLabel =
      dateFrom || dateTo
        ? `${dateFrom || 'Start'} to ${dateTo || 'Present'}`
        : 'All Dates';

    generateLogbookPdfReport({
      title: '15-Column Daily Logbook & Financial Settlement Report',
      businessName: profile?.businessName || 'FzeeLog Fleet Operations',
      dateRangeLabel: dateLabel,
      vehicleFilterLabel: vehLabel,
      entries: filteredAndSortedEntries,
      isDemoMode,
      customHeaders: colHeaders,
    });
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 inline ml-1 text-teal-400" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1 text-teal-400" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Action Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Daily Vehicle Logbook &amp; Financial Summaries
          </h2>
          <p className="text-sm text-slate-500">
            15-Column Standard Ledger · Driver Share ({defaultSharePct}% default) is separated from Operating Expenses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={quickTestBusy !== null}
            onClick={() => handleQuickTestAlert('Email')}
            className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {quickTestBusy === 'Email'
              ? 'Sending Mail...'
              : `Test Mail (${profile?.alertEmail || 'not configured'})`}
          </button>
          <button
            type="button"
            disabled={quickTestBusy !== null}
            onClick={() => handleQuickTestAlert('WhatsApp')}
            className="px-3 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {quickTestBusy === 'WhatsApp'
              ? 'Sending WhatsApp...'
              : `Test WhatsApp (${profile?.whatsappNumber || 'not configured'})`}
          </button>
          <button
            type="button"
            onClick={() => setCustomizeColsOpen(!customizeColsOpen)}
            className="px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5 text-teal-700" />
            Customize 15-Column Ledger
          </button>
          <button
            type="button"
            onClick={() => {
              setImportSuccessCount(null);
              setImportModalOpen(true);
            }}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-teal-600" />
            Import CSV / Excel
          </button>
          <button
            type="button"
            onClick={() => handleExportSpreadsheet('csv')}
            disabled={filteredAndSortedEntries.length === 0}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => handleExportSpreadsheet('xls')}
            disabled={filteredAndSortedEntries.length === 0}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export Excel (.xls)
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={filteredAndSortedEntries.length === 0}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            PDF Report
          </button>
          <button
            type="button"
            onClick={openAddModal}
            disabled={
              vehicles.filter((v) => v.status !== 'Archived').length === 0
            }
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Log Daily Shift
          </button>
        </div>
      </div>

      {quickTestBanner && (
        <div className="bg-slate-900 text-white border border-teal-500 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{quickTestBanner.message}</span>
          </div>
          <div className="flex items-center gap-2">
            {quickTestBanner.mailtoLink && (
              <a
                href={quickTestBanner.mailtoLink}
                className="px-2.5 py-1 font-semibold bg-slate-800 text-teal-300 border border-teal-500/40 rounded hover:bg-slate-700"
              >
                Open Mail Client
              </a>
            )}
            {quickTestBanner.waMeLink && (
              <a
                href={quickTestBanner.waMeLink}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 font-semibold bg-emerald-500 text-slate-950 rounded hover:bg-emerald-400"
              >
                Open WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={() => setQuickTestBanner(null)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Customize 15-Column Ledger Drawer */}
      {customizeColsOpen && (
        <div className="bg-white border-2 border-teal-500/40 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Customize 15-Column Logbook Ledger Headers &amp; Labels
              </h3>
              <p className="text-xs text-slate-500">
                Rename any of the 15 ledger columns to match your organization or individual accounting terminology. Click any row&apos;s inline edit icon in the table below to edit shift cells directly.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setColHeaders({ ...DEFAULT_15_COL_HEADERS })}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Reset to Default 15 Columns
              </button>
              <button
                type="button"
                onClick={handleSaveCustomHeaders}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                Save Column Labels
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {(
              Object.keys(DEFAULT_15_COL_HEADERS) as Array<
                keyof typeof DEFAULT_15_COL_HEADERS
              >
            ).map((key) => (
              <div key={key}>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  {DEFAULT_15_COL_HEADERS[key]}
                </label>
                <input
                  type="text"
                  value={colHeaders[key]}
                  onChange={(e) =>
                    setColHeaders((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">
            Total Distance (KM/DAY)
          </p>
          <p className="text-xl font-bold font-mono text-slate-900 mt-1">
            {formatKm(summaryTotals.kmDay)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {filteredAndSortedEntries.length} matching shift
            {filteredAndSortedEntries.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Gross Earnings</p>
          <p className="text-xl font-bold font-mono text-slate-900 mt-1">
            {formatINR(summaryTotals.earnings)}
          </p>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            Avg:{' '}
            {summaryTotals.kmDay > 0
              ? `${formatINR(summaryTotals.earnings / summaryTotals.kmDay)}/km`
              : '₹0.00/km'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">
            Driver Share Payout
          </p>
          <p className="text-xl font-bold font-mono text-slate-900 mt-1">
            {formatINR(summaryTotals.driverShare)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Excluded from Operating Expenses
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">
            Total Operating Expenses
          </p>
          <p className="text-xl font-bold font-mono text-amber-700 mt-1">
            {formatINR(summaryTotals.totalExpenses)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Fuel + Red Taxi + Toll + Maint
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs font-medium text-slate-500">
            Net Business Earnings
          </p>
          <p
            className={`text-xl font-bold font-mono mt-1 ${
              summaryTotals.netBusinessEarnings >= 0
                ? 'text-teal-700'
                : 'text-red-600'
            }`}
          >
            {formatINR(summaryTotals.netBusinessEarnings)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Earnings − Expenses − Driver Share
          </p>
        </div>
      </div>

      {/* Mode Switcher & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Sub-mode Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full">
            {[
              { id: 'shifts', label: '15-Column Shift Register' },
              {
                id: 'daily-summary',
                label: `Daily Summaries (${dailySummaryRows.length})`,
              },
              {
                id: 'monthly-summary',
                label: `Monthly Summaries (${monthlySummaryRows.length})`,
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTabMode(t.id as LogbookTabMode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  tabMode === t.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Quick Date Range Presets */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 mr-1">Quick Range:</span>
            {[
              { id: 'today', label: 'Today' },
              { id: '7d', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All Dates' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  applyDatePreset(p.id as 'today' | '7d' | 'month' | 'all')
                }
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search remarks, vehicle reg, driver..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              aria-label="Filter by vehicle"
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber} ({v.model})
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              aria-label="Filter by driver"
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Drivers</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 shrink-0">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 shrink-0">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* TAB 1: 15-Column Shift Register with Sorting & Pagination */}
      {tabMode === 'shifts' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-900 text-white text-[11px] font-semibold tracking-tight">
                  <th className="py-3 px-2.5 text-center whitespace-nowrap">
                    {colHeaders.sno}
                  </th>
                  <th className="py-3 px-2.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('entryDate')}
                      className="hover:text-teal-300 inline-flex items-center"
                    >
                      {colHeaders.date} {renderSortIcon('entryDate')}
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    {colHeaders.startingKm}
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    {colHeaders.endingKm}
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('kmDay')}
                      className="hover:text-teal-300 inline-flex items-center"
                    >
                      {colHeaders.kmDay} {renderSortIcon('kmDay')}
                    </button>
                  </th>
                  <th className="py-3 px-2.5 whitespace-nowrap">
                    {colHeaders.attendance}
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('earnings')}
                      className="hover:text-teal-300 inline-flex items-center"
                    >
                      {colHeaders.earnings} {renderSortIcon('earnings')}
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('unitPrice')}
                      className="hover:text-teal-300 inline-flex items-center"
                    >
                      {colHeaders.unitPrice} {renderSortIcon('unitPrice')}
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('driverShare')}
                      className="hover:text-teal-300 inline-flex items-center"
                    >
                      {colHeaders.driverShare} {renderSortIcon('driverShare')}
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    {colHeaders.gasFuel}
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    {colHeaders.redTaxi}
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    {colHeaders.toll}
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    {colHeaders.maintenance}
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('totalExpenses')}
                      className="hover:text-teal-300 inline-flex items-center"
                    >
                      {colHeaders.totalExpenses} {renderSortIcon('totalExpenses')}
                    </button>
                  </th>
                  <th className="py-3 px-2.5 whitespace-nowrap">
                    {colHeaders.sourceRemarks}
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap bg-teal-900">
                    <button
                      type="button"
                      onClick={() => toggleSort('netBusinessEarnings')}
                      className="hover:text-teal-300 inline-flex items-center"
                    >
                      {colHeaders.netBusinessEarnings}{' '}
                      {renderSortIcon('netBusinessEarnings')}
                    </button>
                  </th>
                  <th className="py-3 px-2.5 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {paginatedEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={17}
                      className="py-12 px-4 text-center text-slate-500"
                    >
                      {vehicles.length === 0
                        ? 'Add a vehicle first before logging daily shifts.'
                        : 'No daily logbook entries found for the selected filter criteria.'}
                    </td>
                  </tr>
                ) : (
                  paginatedEntries.map((entry, idx) => {
                    const serialNo = (safePage - 1) * pageSize + idx + 1;
                    const isInlineEditing =
                      inlineRowId === entry.id && inlineDraft !== null;
                    const previewMath = isInlineEditing
                      ? calculateLogbookFinancials(
                          {
                            startingKm: inlineDraft.startingKm,
                            endingKm: inlineDraft.endingKm,
                            earnings: inlineDraft.earnings,
                            driverSharePct: inlineDraft.driverSharePct,
                            gasFuel: inlineDraft.gasFuel,
                            redTaxi: inlineDraft.redTaxi,
                            toll: inlineDraft.toll,
                            maintenance: inlineDraft.maintenance,
                          },
                          calcOptions
                        )
                      : null;

                    return (
                      <tr
                        key={entry.id}
                        className={`${
                          isInlineEditing
                            ? 'bg-teal-50/70'
                            : 'hover:bg-slate-50/90'
                        } transition-colors`}
                      >
                        <td className="py-2.5 px-2.5 text-center font-mono text-slate-500">
                          {serialNo}
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900">
                            {entry.entryDate}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {entry.vehicleRegNo} · S#{entry.shiftNumber}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                          {isInlineEditing ? (
                            <input
                              type="number"
                              value={inlineDraft.startingKm}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  startingKm: Number(e.target.value),
                                })
                              }
                              className="w-20 px-1.5 py-1 text-right font-mono text-xs border border-teal-500 rounded bg-white"
                            />
                          ) : (
                            entry.startingKm.toLocaleString('en-IN')
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                          {isInlineEditing ? (
                            <input
                              type="number"
                              value={inlineDraft.endingKm}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  endingKm: Number(e.target.value),
                                })
                              }
                              className="w-20 px-1.5 py-1 text-right font-mono text-xs border border-teal-500 rounded bg-white"
                            />
                          ) : (
                            entry.endingKm.toLocaleString('en-IN')
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {(previewMath
                            ? previewMath.kmDay
                            : entry.kmDay
                          ).toLocaleString('en-IN')}{' '}
                          km
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          {isInlineEditing ? (
                            <select
                              value={inlineDraft.attendance}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  attendance: e.target
                                    .value as AttendanceStatus,
                                })
                              }
                              className="px-1.5 py-1 text-xs border border-teal-500 rounded bg-white"
                            >
                              <option value="Present">Present</option>
                              <option value="Half Day">Half Day</option>
                              <option value="Absent">Absent</option>
                              <option value="Leave">Leave</option>
                            </select>
                          ) : (
                            <>
                              <div className="font-medium text-slate-800">
                                {entry.attendance}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[110px]">
                                {entry.driverName}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {isInlineEditing ? (
                            <input
                              type="number"
                              value={inlineDraft.earnings}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  earnings: Number(e.target.value),
                                })
                              }
                              className="w-20 px-1.5 py-1 text-right font-mono text-xs border border-teal-500 rounded bg-white"
                            />
                          ) : (
                            formatINR(entry.earnings)
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                          {formatINR(
                            previewMath ? previewMath.unitPrice : entry.unitPrice
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                          <div>
                            {formatINR(
                              previewMath
                                ? previewMath.driverShare
                                : entry.driverShare
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            (
                            {isInlineEditing
                              ? inlineDraft.driverSharePct
                              : entry.driverSharePct}
                            %)
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                          {isInlineEditing ? (
                            <input
                              type="number"
                              value={inlineDraft.gasFuel}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  gasFuel: Number(e.target.value),
                                })
                              }
                              className="w-16 px-1.5 py-1 text-right font-mono text-xs border border-teal-500 rounded bg-white"
                            />
                          ) : (
                            formatINR(entry.gasFuel)
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                          {isInlineEditing ? (
                            <input
                              type="number"
                              value={inlineDraft.redTaxi}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  redTaxi: Number(e.target.value),
                                })
                              }
                              className="w-16 px-1.5 py-1 text-right font-mono text-xs border border-teal-500 rounded bg-white"
                            />
                          ) : (
                            formatINR(entry.redTaxi)
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                          {isInlineEditing ? (
                            <input
                              type="number"
                              value={inlineDraft.toll}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  toll: Number(e.target.value),
                                })
                              }
                              className="w-16 px-1.5 py-1 text-right font-mono text-xs border border-teal-500 rounded bg-white"
                            />
                          ) : (
                            formatINR(entry.toll)
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                          {isInlineEditing ? (
                            <input
                              type="number"
                              value={inlineDraft.maintenance}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  maintenance: Number(e.target.value),
                                })
                              }
                              className="w-16 px-1.5 py-1 text-right font-mono text-xs border border-teal-500 rounded bg-white"
                            />
                          ) : (
                            formatINR(entry.maintenance)
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-amber-800 whitespace-nowrap">
                          {formatINR(
                            previewMath
                              ? previewMath.totalExpenses
                              : entry.totalExpenses
                          )}
                        </td>
                        <td
                          className="py-2.5 px-2.5 text-slate-700 max-w-[180px] truncate"
                          title={entry.sourceRemarks}
                        >
                          {isInlineEditing ? (
                            <input
                              type="text"
                              value={inlineDraft.sourceRemarks}
                              onChange={(e) =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  sourceRemarks: e.target.value,
                                })
                              }
                              className="w-28 px-1.5 py-1 text-xs border border-teal-500 rounded bg-white"
                            />
                          ) : (
                            entry.sourceRemarks || '—'
                          )}
                        </td>
                        <td
                          className={`py-2.5 px-2.5 text-right font-mono font-bold whitespace-nowrap bg-teal-50/50 ${
                            (previewMath
                              ? previewMath.netBusinessEarnings
                              : entry.netBusinessEarnings) >= 0
                              ? 'text-teal-700'
                              : 'text-red-600'
                          }`}
                        >
                          {formatINR(
                            previewMath
                              ? previewMath.netBusinessEarnings
                              : entry.netBusinessEarnings
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          {isInlineEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveInlineEdit(entry)}
                                className="px-2 py-1 text-[11px] font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded"
                                title="Save Inline Changes"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setInlineRowId(null);
                                  setInlineDraft(null);
                                }}
                                className="px-1.5 py-1 text-[11px] text-slate-600 bg-slate-200 hover:bg-slate-300 rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startInlineEdit(entry)}
                                className="px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded"
                                title="Quick Edit Row Inline"
                              >
                                Quick Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(entry)}
                                className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                                title="Full Modal Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmEntry(entry)}
                                className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                                title="Delete Shift Entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredAndSortedEntries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-100 font-mono text-xs font-bold text-slate-900">
                    <td
                      colSpan={4}
                      className="py-3 px-2.5 text-right font-sans"
                    >
                      FILTERED TOTALS ({filteredAndSortedEntries.length} Shifts):
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      {summaryTotals.kmDay.toLocaleString('en-IN')} km
                    </td>
                    <td className="py-3 px-2.5"></td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      {formatINR(summaryTotals.earnings)}
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      {summaryTotals.kmDay > 0
                        ? formatINR(summaryTotals.earnings / summaryTotals.kmDay)
                        : formatINR(0)}
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      {formatINR(summaryTotals.driverShare)}
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      {formatINR(summaryTotals.gasFuel)}
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      {formatINR(summaryTotals.redTaxi)}
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      {formatINR(summaryTotals.toll)}
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      {formatINR(summaryTotals.maintenance)}
                    </td>
                    <td className="py-3 px-2.5 text-right text-amber-800 whitespace-nowrap">
                      {formatINR(summaryTotals.totalExpenses)}
                    </td>
                    <td className="py-3 px-2.5"></td>
                    <td className="py-3 px-2.5 text-right text-teal-800 bg-teal-100/60 whitespace-nowrap">
                      {formatINR(summaryTotals.netBusinessEarnings)}
                    </td>
                    <td className="py-3 px-2.5"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredAndSortedEntries.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 border border-slate-300 rounded bg-white font-mono"
                >
                  {[10, 25, 50, 100].map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </select>
                <span className="font-mono ml-2">
                  Showing {(safePage - 1) * pageSize + 1}–
                  {Math.min(
                    safePage * pageSize,
                    filteredAndSortedEntries.length
                  )}{' '}
                  of {filteredAndSortedEntries.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono font-medium text-slate-900">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="p-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2 & 3: Daily & Monthly Summaries */}
      {(tabMode === 'daily-summary' || tabMode === 'monthly-summary') && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {tabMode === 'daily-summary'
                ? 'Daily Aggregated Fleet Summary (Grouped by Date)'
                : 'Monthly Aggregated Fleet Summary (Grouped by YYYY-MM)'}
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {tabMode === 'daily-summary'
                ? `${dailySummaryRows.length} operating days`
                : `${monthlySummaryRows.length} operating months`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-900 text-white text-xs font-semibold">
                  <th className="py-3 px-3">
                    {tabMode === 'daily-summary' ? 'Date' : 'Month'}
                  </th>
                  <th className="py-3 px-3 text-right">Active Vehicles</th>
                  <th className="py-3 px-3 text-right">Shifts</th>
                  <th className="py-3 px-3 text-right">Total KM</th>
                  <th className="py-3 px-3 text-right">Gross Earnings</th>
                  <th className="py-3 px-3 text-right">Avg Unit/KM</th>
                  <th className="py-3 px-3 text-right">Driver Share</th>
                  <th className="py-3 px-3 text-right">Gas/Fuel</th>
                  <th className="py-3 px-3 text-right">Red Taxi</th>
                  <th className="py-3 px-3 text-right">Toll + Maint</th>
                  <th className="py-3 px-3 text-right">Total Op Exp</th>
                  <th className="py-3 px-3 text-right bg-teal-900">
                    Net Business
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-mono">
                {(tabMode === 'daily-summary'
                  ? dailySummaryRows
                  : monthlySummaryRows
                ).map((row) => (
                  <tr key={row.periodKey} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {row.periodKey}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {row.vehiclesCount}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {row.shiftsCount}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-900">
                      {formatKm(row.kmDay)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-900">
                      {formatINR(row.earnings)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-600">
                      {formatINR(row.unitPrice)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {formatINR(row.driverShare)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {formatINR(row.gasFuel)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {formatINR(row.redTaxi)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {formatINR(
                        row.toll + row.maintenance + row.otherExpenses
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-amber-800">
                      {formatINR(row.totalExpenses)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-bold bg-teal-50/50 ${
                        row.netBusinessEarnings >= 0
                          ? 'text-teal-700'
                          : 'text-red-600'
                      }`}
                    >
                      {formatINR(row.netBusinessEarnings)} ({row.marginPct}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CSV / Spreadsheet Import Modal */}
      {importModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Import Daily Logbook Shifts (CSV / Excel Paste)
                </h3>
                <p className="text-xs text-slate-500">
                  Upload a CSV file or paste rows from Excel. Automatically validates odometer readings, matches vehicles, and computes all 15-column totals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importSuccessCount !== null && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                Successfully imported {importSuccessCount} validated shift
                {importSuccessCount === 1 ? '' : 's'} into the logbook.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  Select CSV / TSV File
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUploadForImport}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDownloadImportTemplate}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Load Sample Template Row
                </button>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Columns: Date, Vehicle Reg, Shift, Start KM, End KM, Attendance, Earnings, Share %, Gas, RedTaxi, Toll, Maint, Other, Remarks
              </span>
            </div>

            <textarea
              rows={5}
              value={csvRawText}
              onChange={(e) => {
                setCsvRawText(e.target.value);
                setImportSuccessCount(null);
              }}
              placeholder="Paste CSV or Excel tab-separated rows here..."
              className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />

            {parsedImportRows.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    Validation Preview ({validImportRows.length} valid of{' '}
                    {parsedImportRows.length} rows)
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold text-slate-600">
                        <th className="py-2 px-3">Row</th>
                        <th className="py-2 px-3">Date &amp; Vehicle</th>
                        <th className="py-2 px-3 text-right">KM/DAY</th>
                        <th className="py-2 px-3 text-right">Earnings</th>
                        <th className="py-2 px-3 text-right">Net Business</th>
                        <th className="py-2 px-3">Validation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      {parsedImportRows.map((r) => (
                        <tr key={r.rowNumber}>
                          <td className="py-2 px-3">#{r.rowNumber}</td>
                          <td className="py-2 px-3">
                            {r.payload.entryDate} · {r.payload.vehicleRegNo} (S#
                            {r.payload.shiftNumber})
                          </td>
                          <td className="py-2 px-3 text-right">
                            {r.calculated.kmDay} km
                          </td>
                          <td className="py-2 px-3 text-right">
                            {formatINR(r.payload.earnings)}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-teal-700">
                            {formatINR(r.calculated.netBusinessEarnings)}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            {r.valid ? (
                              <span className="text-emerald-700 font-semibold">
                                Ready to import
                              </span>
                            ) : (
                              <span className="text-red-600">
                                {r.errors.join(' ')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                disabled={validImportRows.length === 0 || importing}
                onClick={handleExecuteImport}
                className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {importing
                  ? 'Importing Shifts...'
                  : `Import ${validImportRows.length} Valid Row${
                      validImportRows.length === 1 ? '' : 's'
                    }`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Logbook Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 space-y-5 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingEntry
                    ? `Edit Daily Logbook Shift · ${editingEntry.vehicleRegNo}`
                    : 'Log New Daily Shift Entry'}
                </h3>
                <p className="text-xs text-slate-500">
                  All financial values in INR (₹) and distances in kilometres (km).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formErrors.length > 0 && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
                <p className="font-semibold">Validation Error:</p>
                <ul className="list-disc list-inside">
                  {formErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {formWarnings.length > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                {formWarnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vehicle *
                  </label>
                  <select
                    required
                    value={formState.vehicleId}
                    onChange={(e) => handleVehicleChangeInForm(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Select Vehicle</option>
                    {vehicles
                      .filter(
                        (v) =>
                          v.status !== 'Archived' ||
                          v.id === formState.vehicleId
                      )
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.registrationNumber} ({v.make} {v.model})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    2. Date (Asia/Kolkata) *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.entryDate}
                    onChange={(e) =>
                      setFormState({ ...formState, entryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Shift Number (1–10) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={10}
                    value={formState.shiftNumber}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        shiftNumber: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    6. Attendance &amp; Driver
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formState.attendance}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          attendance: e.target.value as AttendanceStatus,
                        })
                      }
                      className="w-1/2 px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      {['Present', 'Half Day', 'Absent', 'Leave'].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formState.driverId}
                      onChange={(e) =>
                        handleDriverChangeInForm(e.target.value)
                      }
                      className="w-1/2 px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Default Driver</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    3. Starting KM *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.1"
                    value={formState.startingKm}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        startingKm: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    4. Ending KM *
                  </label>
                  <input
                    type="number"
                    required
                    min={formState.startingKm}
                    step="0.1"
                    value={formState.endingKm}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        endingKm: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    7. Gross Earnings (INR ₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={formState.earnings}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        earnings: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Driver Share % (Default {defaultSharePct}%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={formState.driverSharePct}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        driverSharePct: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    10. Gas/Fuel Expense (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.gasFuel}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        gasFuel: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    11. Red Taxi / Platform Fee (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.redTaxi}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        redTaxi: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    12. Toll Charges (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.toll}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        toll: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    13. Shift Maintenance (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.maintenance}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        maintenance: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Other Configured Expenses (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.otherExpenses}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        otherExpenses: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                {(() => {
                  const selVeh = vehicles.find(
                    (v) => v.id === formState.vehicleId
                  );
                  const needsReason =
                    !editingEntry &&
                    selVeh !== undefined &&
                    Number(formState.startingKm) !==
                      Number(selVeh.currentOdometerKm);
                  return needsReason ? (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-amber-800 mb-1">
                        Odometer Correction Reason (required - Starting KM{' '}
                        {formState.startingKm} differs from vehicle odometer{' '}
                        {selVeh.currentOdometerKm})
                      </label>
                      <input
                        type="text"
                        minLength={3}
                        maxLength={300}
                        placeholder="e.g. Odometer reset after cluster replacement"
                        value={formState.odometerCorrectionReason}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            odometerCorrectionReason: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-amber-400 bg-amber-50 rounded-lg"
                      />
                    </div>
                  ) : null;
                })()}
                {calcOptions.unitPriceMode === 'MANUAL' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      8. Unit Price (Manual, INR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={formState.manualUnitPrice}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          manualUnitPrice: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
                {calcOptions.driverShareMode === 'MANUAL' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      9. Driver Share (Manual, INR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={formState.manualDriverShare}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          manualDriverShare: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    15. Source / Remarks
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="Red Taxi Shift 1, Airport Charter, CNG refill details..."
                    value={formState.sourceRemarks}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        sourceRemarks: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Live Formula Verification Strip */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div>
                  <p className="text-[11px] text-slate-500">
                    5. KM/DAY (End − Start)
                  </p>
                  <p className="text-base font-bold font-mono text-slate-900">
                    {formatKm(liveCalc.kmDay)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">
                    8.{' '}
                    {calcOptions.unitPriceMode === 'MANUAL'
                      ? 'Unit Price (Manual)'
                      : calcOptions.unitPriceMode === 'PER_DAY_DERIVED'
                        ? 'Unit Price (Per Day)'
                        : 'Unit Price (Earnings ÷ KM)'}
                  </p>
                  <p className="text-base font-bold font-mono text-slate-900">
                    {formatINR(liveCalc.unitPrice)}
                    {calcOptions.unitPriceMode === 'PER_KM_DERIVED'
                      ? '/km'
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">
                    9. Driver Share (
                    {calcOptions.driverShareMode === 'FIXED_DAILY'
                      ? 'Fixed'
                      : calcOptions.driverShareMode === 'MANUAL'
                        ? 'Manual'
                        : `${formState.driverSharePct}%`}
                    )
                  </p>
                  <p className="text-base font-bold font-mono text-slate-900">
                    {formatINR(liveCalc.driverShare)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">
                    14. Total Operating Expenses
                  </p>
                  <p className="text-base font-bold font-mono text-amber-800">
                    {formatINR(liveCalc.totalExpenses)}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[11px] text-slate-500">
                    Net Business Earnings
                  </p>
                  <p
                    className={`text-base font-bold font-mono ${
                      liveCalc.netBusinessEarnings >= 0
                        ? 'text-teal-700'
                        : 'text-red-600'
                    }`}
                  >
                    {formatINR(liveCalc.netBusinessEarnings)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving
                    ? 'Saving Entry...'
                    : editingEntry
                    ? 'Update Logbook Entry'
                    : 'Save Logbook Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Destructive Delete Confirmation Modal */}
      {deleteConfirmEntry && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Delete Logbook Entry?
            </h3>
            <p className="text-sm text-slate-600">
              Are you sure you want to permanently remove Shift #
              {deleteConfirmEntry.shiftNumber} on{' '}
              <span className="font-mono font-semibold">
                {deleteConfirmEntry.entryDate}
              </span>{' '}
              for vehicle{' '}
              <span className="font-mono font-semibold">
                {deleteConfirmEntry.vehicleRegNo}
              </span>
              ? This action will be recorded in the financial audit log.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmEntry(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteLogbookEntry(deleteConfirmEntry);
                  setDeleteConfirmEntry(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
