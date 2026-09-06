// §420 — הרנס-רינדור לשורת יומן המחיקות אחרי שנוספה לה המחיקה העצמית.
//
// 🔑 **בדיקת-תחביר אינה תופסת מזהה חסר, ו-template literal מקונן הוא בדיוק המקום
// שנשבר בו.** אם deletionLogRowHtml זורקת — טאב "מחיקות ושחזור" פשוט לא נפתח,
// והסיידבר ממשיך לעבוד ולכן מטעה. ר' feedback_tab_wont_open_check_render_throw.
//
// ההרנס **מריץ** את הפונקציה האמיתית שנשלפת מ-admin-dashboard.html (לפי תוכן ולא
// לפי מספרי-שורה — feedback_test_harness_anchor_by_content), על חמישה מקרים.
//
//   node scratch_test_deletion_row.js
//
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'admin-dashboard.html'), 'utf8');
const START = 'function deletionLogRowHtml(entry) {';
const END = '\nfunction ';
const i = html.indexOf(START);
if (i < 0) throw new Error('לא נמצאה deletionLogRowHtml');
const j = html.indexOf(END, i + START.length);
if (j < 0) throw new Error('לא נמצא סוף הפונקציה');
const block = html.slice(i, j);

// תלויות שהפונקציה נשענת עליהן, בגרסאות אמיתיות-מספיק כדי שהרינדור יהיה אמיתי.
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const delTs = (t) => (t && typeof t.toDate === 'function' ? t.toDate().toLocaleString('he-IL') : '');
// אותה גזירה של deletion-log.js (הקובץ עצמו הוא ESM עם ייבוא firebase ולכן אינו ניתן ל-require כאן)
const deletionLabel = (coll, data) => {
  const d = data || {};
  if (coll === 'members') {
    return {
      name: `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || '(ללא שם)',
      lines: [d.phone && `טלפון: ${d.phone}`, d.email && `מייל: ${d.email}`].filter(Boolean),
    };
  }
  return { name: d.name || '(ללא שם)', lines: [] };
};
const restoreDeletedRecord = () => {};

const fn = new Function('esc', 'delTs', 'deletionLabel', 'restoreDeletedRecord',
  block + '\nreturn deletionLogRowHtml;')(esc, delTs, deletionLabel, restoreDeletedRecord);

const ts = { toDate: () => new Date('2026-09-06T10:30:00Z') };
const CASES = [
  {
    title: 'מחיקה עצמית עם סיבה',
    entry: { id: 'l1', collectionName: 'members', docId: 'm1', state: 'deleted',
      data: { firstName: 'דנה', lastName: 'כהן', email: 'd@x.com', phone: '0501234567' },
      actorName: 'דנה כהן', source: 'self-delete', selfReason: 'לא מצאתי הטבות באזור שלי',
      deletedAt: ts, selfFlaggedBusinesses: [] },
    expect: (h) => h.includes('מחק/ה את החשבון בעצמו') && h.includes('לא מצאתי הטבות באזור שלי')
                   && !h.includes('נמחק ע"י'),
  },
  {
    title: 'מחיקה עצמית בלי סיבה',
    entry: { id: 'l2', collectionName: 'members', docId: 'm2', state: 'deleted',
      data: { firstName: 'יוסי', lastName: 'לוי' }, actorName: 'יוסי לוי',
      source: 'self-delete', selfReason: '', deletedAt: ts },
    expect: (h) => h.includes('לא נמסרה סיבה') && h.includes('del-reason empty'),
  },
  {
    title: 'מחיקה עצמית של בעל עסק — העסק מסומן',
    entry: { id: 'l3', collectionName: 'members', docId: 'm3', state: 'deleted',
      data: { firstName: 'רון', lastName: 'מזרחי' }, actorName: 'רון מזרחי',
      source: 'self-delete', selfReason: 'סגרתי את העסק', deletedAt: ts,
      selfFlaggedBusinesses: ['biz123', 'biz456'] },
    expect: (h) => h.includes('נשארו עסקים על שמו') && h.includes('biz123') && h.includes('biz456'),
  },
  {
    title: 'מחיקה רגילה ע"י מנהל — הנוסח הישן לא השתנה',
    entry: { id: 'l4', collectionName: 'businesses', docId: 'b1', state: 'deleted',
      data: { name: 'פלאפל הזהב' }, actorName: 'רמי', source: 'admin-dashboard', deletedAt: ts },
    expect: (h) => h.includes('נמחק ע"י רמי') && h.includes('מתוך admin-dashboard')
                   && !h.includes('del-self'),
  },
  {
    title: 'הזרקת HTML בסיבה — מסונן',
    entry: { id: 'l5', collectionName: 'members', docId: 'm5', state: 'deleted',
      data: { firstName: 'א' }, actorName: 'א', source: 'self-delete',
      selfReason: '<img src=x onerror=alert(1)>', deletedAt: ts },
    expect: (h) => h.includes('&lt;img') && !h.includes('<img src=x'),
  },
];

let pass = 0, fail = 0;
for (const c of CASES) {
  let html2 = null, err = null;
  try { html2 = fn(c.entry); } catch (e) { err = e; }
  if (err) { console.log(`✗ ${c.title} — זרקה: ${err.message}`); fail++; continue; }
  if (typeof html2 !== 'string' || !html2.trim()) { console.log(`✗ ${c.title} — לא הוחזר HTML`); fail++; continue; }
  if (!c.expect(html2)) { console.log(`✗ ${c.title} — הפלט אינו כמצופה:\n${html2}\n`); fail++; continue; }
  console.log(`✓ ${c.title}`);
  pass++;
}
console.log(`\n${pass}/${CASES.length} עברו${fail ? ` · ${fail} נכשלו` : ''}`);
process.exit(fail ? 1 : 0);
