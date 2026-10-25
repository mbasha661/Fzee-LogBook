import {
  AttendanceStatus,
  ComplianceDocument,
  DailyLogbookEntry,
  Driver,
  NotificationLog,
  ServiceRecord,
  Vehicle,
  VehicleMedia,
  VehicleProfitLossSummary,
} from '../types/fleet';

// Verbatim validation constants synchronized with firebase-blueprint.json & firestore.rules
export const VALIDATION_CONSTANTS = {
  PROFILE_REQUIRED_FIELDS: [
    'ownerId',
    'email',
    'displayName',
    'businessName',
    'defaultDriverSharePct',
    'currency',
    'distanceUnit',
    'timezone',
    'intendedGoogleDriveEmail',
    'createdAt',
    'updatedAt',
  ] as const,
  PROFILE_ALLOWED_FIELDS: [
    'ownerId',
    'email',
    'displayName',
    'businessName',
    'defaultDriverSharePct',
    'currency',
    'distanceUnit',
    'timezone',
    'intendedGoogleDriveEmail',
    'expiryAlertDays',
    'serviceWarningKm',
    'createdAt',
    'updatedAt',
  ] as const,
  VEHICLE_REQUIRED_FIELDS: [
    'ownerId',
    'registrationNumber',
    'make',
    'model',
    'variant',
    'manufacturingYear',
    'colour',
    'fuelType',
    'transmission',
    'vehicleType',
    'ownershipType',
    'purchaseDate',
    'purchasePrice',
    'currentOdometerKm',
    'assignedDriverId',
    'assignedDriverName',
    'insuranceProvider',
    'insuranceExpiry',
    'fcNumber',
    'fcExpiry',
    'permitType',
    'permitNumber',
    'permitExpiry',
    'pollutionExpiry',
    'lastServiceDate',
    'lastServiceOdometerKm',
    'nextServiceDate',
    'nextServiceOdometerKm',
    'serviceIntervalKm',
    'notes',
    'status',
    'createdAt',
    'updatedAt',
  ] as const,
  LOGBOOK_REQUIRED_FIELDS: [
    'ownerId',
    'vehicleId',
    'vehicleRegistration',
    'driverId',
    'driverName',
    'date',
    'shiftNumber',
    'startingKm',
    'endingKm',
    'kmDay',
    'attendance',
    'earnings',
    'unitPrice',
    'driverSharePct',
    'driverShare',
    'gasFuel',
    'redTaxi',
    'toll',
    'maintenance',
    'otherExpenses',
    'totalExpenses',
    'netBusinessEarnings',
    'sourceRemarks',
    'createdAt',
    'updatedAt',
  ] as const,
  SERVICE_REQUIRED_FIELDS: [
    'ownerId',
    'vehicleId',
    'vehicleRegistration',
    'serviceDate',
    'serviceType',
    'odometerKm',
    'nextServiceDueKm',
    'nextServiceDueDate',
    'workshopName',
    'invoiceNumber',
    'partsCost',
    'laborCost',
    'totalCost',
    'status',
    'notes',
    'createdAt',
    'updatedAt',
  ] as const,
  COMPLIANCE_REQUIRED_FIELDS: [
    'ownerId',
    'targetType',
    'targetId',
    'targetLabel',
    'documentType',
    'documentNumber',
    'providerOrAuthority',
    'issueDate',
    'expiryDate',
    'premiumOrFee',
    'fileName',
    'fileMimeType',
    'fileSizeBytes',
    'fileDataUrl',
    'status',
    'notes',
    'createdAt',
    'updatedAt',
  ] as const,
  VEHICLE_MEDIA_REQUIRED_FIELDS: [
    'ownerId',
    'vehicleId',
    'registrationNumber',
    'mediaCategory',
    'angleLabel',
    'angleDegrees',
    'fileName',
    'mimeType',
    'fileSizeBytes',
    'dataUrl',
    'storagePath',
    'notes',
    'createdAt',
    'updatedAt',
  ] as const,
  NOTIFICATION_LOG_REQUIRED_FIELDS: [
    'ownerId',
    'alertType',
    'severity',
    'targetLabel',
    'title',
    'message',
    'recipientEmail',
    'channel',
    'status',
    'createdAt',
    'updatedAt',
  ] as const,
  MAX_STRING_LENGTHS: {
    registrationNumber: 25,
    make: 60,
    model: 60,
    variant: 60,
    colour: 40,
    notes: 1000,
    sourceRemarks: 500,
    workshopName: 120,
    documentNumber: 80,
    fileDataUrl: 150000,
    mediaDataUrl: 250000,
    storagePath: 300,
    notificationTitle: 160,
    notificationMessage: 800,
  },
};

/**
 * Decimal-safe rounding to 2 decimal places for INR financial calculations.
 */
export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Decimal-safe rounding to 1 decimal place for kilometre readings.
 */
export function roundKm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export interface LogbookCalculationInput {
  startingKm: number;
  endingKm: number;
  earnings: number;
  driverSharePct: number;
  gasFuel: number;
  redTaxi: number;
  toll: number;
  maintenance: number;
  otherExpenses?: number;
}

export interface LogbookCalculationResult {
  kmDay: number;
  unitPrice: number;
  driverShare: number;
  totalExpenses: number;
  netBusinessEarnings: number;
}

/**
 * Exact logbook formulas required by FzeeLog specification:
 * - KM/DAY = Ending KM − Starting KM
 * - Unit Price = Earnings ÷ KM/DAY, when KM/DAY > 0
 * - Driver Share = Eligible Earnings × Configured Share Percentage
 * - Total Expenses = Gas/Fuel + Red Taxi + Toll + Maintenance + Other Configured Expenses
 * - Net Business Earnings = Earnings − Total Expenses − Driver Share
 * Note: Driver share is kept strictly separate from operating expense totals to avoid double-counting.
 */
export function calculateLogbookFinancials(
  input: LogbookCalculationInput
): LogbookCalculationResult {
  const startingKm = roundKm(Math.max(0, Number(input.startingKm) || 0));
  const endingKm = roundKm(Math.max(0, Number(input.endingKm) || 0));
  const kmDay = roundKm(Math.max(0, endingKm - startingKm));

  const earnings = roundCurrency(Math.max(0, Number(input.earnings) || 0));
  const sharePct = Math.min(
    100,
    Math.max(0, Number(input.driverSharePct) || 0)
  );

  const unitPrice = kmDay > 0 ? roundCurrency(earnings / kmDay) : 0;
  const driverShare = roundCurrency((earnings * sharePct) / 100);

  const gasFuel = roundCurrency(Math.max(0, Number(input.gasFuel) || 0));
  const redTaxi = roundCurrency(Math.max(0, Number(input.redTaxi) || 0));
  const toll = roundCurrency(Math.max(0, Number(input.toll) || 0));
  const maintenance = roundCurrency(
    Math.max(0, Number(input.maintenance) || 0)
  );
  const otherExpenses = roundCurrency(
    Math.max(0, Number(input.otherExpenses) || 0)
  );

  const totalExpenses = roundCurrency(
    gasFuel + redTaxi + toll + maintenance + otherExpenses
  );
  const netBusinessEarnings = roundCurrency(
    earnings - totalExpenses - driverShare
  );

  return {
    kmDay,
    unitPrice,
    driverShare,
    totalExpenses,
    netBusinessEarnings,
  };
}

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Validates a DailyLogbookEntry against odometer progression, duplicate shift rules,
 * and Firestore blueprint constraints.
 */
export function validateLogbookEntryInput(
  entry: Partial<DailyLogbookEntry> & { entryDate?: string; vehicleRegNo?: string },
  existingEntriesForVehicle: DailyLogbookEntry[] = [],
  thirdArg?: Vehicle | string,
  fourthArg?: string | number
): ValidationOutcome & { warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  let editingEntryId: string | undefined;
  let vehicleOdometerKm: number | undefined;

  if (thirdArg && typeof thirdArg === 'object' && 'currentOdometerKm' in thirdArg) {
    vehicleOdometerKm = Number(thirdArg.currentOdometerKm);
    if (typeof fourthArg === 'string') {
      editingEntryId = fourthArg;
    }
  } else if (typeof thirdArg === 'string') {
    // Could be editingEntryId (from LogbookView) or authenticatedUid
    if (typeof fourthArg === 'number') {
      editingEntryId = thirdArg;
      vehicleOdometerKm = fourthArg;
    } else if (existingEntriesForVehicle.some((e) => e.id === thirdArg)) {
      editingEntryId = thirdArg;
    } else if (entry.ownerId && entry.ownerId !== thirdArg) {
      errors.push('Owner ID must match authenticated user UID.');
    } else {
      editingEntryId = thirdArg;
    }
  } else if (typeof fourthArg === 'number') {
    vehicleOdometerKm = fourthArg;
  }

  if (!entry.vehicleId || entry.vehicleId.trim().length === 0) {
    errors.push('Vehicle selection is required.');
  }

  const dateVal = entry.date || entry.entryDate || '';
  if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    errors.push('Valid date in YYYY-MM-DD format is required.');
  }

  const shiftNumber = Number(entry.shiftNumber ?? 1);
  if (!Number.isInteger(shiftNumber) || shiftNumber < 1 || shiftNumber > 10) {
    errors.push('Shift number must be an integer between 1 and 10.');
  }

  const startingKm = Number(entry.startingKm);
  const endingKm = Number(entry.endingKm);

  if (!Number.isFinite(startingKm) || startingKm < 0) {
    errors.push('Starting KM must be a non-negative number.');
  }
  if (!Number.isFinite(endingKm) || endingKm < 0) {
    errors.push('Ending KM must be a non-negative number.');
  }
  if (
    Number.isFinite(startingKm) &&
    Number.isFinite(endingKm) &&
    endingKm < startingKm
  ) {
    errors.push(
      `Invalid odometer decrease: Ending KM (${endingKm}) cannot be less than Starting KM (${startingKm}).`
    );
  }

  // Check duplicate submission for same vehicle + date + shiftNumber
  const duplicateShift = existingEntriesForVehicle.find(
    (e) =>
      e.id !== editingEntryId &&
      e.vehicleId === entry.vehicleId &&
      (e.date || e.entryDate) === dateVal &&
      e.shiftNumber === shiftNumber
  );
  if (duplicateShift) {
    errors.push(
      `Duplicate shift rejected: Shift #${shiftNumber} on ${dateVal} already exists for this vehicle.`
    );
  }

  // Check against vehicle's current validated odometer when provided
  if (
    !editingEntryId &&
    vehicleOdometerKm !== undefined &&
    Number.isFinite(vehicleOdometerKm) &&
    Number.isFinite(startingKm) &&
    startingKm < vehicleOdometerKm
  ) {
    errors.push(
      `Odometer rollback rejected: Starting KM (${startingKm}) cannot be less than vehicle validated odometer (${vehicleOdometerKm} km).`
    );
  }

  // Check chronological odometer continuity against prior recorded shifts for this vehicle
  const priorShifts = existingEntriesForVehicle
    .filter((e) => {
      const eDate = e.date || e.entryDate || '';
      return (
        e.id !== editingEntryId &&
        e.vehicleId === entry.vehicleId &&
        (eDate < dateVal || (eDate === dateVal && e.shiftNumber < shiftNumber))
      );
    })
    .sort((a, b) => {
      const aDate = a.date || a.entryDate || '';
      const bDate = b.date || b.entryDate || '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return b.shiftNumber - a.shiftNumber;
    });

  if (priorShifts.length > 0 && Number.isFinite(startingKm)) {
    const latestPrior = priorShifts[0];
    if (startingKm < latestPrior.endingKm) {
      errors.push(
        `Odometer rollback rejected: Starting KM (${startingKm}) is lower than previous shift Ending KM (${latestPrior.endingKm} on ${latestPrior.date || latestPrior.entryDate} Shift #${latestPrior.shiftNumber}).`
      );
    } else if (startingKm > latestPrior.endingKm) {
      warnings.push(
        `Unlogged gap of ${roundKm(startingKm - latestPrior.endingKm)} km between previous shift ending (${latestPrior.endingKm} km) and this shift starting (${startingKm} km).`
      );
    }
  }

  const numericAmounts = [
    { label: 'Earnings', val: entry.earnings },
    { label: 'Driver Share %', val: entry.driverSharePct },
    { label: 'Gas/Fuel', val: entry.gasFuel },
    { label: 'Red Taxi', val: entry.redTaxi },
    { label: 'Toll', val: entry.toll },
    { label: 'Maintenance', val: entry.maintenance },
  ];

  for (const item of numericAmounts) {
    const v = Number(item.val ?? 0);
    if (!Number.isFinite(v) || v < 0) {
      errors.push(`${item.label} must be a non-negative number.`);
    }
  }

  if (
    entry.sourceRemarks &&
    entry.sourceRemarks.length >
      VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.sourceRemarks
  ) {
    errors.push(
      `Source/Remarks cannot exceed ${VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.sourceRemarks} characters.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateVehicleInput(
  vehicle: Partial<Vehicle>,
  authenticatedUid: string
): ValidationOutcome {
  const errors: string[] = [];

  if (!authenticatedUid || vehicle.ownerId !== authenticatedUid) {
    errors.push('Owner ID must match authenticated user UID.');
  }
  if (
    !vehicle.registrationNumber ||
    vehicle.registrationNumber.trim().length < 3 ||
    vehicle.registrationNumber.trim().length >
      VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.registrationNumber
  ) {
    errors.push('Registration number must be between 3 and 25 characters.');
  }
  if (!vehicle.make || vehicle.make.trim().length === 0) {
    errors.push('Vehicle make is required.');
  }
  if (!vehicle.model || vehicle.model.trim().length === 0) {
    errors.push('Vehicle model is required.');
  }
  const year = Number(vehicle.manufacturingYear);
  if (!Number.isInteger(year) || year < 1980 || year > 2100) {
    errors.push('Manufacturing year must be between 1980 and 2100.');
  }
  const odo = Number(vehicle.currentOdometerKm);
  if (!Number.isFinite(odo) || odo < 0) {
    errors.push('Current odometer reading must be 0 or greater.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateServiceRecordInput(
  record: Partial<ServiceRecord>,
  authenticatedUid?: string
): ValidationOutcome {
  const errors: string[] = [];

  if (authenticatedUid && record.ownerId !== authenticatedUid) {
    errors.push('Owner ID must match authenticated user UID.');
  }
  if (!record.vehicleId || record.vehicleId.trim().length === 0) {
    errors.push('Vehicle selection is required.');
  }
  if (!record.serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(record.serviceDate)) {
    errors.push('Valid service date (YYYY-MM-DD) is required.');
  }
  if (
    !record.workshopName ||
    record.workshopName.trim().length === 0 ||
    record.workshopName.trim().length >
      VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.workshopName
  ) {
    errors.push('Workshop name is required (1 to 120 characters).');
  }
  const odo = Number(record.odometerKm);
  const nextOdo = Number(
    record.nextServiceDueKm ?? record.nextServiceOdometerKm ?? odo
  );
  if (!Number.isFinite(odo) || odo < 0) {
    errors.push('Service odometer reading must be non-negative.');
  }
  if (!Number.isFinite(nextOdo) || nextOdo < odo) {
    errors.push(
      'Next service due odometer must be greater than or equal to service odometer.'
    );
  }
  const parts = Number(record.partsCost ?? 0);
  const labor = Number(record.laborCost ?? 0);
  if (
    !Number.isFinite(parts) ||
    parts < 0 ||
    !Number.isFinite(labor) ||
    labor < 0
  ) {
    errors.push('Parts and labor costs must be non-negative.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateComplianceDocumentInput(
  docRecord: Partial<ComplianceDocument>,
  authenticatedUid?: string
): ValidationOutcome {
  const errors: string[] = [];

  if (authenticatedUid && docRecord.ownerId !== authenticatedUid) {
    errors.push('Owner ID must match authenticated user UID.');
  }
  const targetId = docRecord.targetId ?? docRecord.entityId ?? '';
  if (!targetId || targetId.trim().length === 0) {
    errors.push('Vehicle or Driver selection is required.');
  }
  if (
    !docRecord.documentNumber ||
    docRecord.documentNumber.trim().length === 0 ||
    docRecord.documentNumber.trim().length >
      VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.documentNumber
  ) {
    errors.push('Document number is required (1 to 80 characters).');
  }
  if (
    !docRecord.expiryDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(docRecord.expiryDate)
  ) {
    errors.push('Valid expiry date (YYYY-MM-DD) is required.');
  }
  const fee = Number(docRecord.premiumOrFee ?? docRecord.renewalCost ?? 0);
  if (!Number.isFinite(fee) || fee < 0) {
    errors.push('Premium or statutory fee must be a non-negative amount.');
  }
  if (
    docRecord.fileDataUrl &&
    docRecord.fileDataUrl.length >
      VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.fileDataUrl
  ) {
    errors.push(
      'Uploaded document preview exceeds maximum embedded size limit (150 KB). Please upload a smaller image or PDF.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateVehicleMediaInput(
  media: Partial<VehicleMedia>,
  authenticatedUid: string
): ValidationOutcome {
  const errors: string[] = [];

  if (!authenticatedUid || media.ownerId !== authenticatedUid) {
    errors.push('Owner ID must match authenticated user UID.');
  }
  if (!media.vehicleId || media.vehicleId.trim().length === 0) {
    errors.push('Vehicle ID is required.');
  }
  if (
    !media.registrationNumber ||
    media.registrationNumber.trim().length < 3 ||
    media.registrationNumber.trim().length >
      VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.registrationNumber
  ) {
    errors.push('Valid vehicle registration number is required.');
  }
  if (
    !media.mediaCategory ||
    !['AnglePhoto', 'Model3D', 'AICalibration'].includes(media.mediaCategory)
  ) {
    errors.push('Media category must be AnglePhoto, Model3D, or AICalibration.');
  }
  if (!media.fileName || media.fileName.trim().length === 0) {
    errors.push('File name is required.');
  }
  const angleDegrees = Number(media.angleDegrees ?? 0);
  if (!Number.isFinite(angleDegrees) || angleDegrees < 0 || angleDegrees > 360) {
    errors.push('Angle degrees must be between 0 and 360.');
  }
  if (
    media.dataUrl &&
    media.dataUrl.length > VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.mediaDataUrl
  ) {
    errors.push(
      'Embedded media payload exceeds Firestore document limit (250 KB). Use compressed inspection frames or external storage URL.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateNotificationLogInput(
  notification: Partial<NotificationLog>,
  authenticatedUid: string
): ValidationOutcome {
  const errors: string[] = [];

  if (!authenticatedUid || notification.ownerId !== authenticatedUid) {
    errors.push('Owner ID must match authenticated user UID.');
  }
  if (
    !notification.alertType ||
    ![
      'StatutoryExpiry',
      'ServiceOdometer',
      'ServiceDate',
      'DriverLicense',
      'FinancialDigest',
      'ReportExport',
    ].includes(notification.alertType)
  ) {
    errors.push('Invalid notification alertType.');
  }
  if (
    !notification.severity ||
    !['CRITICAL', 'WARNING', 'INFO'].includes(notification.severity)
  ) {
    errors.push('Severity must be CRITICAL, WARNING, or INFO.');
  }
  if (
    !notification.targetLabel ||
    notification.targetLabel.trim().length === 0 ||
    notification.targetLabel.trim().length > 120
  ) {
    errors.push('Target label is required (1 to 120 characters).');
  }
  if (
    !notification.title ||
    notification.title.trim().length === 0 ||
    notification.title.trim().length >
      VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.notificationTitle
  ) {
    errors.push('Notification title is required (1 to 160 characters).');
  }
  if (
    !notification.message ||
    notification.message.trim().length === 0 ||
    notification.message.trim().length >
      VALIDATION_CONSTANTS.MAX_STRING_LENGTHS.notificationMessage
  ) {
    errors.push('Notification message is required (1 to 800 characters).');
  }
  if (
    !notification.recipientEmail ||
    notification.recipientEmail.trim().length < 3 ||
    notification.recipientEmail.trim().length > 160 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notification.recipientEmail.trim())
  ) {
    errors.push('Valid recipient email is required.');
  }
  if (
    !notification.channel ||
    !['InApp', 'EmailDigest', 'WhatsApp', 'PDFReport'].includes(
      notification.channel
    )
  ) {
    errors.push(
      'Channel must be InApp, EmailDigest, WhatsApp, or PDFReport.'
    );
  }
  if (
    !notification.status ||
    !['Unread', 'Acknowledged', 'Dispatched', 'Archived'].includes(
      notification.status
    )
  ) {
    errors.push('Status must be Unread, Acknowledged, Dispatched, or Archived.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompactFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatINR(amount: number, compact = false): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return compact ? inrCompactFormatter.format(safe) : inrFormatter.format(safe);
}

export function formatKm(km: number): string {
  const safe = Number.isFinite(km) ? km : 0;
  return `${numberFormatter.format(safe)} km`;
}

export function getTodayKolkataDate(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback
  }
  return new Date().toISOString().slice(0, 10);
}

export function getDaysUntilExpiry(expiryDateStr: string): number | null {
  if (!expiryDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
    return null;
  }
  const todayStr = getTodayKolkataDate();
  const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();
  const expiryMs = new Date(`${expiryDateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(expiryMs)) return null;
  return Math.round((expiryMs - todayMs) / (1000 * 60 * 60 * 24));
}

export interface ComplianceAlertItem {
  id: string;
  targetType: 'Vehicle' | 'Driver' | 'Service';
  targetId: string;
  targetLabel: string;
  documentLabel: string;
  documentNumber: string;
  expiryOrDueInfo: string;
  daysRemaining: number | null;
  kmRemaining: number | null;
  severity: 'EXPIRED' | 'URGENT' | 'WARNING' | 'OK' | 'CRITICAL';
  milestoneBucket?: 'EXPIRED' | '1_DAY' | '5_DAYS' | '10_DAYS' | 'UPCOMING';
  title: string;
  detail: string;
}

export interface StatutoryMilestoneSummaryItem {
  id: string;
  category:
    | 'Insurance'
    | 'Fitness Certificate (FC)'
    | 'Permit'
    | 'Driver Licence'
    | 'Pollution (PUCC)';
  entityLabel: string;
  documentNumber: string;
  expiryDate: string;
  daysRemaining: number;
  milestoneStage: 'EXPIRED' | '1-DAY ALERT' | '5-DAY ALERT' | '10-DAY ALERT' | 'MONITORED';
  triggerActive: boolean;
}

/**
 * Evaluates all 5 required statutory categories (Insurance, FC, Permit, Driver Licence, Pollution)
 * specifically against the 10-day, 5-day, and 1-day advance reminder schedule.
 */
export function evaluateStatutoryMilestoneSchedule(
  vehicles: Vehicle[],
  drivers: Driver[],
  enabledMilestones: number[] = [10, 5, 1]
): StatutoryMilestoneSummaryItem[] {
  const items: StatutoryMilestoneSummaryItem[] = [];
  const maxMilestone = Math.max(...enabledMilestones, 10);

  for (const v of vehicles) {
    if (v.status === 'Archived') continue;
    const checks: Array<{
      category: StatutoryMilestoneSummaryItem['category'];
      num: string;
      expiry: string;
    }> = [
      {
        category: 'Insurance',
        num: v.insuranceProvider || 'Insurance Policy',
        expiry: v.insuranceExpiry,
      },
      {
        category: 'Fitness Certificate (FC)',
        num: v.fcNumber || 'FC',
        expiry: v.fcExpiry,
      },
      {
        category: 'Permit',
        num: v.permitNumber || v.permitType || 'Permit',
        expiry: v.permitExpiry,
      },
      {
        category: 'Pollution (PUCC)',
        num: 'PUCC',
        expiry: v.pollutionExpiry,
      },
    ];

    for (const c of checks) {
      const days = getDaysUntilExpiry(c.expiry);
      if (days === null) continue;
      let milestoneStage: StatutoryMilestoneSummaryItem['milestoneStage'] =
        'MONITORED';
      if (days < 0) milestoneStage = 'EXPIRED';
      else if (days <= 1) milestoneStage = '1-DAY ALERT';
      else if (days <= 5) milestoneStage = '5-DAY ALERT';
      else if (days <= 10) milestoneStage = '10-DAY ALERT';

      items.push({
        id: `${v.id}-${c.category}`,
        category: c.category,
        entityLabel: `${v.registrationNumber} (${v.make} ${v.model})`,
        documentNumber: c.num,
        expiryDate: c.expiry,
        daysRemaining: days,
        milestoneStage,
        triggerActive: days <= maxMilestone,
      });
    }
  }

  for (const d of drivers) {
    if (d.status === 'Archived') continue;
    const days = getDaysUntilExpiry(d.licenseExpiry);
    if (days === null) continue;
    let milestoneStage: StatutoryMilestoneSummaryItem['milestoneStage'] =
      'MONITORED';
    if (days < 0) milestoneStage = 'EXPIRED';
    else if (days <= 1) milestoneStage = '1-DAY ALERT';
    else if (days <= 5) milestoneStage = '5-DAY ALERT';
    else if (days <= 10) milestoneStage = '10-DAY ALERT';

    items.push({
      id: `${d.id}-DriverLicence`,
      category: 'Driver Licence',
      entityLabel: `${d.fullName} (${d.phone})`,
      documentNumber: d.licenseNumber,
      expiryDate: d.licenseExpiry,
      daysRemaining: days,
      milestoneStage,
      triggerActive: days <= maxMilestone,
    });
  }

  items.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return items;
}

export interface MilestoneComplianceItem {
  id: string;
  documentLabel:
    | 'Insurance'
    | 'FC'
    | 'Permit'
    | 'Driver Licence'
    | 'Pollution (PUC)';
  targetLabel: string;
  expiryDate: string;
  daysRemaining: number;
  milestoneBucket: 'EXPIRED' | '1-DAY' | '5-DAY' | '10-DAY' | 'OK';
}

export function evaluateMilestoneExpiryAlerts(
  vehicles: Vehicle[],
  drivers: Driver[],
  milestones: number[] = [10, 5, 1]
): MilestoneComplianceItem[] {
  const raw = evaluateStatutoryMilestoneSchedule(vehicles, drivers, milestones);
  return raw.map((r) => {
    const documentLabel: MilestoneComplianceItem['documentLabel'] =
      r.category === 'Fitness Certificate (FC)'
        ? 'FC'
        : r.category === 'Pollution (PUCC)'
        ? 'Pollution (PUC)'
        : r.category;
    const milestoneBucket: MilestoneComplianceItem['milestoneBucket'] =
      r.milestoneStage === 'EXPIRED'
        ? 'EXPIRED'
        : r.milestoneStage === '1-DAY ALERT'
        ? '1-DAY'
        : r.milestoneStage === '5-DAY ALERT'
        ? '5-DAY'
        : r.milestoneStage === '10-DAY ALERT'
        ? '10-DAY'
        : 'OK';
    return {
      id: r.id,
      documentLabel,
      targetLabel: r.entityLabel,
      expiryDate: r.expiryDate,
      daysRemaining: r.daysRemaining,
      milestoneBucket,
    };
  });
}

/**
 * Evaluates all vehicles and drivers against configurable alert thresholds:
 * - expiryAlertDays (default 30 days)
 * - serviceWarningKm (default 1000 km)
 */
export function evaluateFleetComplianceAlerts(
  vehicles: Vehicle[],
  drivers: Driver[],
  expiryAlertDays = 30,
  serviceWarningKm = 1000
): ComplianceAlertItem[] {
  const alerts: ComplianceAlertItem[] = [];
  const safeExpiryWindow = Math.max(1, Number(expiryAlertDays) || 30);
  const safeServiceKmWindow = Math.max(100, Number(serviceWarningKm) || 1000);

  for (const v of vehicles) {
    if (v.status === 'Archived') continue;

    const docChecks: Array<{
      key: string;
      label: string;
      num: string;
      expiry: string;
    }> = [
      {
        key: 'fc',
        label: 'Fitness Certificate (FC)',
        num: v.fcNumber || 'FC',
        expiry: v.fcExpiry,
      },
      {
        key: 'ins',
        label: `Insurance (${v.insuranceProvider || 'Policy'})`,
        num: v.insuranceProvider || 'Policy',
        expiry: v.insuranceExpiry,
      },
      {
        key: 'permit',
        label: `Permit (${v.permitType || 'Commercial'})`,
        num: v.permitNumber || 'Permit',
        expiry: v.permitExpiry,
      },
      {
        key: 'puc',
        label: 'Pollution Certificate (PUCC)',
        num: 'PUCC',
        expiry: v.pollutionExpiry,
      },
    ];

    for (const check of docChecks) {
      const days = getDaysUntilExpiry(check.expiry);
      if (days === null) continue;
      let severity: ComplianceAlertItem['severity'] = 'OK';
      if (days < 0) severity = 'EXPIRED';
      else if (days <= Math.min(7, safeExpiryWindow)) severity = 'URGENT';
      else if (days <= safeExpiryWindow) severity = 'WARNING';

      if (severity !== 'OK') {
        const statusDesc =
          days < 0
            ? `Expired ${Math.abs(days)} day(s) ago on ${check.expiry}`
            : `Expires in ${days} day(s) on ${check.expiry}`;
        alerts.push({
          id: `veh-${v.id}-${check.key}`,
          targetType: 'Vehicle',
          targetId: v.id,
          targetLabel: `${v.registrationNumber} (${v.make} ${v.model})`,
          documentLabel: check.label,
          documentNumber: check.num,
          expiryOrDueInfo: check.expiry,
          daysRemaining: days,
          kmRemaining: null,
          severity,
          title: `${v.registrationNumber} — ${check.label}`,
          detail: `${statusDesc} · Ref: ${check.num}`,
        });
      }
    }

    // Check Preventive Service Odometer & Next Service Date
    const kmRem = roundKm(v.nextServiceOdometerKm - v.currentOdometerKm);
    const srvDays = getDaysUntilExpiry(v.nextServiceDate);

    let srvSeverity: ComplianceAlertItem['severity'] = 'OK';
    if (kmRem <= 0 || (srvDays !== null && srvDays < 0)) {
      srvSeverity = 'EXPIRED';
    } else if (
      kmRem <= Math.min(300, safeServiceKmWindow) ||
      (srvDays !== null && srvDays <= 5)
    ) {
      srvSeverity = 'URGENT';
    } else if (
      kmRem <= safeServiceKmWindow ||
      (srvDays !== null && srvDays <= Math.min(15, safeExpiryWindow))
    ) {
      srvSeverity = 'WARNING';
    }

    if (srvSeverity !== 'OK') {
      const kmDesc =
        kmRem <= 0
          ? `Overdue by ${formatKm(Math.abs(kmRem))} (Current ${formatKm(v.currentOdometerKm)} vs Target ${formatKm(v.nextServiceOdometerKm)})`
          : `Due in ${formatKm(kmRem)} (Target ${formatKm(v.nextServiceOdometerKm)})`;
      alerts.push({
        id: `srv-${v.id}`,
        targetType: 'Service',
        targetId: v.id,
        targetLabel: `${v.registrationNumber} (${v.make} ${v.model})`,
        documentLabel: 'Preventive Maintenance Service',
        documentNumber: `Target ${formatKm(v.nextServiceOdometerKm)}`,
        expiryOrDueInfo:
          v.nextServiceDate || `${formatKm(v.nextServiceOdometerKm)}`,
        daysRemaining: srvDays,
        kmRemaining: kmRem,
        severity: srvSeverity,
        title: `${v.registrationNumber} — Preventive Service Due`,
        detail: `${kmDesc}${v.nextServiceDate ? ` · Scheduled Date: ${v.nextServiceDate}` : ''}`,
      });
    }
  }

  for (const d of drivers) {
    if (d.status === 'Archived') continue;
    const days = getDaysUntilExpiry(d.licenseExpiry);
    if (days === null) continue;
    let severity: ComplianceAlertItem['severity'] = 'OK';
    if (days < 0) severity = 'EXPIRED';
    else if (days <= Math.min(7, safeExpiryWindow)) severity = 'URGENT';
    else if (days <= safeExpiryWindow) severity = 'WARNING';

    if (severity !== 'OK') {
      const statusDesc =
        days < 0
          ? `Expired ${Math.abs(days)} day(s) ago on ${d.licenseExpiry}`
          : `Expires in ${days} day(s) on ${d.licenseExpiry}`;
      alerts.push({
        id: `drv-${d.id}-lic`,
        targetType: 'Driver',
        targetId: d.id,
        targetLabel: d.fullName,
        documentLabel: 'Commercial Driving Licence',
        documentNumber: d.licenseNumber,
        expiryOrDueInfo: d.licenseExpiry,
        daysRemaining: days,
        kmRemaining: null,
        severity,
        title: `${d.fullName} — Commercial Driving Licence`,
        detail: `${statusDesc} · DL: ${d.licenseNumber}`,
      });
    }
  }

  return alerts.sort((a, b) => {
    const rank: Record<string, number> = {
      EXPIRED: 0,
      CRITICAL: 0,
      URGENT: 1,
      WARNING: 2,
      OK: 3,
    };
    if (rank[a.severity] !== rank[b.severity]) {
      return rank[a.severity] - rank[b.severity];
    }
    return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);
  });
}

// ============================================================================
// Phase 2 & 5 — Financial Aggregations, Vehicle P&L & CSV Import/Export
// ============================================================================

export interface PeriodFinancialSummary {
  periodKey: string; // YYYY-MM or YYYY-MM-DD
  label: string;
  vehiclesCount: number;
  shiftsCount: number;
  presentCount: number;
  halfDayCount: number;
  totalKm: number;
  kmDay: number;
  grossEarnings: number;
  earnings: number;
  avgUnitPrice: number;
  unitPrice: number;
  driverShare: number;
  gasFuel: number;
  redTaxi: number;
  toll: number;
  maintenance: number;
  otherExpenses: number;
  totalExpenses: number;
  netBusinessEarnings: number;
  profitMarginPct: number;
  marginPct: number;
}

export function aggregateLogbookByPeriod(
  entries: DailyLogbookEntry[],
  mode: 'monthly' | 'daily'
): PeriodFinancialSummary[] {
  const map = new Map<string, DailyLogbookEntry[]>();

  for (const entry of entries) {
    const dateStr = entry.date || entry.entryDate || '';
    const key = mode === 'monthly' ? dateStr.slice(0, 7) : dateStr;
    const existing = map.get(key) || [];
    existing.push(entry);
    map.set(key, existing);
  }

  const summaries: PeriodFinancialSummary[] = [];

  for (const [periodKey, group] of map.entries()) {
    const vehiclesCount = new Set(
      group.map((e) => e.vehicleId || e.vehicleRegistration)
    ).size;
    const shiftsCount = group.length;
    const presentCount = group.filter((e) => e.attendance === 'Present').length;
    const halfDayCount = group.filter((e) => e.attendance === 'Half Day').length;
    const totalKm = roundKm(group.reduce((s, e) => s + e.kmDay, 0));
    const grossEarnings = roundCurrency(
      group.reduce((s, e) => s + e.earnings, 0)
    );
    const avgUnitPrice =
      totalKm > 0 ? roundCurrency(grossEarnings / totalKm) : 0;
    const driverShare = roundCurrency(
      group.reduce((s, e) => s + e.driverShare, 0)
    );
    const gasFuel = roundCurrency(group.reduce((s, e) => s + e.gasFuel, 0));
    const redTaxi = roundCurrency(group.reduce((s, e) => s + e.redTaxi, 0));
    const toll = roundCurrency(group.reduce((s, e) => s + e.toll, 0));
    const maintenance = roundCurrency(
      group.reduce((s, e) => s + e.maintenance, 0)
    );
    const otherExpenses = roundCurrency(
      group.reduce((s, e) => s + (e.otherExpenses || 0), 0)
    );
    const totalExpenses = roundCurrency(
      group.reduce((s, e) => s + e.totalExpenses, 0)
    );
    const netBusinessEarnings = roundCurrency(
      group.reduce((s, e) => s + e.netBusinessEarnings, 0)
    );
    const profitMarginPct =
      grossEarnings > 0
        ? roundCurrency((netBusinessEarnings / grossEarnings) * 100)
        : 0;

    summaries.push({
      periodKey,
      label: periodKey,
      vehiclesCount,
      shiftsCount,
      presentCount,
      halfDayCount,
      totalKm,
      kmDay: totalKm,
      grossEarnings,
      earnings: grossEarnings,
      avgUnitPrice,
      unitPrice: avgUnitPrice,
      driverShare,
      gasFuel,
      redTaxi,
      toll,
      maintenance,
      otherExpenses,
      totalExpenses,
      netBusinessEarnings,
      profitMarginPct,
      marginPct: profitMarginPct,
    });
  }

  return summaries.sort((a, b) => b.periodKey.localeCompare(a.periodKey));
}

export interface DriverSettlementSummary {
  driver: Driver;
  driverId: string;
  driverName: string;
  shiftsWorked: number;
  shiftsCount: number;
  presentDays: number;
  halfDays: number;
  leaveOrAbsentDays: number;
  absentOrLeaveDays: number;
  totalKmDriven: number;
  totalKm: number;
  grossEarningsGenerated: number;
  totalDriverShareEarned: number;
  totalDriverShare: number;
  totalFuelAndTollHandled: number;
  netOwnerContribution: number;
}

export function aggregateDriverSettlements(
  drivers: Driver[],
  entries: DailyLogbookEntry[]
): DriverSettlementSummary[] {
  return drivers.map((d) => {
    const drvEntries = entries.filter(
      (e) =>
        e.driverId === d.id ||
        (e.driverName &&
          e.driverName.toLowerCase() === d.fullName.toLowerCase())
    );
    const shiftsWorked = drvEntries.length;
    const presentDays = drvEntries.filter(
      (e) => e.attendance === 'Present'
    ).length;
    const halfDays = drvEntries.filter(
      (e) => e.attendance === 'Half Day'
    ).length;
    const leaveOrAbsentDays = drvEntries.filter(
      (e) => e.attendance === 'Absent' || e.attendance === 'Leave'
    ).length;
    const totalKmDriven = roundKm(
      drvEntries.reduce((s, e) => s + e.kmDay, 0)
    );
    const grossEarningsGenerated = roundCurrency(
      drvEntries.reduce((s, e) => s + e.earnings, 0)
    );
    const totalDriverShareEarned = roundCurrency(
      drvEntries.reduce((s, e) => s + e.driverShare, 0)
    );
    const totalFuelAndTollHandled = roundCurrency(
      drvEntries.reduce((s, e) => s + e.gasFuel + e.toll, 0)
    );
    const netOwnerContribution = roundCurrency(
      drvEntries.reduce((s, e) => s + e.netBusinessEarnings, 0)
    );

    return {
      driver: d,
      driverId: d.id,
      driverName: d.fullName,
      shiftsWorked,
      shiftsCount: shiftsWorked,
      presentDays,
      halfDays,
      leaveOrAbsentDays,
      absentOrLeaveDays: leaveOrAbsentDays,
      totalKmDriven,
      totalKm: totalKmDriven,
      grossEarningsGenerated,
      totalDriverShareEarned,
      totalDriverShare: totalDriverShareEarned,
      totalFuelAndTollHandled,
      netOwnerContribution,
    };
  });
}

/**
 * Phase 5 — Per-Vehicle Profit & Loss (P&L) aggregation combining 15-column
 * logbook entries and itemized workshop service records while keeping Driver Share
 * strictly separate from operating expenses.
 */
export function aggregateVehicleProfitAndLoss(
  vehicles: Vehicle[],
  entries: DailyLogbookEntry[],
  serviceRecords: ServiceRecord[]
): VehicleProfitLossSummary[] {
  return vehicles.map((v) => {
    const vEntries = entries.filter(
      (e) =>
        e.vehicleId === v.id ||
        e.vehicleRegistration.toUpperCase() ===
          v.registrationNumber.toUpperCase()
    );
    const vServices = serviceRecords.filter(
      (s) =>
        s.vehicleId === v.id ||
        s.vehicleRegistration.toUpperCase() ===
          v.registrationNumber.toUpperCase()
    );

    const shiftsCount = vEntries.length;
    const totalKm = roundKm(vEntries.reduce((s, e) => s + e.kmDay, 0));
    const grossEarnings = roundCurrency(
      vEntries.reduce((s, e) => s + e.earnings, 0)
    );
    const avgUnitPrice =
      totalKm > 0 ? roundCurrency(grossEarnings / totalKm) : 0;

    const gasFuelTotal = roundCurrency(
      vEntries.reduce((s, e) => s + e.gasFuel, 0)
    );
    const redTaxiTotal = roundCurrency(
      vEntries.reduce((s, e) => s + e.redTaxi, 0)
    );
    const tollTotal = roundCurrency(vEntries.reduce((s, e) => s + e.toll, 0));
    const logbookMaintenanceTotal = roundCurrency(
      vEntries.reduce((s, e) => s + e.maintenance, 0)
    );
    const otherExpensesTotal = roundCurrency(
      vEntries.reduce((s, e) => s + (e.otherExpenses || 0), 0)
    );
    const logbookOperatingExpenses = roundCurrency(
      vEntries.reduce((s, e) => s + e.totalExpenses, 0)
    );
    const workshopServiceCostTotal = roundCurrency(
      vServices.reduce((s, r) => s + r.totalCost, 0)
    );
    const combinedOperatingExpenses = roundCurrency(
      logbookOperatingExpenses + workshopServiceCostTotal
    );
    const driverShareTotal = roundCurrency(
      vEntries.reduce((s, e) => s + e.driverShare, 0)
    );
    const netLogbookEarnings = roundCurrency(
      vEntries.reduce((s, e) => s + e.netBusinessEarnings, 0)
    );
    const netAfterWorkshopService = roundCurrency(
      netLogbookEarnings - workshopServiceCostTotal
    );

    return {
      vehicleId: v.id,
      registrationNumber: v.registrationNumber,
      makeModel: `${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ''}`,
      ownershipType: v.ownershipType,
      status: v.status,
      shiftsCount,
      totalKm,
      grossEarnings,
      avgUnitPrice,
      gasFuelTotal,
      redTaxiTotal,
      tollTotal,
      logbookMaintenanceTotal,
      otherExpensesTotal,
      logbookOperatingExpenses,
      workshopServiceCostTotal,
      combinedOperatingExpenses,
      driverShareTotal,
      netLogbookEarnings,
      netAfterWorkshopService,
    };
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export interface ParsedCsvLogbookRow {
  rowNumber: number;
  valid: boolean;
  entry: Omit<
    DailyLogbookEntry,
    'id' | 'ownerId' | 'createdAt' | 'updatedAt'
  >;
  payload: Omit<
    DailyLogbookEntry,
    'id' | 'ownerId' | 'createdAt' | 'updatedAt'
  > & {
    entryDate: string;
    vehicleRegNo: string;
  };
  calculated: {
    kmDay: number;
    unitPrice: number;
    driverShare: number;
    totalExpenses: number;
    netBusinessEarnings: number;
  };
  errors: string[];
}

/**
 * Parses CSV text exported from FzeeLog or a standard 15-column spreadsheet
 * into validated DailyLogbookEntry payloads.
 */
export function parseLogbookCsvImport(
  csvText: string,
  vehicles: Vehicle[],
  drivers: Driver[],
  fourthArg: DailyLogbookEntry[] | number = 30,
  fifthArg?: number
): ParsedCsvLogbookRow[] {
  const defaultDriverSharePct =
    typeof fourthArg === 'number' ? fourthArg : fifthArg ?? 30;

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headerCols = splitCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '')
  );

  const findIdx = (candidates: string[], fallback: number): number => {
    for (const c of candidates) {
      const idx = headerCols.indexOf(c);
      if (idx !== -1) return idx;
    }
    return fallback;
  };

  const idxDate = findIdx(['date'], 1);
  const idxVeh = findIdx(['vehicle', 'registration', 'vehicleregistration'], 2);
  const idxShift = findIdx(['shift', 'shiftnumber'], 3);
  const idxStartKm = findIdx(['startingkm', 'startkm'], 4);
  const idxEndKm = findIdx(['endingkm', 'endkm'], 5);
  const idxAtt = findIdx(['attendance'], 7);
  const idxEarn = findIdx(['earnings', 'grossearnings'], 8);
  const idxSharePct = findIdx(['driversharepct', 'sharepct'], -1);
  const idxGas = findIdx(['gasfuel', 'fuel', 'gas'], 11);
  const idxRedTaxi = findIdx(['redtaxi', 'platformfee'], 12);
  const idxToll = findIdx(['toll'], 13);
  const idxMaint = findIdx(['maintenance'], 14);
  const idxRemarks = findIdx(['sourceremarks', 'remarks', 'source'], 16);

  const results: ParsedCsvLogbookRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const rowErrors: string[] = [];

    const dateVal = cols[idxDate] || getTodayKolkataDate();
    const vehRegRaw = (cols[idxVeh] || '').toUpperCase().trim();

    const matchedVehicle =
      vehicles.find(
        (v) => v.registrationNumber.toUpperCase() === vehRegRaw
      ) ||
      vehicles.find((v) => v.status !== 'Archived') ||
      vehicles[0];

    if (!matchedVehicle) {
      rowErrors.push('No matching vehicle found in fleet.');
    }

    const matchedDriver = matchedVehicle?.assignedDriverId
      ? drivers.find((d) => d.id === matchedVehicle.assignedDriverId)
      : undefined;

    const shiftNumber = Math.max(1, parseInt(cols[idxShift] || '1', 10) || 1);
    const startingKm = roundKm(parseFloat(cols[idxStartKm] || '0') || 0);
    const endingKm = roundKm(parseFloat(cols[idxEndKm] || '0') || 0);

    const rawAtt = cols[idxAtt] || 'Present';
    const validAtt: AttendanceStatus = (
      ['Present', 'Half Day', 'Absent', 'Leave'].includes(rawAtt)
        ? rawAtt
        : 'Present'
    ) as AttendanceStatus;

    const earnings = roundCurrency(parseFloat(cols[idxEarn] || '0') || 0);
    const driverSharePct =
      idxSharePct !== -1 && cols[idxSharePct]
        ? parseFloat(cols[idxSharePct]) || defaultDriverSharePct
        : matchedDriver?.defaultSharePct ?? defaultDriverSharePct;

    const gasFuel = roundCurrency(parseFloat(cols[idxGas] || '0') || 0);
    const redTaxi = roundCurrency(parseFloat(cols[idxRedTaxi] || '0') || 0);
    const toll = roundCurrency(parseFloat(cols[idxToll] || '0') || 0);
    const maintenance = roundCurrency(parseFloat(cols[idxMaint] || '0') || 0);
    const sourceRemarks = (cols[idxRemarks] || 'CSV Imported Shift').slice(
      0,
      500
    );

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      rowErrors.push(`Invalid date "${dateVal}" (expected YYYY-MM-DD).`);
    }
    if (endingKm < startingKm) {
      rowErrors.push(
        `Ending KM (${endingKm}) is less than Starting KM (${startingKm}).`
      );
    }

    const calc = calculateLogbookFinancials({
      startingKm,
      endingKm,
      earnings,
      driverSharePct,
      gasFuel,
      redTaxi,
      toll,
      maintenance,
      otherExpenses: 0,
    });

    const entryPayload = {
      vehicleId: matchedVehicle?.id || '',
      vehicleRegistration: matchedVehicle?.registrationNumber || vehRegRaw,
      vehicleRegNo: matchedVehicle?.registrationNumber || vehRegRaw,
      driverId: matchedDriver?.id || matchedVehicle?.assignedDriverId || '',
      driverName:
        matchedDriver?.fullName || matchedVehicle?.assignedDriverName || '',
      date: dateVal,
      entryDate: dateVal,
      shiftNumber,
      startingKm,
      endingKm,
      kmDay: calc.kmDay,
      attendance: validAtt,
      earnings,
      unitPrice: calc.unitPrice,
      driverSharePct,
      driverShare: calc.driverShare,
      gasFuel,
      redTaxi,
      toll,
      maintenance,
      otherExpenses: 0,
      totalExpenses: calc.totalExpenses,
      netBusinessEarnings: calc.netBusinessEarnings,
      sourceRemarks,
    };

    results.push({
      rowNumber: i + 1,
      valid: rowErrors.length === 0,
      entry: entryPayload,
      payload: entryPayload,
      calculated: calc,
      errors: rowErrors,
    });
  }

  return results;
}


// ============================================================================
// Production helpers — odometer rollback on delete & expiry display descriptors
// ============================================================================

export interface OdometerRollbackEntry {
  id: string;
  vehicleId: string;
  startingKm: number;
  endingKm: number;
}

/**
 * Recomputes a vehicle's validated odometer after one of its logbook entries
 * is deleted. Returns null when the odometer should stay unchanged (the
 * deleted entry was not the one that set the current reading, or the vehicle
 * is unknown). Otherwise returns the highest ending KM among the remaining
 * entries for that vehicle, floored at the deleted entry's starting KM and 0.
 */
export function computeOdometerAfterEntryDelete(
  vehicle: { id: string; currentOdometerKm: number } | undefined,
  deletedEntry: OdometerRollbackEntry,
  allEntries: OdometerRollbackEntry[]
): number | null {
  if (!vehicle) return null;
  if (deletedEntry.endingKm < vehicle.currentOdometerKm) return null;
  const maxRemaining = allEntries
    .filter(
      (e) => e.vehicleId === deletedEntry.vehicleId && e.id !== deletedEntry.id
    )
    .reduce((max, e) => Math.max(max, e.endingKm), deletedEntry.startingKm);
  return roundKm(Math.max(0, maxRemaining));
}

export interface DocumentExpiryBadge {
  kind: 'expired' | 'today' | 'upcoming' | 'none';
  text: string;
}

/**
 * Display descriptor for statutory document expiry badges in vehicle lists.
 * `daysUntilExpiry` comes from getDaysUntilExpiry() (negative = already
 * expired). Outside the warning window (or unknown) renders nothing.
 */
export function describeDocumentExpiry(
  daysUntilExpiry: number | undefined,
  warningWindowDays = 30
): DocumentExpiryBadge {
  if (daysUntilExpiry === undefined || daysUntilExpiry > warningWindowDays) {
    return { kind: 'none', text: '' };
  }
  if (daysUntilExpiry < 0) {
    return { kind: 'expired', text: `Doc expired ${-daysUntilExpiry}d ago` };
  }
  if (daysUntilExpiry === 0) {
    return { kind: 'today', text: 'Doc expires today' };
  }
  return { kind: 'upcoming', text: `Doc expires in ${daysUntilExpiry}d` };
}

export interface ServiceDueBadge {
  severity: 'overdue' | 'soon' | 'ok';
  text: string;
}

/** Display descriptor for the preventive-service remaining-KM badge. */
export function describeServiceDue(
  remainingKm: number,
  soonThresholdKm = 1000
): ServiceDueBadge {
  if (remainingKm < 0) {
    return {
      severity: 'overdue',
      text: `Service overdue by ${formatKm(-remainingKm)}`,
    };
  }
  if (remainingKm <= soonThresholdKm) {
    return { severity: 'soon', text: `Service in ${formatKm(remainingKm)}` };
  }
  return { severity: 'ok', text: `Service in ${formatKm(remainingKm)}` };
}
