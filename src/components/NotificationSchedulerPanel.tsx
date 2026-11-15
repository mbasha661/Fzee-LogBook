import React, { useEffect, useMemo, useState } from 'react';
import { useFleet } from '../context/FleetContext';
import type {
  SchedulerSettings,
  SchedulerSnapshot,
  DeliveryLogEntry,
} from '../server/notificationScheduler';

/**
 * Server-side Scheduled Notification Engine panel.
 * Settings persist on the owner profile (notificationSchedulerConfig JSON)
 * and are pushed, together with a fleet snapshot, to the server scheduler.
 * Delivery happens server-side via the official WhatsApp Cloud API and a
 * configured email relay only - never through personal WhatsApp Web, and
 * unconfigured channels are honestly reported as SKIPPED.
 */
export const NotificationSchedulerPanel: React.FC = () => {
  const {
    profile,
    vehicles,
    logbookEntries,
    complianceDocuments,
    updateProfileConfig,
    isDemoMode,
  } = useFleet();

  const [settings, setSettings] = useState<SchedulerSettings>({
    enabled: false,
    channel: 'both',
    recipientEmail: profile?.alertEmail || '',
    whatsappNumber: profile?.whatsappNumber || '',
    dailySummaryEnabled: true,
    dailySummaryTimeKolkata: '21:00',
    expiryReminderEnabled: true,
    reminderIntervalDays: [10, 5, 1],
    serviceReminderEnabled: true,
  });
  const [consentChecked, setConsentChecked] = useState(false);
  const [intervalsInput, setIntervalsInput] = useState('10, 5, 1');
  const [log, setLog] = useState<DeliveryLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    if (profile?.notificationSchedulerConfig) {
      try {
        const parsed = JSON.parse(
          profile.notificationSchedulerConfig
        ) as SchedulerSettings;
        setSettings((s) => ({ ...s, ...parsed }));
        setIntervalsInput((parsed.reminderIntervalDays || [10, 5, 1]).join(', '));
        setConsentChecked(Boolean(parsed.consentGivenAt));
      } catch {
        /* keep defaults */
      }
    }
  }, [profile?.notificationSchedulerConfig]);

  const buildSnapshot = (): SchedulerSnapshot => ({
    businessName: profile?.businessName || 'FzeeLog Fleet',
    vehicles: vehicles.map((v) => ({
      id: v.id,
      registrationNumber: v.registrationNumber,
      currentOdometerKm: v.currentOdometerKm,
      nextServiceDate: v.nextServiceDate,
      nextServiceOdometerKm: v.nextServiceOdometerKm,
    })),
    logbookEntries: logbookEntries.map((e) => ({
      vehicleId: e.vehicleId,
      date: e.date,
      startingKm: e.startingKm,
      endingKm: e.endingKm,
      kmDay: e.kmDay,
      attendance: e.attendance,
      earnings: e.earnings,
      unitPrice: e.unitPrice,
      driverShare: e.driverShare,
      gasFuel: e.gasFuel,
      redTaxi: e.redTaxi,
      toll: e.toll,
      maintenance: e.maintenance,
      totalExpenses: e.totalExpenses,
      netBusinessEarnings: e.netBusinessEarnings,
      sourceRemarks: e.sourceRemarks,
    })),
    complianceItems: complianceDocuments.map((d) => ({
      id: d.id,
      category: d.documentType,
      entityLabel: d.entityLabel || d.targetLabel,
      expiryDate: d.expiryDate,
    })),
    updatedAt: new Date().toISOString(),
  });

  const refreshLog = async () => {
    try {
      const res = await fetch('/api/notifications/scheduler/delivery-log');
      if (res.ok) {
        const data = (await res.json()) as { entries: DeliveryLogEntry[] };
        setLog(data.entries || []);
      }
    } catch {
      setStatus('Delivery log unavailable (server scheduler not reachable).');
    }
  };

  useEffect(() => {
    refreshLog();
  }, []);

  const syncToServer = async (next: SchedulerSettings) => {
    const res = await fetch('/api/notifications/scheduler/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: next, snapshot: buildSnapshot() }),
    });
    if (!res.ok) throw new Error(`Sync failed (HTTP ${res.status})`);
  };

  const onSave = async () => {
    setBusy(true);
    setStatus('');
    try {
      const intervals = intervalsInput
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 365);
      const next: SchedulerSettings = {
        ...settings,
        reminderIntervalDays: intervals.length ? intervals : [10, 5, 1],
        consentGivenAt: consentChecked
          ? settings.consentGivenAt || new Date().toISOString()
          : undefined,
      };
      await updateProfileConfig({
        notificationSchedulerConfig: JSON.stringify(next),
      } as any);
      await syncToServer(next);
      setSettings(next);
      setStatus('Saved and synced to the server scheduler.');
      await refreshLog();
    } catch (err: any) {
      setStatus(err?.message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const onTickNow = async () => {
    setBusy(true);
    try {
      await fetch('/api/notifications/scheduler/tick-now', { method: 'POST' });
      await refreshLog();
      setStatus('Scheduler cycle executed. Delivery log refreshed.');
    } catch {
      setStatus('Manual cycle failed (server not reachable).');
    } finally {
      setBusy(false);
    }
  };

  const statusColor = useMemo(
    () =>
      status.includes('Saved') || status.includes('executed')
        ? 'text-emerald-600'
        : 'text-rose-600',
    [status]
  );

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900">
          Scheduled Notification Engine (Server-Side)
        </h3>
        <p className="text-xs text-slate-500">
          Daily logbook summaries, statutory expiry reminders at your chosen
          intervals, and service reminders - dispatched by the server even when
          the app is closed. Uses the official WhatsApp Business Cloud API and
          a configured email relay only. Personal WhatsApp Web is never used.
          Every dispatch is deduplicated, retried on failure, and recorded in
          the delivery log below.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              setSettings({ ...settings, enabled: e.target.checked })
            }
          />
          <span className="font-medium text-slate-700">
            Enable scheduled notifications
          </span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-slate-600">Channel</span>
          <select
            className="border border-slate-300 rounded-lg px-2 py-1"
            value={settings.channel}
            onChange={(e) =>
              setSettings({
                ...settings,
                channel: e.target.value as SchedulerSettings['channel'],
              })
            }
          >
            <option value="both">Email + WhatsApp</option>
            <option value="email">Email only</option>
            <option value="whatsapp">WhatsApp only</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-slate-600">Daily summary at (IST)</span>
          <input
            type="time"
            className="border border-slate-300 rounded-lg px-2 py-1"
            value={settings.dailySummaryTimeKolkata}
            onChange={(e) =>
              setSettings({
                ...settings,
                dailySummaryTimeKolkata: e.target.value,
              })
            }
          />
        </label>
        <label className="flex items-center gap-2 md:col-span-1">
          <span className="text-slate-600">Recipient email</span>
          <input
            type="email"
            className="border border-slate-300 rounded-lg px-2 py-1 flex-1"
            value={settings.recipientEmail || ''}
            onChange={(e) =>
              setSettings({ ...settings, recipientEmail: e.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-2 md:col-span-1">
          <span className="text-slate-600">WhatsApp number</span>
          <input
            type="tel"
            className="border border-slate-300 rounded-lg px-2 py-1 flex-1"
            value={settings.whatsappNumber || ''}
            onChange={(e) =>
              setSettings({ ...settings, whatsappNumber: e.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-slate-600">Reminder intervals (days)</span>
          <input
            type="text"
            className="border border-slate-300 rounded-lg px-2 py-1 w-32"
            value={intervalsInput}
            onChange={(e) => setIntervalsInput(e.target.value)}
            placeholder="10, 5, 1"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.dailySummaryEnabled}
            onChange={(e) =>
              setSettings({
                ...settings,
                dailySummaryEnabled: e.target.checked,
              })
            }
          />
          <span className="text-slate-700">Daily summary</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.expiryReminderEnabled}
            onChange={(e) =>
              setSettings({
                ...settings,
                expiryReminderEnabled: e.target.checked,
              })
            }
          />
          <span className="text-slate-700">Expiry reminders</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.serviceReminderEnabled}
            onChange={(e) =>
              setSettings({
                ...settings,
                serviceReminderEnabled: e.target.checked,
              })
            }
          />
          <span className="text-slate-700">Service reminders</span>
        </label>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
        />
        <span>
          I consent to FzeeLogBook sending scheduled fleet notifications to the
          recipients above through the official WhatsApp Business Cloud API
          and/or email. No messages are dispatched until this consent is
          recorded. Channels without configured credentials are reported as
          SKIPPED in the delivery log - never faked as sent.
          {settings.consentGivenAt && consentChecked && (
            <span className="block mt-1 text-emerald-700 font-medium">
              Consent recorded at{' '}
              {new Date(settings.consentGivenAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
              })}{' '}
              IST.
            </span>
          )}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onSave}
          disabled={busy || isDemoMode}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          Save &amp; Sync Scheduler
        </button>
        <button
          onClick={onTickNow}
          disabled={busy}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          Run Cycle Now
        </button>
        <button
          onClick={refreshLog}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold"
        >
          Refresh Delivery Log
        </button>
        {status && <span className={`text-xs font-medium ${statusColor}`}>{status}</span>}
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
          Server Delivery Log ({log.length})
        </div>
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
          {log.length === 0 && (
            <p className="px-3 py-3 text-xs text-slate-400">
              No server dispatch attempts recorded yet.
            </p>
          )}
          {log.slice(0, 50).map((entry) => (
            <div key={entry.id} className="px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-1">
              <span
                className={`font-bold ${
                  entry.status === 'SENT'
                    ? 'text-emerald-600'
                    : entry.status === 'FAILED'
                      ? 'text-rose-600'
                      : 'text-amber-600'
                }`}
              >
                {entry.status}
              </span>
              <span className="text-slate-500">{entry.channel}</span>
              <span className="text-slate-700">{entry.detail}</span>
              <span className="text-slate-400">
                attempts: {entry.attempts} ·{' '}
                {new Date(entry.updatedAt).toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                })}
              </span>
              {entry.error && (
                <span className="text-rose-500 w-full">{entry.error}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
