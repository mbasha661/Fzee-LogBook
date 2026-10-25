export type VehicleFuelType =
  | 'Petrol'
  | 'Diesel'
  | 'CNG'
  | 'LPG'
  | 'Petrol+CNG'
  | 'Electric'
  | 'Hybrid';

export type VehicleTransmission = 'Manual' | 'Automatic' | 'AMT' | 'CVT';

export type VehicleBodyType =
  | 'Sedan'
  | 'SUV'
  | 'Hatchback'
  | 'MPV'
  | 'Commercial Van'
  | 'Truck';

export type VehicleOwnershipType =
  | 'Personal'
  | 'Commercial'
  | 'Leased'
  | 'Attached';

export type VehicleStatus = 'Active' | 'Maintenance' | 'Inactive' | 'Archived';

export type DriverStatus = 'Active' | 'On Leave' | 'Inactive' | 'Archived';

export type AttendanceStatus = 'Present' | 'Half Day' | 'Absent' | 'Leave';

export type ServiceTypeCategory =
  | 'Periodic Service'
  | 'Oil & Filter Change'
  | 'Brake & Suspension'
  | 'CNG/LPG Kit Calibration'
  | 'Tyre & Wheel Alignment'
  | 'Electrical & Battery'
  | 'Body & Accident Repair'
  | 'General Inspection'
  | 'Preventive Service'
  | 'Major Overhaul'
  | 'Tyre & Alignment'
  | 'Brake & Clutch'
  | 'CNG / Fuel System'
  | 'Other';

export type ServiceRecordType = ServiceTypeCategory;

export type ServiceRecordStatus =
  | 'Completed'
  | 'Scheduled'
  | 'In Progress'
  | 'In Workshop';

export type ComplianceTargetType = 'Vehicle' | 'Driver' | 'vehicle' | 'driver';

export type ComplianceDocumentType =
  | 'Insurance Policy'
  | 'Fitness Certificate (FC)'
  | 'Permit Certificate'
  | 'Pollution Certificate (PUCC)'
  | 'Registration Certificate (RC)'
  | 'Tax Receipt'
  | 'Driver Licence'
  | 'Commercial Permit'
  | 'Pollution Certificate (PUC)'
  | 'Tax Token'
  | 'Driver License (DL)'
  | 'Service Invoice';

export type ComplianceDocumentCategory = ComplianceDocumentType;

export type ComplianceDocumentStatus = 'Active' | 'Superseded' | 'Archived';

export type VehicleMediaCategory = 'AnglePhoto' | 'Model3D' | 'AICalibration';

export type VehicleAngleLabel =
  | '0_Front'
  | '45_FrontLeft'
  | '90_Left'
  | '135_RearLeft'
  | '180_Rear'
  | '225_RearRight'
  | '270_Right'
  | '315_FrontRight'
  | 'Custom';

export type VehicleMediaMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'model/gltf-binary'
  | 'model/gltf+json'
  | 'application/json';

export type NotificationAlertType =
  | 'StatutoryExpiry'
  | 'ServiceOdometer'
  | 'ServiceDate'
  | 'DriverLicense'
  | 'FinancialDigest'
  | 'ReportExport';

export type NotificationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type NotificationChannel =
  | 'InApp'
  | 'EmailDigest'
  | 'WhatsApp'
  | 'PDFReport';

export type NotificationStatus =
  | 'Unread'
  | 'Acknowledged'
  | 'Dispatched'
  | 'Archived';

export type AccountMode = 'Individual' | 'Organization';

export type OrgMemberRole =
  | 'Owner / Admin'
  | 'OrgAdmin'
  | 'Fleet Manager'
  | 'FleetManager'
  | 'Accountant'
  | 'Dispatcher'
  | 'Driver Operator'
  | 'DriverViewer';

export interface OrganizationMember {
  id: string;
  ownerId: string;
  organizationName?: string;
  fullName: string;
  email: string;
  whatsappNumber: string;
  role: OrgMemberRole;
  /** Legacy plaintext PIN. Empty for members whose PIN is stored hashed. */
  accessPin: string;
  /** Salted SHA-256 of the access PIN (preferred). */
  accessPinHash?: string;
  status: 'Active' | 'Suspended';
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomLogbookHeaders {
  sno: string;
  date: string;
  startingKm: string;
  endingKm: string;
  kmDay: string;
  attendance: string;
  earnings: string;
  unitPrice: string;
  driverShare: string;
  gasFuel: string;
  redTaxi: string;
  toll: string;
  maintenance: string;
  totalExpenses: string;
  netBusinessEarnings: string;
  sourceRemarks: string;
}

export interface UserProfile {
  id: string;
  ownerId: string;
  email: string;
  displayName: string;
  fullName?: string;
  businessName: string;
  accountMode?: AccountMode;
  organizationName?: string;
  alertEmail?: string;
  whatsappNumber?: string;
  alertMilestonesDays?: number[];
  customLogbookHeaders?: Partial<CustomLogbookHeaders>;
  defaultDriverSharePct: number;
  currency: 'INR';
  distanceUnit: 'km';
  timezone: 'Asia/Kolkata';
  intendedGoogleDriveEmail: string;
  intendedDriveEmail?: string;
  expiryAlertDays?: number;
  expiryWarningDays?: number;
  serviceWarningKm?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  registrationNumber: string;
  make: string;
  model: string;
  variant: string;
  manufacturingYear: number;
  colour: string;
  fuelType: VehicleFuelType;
  transmission: VehicleTransmission;
  vehicleType: VehicleBodyType;
  ownershipType: VehicleOwnershipType;
  purchaseDate: string;
  purchasePrice: number;
  currentOdometerKm: number;
  assignedDriverId: string;
  assignedDriverName: string;
  insuranceProvider: string;
  insuranceExpiry: string;
  fcNumber: string;
  fcExpiry: string;
  permitType: string;
  permitNumber: string;
  permitExpiry: string;
  pollutionExpiry: string;
  lastServiceDate: string;
  lastServiceOdometerKm: number;
  nextServiceDate: string;
  nextServiceOdometerKm: number;
  serviceIntervalKm: number;
  notes: string;
  status: VehicleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Driver {
  id: string;
  ownerId: string;
  fullName: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: string;
  defaultSharePct: number;
  assignedVehicleId: string;
  joiningDate?: string;
  status: DriverStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyLogbookEntry {
  id: string;
  ownerId: string;
  vehicleId: string;
  vehicleRegistration: string;
  vehicleRegNo?: string;
  driverId: string;
  driverName: string;
  date: string;
  entryDate?: string;
  shiftNumber: number;
  startingKm: number;
  endingKm: number;
  kmDay: number;
  attendance: AttendanceStatus;
  earnings: number;
  unitPrice: number;
  driverSharePct: number;
  driverShare: number;
  gasFuel: number;
  redTaxi: number;
  toll: number;
  maintenance: number;
  otherExpenses: number;
  totalExpenses: number;
  netBusinessEarnings: number;
  sourceRemarks: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecord {
  id: string;
  ownerId: string;
  vehicleId: string;
  vehicleRegistration: string;
  vehicleRegNo: string;
  serviceDate: string;
  serviceType: ServiceTypeCategory;
  odometerKm: number;
  nextServiceDueKm: number;
  nextServiceOdometerKm: number;
  nextServiceDueDate: string;
  nextServiceDate: string;
  workshopName: string;
  invoiceNumber: string;
  invoiceReference: string;
  partsCost: number;
  laborCost: number;
  totalCost: number;
  status: ServiceRecordStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceDocument {
  id: string;
  ownerId: string;
  targetType: 'Vehicle' | 'Driver';
  entityType: 'vehicle' | 'driver';
  targetId: string;
  entityId: string;
  targetLabel: string;
  entityLabel: string;
  documentType: ComplianceDocumentType;
  documentCategory: ComplianceDocumentCategory;
  documentNumber: string;
  providerOrAuthority: string;
  issuingAuthority: string;
  issueDate: string;
  expiryDate: string;
  premiumOrFee: number;
  renewalCost: number;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  fileDataUrl: string;
  verificationDigest: string;
  status: ComplianceDocumentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleMedia {
  id: string;
  ownerId: string;
  vehicleId: string;
  registrationNumber: string;
  mediaCategory: VehicleMediaCategory;
  angleLabel: VehicleAngleLabel;
  angleDegrees: number;
  fileName: string;
  mimeType: VehicleMediaMimeType;
  fileSizeBytes: number;
  dataUrl: string;
  storagePath: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle3DAICalibration {
  lengthScale: number;
  widthScale: number;
  heightScale: number;
  rideHeightOffset: number;
  primaryPaintHex: string;
  metalness: number;
  roughness: number;
  hasRoofCarrierOrBeacon: boolean;
  detectedBodyStyle: VehicleBodyType;
  inspectionSummary: string;
  calibratedAt: string;
}

export interface NotificationLog {
  id: string;
  ownerId: string;
  alertType: NotificationAlertType;
  severity: NotificationSeverity;
  targetLabel: string;
  title: string;
  message: string;
  recipientEmail: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleProfitLossSummary {
  vehicleId: string;
  registrationNumber: string;
  makeModel: string;
  ownershipType: string;
  status: string;
  shiftsCount: number;
  totalKm: number;
  grossEarnings: number;
  avgUnitPrice: number;
  gasFuelTotal: number;
  redTaxiTotal: number;
  tollTotal: number;
  logbookMaintenanceTotal: number;
  otherExpensesTotal: number;
  logbookOperatingExpenses: number;
  workshopServiceCostTotal: number;
  combinedOperatingExpenses: number;
  driverShareTotal: number;
  netLogbookEarnings: number;
  netAfterWorkshopService: number;
}

export interface AuditLogItem {
  id: string;
  ownerId: string;
  action: string;
  entityType:
    | 'Profile'
    | 'Vehicle'
    | 'Driver'
    | 'DailyLogbookEntry'
    | 'ServiceRecord'
    | 'ComplianceDocument'
    | 'VehicleMedia'
    | 'NotificationLog'
    | 'Backup';
  entityId: string;
  summary: string;
  createdAt: string;
}

export type NavigationTab =
  | 'dashboard'
  | 'vehicles'
  | 'logbook'
  | 'finance'
  | 'drivers'
  | 'maintenance'
  | 'documents'
  | 'viewer3d'
  | 'reports'
  | 'notifications'
  | 'backup'
  | 'drive_backup'
  | 'settings';
