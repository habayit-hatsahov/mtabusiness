// ── §485 — מקור ההרשמה: מאיזה מכשיר, מאיזה משטח, ובאיזו שיטה ─────────────────────────
// רמי (11.10): "חשוב לי לדעת כל משתמש מאיפה נרשם". עד היום לא נשמר בשום מקום אם ההרשמה
// הגיעה מאייפון או מאנדרואיד — ב-events יש רק mobile/desktop ו-app/pwa/web, וב-members כלום.
// וזה נתון שאי-אפשר לשחזר אחר כך: מה שלא נשמר ברגע ההרשמה אבד.
//
// שלושה שדות נכתבים לרשומה עצמה (members, ובטופס העסק גם businesses):
//   signupOs      — 'ios' | 'android' | 'desktop'
//   signupSurface — 'app' | 'pwa' | 'web'
//   signupMethod  — 'apple' | 'google' | 'manual'  (מי מילא את השם/מייל — לא מי חובר אחר כך)
//
// <script src> רגיל שנחשף על window, באותו דפוס של app-banner.js / social-links.js.
// ⚠️ זיהוי המכשיר זהה ל-app-banner.js ול-download.html — שינוי באחד מחייב את כולם.
// ⚠️ השדות חייבים להופיע גם ב-SUBMIT_MEMBER_STRING_FIELDS בוורקר (§462), אחרת נתיב הגיבוי
//    דוחה את כל ההרשמה ב-bad_field.
(function () {
  'use strict';

  const METHOD_KEY = 'yz_signup_method';

  function os() {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    // iPad מודרני מדווח על עצמו כ-Macintosh; מסך-מגע הוא מה שמבדיל אותו ממק אמיתי.
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
    return 'desktop';
  }

  function surface() {
    try {
      const ng = window.YZNativeGoogle;
      if (ng && typeof ng.surface === 'function') return ng.surface();
    } catch (e) {}
    // נפילה-לאחור אם native-google.js לא נטען — אותו סדר בדיקה כמו שם (app לפני pwa).
    if (window.Capacitor || /YellowZoneApp/i.test(navigator.userAgent || '')) return 'app';
    try {
      if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true) return 'pwa';
    } catch (e) {}
    return 'web';
  }

  // נקרא מ-onFilled של כפתורי Apple/Google. sessionStorage ולא משתנה: באייפון בדפדפן אפל
  // מנווטת החוצה וחוזרת לדף (§468) — משתנה בזיכרון היה נמחק בדרך.
  function markMethod(m) {
    try { sessionStorage.setItem(METHOD_KEY, m); } catch (e) {}
  }

  function method() {
    try {
      const m = sessionStorage.getItem(METHOD_KEY);
      if (m === 'apple' || m === 'google') return m;
    } catch (e) {}
    return 'manual';
  }

  function fields() {
    return { signupOs: os(), signupSurface: surface(), signupMethod: method() };
  }

  window.hbSignupSource = { os: os, surface: surface, markMethod: markMethod, method: method, fields: fields };
})();
