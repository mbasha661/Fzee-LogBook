/**
 * FzeeLogBook central string table - English (source of truth).
 * Every user-facing label that is internationalized must live here first.
 */
export const en = {
  appName: 'FzeeLogBook',
  nav: {
    dashboard: 'Dashboard',
    logbook: 'Daily Logbook',
    vehicles: 'Vehicles',
    drivers: 'Drivers & Operations',
    service: 'Service & Maintenance',
    reports: 'Reports',
    notifications: 'Notifications',
    backup: 'Google Drive Backup',
    settings: 'Settings',
  },
  logbook: {
    date: 'Date',
    vehicleId: 'Vehicle ID',
    driverId: 'Driver ID (Optional)',
    startingKm: 'Starting KM',
    endingKm: 'Ending KM',
    kmDay: 'KM/DAY',
    attendance: 'Attendance',
    earnings: 'Earnings',
    unitPrice: 'Unit Price',
    driverShare: 'Driver Share',
    gasFuel: 'Gas/Fuel',
    redTaxi: 'Red Taxi',
    toll: 'Toll',
    maintenance: 'Maintenance',
    totalExpenses: 'Total Expenses',
    netEarnings: 'Net Earnings',
    sourceRemarks: 'Source/Remarks',
  },
  notifications: {
    dailySummary: 'Daily Summary',
    expiryReminder: 'Expiry Reminder',
    serviceReminder: 'Service Reminder',
    deliveryLog: 'Delivery Log',
    consentLabel: 'I consent to scheduled notifications',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    loading: 'Loading...',
    language: 'Language',
  },
} as const;

type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type StringTable = DeepStrings<typeof en>;
export type StringKey = keyof StringTable;
