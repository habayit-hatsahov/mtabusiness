// §591 — מריץ את sw.js האמיתי: ניווט ל-home.html?biz= בכשל-רשת מקבל את home.html השמור, לא "מתחברים…".
// node scratch_test_sw_nav_ignore_search.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const ORIGIN = 'https://yellowzone.co.il';
const CACHE = (SRC.match(/const CACHE_NAME = '([^']+)'/) || [])[1];

let failures = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failures++; };
const mkRes = (body, status = 200) => ({ ok: status < 400, status, body, headers: { get: () => 'text/html' }, clone() { return mkRes(body, status); } });
const mkReq = p => ({ url: ORIGIN + '/' + p, method: 'GET', mode: 'navigate' });

// cache.match עם ignoreSearch — כמו בדפדפן: משווה בלי ה-query
function makeCaches(store) {
  const open = async name => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      match: async (r, o) => {
        if (m.has(r.url)) return m.get(r.url);
        if (o && o.ignoreSearch) { const base = r.url.split('?')[0]; for (const [u, v] of m) if (u.split('?')[0] === base) return v; }
        return undefined;
      },
      put: async (r, res) => { m.set(r.url, res); },
      add: async () => {}, addAll: async () => {},
      keys: async () => [...m.keys()].map(u => ({ url: u })),
    };
  };
  return { open, keys: async () => [...store.keys()], delete: async n => store.delete(n), match: async () => undefined };
}

function loadSW(store, net) {
  const handlers = {};
  const sandbox = {
    self: { location: { origin: ORIGIN }, addEventListener: (t, f) => { handlers[t] = f; },
            skipWaiting() {}, clients: { claim: async () => {} }, registration: {} },
    caches: makeCaches(store),
    fetch: async (r, o) => net(r, o),
    Response: class { constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; this.ok = this.status < 400; this.headers = { get: () => 'text/html' }; } clone() { return this; } },
    URL, AbortController, setTimeout, clearTimeout, console, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return async req => {
    let p = null;
    handlers.fetch({ request: req, respondWith: x => { p = x; }, waitUntil() {} });
    return p ? await p : undefined;
  };
}
const isRetryPage = r => !!r && typeof r.body === 'string' && r.body.includes('מתחברים');

(async () => {
  ok(!!CACHE, 'CACHE_NAME נמצא: ' + CACHE);
  const store = new Map([[CACHE, new Map([[ORIGIN + '/home.html', mkRes('HOME-CACHED')]])]]);

  // 1. הרשת נופלת (כמו בפתיחה קרה) — home.html?biz= מקבל את home.html השמור
  let fetchSW = loadSW(store, async () => { throw new Error('offline'); });
  let r = await fetchSW(mkReq('home.html?biz=' + encodeURIComponent('אצל-אדרי')));
  ok(r && r.body === 'HOME-CACHED', 'כשל רשת: home.html?biz= ← העותק של home.html (' + (isRetryPage(r) ? 'מתחברים…' : r && r.body) + ')');

  // 2. 5xx — אותו דבר
  fetchSW = loadSW(store, async () => mkRes('ERR', 503));
  r = await fetchSW(mkReq('home.html?biz=x'));
  ok(r && r.body === 'HOME-CACHED', '503: home.html?biz= ← העותק של home.html');

  // 3. רשת תקינה — הדף מהרשת, לא מהמטמון
  fetchSW = loadSW(store, async () => mkRes('HOME-FRESH'));
  r = await fetchSW(mkReq('home.html?biz=x'));
  ok(r && r.body === 'HOME-FRESH', 'רשת תקינה: הדף החדש מהרשת');

  // 4. דף אחר שלא נשמר — עדיין "מתחברים…", לא home.html
  fetchSW = loadSW(store, async () => { throw new Error('offline'); });
  r = await fetchSW(mkReq('profile.html?conv=1'));
  ok(isRetryPage(r), 'דף שלא נשמר בכלל (profile.html) → "מתחברים…", לא דף אחר');

  // 5. התאמה מדויקת עדיין קודמת
  store.get(CACHE).set(ORIGIN + '/home.html?biz=y', mkRes('HOME-Y'));
  r = await fetchSW(mkReq('home.html?biz=y'));
  ok(r && r.body === 'HOME-Y', 'כתובת מדויקת שנשמרה קודמת לכללית');

  console.log(failures ? `✗ ${failures} נכשלו` : '✓ הכל עבר');
  process.exit(failures ? 1 : 0);
})();
