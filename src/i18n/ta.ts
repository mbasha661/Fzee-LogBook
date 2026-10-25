import type { StringTable } from './en';

/**
 * Tamil (தமிழ்) string table.
 * NOTE: AI-translated scaffold. Every string here is machine-translated and
 * MUST be reviewed by a native Tamil speaker before production use. Keys and
 * structure mirror en.ts exactly.
 */
export const ta: StringTable = {
  appName: 'FzeeLogBook',
  nav: {
    dashboard: 'டாஷ்போர்டு',
    logbook: 'தினசரி பதிவேடு',
    vehicles: 'வாகனங்கள்',
    drivers: 'ஓட்டுநர்கள் & செயல்பாடுகள்',
    service: 'சர்வீஸ் & பராமரிப்பு',
    reports: 'அறிக்கைகள்',
    notifications: 'அறிவிப்புகள்',
    backup: 'Google Drive காப்புப்பிரதி',
    settings: 'அமைப்புகள்',
  },
  logbook: {
    date: 'தேதி',
    vehicleId: 'வாகன எண்',
    driverId: 'ஓட்டுநர் ஐடி (விருப்பம்)',
    startingKm: 'தொடக்க KM',
    endingKm: 'இறுதி KM',
    kmDay: 'KM/நாள்',
    attendance: 'வருகை',
    earnings: 'வருவாய்',
    unitPrice: 'அலகு விலை',
    driverShare: 'ஓட்டுநர் பங்கு',
    gasFuel: 'எரிவாயு/எரிபொருள்',
    redTaxi: 'ரெட் டாக்சி',
    toll: 'சுங்கம்',
    maintenance: 'பராமரிப்பு',
    totalExpenses: 'மொத்த செலவுகள்',
    netEarnings: 'நிகர வருவாய்',
    sourceRemarks: 'ஆதாரம்/குறிப்புகள்',
  },
  notifications: {
    dailySummary: 'தினசரி சுருக்கம்',
    expiryReminder: 'காலாவதி நினைவூட்டல்',
    serviceReminder: 'சர்வீஸ் நினைவூட்டல்',
    deliveryLog: 'டெலிவரி பதிவு',
    consentLabel: 'திட்டமிடப்பட்ட அறிவிப்புகளுக்கு நான் ஒப்புக்கொள்கிறேன்',
  },
  common: {
    save: 'சேமி',
    cancel: 'ரத்து செய்',
    delete: 'நீக்கு',
    edit: 'திருத்து',
    loading: 'ஏற்றுகிறது...',
    language: 'மொழி',
  },
};
