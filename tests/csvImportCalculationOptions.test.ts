import {describe, expect, it} from 'vitest';
import {
  parseLogbookCsvImport,
  resolveCalculationOptions,
} from '../src/lib/calculations';
import type {Driver, Vehicle} from '../src/types/fleet';

const vehicle = {
  id: 'veh-1',
  registrationNumber: 'TN48BH3999',
  assignedDriverId: 'drv-1',
  assignedDriverName: 'Elamurugan',
  status: 'Active',
} as unknown as Vehicle;

const driver = {
  id: 'drv-1',
  fullName: 'Elamurugan',
  defaultSharePct: 30,
} as unknown as Driver;

const csv = [
  'Date,Vehicle,Shift,Start KM,End KM,Attendance,Earnings,SharePct,Gas,RedTaxi,Toll,Maintenance,Other,Remarks',
  '2026-10-17,TN48BH3999,1,82678,82889,Present,3593.55,30,1256.62,0,0,300,0,Red Taxi',
].join('\n');

describe('parseLogbookCsvImport calculation options', () => {
  it('honours profile-resolved share-inclusive expense totals', () => {
    const rows = parseLogbookCsvImport(
      csv,
      [vehicle],
      [driver],
      30,
      undefined,
      resolveCalculationOptions(null) // spec default: share included
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].valid).toBe(true);
    // share 1078.07 + gas 1256.62 + maint 300
    expect(rows[0].entry.totalExpenses).toBe(2634.69);
    expect(rows[0].entry.netBusinessEarnings).toBe(958.86);
    expect(rows[0].entry.driverName).toBe('Elamurugan');
  });

  it('honours an explicit share-exclusive profile setting', () => {
    const rows = parseLogbookCsvImport(
      csv,
      [vehicle],
      [driver],
      30,
      undefined,
      resolveCalculationOptions({includeDriverShareInExpenses: false})
    );
    expect(rows[0].entry.totalExpenses).toBe(1556.62); // gas + maint only
    // Net always subtracts the share exactly once
    expect(rows[0].entry.netBusinessEarnings).toBe(958.86);
  });

  it('keeps legacy share-exclusive default when no options are passed', () => {
    const rows = parseLogbookCsvImport(csv, [vehicle], [driver], 30);
    expect(rows[0].entry.totalExpenses).toBe(1556.62);
    expect(rows[0].entry.netBusinessEarnings).toBe(958.86);
  });
});
