// ══ §446 — בדיקות לכפתור Apple במודאל ההתחברות של welcome.html ═══════════════════════════
//
// 🔑 **מריץ את הסקריפט הקלאסי האמיתי מתוך `welcome.html`**, לא עותק ולא snippet — הבלוק
// מחולץ מהקובץ החי ומורץ בתוך jsdom עם המרקאפ האמיתי של המודאל. `AppleID` מוזרק ומחזיר
// את **מבנה התשובה האמיתי של אפל**. כלומר כל הנתיב — render → init → לחיצה → signIn →
// callback — הוא הקוד שירוץ אצל האוהד. ר' [[feedback_verification_must_run_the_producer]].
//
// ⚠️ **מה שהבדיקה הזאת אינה מכסה, במפורש:** `heroAppleLogin` עצמה יושבת ב-
// `<script type="module">` שמייבא firebase מ-gstatic, ולא ניתן להריץ אותה כאן. מה שכן
// נבדק כאן הוא הגבול בין השניים — שהטוקן מגיע אליה, ושלחיצה מוקדמת נכנסת לתור במקום
// להיבלע. הצד השני נבדק בדפדפן. ר' [[feedback_absence_of_evidence]].
//
// הרצה:  node scratch_test_apple_login_modal.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));

const HTML = fs.readFileSync(path.join(__dirname, 'welcome.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

// ── חילוץ הבלוק הקלאסי שמחזיק את הרנדרר ────────────────────────────────────────────────
// ⚠️ **מעוגן בתוכן ולא במספר-בלוק**: מספר סידורי משתנה ברגע שמישהו מוסיף <script> בדף,
// והרנס שמריץ את הבלוק הלא-נכון "עובר" בירוק בלי לבדוק כלום.
// ר' [[feedback_test_harness_anchor_by_content]].
function classicBlockWith(marker) {
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(HTML))) {
    if (/\ssrc=/.test(m[1]) || /type=["']module["']/.test(m[1])) continue;
    if (m[2].includes(marker)) return m[2];
  }
  return null;
}
const CLASSIC = classicBlockWith('window.hbRenderAppleLoginBtn = function');
if (!CLASSIC) { console.error('✗ לא נמצא הבלוק הקלאסי שמחזיק את hbRenderAppleLoginBtn'); process.exit(1); }

// המרקאפ האמיתי של בלוק אפל, נחתך מהקובץ — לא נכתב מחדש כאן.
const MARKUP = (() => {
  const i = HTML.indexOf('<div class="as-login-host" id="asLoginHost">');
  if (i < 0) return null;
  const j = HTML.indexOf('</div>', HTML.indexOf('id="asLoginNote"'));
  return HTML.slice(i, HTML.indexOf('</div>', j + 6) + 6);
})();
if (!MARKUP || !MARKUP.includes('asLoginBtnHost')) { console.error('✗ לא נמצא המרקאפ של asLoginHost'); process.exit(1); }

const APPLE_SRC_FRAGMENT = 'appleid.cdn-apple.com';

// עזרי-סנכרון — מוצהרים כאן ולא בתחתית: `const` אינו מורם, וקריאה מוקדמת נופלת ב-TDZ.
let pending = 0, closed = false;

function makeEnv(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head></head><body>' +
    '<div class="login-modal-body">' + MARKUP +
    '<input id="heroPhoneInput"/><input id="heroCodeInput"/>' +
    '</div></body></html>',
    { runScripts: 'dangerously', url: 'https://yellowzone.co.il/welcome.html' });
  const w = dom.window;
  // 🐛 **`userAgent` כאפשרות של JSDOM מתעלמים ממנה ב-jsdom 30** — היא עברה ל-ResourceLoader.
  // הבדיקה "UA של האפליקציה" נכשלה בגללה והאשימה קוד תקין. ⚠️ הקוד הנבדק קורא
  // `navigator.userAgent`, ולכן זה המקום היחיד שצריך לדרוס.
  // ר' [[feedback_test_harness_anchor_by_content]] — הרנס ששיקר גרוע מהרנס שנפל.
  Object.defineProperty(w.navigator, 'userAgent', {
    value: opts.ua || 'Mozilla/5.0 (iPhone) Safari', configurable: true,
  });
  w._hbEnvTag = 'test';
  // §455 — jsdom אינו מספק AbortSignal.timeout; בלעדיו השליחה נופלת על הסביבה ולא על הקוד.
  if (!w.AbortSignal) w.AbortSignal = AbortSignal;
  if (!w.AbortSignal.timeout) w.AbortSignal.timeout = AbortSignal.timeout.bind(AbortSignal);
  w.logEvent = (t, d) => { w.__events = w.__events || []; w.__events.push({ t, d }); };
  if (opts.capacitor) w.Capacitor = {};
  if (opts.nativeMode) w.YZNativeGoogle = { mode: () => opts.nativeMode };
  // §452 — הגשר של אפל. **נעדר כברירת מחדל**: כל הבדיקות שנכתבו לפניו חייבות להמשיך
  // לתאר את ההתנהגות הקיימת, אחרת הנפילה-לאחור אינה נבדקת אלא מונחת.
  if (opts.apple) {
    w.__nativeCalls = [];
    w.YZNativeApple = {
      mode: () => (typeof opts.apple.mode === "function" ? opts.apple.mode() : opts.apple.mode),
      signIn: async (o) => { w.__nativeCalls.push(o); return opts.apple.result; },
    };
  }
  if (opts.appleId) w.AppleID = opts.appleId;
  // הבלוק הקלאסי מגדיר בעצמו כמה דברים גלובליים; מריצים אותו כמו שהוא.
  w.eval(CLASSIC);
  // 🐛 **אחרי ה-eval ולא לפניו.** הבלוק עצמו כותב `window.HB_LOGIN_TIMEOUT_MS = 8000`,
  // כלומר דריסה מוקדמת נמחקת — ובדיקת פסק-הזמן חיכתה 8 שניות וקראה לזה כישלון.
  // ⚠️ `HB_TIMEOUT_MSG` **לא** נדרס: נבדק מול הערך האמיתי שהדף מציג בפועל.
  if (opts.timeoutMs) w.HB_LOGIN_TIMEOUT_MS = opts.timeoutMs;
  return w;
}

const sdkTags = (w) =>
  Array.from(w.document.querySelectorAll('script')).filter(s => (s.src || '').includes(APPLE_SRC_FRAGMENT)).length;

const btnOf = (w) => w.document.querySelector('#asLoginBtnHost .hb-as-login-btn');
const hostOf = (w) => w.document.getElementById('asLoginHost');
const msgOf = (w) => w.document.getElementById('asLoginMsg');
const noteOf = (w) => w.document.getElementById('asLoginNote');

const RAW_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIwMDEifQ.sig';
function appleOk(token) {
  return { auth: { init: function (c) { this._cfg = c; }, signIn: async () => ({ authorization: { id_token: token } }) } };
}

// ══ 1. המקרה הרגיל: דפדפן, SDK קיים ═════════════════════════════════════════════════════
console.log('\n── 1. דפדפן רגיל, ה-SDK של אפל זמין ─────────────────────');
{
  const apple = appleOk(RAW_TOKEN);
  const w = makeEnv({ appleId: apple });
  w.hbRenderAppleLoginBtn();
  check('הכפתור צויר', !!btnOf(w));
  check('הבלוק נחשף (display:flex)', hostOf(w).style.display === 'flex', hostOf(w).style.display);
  check('הכיתוב "המשך עם Apple"', (btnOf(w).textContent || '').includes('המשך עם Apple'), btnOf(w).textContent);
  check('הלוגו של אפל בתוך הכפתור', !!btnOf(w).querySelector('svg'));

  const cfg = apple.auth._cfg || {};
  check('clientId = ה-Services ID', cfg.clientId === 'il.co.yellowzone.web', cfg.clientId);
  check('redirectURI מצביע על welcome.html', cfg.redirectURI === 'https://yellowzone.co.il/welcome.html', cfg.redirectURI);
  check('usePopup: true', cfg.usePopup === true);
  // ⚠️ במסך **כניסה** אין שדה שם למלא — בקשת scope שאין לה שימוש היא חיכוך בגיליון של אפל.
  check("scope = 'email' בלבד (בלי name)", cfg.scope === 'email', cfg.scope);

  // 🔑 קריאה חוזרת (המודאל נפתח שוב) אינה מציירת כפתור שני.
  w.hbRenderAppleLoginBtn();
  check('פתיחה חוזרת אינה יוצרת כפתור שני',
    w.document.getElementById('asLoginBtnHost').childElementCount === 1,
    w.document.getElementById('asLoginBtnHost').childElementCount);
}

// ══ 2. 🔴 בתוך האפליקציה — אין כפתור ואין ולו בקשה אחת ל-SDK ═════════════════════════════
// §434 מדד שכל popup ל-host שאינו שלנו יוצא לדפדפן החיצוני ומחזיר דף לבן.
console.log('\n── 2. 🔴 בתוך האפליקציה: מוסתר, ובלי לשלם על ה-SDK ──────');
// ⚠️ 🔑 **בלי `AppleID` מוזרק, במכוון.** `hbLoadAppleSdk` יוצאת מיד כשהספרייה כבר קיימת —
// כלומר עם AppleID מוזרק, "אפס בקשות ל-SDK" היה יוצא ירוק **גם אם הענף לא רץ בכלל**.
// זו בדיוק הגנה שמתקיימת תמיד, כלומר אינה הגנה. ר' [[feedback_guard_that_always_holds]].
[
  ['גשר Capacitor קיים', { capacitor: true }],
  ['UA של האפליקציה', { ua: 'Mozilla/5.0 (Linux; Android 14) YellowZoneApp/1.1' }],
  ["YZNativeGoogle.mode()='native'", { nativeMode: 'native' }],
  ["YZNativeGoogle.mode()='blocked'", { nativeMode: 'blocked' }],
].forEach(([label, opt]) => {
  const w = makeEnv(opt);
  w.hbRenderAppleLoginBtn();
  check(label + ' → אין כפתור', !btnOf(w));
  check(label + ' → הבלוק מוסתר', hostOf(w).style.display === 'none', hostOf(w).style.display);
  check(label + ' → אפס בקשות ל-SDK של אפל', sdkTags(w) === 0, sdkTags(w));
});
{
  // 🔑 **בקרת-נגד, ובלעדיה כל הקבוצה למעלה חסרת-ערך:** אותה סביבה בדיוק בלי סימן-אפליקציה
  // **כן** מזריקה את ה-SDK. זה מה שמוכיח ש-0 למעלה נמדד ולא נגזר מכך ששום דבר לא רץ.
  const w = makeEnv({ nativeMode: 'web' });
  w.hbRenderAppleLoginBtn();
  check("mode()='web' → ה-SDK כן מוזרק (בקרת-נגד)", sdkTags(w) === 1, sdkTags(w));
  check("mode()='web' בלי SDK → הבלוק עדיין מוסתר", hostOf(w).style.display !== 'flex', hostOf(w).style.display);
  const w2 = makeEnv({});   // בלי YZNativeGoogle כלל — נפילה-לאחור ל-UA, דפדפן רגיל
  w2.hbRenderAppleLoginBtn();
  check('בלי YZNativeGoogle, UA רגיל → ה-SDK מוזרק (בקרת-נגד ל-UA)', sdkTags(w2) === 1, sdkTags(w2));
}

// ══ 3. לחיצה → טוקן → ה-callback של המודול ══════════════════════════════════════════════
console.log('\n── 3. לחיצה מעבירה את הטוקן הגולמי למודול ───────────────');
{
  const w = makeEnv({ appleId: appleOk(RAW_TOKEN) });
  const got = [];
  w.heroAppleLogin = (t) => got.push(t);
  w.hbRenderAppleLoginBtn();
  btnOf(w).click();
  return_after(w, () => {
    check('heroAppleLogin נקרא פעם אחת', got.length === 1, got.length);
    check('🔑 הועבר ה-id_token הגולמי, בלי פענוח', got[0] === RAW_TOKEN, got[0]);
    check('הכפתור שוחרר בסוף', btnOf(w).disabled === false);
  });
}

// ══ 4. ביטול ע"י המשתמש אינו תקלה ואינו מקבל הודעה ══════════════════════════════════════
console.log('\n── 4. ביטול בגיליון של אפל — שקט מוחלט ──────────────────');
['popup_closed_by_user', 'user_cancelled_authorize'].forEach(code => {
  const apple = { auth: { init() {}, signIn: async () => { const e = new Error('x'); e.error = code; throw e; } } };
  const w = makeEnv({ appleId: apple });
  w.hbRenderAppleLoginBtn();
  btnOf(w).click();
  return_after(w, () => {
    check(code + ' → אין הודעה על המסך', !msgOf(w).classList.contains('show'), msgOf(w).textContent);
    check(code + ' → ההערה הקבועה נשארה', noteOf(w).style.display !== 'none');
    check(code + ' → לא נרשם אירוע כשל', !(w.__events || []).length, JSON.stringify(w.__events || []));
  });
});

// ══ 5. כשל אמיתי של ה-SDK — כן מדווח, וההערה מתחלפת בהודעה ══════════════════════════════
console.log('\n── 5. כשל אמיתי מול אפל ─────────────────────────────────');
{
  const apple = { auth: { init() {}, signIn: async () => { throw new Error('boom'); } } };
  const w = makeEnv({ appleId: apple });
  w.hbRenderAppleLoginBtn();
  btnOf(w).click();
  return_after(w, () => {
    check('הודעת אזהרה הוצגה', msgOf(w).classList.contains('show') && msgOf(w).classList.contains('warn'));
    check('§399ה — ההערה הקבועה הוחלפה ולא הצטרפה', noteOf(w).style.display === 'none');
    check('ההודעה מפנה למסלול שכן עובד', (msgOf(w).textContent || '').includes('הטלפון והקוד'));
    const ev = (w.__events || [])[0];
    check("נרשם loginFail עם channel 'apple:sdk'", ev && ev.t === 'loginFail' && ev.d.channel === 'apple:sdk', JSON.stringify(ev));
  });
}
{
  // תשובה בלי id_token — אין מה להעביר, ואין מה שהאדם יכול לתקן.
  const apple = { auth: { init() {}, signIn: async () => ({ authorization: {} }) } };
  const w = makeEnv({ appleId: apple });
  let called = 0; w.heroAppleLogin = () => called++;
  w.hbRenderAppleLoginBtn();
  btnOf(w).click();
  return_after(w, () => {
    check('תשובה בלי id_token → המודול לא נקרא', called === 0);
    check('תשובה בלי id_token → הודעת אזהרה', msgOf(w).classList.contains('warn'));
  });
}

// ══ 6. 🔑 §425 — לחיצה לפני שהמודול הגיע נכנסת לתור ══════════════════════════════════════
console.log('\n── 6. 🔑 התור: לחיצה מוקדמת לא נבלעת ────────────────────');
{
  const w = makeEnv({ appleId: appleOk(RAW_TOKEN) });
  w.hbRenderAppleLoginBtn();
  btnOf(w).click();
  return_after(w, () => {
    check('בזמן ההמתנה מוצג "רגע, טוענים…"', (msgOf(w).textContent || '').includes('רגע, טוענים'), msgOf(w).textContent);
    const got = [];
    w.heroAppleLogin = (t) => got.push(t);     // המודול מגיע באיחור
    setTimeout(() => {
      check('הלחיצה שוחזרה עם אותו טוקן', got.length === 1 && got[0] === RAW_TOKEN, JSON.stringify(got));
      check('הודעת ההמתנה נמחקה', !msgOf(w).classList.contains('show'), msgOf(w).textContent);
      check('וההערה הקבועה חזרה', noteOf(w).style.display !== 'none');
    }, 160);
  });
}
{
  // מודול שלא מגיע לעולם — פסק-זמן, ולא כפתור תלוי.
  const w = makeEnv({ appleId: appleOk(RAW_TOKEN), timeoutMs: 400 });
  w.heroShowLoginHelp = (r) => { w.__help = r; };
  w.hbRenderAppleLoginBtn();
  btnOf(w).click();
  setTimeout(() => {
    console.log('\n── 7. מודול שלא מגיע לעולם ──────────────────────────────');
    check('נקרא הסף האמיתי של מסלול הקוד', w.HB_LOGIN_TIMEOUT_MS === 400, w.HB_LOGIN_TIMEOUT_MS);
    check('הוצגה הודעת פסק-הזמן שהדף מגדיר',
      !!w.HB_TIMEOUT_MSG && (msgOf(w).textContent || '') === w.HB_TIMEOUT_MSG, msgOf(w).textContent);
    const ev = (w.__events || []).find(e => e.d && e.d.channel === 'moduleTimeout');
    check("נרשם loginFail עם channel 'moduleTimeout'", !!ev, JSON.stringify(w.__events));
    check('נפתח פאנל העזרה', w.__help === 'moduleTimeout', w.__help);
    nativeTests().then(done, (e) => { console.error(e); done(); });
  }, 700);
}

// ══ 8. §452 — המסלול הנייטיב (אפליקציית iOS) ═════════════════════════════════════════════
//
// 🔑 **מה שנבדק כאן הוא הגבול**, לא הכניסה עצמה: שהטוקן מהתוסף מגיע ל-`heroAppleLogin`
// בדיוק כמו הטוקן מה-SDK. מה שקורה אחריו חי במודול (firebase) ונבדק בדפדפן.
const NATIVE_OK = { ok: true, idToken: RAW_TOKEN };
const tick = (ms) => new Promise(r => setTimeout(r, ms || 0));

async function nativeTests() {
  console.log('\n── 8. §452 — מצב נייטיב: כפתור בלי SDK ──────────────────');
  {
    // ⚠️ `capacitor:true` + **בלי** appleId — כלומר אם הענף הנייטיב לא ירוץ, הבדיקה
    // תיפול על "אין כפתור" ולא תעבור בטעות.
    const w = makeEnv({ capacitor: true, ua: 'Mozilla/5.0 (iPhone) YellowZoneApp',
                        apple: { mode: 'native', result: NATIVE_OK } });
    w.heroAppleLogin = (t) => { w.__got = t; };
    w.hbRenderAppleLoginBtn();
    check('המכל נחשף למרות שאנחנו באפליקציה', hostOf(w).style.display === 'flex', hostOf(w).style.display);
    check('🔑 אפס בקשות ל-SDK של אפל', sdkTags(w) === 0, sdkTags(w));
    check('הכפתור צויר', !!btnOf(w));
    check('הכיתוב זהה לזה של הדפדפן', /Apple/.test((btnOf(w) || {}).textContent || ''));

    btnOf(w).click();
    await tick(); await tick();
    check('נקראה YZNativeApple.signIn', (w.__nativeCalls || []).length === 1, JSON.stringify(w.__nativeCalls));
    check("נתבקש EMAIL בלבד (מסך כניסה, אין שם למלא)",
          JSON.stringify((w.__nativeCalls[0] || {}).scopes) === JSON.stringify(['EMAIL']),
          JSON.stringify(w.__nativeCalls[0]));
    check('🔑 הטוקן הגיע ל-heroAppleLogin — אותו יעד של מסלול ה-web', w.__got === RAW_TOKEN, w.__got);
    check('אין הודעת שגיאה אחרי הצלחה', !msgOf(w).classList.contains('show'), msgOf(w).className);
  }

  console.log('\n── 8ב. ביטול שותק, שגיאה מדברת, שניהם נרשמים ────────────');
  {
    const w = makeEnv({ capacitor: true, apple: { mode: 'native', result: { ok: false, reason: 'canceled' } } });
    w.heroAppleLogin = () => {};
    w.hbRenderAppleLoginBtn();
    btnOf(w).click();
    await tick(); await tick();
    check('ביטול — אין הודעה', !msgOf(w).classList.contains('show'), msgOf(w).textContent);
    check('ביטול — ההערה הקבועה חזרה', noteOf(w).style.display === '', noteOf(w).style.display);
    check('ביטול — כן נרשם (§439)',
          (w.__events || []).some(e => e.d && e.d.channel === 'apple:native:canceled'), JSON.stringify(w.__events));
    check('הכפתור שוחרר', btnOf(w).disabled === false);
  }
  {
    const w = makeEnv({ capacitor: true, apple: { mode: 'native', result: { ok: false, reason: 'error', detail: 'boom' } } });
    w.heroAppleLogin = () => {};
    w.hbRenderAppleLoginBtn();
    btnOf(w).click();
    await tick(); await tick();
    check('שגיאה — ההודעה מוצגת', msgOf(w).classList.contains('show'), msgOf(w).className);
    check('שגיאה — מפנה לטלפון+קוד', /טלפון/.test(msgOf(w).textContent), msgOf(w).textContent);
    check('שגיאה — נרשמה',
          (w.__events || []).some(e => e.d && e.d.channel === 'apple:native:error'), JSON.stringify(w.__events));
  }

  console.log('\n── 8ג. 🔴 התוסף שנרשם באיחור ────────────────────────────');
  {
    let ready = false;
    const w = makeEnv({ capacitor: true, ua: 'Mozilla/5.0 (iPhone) YellowZoneApp',
                        apple: { mode: () => (ready ? 'native' : 'blocked'), result: NATIVE_OK } });
    w.heroAppleLogin = (t) => { w.__got = t; };
    w.hbRenderAppleLoginBtn();
    // 🐛 **לא `=== none` אלא `!== flex`, וזה לא ריכוך.** `.as-login-host` מוסתר ב-**CSS**
    // (`display:none` על המחלקה, welcome.html:1521), ולכן בזמן ההמתנה ה-style ה-inline
    // נשאר ריק — והמכל בכל זאת מוסתר בפועל. השאלה שבאמת נבדקת היא **האם נחשף**.
    check('בשנייה הראשונה — לא נחשף', hostOf(w).style.display !== 'flex', JSON.stringify(hostOf(w).style.display));
    ready = true;
    await tick(400);
    check('🔑 אחרי שהתוסף נרשם — הכפתור מופיע', hostOf(w).style.display === 'flex', hostOf(w).style.display);
    check('ועדיין אפס בקשות ל-SDK', sdkTags(w) === 0, sdkTags(w));
  }
  {
    // בקרת-נגד: באנדרואיד התוסף לעולם לא יגיע, וההמתנה חייבת להיגמר בהסתרה.
    const w = makeEnv({ capacitor: true, apple: { mode: 'blocked' } });
    w.hbRenderAppleLoginBtn();
    await tick(300);
    check('תוסף שלא מגיע → לא נחשף לעולם', hostOf(w).style.display !== 'flex', JSON.stringify(hostOf(w).style.display));
  }
  {
    // 🔑 **ובלי המודול — ההכרעה מיידית**, בדיוק ההתנהגות של §446ב.
    const w = makeEnv({ capacitor: true });
    w.hbRenderAppleLoginBtn();
    check('בלי native-apple.js — מוסתר מיד', hostOf(w).style.display === 'none', hostOf(w).style.display);
    check('ואפס בקשות ל-SDK', sdkTags(w) === 0, sdkTags(w));
  }

  // ══ 9. §455 — ה-authorizationCode נשלח לשרת, במקביל לכניסה ═══════════════════════════
  console.log('\n── 9. §455 — שליחת ה-authorizationCode ───────────────────');
  const spyFetch = (w) => {
    w.__ex = [];
    w.hbApiFetch = async (url, o) => { w.__ex.push({ url, body: JSON.parse(o.body) }); return { json: async () => ({ ok: true }) }; };
  };
  {
    const w = makeEnv({ appleId: { auth: { init() {}, signIn: async () => ({ authorization: { id_token: RAW_TOKEN, code: 'code-web' } }) } } });
    spyFetch(w);
    w.heroAppleLogin = (t) => { w.__got = t; };
    w.hbRenderAppleLoginBtn();
    await tick(50);
    btnOf(w).click();
    await tick(); await tick();
    const c = w.__ex.find((x) => x.url === '/apple-exchange');
    check('אתר: נקרא /apple-exchange', !!c, JSON.stringify(w.__ex));
    check('אתר: הקוד והטוקן', c && c.body.code === 'code-web' && c.body.idToken === RAW_TOKEN);
    check('אתר: redirectUri = welcome.html (זו שנמסרה ל-init)', c && c.body.redirectUri === 'https://yellowzone.co.il/welcome.html', c && c.body.redirectUri);
    check('🔑 הכניסה עצמה לא הושפעה — הטוקן הגיע ל-heroAppleLogin', w.__got === RAW_TOKEN, w.__got);
  }
  {
    const w = makeEnv({ capacitor: true, apple: { mode: 'native', result: Object.assign({}, NATIVE_OK, { authorizationCode: 'code-app' }) } });
    spyFetch(w);
    w.heroAppleLogin = (t) => { w.__got = t; };
    w.hbRenderAppleLoginBtn();
    btnOf(w).click();
    await tick(); await tick();
    const c = w.__ex.find((x) => x.url === '/apple-exchange');
    check('אפליקציה: נקרא /apple-exchange עם הקוד של התוסף', c && c.body.code === 'code-app', JSON.stringify(w.__ex));
    check('אפליקציה: בלי redirectUri', c && !('redirectUri' in c.body), c && JSON.stringify(c.body));
    check('אפליקציה: הכניסה לא הושפעה', w.__got === RAW_TOKEN, w.__got);
  }
  {
    // 🔴 "החלון המת" (§431): הלחיצה קודמת לטעינת המודול שמגדיר את hbApiFetch.
    const w = makeEnv({ capacitor: true, apple: { mode: 'native', result: Object.assign({}, NATIVE_OK, { authorizationCode: 'late' }) } });
    w.heroAppleLogin = () => {};
    w.hbRenderAppleLoginBtn();
    btnOf(w).click();
    await tick(50);
    spyFetch(w);                           // המודול מגיע באיחור
    await tick(450);
    check('hbApiFetch שהגיע באיחור — הקוד נשלח בכל זאת',
          (w.__ex || []).some((x) => x.url === '/apple-exchange' && x.body.code === 'late'), JSON.stringify(w.__ex));
  }
  {
    const w = makeEnv({ capacitor: true, apple: { mode: 'native', result: NATIVE_OK } });   // בלי code
    spyFetch(w);
    w.heroAppleLogin = () => {};
    w.hbRenderAppleLoginBtn();
    btnOf(w).click();
    await tick(); await tick();
    check('בלי code — לא נשלח כלום', w.__ex.length === 0, JSON.stringify(w.__ex));
  }
}

// ── עזר: ממתין לסבב timer אחד ולא "מקווה" ──────────────────────────────────────────────
function return_after(w, fn) { pending++; setTimeout(() => { fn(); if (--pending === 0 && closed) report(); }, 60); }
function done() { closed = true; if (pending === 0) report(); }
function report() {
  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עוברות, ' + fail + ' נכשלות');
  process.exit(fail ? 1 : 0);
}
setTimeout(() => { if (!closed) { console.log('\n⏱ הבדיקה לא נסגרה'); process.exit(1); } }, 5000);
