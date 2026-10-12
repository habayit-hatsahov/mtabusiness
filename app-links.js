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
// נוסף: "➕ הוסיפו עסק" בתפריט הצד הוא target="_blank" — באפליקציה זה הוציא את המשתמש לדפדפן
// (רמי: "אני לא רוצה שזה יוציא את האנשים מהאפליקציה"). באפליקציה הקישור נפתח באותו מסך.
(function () {
  'use strict';
  var c = window.Capacitor;
  var inApp = !!c || /YellowZoneApp/i.test(navigator.userAgent || '');
  if (!inApp) return;

  function keepInApp() {
    var links = document.querySelectorAll('a.menu-add-biz[target]');
    for (var i = 0; i < links.length; i++) links[i].removeAttribute('target');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', keepInApp);
  else keepInApp();

  if (!c || typeof c.addListener !== 'function' || typeof c.nativePromise !== 'function') return;
  var hasApp = false;
  try { hasApp = (typeof c.isPluginAvailable === 'function' && c.isPluginAvailable('App')) || !!(c.Plugins && c.Plugins.App); } catch (e) {}
  if (!hasApp) return;

  function bizFrom(url) {
    try {
      var u = new URL(url);
      if (!/^(www\.)?yellowzone\.co\.il$/.test(u.hostname)) return '';
      if (!/^\/open(\.html)?\/?$/.test(u.pathname)) return '';
      return u.searchParams.get('biz') || '';
    } catch (e) { return ''; }
  }

  // ⚠️ בהפעלה קרה שני המקורות מוסרים את אותה כתובת (האירוע נשמר עד שיש מאזין), ו-getLaunchUrl
  // מחזיר אותה בכל טעינת דף עד שהאפליקציה נסגרת — בלי השמירה, כל מעבר דף היה קופץ שוב לעסק.
  var KEY = 'yz_handled_link';
  function go(url, fromLaunch) {
    var biz = bizFrom(url);
    if (!biz) return;
    var last = null;
    try { last = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (last && last.url === url && (fromLaunch || Date.now() - last.at < 5000)) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ url: url, at: Date.now() })); } catch (e) {}
    location.href = 'home.html?biz=' + encodeURIComponent(biz);
  }

  try { c.addListener('App', 'appUrlOpen', function (e) { go(e && e.url, false); }); } catch (e) {}
  try {
    c.nativePromise('App', 'getLaunchUrl').then(function (r) { if (r && r.url) go(r.url, true); }).catch(function () {});
  } catch (e) {}
})();
