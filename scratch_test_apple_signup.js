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
function makePage(hosts) {
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
  let mode = 'first';
  w.AppleID = {
    auth: {
      init() {},
      signIn: async () => RESP[mode],
    },
  };
  w.eval(SRC);
  return {
    w,
    setMode: (m) => { mode = m; },
    val: (k, f) => w.document.getElementById(f + k).value,
    locked: (k) => w.document.getElementById('email' + k).readOnly,
    cap: (k) => (w.document.getElementById('asHost' + k).querySelector('.hb-as-cap') || {}).textContent || '',
    btn: (k) => w.document.getElementById('asHost' + k).querySelector('.hb-as-btn'),
  };
}

(async () => {
  console.log('\n== 🔲 בלי Services ID הבלוק אינו מוצג ==');
  {
    const p = makePage(['A']);
    check('_configured מדווח false', p.w.hbAppleSignup._configured() === false);
    p.w.hbAppleSignup.init({ hostId: 'asHostA', fields: { first: 'firstNameA', last: 'lastNameA', email: 'emailA' } });
    // ⚠️ המרקאפ **כן** נבנה — `init` בונה ואז `render` מחליט אם לחשוף, בדיוק כמו
    // ב-`google-signup.js`. מה שחשוב הוא ששום דבר אינו נראה ושהכפתור אינו פעיל:
    // כפתור אפל שנשבר בלחיצה גרוע מכפתור שאינו קיים, וגם סיבת דחייה בפני עצמה.
    check('🔴 המכל נשאר מוסתר', p.w.document.getElementById('asHostA').style.display === 'none',
          p.w.document.getElementById('asHostA').style.display);
    check('🔴 הכפתור אינו מחובר למאזין', !(p.btn('A') && p.btn('A')._hbBound),
          'render יצא לפני החיבור, כלומר לחיצה אינה עושה כלום');
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

  console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + '/' + (pass + fail) + ' עברו');
  process.exit(fail === 0 ? 0 : 1);
})();
