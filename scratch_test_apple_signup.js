// §424 — בדיקות למודול הלקוח apple-signup.js.
//
// 🔑 מריץ את הקובץ האמיתי בתוך DOM, ומזריק AppleID מדומה שמחזיר את **מבנה התשובה
// האמיתי של אפל** בשלושת המצבים שקורים בפועל. כלומר כל הנתיב — init → כפתור →
// onAuthorized → מילוי שדות — הוא הקוד שירוץ אצל הנרשם.
// ר' [[feedback_verification_must_run_the_producer]].
//
// הרצה:  node scratch_test_apple_signup.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));

const SRC = fs.readFileSync(path.join(__dirname, 'apple-signup.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}

function b64url(o) {
  return Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fakeToken(payload) {
  return b64url({ alg: 'RS256', kid: 't' }) + '.' + b64url(payload) + '.c2ln';
}

const RESP = {
  first: {
    authorization: { id_token: fakeToken({ sub: 'a.1', email: 'Fan@Example.com', email_verified: 'true' }) },
    user: { name: { firstName: 'ישראל', lastName: 'ישראלי' }, email: 'Fan@Example.com' },
  },
  // ⚠️ המצב השכיח: מהפעם השנייה ואילך אפל **אינה שולחת `user` בכלל**.
  repeat: {
    authorization: { id_token: fakeToken({ sub: 'a.1', email: 'Fan@Example.com', email_verified: 'true' }) },
  },
  relay: {
    authorization: { id_token: fakeToken({
      sub: 'a.1', email: 'zzz@privaterelay.appleid.com', email_verified: 'true', is_private_email: 'true' }) },
    user: { name: { firstName: 'ישראל', lastName: 'ישראלי' } },
  },
};

// ── סביבה ────────────────────────────────────────────────────────────────────────────
function makePage(hosts, opts) {
  opts = opts || {};
  const nativeCalls = [];
  const body = hosts.map((k) =>
    '<div id="asHost' + k + '"></div>' +
    '<input id="firstName' + k + '"><input id="lastName' + k + '"><input id="email' + k + '">'
  ).join('');
  const dom = new JSDOM('<!doctype html><body>' + body + '</body>', { runScripts: 'outside-only' });
  const w = dom.window;
  // jsdom אינו מספק AbortSignal.timeout — attach משתמשת בו, ובלעדיו הבדיקה הייתה
  // נופלת על הסביבה ולא על הקוד.
  if (!w.AbortSignal) w.AbortSignal = AbortSignal;
  if (!w.AbortSignal.timeout) w.AbortSignal.timeout = AbortSignal.timeout.bind(AbortSignal);
  // 🐛 **`userAgent` כאפשרות של JSDOM מתעלמים ממנה מגרסה 30** — היא עברה ל-ResourceLoader.
  // דריסה ישירה היא המקום היחיד שהקוד הנבדק באמת קורא.
  // ר' [[feedback_test_harness_anchor_by_content]] — הרנס ששיקר גרוע מהרנס שנפל.
  if (opts.ua) Object.defineProperty(w.navigator, 'userAgent', { value: opts.ua, configurable: true });
  if (opts.capacitor) w.Capacitor = {};
  if (opts.nativeMode) w.YZNativeGoogle = { mode: () => opts.nativeMode };
  // §450 — הגשר של אפל. ⚠️ **נעדר בכוונה כברירת מחדל**: כל הבדיקות שנכתבו לפניו חייבות
  // להמשיך לתאר את ההתנהגות הקיימת, אחרת הנפילה-לאחור אינה נבדקת אלא מונחת.
  if (opts.apple) {
    w.YZNativeApple = {
      mode: () => opts.apple.mode,
      signIn: async (o) => { nativeCalls.push(o); return opts.apple.result; },
    };
  }
  let mode = 'first';
  // ⚠️ 🔑 **`noAppleId` אינו נוחות אלא תנאי למדידה.** `loadSdk` יוצאת מיד כשהספרייה כבר
  // קיימת — כלומר עם `AppleID` מוזרק, בדיקת "אפס בקשות ל-SDK" עוברת ירוק **גם אם הענף
  // שנבדק לא רץ בכלל**. הגנה שמתקיימת תמיד אינה הגנה.
  // ר' [[feedback_guard_that_always_holds]].
  if (!opts.noAppleId) {
    w.AppleID = { auth: { init() {}, signIn: async () => RESP[mode] } };
  }
  w.eval(SRC);
  return {
    w,
    nativeCalls,
    setMode: (m) => { mode = m; },
    val: (k, f) => w.document.getElementById(f + k).value,
    locked: (k) => w.document.getElementById('email' + k).readOnly,
    cap: (k) => (w.document.getElementById('asHost' + k).querySelector('.hb-as-cap') || {}).textContent || '',
    btn: (k) => w.document.getElementById('asHost' + k).querySelector('.hb-as-btn'),
    sdkTags: () => Array.from(w.document.querySelectorAll('script'))
      .filter((s) => (s.src || '').includes('appleid.cdn-apple.com')).length,
  };
}

(async () => {
  // ⚠️ **הבלוק הזה בדק פעם "בלי Services ID אין כפתור" — והנחת-היסוד שלו נעלמה ב-§445,**
  // שבו ה-Services ID הודלק. שלוש הבדיקות המשיכו לרוץ אדום ולטעון את ההפך מהמצב הנכון.
  // הוחלפו במה שנכון היום: **המתג דולק**, והכפתור מצויר בדפדפן.
  console.log('\n== ✅ §445 — המתג דולק, והכפתור מצויר בדפדפן ==');
  {
    const p = makePage(['A']);
    check('_configured מדווח true (SERVICES_ID מלא)', p.w.hbAppleSignup._configured() === true);
    p.w.hbAppleSignup.init({ hostId: 'asHostA', fields: { first: 'firstNameA', last: 'lastNameA', email: 'emailA' } });
    check('המכל נחשף', p.w.document.getElementById('asHostA').style.display === '',
          p.w.document.getElementById('asHostA').style.display);
    check('הכפתור מחובר למאזין', !!(p.btn('A') && p.btn('A')._hbBound));
  }

  // ══ §446ב — 🔴 בתוך האפליקציה: אין כפתור, ואין ולו בקשה אחת ל-SDK ═════════════════════
  // הפער שזה סוגר היה **חי**: `google-signup.js` קיבל את השער ב-§435 אחרי §434,
  // ו-`apple-signup.js` נכתב לפני כן והודלק ב-§445 בלי שאיש חזר לשאול. באפליקציה
  // כפתור גוגל כבר היה נייטיב — וכפתור אפל לצידו המשיך להיות מצויר.
  console.log('\n== §446ב — 🔴 בתוך האפליקציה הכפתור אינו מצויר ==');
  [
    ['גשר Capacitor קיים', { capacitor: true }],
    ['UA של האפליקציה', { ua: 'Mozilla/5.0 (Linux; Android 14) YellowZoneApp/1.1' }],
    ["YZNativeGoogle.mode()='native'", { nativeMode: 'native' }],
    ["YZNativeGoogle.mode()='blocked'", { nativeMode: 'blocked' }],
  ].forEach(([label, env]) => {
    // ⚠️ בלי AppleID מוזרק — אחרת בדיקת ה-SDK חסרת-ערך (ר' ההערה ב-makePage).
    const p = makePage(['A'], Object.assign({ noAppleId: true }, env));
    p.w.hbAppleSignup.init({ hostId: 'asHostA', fields: { first: 'firstNameA', last: 'lastNameA', email: 'emailA' } });
    check(label + ' → המכל מוסתר', p.w.document.getElementById('asHostA').style.display === 'none',
          p.w.document.getElementById('asHostA').style.display);
    check(label + ' → הכפתור אינו מחובר למאזין', !(p.btn('A') && p.btn('A')._hbBound));
    check(label + ' → אפס בקשות ל-SDK של אפל', p.sdkTags() === 0, p.sdkTags());
  });
  {
    // 🔑 **בקרת-נגד, ובלעדיה כל הקבוצה למעלה חסרת-ערך:** אותה סביבה בלי סימן-אפליקציה
    // **כן** מזריקה את ה-SDK. זה מה שמוכיח ש-0 למעלה נמדד ולא נגזר מכך ששום דבר לא רץ.
    const p = makePage(['A'], { noAppleId: true, nativeMode: 'web' });
    p.w.hbAppleSignup.init({ hostId: 'asHostA', fields: { first: 'firstNameA', last: 'lastNameA', email: 'emailA' } });
    check("mode()='web' → ה-SDK כן מוזרק (בקרת-נגד)", p.sdkTags() === 1, p.sdkTags());
    const p2 = makePage(['A'], { noAppleId: true });   // בלי YZNativeGoogle כלל, UA רגיל
    p2.w.hbAppleSignup.init({ hostId: 'asHostA', fields: { first: 'firstNameA', last: 'lastNameA', email: 'emailA' } });
    check('בלי YZNativeGoogle, UA רגיל → ה-SDK מוזרק (בקרת-נגד ל-UA)', p2.sdkTags() === 1, p2.sdkTags());
  }

  // 🔑 **ומה שאסור שישתנה:** כשהכפתור לא צויר, `attach` חייב לצאת בשקט ולא לגעת ברשת —
  // אחרת הסתרת הכפתור הייתה הופכת כל הרשמה באפליקציה לקריאת-שרת מיותרת שנכשלת.
  {
    const p = makePage(['A'], { noAppleId: true, capacitor: true });
    p.w.hbAppleSignup.init({ hostId: 'asHostA', fields: { first: 'firstNameA', last: 'lastNameA', email: 'emailA' } });
    let calls = 0;
    const r = await p.w.hbAppleSignup.attach(() => { calls++; }, 'MEM1');
    check('🔑 באפליקציה attach יוצא ב-no_token ואינו פונה לרשת',
          r && r.skipped === 'no_token' && calls === 0, JSON.stringify(r) + ' calls=' + calls);
  }

  console.log('\n== הציור ==');
  const p = makePage(['A', 'B']);
  const initOn = (k) => p.w.hbAppleSignup.init({
    hostId: 'asHost' + k, clientId: 'demo.services.id',
    fields: { first: 'firstName' + k, last: 'lastName' + k, email: 'email' + k },
  });
  initOn('A');
  check('כפתור צויר', !!p.btn('A'));
  check('נוסח הכפתור מאושר ע"י אפל', /הרשמה עם Apple/.test(p.btn('A').textContent));
  check('לוגו אפל בתוך הכפתור', !!p.btn('A').querySelector('svg'));
  check('כיתוב ברירת-מחדל מוצג', /הרשמה מהירה עם Apple/.test(p.cap('A')));
  check('המכל נחשף', p.w.document.getElementById('asHostA').style.display === '');

  // 🐛 רגרסיה — הבאג שנתפס בדמו. `built` גלובלי + id-ים גלובליים גרמו לכך שרק
  // המכל הראשון בדף קיבל כפתור, **בלי שום שגיאה**.
  initOn('B');
  check('🐛 מכל שני מקבל כפתור משלו', !!p.btn('B'),
        'דגל built גלובלי היה מחזיר early ומשאיר את המכל ריק בשקט');
  check('   ...ושני הכפתורים שונים זה מזה', p.btn('A') !== p.btn('B'));

  console.log('\n== מצב 1 — הרשאה ראשונה (יש שם) ==');
  {
    initOn('A'); p.setMode('first');
    p.btn('A').click();
    await new Promise((r) => setTimeout(r, 30));
    check('שם פרטי מולא', p.val('A', 'firstName') === 'ישראל', p.val('A', 'firstName'));
    check('שם משפחה מולא', p.val('A', 'lastName') === 'ישראלי');
    check('מייל מולא ומונמך', p.val('A', 'email') === 'fan@example.com', p.val('A', 'email'));
    check('המייל ננעל לעריכה', p.locked('A') === true,
          'עריכה ידנית אחריו הייתה שוברת את /apple-attach בשקט');
    check('נשמר טוקן לקישור', !!p.w.hbAppleSignup.token());
    check('מוצע "זה לא החשבון שלי"', /זה לא החשבון שלי/.test(p.cap('A')));
  }

  console.log('\n== ⚠️ מצב 2 — כניסה חוזרת: אפל אינה שולחת שם ==');
  {
    initOn('B'); p.setMode('repeat');
    p.btn('B').click();
    await new Promise((r) => setTimeout(r, 30));
    check('🔴 השם נשאר ריק', p.val('B', 'firstName') === '' && p.val('B', 'lastName') === '',
          'אפל מוסרת שם רק בהרשאה הראשונה בחיים');
    check('המייל בכל זאת מולא', p.val('B', 'email') === 'fan@example.com');
    check('הכיתוב מסביר למה אין שם', /אינה שולחת שם בכניסות חוזרות/.test(p.cap('B')),
          'בלי זה הנרשם רואה טופס חצי-ריק ולא מבין אם משהו נשבר');
    check('הטוקן נשמר בכל זאת', !!p.w.hbAppleSignup.token());
  }

  console.log('\n== 🔴 מצב 3 — "הסתר את המייל שלי" ==');
  {
    const q = makePage(['C']);
    q.w.hbAppleSignup.init({ hostId: 'asHostC', clientId: 'demo.services.id',
      fields: { first: 'firstNameC', last: 'lastNameC', email: 'emailC' } });
    q.setMode('relay');
    q.btn('C').click();
    await new Promise((r) => setTimeout(r, 30));
    check('🔴 לא נשמר טוקן', !q.w.hbAppleSignup.token(),
          'טוקן שידוע מראש שהקישור שלו ייכשל הוא "נראה שהצליח" שמתגלה רק בכניסה');
    check('כתובת הממסר לא נכתבה לשדה', q.val('C', 'email') === '', q.val('C', 'email'));
    check('המייל לא ננעל', q.locked('C') === false);
    check('ההסבר אומר מה לעשות', /שתף את המייל שלי/.test(q.cap('C')),
          'לא "משהו השתבש" — הנרשם צריך לדעת שהוא עצמו בחר להסתיר');
    check('לא נטען שהמייל אומת', !/אומת ע/.test(q.cap('C')));
  }

  console.log('\n== זיהוי כתובת-ממסר ==');
  {
    const f = p.w.hbAppleSignup._isPrivateRelay;
    check('לפי הדומיין', f({ email: 'x@privaterelay.appleid.com' }) === true);
    check('לפי הדגל הבוליאני', f({ email: 'a@b.com', is_private_email: true }) === true);
    check("לפי הדגל כמחרוזת 'true'", f({ email: 'a@b.com', is_private_email: 'true' }) === true);
    check('מייל רגיל אינו ממסר', f({ email: 'a@b.com' }) === false);
    check('בלי payload אינו קורס', f(null) === false);
  }

  console.log('\n== attach ==');
  {
    const q = makePage(['D']);
    q.w.hbAppleSignup.init({ hostId: 'asHostD', clientId: 'demo.services.id',
      fields: { first: 'firstNameD', last: 'lastNameD', email: 'emailD' } });

    let r = await q.w.hbAppleSignup.attach(() => {}, 'm1');
    check('בלי טוקן — יוצא מיד בלי בקשת-רשת', r && r.skipped === 'no_token',
          'מי שלא לחץ על אפל אינו משלם שום המתנה');

    q.setMode('first');
    q.btn('D').click();
    await new Promise((res) => setTimeout(res, 30));

    let seen = null;
    const apiFetch = async (url, opts) => {
      seen = { url, body: JSON.parse(opts.body) };
      return { json: async () => ({ ok: true }) };
    };
    r = await q.w.hbAppleSignup.attach(apiFetch, 'member-123');
    check('נקרא לנתיב הנכון', seen && seen.url === '/apple-attach', seen && seen.url);
    check('נשלח memberId', seen && seen.body.memberId === 'member-123');
    check('נשלח idToken', !!(seen && seen.body.idToken));
    check('מחזיר ok', r && r.ok === true);

    r = await q.w.hbAppleSignup.attach(async () => { throw new Error('net'); }, 'm1');
    check('🔑 כשל רשת אינו זורק', r && r.error === 'network',
          'כשל קישור לעולם אינו כשל-הרשמה — הרשומה כבר נכתבה');

    r = await q.w.hbAppleSignup.attach(apiFetch, '');
    check('בלי memberId — יוצא בלי בקשה', r && r.skipped === 'no_member');
  }

  console.log('\n== מקבילות ל-google-signup ==');
  {
    const g = fs.readFileSync(path.join(__dirname, 'google-signup.js'), 'utf8');
    const api = ['init', 'render', 'attach', 'token', 'clear'];
    api.forEach((k) => {
      check('אותו ממשק: ' + k,
            new RegExp('\\b' + k + ':').test(g) && new RegExp('\\b' + k + ':').test(SRC));
    });
    check('אותו סף פסק-זמן (8 שניות)',
          /ATTACH_TIMEOUT_MS = 8000/.test(g) && /ATTACH_TIMEOUT_MS = 8000/.test(SRC));
    check('נחשף מיד ל-window, לא בתוך callback', /window\.hbAppleSignup = \{/.test(SRC));
  }

  // ══ §450 — המסלול הנייטיב (iOS) ═══════════════════════════════════════════════════════
  const NATIVE_OK = {
    ok: true,
    idToken: fakeToken({ sub: 'a.9', email: 'Fan@Example.com', email_verified: 'true' }),
    givenName: 'ישראל', familyName: 'ישראלי', user: 'a.9',
  };
  const F = { first: 'firstNameA', last: 'lastNameA', email: 'emailA' };
  const initA = (p, extra) => p.w.hbAppleSignup.init(Object.assign({ hostId: 'asHostA', fields: F }, extra || {}));
  const clickA = async (p) => { p.btn('A').dispatchEvent(new p.w.Event('click')); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

  console.log("\n== §450 — mode()='native': כפתור בלי SDK ==");
  {
    const p = makePage(['A'], { noAppleId: true, capacitor: true, nativeMode: 'blocked',
                                apple: { mode: 'native', result: NATIVE_OK } });
    initA(p);
    check('המכל נחשף למרות שאנחנו באפליקציה', p.w.document.getElementById('asHostA').style.display === '');
    check('🔑 אפס בקשות ל-SDK של אפל (42KB שלא שולמו)', p.sdkTags() === 0, p.sdkTags());
    check('הכפתור מחובר למאזין', !!(p.btn('A') && p.btn('A')._hbBound));

    await clickA(p);
    check('נקראה YZNativeApple.signIn', p.nativeCalls.length === 1, JSON.stringify(p.nativeCalls));
    check("נתבקש גם FULL_NAME (יש שדות שם למלא)",
          JSON.stringify((p.nativeCalls[0] || {}).scopes) === JSON.stringify(['EMAIL', 'FULL_NAME']),
          JSON.stringify(p.nativeCalls[0]));

    // 🔑 זה הלב: התשובה הנייטיבית עברה דרך `onAuthorized` **האמיתי**, ולכן ירשה ממנו הכל.
    check('המייל מולא', p.val('A', 'email') === 'fan@example.com', p.val('A', 'email'));
    check('🔑 והונמך לאותיות קטנות (§437 — ירושה מנתיב ה-web)', p.val('A', 'email') === 'fan@example.com');
    check('השם מולא משדות התוסף', p.val('A', 'firstName') === 'ישראל' && p.val('A', 'lastName') === 'ישראלי',
          p.val('A', 'firstName') + '/' + p.val('A', 'lastName'));
    check('שדה המייל ננעל', p.locked('A') === true);
    check('הטוקן נשמר ל-attach', !!p.w.hbAppleSignup.token());
  }

  console.log('\n== §450 — 🔴 כתובת-ממסר נחסמת גם במסלול הנייטיב ==');
  {
    // ההחלטה מ-§423: "הסתר את המייל שלי" שובר את שער הקישור לנצח. נתיב נייטיב שהיה
    // עוקף את `onAuthorized` היה מאבד את החסימה **בשקט**, וזה בדיוק כל הטעם בהמרה.
    const relay = { ok: true, givenName: null, familyName: null,
      idToken: fakeToken({ sub: 'a.9', email: 'zzz@privaterelay.appleid.com',
                           email_verified: 'true', is_private_email: 'true' }) };
    const p = makePage(['A'], { noAppleId: true, apple: { mode: 'native', result: relay } });
    initA(p);
    await clickA(p);
    check('המייל לא מולא', p.val('A', 'email') === '', p.val('A', 'email'));
    check('אין טוקן שמור', !p.w.hbAppleSignup.token());
    check('הוצג הסבר ולא "משהו השתבש"', /הסתר|שיתוף|מייל/.test(p.cap('A')), p.cap('A'));
  }

  console.log('\n== §450 — כניסה חוזרת: אפל לא שולחת שם, והשדות לא נמחקים ==');
  {
    const p = makePage(['A'], { noAppleId: true,
      apple: { mode: 'native', result: Object.assign({}, NATIVE_OK, { givenName: null, familyName: null }) } });
    initA(p);
    p.w.document.getElementById('firstNameA').value = 'רון';
    p.w.document.getElementById('lastNameA').value = 'לוי';
    await clickA(p);
    check('🔑 שם שהנרשם מילא לא נדרס', p.val('A', 'firstName') === 'רון' && p.val('A', 'lastName') === 'לוי',
          p.val('A', 'firstName') + '/' + p.val('A', 'lastName'));
    check('המייל כן מולא', p.val('A', 'email') === 'fan@example.com');
  }

  console.log('\n== §450 — כשלים: ביטול שותק, שגיאה מדברת, שניהם נרשמים ==');
  {
    const logs = [];
    const p = makePage(['A'], { noAppleId: true, apple: { mode: 'native', result: { ok: false, reason: 'canceled' } } });
    initA(p, { log: (c) => logs.push(c) });
    await clickA(p);
    check('ביטול — אין הודעת שגיאה', !/השתבש/.test(p.cap('A')), p.cap('A'));
    check('ביטול — כן נרשם (§439)', logs.includes('asNativeFail:canceled'), JSON.stringify(logs));
    check('הכפתור שוחרר לניסיון נוסף', p.btn('A').disabled === false);
  }
  {
    const logs = [];
    const p = makePage(['A'], { noAppleId: true, apple: { mode: 'native', result: { ok: false, reason: 'error', detail: 'boom' } } });
    initA(p, { log: (c) => logs.push(c) });
    await clickA(p);
    check('שגיאה — ההודעה מוצגת ומציעה מוצא', /השתבש/.test(p.cap('A')) && /ידנית/.test(p.cap('A')), p.cap('A'));
    check('שגיאה — נרשמה', logs.includes('asNativeFail:error'), JSON.stringify(logs));
  }

  console.log('\n== §450 — 🔴 בלי native-apple.js ההתנהגות זהה לאתמול ==');
  {
    // זו שיטת ההפצה: דף בלי תגית ה-script חייב להתנהג **בדיוק** כמו לפני השינוי.
    const p = makePage(['A'], { noAppleId: true, capacitor: true });   // אין opts.apple
    initA(p);
    check('באפליקציה, בלי הגשר → המכל מוסתר', p.w.document.getElementById('asHostA').style.display === 'none');
    check('באפליקציה, בלי הגשר → אפס בקשות ל-SDK', p.sdkTags() === 0);
    const p2 = makePage(['A'], { noAppleId: true });                   // דפדפן רגיל, אין גשר
    initA(p2);
    check('בדפדפן, בלי הגשר → ה-SDK מוזרק כרגיל', p2.sdkTags() === 1, p2.sdkTags());
  }
  {
    // ⚠️ והמקרה ההפוך: הגשר קיים ואומר blocked → מוסתר, גם אם YZNativeGoogle אומר web.
    const p = makePage(['A'], { noAppleId: true, nativeMode: 'web', apple: { mode: 'blocked' } });
    initA(p);
    check("🔑 YZNativeApple גובר על YZNativeGoogle (blocked מול web)",
          p.w.document.getElementById('asHostA').style.display === 'none',
          p.w.document.getElementById('asHostA').style.display);
    check('ואפס בקשות ל-SDK', p.sdkTags() === 0);
  }

  console.log('\n== §450 — 🔴 התוסף שנרשם באיחור: הכפתור לא ננעל על "מוסתר" ==');
  {
    // התרחיש: `init` רצה לפני ש-Capacitor סיים לרשום את התוסף. עד §450 `blocked` היה
    // מצב יציב; עכשיו הוא גם התשובה הזמנית של השנייה הראשונה.
    let ready = false;
    const p = makePage(['A'], { noAppleId: true });
    p.w.YZNativeApple = {
      mode: () => (ready ? 'native' : 'blocked'),
      signIn: async (o) => { p.nativeCalls.push(o); return NATIVE_OK; },
    };
    initA(p);
    check('בשנייה הראשונה — עדיין מוסתר', p.w.document.getElementById('asHostA').style.display === 'none');
    ready = true;                                   // התוסף נרשם
    await new Promise(r => setTimeout(r, 400));     // שתי חזרות של 150ms ועוד
    check('🔑 אחרי שהתוסף נרשם — הכפתור מופיע',
          p.w.document.getElementById('asHostA').style.display === '',
          p.w.document.getElementById('asHostA').style.display);
    check('ועדיין אפס בקשות ל-SDK', p.sdkTags() === 0, p.sdkTags());
    await clickA(p);
    check('והלחיצה הולכת לגשר', p.nativeCalls.length === 1, JSON.stringify(p.nativeCalls));
  }
  {
    // ⚠️ בקרת-נגד: באנדרואיד התוסף **לעולם** לא יגיע — ההמתנה חייבת להיגמר בהסתרה.
    const p = makePage(['A'], { noAppleId: true, apple: { mode: 'blocked' } });
    initA(p);
    await new Promise(r => setTimeout(r, 300));
    check('תוסף שלא מגיע → נשאר מוסתר', p.w.document.getElementById('asHostA').style.display === 'none');
    check('ואפס בקשות ל-SDK', p.sdkTags() === 0);
  }
  {
    // 🔑 **ובלי המודול — ההכרעה מיידית, בלי שום המתנה.** זו ההתנהגות של אתמול.
    const p = makePage(['A'], { noAppleId: true, capacitor: true });
    initA(p);
    check('בלי native-apple.js — מוסתר **מיד**, בלי המתנה',
          p.w.document.getElementById('asHostA').style.display === 'none');
  }

  console.log('\n== §450 — תגית ה-script קיימת בדף שהודלק, וחסרה בשאר ==');
  {
    const tag = /<script src="native-apple\.js"><\/script>/;
    const fan = fs.readFileSync(path.join(__dirname, 'fan-register.html'), 'utf8');
    const biz = fs.readFileSync(path.join(__dirname, 'business.html'), 'utf8');
    check('fan-register.html טוען את native-apple.js', tag.test(fan));
    // ⚠️ **הסדר נבדק, לא רק הקיום:** apple-signup.js קורא ל-`window.YZNativeApple` —
    // תגית שתבוא אחריו הייתה משאירה את המודול עם הנפילה-לאחור, בלי שום שגיאה.
    //
    // 🐛 **והניסיון הראשון כאן נכשל על הערה ולא על קוד:** `fan.indexOf('apple-signup.js')`
    // מצא את **האזכור בתיאור** שמעל התגית (מיקום 1794) ולא את התגית עצמה, והכריז על
    // סדר הפוך שאינו קיים. משווים **תגיות**, לא מחרוזות. ר' §421, אותה מלכודת.
    // ⚠️ **§452 הפך את הבדיקה הזאת.** היא נכתבה ב-§450 כשהיא נעלה את ההפך —
    // "business.html **עדיין לא** הודלק" — וזה היה נכון ליום שבו נכתבה. משהודלק, הבדיקה
    // נכשלה **כמו שצריך**, וזה מה שמחזיק את הבדיקות מלתאר עולם שכבר לא קיים.
    // ר' [[feedback_stale_action_item_may_be_harmful]] — אותו דפוס, רק שכאן הוא נתפס.
    check('business.html טוען את native-apple.js', tag.test(biz));
    [['fan-register.html', fan], ['business.html', biz]].forEach(([name, src]) => {
      const iNative = src.indexOf('<script src="native-apple.js">');
      const iSignup = src.indexOf('<script src="apple-signup.js">');
      check('🔑 ' + name + ' — native-apple לפני apple-signup',
            iNative > -1 && iSignup > -1 && iNative < iSignup, iNative + ' < ' + iSignup);
    });

    // 🔑 **ו-`welcome.html` נבדק כאן דווקא כי הוא **אינו** טוען את apple-signup.js.**
    // הוא מריץ מסלול משלו (§446א), אבל הוא כן צריך את הגשר — ותגית חסרה שם הייתה
    // משאירה את מסך ההתחברות בלי כפתור אפל באייפון, בשקט מוחלט.
    const wel = fs.readFileSync(path.join(__dirname, 'welcome.html'), 'utf8');
    check('welcome.html טוען את native-apple.js', tag.test(wel));
    check('⚠️ ו**אינו** טוען את apple-signup.js (מסלול אחר, §446א)',
          !/<script src="apple-signup\.js">/.test(wel));
  }

  console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + '/' + (pass + fail) + ' עברו');
  process.exit(fail === 0 ? 0 : 1);
})();
