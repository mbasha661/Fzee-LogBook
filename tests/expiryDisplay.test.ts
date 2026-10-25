import {describe, expect, it} from 'vitest';
import {
  describeDocumentExpiry,
  describeServiceDue,
  getDaysUntilExpiry,
  getTodayKolkataDate,
} from '../src/lib/calculations';

describe('getTodayKolkataDate', () => {
  it('returns a YYYY-MM-DD date string', () => {
    expect(getTodayKolkataDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getDaysUntilExpiry', () => {
  it('returns null for empty or malformed dates', () => {
    expect(getDaysUntilExpiry('')).toBeNull();
    expect(getDaysUntilExpiry('20/02/2025')).toBeNull();
    expect(getDaysUntilExpiry('2025-2-2')).toBeNull();
  });

  it('returns 0 for today and 1 for tomorrow in the Kolkata timezone', () => {
    const today = getTodayKolkataDate();
    expect(getDaysUntilExpiry(today)).toBe(0);
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    expect(getDaysUntilExpiry(tomorrow.toISOString().slice(0, 10))).toBe(1);
  });

  it('returns a negative number for past dates', () => {
    expect(getDaysUntilExpiry('2020-01-01')).toBeLessThan(0);
  });

  it('returns a positive number for far-future dates', () => {
    expect(getDaysUntilExpiry('2999-01-01')).toBeGreaterThan(0);
  });
});

describe('describeDocumentExpiry', () => {
  it('describes an expired document without a negative "expires in"', () => {
    expect(describeDocumentExpiry(-431)).toEqual({
      kind: 'expired',
      text: 'Doc expired 431d ago',
    });
    expect(describeDocumentExpiry(-1)).toEqual({
      kind: 'expired',
      text: 'Doc expired 1d ago',
    });
  });

  it('describes a document expiring today', () => {
    expect(describeDocumentExpiry(0)).toEqual({
      kind: 'today',
      text: 'Doc expires today',
    });
  });

  it('describes an upcoming expiry inside the warning window', () => {
    expect(describeDocumentExpiry(5)).toEqual({
      kind: 'upcoming',
      text: 'Doc expires in 5d',
    });
    expect(describeDocumentExpiry(30)).toEqual({
      kind: 'upcoming',
      text: 'Doc expires in 30d',
    });
  });

  it('renders nothing outside the warning window or when unknown', () => {
    expect(describeDocumentExpiry(31).kind).toBe('none');
    expect(describeDocumentExpiry(undefined).kind).toBe('none');
  });

  it('honors a custom warning window', () => {
    expect(describeDocumentExpiry(20, 10).kind).toBe('none');
    expect(describeDocumentExpiry(9, 10).kind).toBe('upcoming');
  });
});

describe('describeServiceDue', () => {
  it('describes an overdue service with a positive distance', () => {
    expect(describeServiceDue(-500)).toEqual({
      severity: 'overdue',
      text: 'Service overdue by 500 km',
    });
  });

  it('flags services inside the soon threshold', () => {
    expect(describeServiceDue(0).severity).toBe('soon');
    expect(describeServiceDue(800)).toEqual({
      severity: 'soon',
      text: 'Service in 800 km',
    });
    expect(describeServiceDue(1000).severity).toBe('soon');
  });

  it('reports ok beyond the soon threshold', () => {
    expect(describeServiceDue(5000)).toEqual({
      severity: 'ok',
      text: 'Service in 5,000 km',
    });
  });

  it('honors a custom soon threshold', () => {
    expect(describeServiceDue(1500, 2000).severity).toBe('soon');
    expect(describeServiceDue(2500, 2000).severity).toBe('ok');
  });
});
