/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PIN security helpers for organization member access.
 *
 * PINs are never stored in plaintext for new/updated members: only a salted
 * SHA-256 digest (`accessPinHash`) is persisted. Legacy members that still
 * carry a plaintext `accessPin` keep working until their PIN is next changed,
 * at which point the plaintext is cleared and only the hash remains.
 */

export const PIN_SALT = 'fzeelog-pin-v1:';

/** Returns the salted SHA-256 hex digest of a member access PIN. */
export const hashPin = async (pin: string): Promise<string> => {
  const data = new TextEncoder().encode(PIN_SALT + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export interface PinCredentials {
  accessPinHash?: string;
  accessPin?: string;
}

/**
 * Verifies a presented PIN against a member's stored credentials.
 * Prefers the salted hash; falls back to legacy plaintext comparison;
 * a member with neither field set is treated as unrestricted (legacy demo data).
 */
export const verifyMemberPin = async (
  member: PinCredentials,
  pin: string
): Promise<boolean> => {
  if (member.accessPinHash) {
    return (await hashPin(pin)) === member.accessPinHash;
  }
  if (member.accessPin) {
    return pin === member.accessPin;
  }
  return true;
};

export interface MemberLookupParams {
  memberId?: string;
  email?: string;
  fullName?: string;
}

/**
 * Resolves an organization member for portal login.
 * An exact member id wins; otherwise an exact (case-insensitive) email match;
 * otherwise a non-empty full-name substring match. Empty identifiers never
 * match, so a blank login form cannot resolve to an arbitrary member.
 */
export const findMemberForLogin = <
  T extends { id: string; email: string; fullName: string }
>(
  members: T[],
  params: MemberLookupParams
): T | undefined => {
  if (params.memberId) {
    const byId = members.find((m) => m.id === params.memberId);
    if (byId) return byId;
  }
  const email = (params.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = members.find((m) => m.email.toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = (params.fullName || '').trim().toLowerCase();
  if (name) {
    return members.find((m) => m.fullName.toLowerCase().includes(name));
  }
  return undefined;
};

/**
 * Returns the salted hash to persist for a member save. A new explicit PIN
 * always wins; an existing hash is preserved when the PIN field is left blank
 * on edit; a brand-new member with neither is rejected instead of silently
 * receiving a well-known default PIN.
 */
export const resolveMemberPinHash = async (
  rawPin: string,
  existingHash?: string
): Promise<string> => {
  const pin = (rawPin || '').trim().slice(0, 16);
  if (pin) return hashPin(pin);
  if (existingHash) return existingHash;
  throw new Error(
    'An Access PIN (4-16 characters) is required to save an organization member.'
  );
};
