// ══ §519 — App Check (reCAPTCHA Enterprise, בלתי נראה) ═══════════════════════════════════════
// כל בקשה ל-Firestore/Storage נושאת "תעודה" שהיא הגיעה מהאתר/האפליקציה האמיתיים. סקריפט שמציף
// טפסים/אירועים/הרשמות ישירות מול ה-API – בלי תעודה – ייחסם **כשנפעיל אכיפה** (קונסול Firebase).
// ⚠️ **שלב 2 (מדידה): האכיפה כבויה.** שום דבר לא נחסם; אנחנו רק מודדים כמה בקשות מגיעות עם תעודה,
//    במיוחד מתוך האפליקציות (WebView – המקום היחיד שלא ידוע אם reCAPTCHA עובד בו טוב).
// ⚠️ חובה לקרוא ל-attachAppCheck(app) **מיד אחרי initializeApp ולפני כל שירות אחר** – לכל מופע
//    Firebase: firebase-config.js (default), welcome.html (default משלו), business-dashboard.html
//    ('bizDashboard'), profile.html ('bizProfile').
// ⚠️ אותה גרסת SDK בדיוק (12.14.0) כמו שאר הקבצים – גרסה אחרת היא SDK נפרד שלא מכיר את ה-app.
// localhost/דומיין אחר: לא מופעל (המפתח רשום לדומיינים החיים בלבד; בזמן אכיפה – debug token).
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app-check.js';

export const APP_CHECK_SITE_KEY = '6LeziO0tAAAAAD39qfYvYqeC3EHG68tkvqxIy5i9';
const LIVE_HOST = /^(www\.)?yellowzone\.co\.il$|^habayit-hatsahov\.(web\.app|firebaseapp\.com)$/;

// התג של reCAPTCHA מוסתר; הגילוי הנאות ("האתר מוגן ב-reCAPTCHA…") – במדיניות הפרטיות (תנאי של Google).
function hideBadge() {
  try {
    if (document.getElementById('yzRecaptchaCss')) return;
    const s = document.createElement('style');
    s.id = 'yzRecaptchaCss';
    s.textContent = '.grecaptcha-badge{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
}

export function attachAppCheck(app, { measure = false } = {}) {
  if (typeof location === 'undefined' || !LIVE_HOST.test(location.hostname)) return null;
  let ac = null;
  try {
    hideBadge();
    ac = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  } catch (e) {
    console.warn('App Check init failed:', e && (e.code || e.message));
    return null;
  }
  if (measure) measureOnce(ac);
  return ac;
}

// ── שלב 2: מדידה – פעם אחת לכל לשונית. האם התקבלה תעודה, תוך כמה זמן, ומאיזה משטח. ─────────────
// נשלח לוורקר (/event), לא ל-Firestore – כך המדידה עצמה לא תלויה ב-App Check.
function measureOnce(ac) {
  try {
    if (sessionStorage.getItem('yz_ac_measured')) return;
    sessionStorage.setItem('yz_ac_measured', '1');
  } catch (e) { return; }
  const t0 = Date.now();
  const bucket = (ms) => ms < 500 ? '<0.5s' : ms < 1500 ? '<1.5s' : ms < 4000 ? '<4s' : '4s+';
  const send = (result) => {
    try {
      const ua = navigator.userAgent || '';
      const inApp = !!window.Capacitor || /YellowZoneApp/i.test(ua);
      const os = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';
      const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
      const surface = inApp ? 'app' : (standalone ? 'pwa' : 'web');
      let sid = '';
      try { sid = sessionStorage.getItem('hb_session_id') || ''; } catch (e) {}
      fetch('https://api.yellowzone.co.il/event', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'appCheck', sessionId: sid || ('ac_' + t0.toString(36)), device: os === 'desktop' ? 'desktop' : 'mobile',
          channel: (surface + ':' + os + ':' + result).slice(0, 50), path: location.pathname.slice(0, 200),
        }),
      }).catch(() => {});
    } catch (e) {}
  };
  // תקרה: אם אין תשובה תוך 15 שנ' – נרשם כ"timeout" (זה בדיוק מה שהיה נחסם באכיפה)
  let done = false;
  const timer = setTimeout(() => { if (!done) { done = true; send('timeout'); } }, 15000);
  getToken(ac, false).then(
    (r) => { if (done) return; done = true; clearTimeout(timer); send((r && r.token ? 'ok:' : 'empty:') + bucket(Date.now() - t0)); },
    (e) => { if (done) return; done = true; clearTimeout(timer); send('err:' + String((e && (e.code || e.name)) || 'x').replace(/^appCheck\//, '').slice(0, 24)); },
  );
}
