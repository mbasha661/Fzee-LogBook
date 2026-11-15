import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { NotificationScheduler, DEFAULT_SETTINGS } from '../src/server/notificationScheduler';

describe('standalone portability', () => {
  it('does not ship the original host Firebase configuration', () => {
    expect(existsSync('firebase-applet-config.json')).toBe(false);
    expect(readFileSync('src/lib/firebase.ts', 'utf8')).toContain('VITE_FIREBASE_PROJECT_ID');
    expect(readFileSync('src/lib/firebase.ts', 'utf8')).not.toContain('gen-lang-client-');
  });
  it('bundles a real Node server and starts in production mode', () => {
    const p = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(p.scripts.build).toContain('esbuild server.ts');
    expect(p.scripts.start).toBe('node scripts/start.mjs');
    expect(readFileSync('scripts/start.mjs', 'utf8')).toContain("NODE_ENV = 'production'");
  });
  it('never provides real keys in the environment template', () => {
    const values = readFileSync('.env.example', 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
    expect(values.length).toBeGreaterThan(10);
    expect(values.every(l => /^[A-Z0-9_]+=$/.test(l))).toBe(true);
  });
});

describe('scheduler retry safety', () => {
  function setup() {
    let clock = Date.parse('2026-10-25T16:00:00Z');
    const calls: string[][] = [];
    const scheduler = new NotificationScheduler(async (_c, _r, subject, body) => {
      calls.push([subject, body]); return { ok: false, error: 'test failure' };
    }, () => new Date(clock));
    scheduler.updateSettings({ ...DEFAULT_SETTINGS, enabled: true, consentGivenAt: '2026-10-25', channel: 'email', recipientEmail: 'qa@example.com', dailySummaryTimeKolkata: '00:00', expiryReminderEnabled: false, serviceReminderEnabled: false });
    scheduler.updateSnapshot({ businessName: 'Test', vehicles: [], logbookEntries: [], complianceItems: [], updatedAt: '2026-10-25' });
    return { scheduler, calls, advance: (ms: number) => { clock += ms; } };
  }
  it('keeps the full original message when retrying', async () => {
    const { scheduler, calls, advance } = setup();
    await scheduler.tick(); advance(61_000); await scheduler.tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });
  it('stops failed jobs after three attempts', async () => {
    const { scheduler, calls, advance } = setup();
    await scheduler.tick(); advance(61_000); await scheduler.tick(); advance(301_000); await scheduler.tick();
    advance(1_000_000); await scheduler.tick(); await scheduler.tick();
    expect(calls).toHaveLength(3);
    expect(scheduler.getDeliveryLog()[0].attempts).toBe(3);
  });
  it.each(['disable', 'revoke'])('does not retry after %s', async action => {
    const { scheduler, calls, advance } = setup();
    await scheduler.tick(); advance(61_000);
    scheduler.updateSettings(action === 'disable' ? { enabled: false } : { consentGivenAt: undefined });
    await scheduler.tick();
    expect(calls).toHaveLength(1);
  });
});
