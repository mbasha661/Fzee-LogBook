import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  NotificationScheduler,
  buildDailySummaryBody,
  kolkataHHMM,
  kolkataToday,
  type SendFn,
  type SchedulerSnapshot,
} from '../src/server/notificationScheduler';

const snapshot: SchedulerSnapshot = {
  businessName: 'Fzee Fleet',
  vehicles: [
    {
      id: 'v1',
      registrationNumber: 'TN-38-CZ-4512',
      currentOdometerKm: 48500,
      nextServiceDate: '2026-10-28',
      nextServiceOdometerKm: 48800,
    },
  ],
  logbookEntries: [
    {
      vehicleId: 'v1',
      date: '2026-10-25',
      startingKm: 48000,
      endingKm: 48500,
      kmDay: 500,
      attendance: 'Present',
      earnings: 2500,
      unitPrice: 5,
      driverShare: 500,
      gasFuel: 300,
      redTaxi: 0,
      toll: 100,
      maintenance: 50,
      totalExpenses: 950,
      netBusinessEarnings: 1550,
      sourceRemarks: 'Airport run',
    },
  ],
  complianceItems: [
    { id: 'c1', category: 'Insurance', entityLabel: 'TN-38-CZ-4512', expiryDate: '2026-11-04' },
  ],
  updatedAt: '2026-10-25T00:00:00Z',
};

const baseSettings = {
  ...DEFAULT_SETTINGS,
  enabled: true,
  consentGivenAt: '2026-10-25T00:00:00Z',
  channel: 'email' as const,
  recipientEmail: 'owner@example.com',
  dailySummaryTimeKolkata: '00:00',
  reminderIntervalDays: [10, 5, 1],
};

// 2026-10-25 21:30 IST
const atTime = () => new Date('2026-10-25T16:00:00Z');

const makeScheduler = (send?: SendFn, now: () => Date = atTime) => {
  const scheduler = new NotificationScheduler(send ?? (async () => ({ ok: true })), now);
  scheduler.updateSettings(baseSettings);
  scheduler.updateSnapshot(snapshot);
  return scheduler;
};

describe('notification scheduler', () => {
  it('kolkata date/time helpers are timezone-correct', () => {
    expect(kolkataToday(atTime())).toBe('2026-10-25');
    expect(kolkataHHMM(atTime())).toBe('21:30');
  });

  it('daily summary body carries the full logbook row and service info', () => {
    const body = buildDailySummaryBody('2026-10-25', 'Fzee Fleet', snapshot.vehicles, snapshot.logbookEntries);
    for (const field of ['Starting KM: 48000', 'Ending KM: 48500', 'KM/DAY: 500', 'Earnings: Rs.2500.00', 'Driver Share: Rs.500.00', 'Total Expenses: Rs.950.00', 'Net Earnings: Rs.1550.00', 'Current KM: 48500', 'Next Service: 2026-10-28 / 48800 km']) {
      expect(body).toContain(field);
    }
  });

  it('dispatches daily summary + expiry + service reminders once, never duplicated', async () => {
    const sent: string[] = [];
    const s = makeScheduler(async (_c, _r, subject) => { sent.push(subject); return { ok: true }; });
    await s.tick();
    const firstCount = sent.length;
    expect(firstCount).toBeGreaterThanOrEqual(3); // summary + expiry(10d) + service-km + service-date
    await s.tick();
    await s.tick();
    expect(sent.length).toBe(firstCount); // dedupe: no repeats
    const log = s.getDeliveryLog();
    expect(log.every((l) => l.status === 'SENT')).toBe(true);
    expect(log.filter((l) => l.jobType === 'DAILY_SUMMARY')).toHaveLength(1);
  });

  it('never sends twice for the same expiry milestone on later days', async () => {
    const sent: string[] = [];
    let dayOffset = 0;
    const s = new NotificationScheduler(
      async (_c, _r, subject) => { sent.push(subject); return { ok: true }; },
      () => new Date(atTime().getTime() + dayOffset * 86_400_000)
    );
    s.updateSettings(baseSettings);
    s.updateSnapshot(snapshot);
    await s.tick(); // 10-day milestone for c1
    const sentDay1 = sent.filter((x) => x.includes('Expiry reminder')).length;
    expect(sentDay1).toBe(1);
    await s.tick(); // same day, same milestone
    expect(sent.filter((x) => x.includes('Expiry reminder')).length).toBe(1);
  });

  it('retries a failed dispatch with backoff and succeeds within max attempts', async () => {
    let calls = 0;
    let clock = atTime().getTime();
    const s = new NotificationScheduler(
      async () => {
        calls += 1;
        return calls < 3 ? { ok: false, error: 'upstream 500' } : { ok: true };
      },
      () => new Date(clock)
    );
    s.updateSettings({ ...baseSettings, dailySummaryEnabled: false, expiryReminderEnabled: false, serviceReminderEnabled: true });
    s.updateSnapshot({ ...snapshot, complianceItems: [], vehicles: [{ ...snapshot.vehicles[0], nextServiceDate: undefined }] });
    await s.tick(); // attempt 1 fails (service-km)
    expect(calls).toBe(1);
    clock += 61_000;
    await s.tick(); // retry attempt 2 fails
    expect(calls).toBe(2);
    clock += 301_000;
    await s.tick(); // retry attempt 3 succeeds
    expect(calls).toBe(3);
    const entry = s.getDeliveryLog().find((l) => l.dedupeKey.startsWith('service-km:'));
    expect(entry?.status).toBe('SENT');
    expect(entry?.attempts).toBe(3);
    clock += 1_000_000;
    await s.tick(); // no more retries after success
    expect(calls).toBe(3);
  });

  it('skips dispatch without owner consent and never calls the sender', async () => {
    let calls = 0;
    const s = makeScheduler(async () => { calls += 1; return { ok: true }; });
    s.updateSettings({ consentGivenAt: undefined });
    await s.tick();
    expect(calls).toBe(0);
    expect(s.getDeliveryLog().every((l) => l.status === 'SKIPPED' && l.detail.includes('consent'))).toBe(true);
  });

  it('labels unconfigured channels as SKIPPED, not SENT', async () => {
    const s = makeScheduler(async () => ({ ok: false, notConfigured: true, error: 'no SMTP creds' }));
    s.updateSettings({ dailySummaryEnabled: true, expiryReminderEnabled: false, serviceReminderEnabled: false });
    await s.tick();
    const entry = s.getDeliveryLog().find((l) => l.jobType === 'DAILY_SUMMARY');
    expect(entry?.status).toBe('SKIPPED');
    expect(entry?.detail).toContain('not configured');
  });

  it('does nothing when the scheduler is disabled', async () => {
    let calls = 0;
    const s = makeScheduler(async () => { calls += 1; return { ok: true }; });
    s.updateSettings({ enabled: false });
    await s.tick();
    expect(calls).toBe(0);
    expect(s.getDeliveryLog()).toHaveLength(0);
  });
});
