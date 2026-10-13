// ══ §519 — אירוע מדידה דרך הוורקר (/event), עם נפילה ל-REST הישיר ═══════════════════════════════
// לדפים הקלים שכותבים אירועים בלי ה-SDK (download.html, landing.html, usage-track.js). כשנאכוף App Check
// על Firestore, REST ישיר בלי תעודה ייחסם – הוורקר כותב עם מפתח השירות ולא תלוי בזה.
// window.yzSendEvent(restBody, restFallback):
//   restBody – אותו גוף :commit שהדף בנה עד היום (writes[0].update.fields בפורמט Firestore);
//   restFallback – פונקציה שמריצה את ה-fetch הישן. רצה רק אם הוורקר נכשל (עד האכיפה – עובד).
// מחזיר הבטחה שתמיד מתממשת (מדידה לעולם לא מפילה דף). סקריפט קלאסי, ES5 – גם ל-download.html.
(function () {
  'use strict';
  window.yzSendEvent = function (restBody, restFallback) {
    var ev = {};
    try {
      var f = restBody.writes[0].update.fields;
      for (var k in f) {
        if (Object.prototype.hasOwnProperty.call(f, k) && f[k] && typeof f[k].stringValue === 'string') ev[k] = f[k].stringValue;
      }
    } catch (e) { return Promise.resolve(); }
    var fallback = function () { try { return Promise.resolve(restFallback && restFallback()).catch(function () {}); } catch (e) { return Promise.resolve(); } };
    try {
      return fetch('https://api.yellowzone.co.il/event', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev),
      }).then(function (r) { if (!r.ok) return fallback(); }, fallback);
    } catch (e) { return fallback(); }
  };
})();
