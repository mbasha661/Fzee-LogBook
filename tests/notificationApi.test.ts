// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createNotificationRouter, buildNotificationText } from '../src/server/notificationApi';
import { createServer } from 'node:http';
const realFetch = globalThis.fetch;
afterEach(()=>{vi.unstubAllGlobals(); delete process.env.SMTP_USER; delete process.env.SMTP_APP_PASSWORD;});
async function request(deps:any, path:string, body?:any, token = 'valid') {
  const app=express(); app.use(express.json());app.use('/api/notifications',createNotificationRouter(deps));
  const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try { const port=(server.address() as any).port;const r=await realFetch(`http://127.0.0.1:${port}/api/notifications${path}`,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}; }
  finally {server.close();}
}
function deps(verified=true) {return {verifyIdentity:vi.fn().mockResolvedValue({uid:'owner-A',email:'a@example.com',verified}),sendEmail:vi.fn().mockResolvedValue('provider-123'),ownedRecords:vi.fn().mockResolvedValue([])};}
describe('authenticated per-account notification API',()=>{
 it('rejects unauthenticated status and dispatch',async()=>{const d=deps();expect((await request(d,'/status',undefined,'')).status).toBe(401);expect((await request(d,'/test-dispatch',{channel:'email'},'')).status).toBe(401);expect(d.sendEmail).not.toHaveBeenCalled();});
 it('rejects invalid identities',async()=>{const d=deps();d.verifyIdentity.mockRejectedValue(new Error('invalid'));expect((await request(d,'/status')).status).toBe(401);});
 it('requires verified email',async()=>{const d=deps(false);expect((await request(d,'/test-dispatch',{channel:'email'})).status).toBe(403);expect(d.sendEmail).not.toHaveBeenCalled();});
 it('blocks other recipients and never uses client fleet payloads',async()=>{const d=deps();expect((await request(d,'/test-dispatch',{channel:'email',recipientEmail:'victim@example.com',vehicles:[{ownerId:'B'}]})).status).toBe(403);expect(d.sendEmail).not.toHaveBeenCalled();});
 it('is honest when provider is not configured',async()=>{const d=deps();const r=await request(d,'/test-dispatch',{channel:'Email',recipientEmail:'a@example.com'});expect(r.status).toBe(503);expect(r.data.error).toContain('Nothing was sent');});
 it('never sends WhatsApp or both as a partial success',async()=>{const d=deps();for(const channel of ['WhatsApp','Both'])expect((await request(d,'/test-dispatch',{channel})).status).toBe(503);expect(d.sendEmail).not.toHaveBeenCalled();});
 it('reports automatic scheduling disabled',async()=>{const r=await request(deps(),'/status');expect(r.data.automaticScheduling).toBe(false);expect((await request(deps(),'/scheduler/tick-now',{})).status).toBe(503);});
 it('atomically reserves, reads caller-owned records and records acceptance',async()=>{process.env.SMTP_USER='a@example.com';process.env.SMTP_APP_PASSWORD='fixture';const d=deps();const f=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',f);const r=await request(d,'/test-dispatch',{channel:'Email',recipientEmail:'a@example.com',testOnly:true});expect(r.status).toBe(200);expect(r.data.accepted).toBe(true);expect(r.data.delivered).toBe(false);expect(d.ownedRecords).toHaveBeenCalledWith('valid','owner-A','vehicles');expect(d.sendEmail).toHaveBeenCalledWith('a@example.com','FzeeLogBook test email',expect.stringContaining('No real expiry'));expect(f).toHaveBeenCalledTimes(2);});
 it('does not send if reservation was already taken',async()=>{process.env.SMTP_USER='a@example.com';process.env.SMTP_APP_PASSWORD='fixture';const d=deps();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:409})));expect((await request(d,'/test-dispatch',{channel:'email'})).status).toBe(429);expect(d.sendEmail).not.toHaveBeenCalled();});
 it('does not send if secure log reservation fails',async()=>{process.env.SMTP_USER='a@example.com';process.env.SMTP_APP_PASSWORD='fixture';const d=deps();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));expect((await request(d,'/test-dispatch',{channel:'email'})).status).toBe(502);expect(d.sendEmail).not.toHaveBeenCalled();});
 it('records provider failure without claiming acceptance',async()=>{process.env.SMTP_USER='a@example.com';process.env.SMTP_APP_PASSWORD='fixture';const d=deps();d.sendEmail.mockRejectedValue(new Error('Provider failed'));const f=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',f);expect((await request(d,'/test-dispatch',{channel:'email'})).status).toBe(502);expect(f).toHaveBeenCalledTimes(2);});
 it('builds expiry and service text from supplied owned records only',()=>{const text=buildNotificationText([{registrationNumber:'QA-001',currentOdometerKm:100,nextServiceDueKm:90}],[{entityLabel:'QA-001',documentCategory:'Insurance',expiryDate:'2026-10-30'}],new Date('2026-10-26T12:00:00Z'));expect(text).toContain('4 days remaining');expect(text).toContain('service due');expect(text).not.toContain('Karthik');});
});

import { readFileSync } from 'node:fs';
describe('notification buttons use the authenticated client', () => {
  it.each(['src/components/LogbookView.tsx', 'src/components/DashboardView.tsx'])('%s has no raw fetch to /api/notifications', (f) => {
    expect(readFileSync(f, 'utf8')).not.toMatch(/fetch\(\s*['"`]\/api\/notifications/);
  });
});
