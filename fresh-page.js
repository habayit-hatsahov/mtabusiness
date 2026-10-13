// ── §514 — דף שנטען ממטמון ה-HTTP וכבר יש גרסה חדשה → טעינה מחדש אחת ─────────────────────────
// GitHub Pages מגיש HTML עם `Cache-Control: max-age=600`: עד 10 דק' אחרי פריסה הדפדפן מגיש את הדף
// השמור בלי לשאול את השרת (§512: "סגרתי ופתחתי ועדיין מופיע"). §513 פתר את זה ב-sw.js, אבל
// **באפליקציית האייפון אין Service Worker** (אין WKAppBoundDomains, בכוונה) — שם הקובץ הזה הוא התיקון.
//
// איך: רק כשהדף **לא** הגיע מהרשת (אין SW שמטפל, ו-transferSize אינו >0) — שאלת HEAD קטנה עם
// no-cache. אם Last-Modified בשרת חדש מזה של הדף שמוצג (document.lastModified) → מרעננים את
// עותק-המטמון ב-GET, ואז location.reload() — הבהוב אחד.
// ⚠️ ב-GitHub Pages ‏Last-Modified הוא זמן ה**פריסה**, לא של הקובץ: כל פריסה מרעננת דף שנטען
//    מהמטמון, גם אם הוא עצמו לא השתנה. נדיר (פריסה + חזרה לאותו דף תוך 10 דק'), והמחיר הבהוב.
// ⚠️ בלם-לולאה: לכל (כתובת, גרסה) טעינה מחדש אחת לכל היותר בלשונית (sessionStorage). בלי
//    sessionStorage — לא מרעננים בכלל: עדיף דף ישן מלולאת טעינות.
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
    var KEY = 'yz_fresh_reload';
    fetch(url, { method: 'HEAD', cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      var lm = Date.parse(r.headers.get('Last-Modified') || '');
      if (!r.ok || !lm || lm <= mine + 1000) return;   // document.lastModified מדויק לשנייה
      try {
        if (sessionStorage.getItem(KEY) === url + '|' + lm) return;
        sessionStorage.setItem(KEY, url + '|' + lm);
      } catch (e) { return; }
      // GET שמחליף את העותק במטמון — כך גם reload שמכבד מטמון יקבל את הגרסה החדשה
      return fetch(url, { cache: 'reload', credentials: 'same-origin' }).then(function (g) {
        if (g.ok) location.reload();
      });
    }).catch(function () {});
  } catch (e) {}
})();
