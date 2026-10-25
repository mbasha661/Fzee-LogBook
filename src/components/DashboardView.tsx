import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Car,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Mail,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import { NavigationTab } from '../types/fleet';
import {
  evaluateMilestoneExpiryAlerts,
  formatINR,
  formatKm,
  getDaysUntilExpiry,
  roundCurrency,
  roundKm,
} from '../lib/calculations';

export const DashboardView: React.FC<{
  onNavigate: (tab: NavigationTab, vehicleId?: string) => void;
}> = ({ onNavigate }) => {
  const {
    profile,
    vehicles,
    drivers,
    logbookEntries,
    organizationMembers,
    activeOrgMember,
    isDemoMode,
    setIsDemoMode,
    saveNotificationLog,
  } = useFleet();

  const [testAlertBusy, setTestAlertBusy] = useState<'Email' | 'WhatsApp' | null>(
    null
  );
  const [testAlertFeedback, setTestAlertFeedback] = useState<{
    channel: 'Email' | 'WhatsApp';
    summary: string;
    whatsappUrl?: string;
    mailtoUrl?: string;
  } | null>(null);

  const alertEmail = profile?.alertEmail || 'not configured';
  const alertWhatsapp = profile?.whatsappNumber || 'not set';

  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.status !== 'Archived'),
    [vehicles]
  );

  const milestoneSchedule = useMemo(
    () => evaluateMilestoneExpiryAlerts(activeVehicles, drivers),
    [activeVehicles, drivers]
  );

  const handleDashboardTestDispatch = async (channel: 'Email' | 'WhatsApp') => {
    setTestAlertBusy(channel);
    try {
      const itemsPayload = milestoneSchedule.slice(0, 8).map((m) => ({
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
      const bodyText =
        data?.dispatchReceipt?.messagePreview ||
        `FzeeLog 10d/5d/1d Statutory Expiry Alert Test (Insurance, FC, Permit, Driver Licence, Pollution) for ${alertEmail} / +91 ${alertWhatsapp}.`;

      await saveNotificationLog({
        alertType: 'StatutoryExpiry',
        severity: 'WARNING',
        targetLabel:
          channel === 'Email'
            ? `Email Test -> ${alertEmail}`
            : `WhatsApp Test -> +91 ${alertWhatsapp}`,
        title: `Dashboard Test ${channel} Alert Dispatched (${
          channel === 'Email' ? alertEmail : alertWhatsapp
        })`,
        message: bodyText.slice(0, 900),
        channel: channel === 'Email' ? 'EmailDigest' : 'WhatsApp',
        recipientEmail: alertEmail,
        status: 'Unread',
      });

      setTestAlertFeedback({
        channel,
        summary:
          channel === 'Email'
            ? `Test Email dispatched to ${alertEmail} (10d / 5d / 1d Insurance, FC, Permit, DL & PUC)`
            : `Test WhatsApp alert dispatched to +91 ${alertWhatsapp} (10d / 5d / 1d Insurance, FC, Permit, DL & PUC)`,
        whatsappUrl: data?.dispatchReceipt?.whatsappDeepLink,
        mailtoUrl: data?.dispatchReceipt?.mailtoLink,
      });
    } catch {
      // Fallback
    } finally {
      setTestAlertBusy(null);
    }
  };

  const metrics = useMemo(() => {
    const totalOdometer = activeVehicles.reduce(
      (s, v) => roundKm(s + v.currentOdometerKm),
      0
    );
    const totalKmLogged = logbookEntries.reduce(
      (s, e) => roundKm(s + e.kmDay),
      0
    );
    const grossEarnings = logbookEntries.reduce(
      (s, e) => roundCurrency(s + e.earnings),
      0
    );
    const driverShareTotal = logbookEntries.reduce(
      (s, e) => roundCurrency(s + e.driverShare),
      0
    );
    const operatingExpenses = logbookEntries.reduce(
      (s, e) => roundCurrency(s + e.totalExpenses),
      0
    );
    const netBusinessEarnings = logbookEntries.reduce(
      (s, e) => roundCurrency(s + e.netBusinessEarnings),
      0
    );
    const avgUnitPrice =
      totalKmLogged > 0 ? roundCurrency(grossEarnings / totalKmLogged) : 0;

    return {
      totalOdometer,
      totalKmLogged,
      grossEarnings,
      driverShareTotal,
      operatingExpenses,
      netBusinessEarnings,
      avgUnitPrice,
    };
  }, [activeVehicles, logbookEntries]);

  const complianceAlerts = useMemo(() => {
    const list: Array<{
      id: string;
      regNo: string;
      type: string;
      detail: string;
      milestoneBadge: string;
      severity: 'critical' | 'warning';
    }> = [];

    for (const v of activeVehicles) {
      const checks: Array<[string, string]> = [
        ['Insurance', v.insuranceExpiry],
        ['Fitness Certificate (FC)', v.fcExpiry],
        ['Permit', v.permitExpiry],
        ['Pollution (PUC)', v.pollutionExpiry],
      ];
      for (const [label, dateStr] of checks) {
        const days = getDaysUntilExpiry(dateStr);
        if (days !== null && days <= 30) {
          const milestoneBadge =
            days < 0
              ? 'EXPIRED'
              : days <= 1
              ? '1-DAY ALERT'
              : days <= 5
              ? '5-DAY ALERT'
              : days <= 10
              ? '10-DAY ALERT'
              : '30-DAY WATCH';
          list.push({
            id: `${v.id}-${label}`,
            regNo: v.registrationNumber,
            type: label,
            detail:
              days < 0
                ? `Expired ${Math.abs(days)} days ago (${dateStr})`
                : `Expires in ${days} days (${dateStr})`,
            milestoneBadge,
            severity: days <= 5 ? 'critical' : 'warning',
          });
        }
      }

      const serviceRem = v.nextServiceOdometerKm - v.currentOdometerKm;
      if (v.nextServiceOdometerKm > 0 && serviceRem <= 1500) {
        list.push({
          id: `${v.id}-service`,
          regNo: v.registrationNumber,
          type: 'Preventive Service',
          detail:
            serviceRem <= 0
              ? `Overdue by ${formatKm(Math.abs(serviceRem))}`
              : `Due in ${formatKm(serviceRem)} (at ${formatKm(v.nextServiceOdometerKm)})`,
          milestoneBadge: serviceRem <= 0 ? 'OVERDUE' : 'SERVICE DUE',
          severity: serviceRem <= 0 ? 'critical' : 'warning',
        });
      }
    }

    for (const d of drivers) {
      if (d.status === 'Archived') continue;
      const days = getDaysUntilExpiry(d.licenseExpiry);
      if (days !== null && days <= 30) {
        const milestoneBadge =
          days < 0
            ? 'EXPIRED'
            : days <= 1
            ? '1-DAY ALERT'
            : days <= 5
            ? '5-DAY ALERT'
            : days <= 10
            ? '10-DAY ALERT'
            : '30-DAY WATCH';
        list.push({
          id: `${d.id}-dl`,
          regNo: d.fullName,
          type: 'Driver Licence (DL)',
          detail:
            days < 0
              ? `Expired ${Math.abs(days)} days ago (${d.licenseExpiry})`
              : `Expires in ${days} days (${d.licenseExpiry})`,
          milestoneBadge,
          severity: days <= 5 ? 'critical' : 'warning',
        });
      }
    }
    return list;
  }, [activeVehicles, drivers]);

  // First-Run Meaningful Zero State when live database has no vehicles yet
  if (vehicles.length === 0 && logbookEntries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 lg:p-10">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs font-semibold text-teal-700 tracking-wide">
              01. First-Run Fleet Workspace Ready
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Welcome to FzeeLog — Your Live Fleet &amp; 15-Column Logbook Ledger
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your authenticated workspace is connected and isolated by Row-Level Security. No live vehicles or daily logbook shifts have been recorded yet. Start by registering your first commercial or personal vehicle, or toggle Demo Preview Mode to inspect a populated Tamil Nadu commercial fleet dataset.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('vehicles')}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Your First Vehicle
              </button>
              <button
                type="button"
                onClick={() => onNavigate('drivers')}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <UserCheck className="w-4 h-4" />
                Register Drivers
              </button>
              {!isDemoMode && (
                <button
                  type="button"
                  onClick={() => setIsDemoMode(true)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Preview Populated Demo Mode
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Zero-State KPI Placeholders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Active Fleet Vehicles</p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1">0</p>
            <p className="text-xs text-slate-400 mt-1">0 km validated odometer</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Gross Shift Earnings</p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1">₹0.00</p>
            <p className="text-xs text-slate-400 mt-1">0 shifts logged</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Operating Expenses</p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1">₹0.00</p>
            <p className="text-xs text-slate-400 mt-1">Driver Share: ₹0.00</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Net Business Earnings</p>
            <p className="text-2xl font-bold font-mono text-teal-700 mt-1">₹0.00</p>
            <p className="text-xs text-slate-400 mt-1">INR (₹) · Asia/Kolkata</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Fleet Operations &amp; Financial Command Center
          </h2>
          <p className="text-sm text-slate-500">
            Currency: INR (₹) · Distance: kilometres (km) · Timezone: Asia/Kolkata
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleDashboardTestDispatch('Email')}
            disabled={testAlertBusy !== null}
            className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Mail className="w-3.5 h-3.5 text-teal-400" />
            {testAlertBusy === 'Email'
              ? 'Sending...'
              : `Test Mail (${alertEmail})`}
          </button>
          <button
            type="button"
            onClick={() => handleDashboardTestDispatch('WhatsApp')}
            disabled={testAlertBusy !== null}
            className="px-3 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {testAlertBusy === 'WhatsApp'
              ? 'Sending...'
              : `Test WhatsApp (${alertWhatsapp})`}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('vehicles')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Car className="w-4 h-4 text-slate-500" />
            Manage Vehicles ({activeVehicles.length})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('logbook')}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Open 15-Column Logbook
          </button>
        </div>
      </div>

      {/* Live Test Dispatch Receipt Banner */}
      {testAlertFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-emerald-950">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{testAlertFeedback.summary}</p>
              <p className="text-emerald-800 mt-0.5">
                Statutory 10-Day, 5-Day &amp; 1-Day alert schedule verified for Insurance, FC, Permit, Driver Licence &amp; Pollution (PUC).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {testAlertFeedback.mailtoUrl && (
              <a
                href={testAlertFeedback.mailtoUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 rounded-lg hover:bg-emerald-100 flex items-center gap-1"
              >
                <Mail className="w-3.5 h-3.5" />
                Open Mail Client
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {testAlertFeedback.whatsappUrl && (
              <a
                href={testAlertFeedback.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                Launch WhatsApp (+91 {alertWhatsapp})
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              type="button"
              onClick={() => setTestAlertFeedback(null)}
              className="px-2 py-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Organization / Individual Workspace & Statutory Alert Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg">
            <Building2 className="w-3.5 h-3.5 text-teal-600" />
            Mode: {profile?.accountMode || 'Organization'} Use
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            Active Operator:{' '}
            <strong className="text-slate-900">
              {activeOrgMember?.fullName ||
                profile?.displayName ||
                profile?.businessName ||
                'Fleet Operator'}
            </strong>{' '}
            ({activeOrgMember?.role || 'Owner / Admin'})
          </span>
          {profile?.accountMode !== 'Individual' && (
            <span className="text-slate-500 font-mono">
              {organizationMembers.length} authorized team login(s)
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono text-slate-600">
            10d/5d/1d Alerts: <strong>{alertEmail}</strong> · WhatsApp:{' '}
            <strong>+91 {alertWhatsapp}</strong>
          </span>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-xs font-semibold text-teal-700 hover:underline"
          >
            Configure Team &amp; Alerts →
          </button>
        </div>
      </div>

      {/* 4-Card Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              Active Fleet &amp; Logged Distance
            </p>
            <Car className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {formatKm(metrics.totalKmLogged)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {activeVehicles.length} active vehicles · {drivers.length} drivers
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              Gross Shift Earnings
            </p>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {formatINR(metrics.grossEarnings)}
          </p>
          <p className="text-xs font-mono text-slate-500 mt-1">
            Unit Rate: {formatINR(metrics.avgUnitPrice)}/km
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              Operating Expenses &amp; Driver Share
            </p>
            <ClipboardList className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-800 mt-2">
            {formatINR(metrics.operatingExpenses)}
          </p>
          <p className="text-xs font-mono text-slate-500 mt-1">
            + Driver Share: {formatINR(metrics.driverShareTotal)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              Net Business Earnings
            </p>
            <Wrench className="w-4 h-4 text-teal-600" />
          </div>
          <p
            className={`text-2xl font-bold font-mono mt-2 ${
              metrics.netBusinessEarnings >= 0
                ? 'text-teal-700'
                : 'text-red-600'
            }`}
          >
            {formatINR(metrics.netBusinessEarnings)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            After Operating Exp &amp; Driver Share
          </p>
        </div>
      </div>

      {/* Middle 2-Column Split: Shift Financial Breakdown & Compliance Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Visual Financial Distribution */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Shift Earnings Allocation &amp; Expense Structure
              </h3>
              <p className="text-xs text-slate-500">
                Visualizes how Gross Shift Earnings split across Operating Expenses, Driver Share, and Net Business Profit.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 whitespace-nowrap"
            >
              Full Ledger <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {logbookEntries.slice(0, 5).map((entry) => {
              const gross = Math.max(1, entry.earnings);
              const expPct = Math.min(100, (entry.totalExpenses / gross) * 100);
              const drvPct = Math.min(100, (entry.driverShare / gross) * 100);
              const netPct = Math.max(0, 100 - expPct - drvPct);

              return (
                <div key={entry.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium text-slate-800">
                      {entry.entryDate} · {entry.vehicleRegNo} (
                      {formatKm(entry.kmDay)})
                    </span>
                    <span className="font-mono text-slate-700">
                      Gross: <strong>{formatINR(entry.earnings)}</strong> · Net:{' '}
                      <strong className="text-teal-700">
                        {formatINR(entry.netBusinessEarnings)}
                      </strong>
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-md overflow-hidden flex">
                    <div
                      style={{ width: `${netPct}%` }}
                      className="bg-teal-600 h-full"
                      title={`Net Business Earnings: ${formatINR(entry.netBusinessEarnings)}`}
                    />
                    <div
                      style={{ width: `${drvPct}%` }}
                      className="bg-slate-600 h-full"
                      title={`Driver Share: ${formatINR(entry.driverShare)}`}
                    />
                    <div
                      style={{ width: `${expPct}%` }}
                      className="bg-amber-500 h-full"
                      title={`Operating Expenses: ${formatINR(entry.totalExpenses)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-teal-600 inline-block" />
              Net Business Earnings
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-slate-600 inline-block" />
              Driver Share Payout
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
              Operating Expenses (Gas/Fuel + Red Taxi + Toll + Maint)
            </span>
          </div>
        </div>

        {/* Statutory Compliance & Service Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                10d / 5d / 1d Expiry &amp; Service Alerts
              </h3>
              <p className="text-xs text-slate-500">
                Insurance, FC, Permit, Driver Licence, PUC &amp; Service
              </p>
            </div>
            <ShieldAlert className="w-5 h-5 text-amber-600" />
          </div>

          {complianceAlerts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              All active vehicles and drivers have valid statutory documents and service intervals beyond 30 days / 1,500 km.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 space-y-2 max-h-60 overflow-y-auto">
              {complianceAlerts.map((alert) => (
                <div key={alert.id} className="pt-2 first:pt-0 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-900">
                      {alert.regNo}
                    </span>
                    <span
                      className={`font-semibold ${
                        alert.severity === 'critical'
                          ? 'text-red-600'
                          : 'text-amber-700'
                      }`}
                    >
                      {alert.type} · {alert.milestoneBadge}
                    </span>
                  </div>
                  <p className="text-slate-600 font-mono text-[11px]">
                    {alert.detail}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigate('documents')}
              className="py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Compliance Register
            </button>
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
            >
              10d/5d/1d Alert Rules
            </button>
          </div>
        </div>
      </div>

      {/* Recent Logbook Shifts Preview */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Recent Daily Logbook Entries
            </h3>
            <p className="text-xs text-slate-500">
              Latest shifts with validated odometer progression and net business settlement
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('logbook')}
            className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1"
          >
            Open 15-Column Logbook <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Vehicle</th>
                <th className="py-2.5 px-4">Driver</th>
                <th className="py-2.5 px-4 text-right">KM/DAY</th>
                <th className="py-2.5 px-4 text-right">Earnings</th>
                <th className="py-2.5 px-4 text-right">Driver Share</th>
                <th className="py-2.5 px-4 text-right">Total Expenses</th>
                <th className="py-2.5 px-4 text-right">Net Business</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs font-mono">
              {logbookEntries.slice(0, 5).map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 text-slate-900">{e.entryDate}</td>
                  <td className="py-2.5 px-4 font-bold text-slate-900">
                    {e.vehicleRegNo}
                  </td>
                  <td className="py-2.5 px-4 font-sans text-slate-700">
                    {e.driverName}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-700">
                    {formatKm(e.kmDay)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                    {formatINR(e.earnings)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-700">
                    {formatINR(e.driverShare)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-amber-800">
                    {formatINR(e.totalExpenses)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-teal-700">
                    {formatINR(e.netBusinessEarnings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
