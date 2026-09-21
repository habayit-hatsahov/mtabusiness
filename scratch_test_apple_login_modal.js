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
  w.logEvent = (t, d) => { w.__events = w.__events || []; w.__events.push({ t, d }); };
  if (opts.capacitor) w.Capacitor = {};
  if (opts.nativeMode) w.YZNativeGoogle = { mode: () => opts.nativeMode };
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
    done();
  }, 700);
}

// ── עזר: ממתין לסבב timer אחד ולא "מקווה" ──────────────────────────────────────────────
function return_after(w, fn) { pending++; setTimeout(() => { fn(); if (--pending === 0 && closed) report(); }, 60); }
function done() { closed = true; if (pending === 0) report(); }
function report() {
  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עוברות, ' + fail + ' נכשלות');
  process.exit(fail ? 1 : 0);
}
setTimeout(() => { if (!closed) { console.log('\n⏱ הבדיקה לא נסגרה'); process.exit(1); } }, 5000);
