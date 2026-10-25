import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ta } from '../src/i18n/ta';

function keys(obj: unknown, prefix = ''): string[] {
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? keys(v, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

describe('i18n string tables', () => {
  it('tamil table mirrors every english key', () => {
    expect(keys(ta).sort()).toEqual(keys(en).sort());
  });

  it('no empty strings in either table', () => {
    for (const table of [en, ta]) {
      for (const key of keys(table)) {
        const val = key.split('.').reduce<unknown>(
          (o, part) => (o as Record<string, unknown>)[part],
          table
        );
        expect(typeof val).toBe('string');
        expect((val as string).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('english logbook table preserves the exact 15-column ledger labels', () => {
    const labels = Object.values(en.logbook);
    for (const required of [
      'Date', 'Vehicle ID', 'Driver ID (Optional)', 'Starting KM',
      'Ending KM', 'KM/DAY', 'Attendance', 'Earnings', 'Unit Price',
      'Driver Share', 'Gas/Fuel', 'Red Taxi', 'Toll', 'Maintenance',
      'Total Expenses', 'Net Earnings', 'Source/Remarks',
    ]) {
      expect(labels).toContain(required);
    }
  });
});
