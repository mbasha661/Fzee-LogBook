import React, { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { sendEmailVerification } from 'firebase/auth';
import { notificationRequest } from '../lib/notificationClient';
export const NotificationSchedulerPanel: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { notificationRequest('/status').then(setStatus).catch(e => setError(e.message)); }, []);
  return <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
    <h3 className="font-bold text-slate-900">Notification connections</h3>
    <p className="text-sm text-slate-600">Email: {status ? status.emailConfigured ? 'Sender connected. Use the test button to request a real email.' : 'Not connected. The app owner must configure a Gmail App Password or transactional provider.' : 'Checking connection...'}</p>
    <p className="text-sm text-slate-600">Emails go only to your verified signed-in account address. A personal Gmail sender is limited to its own account; other users need a transactional sender. Test emails contain no fleet records. The compliance check reads only your private records. Provider acceptance does not confirm inbox delivery.</p>
    <p className="text-sm text-slate-600">WhatsApp: not connected. Requires Meta Business Cloud API credentials, an approved utility template and recipient opt-in. Automated alerts may have a per-message cost.</p>
    <p className="text-sm text-amber-600">Automatic expiry, service and daily-summary schedules are not running. No alerts will be sent while the app is closed. Use the on-demand compliance check for now.</p>
    {auth.currentUser && !auth.currentUser.emailVerified && <button className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm" onClick={async()=>{try { await sendEmailVerification(auth.currentUser!); setError('Verification email requested. Open its link, then sign out and back in before testing.'); }catch(e:any){setError(e.message)}}}>Send account verification email</button>}
    {error && <p role="status" className="text-sm text-rose-600">{error}</p>}
  </section>;
};
