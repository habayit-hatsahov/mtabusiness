// §468ג — בדיקות לזרימת-ההפניה של apple-signup.js (אייפון בדפדפן).
// מריץ את הקובץ האמיתי ב-JSDOM, עם UA של אייפון, ובודק: הכפתור מוצג בלי SDK · לחיצה שומרת nonce
// ובונה כתובת authorize נכונה · חזרה עם #as= ממלאת את הטופס רק כשה-nonce תואם · דף בלי
// redirectReturn (טופס העסק) מסתיר את הכפתור באייפון · במחשב — זרימת החלון כמו קודם.
// הרצה:  node scratch_test_apple_redirect.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));
const SRC = fs.readFileSync(path.join(__dirname, 'apple-signup.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
const b64url = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const fakeToken = (p) => b64url({ alg: 'RS256' }) + '.' + b64url(p) + '.c2ln';
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Safari';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari';
const TOKEN = fakeToken({ sub: 'b.1', email: 'xyz@privaterelay.appleid.com', email_verified: 'true', is_private_email: 'true' });

function makePage(opts) {
  const url = 'https://yellowzone.co.il/fan-register.html' + (opts.hash || '');
  const dom = new JSDOM('<!doctype html><body><div id="asHost"></div><input id="firstName"><input id="lastName"><input id="email"></body>',
    { runScripts: 'outside-only', url });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'userAgent', { value: opts.ua, configurable: true });
  if (!w.AbortSignal.timeout) w.AbortSignal.timeout = AbortSignal.timeout.bind(AbortSignal);
  if (opts.nonce) w.sessionStorage.setItem('hb_as_nonce', opts.nonce);
  const events = [];
  let initCfg = null;
  if (opts.appleId) w.AppleID = { auth: { init(c) { initCfg = c; }, signIn: async () => ({}) } };
  w.eval(SRC);
  const cfg = { hostId: 'asHost', fields: { first: 'firstName', last: 'lastName', email: 'email' },
                log: (c) => events.push(c), apiFetch: async () => ({ json: async () => ({ ok: true }) }) };
  if (opts.redirectReturn) cfg.redirectReturn = opts.redirectReturn;
  w.hbAppleSignup.init(cfg);
  return {
    w, events, initCfg: () => initCfg,
    host: () => w.document.getElementById('asHost'),
    btn: () => w.document.querySelector('#asHost .hb-as-btn'),
    sdk: () => Array.from(w.document.querySelectorAll('script')).filter((s) => (s.src || '').includes('appleid.cdn-apple.com')).length,
    val: (id) => w.document.getElementById(id).value,
  };
}

(async () => {
  console.log('\n== אייפון + redirectReturn (טופס האוהד) ==');
  {
    const p = makePage({ ua: IOS, redirectReturn: 'fan' });
    check('הכפתור מוצג', p.host().style.display === '' && !!p.btn(), p.host().style.display);
    check('בלי SDK של אפל', p.sdk() === 0, p.sdk());
    check('asShown נרשם', p.events.includes('asShown'), p.events.join(','));
    try { p.btn().click(); } catch (_) {}
    const nonce = p.w.sessionStorage.getItem('hb_as_nonce');
    check('לחיצה שומרת nonce (24 תווי hex)', /^[0-9a-f]{24}$/.test(nonce || ''), nonce);
    check('asRedirect נרשם', p.events.includes('asRedirect'), p.events.join(','));
  }

  console.log('\n== חזרה מאפל (#as=) ==');
  {
    const frag = b64url({ s: 'fan.abc', t: TOKEN, x: 'ok', u: { name: { firstName: 'דנה', lastName: 'לוי' } } });
    const p = makePage({ ua: IOS, redirectReturn: 'fan', nonce: 'abc', hash: '#as=' + frag });
    await tick(20);
    check('המייל מולא בכתובת-הממסר', p.val('email') === 'xyz@privaterelay.appleid.com', p.val('email'));
    check('השם מולא מ-user', p.val('firstName') === 'דנה' && p.val('lastName') === 'לוי', p.val('firstName') + ' ' + p.val('lastName'));
    check('asUsed + asRelay', p.events.includes('asUsed') && p.events.includes('asRelay'), p.events.join(','));
    check('asExchange:ok (ההחלפה נעשתה בוורקר)', p.events.includes('asExchange:ok'), p.events.join(','));
    check('ה-fragment נמחק', !/as=/.test(p.w.location.href), p.w.location.href);
    check('ה-nonce נמחק', p.w.sessionStorage.getItem('hb_as_nonce') === null);
    check('הטוקן זמין ל-attach', p.w.hbAppleSignup.token() === TOKEN);
  }
  {
    const frag = b64url({ s: 'fan.EVIL', t: TOKEN, x: 'ok' });
    const p = makePage({ ua: IOS, redirectReturn: 'fan', nonce: 'abc', hash: '#as=' + frag });
    await tick(20);
    check('🔑 nonce לא תואם → הטופס לא מולא', p.val('email') === '' && p.w.hbAppleSignup.token() === null, p.val('email'));
    check('asReturn:nonce נרשם', p.events.includes('asReturn:nonce'), p.events.join(','));
  }
  {
    const frag = b64url({ s: 'fan.abc', t: TOKEN });
    const p = makePage({ ua: IOS, redirectReturn: 'fan', hash: '#as=' + frag });
    await tick(20);
    check('🔑 אין nonce שמור → הטופס לא מולא', p.val('email') === '');
  }
  {
    const frag = b64url({ s: 'fan.abc', e: 'user_cancelled_authorize' });
    const p = makePage({ ua: IOS, redirectReturn: 'fan', nonce: 'abc', hash: '#as=' + frag });
    await tick(20);
    const cap = (p.host().querySelector('.hb-as-cap') || {}).textContent || '';
    check('ביטול → בלי מילוי ובלי "משהו השתבש"', p.val('email') === '' && !/השתבש/.test(cap), cap);
  }
  {
    const p = makePage({ ua: IOS, redirectReturn: 'fan', nonce: 'abc', hash: '#as=%%%' });
    await tick(20);
    check('fragment פגום → לא נופל', p.val('email') === '');
  }

  console.log('\n== אייפון בלי redirectReturn (טופס העסק) ==');
  {
    const p = makePage({ ua: IOS });
    check('הכפתור מוסתר', p.host().style.display === 'none', p.host().style.display);
    check('asHiddenIOS נרשם', p.events.includes('asHiddenIOS'), p.events.join(','));
    check('בלי SDK', p.sdk() === 0);
  }

  console.log('\n== בקרת-נגד: מחשב ==');
  {
    const p = makePage({ ua: MAC, redirectReturn: 'fan', appleId: true });
    check('מחשב → זרימת החלון (init עם usePopup:true)', !!p.initCfg() && p.initCfg().usePopup === true, JSON.stringify(p.initCfg()));
    check('הכפתור מוצג', p.host().style.display === '');
  }

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail) + ' עברו');
  process.exit(fail ? 1 : 0);
})();
