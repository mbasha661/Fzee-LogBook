import {describe, expect, it} from 'vitest';
import {
  calculateLogbookFinancials,
  formatINR,
  formatKm,
  roundCurrency,
  roundKm,
} from '../src/lib/calculations';

describe('calculateLogbookFinancials', () => {
  it('applies the exact 15-column formulas', () => {
    const r = calculateLogbookFinancials({
      startingKm: 64100,
      endingKm: 64360,
      earnings: 4850,
      driverSharePct: 30,
      gasFuel: 1120,
      redTaxi: 485,
      toll: 140,
      maintenance: 0,
      otherExpenses: 0,
    });
    expect(r.kmDay).toBe(260);
    expect(r.unitPrice).toBe(18.65);
    expect(r.driverShare).toBe(1455);
    expect(r.totalExpenses).toBe(1745);
    expect(r.netBusinessEarnings).toBe(1650);
  });

  it('includes otherExpenses in total expenses but never in driver share', () => {
    const r = calculateLogbookFinancials({
      startingKm: 0,
      endingKm: 100,
      earnings: 1000,
      driverSharePct: 20,
      gasFuel: 100,
      redTaxi: 50,
      toll: 25,
      maintenance: 25,
      otherExpenses: 300,
    });
    expect(r.totalExpenses).toBe(500);
    expect(r.driverShare).toBe(200);
    expect(r.netBusinessEarnings).toBe(300);
  });

  it('clamps driver share percentage above 100 down to 100', () => {
    const r = calculateLogbookFinancials({
      startingKm: 0,
      endingKm: 10,
      earnings: 500,
      driverSharePct: 150,
      gasFuel: 0,
      redTaxi: 0,
      toll: 0,
      maintenance: 0,
    });
    expect(r.driverShare).toBe(500);
    expect(r.netBusinessEarnings).toBe(0);
  });

  it('clamps negative share percentage up to 0', () => {
    const r = calculateLogbookFinancials({
      startingKm: 0,
      endingKm: 10,
      earnings: 500,
      driverSharePct: -20,
      gasFuel: 0,
      redTaxi: 0,
      toll: 0,
      maintenance: 0,
    });
    expect(r.driverShare).toBe(0);
    expect(r.netBusinessEarnings).toBe(500);
  });

  it('clamps negative odometer and money inputs to zero', () => {
    const r = calculateLogbookFinancials({
      startingKm: -100,
      endingKm: 50,
      earnings: -1000,
      driverSharePct: 30,
      gasFuel: -50,
      redTaxi: -50,
      toll: -50,
      maintenance: -50,
    });
    expect(r.kmDay).toBe(50);
    expect(r.driverShare).toBe(0);
    expect(r.totalExpenses).toBe(0);
    expect(r.netBusinessEarnings).toBe(0);
  });

  it('returns kmDay 0 and unitPrice 0 when ending KM is below starting KM', () => {
    const r = calculateLogbookFinancials({
      startingKm: 500,
      endingKm: 400,
      earnings: 900,
      driverSharePct: 30,
      gasFuel: 0,
      redTaxi: 0,
      toll: 0,
      maintenance: 0,
    });
    expect(r.kmDay).toBe(0);
    expect(r.unitPrice).toBe(0);
    expect(r.driverShare).toBe(270);
  });

  it('treats NaN and non-numeric money as zero', () => {
    const r = calculateLogbookFinancials({
      startingKm: Number('abc'),
      endingKm: Number('abc'),
      earnings: Number('abc'),
      driverSharePct: Number('abc'),
      gasFuel: Number('abc'),
      redTaxi: Number('abc'),
      toll: Number('abc'),
      maintenance: Number('abc'),
    });
    expect(r.kmDay).toBe(0);
    expect(r.unitPrice).toBe(0);
    expect(r.driverShare).toBe(0);
    expect(r.totalExpenses).toBe(0);
    expect(r.netBusinessEarnings).toBe(0);
  });

  it('rounds fractional currency to 2 decimals', () => {
    const r = calculateLogbookFinancials({
      startingKm: 0,
      endingKm: 3,
      earnings: 100,
      driverSharePct: 33.33,
      gasFuel: 10.555,
      redTaxi: 0,
      toll: 0,
      maintenance: 0,
    });
    expect(r.unitPrice).toBe(33.33);
    expect(r.driverShare).toBe(33.33);
    expect(r.totalExpenses).toBe(10.56);
  });

  it('allows negative net when costs exceed earnings', () => {
    const r = calculateLogbookFinancials({
      startingKm: 0,
      endingKm: 10,
      earnings: 100,
      driverSharePct: 30,
      gasFuel: 500,
      redTaxi: 0,
      toll: 0,
      maintenance: 0,
    });
    expect(r.netBusinessEarnings).toBe(-430);
  });
});

describe('roundCurrency', () => {
  it('rounds half-up at 2 decimals without floating point drift', () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(2.675)).toBe(2.68);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });
  it('maps non-finite values to 0', () => {
    expect(roundCurrency(NaN)).toBe(0);
    expect(roundCurrency(Infinity)).toBe(0);
    expect(roundCurrency(-Infinity)).toBe(0);
  });
  it('keeps negative values negative', () => {
    expect(roundCurrency(-3.456)).toBe(-3.46);
  });
});

describe('roundKm', () => {
  it('rounds to 1 decimal', () => {
    expect(roundKm(1.05)).toBe(1.1);
    expect(roundKm(64.94)).toBe(64.9);
    expect(roundKm(0.04)).toBe(0);
  });
  it('maps non-finite values to 0', () => {
    expect(roundKm(NaN)).toBe(0);
    expect(roundKm(Infinity)).toBe(0);
  });
});

describe('formatINR', () => {
  it('formats with en-IN grouping and 2 decimals by default', () => {
    expect(formatINR(1650)).toBe('₹1,650.00');
    expect(formatINR(1234567.5)).toBe('₹12,34,567.50');
  });
  it('formats compact with 0 decimals', () => {
    expect(formatINR(1650, true)).toBe('₹1,650');
  });
  it('renders non-finite amounts as zero', () => {
    expect(formatINR(NaN)).toBe('₹0.00');
  });
});

describe('formatKm', () => {
  it('formats with en-IN grouping and km suffix', () => {
    expect(formatKm(64940)).toBe('64,940 km');
    expect(formatKm(0)).toBe('0 km');
  });
  it('renders non-finite km as zero', () => {
    expect(formatKm(NaN)).toBe('0 km');
  });
});
