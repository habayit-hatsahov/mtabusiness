// ══ §456 — חיבור חשבון Apple לחבר מחובר ════════════════════════════════════════════════
//
// 🔴 **הפער שזה סוגר, ונמצא בבדיקה חיה של רמי (23.9):** מסך הכניסה אומר למי שחשבון ה-Apple
// שלו לא מקושר *"היכנסו עם הטלפון והקוד — ואחרי הכניסה הראשונה תוכלו להיכנס עם Apple
// בלחיצה אחת"*. אצל Google זה נכון (`google-link.js`). **אצל Apple לא היה שום מסלול כזה** —
// `/apple-link` קיים בוורקר מ-§423, ואף דף לא קרא לו. הקישור האוטומטי (`linkable`) עובד רק
// כשהמייל של Apple זהה ל-`members.email`, ואצל רמי הוא זהה ל-`googleEmail` בלבד.
// כלומר חבר ותיק שהמיילים שלו שונים לא יכול היה לחבר את Apple לעולם.
//
// 🔑 **כאן הזהות אינה נגזרת מהמייל בכלל** — הוורקר מקבל שני טוקנים: של Apple ושל החבר
// המחובר (`/apple-link`), ולכן גם כתובת-ממסר ("הסתר את המייל שלי") מותרת כאן.
//
// ── מה הדף צריך לספק ────────────────────────────────────────────────────────────────────
//   1. <script src="native-apple.js"> **לפני** הקובץ הזה (בלעדיו: אין כפתור באפליקציה)
//   2. שורה עם id="appleLinkRow" (מוסתרת כברירת מחדל) ומקום להודעות id="appleLinkMsg"
//   3. קריאה אחת: window.hbAppleLink.init({ apiFetch, getIdToken, appleLinked })
//
// ⚠️ **הקובץ אינו יודע לאחזר טוקנים בעצמו** — אותו נימוק בדיוק כמו `google-link.js`.

(function () {
  'use strict';

  // 🔑 §446ו — הערך נעול לשוויון ע"י `scratch_test_apple_client_id.js` (עותק חמישי).
  // ⚠️ אינו סוד — משובץ גלוי בקוד הלקוח.
  var SERVICES_ID = 'il.co.yellowzone.web';
  // ⚠️ חייבת להיות רשומה ב-Return URLs בפורטל. profile.html **אינו** רשום — ובמצב popup
  // אין בזה צורך: התשובה חוזרת לחלון הפותח ב-postMessage, והכתובת רק מאומתת מול הרשימה.
  // אותו דפוס בדיוק כמו business.html, שמשתמש בכתובת של fan-register (אומת חי ב-§445).
  var REDIRECT_URI = 'https://yellowzone.co.il/welcome.html';
  var APPLE_SDK_SRC =
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
  var TIMEOUT_MS = 8000;

  var cfg = null;
  var busy = false;

  var MSGS = {
    apple_already_linked: 'חשבון ה-Apple הזה כבר מחובר לאוהד אחר. אם זו טעות — כתבו לנו.',
    invalid_apple_token:  'האימות מול Apple לא הצליח. נסו שוב.',
    not_signed_in:        'נראה שהחיבור שלכם פג. רעננו את הדף ונסו שוב.',
    member_not_found:     'לא מצאנו את הרשומה שלכם. כתבו לנו ונטפל בזה.',
  };

  function el(id) { return document.getElementById(id); }

  function msg(text, kind) {
    var m = el('appleLinkMsg');
    if (!m) return;
    if (!text) { m.style.display = 'none'; m.innerHTML = ''; return; }
    m.style.display = 'block';
    m.innerHTML = text;
    m.style.background = kind === 'ok' ? '#E8F6EE' : '#FEF3C7';
    m.style.border = '1px solid ' + (kind === 'ok' ? '#BFE5CE' : '#FCD98B');
  }

  // 'native' | 'web' | 'blocked' — `native-apple.js` הוא שער-הרשות היחיד (§450).
  // ⚠️ בלעדיו: אפליקציה = blocked (הזרימה של ה-web נשברת ב-WKWebView ובאנדרואיד, §434/§426).
  function mode() {
    var na = window.YZNativeApple;
    if (na && typeof na.mode === 'function') return na.mode();
    return (window.Capacitor || /YellowZoneApp/i.test(navigator.userAgent || '')) ? 'blocked' : 'web';
  }

  // ── שני מקורות-טוקן, צורה אחת: { idToken, code, redirectUri } או { canceled } / { error }
  async function signInNative() {
    var r = await window.YZNativeApple.signIn({ scopes: ['EMAIL'] });
    if (r.ok) return { idToken: r.idToken, code: r.authorizationCode || null, redirectUri: null };
    if (r.reason === 'canceled') return { canceled: true };
    return { error: 'native:' + r.reason };
  }

  function loadSdk() {
    return new Promise(function (resolve) {
      if (window.AppleID && window.AppleID.auth) return resolve(true);
      var existing = document.querySelector('script[src="' + APPLE_SDK_SRC + '"]');
      if (!existing) {
        var s = document.createElement('script');
        s.src = APPLE_SDK_SRC; s.async = true;
        document.head.appendChild(s);
      }
      var t0 = Date.now();
      (function wait() {
        if (window.AppleID && window.AppleID.auth) return resolve(true);
        if (Date.now() - t0 > 6000) return resolve(false);
        setTimeout(wait, 150);
      })();
    });
  }

  async function signInWeb() {
    if (!(await loadSdk())) return { error: 'sdk' };
    try {
      window.AppleID.auth.init({ clientId: SERVICES_ID, scope: 'email', redirectURI: REDIRECT_URI, usePopup: true });
      var res = await window.AppleID.auth.signIn();
      var a = res && res.authorization;
      if (!a || !a.id_token) return { error: 'empty' };
      return { idToken: a.id_token, code: a.code || null, redirectUri: REDIRECT_URI };
    } catch (e) {
      // ⚠️ ביטול אינו תקלה — אותם שני קודים של apple-signup.js / welcome.html.
      var code = String((e && (e.error || e.message)) || '');
      if (code.indexOf('popup_closed') !== -1 || code === 'user_cancelled_authorize') return { canceled: true };
      return { error: 'web:' + code.slice(0, 40) };
    }
  }

  // §455 — אותה שליחה של apple-signup.js/welcome.html: הקוד פג אחרי 5 דקות, ובלעדיו
  // מחיקת החשבון לא תוכל לבטל את ההרשאה אצל Apple. לא ממתינים ולא מציגים.
  function exchange(t) {
    if (!t.code) return;
    var body = { idToken: t.idToken, code: t.code };
    if (t.redirectUri) body.redirectUri = t.redirectUri;
    try {
      Promise.resolve(cfg.apiFetch('/apple-exchange', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
      })).catch(function (e) { console.warn('apple-link: /apple-exchange נכשל', e); });
    } catch (e) { console.warn('apple-link: /apple-exchange נכשל', e); }
  }

  async function onClick() {
    if (busy || !cfg) return;
    var m = mode();
    if (m === 'blocked') { msg('⚠️ החיבור ל-Apple אינו זמין כאן. אפשר לחבר מהאתר בדפדפן.', 'warn'); return; }
    busy = true;
    msg('מתחברים ל-Apple…', 'ok');
    try {
      var t = m === 'native' ? await signInNative() : await signInWeb();
      if (t.canceled) { msg(''); return; }
      if (t.error) {
        console.warn('apple-link: הכניסה ל-Apple נכשלה —', t.error);
        msg('⚠️ משהו השתבש מול Apple. נסו שוב.', 'warn');
        return;
      }
      exchange(t);

      // ⚠️ הטוקן שלנו נלקח **עכשיו** — אותו נימוק של google-link.js (טוקן קצר-מועד).
      var memberIdToken = await cfg.getIdToken();
      if (!memberIdToken) { msg(MSGS.not_signed_in, 'warn'); return; }

      var resp = await cfg.apiFetch('/apple-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: t.idToken, memberIdToken: memberIdToken }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      var out = await resp.json();
      if (out && out.ok) {
        // 🔑 הנוסח מצטט את הכפתור **כפי שהוא כתוב** במסך הכניסה ("המשך עם Apple",
        // welcome.html) — אותו לקח של §387: הבטחה שמצטטת כפתור בשם אחר שולחת לחפש.
        msg('✅ החשבון חובר. בפעם הבאה פשוט לחצו "המשך עם Apple" במסך הכניסה.', 'ok');
        var row = el('appleLinkRow');
        if (row) row.style.display = 'none';
        return;
      }
      msg('⚠️ ' + (MSGS[out && out.error] || 'משהו השתבש. נסו שוב בעוד רגע.'), 'warn');
    } catch (e) {
      console.error('apple link failed:', e);
      msg('⚠️ החיבור לא הושלם. בדקו את החיבור לאינטרנט ונסו שוב.', 'warn');
    } finally {
      busy = false;
    }
  }

  // מוצג **רק למי שחסר**, ורק במקום שבו יש מסלול שעובד (לא באפליקציית אנדרואיד).
  function init(opts) {
    opts = opts || {};
    if (typeof opts.apiFetch !== 'function' || typeof opts.getIdToken !== 'function') {
      console.warn('apple-link: init נקרא בלי apiFetch/getIdToken — השורה לא תוצג');
      return;
    }
    cfg = opts;
    if (opts.appleLinked) return;
    if (mode() === 'blocked') return;
    var row = el('appleLinkRow');
    if (row) row.style.display = 'flex';
  }

  // ⚠️ החשיפה מיידית ובראש הקובץ-הנטען — ה-onclick של השורה קורא לה. ר' §310/§312.
  window.hbAppleLinkClick = onClick;
  window.hbAppleLink = { init: init, click: onClick, _mode: mode };
})();
