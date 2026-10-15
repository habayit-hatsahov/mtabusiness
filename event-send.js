// ══ §519 — אירוע מדידה דרך הוורקר (/event), בלי REST ישיר ═══════════════════════════════════════
// לדפים הקלים שכותבים אירועים בלי ה-SDK (download.html, landing.html, usage-track.js). כשנאכוף App Check
// על Firestore, REST ישיר בלי תעודה ייחסם – הוורקר כותב עם מפתח השירות ולא תלוי בזה.
// window.yzSendEvent(restBody):
//   restBody – אותו גוף :commit שהדף בנה עד היום (writes[0].update.fields בפורמט Firestore).
//   §537 – הנפילה ל-REST הוסרה (הארגומנט השני, אם עוד מועבר, לא בשימוש). במקומה – שלוש כתובות
//   הוורקר לפי הסדר, כמו HB_API_HOSTS בשאר האתר: מי שקלאודפלייר חסום אצלו עובר דרך גוגל.
// מחזיר הבטחה שתמיד מתממשת (מדידה לעולם לא מפילה דף). סקריפט קלאסי, ES5 – גם ל-download.html.
(function () {
  'use strict';
  var HOSTS = [
    'https://api.yellowzone.co.il',                             // קלאודפלייר — השם שלנו
    'https://habayit-hatsahov.web.app/api',                     // גוגל — רשת אחרת
    'https://habayit-hatsahov-worker.yellowzone.workers.dev',   // קלאודפלייר — הישנה, אחרונה
  ];
  window.yzSendEvent = function (restBody) {
    var ev = {};
    try {
      var f = restBody.writes[0].update.fields;
      for (var k in f) {
        if (Object.prototype.hasOwnProperty.call(f, k) && f[k] && typeof f[k].stringValue === 'string') ev[k] = f[k].stringValue;
      }
    } catch (e) { return Promise.resolve(); }
    var body = JSON.stringify(ev);
    function attempt(i) {
      if (i >= HOSTS.length) return Promise.resolve();
      try {
        return fetch(HOSTS[i] + '/event', {
          method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: body,
        }).then(function (r) {
          // 429 = מכסה – כתובת אחרת מגיעה לאותו וורקר עם אותו IP, אין טעם לנסות שוב
          if (!r.ok && r.status !== 429) return attempt(i + 1);
        }, function () { return attempt(i + 1); });
      } catch (e) { return attempt(i + 1); }
    }
    return attempt(0);
  };
})();
