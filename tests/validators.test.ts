import {describe, expect, it} from 'vitest';
import {
  validateComplianceDocumentInput,
  validateLogbookEntryInput,
  validateNotificationLogInput,
  validateServiceRecordInput,
  validateVehicleInput,
  validateVehicleMediaInput,
} from '../src/lib/calculations';
import type {NotificationLog} from '../src/types/fleet';
import {
  DEMO_COMPLIANCE_DOCUMENTS,
  DEMO_LOGBOOK_ENTRIES,
  DEMO_SERVICE_RECORDS,
  DEMO_VEHICLE_MEDIA,
  DEMO_VEHICLES,
} from '../src/lib/demoData';

const vehicle = DEMO_VEHICLES[0];

const baseEntry = {
  vehicleId: vehicle.id,
  date: '2025-02-22',
  shiftNumber: 1,
  startingKm: 64940,
  endingKm: 65240,
  earnings: 6000,
  driverSharePct: 30,
  gasFuel: 1400,
  redTaxi: 600,
  toll: 150,
  maintenance: 0,
};

describe('validateLogbookEntryInput', () => {
  it('accepts a well-formed entry', () => {
    const r = validateLogbookEntryInput(baseEntry, DEMO_LOGBOOK_ENTRIES);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('requires a vehicle', () => {
    const r = validateLogbookEntryInput({...baseEntry, vehicleId: ''}, []);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Vehicle selection'))).toBe(true);
  });

  it('requires a YYYY-MM-DD date', () => {
    for (const date of ['', '22/02/2025', '2025-2-2', 'not-a-date']) {
      const r = validateLogbookEntryInput({...baseEntry, date}, []);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('YYYY-MM-DD'))).toBe(true);
    }
  });

  it('rejects shift numbers outside 1-10', () => {
    for (const shiftNumber of [0, 11, 1.5, -1]) {
      const r = validateLogbookEntryInput({...baseEntry, shiftNumber}, []);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Shift number'))).toBe(true);
    }
  });

  it('rejects negative odometer readings', () => {
    const r = validateLogbookEntryInput({...baseEntry, startingKm: -1}, []);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Starting KM'))).toBe(true);
  });

  it('rejects ending KM below starting KM', () => {
    const r = validateLogbookEntryInput(
      {...baseEntry, startingKm: 65240, endingKm: 64940},
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Invalid odometer decrease'))).toBe(
      true
    );
  });

  it('rejects negative money amounts', () => {
    const r = validateLogbookEntryInput({...baseEntry, toll: -5}, []);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.startsWith('Toll'))).toBe(true);
  });

  it('rejects remarks over 500 characters', () => {
    const r = validateLogbookEntryInput(
      {...baseEntry, sourceRemarks: 'x'.repeat(501)},
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('500'))).toBe(true);
  });

  it('rejects a duplicate vehicle+date+shift but allows the next shift', () => {
    const existing = DEMO_LOGBOOK_ENTRIES[0];
    const dup = validateLogbookEntryInput(
      {...baseEntry, date: existing.date, shiftNumber: existing.shiftNumber},
      DEMO_LOGBOOK_ENTRIES
    );
    expect(dup.valid).toBe(false);
    expect(dup.errors.some((e) => e.includes('Duplicate shift'))).toBe(true);

    const second = validateLogbookEntryInput(
      {...baseEntry, date: existing.date, shiftNumber: 9},
      DEMO_LOGBOOK_ENTRIES
    );
    expect(
      second.errors.some((e) => e.includes('Duplicate shift'))
    ).toBe(false);
  });

  it('does not flag the entry being edited as a duplicate of itself', () => {
    const existing = DEMO_LOGBOOK_ENTRIES[0];
    const r = validateLogbookEntryInput(
      {
        ...baseEntry,
        date: existing.date,
        shiftNumber: existing.shiftNumber,
      },
      DEMO_LOGBOOK_ENTRIES,
      existing.id
    );
    expect(r.errors.some((e) => e.includes('Duplicate shift'))).toBe(false);
  });

  it('rejects starting KM below the vehicle validated odometer', () => {
    const r = validateLogbookEntryInput(
      {...baseEntry, startingKm: 64000, endingKm: 64100},
      DEMO_LOGBOOK_ENTRIES,
      vehicle
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Odometer rollback rejected'))).toBe(
      true
    );
  });

  it('warns on an unlogged odometer gap against the previous shift', () => {
    const maxEnd = Math.max(
      ...DEMO_LOGBOOK_ENTRIES.filter((e) => e.vehicleId === vehicle.id).map(
        (e) => e.endingKm
      )
    );
    const r = validateLogbookEntryInput(
      {
        ...baseEntry,
        date: '2025-02-23',
        startingKm: maxEnd + 300,
        endingKm: maxEnd + 500,
      },
      DEMO_LOGBOOK_ENTRIES
    );
    expect(r.errors.some((e) => e.includes('Odometer rollback'))).toBe(false);
    expect(r.warnings.some((w) => w.includes('Unlogged gap'))).toBe(true);
  });

  it('rejects starting KM below the latest prior shift ending KM', () => {
    const maxEnd = Math.max(
      ...DEMO_LOGBOOK_ENTRIES.filter((e) => e.vehicleId === vehicle.id).map(
        (e) => e.endingKm
      )
    );
    const r = validateLogbookEntryInput(
      {
        ...baseEntry,
        date: '2025-02-23',
        startingKm: maxEnd - 100,
        endingKm: maxEnd + 100,
      },
      DEMO_LOGBOOK_ENTRIES
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Odometer rollback rejected'))).toBe(
      true
    );
  });

  it('rejects an ownerId that does not match the authenticated uid', () => {
    const r = validateLogbookEntryInput(
      {...baseEntry, ownerId: 'attacker'},
      [],
      'real-owner'
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Owner ID'))).toBe(true);
  });
});

describe('validateVehicleInput', () => {
  it('accepts the demo vehicle', () => {
    expect(validateVehicleInput(vehicle, 'demo-owner').valid).toBe(true);
  });

  it('rejects foreign ownership', () => {
    const r = validateVehicleInput({...vehicle, ownerId: 'attacker'}, 'demo-owner');
    expect(r.valid).toBe(false);
  });

  it('rejects short registration numbers', () => {
    const r = validateVehicleInput({...vehicle, registrationNumber: 'AB'}, 'demo-owner');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Registration number'))).toBe(true);
  });

  it('requires make and model', () => {
    expect(
      validateVehicleInput({...vehicle, make: ''}, 'demo-owner').valid
    ).toBe(false);
    expect(
      validateVehicleInput({...vehicle, model: ''}, 'demo-owner').valid
    ).toBe(false);
  });

  it('rejects out-of-range manufacturing years', () => {
    expect(
      validateVehicleInput({...vehicle, manufacturingYear: 1979}, 'demo-owner')
        .valid
    ).toBe(false);
    expect(
      validateVehicleInput({...vehicle, manufacturingYear: 2101}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('rejects a negative odometer', () => {
    expect(
      validateVehicleInput({...vehicle, currentOdometerKm: -1}, 'demo-owner')
        .valid
    ).toBe(false);
  });
});

describe('validateServiceRecordInput', () => {
  const record = DEMO_SERVICE_RECORDS[0];

  it('accepts the demo service record', () => {
    expect(validateServiceRecordInput(record, 'demo-owner').valid).toBe(true);
  });

  it('rejects nextServiceDueKm below the service odometer', () => {
    const r = validateServiceRecordInput(
      {...record, odometerKm: 75000, nextServiceDueKm: 70000},
      'demo-owner'
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Next service due odometer'))).toBe(
      true
    );
  });

  it('requires a workshop name', () => {
    expect(
      validateServiceRecordInput({...record, workshopName: ''}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('rejects negative costs', () => {
    expect(
      validateServiceRecordInput({...record, partsCost: -1}, 'demo-owner')
        .valid
    ).toBe(false);
    expect(
      validateServiceRecordInput({...record, laborCost: -1}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('rejects foreign ownership', () => {
    expect(
      validateServiceRecordInput({...record, ownerId: 'attacker'}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('requires a valid service date', () => {
    expect(
      validateServiceRecordInput({...record, serviceDate: '12-31-2025'}, 'demo-owner')
        .valid
    ).toBe(false);
  });
});

describe('validateComplianceDocumentInput', () => {
  const doc = DEMO_COMPLIANCE_DOCUMENTS[0];

  it('accepts the demo document', () => {
    expect(validateComplianceDocumentInput(doc, 'demo-owner').valid).toBe(true);
  });

  it('rejects embedded files over 150k characters', () => {
    const r = validateComplianceDocumentInput(
      {...doc, fileDataUrl: 'x'.repeat(150001)},
      'demo-owner'
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('exceeds maximum embedded size'))).toBe(
      true
    );
  });

  it('requires a document number', () => {
    expect(
      validateComplianceDocumentInput({...doc, documentNumber: ''}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('requires a valid expiry date', () => {
    expect(
      validateComplianceDocumentInput({...doc, expiryDate: '31-12-2025'}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('rejects negative premium or fee', () => {
    expect(
      validateComplianceDocumentInput({...doc, premiumOrFee: -1}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('rejects foreign ownership', () => {
    expect(
      validateComplianceDocumentInput({...doc, ownerId: 'attacker'}, 'demo-owner')
        .valid
    ).toBe(false);
  });
});

describe('validateVehicleMediaInput', () => {
  const media = DEMO_VEHICLE_MEDIA[0];

  it('accepts the demo media', () => {
    expect(validateVehicleMediaInput(media, 'demo-owner').valid).toBe(true);
  });

  it('rejects angles outside 0-360', () => {
    expect(
      validateVehicleMediaInput({...media, angleDegrees: 420}, 'demo-owner')
        .valid
    ).toBe(false);
    expect(
      validateVehicleMediaInput({...media, angleDegrees: -1}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('rejects an unknown media category', () => {
    const r = validateVehicleMediaInput(
      {...media, mediaCategory: 'Video' as never},
      'demo-owner'
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Media category'))).toBe(true);
  });

  it('rejects embedded data over 250k characters', () => {
    expect(
      validateVehicleMediaInput({...media, dataUrl: 'x'.repeat(250001)}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('requires a file name', () => {
    expect(
      validateVehicleMediaInput({...media, fileName: ''}, 'demo-owner').valid
    ).toBe(false);
  });
});

describe('validateNotificationLogInput', () => {
  const base: Partial<NotificationLog> = {
    ownerId: 'demo-owner',
    alertType: 'StatutoryExpiry',
    severity: 'WARNING',
    targetLabel: 'TN-38-CZ-4512',
    title: 'Insurance expiring',
    message: 'Insurance expires in 5 days',
    recipientEmail: 'fleet.alerts@fzeelog.in',
    channel: 'EmailDigest',
    status: 'Unread',
  };

  it('accepts a well-formed notification', () => {
    expect(validateNotificationLogInput(base, 'demo-owner').valid).toBe(true);
  });

  it('rejects an invalid severity', () => {
    expect(
      validateNotificationLogInput({...base, severity: 'LOW' as never}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('rejects an invalid channel', () => {
    expect(
      validateNotificationLogInput({...base, channel: 'SMS' as never}, 'demo-owner')
        .valid
    ).toBe(false);
  });

  it('rejects an invalid recipient email', () => {
    expect(
      validateNotificationLogInput(
        {...base, recipientEmail: 'not-an-email'},
        'demo-owner'
      ).valid
    ).toBe(false);
  });

  it('rejects an over-long title and message', () => {
    expect(
      validateNotificationLogInput({...base, title: 'x'.repeat(161)}, 'demo-owner')
        .valid
    ).toBe(false);
    expect(
      validateNotificationLogInput(
        {...base, message: 'x'.repeat(801)},
        'demo-owner'
      ).valid
    ).toBe(false);
  });

  it('rejects foreign ownership', () => {
    expect(
      validateNotificationLogInput({...base, ownerId: 'attacker'}, 'demo-owner')
        .valid
    ).toBe(false);
  });
});
