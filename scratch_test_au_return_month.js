// §488ג — בדיקת "חוזרים לפי חודש" בלוח האפליקציה. הבלוק נשלף מ-admin-dashboard.html עצמו
// ורץ על נתונים מומצאים שהתוצאה שלהם ידועה מראש. הרצה: node scratch_test_au_return_month.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/admin-dashboard.html', 'utf8');
const block = html.slice(html.indexOf('// ═══ §488'), html.indexOf('// מי נחשב "מנהל" — נלקח מרשימת החברים החיה'));
const escFn = html.slice(html.indexOf('function esc(v) {'), html.indexOf('}', html.indexOf('function esc(v) {')) + 1);
let fail = 0;
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); };

// ספטמבר: 4 מכשירים הורידו. A חזר אחרי 3 ימים, B אחרי 20 יום, C לא חזר, D חזר באותו יום בלבד (לא נספר).
// אוקטובר: 2 מכשירים הורידו. E חזר אחרי יומיים, F לא.
const ev = [];
const v = (dev, os, kind, y, m, d, h = 12) => ev.push({ type: 'visit', channel: `app:${os}:${kind}`, blockId: dev, memberId: '', sessionId: 's', createdAt: { toDate: () => new Date(y, m - 1, d, h) } });
v('A', 'ios', 'first', 2026, 9, 5); v('A', 'ios', 'return', 2026, 9, 8);
v('B', 'android', 'first', 2026, 9, 10); v('B', 'android', 'return', 2026, 9, 30);
v('C', 'ios', 'first', 2026, 9, 12);
v('D', 'ios', 'first', 2026, 9, 15, 9); v('D', 'ios', 'return', 2026, 9, 15, 20);
v('E', 'android', 'first', 2026, 10, 2); v('E', 'android', 'return', 2026, 10, 4);
v('F', 'ios', 'first', 2026, 10, 3);
const snapOf = (rows) => ({ size: rows.length, forEach: (f) => rows.forEach((r) => f({ data: () => r })) });
const env = { MOCK_FANS: [], toJsDate: (t) => (t && t.toDate ? t.toDate() : t || null), statsErrLabel: String, statsWithTimeout: (p) => p,
  getDocs: (x) => x, query: (_c, w) => w, collection: () => null, where: (f) => (f === 'type' ? snapOf(ev) : snapOf([])), limit: () => null,
  db: null, renderMain: () => {}, window: {}, console, adminMemberIds: () => new Set() };
const api = new Function(...Object.keys(env), `${escFn}\n${block}\nreturn { loadAppUsage, auCompute, auRetStats, auMonthBounds, auMonthList, auReturnHtml, auState };`)(...Object.values(env));

(async () => {
  await api.loadAppUsage();
  const c = api.auCompute();
  const sep = api.auRetStats(c, ...api.auMonthBounds('2026-09'));
  eq('Sept installs', sep.installs, 4);
  eq('Sept back within 7 (A only; D same-day excluded)', sep.back7, 1);
  eq('Sept back within 30 (A, B)', sep.back30, 2);
  eq('Sept active devices', sep.devs, 4);
  const oct = api.auRetStats(c, ...api.auMonthBounds('2026-10'));
  eq('Oct installs', oct.installs, 2);
  eq('Oct back7', oct.back7, 1);
  eq('months list: newest first, ends at first data month', api.auMonthList(c).slice(-2), ['2026-10', '2026-09']);
  eq('Sept is in list', api.auMonthList(c).includes('2026-09'), true);
  api.auState.os = 'ios';
  eq('Sept iOS only installs (A, C, D)', api.auRetStats(c, ...api.auMonthBounds('2026-09')).installs, 3);
  api.auState.os = 'all';
  api.auState.retMonth = '2026-09';
  const h = api.auReturnHtml(c).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log('   view:', (h.match(/חזרו תוך 7.{0,90}/) || [''])[0]);
  eq('month view shows 30-day %', /50%\s*חזרו תוך 30 יום\s*\(2 מ-4\)/.test(h), true);
  eq('cohort table has both months', /ספטמבר 2026/.test(h) && /אוקטובר 2026/.test(h), true);
  api.auState.retMonth = '1999-01';
  api.auReturnHtml(c);
  eq('unknown month resets to range', api.auState.retMonth, '');
  console.log(fail ? `${fail} FAILED` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
