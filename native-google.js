// ══════════════════════════════════════════════════════════════════════════════════════════
//  native-google.js — כניסה עם Google מתוך האפליקציה  (§435)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  🔴 **למה הקובץ הזה קיים (§434, נמדד בצילום מסך מבודק):** כפתור ה-web של Google (GIS)
//  פותח popup אל `accounts.google.com`. ב-Capacitor אין `onCreateWindow`, וה-popup נטען
//  כניווט רגיל — ו-`Bridge.launchIntent` שולח כל host שאינו `yellowzone.co.il` **לדפדפן
//  החיצוני**. שם האדם בוחר חשבון, Google מאשרת (ושולחת מייל "כניסה חדשה"), ודף ה-popup
//  מחפש `window.opener` שאינו קיים → **דף לבן בדפדפן**, והאפליקציה לא מקבלת כלום.
//
//  🔑 **הפתרון הוא מסלול נייטיב, לא תיקון של ה-web:** התוסף
//  `@capawesome/capacitor-google-sign-in` פותח את גיליון-החשבונות של אנדרואיד (Credential
//  Manager) ומחזיר `idToken`. הטוקן מונפק ל-**web client id** (זה מה ש-initialize מקבל), כלומר
//  `aud` שלו זהה לזה של GIS — ו-`worker/src/google.js` מאמת אותו **בלי שום שינוי**.
//
//  🔑 **ואין כאן מסלול כניסה שני.** הכפתור הנייטיב קורא לאותם callbacks בדיוק שהכפתור של
//  GIS קורא להם, עם אותה צורה (`{ credential }`). מה שאחרי הלחיצה זהה לחלוטין.
//
//  ── שלושה מצבים, ו-mode() הוא המקום היחיד שמכריע ביניהם ──────────────────────────────────
//    'web'     — דפדפן רגיל → הכפתור של GIS, כמו היום.
//    'native'  — אפליקציה שיש בה את התוסף (versionCode 2 ומעלה) → הכפתור מכאן.
//    'blocked' — אפליקציה **בלי** התוסף (versionCode 1) → **אין כפתור Google בכלל**.
//               כפתור שמוביל לדף לבן גרוע בהרבה מכפתור שאינו קיים; טלפון+קוד נשארים.
//
//  ⚠️ אותו דפוס בדיוק כמו `native-push.js` — script רגיל שנחשף על `window`, בלי לארוז ולו
//  בייט של Capacitor באתר. הגשר מוזרק לדומיין החי ע"י Capacitor עצמו (§420ג).
// ══════════════════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ⚠️ אינו סוד. **חייב להיות ה-web client id** — זה שב-GOOGLE_CLIENT_ID בוורקר. client id
  // של אנדרואיד כאן היה מנפיק טוקן עם aud אחר, וכל כניסה הייתה נופלת על
  // google_token_wrong_audience. ה-Android client רק צריך **להתקיים** ב-Cloud Console
  // (package + SHA-1), והוא לעולם אינו מועבר לתוסף.
  var CLIENT_ID = '459607487972-esu70diuu360tg1ji15o1n1tikf3npnb.apps.googleusercontent.com';
  var PLUGIN = 'GoogleSignIn';

  // ⏱️ לא המתנת-רשת אלא המתנה לאדם שבוחר חשבון — ולכן ארוך. אבל לא אינסופי: קריאה נייטיב
  // שלא חוזרת לעולם הייתה משאירה כפתור נעול בלי שום מוצא. ר' [[feedback_bound_every_network_await]].
  var SIGNIN_TIMEOUT_MS = 180000;

  // ── הגשר ────────────────────────────────────────────────────────────────────────────────
  // 🔑 **גם מההורה.** טופס ההרשמה של דף הנחיתה רץ ב-iframe (`fan-register.html?embed=1`
  // בתוך welcome.html). ה-iframe הוא same-origin, ו-nativePromise של ההורה עובד משם בדיוק
  // אותו דבר — בלי להסתמך על כך שהגשר מוזרק גם לתוך מסגרות-משנה.
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

  // שתי דרכי זיהוי, מאותו נימוק של app-banner.js: ה-UA קיים מהבקשה הראשונה, והגשר עשוי
  // להגיע מעט אחריו. **זיהוי-חסר כאן מחזיר את הבאג של §434**, ולכן עדיף לזהות ביתר.
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

  // ══ §453 — השער של §451 הוסר, ואייפון חזר לקבל Google ═════════════════════════════════
  //
  // **מה ש-§451 חסם, ולמה:** `npx cap add ios` הדפיס `Found 3 Capacitor plugins for ios`
  // וביניהם `@capawesome/capacitor-google-sign-in` — SPM אורז את **כל** התוספים לשתי
  // הפלטפורמות, ואין הפרדה לפי פלטפורמה. כלומר `hasPlugin()` חדל לענות על השאלה "האם
  // מישהו בחר בזה עבור המשטח הזה", ו-`mode()` היה מחזיר `'native'` על כפתור **שבור**:
  // לא היה iOS client ולא URL scheme, והלחיצה הייתה נגמרת בשגיאת תצורה.
  //
  // 🔑 **ומה שהשתנה ב-§453: הכפתור כבר אינו שבור.** נוצר iOS OAuth client (22.9.2026),
  // ו-`Info.plist` מחזיק `GIDClientID` ו-URL scheme. **הסיבה לחסימה התאדתה, ולכן השער
  // נמחק ולא רוכך** — תנאי שאיבד את נימוקו הוא קוד יתום שמישהו יצטרך לפענח בעוד חודשיים,
  // והפעם הנימוק כתוב כאן. ר' §447ז.
  //
  // ⚠️ **ומה שנשאר נכון מ-§451, והוא הדבר הקל ביותר לשבור:** `CLIENT_ID` שלמטה הוא
  // ה-**web client**, ואסור להחליף אותו ב-iOS client. הוא זה שנמסר ל-`initialize()`,
  // והוא ה-`aud` שהוורקר מאמת — **בשתי הפלטפורמות**. מזהה ה-iOS חי **רק** ב-`Info.plist`.
  //
  // ⚠️ **ואין כאן עוד הגנה מפני build לא-מוגדר:** באנדרואיד גרסה 1.0 פשוט לא נשאה את
  // התוסף ולכן קיבלה `blocked`, כלומר הגרסה עצמה הייתה השער. באייפון התוסף **תמיד** ארוז,
  // ולכן build עם `Info.plist` חסר יציג כפתור. הוא ייפול ל-`PROVIDER_CONFIGURATION_ERROR`
  // שמתורגם להודעה בעברית — לא למסך מת, אבל גם לא לכניסה.
  function mode() {
    var c = bridge();
    if (c && hasPlugin(c)) return 'native';
    return inApp() ? 'blocked' : 'web';
  }

  // ── הכניסה עצמה ─────────────────────────────────────────────────────────────────────────
  var initPromise = null;
  function ensureInit(c) {
    if (!initPromise) {
      // ⚠️ כשל מאפס את ההבטחה — אחרת initialize שנכשל פעם אחת היה נעול לתמיד.
      initPromise = c.nativePromise(PLUGIN, 'initialize', { clientId: CLIENT_ID })
        .catch(function (e) { initPromise = null; throw e; });
    }
    return initPromise;
  }

  function detailOf(e) {
    return String((e && (e.message || e.code)) || e || '');
  }

  // מחזיר { ok:true, credential } או { ok:false, reason, detail }. **לעולם אינו זורק.**
  // הקודים מגיעים מ-CustomExceptions.java של התוסף, והגשר מעביר את `code` כמו שהוא.
  async function signIn() {
    var c = bridge();
    if (!c || !hasPlugin(c)) return { ok: false, reason: 'unavailable' };
    try { await ensureInit(c); }
    catch (e) { return { ok: false, reason: 'init_failed', detail: detailOf(e) }; }

    var timer = null;
    try {
      var r = await Promise.race([
        c.nativePromise(PLUGIN, 'signIn', {}),
        new Promise(function (_, reject) {
          timer = setTimeout(function () { reject({ code: 'TIMEOUT' }); }, SIGNIN_TIMEOUT_MS);
        }),
      ]);
      if (!r || !r.idToken) return { ok: false, reason: 'empty_token' };
      return { ok: true, credential: String(r.idToken) };
    } catch (e) {
      var code = e && e.code;
      var reason =
        code === 'SIGN_IN_CANCELED'             ? 'canceled'   :
        code === 'NO_CREDENTIAL_AVAILABLE'      ? 'no_account' :
        code === 'PROVIDER_CONFIGURATION_ERROR' ? 'config'     :
        code === 'TIMEOUT'                      ? 'timeout'    : 'error';
      return { ok: false, reason: reason, detail: detailOf(e) };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── הכפתור ──────────────────────────────────────────────────────────────────────────────
  // ⚠️ מראה של הכפתור שהיה (GIS, filled_blue): הוראות-המותג של Google מחייבות את הלוגו הצבעוני
  // על רקע לבן, והטקסט בשליטתנו — כלומר כאן, בניגוד ל-GIS, הכיתוב **כן** יוצא כמו שביקשנו.
  var G_LOGO =
    '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>';

  // מה שהאדם יכול לעשות, לא קוד באנגלית. ביטול אינו מוצג בכלל — הוא החליט, אין מה לומר לו.
  var MSGS = {
    no_account: 'לא נמצא חשבון Google בטלפון. אפשר להוסיף חשבון בהגדרות הטלפון, או להמשיך בלי Google.',
    config:     'Google לא זמין כרגע בטלפון הזה. אפשר להמשיך בלי Google.',
  };
  var MSG_GENERIC = 'הכניסה עם Google לא הושלמה. נסו שוב.';

  function injectStyle() {
    if (document.getElementById('yzNgStyle')) return;
    var s = document.createElement('style');
    s.id = 'yzNgStyle';
    s.textContent =
      '.yz-ng{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}' +
      '.yz-ng-btn{display:flex;align-items:center;gap:10px;max-width:100%;height:42px;padding:0 4px 0 14px;' +
        'border:0;border-radius:21px;background:#1A73E8;color:#fff;font:500 15px/1 inherit;' +
        'font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;direction:rtl}' +
      '.yz-ng-btn:active{background:#1765CC}' +
      '.yz-ng-btn[disabled]{opacity:.7;cursor:default}' +
      '.yz-ng-txt{flex:1;text-align:center}' +
      // הלוגו בעיגול לבן — כמו ב-filled_blue של GIS. ב-RTL הוא בקצה השמאלי, כמו אצל Google בעברית.
      '.yz-ng-logo{order:2;display:flex;align-items:center;justify-content:center;width:34px;height:34px;' +
        'border-radius:50%;background:#fff;flex:none}' +
      '.yz-ng-msg{display:none;font-size:12.5px;line-height:1.6;text-align:center;color:#8A5A00;' +
        'background:#FEF3C7;border:1px solid #FCD98B;border-radius:10px;padding:8px 10px;max-width:320px}' +
      '.yz-ng-msg.show{display:block}' +
      // §439 — "מתחבר…" אינו אזהרה, ולכן אינו צהוב. בלי החיווי הזה המתנה נראית זהה לגמרי
      // לכישלון שקט, וזה בדיוק מה שדווח ("לוחץ, בוחר חשבון, ולא קורה כלום").
      '.yz-ng-msg.busy{color:#1E3A8A;background:#EEF2FF;border-color:#C7D2FE}';
    document.head.appendChild(s);
  }

  // opts: { label, width, onCredential(res) }
  // ⚠️ מצייר **לתוך host** (מחליף את תוכנו) — ולכן `host.childElementCount` נשאר האות
  // ש"הכפתור צויר", בדיוק כמו אחרי renderButton של GIS. הקיפול של §415ב נשען על זה.
  function renderButton(host, opts) {
    if (!host) return null;
    opts = opts || {};
    injectStyle();
    var wrap = document.createElement('div');
    wrap.className = 'yz-ng';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yz-ng-btn';
    btn.style.width = (opts.width || 300) + 'px';
    btn.innerHTML = '<span class="yz-ng-logo">' + G_LOGO + '</span>' +
                    '<span class="yz-ng-txt"></span>';
    btn.querySelector('.yz-ng-txt').textContent = opts.label || 'להמשיך עם Google';
    var msg = document.createElement('div');
    msg.className = 'yz-ng-msg';
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
      signIn().then(function (r) {
        busy = false;
        btn.disabled = false;
        msg.classList.remove('show', 'busy');
        if (r.ok) {
          if (typeof opts.onCredential === 'function') {
            try { opts.onCredential({ credential: r.credential, select_by: 'native' }); }
            catch (e) { console.error('native-google: onCredential נכשל', e); }
          }
          return;
        }
        // ── §439 — 🔴 **כשל נייטיב היה נרשם רק בקונסול, כלומר לא היה קיים** ───────────────
        // דווח חי (16.9): בורר החשבונות נפתח, המשתמש בחר חשבון, **והמסך חזר בלי כלום**.
        // בדיקת האירועים הראתה **אפס** `loginFail` באותה דקה — כי הכשל קרה **לפני** הקריאה
        // ל-`/google-login`, והערוץ היחיד שידע עליו היה `console.warn` במכשיר של מישהו אחר.
        // ⚠️ **גם `canceled` נרשם, ובכוונה:** ההבדל בין "האדם התחרט" לבין "נכשל בשקט אחרי
        // הבחירה" הוא כל האבחון כאן, ובלעדיו שניהם נראים כמו מסך שחזר לעצמו.
        // ⚠️ הרישום עטוף ב-try ואינו תלוי ב-logEvent: המודול נטען גם בדפים שאין בהם מדידה.
        try {
          if (typeof window.logEvent === 'function') {
            window.logEvent('loginFail', {
              channel: ('google:native:' + r.reason).slice(0, 50),
              blockId: (window._hbEnvTag || 'app').slice(0, 50),
            });
          }
        } catch (e) {}
        if (r.reason === 'canceled') return;
        // ⚠️ תמיד לקונסול — כישלון שקט הוא מה שהסתיר את §357. `config` כאן כמעט תמיד
        // פירושו Android client חסר / SHA-1 שגוי ב-Cloud Console, לא באג בקוד.
        console.warn('native-google: הכניסה נכשלה —', r.reason, r.detail || '');
        msg.textContent = MSGS[r.reason] || MSG_GENERIC;
        msg.classList.add('show');
      });
    });
    return wrap;
  }

  // ── §438 — מאיזה משטח הגיע הגולש: אפליקציה / קיצור-דרך במסך הבית / דפדפן ──────────────
  //
  //  🔑 **נולד משעה של ניחושים.** שני בודקים דיווחו "רואה כפתור Google באפליקציה", ולא
  //  הייתה שום דרך לדעת אם הם באמת באפליקציה — אין באירועים שדה שאומר זאת. התשובה הגיעה
  //  בסוף מצילום מסך של מסך ההגדרות של אנדרואיד ("גרסה: 1.1"). זה לא תהליך שאפשר לחזור
  //  עליו בכל שאלה, ובוודאי לא מול 15 בודקים. ר' [[feedback_state_not_event_detection]].
  //
  //  ⚠️ **'app' נבדק לפני 'pwa' ולא להפך**: ל-WebView אין display-mode סטנדרטי, ובמכשירים
  //  מסוימים הוא כן מדווח standalone — סדר הפוך היה מסמן את האפליקציה כקיצור-דרך.
  //  ⚠️ יושב כאן ולא בקובץ נפרד: זהו הקובץ היחיד שכבר נטען בארבעת הדפים שמודדים
  //  (welcome / home / fan-register / business), ולכן אין צורך בתגית script חמישית.
  function surface() {
    if (inApp()) return 'app';
    try {
      const std = (window.matchMedia && matchMedia('(display-mode: standalone)').matches)
                  || navigator.standalone === true;
      if (std) return 'pwa';
    } catch (e) {}
    return 'web';
  }

  // ⚠️ החשיפה מיידית — הדפים בודקים את mode() בזמן ציור המודאל. ר' §310/§312.
  window.YZNativeGoogle = {
    mode: mode,
    inApp: inApp,
    surface: surface,
    signIn: signIn,
    renderButton: renderButton,
  };
})();
