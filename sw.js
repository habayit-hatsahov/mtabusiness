// §290 — v22. גרסת המטמון לא עלתה מאז §283, בזמן ש-§284–§290 שינו את fan-register.html
// שינוי אחר שינוי. הניווטים כאן הם network-first עם timeout של 1.5 שניות (ר' fetch למטה),
// ובמובייל סלולרי זה נופל למטמון בקלות — כלומר מכשיר יכול היה להמשיך להריץ HTML ישן
// לאורך כל סבבי התיקון, ולהיכשל מסיבה שכבר תוקנה. שינוי השם מפנה את המטמון הישן.
const CACHE_NAME = 'yz-shell-v29';
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
          // הבקשה-עם-timeout לא הספיקה תוך 1.5s (בדיוק החיבור-האיטי שהיה אמור ליהנות הכי הרבה
          // מהתיקון האחרון) — באג-אמת שנתפס בפועל (2026-08-10): הניסיון-החוזר הזה מעולם לא נשמר
          // ב-cache, אז ביקור-איטי חוזר ממשיך לקבל תוכן ישן שוב ושוב, בלי שהמטמון מתעדכן.
          // עכשיו: הניסיון-החוזר (בלי timeout) תמיד ממשיך ברקע וכותב ל-cache כשהוא מסתיים —
          // בין אם הוגש עכשיו (אין cache בכלל) ובין אם הוגש cache-ישן והרשת עדיין ממשיכה ברקע.
          const retry = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
          if (cached) { retry.catch(() => {}); return cached; }
          return (await retry) || cached;
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

// ── Web Push — התראה שהוורקר שלח (worker/src/push.js), payload = {title, body, url} ──
// ⚠️ ידוע (2026-07-26): עברית מוצגת כ-"?" ב-iOS 26.5.2 — נבדק לעומק ונשלל שזו בעיה כאן
// (ר' ההערה ב-worker/src/push.js + docs/PROJECT_CONTEXT.md). לא לחזור לחקור בלי מידע חדש.
self.addEventListener('push', event => {
  const work = Promise.resolve(event.data ? event.data.text() : '')
    .then(raw => JSON.parse(raw))
    .catch(() => ({}))
    .then(data => self.registration.showNotification(data.title || 'Yellow Zone', {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      data: { url: data.url || 'home.html' },
    }));
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
