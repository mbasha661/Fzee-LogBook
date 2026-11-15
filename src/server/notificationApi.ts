import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import nodemailer from 'nodemailer';

export const AUTH_PROJECT = 'fzeelogbook';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyIdentity(token: string) {
  const { payload } = await jwtVerify(token, keys, { issuer: `https://securetoken.google.com/${AUTH_PROJECT}`, audience: AUTH_PROJECT, algorithms: ['RS256'] });
  if (!payload.sub || typeof payload.email !== 'string') throw new Error('Invalid identity');
  return { uid: payload.sub, email: payload.email, verified: payload.email_verified === true };
}
export function emailConfigured() { return Boolean((process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD) || (process.env.BREVO_API_KEY && process.env.NOTIFICATION_FROM_EMAIL)); }
export async function sendEmail(to: string, subject: string, text: string) {
  if (process.env.BREVO_API_KEY && process.env.NOTIFICATION_FROM_EMAIL) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: 'FzeeLogBook', email: process.env.NOTIFICATION_FROM_EMAIL }, to: [{ email: to }], subject, textContent: text }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Email provider rejected the request. Check sender activation and quota.');
    return (await response.json()).messageId as string;
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) throw new Error('Email is not connected. The owner must configure a Gmail App Password or transactional email provider.');
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD.replace(/\s/g, '') }, connectionTimeout: 15000, socketTimeout: 20000 });
  const result = await transport.sendMail({ from: { name: 'FzeeLogBook', address: process.env.SMTP_USER }, to, subject, text });
  if (!result.accepted.length) throw new Error('Email provider did not accept the recipient.');
  return result.messageId;
}
export function decodeFields(fields: any): any { const out: any = {}; for (const [k,v] of Object.entries(fields || {}) as any) out[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? v.timestampValue ?? null; return out; }
export async function ownedRecords(token: string, uid: string, collection: string) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${AUTH_PROJECT}/databases/(default)/documents:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: 'ownerId' }, op: 'EQUAL', value: { stringValue: uid } } }, limit: 500 } }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Could not read your private fleet records. Please sign in again.');
  return (await response.json()).filter((x: any) => x.document).map((x: any) => decodeFields(x.document.fields));
}
export function buildNotificationText(vehicles: any[], documents: any[], now = new Date(), drivers: any[] = []) {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const lines = ['FzeeLogBook compliance and service check', `Date: ${today} (Asia/Kolkata)`, ''];
  const allDocuments = [...documents];
  for (const v of vehicles.filter(v => v.status !== 'Archived')) for (const [key,label] of [['insuranceExpiry','Insurance'],['fcExpiry','FC'],['permitExpiry','Permit'],['pollutionExpiry','Pollution']]) if (v[key]) allDocuments.push({ entityLabel:v.registrationNumber, documentType:label, expiryDate:v[key] });
  for (const d of drivers) if (d.licenseExpiry) allDocuments.push({ entityLabel:d.fullName, documentType:'Driver licence', expiryDate:d.licenseExpiry });
  for (const d of allDocuments) if (d.expiryDate) {
    const days = Math.ceil((Date.parse(d.expiryDate + 'T00:00:00+05:30') - Date.parse(today + 'T00:00:00+05:30')) / 86400000);
    if (days <= 30) lines.push(`${d.entityLabel || d.targetLabel || 'Document'}: ${d.documentType || d.documentCategory || 'Document'} expires ${d.expiryDate} (${days < 0 ? 'expired' : days + ' days remaining'}).`);
  }
  for (const v of vehicles) {
    const due = v.nextServiceDueDate || v.nextServiceDate;
    const km = Number(v.nextServiceDueKm || v.nextServiceOdometerKm || 0);
    if ((due && due <= today) || (km > 0 && Number(v.currentOdometerKm) >= km)) lines.push(`${v.registrationNumber}: service due. Current odometer ${v.currentOdometerKm || 0} km; next service ${due || 'date not set'}, ${km || 'km not set'}.`);
  }
  if (lines.length === 3) lines.push('No document expiry within 30 days or overdue service found in the records checked.');
  lines.push('', 'Requested from your signed-in FzeeLogBook account. This is an on-demand check, not an automatic scheduled alert.');
  return lines.join('\n');
}
export function createNotificationRouter(deps = { verifyIdentity, sendEmail, ownedRecords }) {
  const router = express.Router();
  router.use(async (req: any, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in to send notifications.' }); return; }
    try { req.identity = await deps.verifyIdentity(token); req.idToken = token; next(); }
    catch { res.status(401).json({ error: 'Your sign-in expired. Please sign in again.' }); }
  });
  router.get('/status', (_req, res) => res.json({ emailConfigured: emailConfigured(), whatsappConfigured: false, automaticScheduling: false, emailRecipientPolicy: 'signed-in account email only', whatsappReason: 'Meta Cloud API sender, access token, opt-in and approved utility templates are not configured. Automated reminders may be chargeable. No WhatsApp messages are sent.' }));
  router.post('/test-dispatch', async (req: any, res) => {
    const identity = req.identity;
    const channel = String(req.body.channel || 'email').toLowerCase();
    if (channel !== 'email') { res.status(503).json({ error: 'WhatsApp alerts are not connected yet. Meta Business Cloud API credentials, an opted-in recipient and an approved utility template are required. No message was sent.' }); return; }
    if (!identity.verified) { res.status(403).json({ error: 'Verify your account email before sending. Use Send account verification email below, open the link, then sign out and back in.' }); return; }
    if (req.body.recipientEmail && req.body.recipientEmail.toLowerCase() !== identity.email.toLowerCase()) { res.status(403).json({ error: 'For safety, email can only be sent to the signed-in account email.' }); return; }
    if (process.env.SMTP_USER && identity.email.toLowerCase() !== process.env.SMTP_USER.toLowerCase()) { res.status(403).json({ error: 'This personal Gmail sender is limited to its own account. Other accounts need a transactional sender before email can be enabled.' }); return; }
    if (!emailConfigured()) { res.status(503).json({ error: 'Email is not connected yet. The owner must save a Gmail App Password or configure a transactional email sender. Nothing was sent.' }); return; }
    try {
      // Firestore create is atomic and owner rules apply to the caller token. One dispatch per account per minute, across server instances.
      const minute = Math.floor(Date.now() / 60000);
      const id = `${identity.uid}_email_${minute}`;
      const now = new Date().toISOString();
      const log: any = { ownerId: identity.uid, alertType: 'StatutoryExpiry', severity: 'INFO', targetLabel: 'Account email', title: 'Email request reserved', message: 'Email request reserved. Acceptance is not yet confirmed. Do not assume delivery.', recipientEmail: identity.email, channel: 'EmailDigest', status: 'Unread', createdAt: now, updatedAt: now };
      const fields = (data: any) => Object.fromEntries(Object.entries(data).map(([k,v]) => [k,{ stringValue: String(v) }]));
      const root = `https://firestore.googleapis.com/v1/projects/${AUTH_PROJECT}/databases/(default)/documents/notification_logs`;
      const headers = { Authorization: `Bearer ${req.idToken}`, 'Content-Type': 'application/json' };
      const reserve = await fetch(`${root}?documentId=${encodeURIComponent(id)}`, { method: 'POST', headers, body: JSON.stringify({ fields: fields(log) }), signal: AbortSignal.timeout(15000) });
      if (reserve.status === 409) { res.status(429).json({ error: 'An email request was already made this minute. Wait before trying again and check your delivery history.' }); return; }
      if (!reserve.ok) throw new Error('Could not record the request securely. Nothing was sent.');
      let messageId = '';
      try {
        const [vehicles,documents,drivers] = await Promise.all([deps.ownedRecords(req.idToken,identity.uid,'vehicles'),deps.ownedRecords(req.idToken,identity.uid,'compliance_documents'),deps.ownedRecords(req.idToken,identity.uid,'drivers')]);
        const subject = req.body.testOnly ? 'FzeeLogBook test email' : 'FzeeLogBook compliance and service check';
        const text = req.body.testOnly ? 'This is the test email you requested from FzeeLogBook. Email sending is connected. No real expiry or service alert is included in this test.' : buildNotificationText(vehicles,documents,new Date(),drivers);
        messageId = await deps.sendEmail(identity.email, subject, text);
        log.title = 'Email accepted by provider'; log.message = `The provider accepted this email. Inbox delivery is not yet confirmed. Provider reference: ${messageId}`.slice(0,800); log.status = 'Dispatched';
      } catch (error: any) {
        log.title = 'Email request failed or unconfirmed'; log.message = String(error?.message || 'Provider error').slice(0,800);
        await fetch(`${root}/${encodeURIComponent(id)}`, { method: 'PATCH', headers, body: JSON.stringify({fields:fields(log)}), signal: AbortSignal.timeout(10000) });
        throw error;
      }
      const recorded = await fetch(`${root}/${encodeURIComponent(id)}`, { method: 'PATCH', headers, body: JSON.stringify({fields:fields(log)}), signal: AbortSignal.timeout(10000) });
      res.json({ ok: true, accepted: true, delivered: false, providerMessageId: messageId, recipientEmail: identity.email, message: 'Email accepted by the provider. Check your inbox and spam folder.', historyRecorded: recorded.ok });
    } catch (error: any) { res.status(502).json({ error: error?.code === 'EAUTH' ? 'Gmail rejected the App Password. Nothing was accepted. Check the saved App Password.' : error?.message || 'Email request failed. Check history before retrying.' }); }
  });
  router.use((_req, res) => res.status(503).json({ error: 'Automatic notifications are not connected. This deployment supports authenticated on-demand email only; no scheduled alerts run while the app is closed.' }));
  return router;
}
