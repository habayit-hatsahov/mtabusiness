// §474/§474ב — קישור-שיתוף לעסק שורד את ההפניה לכניסה, ונפתח **בלשונית הנכונה**.
// מריץ את שני הקטעים האמיתיים מ-home.html. localStorage משותף; sessionStorage — לכל לשונית.
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

function mkStore() {
  const s = {};
  return { s, getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } };
}
let NOW = 1e12;
const DateShim = { now: () => NOW };
let LS = mkStore();
const tab = () => ({ ss: mkStore() });
// טעינת home.html בלשונית: קודם הסקריפט שבראש הדף, ואז (אם מחובר) הקריאה ב-loadFirebaseData
function loadHome(t, search, loggedIn = true) {
  const loc = { search };
  new Function('localStorage', 'sessionStorage', 'location', 'Date', SAVE)(LS, t.ss, loc, DateShim);
  if (!loggedIn) return undefined; // מופנה ל-welcome לפני loadFirebaseData
  return new Function('localStorage', 'sessionStorage', 'location', 'Date', READ + '; return sharedBizParam;')(LS, t.ss, loc, DateShim);
}
const reset = () => { LS = mkStore(); };

// 1. 🔑 התרחיש של רמי: לשונית ישנה על welcome + לשונית חדשה עם הקישור. הישנה מגיעה ל-home ראשונה.
reset();
const A = tab(), B = tab();
loadHome(B, '?biz=k5qr', false);                    // B: אורח → נשמר, הפניה ל-welcome
NOW += 10000;
ok(loadHome(A, '') === null, 'לשונית ישנה שהגיעה ל-home ראשונה — לא לוקחת את העסק');
ok(loadHome(B, '') === 'k5qr', 'הלשונית שבה נפתח הקישור — פותחת את הכרטיס');
ok(!('hb_shared_biz' in LS.s), 'השמור הכללי נמחק אחרי השימוש');
ok(loadHome(A, '') === null && loadHome(B, '') === null, 'לא נפתח שוב באף לשונית');

// 2. לשונית אחת, כניסה רגילה
reset();
const C = tab();
loadHome(C, '?biz=xray', false); NOW += 60000;
ok(loadHome(C, '') === 'xray', 'לשונית אחת: אורח → כניסה → נפתח');

// 3. נרשם חדש: הלשונית נסגרה, חוזר אחרי 3 ימים בלשונית חדשה
reset();
loadHome(tab(), '?biz=golda', false);
NOW += 3 * 86400000;
ok(loadHome(tab(), '') === 'golda', 'חוזר אחרי 3 ימים בלשונית חדשה — נפתח מהשמור הכללי');
ok(!('hb_shared_biz' in LS.s), 'ונמחק');

// 4. שמור שפג (31 יום) — לא נפתח, ונמחק
reset();
loadHome(tab(), '?biz=old', false);
NOW += 31 * 86400000;
ok(loadHome(tab(), '') === null && !('hb_shared_biz' in LS.s), 'אחרי 31 יום: לא נפתח, ונמחק');

// 5. מחובר שפותח קישור — מהכתובת, ולא נשאר כלום באף אחסון
reset();
const D = tab();
ok(loadHome(D, '?biz=sport') === 'sport', 'מחובר: נפתח מהכתובת');
ok(!('hb_shared_biz' in LS.s) && !('hb_shared_biz' in D.ss.s), 'מחובר: לא נשאר שמור');
NOW += 2 * 3600000;
ok(loadHome(tab(), '') === null, 'מחובר: לשונית אחרת אחרי שעתיים לא פותחת אותו שוב');

// 6. כתובת חדשה גוברת על שמור
reset();
const E = tab();
loadHome(E, '?biz=first', false);
ok(loadHome(E, '?biz=second') === 'second', 'כתובת חדשה גוברת על השמור');

// 7. אחסון חסום — לא נופל, והכתובת עדיין עובדת
const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
try {
  new Function('localStorage', 'sessionStorage', 'location', 'Date', SAVE)(bad, bad, { search: '?biz=a' }, DateShim);
  const v = new Function('localStorage', 'sessionStorage', 'location', 'Date', READ + '; return sharedBizParam;')(bad, bad, { search: '?biz=a' }, DateShim);
  ok(v === 'a', 'אחסון חסום: לא נופל, והכתובת עדיין עובדת');
} catch (e) { ok(false, 'אחסון חסום נפל: ' + e.message); }

console.log(failures ? `\n${failures} נכשלו` : '\nהכל עבר');
process.exit(failures ? 1 : 0);
