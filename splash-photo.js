// ══ §536 — מסך פתיחה עם תמונה מתחלפת (באפליקציה בלבד) ═════════════════════════════════════════
// אחרי המסך הנייטיב (צהוב נקי #ECC94B) – שכבה צהובה באותו צבע, ועליה התמונה הבאה בתור על כל המסך.
// התמונות מנוהלות במרכז הניהול ← "מסך פתיחה" (settings/splashScreen).
//
// איך זה עובד:
//   • נטען **סינכרונית מיד בתחילת body** ב-welcome.html וב-home.html – כך השכבה היא הדבר הראשון שנצבע.
//   • פעם אחת לכל פתיחה של האפליקציה (sessionStorage): נבחרת התמונה הבאה בתור מהרשימה השמורה
//     (localStorage), והמונה מתקדם. אותה תמונה ממשיכה גם אחרי welcome → home, בלי הבהוב.
//   • התמונה מוצגת לפחות 1.5 שנ' מהרגע שהופיעה; השכבה יורדת רק כשהדף מוכן (yzSplashPhotoDone).
//     אם התמונה לא נטענה עד שהדף מוכן – לא מחכים לה (השכבה יורדת בלי להציג אותה).
//   • הרשימה מתעדכנת ברקע (yzSplashPhotoStore מהמודול של הדף), והבאה בתור נטענת מראש – כדי
//     שבפתיחה הבאה היא כבר במטמון ותופיע מיד. פתיחה ראשונה אחרי התקנה = צהוב בלבד (אין עדיין רשימה).
//   • אין רשימה / הכול כבוי / דפדפן – כלום לא משתנה, הלוגו כמו קודם.
// ?splashtest=1 – תצוגה בדפדפן (לבדיקה בלבד).
// §536ד – window.YZ_SPLASH_PREVIEW = כתובת: מצב תצוגה (splash-preview.html) – אותה תמונה, אותו עיצוב, בלי
//   תור/מונה/sessionStorage, נשארת על המסך; לחיצה = פתיחה מחדש.
// §536ד – html.yz-app-boot (נקבע בראש welcome/home באפליקציה): רקע צהוב עד שהשכבה יורדת, במקום מסך לבן
//   בזמן שהדף עוד לא צויר. מוסר כאן בכל מסלול (גם כשאין תמונה), כדי שלא יישאר צהוב ב"קפיצת" הגלילה.
(function () {
  'use strict';
  var LS_CFG = 'yz_splash_cfg', LS_IDX = 'yz_splash_idx';
  var SS_PICK = 'yz_splash_pick', SS_T0 = 'yz_splash_t0', SS_DONE = 'yz_splash_done';
  var MIN_MS = 1500, MAX_MS = 12000, BG = '#ECC94B';
  // §536ה – גודל התמונה ביחס למסך (רמי: "השור עדיין גדול"). נקבע בלשונית; הרקע המטושטש ממלא את השאר.
  var DEF_SIZE = 0.8;
  function readSize() {
    if (typeof window.YZ_SPLASH_SIZE === 'number') return window.YZ_SPLASH_SIZE;
    try { var c = JSON.parse(ls(LS_CFG) || 'null'); if (c && +c.size >= 0.5 && +c.size <= 1) return +c.size; } catch (e) {}
    return DEF_SIZE;
  }
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
    var size = data && +data.size >= 0.5 && +data.size <= 1 ? +data.size : DEF_SIZE;
    ls(LS_CFG, JSON.stringify({ enabled: !!(data && data.enabled), urls: urls, size: size }));
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
  // §536ג (רמי: "הדמות גדולה מדי") – התמונה כולה נכנסת למסך (contain) במקום למלא אותו (cover).
  // בטלפון צר-וגבוה נשארים פסים למעלה/למטה – ממלאים אותם בעותק מטושטש ומוגדל של אותה תמונה
  // (אותו קובץ מהמטמון), כך שהרקע ממשיך את צבעי התמונה בלי קו חיתוך.
  var size = readSize();
  img.style.cssText = 'position:absolute;inset:0;z-index:1;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .25s ease;' +
    'transform:scale(' + size + ')';
  var back = document.createElement('img');
  back.alt = '';
  back.style.cssText = 'position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover;filter:blur(24px);transform:scale(1.15);opacity:0;transition:opacity .25s ease';
  el.appendChild(img);
  el.appendChild(back);
  (document.body || document.documentElement).appendChild(el);
  if (preview) {
    el.onclick = function () { location.reload(); };
    img.onload = function () { img.style.opacity = '1'; back.style.opacity = '1'; };
    img.src = pick; back.src = pick;
    return;
  }

  var shownAt = +ss(SS_T0) || 0, ready = false, gone = false;
  function show() {
    if (gone || ready && !shownAt) return;   // הדף כבר מוכן והתמונה עוד לא הופיעה – לא מציגים לרגע
    if (!shownAt) { shownAt = Date.now(); ss(SS_T0, String(shownAt)); img.style.transition = 'opacity .25s ease'; }
    else img.style.transition = 'none';      // ממשיכים מהדף הקודם – מיד, בלי עמעום שני
    img.style.opacity = '1';
    back.style.transition = img.style.transition;
    back.style.opacity = '1';
  }
  img.onload = show;
  img.src = pick;
  back.src = pick;
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
