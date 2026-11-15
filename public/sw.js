// One-time cleanup worker: removes every cached shell left by the old
// app-shell service worker, unregisters itself, and reloads open tabs so the
// app always comes fresh from the network. It caches nothing.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) { /* no cache API - nothing to clear */ }
      try { await self.registration.unregister(); } catch (e) { /* ignore */ }
      try {
        const clients = await self.clients.matchAll({type: 'window'});
        for (const client of clients) client.navigate(client.url);
      } catch (e) { /* ignore */ }
    })()
  );
});
// No fetch handler: every request goes straight to the network.
