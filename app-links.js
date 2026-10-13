// ── §499 — קישור לעסק שנפתח באפליקציה → כרטיס העסק ─────────────────────────────────────────
// `yellowzone.co.il/open?biz=<slug>` (קישור "שתפו את העסק") רשום כ-Universal Link (AASA, §495) וכ-App
// Link (intent-filter, §496). כשהאפליקציה מותקנת היא נפתחת במקום הדפדפן — אבל במסך שבו הייתה: ה-WebView
// טוען את server.url ולא את הקישור. התוסף `@capacitor/app` מוסר את הכתובת לכאן, ומכאן → home.html?biz=,
// שפותח את הכרטיס (§474; גם אצל מי שלא מחובר — נשמר, ונפתח אחרי הכניסה).
//   • אפליקציה פתוחה ברקע  → אירוע `appUrlOpen`.
//   • אפליקציה סגורה (cold start) → `getLaunchUrl()`.
// אותו גשר ישיר כמו native-push.js (`nativePromise` / `addListener`) — בלי לארוז Capacitor באתר.
// בלי התוסף (iOS 1.0 / Android 1.2, ודפדפן) — שום דבר לא קורה, והאפליקציה פשוט נפתחת כמו קודם.
//
// §510 — "➕ הוסיפו עסק" כבר לא נושא target="_blank" במרקאפ עצמו (4 הדפים). §499 הסיר אותו כאן
// בזמן-ריצה, ובכל זאת רמי דיווח (12.10) שבאפליקציה זה עדיין יוצא לדפדפן — ההסרה מהמקור לא
// תלויה בשום תנאי-זיהוי או סדר-טעינה.
(function () {
  'use strict';
  var c = window.Capacitor;
  if (!c || typeof c.addListener !== 'function' || typeof c.nativePromise !== 'function') return;
  var hasApp = false;
  try { hasApp = (typeof c.isPluginAvailable === 'function' && c.isPluginAvailable('App')) || !!(c.Plugins && c.Plugins.App); } catch (e) {}
  if (!hasApp) return;

  // §501 — גם /open?conv=<id> (הכפתור במייל "הצוות ענה לך") → השיחה בלשונית "הודעות".
  function targetFrom(url) {
    try {
      var u = new URL(url);
      if (!/^(www\.)?yellowzone\.co\.il$/.test(u.hostname)) return '';
      if (!/^\/open(\.html)?\/?$/.test(u.pathname)) return '';
      var conv = u.searchParams.get('conv') || '';
      if (conv) return 'profile.html?conv=' + encodeURIComponent(conv);
      var biz = u.searchParams.get('biz') || '';
      return biz ? 'home.html?biz=' + encodeURIComponent(biz) : '';
    } catch (e) { return ''; }
  }

  // ⚠️ בהפעלה קרה שני המקורות מוסרים את אותה כתובת (האירוע נשמר עד שיש מאזין), ו-getLaunchUrl
  // מחזיר אותה בכל טעינת דף עד שהאפליקציה נסגרת — בלי השמירה, כל מעבר דף היה קופץ שוב לעסק.
  var KEY = 'yz_handled_link';
  function go(url, fromLaunch) {
    var target = targetFrom(url);
    if (!target) return;
    var last = null;
    try { last = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (last && last.url === url && (fromLaunch || Date.now() - last.at < 5000)) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ url: url, at: Date.now() })); } catch (e) {}
    location.href = target;
  }

  try { c.addListener('App', 'appUrlOpen', function (e) { go(e && e.url, false); }); } catch (e) {}
  try {
    c.nativePromise('App', 'getLaunchUrl').then(function (r) { if (r && r.url) go(r.url, true); }).catch(function () {});
  } catch (e) {}
})();
