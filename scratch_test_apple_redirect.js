// §531 (במקום §468ג) — זרימת-ההפניה לאייפון בדפדפן הוסרה. מריץ את apple-signup.js האמיתי ב-JSDOM ובודק:
// באייפון בדפדפן הכפתור מוסתר תמיד (גם בדף שמוסר את redirectReturn הישן), בלי SDK, ו-#as= ישן בכתובת
// או hb_as_pending ישן לא ממלאים את הטופס; במחשב — זרימת החלון כמו קודם.
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
  console.log('\n== אייפון + redirectReturn (הפרמטר הישן של טופס האוהד) ==');
  {
    const p = makePage({ ua: IOS, redirectReturn: 'fan' });
    check('הכפתור מוסתר', p.host().style.display === 'none', p.host().style.display);
    check('בלי SDK של אפל', p.sdk() === 0, p.sdk());
    check('asHiddenIOS נרשם, בלי asShown', p.events.includes('asHiddenIOS') && !p.events.includes('asShown'), p.events.join(','));
  }

  console.log('\n== #as= ישן בכתובת לא ממלא כלום ==');
  {
    const frag = b64url({ s: 'fan.abc', t: TOKEN, x: 'ok', u: { name: { firstName: 'דנה', lastName: 'לוי' } } });
    const p = makePage({ ua: IOS, redirectReturn: 'fan', nonce: 'abc', hash: '#as=' + frag });
    await tick(20);
    check('🔑 הטופס לא מולא ואין טוקן', p.val('email') === '' && p.w.hbAppleSignup.token() === null, p.val('email'));
  }
  {
    const p = makePage({ ua: IOS });
    p.w.sessionStorage.setItem('hb_as_pending', JSON.stringify({ t: TOKEN, at: Date.now() }));
    p.w.hbAppleSignup.render();
    await tick(20);
    check('🔑 hb_as_pending ישן (§468ז) לא משוחזר', p.w.hbAppleSignup.token() === null && p.val('email') === '');
  }

  console.log('\n== אייפון בלי redirectReturn (טופס העסק) – כמו קודם ==');
  {
    const p = makePage({ ua: IOS });
    check('הכפתור מוסתר', p.host().style.display === 'none', p.host().style.display);
    check('asHiddenIOS נרשם', p.events.includes('asHiddenIOS'), p.events.join(','));
    check('בלי SDK', p.sdk() === 0);
  }

  console.log('\n== בקרת-נגד: מחשב ==');
  {
    const p = makePage({ ua: MAC, appleId: true });
    check('מחשב → זרימת החלון (init עם usePopup:true)', !!p.initCfg() && p.initCfg().usePopup === true, JSON.stringify(p.initCfg()));
    check('הכפתור מוצג', p.host().style.display === '' && !!p.btn());
  }

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail) + ' עברו');
  process.exit(fail ? 1 : 0);
})();
