import { describe, it, expect } from 'vitest';
import { buildAccountProfile, validateAccountInput } from '../src/lib/accountAuth';
import { readFileSync } from 'node:fs';
const individual = { authAction: 'signup', accountMode: 'Individual' as const, email: ' PERSON@example.com ', passwordOrPin: 'strong-pass-123', fullName: 'Person A', organizationName: '', whatsappNumber: '' };
describe('real account creation', () => {
  it('never falls back to seeded team members for an empty real workspace', () => { expect(readFileSync('src/context/FleetContext.tsx','utf8')).not.toContain('liveOrgMembers.length === 0'); });
  it('creates an individual identity with no fleet seed data or password', () => { const p = buildAccountProfile('uid-A', individual); expect(p.ownerId).toBe('uid-A'); expect(p.accountMode).toBe('Individual'); expect(p.email).toBe('person@example.com'); expect(JSON.stringify(p)).not.toContain('strong-pass'); expect(p).not.toHaveProperty('vehicles'); });
  it('creates an organization owned only by its authenticated UID', () => { const p = buildAccountProfile('uid-B', { ...individual, accountMode: 'Organization', organizationName: 'Fresh Company' }); expect(p.ownerId).toBe('uid-B'); expect(p.businessName).toBe('Fresh Company'); });
  it('requires an organization name', () => { expect(() => validateAccountInput({ ...individual, accountMode: 'Organization' })).toThrow('organization name'); });
  it('rejects invalid emails and short passwords', () => { expect(() => validateAccountInput({ ...individual, email: 'wrong' })).toThrow(); expect(() => validateAccountInput({ ...individual, passwordOrPin: '1234' })).toThrow('8 characters'); });
  it('does not reapply signup restrictions to existing login credentials', () => { expect(() => validateAccountInput({ ...individual, authAction: 'login', fullName: '', passwordOrPin: '123456' })).not.toThrow(); });
  it('does not auto-enable demo when Firebase is absent', () => { const source = readFileSync('src/context/FleetContext.tsx','utf8'); expect(source).toContain('const [isDemoMode, setIsDemoMode] = useState<boolean>(false)'); });
  it('signs organization members in with their own Firebase account derived from the PIN', () => { const s = readFileSync('src/context/FleetContext.tsx','utf8'); expect(s).toContain('signInWithEmailAndPassword(auth, email, deriveMemberPassword(pin))'); expect(s).toContain('provisionMemberAuthAccount('); });
  it('queries each collection by authenticated owner UID', () => { const s = readFileSync('src/context/FleetContext.tsx','utf8'); expect((s.match(/where\('ownerId', '==', uid\)/g) || []).length).toBe(9); });
  it('disables shared notification API state for real accounts', () => { const s=readFileSync('server.ts','utf8'); expect(s).toContain("app.use('/api/notifications'"); expect(s).toContain('createNotificationRouter()'); });
});
