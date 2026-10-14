// §532 — fresh-page.js האמיתי (vm, globals מדומים). הרצה: node scratch_test_fresh_page.js
// בודק: אין ניווט בשום מצב (בלי location.reload / href / replace), ריענון המטמון רק כשיש גרסה חדשה.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, 'fresh-page.js'), 'utf8');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  — ' + d : '')); } };
const tick = () => new Promise((r) => setTimeout(r, 20));
// document.lastModified בדפדפן הוא "MM/DD/YYYY hh:mm:ss" בשעון המקומי – כמו כאן, מאותו רגע של ה-Last-Modified בשרת
const p2 = (n) => String(n).padStart(2, '0');
const lmd = new Date('2026-10-14T19:18:53Z');
const LOCAL_MINE = `${p2(lmd.getMonth() + 1)}/${p2(lmd.getDate())}/${lmd.getFullYear()} ${p2(lmd.getHours())}:${p2(lmd.getMinutes())}:${p2(lmd.getSeconds())}`;

function run(o) {
  const calls = [], navs = [];
  const store = o.store || {};
  const ctx = {
    navigator: { serviceWorker: o.sw ? { controller: {} } : undefined },
    performance: { getEntriesByType: () => [{ transferSize: o.transfer || 0 }] },
    document: { lastModified: o.mine || LOCAL_MINE },
    location: {
      href: 'https://yellowzone.co.il/profile.html#x', origin: 'https://yellowzone.co.il',
      reload: () => navs.push('reload'), replace: (u) => navs.push('replace ' + u), assign: (u) => navs.push('assign ' + u),
    },
    sessionStorage: o.noStorage ? { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }
      : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    fetch: (u, init) => {
      calls.push((init && init.method || 'GET') + ' ' + u + ' ' + (init && init.cache));
      if (init && init.method === 'HEAD') {
        if (o.headFail) return Promise.reject(new Error('net'));
        return Promise.resolve({ ok: true, headers: { get: () => o.serverLM || 'Wed, 14 Oct 2026 19:18:53 GMT' } });
      }
      return Promise.resolve({ ok: true });
    },
    Date, String,
  };
  vm.runInNewContext(SRC, ctx);
  return { calls, navs, store };
}
const NEW = 'Wed, 14 Oct 2026 19:24:31 GMT';
const gets = (r) => r.calls.filter((c) => c.startsWith('GET '));

(async () => {
  let r = run({ sw: true }); await tick();
  check('יש SW → אין בקשות', r.calls.length === 0, r.calls.join(' | '));
  r = run({ transfer: 500 }); await tick();
  check('הדף הגיע מהרשת → אין בקשות', r.calls.length === 0);
  r = run({}); await tick();
  check('אותה גרסה → HEAD בלבד', r.calls.length === 1 && r.calls[0].startsWith('HEAD '), r.calls.join(' | '));

  r = run({ serverLM: NEW }); await tick();
  const g = gets(r);
  check('גרסה חדשה → GET עם cache:reload לדף ולדפים הראשיים', g.length === 5 && g.every((c) => c.endsWith(' reload')), g.join(' | '));
  check('הדף הנוכחי (בלי #) ראשון', g[0] === 'GET https://yellowzone.co.il/profile.html reload', g[0]);
  check('בלי כפילות של profile.html', g.filter((c) => c.includes('/profile.html')).length === 1);
  check('🔑 אין ניווט (reload/replace/assign)', r.navs.length === 0, r.navs.join(','));

  const again = run({ serverLM: NEW, store: r.store }); await tick();
  check('אותה לשונית, אותה גרסה → בלי ריענון שני', gets(again).length === 0, gets(again).join(' | '));

  r = run({ serverLM: NEW, noStorage: true }); await tick();
  check('בלי sessionStorage → לא מרעננים', gets(r).length === 0 && r.navs.length === 0);
  r = run({ serverLM: NEW, headFail: true }); await tick();
  check('HEAD נכשל → כלום, בלי זריקה', gets(r).length === 0 && r.navs.length === 0);

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail) + ' עברו');
  process.exit(fail ? 1 : 0);
})();
