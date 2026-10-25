import { describe, expect, it } from 'vitest';
import { validateLogbookEntryInput } from '../src/lib/calculations';
import { DailyLogbookEntry } from '../src/types/fleet';

const mkEntry = (over: Partial<DailyLogbookEntry> = {}): DailyLogbookEntry =>
  ({
    id: 'e1',
    ownerId: 'o1',
    vehicleId: 'v1',
    vehicleRegistration: 'TN45AB1234',
    driverId: 'd1',
    driverName: 'Driver One',
    date: '2026-10-20',
    shiftNumber: 1,
    startingKm: 10000,
    endingKm: 10100,
    kmDay: 100,
    attendance: 'Present',
    earnings: 3000,
    unitPrice: 30,
    driverSharePct: 30,
    driverShare: 900,
    gasFuel: 500,
    redTaxi: 0,
    toll: 0,
    maintenance: 0,
    otherExpenses: 0,
    totalExpenses: 500,
    netBusinessEarnings: 1600,
    sourceRemarks: '',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    ...over,
  }) as DailyLogbookEntry;

describe('manual odometer correction requires a reason', () => {
  it('rejects a starting KM that breaks continuity without a reason', () => {
    const r = validateLogbookEntryInput(
      { vehicleId: 'v1', date: '2026-10-21', startingKm: 9500, endingKm: 9700 },
      [],
      { currentOdometerKm: 10100 } as any
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/correction requires a reason/i);
  });

  it('accepts the same correction with an explicit reason', () => {
    const r = validateLogbookEntryInput(
      {
        vehicleId: 'v1',
        date: '2026-10-21',
        startingKm: 9500,
        endingKm: 9700,
        odometerCorrectionReason: 'Odometer cluster replaced at workshop',
      },
      [],
      { currentOdometerKm: 10100 } as any
    );
    expect(r.errors.join(' ')).not.toMatch(/correction requires a reason/i);
  });

  it('does not demand a reason when starting KM matches the odometer', () => {
    const r = validateLogbookEntryInput(
      { vehicleId: 'v1', date: '2026-10-21', startingKm: 10100, endingKm: 10250 },
      [],
      { currentOdometerKm: 10100 } as any
    );
    expect(r.valid).toBe(true);
  });
});

describe('one daily summary per vehicle/date', () => {
  it('warns that same-day shifts aggregate into one daily summary', () => {
    const existing = [mkEntry()];
    const r = validateLogbookEntryInput(
      { vehicleId: 'v1', date: '2026-10-20', shiftNumber: 2, startingKm: 10100, endingKm: 10200 },
      existing
    );
    expect(r.warnings.join(' ')).toMatch(/Daily Summary aggregates/i);
  });
});

describe('duplicate maintenance expense posting', () => {
  it('warns when the same maintenance amount is already logged that day', () => {
    const existing = [mkEntry({ maintenance: 1200 })];
    const r = validateLogbookEntryInput(
      { vehicleId: 'v1', date: '2026-10-20', shiftNumber: 2, startingKm: 10100, endingKm: 10200, maintenance: 1200 },
      existing
    );
    expect(r.warnings.join(' ')).toMatch(/duplicate maintenance posting/i);
  });

  it('does not warn for a different amount or a different day', () => {
    const existing = [mkEntry({ maintenance: 1200 })];
    const diffAmount = validateLogbookEntryInput(
      { vehicleId: 'v1', date: '2026-10-20', shiftNumber: 2, startingKm: 10100, endingKm: 10200, maintenance: 800 },
      existing
    );
    expect(diffAmount.warnings.join(' ')).not.toMatch(/duplicate maintenance/i);
    const diffDay = validateLogbookEntryInput(
      { vehicleId: 'v1', date: '2026-10-21', shiftNumber: 1, startingKm: 10100, endingKm: 10200, maintenance: 1200 },
      existing
    );
    expect(diffDay.warnings.join(' ')).not.toMatch(/duplicate maintenance/i);
  });
});
