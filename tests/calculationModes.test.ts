import { describe, expect, it } from 'vitest';
import {
  calculateLogbookFinancials,
  resolveCalculationOptions,
} from '../src/lib/calculations';

const baseInput = {
  startingKm: 10000,
  endingKm: 10180,
  earnings: 4800,
  driverSharePct: 30,
  gasFuel: 1050,
  redTaxi: 380,
  toll: 90,
  maintenance: 0,
  otherExpenses: 0,
};

describe('Unit Price configurable meaning', () => {
  it('derives per-kilometre rate by default (legacy behaviour)', () => {
    const r = calculateLogbookFinancials(baseInput);
    expect(r.kmDay).toBe(180);
    expect(r.unitPrice).toBeCloseTo(4800 / 180, 2);
    expect(r.unitPriceModeApplied).toBe('PER_KM_DERIVED');
  });

  it('supports per-day derived meaning', () => {
    const r = calculateLogbookFinancials(baseInput, {
      unitPriceMode: 'PER_DAY_DERIVED',
    });
    expect(r.unitPrice).toBe(4800);
  });

  it('supports manual meaning entered by the user', () => {
    const r = calculateLogbookFinancials(baseInput, {
      unitPriceMode: 'MANUAL',
      manualUnitPrice: 25.5,
    });
    expect(r.unitPrice).toBe(25.5);
  });

  it('clamps manual unit price at zero and never divides by zero KM', () => {
    const r = calculateLogbookFinancials(
      { ...baseInput, endingKm: 10000 },
      { unitPriceMode: 'MANUAL', manualUnitPrice: -50 }
    );
    expect(r.unitPrice).toBe(0);
    const zeroKm = calculateLogbookFinancials({
      ...baseInput,
      endingKm: 10000,
    });
    expect(zeroKm.unitPrice).toBe(0);
  });
});

describe('Driver share modes: fixed, percentage, manual', () => {
  it('percentage mode uses eligible earnings x pct', () => {
    const r = calculateLogbookFinancials(baseInput);
    expect(r.driverShare).toBe(1440);
    expect(r.driverShareModeApplied).toBe('PERCENTAGE');
  });

  it('fixed daily mode uses the configured INR amount', () => {
    const r = calculateLogbookFinancials(baseInput, {
      driverShareMode: 'FIXED_DAILY',
      driverShareFixedAmount: 1200,
    });
    expect(r.driverShare).toBe(1200);
  });

  it('manual mode uses the per-entry amount', () => {
    const r = calculateLogbookFinancials(baseInput, {
      driverShareMode: 'MANUAL',
      manualDriverShare: 1575.75,
    });
    expect(r.driverShare).toBe(1575.75);
  });

  it('negative fixed/manual shares clamp to zero', () => {
    const r = calculateLogbookFinancials(baseInput, {
      driverShareMode: 'FIXED_DAILY',
      driverShareFixedAmount: -100,
    });
    expect(r.driverShare).toBe(0);
  });
});

describe('Total Expenses default includes Driver Share (spec)', () => {
  it('spec default: Total Expenses = Share + Fuel + RedTaxi + Toll + Maint', () => {
    const r = calculateLogbookFinancials(baseInput, {
      includeDriverShareInExpenses: true,
    });
    // 1440 + 1050 + 380 + 90 + 0
    expect(r.totalExpenses).toBe(2960);
    expect(r.netBusinessEarnings).toBe(4800 - 2960);
    expect(r.driverShareIncludedInExpenses).toBe(true);
  });

  it('legacy separated mode yields identical Net Earnings', () => {
    const incl = calculateLogbookFinancials(baseInput, {
      includeDriverShareInExpenses: true,
    });
    const excl = calculateLogbookFinancials(baseInput, {
      includeDriverShareInExpenses: false,
    });
    expect(excl.totalExpenses).toBe(1520);
    expect(incl.netBusinessEarnings).toBe(excl.netBusinessEarnings);
  });
});

describe('Gross vs net platform earnings (no double commission)', () => {
  it('net-of-commission basis does not deduct Red Taxi again', () => {
    const r = calculateLogbookFinancials(baseInput, {
      platformEarningsBasis: 'NET_OF_COMMISSION',
      includeDriverShareInExpenses: true,
    });
    // 1440 + 1050 + 0 + 90 + 0
    expect(r.totalExpenses).toBe(2580);
    expect(r.commissionDeducted).toBe(false);
    expect(r.netBusinessEarnings).toBe(4800 - 2580);
  });

  it('gross basis deducts commission exactly once', () => {
    const r = calculateLogbookFinancials(baseInput, {
      platformEarningsBasis: 'GROSS',
      includeDriverShareInExpenses: true,
    });
    expect(r.commissionDeducted).toBe(true);
    expect(r.totalExpenses).toBe(2960);
  });
});

describe('resolveCalculationOptions profile defaults follow the spec', () => {
  it('defaults to per-km unit price, percentage share, gross basis, share included', () => {
    const o = resolveCalculationOptions(null);
    expect(o.unitPriceMode).toBe('PER_KM_DERIVED');
    expect(o.driverShareMode).toBe('PERCENTAGE');
    expect(o.platformEarningsBasis).toBe('GROSS');
    expect(o.includeDriverShareInExpenses).toBe(true);
  });

  it('passes through explicit profile choices', () => {
    const o = resolveCalculationOptions({
      unitPriceMode: 'MANUAL',
      driverShareMode: 'FIXED_DAILY',
      defaultDriverShareFixed: 900,
      platformEarningsBasis: 'NET_OF_COMMISSION',
      includeDriverShareInExpenses: false,
    });
    expect(o.unitPriceMode).toBe('MANUAL');
    expect(o.driverShareMode).toBe('FIXED_DAILY');
    expect(o.driverShareFixedAmount).toBe(900);
    expect(o.platformEarningsBasis).toBe('NET_OF_COMMISSION');
    expect(o.includeDriverShareInExpenses).toBe(false);
  });
});

describe('decimal safety across modes', () => {
  it('paisa-level precision is preserved', () => {
    const r = calculateLogbookFinancials(
      { ...baseInput, earnings: 4800.55, gasFuel: 1050.35 },
      { includeDriverShareInExpenses: true }
    );
    const expectedShare = Math.round(4800.55 * 30) / 100;
    expect(r.driverShare).toBeCloseTo(expectedShare, 2);
    expect(Number.isFinite(r.netBusinessEarnings)).toBe(true);
  });
});
