// ══════════════════════════════════════════════════════════════════════════════════════════
//  native-push.js — הרשמה לפוש נייטיב מתוך האפליקציה  (§420ג)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  למה הקובץ הזה קיים: Web Push (`home.html`, `enablePushNotifications`) **אינו עובד בתוך
//  האפליקציה**. Android WebView אינו תומך ב-Push API כלל — `reg.pushManager` פשוט לא קיים
//  שם. באייפון Web Push עובד רק אחרי התקנה ידנית למסך הבית, ועברית מוצגת בו כ-"?" (§52).
//  זו כל הסיבה שנבנתה אפליקציה מלכתחילה.
//
//  אותו דפוס בדיוק כמו `app-banner.js` / `sections-policy.js` / `hours.js` — <script src>
//  רגיל שנחשף על `window`, לא module, כדי שגם קוד שאינו module יוכל לקרוא לו.
//
// ── 🔑 הממצא שקבע את כל העיצוב ────────────────────────────────────────────────────────────
//
//  האתר רץ בתוך האפליקציה מהדומיין החי (`server.url`), ולא כנכסים ארוזים. השאלה הייתה אם
//  אפשר בכלל להגיע משם לתוסף נייטיב. **נבדק במקור של Capacitor 8, לא הונח:**
//
//  ✅ הגשר כן מוזרק לדומיין המרוחק — `Bridge.java:242` מוסיף את `server.url` ל-
//     `allowedOriginRules`, ו-`addDocumentStartJavaScript` + `addWebMessageListener` חלים
//     בדיוק על המקורות האלה.
//
//  ❌ **אבל `Capacitor.Plugins.PushNotifications` לא קיים כאן.** `native-bridge.js` *קורא*
//     את `cap.Plugins` ולעולם אינו ממלא אותו — הוא מאוכלס ע"י ה-JS של כל תוסף, שנארז
//     באפליקציות רגילות ואינו קיים אצלנו.
//
//  ✅ ומה שכן נחשף ישירות מ-`native-bridge.js`, וזה כל מה שצריך:
//     `cap.nativePromise(plugin, method, opts)` · `cap.addListener(plugin, event, cb)` ·
//     `cap.getPlatform()`.
//
//  ⚠️ **`Capacitor.isPluginAvailable()` תמיד יחזיר `false` אצלנו — אסור להשתמש בו.**
//  הוא ממומש כ-`hasOwnProperty(cap.Plugins, name)` (native-bridge.js:841), ו-`cap.Plugins`
//  ריק כאן לנצח. בדיקה תמימה דרכו הייתה מכבה את הפוש בשקט בכל מכשיר, ונראית נכונה לגמרי
//  בקוד. ר' [[feedback_guard_that_always_holds]].
//
// ══════════════════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const INSTALL_KEY = 'yz_push_install';
  // הטוקן מגיע באירוע ולא בהחזרה של register(). אירוע שלא נורה אינו נכשל — הוא פשוט
  // לא קורה, וההמתנה עליו נתקעת לנצח. ר' [[feedback_bound_every_network_await]].
  const REGISTER_TIMEOUT_MS = 15000;

  function cap() {
    return (typeof window !== 'undefined' && window.Capacitor) || null;
  }

  // 🔑 הבדיקה היא על הפונקציות עצמן ולא על isPluginAvailable/Plugins — ר' ההערה בראש.
  function available() {
    const c = cap();
    return !!(c && typeof c.nativePromise === 'function' && typeof c.addListener === 'function');
  }

  function platform() {
    const c = cap();
    try { return (c && typeof c.getPlatform === 'function') ? c.getPlatform() : 'web'; }
    catch (e) { return 'web'; }
  }

  // ── מזהה התקנה יציב ────────────────────────────────────────────────────────────────────
  // 🔑 **המפתח במפה הוא מזהה-ההתקנה, לא הטוקן.** טוקני FCM מתחלפים (רוטציה יזומה של גוגל,
  // ניקוי נתוני-אפליקציה, שחזור-גיבוי). מפתח לפי הטוקן היה מייצר רשומה חדשה בכל רוטציה
  // ומשאיר את הישנה כזבל שאיש לא מנקה — בדיוק כמו ש-`pushSubscriptions` ממופה לפי endpoint
  // ולא לפי המנוי כולו.
  function installId() {
    try {
      let id = localStorage.getItem(INSTALL_KEY);
      if (!id) {
        id = 'i' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        localStorage.setItem(INSTALL_KEY, id);
      }
      return id;
    } catch (e) {
      // אחסון חסום (מצב פרטי/הגדרה נוקשה) — מזהה חד-פעמי. הרשומה תיווצר מחדש בכל פתיחה,
      // וזה עדיין עדיף על היעדר הרשמה. הניקוי של טוקנים מתים בשרת מטפל בשאריות.
      return 'tmp' + Math.random().toString(36).slice(2, 10);
    }
  }

  // ── הרשאה ──────────────────────────────────────────────────────────────────────────────
  // ⚠️ **לא לדלג על checkPermissions כש-granted.** באנדרואיד 13+ ההרשאה היא הרשאת-ריצה
  // אמיתית, ו-requestPermissions על הרשאה שכבר ניתנה מחזיר מיד — אבל על הרשאה ש**נדחתה**
  // הוא אינו מציג דבר, ו-`granted` לעולם לא יגיע. הבחנה בין השתיים היא ההבדל בין
  // "המשתמש עוד לא נשאל" לבין "המשתמש אמר לא", ורק הראשון שווה בקשה.
  async function ensurePermission() {
    const c = cap();
    let st;
    try { st = await c.nativePromise('PushNotifications', 'checkPermissions', {}); }
    catch (e) { return { ok: false, reason: 'check_failed' }; }

    if (st && st.receive === 'granted') return { ok: true };
    if (st && st.receive === 'denied') return { ok: false, reason: 'denied' };

    let res;
    try { res = await c.nativePromise('PushNotifications', 'requestPermissions', {}); }
    catch (e) { return { ok: false, reason: 'request_failed' }; }
    if (res && res.receive === 'granted') return { ok: true };
    return { ok: false, reason: 'declined' };
  }

  // ── ההרשמה עצמה ────────────────────────────────────────────────────────────────────────
  // ⚠️ **המאזין נרשם לפני register(), ולא אחריו.** `register()` מחזיר void ומפעיל את
  // התהליך; הטוקן מגיע באירוע `registration`. רישום המאזין אחרי הקריאה הוא מרוץ שמפסידים
  // בו דווקא במכשירים המהירים.
  function awaitToken() {
    const c = cap();
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        try { if (hOk && hOk.remove) hOk.remove(); } catch (e) {}
        try { if (hErr && hErr.remove) hErr.remove(); } catch (e) {}
        clearTimeout(timer);
        resolve(v);
      };
      const hOk = c.addListener('PushNotifications', 'registration', (t) => {
        finish({ ok: true, token: (t && (t.value || t.token)) || '' });
      });
      const hErr = c.addListener('PushNotifications', 'registrationError', (e) => {
        finish({ ok: false, reason: 'registration_error', detail: (e && (e.error || e.message)) || '' });
      });
      const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), REGISTER_TIMEOUT_MS);

      // ⚠️ כשל של register() עצמו אינו יורה registrationError — הוא דוחה את ה-Promise.
      // בלי ה-catch הזה הכשל היה נבלע וההמתנה הייתה נגמרת רק בפסק-הזמן, 15 שניות אחרי
      // שכבר ידענו שנכשל.
      c.nativePromise('PushNotifications', 'register', {})
        .catch((e) => finish({ ok: false, reason: 'register_failed', detail: String(e && e.message || e) }));
    });
  }

  // ── ה-API הציבורי ──────────────────────────────────────────────────────────────────────
  //
  //  register() מחזיר { ok, token, platform, installId, reason }.
  //  ⚠️ **הוא אינו כותב ל-Firestore בעצמו, ובכוונה.** הקובץ הזה הוא script רגיל ואין לו
  //  גישה ל-SDK; הכתיבה נעשית בדף שכבר מחזיק db ו-memberId. אותה הפרדה כמו ב-app-banner.js.
  //
  //  ⚠️ **אינו מבקש הרשאה מעצמו בטעינה.** בקשת-הרשאה שקופצת בלי הקשר היא הדרך הבטוחה
  //  לקבל "לא" — הקריאה חייבת לבוא מלחיצה של המשתמש.
  async function register() {
    if (!available()) return { ok: false, reason: 'no_bridge' };
    const perm = await ensurePermission();
    if (!perm.ok) return { ok: false, reason: perm.reason };

    const res = await awaitToken();
    if (!res.ok) return res;
    if (!res.token) return { ok: false, reason: 'empty_token' };

    return {
      ok: true,
      token: res.token,
      platform: platform(),
      installId: installId(),
    };
  }

  // האם המשתמש כבר אישר, בלי לבקש כלום — לצורך תצוגת מצב הכפתור.
  async function permissionState() {
    if (!available()) return 'unavailable';
    try {
      const st = await cap().nativePromise('PushNotifications', 'checkPermissions', {});
      return (st && st.receive) || 'unknown';
    } catch (e) { return 'unknown'; }
  }

  window.YZNativePush = {
    available: available,
    platform: platform,
    installId: installId,
    permissionState: permissionState,
    register: register,
  };
})();
