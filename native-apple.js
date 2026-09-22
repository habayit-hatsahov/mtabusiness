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

  // ── 🗑️ §454 — `renderButton` נמחקה, ובמכוון אין לה מחליף ─────────────────────────────
  //
  // היא נכתבה ב-§448 כמקבילה ל-`native-google.js`, ושם היא **חיונית**: הכפתור של GIS
  // מצויר ע"י גוגל ואי-אפשר להשתמש בו במסלול הנייטיב, ולכן צריך כפתור משלנו.
  //
  // 🔑 **אצל אפל ההנחה הזאת לא חלה, ו-§450/§452 גילו זאת בפועל:** לשלושת המשטחים
  // (`fan-register`, `business`, `welcome`) יש **מרקאפ כפתור משלהם** שכבר קיים בדף —
  // `.hb-as-btn` ו-`.hb-as-login-btn`. מה שהתחלף במעבר לנייטיב הוא **מי מטפל בלחיצה**,
  // לא צורת הכפתור. ציור מחדש היה דורס את `.hb-as-cap` ואת כל הכיתובים שנכתבים אליו.
  //
  // ⚠️ **ולכן היא לא הייתה "עוד לא בשימוש" אלא "לעולם לא תהיה"** — מרקאפ רביעי שאיש
  // אינו מצייר, סגנון CSS שאיש אינו מזריק, ושלוש מחרוזות הודעה שכפולות למה שכבר קיים
  // בקוראים. עם המחיקה ירדו גם `A_LOGO`, `MSGS`, `MSG_GENERIC` ו-`injectStyle`.
  // ר' §447ז — קוד יתום נמחק, והנימוק נשאר.
  //
  // 🔑 **ומה שנשאר הוא בדיוק מה שצריך:** הקובץ הזה הוא **גשר**, לא רכיב ממשק.
  // ⚠️ הרישום של `loginFail` עבר עם המחיקה אל הקוראים — הוא כבר היה שם משני הצדדים.

  // ⚠️ החשיפה מיידית — הדפים בודקים את mode() בזמן ציור המודאל. ר' §310/§312/§425.
  window.YZNativeApple = {
    mode: mode,
    inApp: inApp,
    signIn: signIn,
  };
})();
