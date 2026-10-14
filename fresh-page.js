// ── §514 — דף שנטען ממטמון ה-HTTP וכבר יש גרסה חדשה → מרעננים את המטמון ─────────────────────────
// GitHub Pages מגיש HTML עם `Cache-Control: max-age=600`: עד 10 דק' אחרי פריסה הדפדפן מגיש את הדף
// השמור בלי לשאול את השרת (§512: "סגרתי ופתחתי ועדיין מופיע"). §513 פתר את זה ב-sw.js, אבל
// **באפליקציית האייפון אין Service Worker** (אין WKAppBoundDomains, בכוונה) — שם הקובץ הזה הוא התיקון.
//
// איך: רק כשהדף **לא** הגיע מהרשת (אין SW שמטפל, ו-transferSize אינו >0) — שאלת HEAD קטנה עם
// no-cache. אם Last-Modified בשרת חדש מזה של הדף שמוצג (document.lastModified) → GET עם
// cache:'reload' לדף הזה ולדפים הראשיים, שמחליף את העותקים במטמון. **הדף הנוכחי לא נטען מחדש** —
// הגרסה החדשה מופיעה במעבר הדף הבא (בפתיחת האפליקציה יש ממילא 2–3: index → welcome → home).
//
// ══ §532 — 🔴 למה בלי location.reload() ════════════════════════════════════════════════════════
// עד §532 כאן היה reload. בבדיקה החיה הראשונה באייפון (14.10) הוא הוביל ל"אין חיבור לאינטרנט":
// ב-Capacitor ל-iOS (`WebViewDelegationHandler.swift`) **כל** ניווט שנכשל — כולל ניווט שבוטל כי
// ניווט אחר התחיל (NSURLErrorCancelled) — טוען את `errorPath`. בפתיחת האפליקציה הדפים עוברים לבד
// (index → welcome → home), וה-reload שלנו נפל באמצע מעבר כזה. כל ניווט נוסף מהקובץ הזה הוא אותו סיכון.
//
// ⚠️ ב-GitHub Pages ‏Last-Modified הוא זמן ה**פריסה**, לא של הקובץ: כל פריסה "מחדשת" את כל הדפים.
// ⚠️ בלם: לכל גרסה ריענון אחד לכל היותר בלשונית (sessionStorage) — בלי sessionStorage לא מרעננים.
// ⚠️ סקריפט קלאסי, ראשון ב-<head>, בלי תלויות — כשל כאן לא נוגע בשום דבר אחר (try סביב הכול).
(function () {
  'use strict';
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) return;   // §513 — ה-SW כבר שואל את השרת
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (nav && nav.transferSize > 0) return;                                     // הגיע מהרשת — טרי
    var mine = Date.parse(document.lastModified);
    if (!mine) return;
    var url = location.href.split('#')[0];
    var KEY = 'yz_fresh_refresh';
    // הדפים שעוברים דרכם בפתיחת האפליקציה ובשימוש הרגיל. הדף הנוכחי – גם אם אינו ברשימה.
    var PAGES = ['/', '/index.html', '/welcome.html', '/home.html', '/profile.html'];
    fetch(url, { method: 'HEAD', cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      var lm = Date.parse(r.headers.get('Last-Modified') || '');
      if (!r.ok || !lm || lm <= mine + 1000) return;   // document.lastModified מדויק לשנייה
      try {
        if (sessionStorage.getItem(KEY) === String(lm)) return;
        sessionStorage.setItem(KEY, String(lm));
      } catch (e) { return; }
      var list = [url];
      PAGES.forEach(function (p) { var u = location.origin + p; if (list.indexOf(u) === -1) list.push(u); });
      // GET שמחליף את העותק במטמון — מעבר הדף הבא יקבל את הגרסה החדשה. בלי ניווט (ר' §532 למעלה).
      list.forEach(function (u) {
        fetch(u, { cache: 'reload', credentials: 'same-origin' }).catch(function () {});
      });
    }).catch(function () {});
  } catch (e) {}
})();
