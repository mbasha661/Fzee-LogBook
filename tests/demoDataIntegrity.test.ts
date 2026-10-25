import {describe, expect, it} from 'vitest';
import {
  calculateLogbookFinancials,
  validateComplianceDocumentInput,
  validateServiceRecordInput,
  validateVehicleInput,
  validateVehicleMediaInput,
} from '../src/lib/calculations';
import {
  DEMO_COMPLIANCE_DOCUMENTS,
  DEMO_LOGBOOK_ENTRIES,
  DEMO_SERVICE_RECORDS,
  DEMO_VEHICLE_MEDIA,
  DEMO_VEHICLES,
} from '../src/lib/demoData';

describe('demo fleet data integrity', () => {
  it('every demo vehicle passes vehicle validation', () => {
    for (const v of DEMO_VEHICLES) {
      const r = validateVehicleInput(v, 'demo-owner');
      expect(r.errors, `vehicle ${v.registrationNumber}`).toEqual([]);
    }
  });

  it('every demo service record passes service validation', () => {
    for (const rec of DEMO_SERVICE_RECORDS) {
      const r = validateServiceRecordInput(rec, 'demo-owner');
      expect(r.errors, `service ${rec.id}`).toEqual([]);
    }
  });

  it('every demo compliance document passes document validation', () => {
    for (const doc of DEMO_COMPLIANCE_DOCUMENTS) {
      const r = validateComplianceDocumentInput(doc, 'demo-owner');
      expect(r.errors, `doc ${doc.id}`).toEqual([]);
    }
  });

  it('every demo media asset passes media validation', () => {
    for (const media of DEMO_VEHICLE_MEDIA) {
      const r = validateVehicleMediaInput(media, 'demo-owner');
      expect(r.errors, `media ${media.id}`).toEqual([]);
    }
  });

  it('every demo logbook entry is internally consistent with the 15-column formulas', () => {
    for (const e of DEMO_LOGBOOK_ENTRIES) {
      const r = calculateLogbookFinancials({
        startingKm: e.startingKm,
        endingKm: e.endingKm,
        earnings: e.earnings,
        driverSharePct: e.driverSharePct,
        gasFuel: e.gasFuel,
        redTaxi: e.redTaxi,
        toll: e.toll,
        maintenance: e.maintenance,
        otherExpenses: e.otherExpenses,
      });
      expect(r.kmDay, `entry ${e.id} kmDay`).toBe(e.kmDay);
      expect(r.unitPrice, `entry ${e.id} unitPrice`).toBe(e.unitPrice);
      expect(r.driverShare, `entry ${e.id} driverShare`).toBe(e.driverShare);
      expect(r.totalExpenses, `entry ${e.id} totalExpenses`).toBe(
        e.totalExpenses
      );
      expect(
        r.netBusinessEarnings,
        `entry ${e.id} netBusinessEarnings`
      ).toBe(e.netBusinessEarnings);
    }
  });

  it('no demo logbook entry has ending KM below starting KM', () => {
    for (const e of DEMO_LOGBOOK_ENTRIES) {
      expect(e.endingKm, `entry ${e.id}`).toBeGreaterThanOrEqual(e.startingKm);
    }
  });

  it('demo vehicles reference valid odometer chains', () => {
    for (const v of DEMO_VEHICLES) {
      expect(v.currentOdometerKm).toBeGreaterThanOrEqual(0);
      expect(v.nextServiceOdometerKm).toBeGreaterThanOrEqual(
        v.lastServiceOdometerKm
      );
    }
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';


/**
 * Regression guard for the production audit: the owner's personal contact
 * details must never ship inside the client bundle or server code. Anything
 * a visitor can read from a published deployment belongs in their own
 * profile/configuration, not hardcoded in source.
 */
const OWNER_EMAIL = ['mbasha', '661', '@gmail.com'].join('');
const OWNER_PHONE = ['9786', '395', '076'].join('');
const OWNER_PHONE_INTL = ['91', '9786', '395', '076'].join('');

const SCAN_ROOTS = ['src', 'server.ts', '.env.example', 'index.html', 'public'];

const collectFiles = (entry: string): string[] => {
  const st = statSync(entry);
  if (st.isFile()) return [entry];
  return readdirSync(entry).flatMap((child) => collectFiles(join(entry, child)));
};

describe('no hardcoded personal contact data in shipped source', () => {
  const files = SCAN_ROOTS.flatMap(collectFiles).filter(
    (f) => !f.endsWith('.lock') && !f.includes('node_modules')
  );

  it('scans a non-trivial source tree', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('owner personal email appears nowhere in shipped source', () => {
    const hits = files.filter((f) =>
      readFileSync(f, 'utf8').includes(OWNER_EMAIL)
    );
    expect(hits).toEqual([]);
  });

  it('owner personal phone appears nowhere in shipped source', () => {
    const hits = files.filter((f) => {
      const c = readFileSync(f, 'utf8');
      return c.includes(OWNER_PHONE) || c.includes(OWNER_PHONE_INTL);
    });
    expect(hits).toEqual([]);
  });
});
