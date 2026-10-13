// בדיקת §525 — ה-fetch handler האמיתי של sw.js בניווט: בלי רשת ובלי עותק → דף "מתחברים…" (לא כשל);
// עם עותק → העותק; 5xx → עותק או דף ההמתנה; תקין → התשובה מהרשת.
import fs from 'fs';
import vm from 'vm';
const src = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : String(x).slice(0, 200)); } };

function boot({ net, cachedBody }) {
  const handlers = {};
  const store = new Map();
  if (cachedBody != null) store.set('https://yellowzone.co.il/', new Response(cachedBody, { headers: { 'Content-Type': 'text/html' } }));
  const cache = { match: async (r) => { const v = store.get(typeof r === 'string' ? r : r.url); return v ? v.clone() : undefined; }, put: async (r, res) => { store.set(r.url, res); }, addAll: async () => {} };
  const ctx = {
    self: { location: { origin: 'https://yellowzone.co.il' }, addEventListener: (t, h) => { handlers[t] = h; }, skipWaiting() {}, clients: { claim() {}, matchAll: async () => [] }, registration: {} },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: net, Response, Request, URL, AbortController, setTimeout, clearTimeout, console, Promise, JSON, Date, Math,
  };
  ctx.self.caches = ctx.caches;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return handlers;
}
async function nav(h) {
  let p;
  h.fetch({ request: new Request('https://yellowzone.co.il/', { method: 'GET' }), respondWith: (x) => { p = x; } });
  // Request שנבנה בנוד אינו navigate – מזייפים את mode
  return p;
}
async function navigate(h) {
  let p; const req = new Request('https://yellowzone.co.il/'); Object.defineProperty(req, 'mode', { value: 'navigate' });
  h.fetch({ request: req, respondWith: (x) => { p = x; } });
  return p;
}

console.log('ניווט');
let h = boot({ net: async () => { throw new TypeError('Failed to fetch'); } });
let r = await navigate(h);
check('בלי רשת ובלי עותק → תשובה (לא כשל)', r instanceof Response && r.status === 200);
const body = r ? await r.text() : '';
check('→ דף "מתחברים…" שמנסה שוב לבד', /מתחברים/.test(body) && /location\.reload\(\)/.test(body) && /addEventListener\('online'/.test(body));
check('הדף לא נשמר במטמון', r && r.headers.get('Cache-Control') === 'no-store');

h = boot({ net: async () => { throw new TypeError('Failed to fetch'); }, cachedBody: '<html>עותק שמור</html>' });
r = await navigate(h);
check('בלי רשת עם עותק → העותק', /עותק שמור/.test(await r.text()));

h = boot({ net: async () => new Response('bad gateway', { status: 502 }) });
r = await navigate(h);
check('502 בלי עותק → דף ההמתנה', /מתחברים/.test(await r.text()));

h = boot({ net: async () => new Response('bad gateway', { status: 503 }), cachedBody: '<html>עותק</html>' });
r = await navigate(h);
check('503 עם עותק → העותק', /עותק/.test(await r.text()));

h = boot({ net: async () => new Response('<html>חדש</html>', { status: 200 }) });
r = await navigate(h);
check('רשת תקינה → הדף מהרשת', /חדש/.test(await r.text()));

h = boot({ net: async () => new Response('not found', { status: 404 }) });
r = await navigate(h);
check('404 → מועבר כמו שהוא (לא מוסתר)', r.status === 404);

console.log(`\n${fail ? '✗' : '✅'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
