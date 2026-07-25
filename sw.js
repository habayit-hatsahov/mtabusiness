const CACHE_NAME = 'yz-shell-v13';
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
//
// ניווט בין דפים (HTML, למשל home.html) — רשת קודם, עם timeout קצר (1.5s), גיבוי ל-cache:
// כך המשתמש כמעט תמיד מקבל את הגרסה העדכנית ביותר בפועל, בלי תלות ב-CACHE_NAME/עדכון
// Service Worker בכלל — לא ניתן יותר "להיתקע" על HTML ישן כי מישהו שכח להעלות מספר גרסה,
// ולא תלוי בכמה שקדנית מערכת ההפעלה בבדיקת עדכונים (ר' PROJECT_CONTEXT.md — אייפון עם
// PWA מותקן כמעט לא בודק עדכוני Service Worker מיוזמתו, אנדרואיד/כרום בודק כמעט בכל טעינה).
// רק אם הרשת לא עונה תוך 1.5s (offline אמיתי/חיבור גרוע מאוד) — נופלים ל-cache כגיבוי.
//
// שאר הקבצים (JS/CSS/תמונות סטטיות) — stale-while-revalidate כרגיל: מגישים מיד מה-cache
// (מהירות מקסימלית, אלה כמעט אף פעם לא משתנים בין ביקורים), ומרעננים ברקע לפעם הבאה.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(req);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1500);
          const res = await fetch(req, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return cached || fetch(req); // בלי cache בכלל (ביקור ראשון אי-פעם, offline) — עדיין ננסה רשת
        }
      })
    );
    return;
  }

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

// ── Web Push — התראה שהוורקר שלח (worker/src/push.js) ──
// 🧪 (2026-07-26): worker/src/push.js שולח פורמט "Declarative Web Push" של אפל
// ({web_push:8030, notification:{...}}) — דפדפנים שתומכים בזה (Safari/iOS חדש) אמורים
// להציג את ההתראה ברמת המערכת, בלי לקרוא ל-event הזה בכלל. זה כאן כ-fallback imperative
// לדפדפנים שלא תומכים בזה (או אם התמיכה חלקית) — יודע לפרק גם את הצורה המקוננת החדשה.
self.addEventListener('push', event => {
  const work = Promise.resolve(event.data ? event.data.text() : '')
    .then(raw => {
      const parsed = JSON.parse(raw);
      const n = parsed.notification || parsed; // תומך גם בפורמט השטוח הישן {title,body,url}
      return self.registration.showNotification(n.title || 'Yellow Zone', {
        body: n.body || '',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        dir: n.dir || 'rtl',
        lang: n.lang || 'he',
        data: { url: n.navigate || n.url || 'home.html' },
      });
    })
    .catch(e => self.registration.showNotification('Yellow Zone', { body: 'שגיאת פענוח: ' + e.message }));
  event.waitUntil(work);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || 'home.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsList => {
      const existing = clientsList.find(c => c.url.includes(new URL(url, self.location.href).pathname));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
