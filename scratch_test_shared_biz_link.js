// §474 — קישור-שיתוף לעסק שורד את ההפניה לכניסה. מריץ את שני הקטעים האמיתיים מ-home.html.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
function grab(a, b) {
  const s = src.indexOf(a); if (s < 0) throw new Error('missing ' + a);
  const e = src.indexOf(b, s); if (e < 0) throw new Error('missing end ' + b);
  return src.slice(s, e);
}
const SAVE = grab('    try {\n      var _hbSharedBiz', "    if (!localStorage.getItem('hb_memberId'))");
const READ = grab('    let sharedBizParam', '    const sharedBiz = sharedBizParam');

let failures = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failures++; };

const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let NOW = 1e12;
const DateShim = { now: () => NOW };
function page(search) {
  const location = { search };
  new Function('localStorage', 'location', 'Date', SAVE)(localStorage, location, DateShim);
  return new Function('localStorage', 'location', 'Date', READ + '; return sharedBizParam;')(localStorage, location, DateShim);
}
function saveOnly(search) { new Function('localStorage', 'location', 'Date', SAVE)(localStorage, { search }, DateShim); }

// 1. אורח פותח קישור → נשמר לפני ההפניה; אחרי הכניסה (בלי פרמטר) — נפתח, ונמחק
saveOnly('?biz=shawarma-rami');
ok(JSON.parse(store.hb_shared_biz).v === 'shawarma-rami', 'אורח: העסק נשמר לפני ההפניה ל-welcome');
NOW += 5 * 60000;
ok(page('') === 'shawarma-rami', 'אחרי כניסה (home.html בלי פרמטר): העסק שנשמר נפתח');
ok(!('hb_shared_biz' in store), 'נמחק אחרי שימוש');
ok(page('') === null, 'כניסה נוספת: לא נפתח שוב');

// 2. נרשם חדש שאושר אחרי 10 ימים — נפתח; אחרי 31 — לא
saveOnly('?biz=xray');
NOW += 10 * 86400000;
ok(page('') === 'xray', 'אחרי 10 ימים: עדיין נפתח');
saveOnly('?biz=old');
NOW += 31 * 86400000;
ok(page('') === null && !('hb_shared_biz' in store), 'אחרי 31 יום: לא נפתח, ונמחק');

// 3. מחובר שפותח קישור — הכתובת קובעת, ולא נשאר כלום
ok(page('?biz=golda') === 'golda' && !('hb_shared_biz' in store), 'מחובר: נפתח מהכתובת, לא נשאר שמור');

// 4. הכתובת גוברת על שמור ישן
saveOnly('?biz=first');
ok(page('?biz=second') === 'second', 'כתובת חדשה גוברת על שמור');

// 5. localStorage זורק — לא מפיל
const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
try {
  new Function('localStorage', 'location', 'Date', SAVE)(bad, { search: '?biz=a' }, DateShim);
  const v = new Function('localStorage', 'location', 'Date', READ + '; return sharedBizParam;')(bad, { search: '?biz=a' }, DateShim);
  ok(v === 'a', 'localStorage חסום: לא נופל, והכתובת עדיין עובדת');
} catch (e) { ok(false, 'localStorage חסום נפל: ' + e.message); }

console.log(failures ? `\n${failures} נכשלו` : '\nהכל עבר');
process.exit(failures ? 1 : 0);
