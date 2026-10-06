// §472 — מריץ את הפונקציות האמיתיות מ-admin-dashboard.html (חילוץ לפי תוכן) מול נתונים מדומים.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'admin-dashboard.html'), 'utf8');
function grab(a, b) {
  const s = src.indexOf(a); if (s < 0) throw new Error('missing ' + a);
  const e = src.indexOf(b, s); if (e < 0) throw new Error('missing end ' + b);
  return src.slice(s, e);
}
const code =
  grab('function helpReqsActive()', 'window.markHelpReqHandled') +
  grab('// ══ §472 — "כתבו לנו — אוהדים"', '// ══ §322 — תקלות כניסה');
const kindsLine = src.match(/\{ key: 'fanMsg',[^\n]*\n/)[0];

let failures = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failures++; };

const env = `
  let HELP_REQUESTS = [], MOCK_FANS = [], taskIssueKind = 'fanMsg', taskSearchQ = '';
  const issuesActive = () => true;
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const escJsAttr = s => String(s).replace(/'/g, "\\\\'");
  const agoLabel = () => 'לפני רגע';
`;
const api = new Function(env + code +
  ';const KIND=[' + kindsLine + '][0];' +
  'return { set:(h,f,q)=>{HELP_REQUESTS=h;MOCK_FANS=f;taskSearchQ=q||"";}, helpReqList, helpReqOpenList, fanMsgList, fanMsgOpenList, fanMsgFilteredList, fanMsgTableHtml, KIND };')();

const t = m => new Date(Date.now() - m * 60000);
const fans = [{ id: 'm1', name: 'איל מנדל', phone: '0501234567', email: 'eyal@x.com', memberNumber: 42 }];
const reqs = [
  { id: 'h1', source: 'stuck', name: 'נתקע', contact: '050', message: 'עזרה', status: 'new', at: t(5) },
  { id: 'f1', source: 'fanMessage', memberId: 'm1', name: 'איל מנדל', contact: 'eyal@x.com', message: 'שורה 1\nשורה 2 <script>alert(1)</script>', status: 'new', device: 'mobile', at: t(3) },
  { id: 'f2', source: 'fanMessage', memberId: 'gone', name: 'נמחק', contact: 'g@x.com', message: 'ישן', status: 'handled', handledNote: 'דיברתי איתו', at: t(60) },
  { id: 'f3', source: 'fanMessage', memberId: 'm1', message: 'חדש יותר', contact: 'eyal@x.com', status: 'new', at: t(1) },
];
api.set(reqs, fans);

ok(api.helpReqList().map(x => x.id).join() === 'h1', 'פניות עזרה לא כוללות הודעות אוהדים');
ok(api.fanMsgList().map(x => x.id).join() === 'f3,f1,f2', 'הודעות אוהדים: פתוחות קודם, חדשות למעלה, טופלו בסוף');
ok(api.fanMsgOpenList().length === 2, 'פתוחות: 2 (טופלה לא נספרת)');
const f1 = api.fanMsgList().find(x => x.id === 'f1');
ok(f1.who === 'איל מנדל' && f1.phone === '0501234567' && f1.num === '#00042', 'השולח נשלף מרשומת החבר (שם, טלפון, מספר)');
ok(api.KIND.key === 'fanMsg' && api.KIND.label === 'כתבו לנו — אוהדים' && api.KIND.open().length === 2, 'שבב "כתבו לנו — אוהדים" ב-ISSUE_KINDS סופר 2');

const html = api.fanMsgTableHtml(api.fanMsgList());
ok(!html.includes('<script>alert') && html.includes('&lt;script&gt;'), 'טקסט ההודעה מוברח (esc)');
ok((html.match(/פתיחת כרטיס האוהד/g) || []).length === 2, 'כפתור כרטיס האוהד רק כשהרשומה קיימת (2 מתוך 3)');
ok(html.includes('הרשומה לא נמצאה'), 'רשומה שנמחקה מסומנת');
ok(html.includes('טופל: דיברתי איתו') && html.includes('↺ החזרה לפתוח'), 'הודעה שטופלה: הערה + החזרה לפתוח');
ok((html.match(/"markHelpReqHandled\('f/g) || []).length === 2, '"טיפלתי" על שתי הפתוחות');

api.set(reqs, fans, '0501234567');
ok(api.fanMsgFilteredList().length === 2, 'חיפוש לפי טלפון מהרשומה מוצא');
api.set(reqs, fans, 'ישן');
ok(api.fanMsgFilteredList().map(x => x.id).join() === 'f2', 'חיפוש לפי תוכן ההודעה');
api.set([], fans);
ok(api.fanMsgTableHtml([]).includes('אין הודעות מאוהדים'), 'מצב ריק');

console.log(failures ? `\n${failures} נכשלו` : '\nהכל עבר');
process.exit(failures ? 1 : 0);
