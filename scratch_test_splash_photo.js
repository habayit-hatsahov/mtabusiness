// §536 — splash-photo.js: מסך פתיחה עם תמונה מתחלפת. מריץ את הקובץ החי בתוך jsdom.
// הרצה: node scratch_test_splash_photo.js
// ⚠️ userAgent של jsdom לא נקבע בצורה אמינה (ר' זיכרון §446) – "באפליקציה" מדומה ב-?splashtest=1.
const path = require('path');
const fs = require('fs');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));
const SRC = fs.readFileSync(path.join(__dirname, 'splash-photo.js'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// עמוד חדש; storage = {ls, ss} מועבר בין "עמודים" (jsdom לא חולק storage בין מופעים)
function page({ app = true, storage = { ls: {}, ss: {} } } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://yellowzone.co.il/welcome.html' + (app ? '?splashtest=1' : ''), runScripts: 'outside-only',
  });
  const w = dom.window;
  for (const [k, v] of Object.entries(storage.ls)) w.localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(storage.ss)) w.sessionStorage.setItem(k, v);
  w.eval(SRC);
  const dump = () => {
    const o = { ls: {}, ss: {} };
    for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o.ls[k] = w.localStorage.getItem(k); }
    for (let i = 0; i < w.sessionStorage.length; i++) { const k = w.sessionStorage.key(i); o.ss[k] = w.sessionStorage.getItem(k); }
    return o;
  };
  const el = () => w.document.getElementById('yzSplashPhoto');
  const img = () => el() && el().querySelector('img');
  const load = () => { const i = img(); if (i && i.onload) i.onload(); };
  return { w, el, img, load, dump };
}
const CFG = (urls, enabled = true) => JSON.stringify({ enabled, urls });

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else fail++; console.log((cond ? '✅ ' : '❌ ') + name); }

(async () => {
  // 1. דפדפן רגיל – כלום
  {
    const p = page({ app: false, storage: { ls: { yz_splash_cfg: CFG(['a.jpg', 'b.jpg']) }, ss: {} } });
    ok('דפדפן: אין שכבה', !p.el());
    ok('דפדפן: המונה לא זז', p.dump().ls.yz_splash_idx === undefined);
    p.w.yzSplashPhotoStore({ enabled: true, items: [{ url: 'x.jpg', on: true }] });
    ok('דפדפן: store לא שומר', JSON.parse(p.dump().ls.yz_splash_cfg).urls[0] === 'a.jpg');
  }
  // 2. אפליקציה בלי רשימה – כלום (התקנה טרייה)
  {
    const p = page();
    ok('בלי רשימה: אין שכבה', !p.el());
    ok('בלי רשימה: מסומן done', p.dump().ss.yz_splash_done === '1');
  }
  // 3. כבוי (enabled:false) – כלום
  {
    const p = page({ storage: { ls: { yz_splash_cfg: CFG(['a.jpg'], false) }, ss: {} } });
    ok('כבוי: אין שכבה', !p.el());
  }
  // 4. הבאה בתור + מינימום 1.5 שנ'
  {
    const p = page({ storage: { ls: { yz_splash_cfg: CFG(['a.jpg', 'b.jpg', 'c.jpg']), yz_splash_idx: '1' }, ss: {} } });
    ok('תור: התמונה השנייה', p.img() && /b\.jpg$/.test(p.img().src));
    ok('תור: המונה התקדם ל-2', p.dump().ls.yz_splash_idx === '2');
    p.load();
    ok('נטענה: גלויה', p.img().style.opacity === '1');
    p.w.yzSplashPhotoDone();
    await wait(300);
    ok('done אחרי 0.3 שנ\': עדיין על המסך', p.el() && p.el().style.opacity !== '0');
    await wait(1400);
    ok('אחרי 1.5 שנ\': יורדת', !p.el() || p.el().style.opacity === '0');
  }
  // 5. סוף הרשימה – חוזר להתחלה
  {
    const p = page({ storage: { ls: { yz_splash_cfg: CFG(['a.jpg', 'b.jpg']), yz_splash_idx: '1' }, ss: {} } });
    ok('מעגל: b ואז המונה 0', /b\.jpg$/.test(p.img().src) && p.dump().ls.yz_splash_idx === '0');
  }
  // 6. הדף מוכן לפני שהתמונה נטענה – לא מחכים לה, והיא לא קופצת אחר כך
  {
    const p = page({ storage: { ls: { yz_splash_cfg: CFG(['a.jpg']) }, ss: {} } });
    p.w.yzSplashPhotoDone();
    ok('לא נטענה: יורדת מיד', p.el().style.opacity === '0');
    p.load();
    ok('לא נטענה: לא מופיעה באיחור', p.img().style.opacity !== '1');
  }
  // 7. welcome → home באותה פתיחה: אותה תמונה, המונה לא זז שוב, הזמן ממשיך
  {
    const a = page({ storage: { ls: { yz_splash_cfg: CFG(['a.jpg', 'b.jpg']), yz_splash_idx: '0' }, ss: {} } });
    a.load();
    await wait(1000);
    const st = a.dump();               // "ניווט" – בלי done בעמוד הראשון
    const b = page({ storage: st });
    ok('מעבר: אותה תמונה', /a\.jpg$/.test(b.img().src));
    ok('מעבר: המונה לא זז שוב', b.dump().ls.yz_splash_idx === '1');
    b.load();
    ok('מעבר: מיד, בלי עמעום שני', b.img().style.transition === 'none' && b.img().style.opacity === '1');
    b.w.yzSplashPhotoDone();
    await wait(650);                   // 1000 + 650 > 1500 מאז שהופיעה בעמוד הקודם
    ok('מעבר: המינימום נספר מהעמוד הקודם', b.el().style.opacity === '0');
  }
  // 8. אחרי שירדה – עמוד נוסף באותה פתיחה לא מציג שוב
  {
    const a = page({ storage: { ls: { yz_splash_cfg: CFG(['a.jpg']) }, ss: {} } });
    a.w.yzSplashPhotoDone();
    const b = page({ storage: a.dump() });
    ok('אחרי done: אין שכבה בעמוד הבא', !b.el());
  }
  // 9. store: רק פעילות, לפי הסדר; enabled נשמר
  {
    const p = page();
    p.w.yzSplashPhotoStore({ enabled: true, items: [{ url: 'a.jpg', on: true }, { url: 'b.jpg', on: false }, { url: 'c.jpg' }, { url: '' }] });
    const c = JSON.parse(p.dump().ls.yz_splash_cfg);
    ok('store: a,c בלבד', c.enabled === true && c.urls.join(',') === 'a.jpg,c.jpg');
    p.w.yzSplashPhotoStore(null);
    ok('store(null) = כבוי', JSON.parse(p.dump().ls.yz_splash_cfg).enabled === false);
  }
  // 9ב. מכשיר חדש: נקודת התחלה אקראית בטווח, ו-store טוען מראש בדיוק את מה שיוצג
  {
    const seen = new Set();
    for (let k = 0; k < 40; k++) {
      const p = page({ storage: { ls: { yz_splash_cfg: CFG(['a.jpg', 'b.jpg', 'c.jpg']) }, ss: {} } });
      seen.add(p.img().src.split('/').pop());
    }
    ok('התחלה אקראית: יותר מתמונה אחת ב-40 מכשירים', seen.size > 1);
    const p = page();
    p.w.yzSplashPhotoStore({ enabled: true, items: [{ url: 'a.jpg' }, { url: 'b.jpg' }, { url: 'c.jpg' }] });
    const idx = p.dump().ls.yz_splash_idx;
    const q = page({ storage: { ls: p.dump().ls, ss: {} } });
    ok('store קובע את ההתחלה, והיא מה שמוצג', idx !== undefined && q.img().src.endsWith(['a.jpg', 'b.jpg', 'c.jpg'][+idx]));
  }
  // 10. רשת ביטחון – לעולם לא תקועים
  {
    const p = page({ storage: { ls: { yz_splash_cfg: CFG(['a.jpg']) }, ss: {} } });
    p.load();
    ok('רשת ביטחון: קיימת (12 שנ\')', /setTimeout\(hide, MAX_MS\)/.test(SRC) && /MAX_MS = 12000/.test(SRC));
  }
  console.log(`\n${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
