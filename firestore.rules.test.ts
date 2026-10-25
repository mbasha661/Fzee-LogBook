import { describe, it, expect } from 'vitest';
import {
  aggregateDriverSettlements,
  aggregateLogbookByPeriod,
  calculateLogbookFinancials,
  evaluateFleetComplianceAlerts,
  parseLogbookCsvImport,
  validateComplianceDocumentInput,
  validateLogbookEntryInput,
  validateServiceRecordInput,
  validateVehicleInput,
  validateVehicleMediaInput,
  VALIDATION_CONSTANTS,
} from './src/lib/calculations';
import {
  DEMO_COMPLIANCE_DOCUMENTS,
  DEMO_DRIVERS,
  DEMO_LOGBOOK_ENTRIES,
  DEMO_PROFILE,
  DEMO_SERVICE_RECORDS,
  DEMO_VEHICLES,
  DEMO_VEHICLE_MEDIA,
} from './src/lib/demoData';

describe('FzeeLog Financial, Security & Compliance Invariants (Phases 1–4)', () => {
  it('computes KM/DAY, Unit Price, Driver Share, Total Expenses, and Net Business Earnings without double-counting Driver Share', () => {
    const result = calculateLogbookFinancials({
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

    expect(result.kmDay).toBe(260);
    expect(result.unitPrice).toBe(18.65);
    expect(result.driverShare).toBe(1455);
    expect(result.totalExpenses).toBe(1745);
    expect(result.netBusinessEarnings).toBe(1650);
  });

  it('handles zero KM/DAY safely without division-by-zero', () => {
    const result = calculateLogbookFinancials({
      startingKm: 15000,
      endingKm: 15000,
      earnings: 0,
      driverSharePct: 30,
      gasFuel: 0,
      redTaxi: 0,
      toll: 0,
      maintenance: 500,
    });

    expect(result.kmDay).toBe(0);
    expect(result.unitPrice).toBe(0);
    expect(result.totalExpenses).toBe(500);
    expect(result.netBusinessEarnings).toBe(-500);
  });

  it('rejects invalid odometer decreases and odometer rollbacks below vehicle validated odometer', () => {
    const vehicle = DEMO_VEHICLES[0]; // currentOdometerKm: 64940
    const decreaseCheck = validateLogbookEntryInput(
      {
        vehicleId: vehicle.id,
        date: '2025-02-22',
        shiftNumber: 1,
        startingKm: 65000,
        endingKm: 64900,
        earnings: 3000,
        gasFuel: 800,
        redTaxi: 300,
        toll: 100,
        maintenance: 0,
      },
      DEMO_LOGBOOK_ENTRIES,
      vehicle
    );
    expect(decreaseCheck.valid).toBe(false);
    expect(decreaseCheck.errors.some((e) => e.includes('Invalid odometer decrease'))).toBe(true);

    const rollbackCheck = validateLogbookEntryInput(
      {
        vehicleId: vehicle.id,
        date: '2025-02-22',
        shiftNumber: 1,
        startingKm: 64000,
        endingKm: 64200,
        earnings: 3000,
        gasFuel: 800,
        redTaxi: 300,
        toll: 100,
        maintenance: 0,
      },
      DEMO_LOGBOOK_ENTRIES,
      vehicle
    );
    expect(rollbackCheck.valid).toBe(false);
    expect(rollbackCheck.errors.some((e) => e.includes('Odometer rollback rejected'))).toBe(true);
  });

  it('prevents duplicate shift submissions for the same vehicle, date, and shift number while allowing multi-shift', () => {
    const existing = DEMO_LOGBOOK_ENTRIES[0]; // veh-demo-1, 2025-02-19, shiftNumber: 1
    const dupOutcome = validateLogbookEntryInput(
      {
        vehicleId: existing.vehicleId,
        date: existing.date,
        shiftNumber: 1,
        startingKm: 64940,
        endingKm: 65100,
        earnings: 2500,
        gasFuel: 600,
        redTaxi: 250,
        toll: 0,
        maintenance: 0,
      },
      DEMO_LOGBOOK_ENTRIES
    );
    expect(dupOutcome.valid).toBe(false);
    expect(dupOutcome.errors.some((e) => e.includes('Duplicate shift rejected'))).toBe(true);

    const shift2Outcome = validateLogbookEntryInput(
      {
        vehicleId: existing.vehicleId,
        date: existing.date,
        shiftNumber: 2,
        startingKm: 64940,
        endingKm: 65100,
        earnings: 2500,
        gasFuel: 600,
        redTaxi: 250,
        toll: 0,
        maintenance: 0,
      },
      DEMO_LOGBOOK_ENTRIES
    );
    expect(shift2Outcome.valid).toBe(true);
  });

  it('enforces tenant ownership (ownerId == auth.uid) and required field constants synchronized with firestore.rules', () => {
    const unauthorizedVehicle = validateVehicleInput(
      {
        ...DEMO_VEHICLES[0],
        ownerId: 'attacker-uid',
      },
      'real-owner-uid'
    );
    expect(unauthorizedVehicle.valid).toBe(false);

    expect(VALIDATION_CONSTANTS.LOGBOOK_REQUIRED_FIELDS).toContain('netBusinessEarnings');
    expect(VALIDATION_CONSTANTS.VEHICLE_REQUIRED_FIELDS).toContain('currentOdometerKm');
    expect(VALIDATION_CONSTANTS.SERVICE_REQUIRED_FIELDS).toContain('nextServiceDueKm');
    expect(VALIDATION_CONSTANTS.COMPLIANCE_REQUIRED_FIELDS).toContain('documentNumber');
    expect(VALIDATION_CONSTANTS.VEHICLE_MEDIA_REQUIRED_FIELDS).toContain('mediaCategory');
  });

  it('aggregates monthly and daily period summaries accurately from 15-column logbook entries', () => {
    const monthly = aggregateLogbookByPeriod(DEMO_LOGBOOK_ENTRIES, 'monthly');
    expect(monthly.length).toBe(1);
    expect(monthly[0].periodKey).toBe('2025-02');
    expect(monthly[0].shiftsCount).toBe(5);
    expect(monthly[0].totalKm).toBe(1490);
    expect(monthly[0].grossEarnings).toBe(29210);

    const daily = aggregateLogbookByPeriod(DEMO_LOGBOOK_ENTRIES, 'daily');
    expect(daily.length).toBe(3);
  });

  it('computes driver settlement summaries and parses CSV logbook imports with automatic 15-column math', () => {
    const settlements = aggregateDriverSettlements(
      DEMO_DRIVERS,
      DEMO_LOGBOOK_ENTRIES
    );
    expect(settlements.length).toBe(3);
    const senthil = settlements.find((s) => s.driverId === 'drv-demo-1');
    expect(senthil?.shiftsWorked).toBe(3);
    expect(senthil?.totalKmDriven).toBe(840);

    const sampleCsv = [
      'S.NO,Date,Vehicle,Shift,Starting KM,Ending KM,KM/DAY,Attendance,Earnings,Unit Price,Driver Share,Gas/Fuel,Red Taxi,Toll,Maintenance,Total Expenses,Source/Remarks',
      '1,2025-02-22,TN-38-CZ-4512,1,64940,65240,300,Present,6000,20,1800,1400,600,150,0,2150,"Airport express charter"',
    ].join('\n');

    const parsed = parseLogbookCsvImport(
      sampleCsv,
      DEMO_VEHICLES,
      DEMO_DRIVERS,
      30
    );
    expect(parsed.length).toBe(1);
    expect(parsed[0].errors.length).toBe(0);
    expect(parsed[0].entry.kmDay).toBe(300);
    expect(parsed[0].entry.unitPrice).toBe(20);
    expect(parsed[0].entry.driverShare).toBe(1800);
    expect(parsed[0].entry.totalExpenses).toBe(2150);
    expect(parsed[0].entry.netBusinessEarnings).toBe(2050);
  });

  it('validates Phase 3 workshop service records and rejects nextServiceDueKm lower than odometerKm', () => {
    const validCheck = validateServiceRecordInput(
      DEMO_SERVICE_RECORDS[0],
      'demo-owner'
    );
    expect(validCheck.valid).toBe(true);

    const invalidOdoCheck = validateServiceRecordInput(
      {
        ...DEMO_SERVICE_RECORDS[0],
        odometerKm: 75000,
        nextServiceDueKm: 70000,
      },
      'demo-owner'
    );
    expect(invalidOdoCheck.valid).toBe(false);
    expect(
      invalidOdoCheck.errors.some((e) =>
        e.includes('Next service due odometer')
      )
    ).toBe(true);
  });

  it('validates Phase 3 compliance document uploads and enforces size & ownership constraints', () => {
    const validDoc = validateComplianceDocumentInput(
      DEMO_COMPLIANCE_DOCUMENTS[0],
      'demo-owner'
    );
    expect(validDoc.valid).toBe(true);

    const oversizedDoc = validateComplianceDocumentInput(
      {
        ...DEMO_COMPLIANCE_DOCUMENTS[0],
        fileDataUrl: 'x'.repeat(160000),
      },
      'demo-owner'
    );
    expect(oversizedDoc.valid).toBe(false);
    expect(
      oversizedDoc.errors.some((e) => e.includes('exceeds maximum embedded size'))
    ).toBe(true);
  });

  it('evaluates fleet compliance and preventive maintenance alerts with configurable thresholds', () => {
    const alerts = evaluateFleetComplianceAlerts(
      DEMO_VEHICLES,
      DEMO_DRIVERS,
      30,
      2000
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(
      alerts.some(
        (a) =>
          a.targetType === 'Service' &&
          a.targetLabel.includes('TN-37-DX-8901')
      )
    ).toBe(true);
  });

  it('validates Phase 4 3D vehicle media & multi-angle photo records and rejects invalid angles or oversized payloads', () => {
    const validMedia = validateVehicleMediaInput(
      DEMO_VEHICLE_MEDIA[0],
      'demo-owner'
    );
    expect(validMedia.valid).toBe(true);

    const invalidAngleMedia = validateVehicleMediaInput(
      {
        ...DEMO_VEHICLE_MEDIA[0],
        angleDegrees: 420,
      },
      'demo-owner'
    );
    expect(invalidAngleMedia.valid).toBe(false);

    const oversizedMedia = validateVehicleMediaInput(
      {
        ...DEMO_VEHICLE_MEDIA[0],
        dataUrl: 'x'.repeat(260000),
      },
      'demo-owner'
    );
    expect(oversizedMedia.valid).toBe(false);
  });

  it('builds Phase 6 Google Drive v6.0 backup snapshot, exports 15-column CSV, and validates restore payloads', async () => {
    const {
      build15ColCsvString,
      buildFleetBackupSnapshot,
      parseAndValidateBackupJson,
    } = await import('./src/lib/googleDriveBackup');

    const snapshot = buildFleetBackupSnapshot({
      profile: DEMO_PROFILE,
      vehicles: DEMO_VEHICLES,
      drivers: DEMO_DRIVERS,
      logbookEntries: DEMO_LOGBOOK_ENTRIES,
      serviceRecords: DEMO_SERVICE_RECORDS,
      complianceDocuments: DEMO_COMPLIANCE_DOCUMENTS,
      vehicleMedia: DEMO_VEHICLE_MEDIA,
      notificationLogs: [],
      isDemoMode: true,
    });

    expect(snapshot.application).toBe('FzeeLog');
    expect(snapshot.schemaVersion).toBe('6.0');
    expect(snapshot.currency).toBe('INR');
    expect(snapshot.distanceUnit).toBe('km');
    expect(snapshot.timezone).toBe('Asia/Kolkata');
    expect(snapshot.intendedDriveEmail).toBe('fleet.alerts@fzeelog.in');
    expect(snapshot.summaryCounts.vehicles).toBe(DEMO_VEHICLES.length);
    expect(snapshot.summaryCounts.dailyLogbookEntries).toBe(
      DEMO_LOGBOOK_ENTRIES.length
    );

    // Verify Driver Share is strictly separated from logbookOperatingExpensesInr
    expect(snapshot.financialSummary.driverShareSeparatedInr).toBeGreaterThan(0);
    const expectedNet = Number(
      (
        snapshot.financialSummary.grossEarningsInr -
        snapshot.financialSummary.driverShareSeparatedInr -
        snapshot.financialSummary.logbookOperatingExpensesInr
      ).toFixed(2)
    );
    expect(snapshot.financialSummary.netLogbookEarningsInr).toBeCloseTo(
      expectedNet,
      1
    );

    // Validate restore parser on valid snapshot and invalid JSON
    const parsedRestore = parseAndValidateBackupJson(JSON.stringify(snapshot));
    expect(parsedRestore.valid).toBe(true);
    expect(parsedRestore.vehicles.length).toBe(DEMO_VEHICLES.length);
    expect(parsedRestore.dailyLogbookEntries.length).toBe(
      DEMO_LOGBOOK_ENTRIES.length
    );

    const invalidRestore = parseAndValidateBackupJson('{not-json');
    expect(invalidRestore.valid).toBe(false);

    const csvOut = build15ColCsvString(DEMO_LOGBOOK_ENTRIES);
    expect(csvOut).toContain('Starting KM');
    expect(csvOut).toContain('Net Business Earnings (INR)');
  });

  it('evaluates 10-day, 5-day, and 1-day statutory expiry alerts (Insurance, FC, Permit, Driver Licence, Pollution) and validates WhatsApp channel', async () => {
    const { evaluateMilestoneExpiryAlerts, validateNotificationLogInput } =
      await import('./src/lib/calculations');
    const { DEMO_ORGANIZATION_MEMBERS } = await import('./src/lib/demoData');

    expect(DEMO_PROFILE.accountMode).toBe('Organization');
    expect(DEMO_PROFILE.alertEmail).toBe('fleet.alerts@fzeelog.in');
    expect(DEMO_PROFILE.whatsappNumber).toBe('9000000000');
    expect(DEMO_ORGANIZATION_MEMBERS.length).toBeGreaterThanOrEqual(3);

    const milestoneItems = evaluateMilestoneExpiryAlerts(
      DEMO_VEHICLES,
      DEMO_DRIVERS,
      [10, 5, 1]
    );
    expect(milestoneItems.length).toBeGreaterThan(0);
    const categories = new Set(milestoneItems.map((m) => m.documentLabel));
    expect(categories.has('Insurance')).toBe(true);
    expect(categories.has('FC')).toBe(true);
    expect(categories.has('Permit')).toBe(true);
    expect(categories.has('Driver Licence')).toBe(true);
    expect(categories.has('Pollution (PUC)')).toBe(true);

    const waValidation = validateNotificationLogInput(
      {
        ownerId: 'demo-owner',
        alertType: 'StatutoryExpiry',
        severity: 'WARNING',
        targetLabel: 'WhatsApp Test -> +91 9000000000',
        title: 'Test WhatsApp Expiry Alert Dispatched to 9000000000',
        message: '10d/5d/1d statutory expiry test sent to 9000000000',
        recipientEmail: 'fleet.alerts@fzeelog.in',
        channel: 'WhatsApp',
        status: 'Dispatched',
      },
      'demo-owner'
    );
    expect(waValidation.valid).toBe(true);
  });
});


