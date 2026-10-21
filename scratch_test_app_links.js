// §499 — בדיקות ל-app-links.js: הקוד נטען מהקובץ עצמו, הגשר של Capacitor מדומה.
// הרצה: node scratch_test_app_links.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app-links.js', 'utf8');
let fail = 0;
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); };

// session = sessionStorage משותף בין טעינות-דף באותה הפעלה של האפליקציה
async function load({ capacitor = true, plugin = true, launchUrl = null, ua = 'YellowZoneApp', session = {}, path = null, hook = null } = {}) {
  const nav = [];
  let listener = null;
  const link = { attrs: { target: '_blank' }, removeAttribute(k) { delete this.attrs[k]; } };
  const env = {
    window: {},
    navigator: { userAgent: ua },
    document: { readyState: 'complete', querySelectorAll: (q) => (q.startsWith('a.menu-add-biz') && link.attrs.target ? [link] : []), addEventListener() {} },
    location: path ? { pathname: path, get href() { return 'https://yellowzone.co.il' + path; }, set href(u) { nav.push(u); } } : { set href(u) { nav.push(u); } },
    sessionStorage: { getItem: (k) => (k in session ? session[k] : null), setItem: (k, v) => { session[k] = String(v); } },
    URL, JSON, Date,
  };
  if (hook) env.window.yzOpenSharedBiz = hook;
  if (capacitor) env.window.Capacitor = {
    isPluginAvailable: (p) => plugin && p === 'App',
    addListener: (p, ev, cb) => { if (p === 'App' && ev === 'appUrlOpen') listener = cb; },
    nativePromise: (p, m) => (p === 'App' && m === 'getLaunchUrl' ? Promise.resolve(launchUrl ? { url: launchUrl } : {}) : Promise.reject(new Error('x'))),
  };
  new Function(...Object.keys(env), src)(...Object.values(env));
  await new Promise((r) => setTimeout(r, 5));
  return { nav, fire: (url) => listener && listener({ url }), hasListener: () => !!listener, link };
}

const BIZ = 'https://yellowzone.co.il/open?biz=' + encodeURIComponent('שחר-גייזר');
const TARGET = 'home.html?biz=' + encodeURIComponent('שחר-גייזר');

(async () => {
  let t = await load();
  t.fire(BIZ);
  eq('warm: business link → card', t.nav, [TARGET]);

  t = await load();
  t.fire('https://yellowzone.co.il/download?src=mail');
  eq('warm: /download (mail button) → stays where it is', t.nav, []);

  t = await load();
  t.fire('https://evil.example/open?biz=x');
  eq('other domain → ignored', t.nav, []);

  t = await load();
  t.fire('https://yellowzone.co.il/open.html?biz=x');
  eq('/open.html also works', t.nav, ['home.html?biz=x']);

  // הפעלה קרה: גם getLaunchUrl וגם appUrlOpen מוסרים את אותה כתובת
  const s = {};
  t = await load({ launchUrl: BIZ, session: s });
  t.fire(BIZ);
  eq('cold start: navigates exactly once', t.nav, [TARGET]);
  t = await load({ launchUrl: BIZ, session: s });
  eq('next page in same launch: launch URL not replayed', t.nav, []);

  t = await load({ plugin: false, launchUrl: BIZ });
  eq('no plugin (old build): nothing, no listener', [t.nav, t.hasListener()], [[], false]);

  t = await load({ capacitor: false, ua: 'Mozilla' });
  eq('browser: add-business link keeps target=_blank', t.link.attrs.target, '_blank');
  t = await load({ plugin: false });
  eq('app (even old build): add-business opens in the app', t.link.attrs.target, undefined);

  // §591 — כבר בדף הבית: פותחים במקום, בלי טעינה שנייה
  let got = [];
  t = await load({ path: '/home.html', hook: (b) => { got.push(b); return true; } });
  t.fire(BIZ);
  eq('§591 on home: card opened in place, no reload', [t.nav, got], [[], ['שחר-גייזר']]);
  t = await load({ path: '/home', hook: () => true });
  t.fire(BIZ);
  eq('§591 on /home (no .html): also in place', t.nav, []);
  t = await load({ path: '/home.html', hook: () => false });
  t.fire(BIZ);
  eq('§591 business not found → regular navigation', t.nav, [TARGET]);
  t = await load({ path: '/home.html', hook: () => { throw new Error('x'); } });
  t.fire(BIZ);
  eq('§591 hook throws → regular navigation', t.nav, [TARGET]);
  got = [];
  t = await load({ path: '/welcome.html', hook: (b) => { got.push(b); return true; } });
  t.fire(BIZ);
  eq('§591 on welcome: navigation as before (hook not called)', [t.nav, got], [[TARGET], []]);
  t = await load({ path: '/home.html' });
  t.fire(BIZ);
  eq('§591 home without the hook (old cached page) → navigation', t.nav, [TARGET]);
  t = await load({ path: '/home.html', hook: () => true });
  t.fire('https://yellowzone.co.il/open?conv=abc');
  eq('§591 conversation link from home → profile as before', t.nav, ['profile.html?conv=abc']);

  console.log(fail ? `${fail} FAILED` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
