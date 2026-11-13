const CACHE = 'fzeelogbook-shell-v1';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fzeelogbook-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// App shell + built static assets only. Never cache API calls, auth, Firestore,
// Drive backup traffic, non-GET or third-party requests.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  const isAsset = ASSETS.includes(u.pathname) || u.pathname.startsWith('/assets/');
  if (!isAsset || u.search) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((r) => {
        if (r.ok) { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(e.request, c)); }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
