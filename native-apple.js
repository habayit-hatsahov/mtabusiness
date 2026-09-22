// ══════════════════════════════════════════════════════════════════════════════════════════
//  native-apple.js — כניסה עם Apple מתוך האפליקציה  (§448)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  🔴 **למה הקובץ הזה קיים — שתי סיבות נפרדות, וכל אחת מהן מספיקה לבדה:**
//
//  1. **§426 — זרימת ה-web של אפל נשברה בתוך WKWebView מ-iOS 17.1.** במקום גיליון האימות
//     הנייטיב (Face ID) מוצג **טופס HTML של שם-משתמש וסיסמה**. כלומר דווקא בתוך
//     האפליקציה — המקום היחיד שבגללו אפל דורשת את הפיצ'ר מלכתחילה — החוויה היא הגרועה
//     ביותר, וזו גם חשיפה לדחייה בבדיקה.
//  2. **§434 — המנגנון שמייצר את הדף הלבן.** `AppleID.auth.signIn` עם `usePopup:true`
//     נשען על `window.open` אל `appleid.apple.com`. ב-Capacitor `Bridge.launchIntent` שולח
//     כל host זר ל**דפדפן החיצוני**, שם אין `window.opener`, והטוקן לא חוזר לאף אחד.
//     זה בדיוק מה שהבודקים דיווחו עליו אצל גוגל.
//
//  🔑 **הפתרון הוא מסלול שני ולא תיקון של הראשון** — התוסף `@capawesome/capacitor-apple-sign-in`
//  משתמש ב-`AuthenticationServices` של אפל ומחזיר `idToken`. אותו `worker/src/apple.js`
//  מאמת אותו **בלי שום שינוי**: `APPLE_CLIENT_IDS` נבנה כרשימה כבר ב-§423, והוא מכיל
//  היום `il.co.yellowzone.web,il.co.yellowzone.app` — ה-Bundle ID כבר שם.
//
//  ── שלושה מצבים, ו-mode() הוא המקום היחיד שמכריע ביניהם ──────────────────────────────────
//    'web'     — דפדפן רגיל → ה-SDK של אפל, כמו היום.
//    'native'  — אפליקציה שיש בה את התוסף (iOS) → הכפתור מכאן.
//    'blocked' — אפליקציה **בלי** התוסף → **אין כפתור Apple בכלל**. זה המצב של
//               אפליקציית האנדרואיד היום, והוא **נכון ומכוון** (ר' ההחלטה למטה).
//
//  🔑 **החלטת המשתמש (22.9.2026): באייפון — Apple + טלפון/קוד בלבד, בלי Google.**
//  זה נופל מעצמו מתוך `mode()` ולא דורש שום דגל: אפליקציית ה-iOS תישא את תוסף אפל ולא
//  את תוסף גוגל, ולכן `YZNativeGoogle.mode()` יחזיר שם `'blocked'` ו-`YZNativeApple.mode()`
//  יחזיר `'native'`. באנדרואיד — בדיוק ההפך. **אין כאן `if (platform === 'ios')` בשום מקום,
//  ובמכוון:** התניה על שם-הפלטפורמה הייתה שקר מהרגע שגרסה אחת תישלח בלי התוסף, בעוד
//  "האם התוסף קיים" היא השאלה שבאמת נשאלת.
//
//  ⚠️ אותו דפוס בדיוק כמו `native-google.js` ו-`native-push.js` — script רגיל שנחשף על
//  `window`, בלי לארוז ולו בייט של Capacitor באתר. הגשר מוזרק לדומיין החי ע"י Capacitor
//  עצמו (§420ג).
// ══════════════════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // 🔑 **אומת מקוד התוסף עצמו ולא מהתיעוד** — `dist/esm/index.js` עושה
  // `registerPlugin('AppleSignIn', ...)`. אותה מוסכמה של `GoogleSignIn` באותה משפחת תוספים.
  var PLUGIN = 'AppleSignIn';

  // ⚠️ **אין כאן clientId, וזה לא שכחה.** `initialize({clientId})` של התוסף הוא
  // **Android/Web בלבד** (כתוב כך ב-`definitions.d.ts` שלו). במסלול ה-iOS הנייטיב אין
  // Services ID בכלל — הטוקן מונפק ל-**Bundle ID**, וזה מה ש-`APPLE_CLIENT_IDS` כבר מכיר.
  // 🔴 ולכן גם **אין כאן עותק חמישי של ה-Services ID**, ו-`scratch_test_apple_client_id.js`
  // אינו צריך לדעת על הקובץ הזה. ר' §446ו — כל עותק נוסף הוא עוד מקום להישכח בו.

  // ⏱️ לא המתנת-רשת אלא המתנה לאדם מול גיליון אפל (Face ID, אישור מייל) — ולכן ארוך.
  // אבל לא אינסופי: קריאה נייטיב שלא חוזרת לעולם משאירה כפתור נעול בלי מוצא.
  // ר' [[feedback_bound_every_network_await]].
  var SIGNIN_TIMEOUT_MS = 180000;

  // ── הגשר ────────────────────────────────────────────────────────────────────────────────
  // 🔑 **גם מההורה.** טופס ההרשמה של דף הנחיתה רץ ב-iframe (`fan-register.html?embed=1`
  // בתוך welcome.html). ה-iframe הוא same-origin, ו-nativePromise של ההורה עובד משם.
  // ⚠️ try נפרד לכל צד: הורה cross-origin זורק SecurityError כבר בגישה ל-`.Capacitor`.
  function bridge() {
    try {
      var c = window.Capacitor;
      if (c && typeof c.nativePromise === 'function') return c;
    } catch (e) {}
    try {
      if (window.parent && window.parent !== window) {
        var p = window.parent.Capacitor;
        if (p && typeof p.nativePromise === 'function') return p;
      }
    } catch (e) {}
    return null;
  }

  // שתי דרכי זיהוי, מאותו נימוק של `native-google.js`: ה-UA קיים מהבקשה הראשונה, והגשר
  // עשוי להגיע מעט אחריו. **זיהוי-חסר כאן מחזיר את הדף הלבן של §434**, ולכן עדיף ביתר.
  function inApp() {
    if (bridge()) return true;
    return /YellowZoneApp/i.test((typeof navigator !== 'undefined' && navigator.userAgent) || '');
  }

  // `isPluginAvailable` של native-bridge בודק את `Capacitor.Plugins`, שאומת מאוכלס על מכשיר
  // גם בדומיין מרוחק (§420ט). הבדיקה הישירה על Plugins היא רשת-ביטחון לגרסת-גשר אחרת.
  function hasPlugin(c) {
    try {
      if (typeof c.isPluginAvailable === 'function' && c.isPluginAvailable(PLUGIN)) return true;
    } catch (e) {}
    try {
      return !!(c.Plugins && Object.prototype.hasOwnProperty.call(c.Plugins, PLUGIN));
    } catch (e) { return false; }
  }

  function mode() {
    var c = bridge();
    if (c && hasPlugin(c)) return 'native';
    return inApp() ? 'blocked' : 'web';
  }

  // ── הכניסה עצמה ─────────────────────────────────────────────────────────────────────────

  function detailOf(e) {
    return String((e && (e.message || e.code)) || e || '');
  }

  // 🔴 **קודי הביטול — מה ידוע ומה לא, ולמה ההכרעה נוטה לכיוון שהיא נוטה.**
  // `AppleSignInPlugin.swift` עושה `call.reject(error.localizedDescription, code)`, כאשר
  // `code` הוא או `CustomError.code` (המחרוזת אינה בקבצים שהתוסף מפרסם ב-npm) או
  // **הערך המספרי הגולמי** של `ASAuthorizationError` — ושם `canceled` הוא `1001`.
  // ⚠️ כלומר הרשימה הזאת **אינה מלאה ודאות**, והיא הדבר היחיד בקובץ שדורש אימות על מכשיר.
  // 🔑 **וכשהקוד אינו מוכר — מציגים הודעה ולא שותקים.** זו ההכרעה ההפוכה מהאינטואיציה:
  // ביטול שמוצג בטעות כשגיאה הוא חיכוך (§420ה), אבל שגיאה אמיתית שמוצגת כביטול היא
  // **מסך שחוזר לעצמו בלי מילה** — בדיוק הכשל של §439 שלקח שעות לאבחן, ושל §357.
  var CANCEL_CODES = { SIGN_IN_CANCELED: 1, '1001': 1 };

  function isCancel(e) {
    var code = String((e && e.code) || '');
    if (CANCEL_CODES[code]) return true;
    // נפילה-לאחור על הטקסט: `localizedDescription` של אפל לביטול מכיל "cancel".
    return /cancel/i.test(detailOf(e));
  }

  // מחזיר { ok:true, idToken, email, givenName, familyName, user } או
  // { ok:false, reason, detail }. **לעולם אינו זורק.**
  //
  // ⚠️ **`email`/`givenName`/`familyName` מגיעים מאפל רק בהרשאה הראשונה בחיים** — כך כתוב
  // ב-`definitions.d.ts` של התוסף עצמו ("On iOS, this is only provided on the first sign-in").
  // כלומר כל קורא שממלא מהם שדות חייב להתייחס אליהם כאל **אולי-ריקים**, ומסך כניסה
  // (`welcome.html`) לא אמור לגעת בהם בכלל. ר' [[feedback_dont_invent_fields]].
  async function signIn(opts) {
    opts = opts || {};
    var c = bridge();
    if (!c || !hasPlugin(c)) return { ok: false, reason: 'unavailable' };

    // ⚠️ **אין קריאה ל-`initialize`** — היא Android/Web בלבד. קריאה לה ב-iOS הייתה נכשלת
    // ב-`UNIMPLEMENTED` ומפילה כניסה תקינה לחלוטין.
    var timer = null;
    try {
      var payload = {};
      // ברירת המחדל היא מייל בלבד: זו הבקשה של מסך ההתחברות, והיא גם המינימלית.
      // ⚠️ הערכים הם המחרוזות של `SignInScope` בתוסף — 'EMAIL' / 'FULL_NAME'.
      payload.scopes = (opts.scopes && opts.scopes.length) ? opts.scopes : ['EMAIL'];
      if (opts.nonce) payload.nonce = String(opts.nonce);

      var r = await Promise.race([
        c.nativePromise(PLUGIN, 'signIn', payload),
        new Promise(function (_, reject) {
          timer = setTimeout(function () { reject({ code: 'TIMEOUT' }); }, SIGNIN_TIMEOUT_MS);
        }),
      ]);
      // 🔑 **`idToken` ולא `identityToken`.** השם נלקח מ-`definitions.d.ts` של התוסף, אחרי
      // שהתיעוד שלנו הניח את השם השני. שדה שגוי כאן היה מחזיר `empty_token` על כניסה מוצלחת.
      if (!r || !r.idToken) return { ok: false, reason: 'empty_token' };
      return {
        ok: true,
        idToken: String(r.idToken),
        email: r.email || null,
        givenName: r.givenName || null,
        familyName: r.familyName || null,
        user: r.user || null,
      };
    } catch (e) {
      if (e && e.code === 'TIMEOUT') return { ok: false, reason: 'timeout', detail: detailOf(e) };
      if (isCancel(e)) return { ok: false, reason: 'canceled', detail: detailOf(e) };
      return { ok: false, reason: 'error', detail: detailOf(e) };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── הכפתור ──────────────────────────────────────────────────────────────────────────────
  // הלוגו זהה בדיוק לזה שב-`welcome.html` ו-`apple-signup.js` — נתיב ה-SVG הוא נכס של אפל
  // ואין לשנותו.
  var A_LOGO =
    '<svg viewBox="0 0 17 20" width="15" height="18" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M14.06 10.6c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.29-.88-2.31-3.5zM11.87 3.9c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.56 1.31-.56.65-1.06 1.7-.93 2.7.97.08 1.97-.5 2.59-1.23z"/></svg>';

  // מה שהאדם יכול לעשות, לא קוד באנגלית. ביטול אינו מוצג כלל — הוא החליט, אין מה לומר לו.
  var MSGS = {
    timeout: 'הכניסה עם Apple לא הושלמה בזמן. אפשר לנסות שוב, או להיכנס עם הטלפון והקוד.',
  };
  var MSG_GENERIC = 'הכניסה עם Apple לא הושלמה. נסו שוב, או היכנסו עם הטלפון והקוד.';

  // ⚠️ המידות זהות ל-`.hb-as-login-btn` ב-`welcome.html` (§446): pill, גובה מינימלי 44,
  // רוחב 300 — כדי שהמעבר בין דפדפן לאפליקציה לא ייראה כמו שני רכיבים שונים.
  // אפל מתירה במפורש רדיוס עד חצי-גובה.
  function injectStyle() {
    if (document.getElementById('yzNaStyle')) return;
    var s = document.createElement('style');
    s.id = 'yzNaStyle';
    s.textContent =
      '.yz-na{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}' +
      '.yz-na-btn{display:flex;align-items:center;justify-content:center;gap:8px;' +
        'width:300px;max-width:100%;min-height:44px;padding:0 16px;border:0;border-radius:999px;' +
        'background:#000;color:#fff;font:inherit;font-size:15px;font-weight:600;line-height:1;' +
        'cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.yz-na-btn:active{background:#1a1a1a}' +
      '.yz-na-btn[disabled]{opacity:.6;cursor:default}' +
      '.yz-na-btn svg{flex:0 0 auto;margin-bottom:2px}' +
      '.yz-na-msg{display:none;font-size:12.5px;line-height:1.6;text-align:center;color:#8A5A00;' +
        'background:#FEF3C7;border:1px solid #FCD98B;border-radius:10px;padding:8px 10px;max-width:320px}' +
      '.yz-na-msg.show{display:block}' +
      // §439 — "מתחבר…" אינו אזהרה ולכן אינו צהוב. בלי החיווי הזה המתנה נראית זהה לגמרי
      // לכישלון שקט, וזה בדיוק מה שדווח במסלול הנייטיב של גוגל.
      '.yz-na-msg.busy{color:#1E3A8A;background:#EEF2FF;border-color:#C7D2FE}';
    document.head.appendChild(s);
  }

  // opts: { label, width, scopes, nonce, onToken(res) }
  // ⚠️ מצייר **לתוך host** (מחליף את תוכנו) — ולכן `host.childElementCount` נשאר האות
  // ש"הכפתור צויר", בדיוק כמו אחרי הציור של ה-SDK. `hbSyncLoginBlocks` נשען על זה.
  function renderButton(host, opts) {
    if (!host) return null;
    opts = opts || {};
    injectStyle();
    var wrap = document.createElement('div');
    wrap.className = 'yz-na';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yz-na-btn';
    btn.style.width = (opts.width || 300) + 'px';
    btn.innerHTML = A_LOGO + '<span class="yz-na-txt"></span>';
    btn.querySelector('.yz-na-txt').textContent = opts.label || 'המשך עם Apple';
    var msg = document.createElement('div');
    msg.className = 'yz-na-msg';
    wrap.appendChild(btn);
    wrap.appendChild(msg);
    host.innerHTML = '';
    host.appendChild(wrap);

    var busy = false;
    btn.addEventListener('click', function () {
      if (busy) return;                 // לחיצה כפולה פותחת גיליון שני מעל הראשון
      busy = true;
      btn.disabled = true;
      msg.textContent = 'מתחבר…';
      msg.classList.add('show', 'busy');
      signIn({ scopes: opts.scopes, nonce: opts.nonce }).then(function (r) {
        busy = false;
        btn.disabled = false;
        msg.classList.remove('show', 'busy');
        if (r.ok) {
          if (typeof opts.onToken === 'function') {
            try { opts.onToken(r); }
            catch (e) { console.error('native-apple: onToken נכשל', e); }
          }
          return;
        }
        // ── §439 — 🔴 **כשל נייטיב שנרשם רק בקונסול אינו קיים** ──────────────────────────
        // זה הלקח שנקנה במסלול של גוגל: הבורר נפתח, האדם בחר, המסך חזר בלי כלום, ובאירועים
        // היו **אפס** `loginFail` — כי הכשל קרה **לפני** הקריאה לוורקר.
        // ⚠️ **גם `canceled` נרשם, ובכוונה:** ההבדל בין "התחרט" לבין "נכשל בשקט אחרי
        // האישור" הוא כל האבחון, ובלעדיו שניהם נראים כמו מסך שחזר לעצמו.
        // ⚠️ עטוף ב-try ואינו תלוי ב-logEvent: המודול ייטען גם בדפים שאין בהם מדידה.
        try {
          if (typeof window.logEvent === 'function') {
            window.logEvent('loginFail', {
              channel: ('apple:native:' + r.reason).slice(0, 50),
              blockId: (window._hbEnvTag || 'app').slice(0, 50),
            });
          }
        } catch (e) {}
        if (r.reason === 'canceled') return;
        // ⚠️ תמיד לקונסול — כישלון שקט הוא מה שהסתיר את §357.
        console.warn('native-apple: הכניסה נכשלה —', r.reason, r.detail || '');
        msg.textContent = MSGS[r.reason] || MSG_GENERIC;
        msg.classList.add('show');
      });
    });
    return wrap;
  }

  // ⚠️ החשיפה מיידית — הדפים בודקים את mode() בזמן ציור המודאל. ר' §310/§312/§425.
  window.YZNativeApple = {
    mode: mode,
    inApp: inApp,
    signIn: signIn,
    renderButton: renderButton,
  };
})();
