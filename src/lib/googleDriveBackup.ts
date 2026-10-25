import {
  ComplianceDocument,
  DailyLogbookEntry,
  Driver,
  NotificationLog,
  ServiceRecord,
  UserProfile,
  Vehicle,
  VehicleMedia,
} from '../types/fleet';
import { roundCurrency, roundKm } from './calculations';

import { withRetry } from './retry';

export const FZEELOG_DRIVE_FOLDER_NAME = 'FzeeLog Fleet Backups';

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  description?: string;
}

export interface FleetBackupSnapshotPayload {
  application: 'FzeeLog';
  schemaVersion: '6.0';
  generatedAt: string;
  generatedAtKolkata: string;
  timezone: 'Asia/Kolkata';
  currency: 'INR';
  distanceUnit: 'km';
  intendedDriveEmail: string;
  businessName: string;
  isDemoMode: boolean;
  summaryCounts: {
    vehicles: number;
    drivers: number;
    dailyLogbookEntries: number;
    serviceRecords: number;
    complianceDocuments: number;
    vehicleMedia: number;
    notificationLogs: number;
  };
  financialSummary: {
    totalKmDriven: number;
    grossEarningsInr: number;
    driverShareSeparatedInr: number;
    logbookOperatingExpensesInr: number;
    workshopServiceExpensesInr: number;
    netLogbookEarningsInr: number;
  };
  profile: UserProfile | null;
  vehicles: Vehicle[];
  drivers: Driver[];
  dailyLogbookEntries: DailyLogbookEntry[];
  serviceRecords: ServiceRecord[];
  complianceDocuments: ComplianceDocument[];
  vehicleMedia: VehicleMedia[];
  notificationLogs: NotificationLog[];
}

export function buildFleetBackupSnapshot(params: {
  profile: UserProfile | null;
  vehicles: Vehicle[];
  drivers: Driver[];
  logbookEntries: DailyLogbookEntry[];
  serviceRecords: ServiceRecord[];
  complianceDocuments: ComplianceDocument[];
  vehicleMedia: VehicleMedia[];
  notificationLogs: NotificationLog[];
  isDemoMode: boolean;
}): FleetBackupSnapshotPayload {
  const now = new Date();
  const generatedAtKolkata = now.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  const totalKmDriven = roundKm(
    params.logbookEntries.reduce((s, e) => s + (Number(e.kmDay) || 0), 0)
  );
  const grossEarningsInr = roundCurrency(
    params.logbookEntries.reduce((s, e) => s + (Number(e.earnings) || 0), 0)
  );
  const driverShareSeparatedInr = roundCurrency(
    params.logbookEntries.reduce((s, e) => s + (Number(e.driverShare) || 0), 0)
  );
  const logbookOperatingExpensesInr = roundCurrency(
    params.logbookEntries.reduce(
      (s, e) => s + (Number(e.totalExpenses) || 0),
      0
    )
  );
  const workshopServiceExpensesInr = roundCurrency(
    params.serviceRecords.reduce((s, r) => s + (Number(r.totalCost) || 0), 0)
  );
  const netLogbookEarningsInr = roundCurrency(
    params.logbookEntries.reduce(
      (s, e) => s + (Number(e.netBusinessEarnings) || 0),
      0
    )
  );

  const intendedDriveEmail =
    params.profile?.intendedGoogleDriveEmail ||
    params.profile?.intendedDriveEmail ||
    '';

  return {
    application: 'FzeeLog',
    schemaVersion: '6.0',
    generatedAt: now.toISOString(),
    generatedAtKolkata,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    distanceUnit: 'km',
    intendedDriveEmail,
    businessName: params.profile?.businessName || 'FzeeLog Fleet Operations',
    isDemoMode: params.isDemoMode,
    summaryCounts: {
      vehicles: params.vehicles.length,
      drivers: params.drivers.length,
      dailyLogbookEntries: params.logbookEntries.length,
      serviceRecords: params.serviceRecords.length,
      complianceDocuments: params.complianceDocuments.length,
      vehicleMedia: params.vehicleMedia.length,
      notificationLogs: params.notificationLogs.length,
    },
    financialSummary: {
      totalKmDriven,
      grossEarningsInr,
      driverShareSeparatedInr,
      logbookOperatingExpensesInr,
      workshopServiceExpensesInr,
      netLogbookEarningsInr,
    },
    profile: params.profile,
    vehicles: params.vehicles,
    drivers: params.drivers,
    dailyLogbookEntries: params.logbookEntries,
    serviceRecords: params.serviceRecords,
    complianceDocuments: params.complianceDocuments,
    vehicleMedia: params.vehicleMedia,
    notificationLogs: params.notificationLogs,
  };
}

export function build15ColCsvString(entries: DailyLogbookEntry[]): string {
  const headers = [
    'S.NO',
    'Date',
    'Vehicle Registration',
    'Driver Name',
    'Shift',
    'Starting KM',
    'Ending KM',
    'KM/DAY',
    'Attendance',
    'Earnings (INR)',
    'Unit Price (INR/km)',
    'Driver Share %',
    'Driver Share (INR)',
    'Gas/Fuel (INR)',
    'Red Taxi (INR)',
    'Toll (INR)',
    'Maintenance (INR)',
    'Total Expenses (INR)',
    'Net Business Earnings (INR)',
    'Source/Remarks',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = entries.map((e, idx) =>
    [
      idx + 1,
      e.date || e.entryDate || '',
      e.vehicleRegistration || e.vehicleRegNo || '',
      e.driverName || '',
      e.shiftNumber,
      Number(e.startingKm || 0).toFixed(1),
      Number(e.endingKm || 0).toFixed(1),
      Number(e.kmDay || 0).toFixed(1),
      e.attendance,
      Number(e.earnings || 0).toFixed(2),
      Number(e.unitPrice || 0).toFixed(2),
      e.driverSharePct,
      Number(e.driverShare || 0).toFixed(2),
      Number(e.gasFuel || 0).toFixed(2),
      Number(e.redTaxi || 0).toFixed(2),
      Number(e.toll || 0).toFixed(2),
      Number(e.maintenance || 0).toFixed(2),
      Number(e.totalExpenses || 0).toFixed(2),
      Number(e.netBusinessEarnings || 0).toFixed(2),
      e.sourceRemarks || '',
    ]
      .map(escapeCsv)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Finds or creates the dedicated "FzeeLog Fleet Backups" folder in the user's Google Drive
 * using the `drive.file` scope.
 */
export async function ensureFzeeLogDriveFolder(
  accessToken: string
): Promise<DriveFileMetadata> {
  const query = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${FZEELOG_DRIVE_FOLDER_NAME}' and trashed = false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink)&pageSize=5`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchRes.ok) {
    const errBody = await searchRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Google Drive folder lookup failed (HTTP ${searchRes.status}).`
    );
  }

  const searchData = await searchRes.json();
  if (Array.isArray(searchData.files) && searchData.files.length > 0) {
    return searchData.files[0] as DriveFileMetadata;
  }

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,createdTime,modifiedTime,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: FZEELOG_DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description:
          'FzeeLog Full-Stack Vehicle Logbook & Fleet Management Backup Archive Vault (INR / km / Asia/Kolkata)',
      }),
    }
  );

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Failed to create FzeeLog folder in Google Drive (HTTP ${createRes.status}).`
    );
  }

  return (await createRes.json()) as DriveFileMetadata;
}

/**
 * Lists backup files created by FzeeLog in Google Drive.
 */
export async function listFzeeLogDriveBackups(
  accessToken: string,
  folderId?: string
): Promise<DriveFileMetadata[]> {
  const clauses = [
    `mimeType != 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ];
  if (folderId) {
    clauses.push(`'${folderId}' in parents`);
  }
  const q = encodeURIComponent(clauses.join(' and '));
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=30&fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,description)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Failed to list Google Drive backups (HTTP ${res.status}).`
    );
  }

  const data = await res.json();
  return Array.isArray(data.files) ? (data.files as DriveFileMetadata[]) : [];
}

/**
 * Uploads a multipart file (JSON snapshot or CSV spreadsheet) into the FzeeLog Google Drive folder.
 */
async function uploadMultipartFileToDrive(params: {
  accessToken: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  contentString: string;
  description: string;
  existingFileIdToOverwrite?: string;
}): Promise<DriveFileMetadata> {
  const boundary = `fzeelog_boundary_${Date.now()}`;
  const metadata: Record<string, any> = {
    name: params.fileName,
    mimeType: params.mimeType,
    description: params.description,
  };
  if (!params.existingFileIdToOverwrite && params.folderId) {
    metadata.parents = [params.folderId];
  }

  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${params.mimeType}; charset=UTF-8`,
    '',
    params.contentString,
    `--${boundary}--`,
  ].join('\r\n');

  const url = params.existingFileIdToOverwrite
    ? `https://www.googleapis.com/upload/drive/v3/files/${params.existingFileIdToOverwrite}?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,description`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,description';

  const res = await fetch(url, {
    method: params.existingFileIdToOverwrite ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Google Drive upload failed (HTTP ${res.status}).`
    );
  }

  return (await res.json()) as DriveFileMetadata;
}

export async function uploadJsonSnapshotToDrive(params: {
  accessToken: string;
  folderId: string;
  snapshot: FleetBackupSnapshotPayload;
  existingFileIdToOverwrite?: string;
}): Promise<DriveFileMetadata> {
  const safeDate = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const fileName = `FzeeLog_Backup_${safeDate}.json`;
  const description = `FzeeLog Snapshot (${params.snapshot.generatedAtKolkata} IST) | Vehicles: ${params.snapshot.summaryCounts.vehicles}, Shifts: ${params.snapshot.summaryCounts.dailyLogbookEntries}, Net: Rs.${params.snapshot.financialSummary.netLogbookEarningsInr}`;

  return withRetry(() =>
    uploadMultipartFileToDrive({
      accessToken: params.accessToken,
      folderId: params.folderId,
      fileName,
      mimeType: 'application/json',
      contentString: JSON.stringify(params.snapshot, null, 2),
      description,
      existingFileIdToOverwrite: params.existingFileIdToOverwrite,
    })
  );
}

export async function uploadCsvLogbookToDrive(params: {
  accessToken: string;
  folderId: string;
  entries: DailyLogbookEntry[];
  businessName: string;
}): Promise<DriveFileMetadata> {
  const safeDate = new Date().toISOString().slice(0, 10);
  const fileName = `FzeeLog_15Col_Logbook_${safeDate}.csv`;
  const csvString = build15ColCsvString(params.entries);
  const description = `FzeeLog 15-Column Daily Logbook CSV (${params.entries.length} shifts) — ${params.businessName}`;

  return withRetry(() =>
    uploadMultipartFileToDrive({
      accessToken: params.accessToken,
      folderId: params.folderId,
      fileName,
      mimeType: 'text/csv',
      contentString: csvString,
      description,
    })
  );
}

export async function downloadDriveBackupJson(
  accessToken: string,
  fileId: string
): Promise<ParsedFleetBackupRestore> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Failed to download backup file from Google Drive (HTTP ${res.status}).`
    );
  }

  const rawText = await res.text();
  return parseAndValidateBackupJson(rawText);
}

export async function deleteDriveBackupFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok && res.status !== 204) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Failed to delete file from Google Drive (HTTP ${res.status}).`
    );
  }
}

export interface ParsedFleetBackupRestore {
  valid: boolean;
  errors: string[];
  generatedAt: string;
  businessName: string;
  vehicles: Vehicle[];
  drivers: Driver[];
  dailyLogbookEntries: DailyLogbookEntry[];
  serviceRecords: ServiceRecord[];
  complianceDocuments: ComplianceDocument[];
}

export function parseAndValidateBackupJson(
  rawJsonText: string
): ParsedFleetBackupRestore {
  const errors: string[] = [];
  let parsed: any;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return {
      valid: false,
      errors: ['Invalid JSON file: could not parse JSON structure.'],
      generatedAt: '',
      businessName: '',
      vehicles: [],
      drivers: [],
      dailyLogbookEntries: [],
      serviceRecords: [],
      complianceDocuments: [],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    errors.push('Backup payload must be a JSON object.');
  }

  const vehicles = Array.isArray(parsed?.vehicles) ? parsed.vehicles : [];
  const drivers = Array.isArray(parsed?.drivers) ? parsed.drivers : [];
  const dailyLogbookEntries = Array.isArray(parsed?.dailyLogbookEntries)
    ? parsed.dailyLogbookEntries
    : Array.isArray(parsed?.logbookEntries)
    ? parsed.logbookEntries
    : [];
  const serviceRecords = Array.isArray(parsed?.serviceRecords)
    ? parsed.serviceRecords
    : [];
  const complianceDocuments = Array.isArray(parsed?.complianceDocuments)
    ? parsed.complianceDocuments
    : [];

  if (
    vehicles.length === 0 &&
    drivers.length === 0 &&
    dailyLogbookEntries.length === 0 &&
    serviceRecords.length === 0 &&
    complianceDocuments.length === 0
  ) {
    errors.push(
      'Backup archive does not contain any recognizable FzeeLog records (vehicles, drivers, dailyLogbookEntries, serviceRecords, or complianceDocuments).'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    generatedAt: String(
      parsed?.generatedAtKolkata || parsed?.generatedAt || 'Unknown Timestamp'
    ),
    businessName: String(parsed?.businessName || 'FzeeLog Backup Archive'),
    vehicles,
    drivers,
    dailyLogbookEntries,
    serviceRecords,
    complianceDocuments,
  };
}
