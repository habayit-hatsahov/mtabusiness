// ══ §448 — בדיקות ל-native-apple.js ══════════════════════════════════════════════════════
//
// 🔑 **מריץ את `native-apple.js` האמיתי** בתוך jsdom, עם גשר Capacitor מדומה שמחזיר את
// **מבנה התשובה האמיתי של התוסף** (`{ authorizationCode, idToken, user, email, givenName,
// familyName }` — נלקח מ-`definitions.d.ts` של `@capawesome/capacitor-apple-sign-in@0.1.4`).
// לא snippet ולא עותק. ר' [[feedback_verification_must_run_the_producer]].
//
// ⚠️ **מה שהבדיקה הזאת אינה יכולה לכסות, במפורש:**
//   1. **קוד הביטול האמיתי של התוסף ב-iOS.** `CustomError.code` אינו בקבצים שה-npm מפרסם.
//      כאן נבדקות שתי הווריאציות הידועות + הנפילה-לאחור על הטקסט; **מה שיקרה במכשיר
//      אמיתי נשאר לאימות על מכשיר.** ר' [[feedback_absence_of_evidence]].
//   2. **פסק-הזמן של 180 שניות** — לא ניתן להרצה בזמן סביר, ולא נבדק כאן.
//
// הרצה:  node scratch_test_native_apple.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));

const SRC = fs.readFileSync(path.join(__dirname, 'native-apple.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

// ── בניית סביבה ─────────────────────────────────────────────────────────────────────────
// opts: { ua, plugin (bool), onSignIn(payload) -> result | throws, parentBridge (bool) }
//
// 🐛 **`userAgent` של jsdom אינו ניתן לשינוי דרך ההגדרות בגרסה שמותקנת כאן** — זה נתפס
// ב-§446 והפיל בדיקה שנראתה ירוקה. לכן הוא נדרס ישירות על `navigator` אחרי הבנייה.
// ר' [[feedback_test_harness_anchor_by_content]].
function build(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="host"></div></body></html>',
    { runScripts: 'dangerously', pretendToBeVisual: true });
  const win = dom.window;

  Object.defineProperty(win.navigator, 'userAgent', {
    value: opts.ua || 'Mozilla/5.0 (iPhone) Safari',
    configurable: true,
  });

  const calls = [];
  if (opts.plugin || opts.bridgeOnly) {
    const cap = {
      nativePromise: function (plugin, method, payload) {
        calls.push({ plugin: plugin, method: method, payload: payload });
        if (method === 'signIn' && typeof opts.onSignIn === 'function') {
          try { return Promise.resolve(opts.onSignIn(payload)); }
          catch (e) { return Promise.reject(e); }
        }
        return Promise.resolve({});
      },
      Plugins: opts.plugin ? { AppleSignIn: {} } : {},
      isPluginAvailable: function (n) { return !!opts.plugin && n === 'AppleSignIn'; },
    };
    if (opts.parentBridge) {
      // מדמה את מצב ה-iframe: אין Capacitor על החלון עצמו, יש על ההורה.
      Object.defineProperty(win, 'parent', { value: { Capacitor: cap }, configurable: true });
    } else {
      win.Capacitor = cap;
    }
  }

  const events = [];
  win.logEvent = function (name, data) { events.push({ name: name, data: data }); };

  const s = win.document.createElement('script');
  s.textContent = SRC;
  win.document.head.appendChild(s);

  return { win: win, calls: calls, events: events, api: win.YZNativeApple };
}

const REAL_RESULT = {
  authorizationCode: 'c-abc',
  idToken: 'eyJhbGciOiJSUzI1NiJ9.payload.sig',
  user: '001234.abcdef.1234',
  email: 'fan@example.com',
  givenName: 'רון',
  familyName: 'לוי',
};

const tick = () => new Promise(r => setTimeout(r, 0));

(async function main() {

console.log('\n── 1. mode() — שלושת המצבים ──');
{
  const web = build({ ua: 'Mozilla/5.0 (iPhone) Safari' });
  check("דפדפן רגיל → 'web'", web.api.mode() === 'web', web.api.mode());

  const blocked = build({ ua: 'Mozilla/5.0 (Linux; Android) YellowZoneApp' });
  check("אפליקציה בלי התוסף → 'blocked'", blocked.api.mode() === 'blocked', blocked.api.mode());

  const native = build({ ua: 'Mozilla/5.0 (iPhone) YellowZoneApp', plugin: true });
  check("אפליקציה עם התוסף → 'native'", native.api.mode() === 'native', native.api.mode());

  // 🔑 זו ההחלטה של 22.9 שנבדקת כאן ישירות: אפליקציית אנדרואיד (גוגל נייטיב, בלי תוסף
  // אפל) **חייבת** להחזיר blocked — כלומר אין כפתור אפל, ולא כפתור ששולח לדף לבן.
  const androidApp = build({ ua: 'Mozilla/5.0 (Linux; Android 14) YellowZoneApp', bridgeOnly: true });
  check('גשר קיים אך בלי תוסף אפל (= אנדרואיד היום) → blocked',
    androidApp.api.mode() === 'blocked', androidApp.api.mode());
}

console.log('\n── 2. הגשר נמצא גם מההורה (מצב ה-iframe) ──');
{
  const iframed = build({ ua: 'Mozilla/5.0 (iPhone) YellowZoneApp', plugin: true, parentBridge: true });
  check("Capacitor על ההורה בלבד → 'native'", iframed.api.mode() === 'native', iframed.api.mode());
}

console.log('\n── 3. signIn — מבנה התשובה האמיתי ──');
{
  const t = build({ plugin: true, onSignIn: () => REAL_RESULT });
  const r = await t.api.signIn();
  check('ok=true', r.ok === true, JSON.stringify(r));
  check('הטוקן נקרא מ-idToken', r.idToken === REAL_RESULT.idToken, r.idToken);
  check('email/givenName/familyName מועברים', r.email === 'fan@example.com' && r.givenName === 'רון', JSON.stringify(r));
  check('user (ה-sub היציב) מועבר', r.user === REAL_RESULT.user, r.user);
  // §455 — עד §455 הגשר **השמיט** את השדה, ולכן אף קורא לא יכל לשלוח אותו לשרת.
  check('🔑 §455 — authorizationCode מועבר (ביטול במחיקת חשבון)',
    r.authorizationCode === REAL_RESULT.authorizationCode, r.authorizationCode);
}

console.log('\n── 4. 🔴 ההגנה על שם-השדה — identityToken אינו idToken ──');
{
  // התיעוד שלנו הניח `identityToken`; התוסף מחזיר `idToken`. אם מישהו יחליף בעתיד את
  // הקריאה לשם הישן, כניסה מוצלחת תיראה ככישלון. הבדיקה הזאת היא הגלאי.
  const t = build({ plugin: true, onSignIn: () => ({ identityToken: 'x', authorizationCode: 'c' }) });
  const r = await t.api.signIn();
  check('תשובה עם identityToken בלבד → empty_token (ולא ok)', r.ok === false && r.reason === 'empty_token', JSON.stringify(r));
}

console.log('\n── 5. 🔑 אין קריאה ל-initialize (היא Android/Web בלבד) ──');
{
  const t = build({ plugin: true, onSignIn: () => REAL_RESULT });
  await t.api.signIn();
  const inits = t.calls.filter(c => c.method === 'initialize');
  check('אפס קריאות ל-initialize', inits.length === 0, JSON.stringify(t.calls.map(c => c.method)));
  check('נקראה signIn על התוסף AppleSignIn',
    t.calls.some(c => c.plugin === 'AppleSignIn' && c.method === 'signIn'), JSON.stringify(t.calls));
}

console.log('\n── 6. scopes ──');
{
  const a = build({ plugin: true, onSignIn: () => REAL_RESULT });
  await a.api.signIn();
  check("ברירת מחדל ['EMAIL']",
    JSON.stringify(a.calls[0].payload.scopes) === JSON.stringify(['EMAIL']), JSON.stringify(a.calls[0].payload));

  const b = build({ plugin: true, onSignIn: () => REAL_RESULT });
  await b.api.signIn({ scopes: ['EMAIL', 'FULL_NAME'] });
  check('ניתן לבקש גם FULL_NAME (מסלול ההרשמה)',
    JSON.stringify(b.calls[0].payload.scopes) === JSON.stringify(['EMAIL', 'FULL_NAME']), JSON.stringify(b.calls[0].payload));

  check('nonce אינו נשלח כשלא נמסר', a.calls[0].payload.nonce === undefined, JSON.stringify(a.calls[0].payload));
}

console.log('\n── 7. ביטול מזוהה בשלוש הצורות הידועות ──');
{
  for (const err of [{ code: 'SIGN_IN_CANCELED' }, { code: '1001' }, { message: 'The operation was canceled.' }]) {
    const t = build({ plugin: true, onSignIn: () => { throw err; } });
    const r = await t.api.signIn();
    check("ביטול → reason 'canceled'  [" + (err.code || err.message) + ']',
      r.ok === false && r.reason === 'canceled', JSON.stringify(r));
  }
}

console.log('\n── 8. 🔴 קוד לא-מוכר אינו נבלע כביטול ──');
{
  const t = build({ plugin: true, onSignIn: () => { throw { code: 'SOMETHING_ELSE', message: 'boom' }; } });
  const r = await t.api.signIn();
  check("שגיאה לא-מוכרת → reason 'error' (ולא canceled)", r.ok === false && r.reason === 'error', JSON.stringify(r));
}

console.log('\n── 9. התוסף חסר → unavailable, בלי זריקה ──');
{
  const t = build({ ua: 'Mozilla/5.0 (Linux; Android) YellowZoneApp', bridgeOnly: true });
  const r = await t.api.signIn();
  check("reason 'unavailable'", r.ok === false && r.reason === 'unavailable', JSON.stringify(r));
}

console.log('\n── 10. 🗑️ §454 — הקובץ הוא גשר, לא רכיב ממשק ──');
{
  // ⚠️ **הבדיקות שהיו כאן בדקו `renderButton`, והיא נמחקה** — לשלושת המשטחים יש
  // מרקאפ כפתור משלהם, ולכן היא לא הייתה "עוד לא בשימוש" אלא "לעולם לא תהיה" (§450/§452).
  // מה שהחליף אותן הוא נעילה על **משטח ה-API**: פונקציה חדשה שתיווסף כאן בלי סיבה
  // תישבר, וכך גם מרקאפ/CSS שיחזרו פנימה. ר' §447ז.
  const t = build({ plugin: true, onSignIn: () => REAL_RESULT });
  const keys = Object.keys(t.api).sort();
  check('משטח ה-API הוא בדיוק mode/inApp/signIn',
        JSON.stringify(keys) === JSON.stringify(['inApp', 'mode', 'signIn']), JSON.stringify(keys));
  check('🗑️ renderButton אינה קיימת', t.api.renderButton === undefined);

  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('אין מרקאפ בקוד (createElement)', !/createElement/.test(CODE));
  check('אין CSS בקוד (yz-na)', !/yz-na/.test(CODE));
  check('אין הזרקת style', !/injectStyle|<style/.test(CODE));
  // 🔑 והרישום של loginFail ירד יחד איתה — הוא כבר היה אצל שני הקוראים.
  check('אין logEvent בקובץ (הרישום אצל הקוראים)', !/logEvent/.test(CODE));
  // ⚠️ אבל הסיפור כן נשאר, אחרת הקורא הבא יוסיף אותה מחדש.
  check('ההיסטוריה תועדה (§454 בהערות)', /§454/.test(SRC) && /renderButton/.test(SRC));
}
console.log('\n── 12. 🔴 הקובץ אינו מחזיק עותק חמישי של ה-Services ID ──');
{
  // §446ו — הערך חי ב-4 מקומות נעולים. עותק נוסף כאן היה נשכח בדיוק כמו `apple-live-test.html`.
  // ובמסלול הנייטיב הוא גם **שגוי מהותית**: ה-aud שם הוא ה-Bundle ID.
  //
  // 🔑 **ההשוואה מסירה הערות תחילה** — זו קונבנציה קיימת בפרויקט (§421), וכאן היא נדרשה
  // בפועל: ההערה בראש `native-apple.js` **מצטטת** את `APPLE_CLIENT_IDS` כדי להסביר למה
  // אין כאן clientId, והבדיקה הנאיבית נכשלה על הציטוט. מחיקת ההערה הייתה "מתקנת" את
  // הבדיקה במחיר המידע — הסרת ההערות היא התיקון הנכון.
  // ⚠️ אין URL-ים בקובץ, ולכן `//` הוא תמיד תחילת הערה ולעולם לא חלק ממחרוזת.
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('אין il.co.yellowzone.web בקוד (מחוץ להערות)', !/il\.co\.yellowzone\.web/.test(CODE));
  check('ההערה כן מסבירה את ה-aud (המידע לא נמחק)', /il\.co\.yellowzone\.app/.test(SRC));
  check('אין קריאה ל-initialize בקוד עצמו', !/'initialize'|"initialize"/.test(CODE));
}

console.log('\n── 13. הבדיקה יודעת להיכשל ──');
{
  // [[feedback_guard_that_always_holds]] — בדיקה שלא נכשלה אף פעם אינה בדיקה.
  // כאן נשבר במכוון מבנה התשובה, ומוודאים שהגלאי של סעיף 4 באמת תופס.
  const t = build({ plugin: true, onSignIn: () => ({ idToken: '' }) });
  const r = await t.api.signIn();
  check('טוקן ריק נתפס כ-empty_token', r.ok === false && r.reason === 'empty_token', JSON.stringify(r));
}

console.log('\n' + '─'.repeat(60));
console.log(fail === 0 ? `✅ הכל עבר — ${pass}/${pass + fail}` : `❌ ${fail} נכשלו מתוך ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);

})();
