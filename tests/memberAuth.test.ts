import { describe, expect, it } from 'vitest';
import { deriveMemberPassword, hashPin, verifyMemberPin } from '../src/lib/security';

describe('deriveMemberPassword', () => {
  it('derives a deterministic password from the PIN', () => {
    expect(deriveMemberPassword('4821')).toBe('fzlb-member:4821');
    expect(deriveMemberPassword('4821')).toBe(deriveMemberPassword(' 4821 '));
    expect(deriveMemberPassword('4821')).not.toBe(deriveMemberPassword('4822'));
  });

  it('keeps derived passwords at a Firebase-safe length', () => {
    const long = deriveMemberPassword('1234567890123456789012345');
    expect(long.length).toBeGreaterThanOrEqual(8);
    expect(long.length).toBeLessThanOrEqual(28);
  });
});

describe('member PIN hashing stays consistent with login derivation', () => {
  it('verifyMemberPin matches the hashed PIN the member logs in with', async () => {
    const pin = '7302';
    const hash = await hashPin(pin);
    expect(await verifyMemberPin({ accessPin: '', accessPinHash: hash }, pin)).toBe(true);
    expect(await verifyMemberPin({ accessPin: '', accessPinHash: hash }, '7303')).toBe(false);
    expect(deriveMemberPassword(pin)).toBe('fzlb-member:7302');
  });
});
