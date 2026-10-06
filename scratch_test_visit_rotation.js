// מריץ את הקוד האמיתי מ-home.html (חילוץ לפי תוכן): מנגנון הביקור + arrangeCategory.
const fs = require('fs');
const src = fs.readFileSync(''+require('path').join(__dirname,'home.html')+'', 'utf8');
function grab(a, b) {
  const s = src.indexOf(a); if (s < 0) throw new Error('missing ' + a);
  const e = src.indexOf(b, s); if (e < 0) throw new Error('missing end ' + b);
  return src.slice(s, e);
}
const code =
  grab('function _seedFromString(str)', '// ── RENDER SECTIONS') +
  grab('function arrangeCategory(list, cat)', '// בונה מחדש את תוכן הגריד');

let failures = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failures++; };

// "טעינת דף" = הקשר חדש עם אותו localStorage ושעון מדומה
function loadPage(store, now, opts = {}) {
  const listeners = {};
  const doc = { visibilityState: 'visible', addEventListener: (t, f) => { listeners[t] = f; } };
  const ls = opts.throwing
    ? { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }
    : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const clock = { t: now };
  const ctx = { renders: 0 };
  const fn = new Function('localStorage', 'document', 'Date', 'ctx',
    'var businesses=[1];function renderSections(){ctx.renders++}function refreshOpenFeed(){}' + code +
    ';return {arrangeCategory,_visitOffset,_visitState};');
  const FakeDate = { now: () => clock.t };
  const api = fn(ls, doc, FakeDate, ctx);
  return { ...api, clock, doc, fire: t => listeners[t](), ctx };
}

const list = Array.from({ length: 10 }, (_, i) => ({ id: 'b' + i + 'x' + (i * 7919 % 97) }));
const top = (p) => p.arrangeCategory(list, 'food').slice(0, 4).map(b => b.id).join(',');
const MIN = 60 * 1000;
const store = {};
let T = 1e12;

const p1 = loadPage(store, T);
const t1 = top(p1);
const sec1 = p1._visitOffset('sec:featured');
ok(top(p1) === t1, 'אותו ביקור, פתיחה חוזרת של הקטגוריה — אותו סדר');
ok(top(p1) === p1.arrangeCategory([...list].reverse(), 'food').slice(0, 4).map(b => b.id).join(','), 'סדר לא תלוי בסדר ה-snapshot');

p1.doc.visibilityState = 'hidden'; p1.fire('visibilitychange');
const p2 = loadPage(store, T + 5 * MIN); // חזרה מפרופיל אחרי 5 דק'
ok(top(p2) === t1 && p2._visitOffset('sec:featured') === sec1, 'טעינה מחדש אחרי 5 דק\' — אותו ביקור, אותו סדר');

const p3 = loadPage(store, T + 5 * MIN + 31 * MIN); // חזרה אחרי 31 דק'
const t3 = top(p3);
ok(t3 !== t1, 'חזרה אחרי 31 דק\' — ביקור חדש, ראש הקטגוריה התחלף');
ok(p3._visitOffset('sec:featured') === sec1 + 4, 'הסקשנים מתקדמים ב-4 לביקור');

// כיסוי: 3 ביקורים רצופים מכסים את כל 10 בראש-4
const seen = new Set();
let t = T + 100 * 60 * MIN;
for (let i = 0; i < 3; i++) { t += 40 * MIN; top(loadPage(store, t)).split(',').forEach(x => seen.add(x)); }
ok(seen.size === 10, '3 ביקורים רצופים: ' + seen.size + '/10 עסקים הגיעו ל-4 הראשונים');

// אפליקציה שנשארה פתוחה ברקע: חזרה אחרי שעה → ביקור חדש + רינדור
const p4 = loadPage(store, t + 40 * MIN);
const t4 = top(p4);
p4.doc.visibilityState = 'hidden'; p4.fire('visibilitychange');
p4.clock.t += 10 * MIN; p4.doc.visibilityState = 'visible'; p4.fire('visibilitychange');
ok(p4.ctx.renders === 0 && top(p4) === t4, 'חזרה מהרקע אחרי 10 דק\' — בלי רינדור, אותו סדר');
p4.doc.visibilityState = 'hidden'; p4.fire('visibilitychange');
p4.clock.t += 60 * MIN; p4.doc.visibilityState = 'visible'; p4.fire('visibilitychange');
ok(p4.ctx.renders === 1 && top(p4) !== t4, 'חזרה מהרקע אחרי שעה — ביקור חדש ורינדור אחד');

// עסק חדש לא נכנס ראשון באופן שיטתי
let firsts = 0;
for (let s = 0; s < 200; s++) {
  const st = {}; const p = loadPage(st, T);
  if (p.arrangeCategory([...list, { id: 'zzNEW' }], 'food')[0].id === 'zzNEW') firsts++;
}
ok(firsts < 40, 'עסק חדש ראשון ב-' + firsts + '/200 מבקרים (צפוי ~18)');

// מבקרים שונים לא רואים אותו ראש
const heads = new Set();
for (let s = 0; s < 30; s++) heads.add(loadPage({}, T).arrangeCategory(list, 'food')[0].id);
ok(heads.size >= 6, 'ראש-הרשימה מתפזר בין מבקרים: ' + heads.size + ' עסקים שונים ב-30 מבקרים');

// localStorage זורק
try { const p = loadPage({}, T, { throwing: true }); top(p); ok(true, 'localStorage חסום — לא נופל'); }
catch (e) { ok(false, 'localStorage חסום נפל: ' + e.message); }

console.log(failures ? `\n${failures} נכשלו` : '\nהכל עבר');
process.exit(failures ? 1 : 0);
