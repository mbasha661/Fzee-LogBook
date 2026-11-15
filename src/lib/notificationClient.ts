import { auth } from './firebase';
export async function notificationRequest(path: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to use notifications. Demo mode cannot send messages.');
  const token = await user.getIdToken();
  const response = await fetch('/api/notifications' + path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const data = await response.json().catch(() => ({} as any));
  if (!response.ok) throw new Error(data.error || (response.status === 404 ? 'The notification service was not found on this server. Hard refresh the page (Ctrl+Shift+R) and try again.' : `Notification request failed (${response.status}). Nothing was sent.`));
  return data;
}
