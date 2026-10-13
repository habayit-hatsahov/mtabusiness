// ── §486 — מדידת שימוש: מכשיר חדש, ביקור חוזר, וכמה זמן נשארו ───────────────────────────
// רמי (11.10, §484 סעיף 3): "למדוד שימוש חוזר, כמה זמן היה באתר, וכל דבר שנחוץ לנו לדעת".
// עד היום היה רק pageView — אירוע לכל טעינת-דף, בלי מושג של "אותו מכשיר חזר" או "כמה זמן".
//
// שני סוגי אירועים (שניהם ב-firestore.rules, רשימת-ההיתר של type):
//   visit   — פעם אחת לכל ביקור. channel = "<surface>:<os>:<first|return>"
//             first = המכשיר הזה לא נראה מעולם. **באפליקציה זה הקירוב שלנו ל"התקנה":**
//             מכשיר שהוריד *וגם פתח*. (מחיקה והתקנה מחדש / ניקוי נתונים נספרים כ-first שוב.)
//   engaged — אבני-דרך של זמן גלוי בתוך הביקור: 30s · 2m · 5m · 15m · 30m. channel = "<surface>:<אבן>"
//             ⚠️ אבני-דרך ולא "משך" ביציאה: כתיבה בזמן סגירת-דף אינה אמינה, ובדיוק אצל מי שיוצא
//             מהר היא נכשלת (אותו נימוק כמו formStep, §304). כאן כל אבן נכתבת כשהיא נחצית.
//
// blockId = מזהה המכשיר (d_ + 12 תווים, localStorage) — זה מה שמאפשר לספור ימים פעילים, חזרות
// ושימור לכל מכשיר. memberId = hb_memberId כשמחוברים. sessionId = אותו hb_session_id של pageView,
// כך שאפשר להצליב עם שאר האירועים.
//
// "ביקור": טעינה ראשונה בסשן הדפדפן/האפליקציה, **או חזרה אחרי 30 דק' ברקע** — אפליקציה שחוזרים
// אליה מהרקע לא נטענת מחדש, ובלי זה כל השימוש של יום שלם היה ביקור אחד.
// הזמן נצבר ב-sessionStorage, ולכן מעבר בין דפים באותו ביקור (welcome → home) ממשיך את אותו שעון.
//
// תלוי ב-signup-source.js (os/surface) — חייב להיטען לפניו. בלעדיו: לא מודד כלום (לא נכשל).
// כותב ב-REST ולא דרך logEvent של הדף: כך אותו קובץ עובד בכל דף בלי תלות בסדר הטעינה של
// המודולים (ר' §431 "החלון המת"). createdAt = REQUEST_TIME בשרת — מה שהחוקים דורשים.
(function () {
  'use strict';

  if (!/^(www\.)?yellowzone\.co\.il$/.test(location.hostname)) return;   // מודדים רק מהדומיין החי
  const src = window.hbSignupSource;
  if (!src) return;

  const DEV_KEY = 'yz_dev';
  const VISIT_KEY = 'yz_visit';            // { id, ms, hiddenAt, done: [...] }
  const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;
  const MILESTONES = [[30e3, '30s'], [120e3, '2m'], [300e3, '5m'], [900e3, '15m'], [1800e3, '30m']];

  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };
  const rid = (n) => { let s = ''; for (let i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; };

  const os = src.os();
  const surface = src.surface();

  let firstEver = false;
  let dev = ls(DEV_KEY);
  if (!dev || !/^d_[a-z0-9]{12}$/.test(dev)) { dev = 'd_' + rid(12); firstEver = true; ls(DEV_KEY, dev); }
  // localStorage חסום (גלישה פרטית ישנה): אין זהות מכשיר יציבה — לא מודדים בכלל, כדי לא לספור
  // כל טעינה כ"מכשיר חדש".
  if (ls(DEV_KEY) !== dev) return;

  function sessionId() {
    let id = ss('hb_session_id');
    if (!id) { id = 'hb_' + Date.now().toString(36) + '_' + rid(8); ss('hb_session_id', id); }
    return id;
  }

  function send(type, channel) {
    try {
      const base = 'projects/habayit-hatsahov/databases/(default)/documents';
      const str = (v) => (v == null || v === '' ? { nullValue: null } : { stringValue: String(v) });
      let id = ''; const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 20; i++) id += A[Math.floor(Math.random() * 62)];
      const body = { writes: [{
        update: { name: base + '/events/' + id, fields: {
          type: str(type),
          sessionId: str(sessionId()),
          memberId: str((ls('hb_memberId') || '').slice(0, 100)),
          path: str(location.pathname.slice(0, 200)),
          device: str(os === 'desktop' ? 'desktop' : 'mobile'),
          blockId: str(dev),
          channel: str(String(channel).slice(0, 50)),
        } },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      }] };
      // §519 — דרך הוורקר (event-send.js); REST הישיר רק כנפילה (נחסם כשנאכוף App Check)
      const rest = () => fetch('https://firestore.googleapis.com/v1/' + base + ':commit?key=AIzaSyBfG7AU4BzSAbBpwPyKfA_NzUpy2pxzFu8', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).catch(() => {});
      if (window.yzSendEvent) window.yzSendEvent(body, rest); else rest();
    } catch (e) {}
  }

  function readVisit() { try { return JSON.parse(ss(VISIT_KEY) || 'null'); } catch (e) { return null; } }
  function saveVisit(v) { ss(VISIT_KEY, JSON.stringify(v)); }

  function startVisit() {
    const v = { id: rid(8), ms: 0, hiddenAt: 0, done: [] };
    saveVisit(v);
    send('visit', surface + ':' + os + ':' + (firstEver ? 'first' : 'return'));
    firstEver = false;
    return v;
  }

  let visit = readVisit();
  // ביקור קיים בסשן, אבל הדף נסגר/הוסתר ונפתח שוב אחרי 30 דק' — זה ביקור חדש.
  if (!visit || (visit.hiddenAt && Date.now() - visit.hiddenAt > NEW_VISIT_AFTER_MS)) visit = startVisit();
  // ממשיכים ביקור (מעבר דף רגיל — הדף הקודם סימן hiddenAt ביציאה). חובה לנקות: אם המעבר הבא
  // יורה רק pagehide בלי visibilitychange, hiddenAt מהמעבר הקודם נשאר, ואחרי 30 דק' של שימוש
  // רציף הדף הבא היה פותח "ביקור חדש" בטעות. (נתפס בבדיקה 6 רק אחרי ששברנו את השורה הזאת.)
  else { visit.hiddenAt = 0; saveVisit(visit); }

  let lastTick = document.visibilityState === 'visible' ? Date.now() : 0;

  function tick() {
    if (!lastTick) return;
    const now = Date.now();
    visit.ms += Math.min(now - lastTick, 60e3);   // דילוג גדול (מכשיר נרדם) לא נספר כשימוש
    lastTick = now;
    for (const [ms, label] of MILESTONES) {
      if (visit.ms >= ms && visit.done.indexOf(label) < 0) {
        visit.done.push(label);
        send('engaged', surface + ':' + label);
      }
    }
    saveVisit(visit);
  }

  setInterval(tick, 5000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      tick();
      lastTick = 0;
      visit.hiddenAt = Date.now();
      saveVisit(visit);
    } else {
      if (visit.hiddenAt && Date.now() - visit.hiddenAt > NEW_VISIT_AFTER_MS) visit = startVisit();
      visit.hiddenAt = 0;
      saveVisit(visit);
      lastTick = Date.now();
    }
  });
  // pagehide — מעבר לדף אחר באותו ביקור: שומרים את הזמן שנצבר עד כאן.
  window.addEventListener('pagehide', () => { tick(); });

  window.hbUsageTrack = { device: dev };
})();
