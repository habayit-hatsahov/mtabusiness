// ══ §536 — מסך פתיחה עם תמונה מתחלפת (באפליקציה בלבד) ═════════════════════════════════════════
// אחרי המסך הנייטיב – שכבה לבנה (§536ט), ועליה התמונה הבאה בתור על כל המסך.
// התמונות מנוהלות במרכז הניהול ← "מסך פתיחה" (settings/splashScreen).
//
// איך זה עובד:
//   • נטען **סינכרונית מיד בתחילת body** ב-welcome.html וב-home.html – כך השכבה היא הדבר הראשון שנצבע.
//   • פעם אחת לכל פתיחה של האפליקציה (sessionStorage): נבחרת התמונה הבאה בתור מהרשימה השמורה
//     (localStorage), והמונה מתקדם. אותה תמונה ממשיכה גם אחרי welcome → home, בלי הבהוב.
//   • התמונה מוצגת לפחות 1.5 שנ' מהרגע שהופיעה; השכבה יורדת רק כשהדף מוכן (yzSplashPhotoDone).
//     אם התמונה לא נטענה עד שהדף מוכן – לא מחכים לה (השכבה יורדת בלי להציג אותה).
//   • הרשימה מתעדכנת ברקע (yzSplashPhotoStore מהמודול של הדף), והבאה בתור נטענת מראש – כדי
//     שבפתיחה הבאה היא כבר במטמון ותופיע מיד. פתיחה ראשונה אחרי התקנה = בלי תמונה (אין עדיין רשימה).
//   • אין רשימה / הכול כבוי / דפדפן – כלום לא משתנה, הלוגו כמו קודם.
// ?splashtest=1 – תצוגה בדפדפן (לבדיקה בלבד).
// §536ד – window.YZ_SPLASH_PREVIEW = כתובת: מצב תצוגה (splash-preview.html) – אותה תמונה, אותו עיצוב, בלי
//   תור/מונה/sessionStorage, נשארת על המסך; לחיצה = פתיחה מחדש.
// §536ד – html.yz-app-boot: רקע צהוב בהפעלה. §536ט – הוסר מ-index/welcome/home לבקשת רמי (לבן → צהוב →
//   תמונה נראה כהבהוב); unboot() כאן נשאר בלי נזק, למקרה שהמחלקה תוחזר.
(function () {
  'use strict';
  var LS_CFG = 'yz_splash_cfg', LS_IDX = 'yz_splash_idx';
  var SS_PICK = 'yz_splash_pick', SS_T0 = 'yz_splash_t0', SS_DONE = 'yz_splash_done';
  // §536ט (רמי: "מהבהב לבן, אז צהוב, אז התמונה – תוריד את הצהוב") – השכבה לבנה עד שהתמונה נטענת
  var MIN_MS = 1500, MAX_MS = 12000, BG = '#ffffff';
  // §536ח (רמי: "שים אותן איך שהן, הן עם רקע צהוב – כרגע זה נראה תמונה בתוך רקע") – התמונה על כל המסך
  // (cover), בלי הקטנה, בלי מסגרת ובלי טשטוש. נוסו ונדחו: contain+טשטוש (§536ג), צהוב חלק סביב (§536ו),
  // קצוות נמסים (§536ז). ⚠️ עותק של העיצוב ב-admin-dashboard.html (".sp-phone img") – שינוי כאן מחייב שם.
  var IMG_CSS = 'position:absolute;inset:0;z-index:1;width:100%;height:100%;object-fit:cover;object-position:center';
  var preview = typeof window.YZ_SPLASH_PREVIEW === 'string' ? window.YZ_SPLASH_PREVIEW : '';
  var inApp = /YellowZoneApp/i.test(navigator.userAgent || '') || /[?&]splashtest=1/.test(location.search);
  function unboot() { document.documentElement.classList.remove('yz-app-boot'); }

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }
  function readCfg() {
    try {
      var c = JSON.parse(ls(LS_CFG) || 'null');
      return c && c.enabled !== false && Array.isArray(c.urls) ? c.urls.filter(function (u) { return typeof u === 'string' && u; }) : [];
    } catch (e) { return []; }
  }
  function preload(url) { if (url) { var im = new Image(); im.decoding = 'async'; im.src = url; } }

  // ── שמירת הרשימה (נקרא מהמודול של הדף אחרי getDoc(settings/splashScreen)) ──
  window.yzSplashPhotoStore = function (data) {
    if (!inApp) return;
    var items = data && Array.isArray(data.items) ? data.items : [];
    var urls = items.filter(function (it) { return it && it.on !== false && typeof it.url === 'string' && it.url; })
      .map(function (it) { return it.url; });
    ls(LS_CFG, JSON.stringify({ enabled: !!(data && data.enabled), urls: urls }));
    var list = readCfg();
    if (!list.length) return;
    // נקודת ההתחלה האקראית נקבעת כבר כאן, כדי שהתמונה שנטענת מראש היא זו שתוצג בפתיחה הבאה
    if (ls(LS_IDX) === null) ls(LS_IDX, String(Math.floor(Math.random() * list.length)));
    preload(list[(+ls(LS_IDX) || 0) % list.length]);
  };

  window.yzSplashPhotoInApp = inApp;   // הדפים קוראים את settings/splashScreen רק כשזה true
  window.yzSplashPhotoDone = function () {};
  if (!preview && (!inApp || ss(SS_DONE) === '1')) { unboot(); return; }

  var pick = preview || ss(SS_PICK);
  if (pick === null) {
    // פתיחה חדשה של האפליקציה – הבאה בתור
    var list = readCfg();
    pick = '';
    if (list.length) {
      // נקודת התחלה אקראית לכל מכשיר (פעם אחת) – לא כולם מתחילים מתמונה 1; משם לפי הסדר, בלי חזרות
      if (ls(LS_IDX) === null) ls(LS_IDX, String(Math.floor(Math.random() * list.length)));
      var i = (+ls(LS_IDX) || 0) % list.length;
      pick = list[i];
      ls(LS_IDX, String((i + 1) % list.length));
    }
    ss(SS_PICK, pick);
  }
  if (!pick) { ss(SS_DONE, '1'); unboot(); return; }

  // ── השכבה ──
  // visibility:visible – דורס את visibility:hidden של body ב-lp-checking/hb-checking (כמו .lp-splash)
  var el = document.createElement('div');
  el.id = 'yzSplashPhoto';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;inset:0;z-index:1000000;visibility:visible;background:' + BG +
    ';transition:opacity .35s ease;pointer-events:auto';
  var img = document.createElement('img');
  img.alt = '';
  img.style.cssText = IMG_CSS + ';opacity:0;transition:opacity .25s ease';
  el.appendChild(img);
  (document.body || document.documentElement).appendChild(el);
  if (preview) {
    el.onclick = function () { location.reload(); };
    img.onload = function () { img.style.opacity = '1'; };
    img.src = pick;
    return;
  }

  var shownAt = +ss(SS_T0) || 0, ready = false, gone = false;
  // §557 (רמי, סרטון 19.10: "קפיצה אחת") – במעבר index → welcome → home כל דף בונה את השכבה מחדש, והתמונה
  // מצוירת רק אחרי שהיא נטענת ומפוענחת שוב → ~0.3 שנ' לבן באמצע. התיקון: בדף הראשון שומרים עותק זעיר של
  // התמונה (sessionStorage), ובדפים הבאים הוא רקע השכבה מהציור הראשון – במקום לבן; התמונה החדה מכסה אותו.
  var SS_THUMB = 'yz_splash_thumb';
  function saveThumb() {
    try {
      var w = 72, h = Math.round(w * img.naturalHeight / img.naturalWidth);
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      ss(SS_THUMB, c.toDataURL('image/jpeg', 0.7));
    } catch (e) {}   // תמונה מדומיין אחר (canvas נגוע) – בלי עותק, כמו קודם
  }
  if (shownAt) {
    var thumb = ss(SS_THUMB);
    if (thumb) el.style.background = BG + ' url("' + thumb + '") center / cover no-repeat';
    img.decoding = 'sync';                   // אם התמונה כבר בזיכרון – לצייר אותה כבר בציור הראשון
  }
  function show() {
    if (gone || ready && !shownAt) return;   // הדף כבר מוכן והתמונה עוד לא הופיעה – לא מציגים לרגע
    if (!shownAt) {
      shownAt = Date.now(); ss(SS_T0, String(shownAt)); img.style.transition = 'opacity .25s ease';
      saveThumb();
    }
    else img.style.transition = 'none';      // ממשיכים מהדף הקודם – מיד, בלי עמעום שני
    img.style.opacity = '1';
  }
  img.onload = show;
  img.src = pick;
  if (img.complete && img.naturalWidth) show();

  function hide() {
    if (gone) return;
    gone = true;
    ss(SS_DONE, '1');
    unboot();
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    var next = readCfg();
    if (next.length) preload(next[(+ls(LS_IDX) || 0) % next.length]);
  }
  window.yzSplashPhotoDone = function () {
    if (gone) return;
    ready = true;
    if (!shownAt) { hide(); return; }
    var left = MIN_MS - (Date.now() - shownAt);
    if (left > 0) setTimeout(hide, left); else hide();
  };
  // רשת ביטחון – לעולם לא נשארים תקועים על התמונה
  setTimeout(hide, MAX_MS);
})();
