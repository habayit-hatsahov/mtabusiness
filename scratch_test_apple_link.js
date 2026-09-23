// §456 — בדיקות ל-apple-link.js (חיבור חשבון Apple לחבר מחובר).
//
// 🔑 מריץ את הקובץ האמיתי בתוך jsdom, עם `apiFetch` מדומה שרושם כל בקשה ועם שני מקורות-
// הטוקן האמיתיים: הגשר של אפל (מבנה התשובה של `native-apple.js`) ו-`AppleID.auth` (מבנה
// התשובה של ה-SDK). ר' [[feedback_verification_must_run_the_producer]].
//
// הרצה:  node scratch_test_apple_link.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));

const SRC = fs.readFileSync(path.join(__dirname, 'apple-link.js'), 'utf8');
const PROFILE = fs.readFileSync(path.join(__dirname, 'profile.html'), 'utf8');
const WELCOME = fs.readFileSync(path.join(__dirname, 'welcome.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

// opts: { mode: 'native'|'web'|'blocked'|undefined, nativeResult, webResult|webThrow, linkReply, capacitor }
function build(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body>' +
    '<div id="appleLinkRow" style="display:none"></div><div id="appleLinkMsg" style="display:none"></div></body>',
    { runScripts: 'outside-only' });
  const w = dom.window;
  if (!w.AbortSignal.timeout) w.AbortSignal.timeout = AbortSignal.timeout.bind(AbortSignal);
  if (opts.capacitor) w.Capacitor = {};
  if (opts.mode) {
    w.YZNativeApple = {
      mode: () => opts.mode,
      signIn: async (o) => { w.__nativeCalls = (w.__nativeCalls || []).concat([o]); return opts.nativeResult; },
    };
  }
  if (opts.webResult || opts.webThrow) {
    w.AppleID = { auth: {
      init: (c) => { w.__initCfg = c; },
      signIn: async () => { if (opts.webThrow) throw opts.webThrow; return opts.webResult; },
    } };
  }
  const calls = [];
  const apiFetch = async (url, o) => {
    calls.push({ url, body: JSON.parse(o.body), hasSignal: !!o.signal });
    const reply = url === '/apple-link' ? (opts.linkReply || { ok: true }) : { ok: true };
    return { json: async () => reply };
  };
  w.eval(SRC);
  return {
    w, calls,
    init: (extra) => w.hbAppleLink.init(Object.assign({ apiFetch, getIdToken: async () => 'member-tok' }, extra || {})),
    row: () => w.document.getElementById('appleLinkRow').style.display,
    msg: () => w.document.getElementById('appleLinkMsg').textContent,
  };
}

(async () => {
  console.log('\n── 1. מתי השורה מוצגת ────────────────────────────────────');
  {
    const t = build({ mode: 'web' }); t.init();
    check('דפדפן, לא מחובר → מוצגת', t.row() === 'flex', t.row());
    const t2 = build({ mode: 'web' }); t2.init({ appleLinked: true });
    check('כבר מחובר → מוסתרת', t2.row() === 'none', t2.row());
    const t3 = build({ mode: 'blocked' }); t3.init();
    check('🔑 אפליקציית אנדרואיד (blocked) → מוסתרת (אין שם מסלול שעובד)', t3.row() === 'none', t3.row());
    const t4 = build({ mode: 'native' }); t4.init();
    check('אייפון (native) → מוצגת', t4.row() === 'flex', t4.row());
    const t5 = build({ capacitor: true }); t5.init();
    check('בלי native-apple.js באפליקציה → נופל ל-blocked, מוסתרת', t5.row() === 'none', t5.row());
    const t6 = build({ mode: 'web' }); t6.w.hbAppleLink.init({});
    check('init בלי תלויות → לא מוצגת ולא זורקת', t6.row() === 'none');
    check('hbAppleLinkClick חשוף לפני init (onclick של השורה)', typeof build({}).w.hbAppleLinkClick === 'function');
  }

  console.log('\n── 2. אייפון (native): חיבור מלא ─────────────────────────');
  {
    const t = build({ mode: 'native', nativeResult: { ok: true, idToken: 'apple-tok', authorizationCode: 'code-app' } });
    t.init();
    await t.w.hbAppleLinkClick(); await tick();
    const link = t.calls.find((c) => c.url === '/apple-link');
    const ex = t.calls.find((c) => c.url === '/apple-exchange');
    check('נקרא /apple-link עם שני הטוקנים', link && link.body.idToken === 'apple-tok' && link.body.memberIdToken === 'member-tok', JSON.stringify(link));
    check('/apple-link עם גבול-זמן', link && link.hasSignal);
    check('§455 — נשלח גם /apple-exchange עם הקוד, בלי redirectUri', ex && ex.body.code === 'code-app' && !('redirectUri' in ex.body), JSON.stringify(ex));
    check('נתבקש EMAIL בלבד', JSON.stringify((t.w.__nativeCalls || [])[0]) === JSON.stringify({ scopes: ['EMAIL'] }));
    check('הודעת הצלחה מצטטת את הכפתור "המשך עם Apple"', /המשך עם Apple/.test(t.msg()), t.msg());
    check('השורה נעלמת אחרי הצלחה', t.row() === 'none', t.row());
  }

  console.log('\n── 3. דפדפן (web) ──────────────────────────────────────────');
  {
    const t = build({ mode: 'web', webResult: { authorization: { id_token: 'web-tok', code: 'code-web' } } });
    t.init();
    await t.w.hbAppleLinkClick(); await tick();
    const ex = t.calls.find((c) => c.url === '/apple-exchange');
    check('AppleID.auth.init עם ה-Services ID ו-popup', t.w.__initCfg && t.w.__initCfg.clientId === 'il.co.yellowzone.web' && t.w.__initCfg.usePopup === true, JSON.stringify(t.w.__initCfg));
    check('redirectURI רשום (welcome.html)', t.w.__initCfg && t.w.__initCfg.redirectURI === 'https://yellowzone.co.il/welcome.html');
    check('/apple-exchange עם אותה redirectUri', ex && ex.body.redirectUri === 'https://yellowzone.co.il/welcome.html', JSON.stringify(ex));
    check('נקרא /apple-link', t.calls.some((c) => c.url === '/apple-link' && c.body.idToken === 'web-tok'));
  }

  console.log('\n── 4. ביטול ושגיאות ────────────────────────────────────────');
  {
    const t = build({ mode: 'native', nativeResult: { ok: false, reason: 'canceled' } }); t.init();
    await t.w.hbAppleLinkClick(); await tick();
    check('ביטול באייפון — אין הודעה ואין בקשות', t.msg() === '' && t.calls.length === 0, t.msg() + ' / ' + t.calls.length);
    const t2 = build({ mode: 'web', webThrow: { error: 'popup_closed_by_user' } }); t2.init();
    await t2.w.hbAppleLinkClick(); await tick();
    check('ביטול בדפדפן — אין הודעה', t2.msg() === '', t2.msg());
    const t3 = build({ mode: 'native', nativeResult: { ok: true, idToken: 'x' }, linkReply: { error: 'apple_already_linked' } }); t3.init();
    await t3.w.hbAppleLinkClick(); await tick();
    check('apple_already_linked → הודעה בעברית, השורה נשארת', /כבר מחובר לאוהד אחר/.test(t3.msg()) && t3.row() === 'flex', t3.msg());
    check('בלי code — לא נשלח /apple-exchange, אבל החיבור כן', !t3.calls.some((c) => c.url === '/apple-exchange') && t3.calls.some((c) => c.url === '/apple-link'));
    const t4 = build({ mode: 'native', nativeResult: { ok: false, reason: 'error' } }); t4.init();
    await t4.w.hbAppleLinkClick(); await tick();
    check('שגיאת התוסף → הודעה', /השתבש/.test(t4.msg()), t4.msg());
  }

  console.log('\n── 5. החיווט בדפים ─────────────────────────────────────────');
  {
    const iNative = PROFILE.indexOf('<script src="native-apple.js">');
    const iLink = PROFILE.indexOf('<script src="apple-link.js">');
    check('profile.html טוען native-apple.js לפני apple-link.js', iNative > -1 && iLink > iNative, iNative + ' < ' + iLink);
    check('profile.html — שורה id=appleLinkRow מוסתרת כברירת מחדל, onclick=hbAppleLinkClick',
      /id="appleLinkRow"[^>]*display:none[^>]*onclick="hbAppleLinkClick\(\)"/.test(PROFILE));
    check('profile.html — קורא ל-hbAppleLink.init עם appleLinked', /hbAppleLink\?\.init\(\{[\s\S]{0,200}appleLinked:/.test(PROFILE));
    check('profile.html — appleLinked נגזר מ-appleSub', /appleLinked:\s*!!data\.appleSub/.test(PROFILE));
    // 🔑 ההבטחה במסך הכניסה חייבת להצביע על מה שקיים — זה היה הבאג.
    check('welcome.html — הודעת "לא מחובר" מפנה ל"פרטים אישיים" ול"חיבור חשבון Apple"',
      /פרטים אישיים[\s\S]{0,80}חיבור חשבון Apple/.test(WELCOME));
    check('welcome.html — ההבטחה הישנה ("אחרי הכניסה הראשונה תוכלו להיכנס עם Apple") הוסרה',
      !/'תוכלו להיכנס עם Apple בלחיצה אחת\.'/.test(WELCOME));
    check('התווית בפרופיל זהה לזו שבהודעה', /חיבור חשבון Apple/.test(PROFILE));
  }

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail) + ' עברו');
  process.exit(fail ? 1 : 0);
})();
