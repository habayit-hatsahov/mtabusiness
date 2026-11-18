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
    // §591 — כבר בדף הבית? פותחים את הכרטיס במקום, בלי טעינה שנייה של הדף (ר' yzOpenSharedBiz).
    var biz = '';
    try { biz = new URL(target, location.href).searchParams.get('biz') || ''; } catch (e) {}
    if (biz && /\/home(\.html)?$/.test(location.pathname) && typeof window.yzOpenSharedBiz === 'function') {
      try { if (window.yzOpenSharedBiz(biz)) return; } catch (e) {}
    }
    location.href = target;
  }

  try { c.addListener('App', 'appUrlOpen', function (e) { go(e && e.url, false); }); } catch (e) {}
  try {
    c.nativePromise('App', 'getLaunchUrl').then(function (r) { if (r && r.url) go(r.url, true); }).catch(function () {});
  } catch (e) {}

  // ── §785 — כפתור "חזור" של אנדרואיד ─────────────────────────────────────────────────────────
  // 🔴 מאז ש-`@capacitor/app` נכנס לאנדרואיד (1.3+) התוסף לוקח את "חזור": בלי מאזין הוא עושה
  // goBack רק אם יש היסטוריה – ואם אין, **לא קורה כלום** (גם לא יציאה). רוב החלונות (גיליון העסק,
  // התפריט, צור קשר, שיתוף, תמונה מוגדלת, עזרה) נפתחים בלי רשומת היסטוריה, אז "חזור" מתוכם לא הגיב.
  // הסדר: 1. החלון העליון שפתוח נסגר – כל השכבות באתר בנויות `onclick="if(event.target===this)closeX()"`,
  //          ולחיצה על השכבה עצמה (el.click → target===el) מריצה בדיוק את הסגירה שלה, כולל תופעות-הלוואי
  //          (חזרה לתפריט מ"צור קשר", history.back במודאלים של welcome/profile).
  //       2. "ווים" של הדף (window.yzBackHooks – פונקציה שמחזירה true אם סגרה משהו), למשל פאנל הסינון.
  //       3. יש היסטוריה → history.back().  4. אין → מזעור האפליקציה (ההתנהגות הרגילה באנדרואיד).
  // מאזין לכל טעינת דף: הגשר מנקה את המאזינים ב-onPageStarted. iOS לא שולח את האירוע.
  var OVERLAY_SEL = '[onclick*="event.target===this"], #howtoOv';
  function shown(el) {
    if (!el.getClientRects().length) return false;
    var s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.pointerEvents !== 'none' && parseFloat(s.opacity) > 0.05;
  }
  function topOverlay() {
    var best = null, bestZ = -Infinity, list = document.querySelectorAll(OVERLAY_SEL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!shown(el)) continue;
      var z = parseInt(getComputedStyle(el).zIndex, 10); if (isNaN(z)) z = 0;
      if (z >= bestZ) { best = el; bestZ = z; }   // שוויון → המאוחר ב-DOM (מעל)
    }
    return best;
  }
  var lastBack = 0;
  function onBack(e) {
    var now = Date.now();
    if (now - lastBack < 350) return;   // הגנה מרישום כפול (pageshow מ-bfcache)
    lastBack = now;
    try { var ov = topOverlay(); if (ov) { ov.click(); return; } } catch (err) {}
    var hooks = window.yzBackHooks || [];
    for (var i = hooks.length - 1; i >= 0; i--) { try { if (hooks[i]()) return; } catch (err) {} }
    if (e && e.canGoBack) { history.back(); return; }
    try { c.nativePromise('App', 'minimizeApp').catch(function () {}); } catch (err) {}
  }
  function listenBack() { try { c.addListener('App', 'backButton', onBack); } catch (e) {} }
  listenBack();
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) listenBack(); });
})();
