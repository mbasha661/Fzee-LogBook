import {describe, expect, it} from 'vitest';
import {
  findMemberForLogin,
  hashPin,
  PIN_SALT,
  resolveMemberPinHash,
  verifyMemberPin,
} from '../src/lib/security';
import {DEMO_ORGANIZATION_MEMBERS} from '../src/lib/demoData';

describe('hashPin', () => {
  it('is deterministic for the same PIN', async () => {
    expect(await hashPin('1234')).toBe(await hashPin('1234'));
  });

  it('produces a 64-char lowercase hex SHA-256 digest', async () => {
    expect(await hashPin('1234')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs between different PINs', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1235'));
  });

  it('is salted: differs from the raw SHA-256 of the PIN', async () => {
    const data = new TextEncoder().encode('1234');
    const digest = await crypto.subtle.digest('SHA-256', data);
    const rawHex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(await hashPin('1234')).not.toBe(rawHex);
  });

  it('matches the documented salt prefix', async () => {
    const data = new TextEncoder().encode(PIN_SALT + '1234');
    const digest = await crypto.subtle.digest('SHA-256', data);
    const expected = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(await hashPin('1234')).toBe(expected);
  });

  it('is PIN-only sensitive: surrounding whitespace changes the hash', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1234 '));
  });
});

describe('verifyMemberPin', () => {
  it('accepts the correct PIN against a stored hash', async () => {
    const member = {accessPinHash: await hashPin('4321'), accessPin: ''};
    await expect(verifyMemberPin(member, '4321')).resolves.toBe(true);
  });

  it('rejects a wrong PIN against a stored hash', async () => {
    const member = {accessPinHash: await hashPin('4321'), accessPin: ''};
    await expect(verifyMemberPin(member, '4322')).resolves.toBe(false);
    await expect(verifyMemberPin(member, '')).resolves.toBe(false);
  });

  it('hash takes precedence over a stale plaintext field', async () => {
    const member = {accessPinHash: await hashPin('4321'), accessPin: '9999'};
    await expect(verifyMemberPin(member, '9999')).resolves.toBe(false);
    await expect(verifyMemberPin(member, '4321')).resolves.toBe(true);
  });

  it('falls back to legacy plaintext comparison when no hash exists', async () => {
    const legacy = {accessPin: '7777'};
    await expect(verifyMemberPin(legacy, '7777')).resolves.toBe(true);
    await expect(verifyMemberPin(legacy, '7778')).resolves.toBe(false);
  });

  it('treats a member with no credentials as unrestricted (legacy behavior)', async () => {
    await expect(verifyMemberPin({}, 'anything')).resolves.toBe(true);
  });
});

describe('seeded demo organization members', () => {
  it('store no plaintext PINs', () => {
    for (const m of DEMO_ORGANIZATION_MEMBERS) {
      expect(m.accessPin).toBe('');
      expect(m.accessPinHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('verify against their documented demo PINs', async () => {
    const expectedPins: Record<string, string> = {
      'org-mem-1': '1234',
      'org-mem-2': '2222',
      'org-mem-3': '3333',
      'org-mem-4': '4444',
    };
    for (const m of DEMO_ORGANIZATION_MEMBERS) {
      const pin = expectedPins[m.id];
      expect(pin, `missing expected PIN for ${m.id}`).toBeTruthy();
      await expect(verifyMemberPin(m, pin)).resolves.toBe(true);
      await expect(verifyMemberPin(m, '0000')).resolves.toBe(false);
    }
  });
});



const members = [
  {
    id: 'org-mem-1',
    fullName: 'A. Owner',
    email: 'owner@example.com',
    whatsappNumber: '9000000001',
    role: 'Owner / Admin' as const,
    accessPin: '',
    accessPinHash: '',
    status: 'Active' as const,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ownerId: 'demo-owner',
  },
  {
    id: 'org-mem-2',
    fullName: 'B. Manager',
    email: 'manager@example.com',
    whatsappNumber: '9000000002',
    role: 'Fleet Manager' as const,
    accessPin: '',
    accessPinHash: '',
    status: 'Active' as const,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ownerId: 'demo-owner',
  },
];

describe('findMemberForLogin', () => {
  it('resolves by exact member id', () => {
    expect(
      findMemberForLogin(members, { memberId: 'org-mem-2' })?.id
    ).toBe('org-mem-2');
  });

  it('resolves by exact case-insensitive email', () => {
    expect(
      findMemberForLogin(members, { email: '  OWNER@example.com ' })?.id
    ).toBe('org-mem-1');
  });

  it('resolves by non-empty name substring', () => {
    expect(findMemberForLogin(members, { fullName: 'manager' })?.id).toBe(
      'org-mem-2'
    );
  });

  it('never matches on an empty email or name (blank form cannot hijack first member)', () => {
    expect(
      findMemberForLogin(members, { email: '', fullName: '' })
    ).toBeUndefined();
    expect(findMemberForLogin(members, {})).toBeUndefined();
    expect(
      findMemberForLogin(members, { email: '   ', fullName: '  ' })
    ).toBeUndefined();
  });

  it('never matches a partial email', () => {
    expect(
      findMemberForLogin(members, { email: 'owner@' })
    ).toBeUndefined();
  });

  it('falls through an unknown id to an exact email match', () => {
    expect(
      findMemberForLogin(members, {
        memberId: 'missing',
        email: 'manager@example.com',
      })?.id
    ).toBe('org-mem-2');
  });
});

describe('resolveMemberPinHash', () => {
  it('hashes an explicit new PIN', async () => {
    const hash = await resolveMemberPinHash(' 5678 ');
    expect(hash).toBe(await hashPin('5678'));
  });

  it('truncates PINs to 16 characters like the save path', async () => {
    const hash = await resolveMemberPinHash('12345678901234567890');
    expect(hash).toBe(await hashPin('1234567890123456'));
  });

  it('preserves the existing hash when the PIN field is left blank on edit', async () => {
    const existing = await hashPin('9999');
    expect(await resolveMemberPinHash('', existing)).toBe(existing);
    expect(await resolveMemberPinHash('   ', existing)).toBe(existing);
  });

  it('rejects a brand-new member with no PIN instead of assigning a default', async () => {
    await expect(resolveMemberPinHash('')).rejects.toThrow(/Access PIN/);
    await expect(resolveMemberPinHash('   ')).rejects.toThrow(/Access PIN/);
  });

  it('a member saved through resolveMemberPinHash verifies with that PIN only', async () => {
    const hash = await resolveMemberPinHash('2468');
    const member = { accessPin: '', accessPinHash: hash };
    expect(await verifyMemberPin(member, '2468')).toBe(true);
    expect(await verifyMemberPin(member, '1234')).toBe(false);
    expect(await verifyMemberPin(member, '')).toBe(false);
  });
});
