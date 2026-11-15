import type { AccountMode } from '../types/fleet';
export interface AccountInput {
  authAction: string; accountMode: AccountMode; email: string;
  passwordOrPin: string; fullName: string; organizationName: string; whatsappNumber: string;
}
export function validateAccountInput(p: AccountInput) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) throw new Error('Enter a valid email address.');
  if (!p.passwordOrPin) throw new Error('Enter your password.');
  if (p.authAction !== 'signup') return;
  if (!['Individual', 'Organization'].includes(p.accountMode)) throw new Error('Choose Individual or Organization.');
  if (!p.fullName.trim() || p.fullName.trim().length > 100) throw new Error('Enter your full name (up to 100 characters).');
  if (p.passwordOrPin.length < 8) throw new Error('Use a password with at least 8 characters.');
  if (p.accountMode === 'Organization' && (!p.organizationName.trim() || p.organizationName.trim().length > 120)) throw new Error('Enter your organization name (up to 120 characters).');
  if (p.whatsappNumber && !/^\+?[0-9 ()-]{5,25}$/.test(p.whatsappNumber)) throw new Error('Enter a valid phone number, or leave it blank.');
}
export function buildAccountProfile(uid: string, p: AccountInput) {
  validateAccountInput(p);
  const now = new Date().toISOString();
  const name = p.fullName.trim(); const email = p.email.trim().toLowerCase();
  const businessName = p.accountMode === 'Organization' ? p.organizationName.trim() : `${name}'s Logbook`.slice(0, 120);
  return {
    ownerId: uid, email, displayName: name, businessName, accountMode: p.accountMode,
    organizationName: p.accountMode === 'Organization' ? businessName : '',
    alertEmail: email, ...(p.whatsappNumber ? { whatsappNumber: p.whatsappNumber.trim() } : {}),
    defaultDriverSharePct: 30, currency: 'INR', distanceUnit: 'km', timezone: 'Asia/Kolkata',
    intendedGoogleDriveEmail: email, expiryAlertDays: 30, serviceWarningKm: 1000,
    createdAt: now, updatedAt: now,
  };
}
