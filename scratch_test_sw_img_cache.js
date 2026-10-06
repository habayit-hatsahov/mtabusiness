// §471 — מריץ את sw.js האמיתי מול caches/fetch מדומים. node scratch_test_sw_img_cache.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const ORIGIN = 'https://yellowzone.co.il';

let failures = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failures++; };

function mkRes(body, okFlag = true) {
  return { ok: okFlag, body, clone() { return mkRes(body, okFlag); } };
}
function mkReq(p, mode = 'no-cors') { return { url: ORIGIN + '/' + p, method: 'GET', mode }; }

// מטמונים משותפים בין "גרסאות" — כמו בדפדפן אמיתי
function makeCaches(store) {
  const open = async name => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      match: async r => m.get(r.url),
      put: async (r, res) => { m.set(r.url, res); },
      add: async () => {},
      keys: async () => [...m.keys()].map(u => ({ url: u })),
    };
  };
  return { open, keys: async () => [...store.keys()], delete: async n => store.delete(n) };
}

function loadSW(store, net) {
  const handlers = {};
  const sandbox = {
    self: { location: { origin: ORIGIN }, addEventListener: (t, f) => { handlers[t] = f; },
            skipWaiting() {}, clients: { claim: async () => {} }, registration: {} },
    caches: makeCaches(store),
    fetch: async r => net(r),
    URL, AbortController, setTimeout, clearTimeout, console, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const run = async (type, extra = {}) => {
    let p = null;
    const ev = { ...extra, waitUntil: x => { p = x; }, respondWith: x => { p = x; } };
    handlers[type](ev);
    return p ? await p : undefined;
  };
  return { run, ctx: sandbox };
}

(async () => {
  const store = new Map();
  // מצב לפני: מטמון v165 עם לוגו ואייקון, ו-JS
  store.set('yz-shell-v165', new Map([
    [ORIGIN + '/images/yellowzone-logo-horizontal.png', mkRes('logo-old')],
    [ORIGIN + '/images/categories/hotdog-navy.png', mkRes('hotdog-old')],
    [ORIGIN + '/categories.js', mkRes('js-old')],
  ]));

  let netDown = false, calls = 0;
  const net = r => { calls++; if (netDown) return Promise.reject(new TypeError('net')); return Promise.resolve(mkRes('fresh:' + r.url.slice(ORIGIN.length))); };
  const sw = loadSW(store, net);
  const CACHE_NAME = vm.runInContext('CACHE_NAME', sw.ctx);
  const IMG_CACHE = vm.runInContext('IMG_CACHE', sw.ctx);

  await sw.run('install');
  await sw.run('activate');
  ok(!store.has('yz-shell-v165'), 'המטמון הישן נמחק');
  ok(store.has(IMG_CACHE) && store.get(IMG_CACHE).size === 2, 'שתי התמונות עברו ל-' + IMG_CACHE + ' לפני המחיקה');
  ok(!store.get(IMG_CACHE).has(ORIGIN + '/categories.js'), 'JS לא עבר למטמון התמונות');

  // רשת נופלת מיד אחרי העדכון — התמונה עדיין מוגשת (זה בדיוק הכשל של 6.10)
  netDown = true;
  const logo = await sw.run('fetch', { request: mkReq('images/yellowzone-logo-horizontal.png') });
  ok(logo && logo.body === 'logo-old', 'רשת למטה אחרי עדכון — הלוגו מוגש מהמטמון');

  // עדכון גרסה נוסף (v167) — מטמון התמונות שורד
  netDown = false;
  store.get(CACHE_NAME) || store.set(CACHE_NAME, new Map());
  store.get(CACHE_NAME).set(ORIGIN + '/home.html', mkRes('html'));
  const src2 = SRC.replace(/const CACHE_NAME = 'yz-shell-v\d+'/, "const CACHE_NAME = 'yz-shell-v999'");
  ok(src2 !== SRC, 'החלפת CACHE_NAME בבדיקה עבדה');
  const handlers2 = {};
  const sb2 = { ...sw.ctx, self: { ...sw.ctx.self, addEventListener: (t, f) => { handlers2[t] = f; } } };
  vm.createContext(sb2); vm.runInContext(src2, sb2);
  let p; handlers2.activate({ waitUntil: x => { p = x; } }); await p;
  ok(!store.has(CACHE_NAME), 'באמפ נוסף: מטמון המעטפת הקודם נמחק');
  ok(store.has(IMG_CACHE) && store.get(IMG_CACHE).has(ORIGIN + '/images/categories/hotdog-navy.png'), 'באמפ נוסף: מטמון התמונות שרד');

  // stale-while-revalidate: מוגש הישן, ונכתב החדש לפעם הבאה
  await sw.run('fetch', { request: mkReq('images/categories/hotdog-navy.png') });
  await new Promise(r => setTimeout(r, 0));
  ok(store.get(IMG_CACHE).get(ORIGIN + '/images/categories/hotdog-navy.png').body === 'fresh:/images/categories/hotdog-navy.png', 'תמונה מתרעננת ברקע');

  // ניסיון חוזר: כשל ראשון, הצלחה שנייה, בלי מטמון
  let n = 0;
  const flaky = r => (++n === 1 ? Promise.reject(new TypeError('x')) : Promise.resolve(mkRes('ok2')));
  const sw3 = loadSW(store, flaky);
  const r3 = await sw3.run('fetch', { request: mkReq('images/categories/fanbus-yellow.png') });
  ok(r3 && r3.body === 'ok2' && n === 2, 'תמונה בלי מטמון: כשל ראשון → ניסיון שני הצליח');

  // JS לא מקבל ניסיון חוזר ונשמר במטמון המעטפת
  let m = 0;
  const sw4 = loadSW(store, r => { m++; return Promise.resolve(mkRes('js')); });
  await sw4.run('fetch', { request: mkReq('categories.js') });
  await new Promise(r => setTimeout(r, 0));
  ok(m === 1 && store.get(vm.runInContext('CACHE_NAME', sw4.ctx)).has(ORIGIN + '/categories.js'), 'JS — במטמון המעטפת, כמו קודם');

  ok(!/^yz-shell-/.test(IMG_CACHE), 'שם מטמון התמונות לא מתחיל ב-yz-shell- (hbProbeEnv)');

  console.log(failures ? `\n${failures} נכשלו` : '\nהכל עבר');
  process.exit(failures ? 1 : 0);
})();
