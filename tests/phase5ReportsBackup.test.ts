import { describe, expect, it } from 'vitest';
import { calculateLogbookFinancials, resolveCalculationOptions } from '../src/lib/calculations';
import { buildFleetBackupSnapshot, build15ColCsvString } from '../src/lib/googleDriveBackup';
import { withRetry } from '../src/lib/retry';
import type { DailyLogbookEntry } from '../src/types/fleet';

const entryBase: DailyLogbookEntry = {
  id: 'e1', ownerId: 'demo-owner', vehicleId: 'v1',
  vehicleRegistration: 'TN-38-CZ-4512', driverId: 'd1', driverName: 'Karthik',
  date: '2026-10-25', shiftNumber: 1, startingKm: 10000, endingKm: 10250,
  kmDay: 250, attendance: 'Present', earnings: 1250, unitPrice: 5,
  driverSharePct: 20, driverShare: 250, gasFuel: 200, redTaxi: 0, toll: 50,
  maintenance: 0, otherExpenses: 0, totalExpenses: 450,
  netBusinessEarnings: 800, sourceRemarks: '', createdAt: '', updatedAt: '',
};

describe('report totals (financial summary aggregation)', () => {
  it('aggregates km, earnings, expenses and net across entries decimal-safely', () => {
    const entries = [
      entryBase,
      { ...entryBase, id: 'e2', kmDay: 100.5, earnings: 333.33, driverShare: 66.67, totalExpenses: 120.4, netBusinessEarnings: 212.93 },
      { ...entryBase, id: 'e3', kmDay: 50, earnings: 0.1, driverShare: 0.02, totalExpenses: 0.05, netBusinessEarnings: 0.05 },
    ];
    const snap = buildFleetBackupSnapshot({
      profile: null, vehicles: [], drivers: [], logbookEntries: entries,
      serviceRecords: [], complianceDocuments: [], vehicleMedia: [],
      notificationLogs: [], isDemoMode: true,
    });
    const f = snap.financialSummary;
    expect(f.totalKmDriven).toBe(400.5);
    expect(f.grossEarningsInr).toBe(1583.43);
    expect(f.driverShareSeparatedInr).toBe(316.69);
    expect(f.logbookOperatingExpensesInr).toBe(570.45);
    expect(f.netLogbookEarningsInr).toBe(1012.98);
    // totals must reconcile: net == gross - expenses for these fixtures
    expect(f.netLogbookEarningsInr).toBeCloseTo(f.grossEarningsInr - f.logbookOperatingExpensesInr, 2);
  });

  it('per-entry financials stay consistent under the spec default (driver share inside expenses)', () => {
    const r = calculateLogbookFinancials({
      startingKm: 10000, endingKm: 10250, earnings: 1250,
      driverSharePct: 20, gasFuel: 200, redTaxi: 0, toll: 50, maintenance: 0, otherExpenses: 0,
    }, resolveCalculationOptions(null)); // spec default: share inside expenses
    expect(r.kmDay).toBe(250);
    expect(r.driverShare).toBe(250);
    expect(r.totalExpenses).toBe(500); // 250 share + 200 fuel + 50 toll
    expect(r.netBusinessEarnings).toBe(750);
  });
});

describe('15-column CSV backup export', () => {
  it('emits the full ledger header and one row per entry with escaping', () => {
    const csv = build15ColCsvString([
      { ...entryBase, sourceRemarks: 'Airport, "long" run' },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Starting KM');
    expect(lines[0]).toContain('Total Expenses (INR)');
    expect(lines[0]).toContain('Net Business Earnings (INR)');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Airport, ""long"" run"');
  });
});

describe('backup upload failure and retry', () => {
  const noSleep = () => Promise.resolve();

  it('retries a failing upload and succeeds within max attempts', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('Drive HTTP 503');
        return 'uploaded';
      },
      { maxAttempts: 3, sleep: noSleep }
    );
    expect(result).toBe('uploaded');
    expect(calls).toBe(3);
  });

  it('surfaces the failure honestly after exhausting attempts - never fakes success', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error('Drive HTTP 401 unauthorized');
        },
        { maxAttempts: 3, sleep: noSleep }
      )
    ).rejects.toThrow('Drive HTTP 401 unauthorized');
    expect(calls).toBe(3);
  });

  it('does not retry when maxAttempts is 1', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls += 1; throw new Error('boom'); }, { maxAttempts: 1, sleep: noSleep })
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
});
