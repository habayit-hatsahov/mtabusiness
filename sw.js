const CACHE_NAME = 'yz-shell-v7';
const PRECACHE_URLS = ['home.html', 'manifest.json', 'firebase-config.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(PRECACHE_URLS.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// רק same-origin GET — לא נוגעים בקריאות Firebase/Firestore/Brevo וכו' (אלה תמיד ישירות מהרשת, נתונים חיים).
// stale-while-revalidate: מגישים מיד את מה שיש ב-cache (עלייה מיידית של המעטפת, בלי להמתין לרשת),
// ובמקביל מרעננים ברקע לפעם הבאה. כך פתיחת האפליקציה לא נתקעת על מסך ריק בזמן שה-HTML/JS יורדים מהרשת.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
