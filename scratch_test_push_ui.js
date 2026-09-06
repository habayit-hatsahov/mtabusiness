// §420ד — הרנס-רינדור לטאב "פוש לאפליקציה" במרכז ההודעות.
//
// 🔑 **פונקציית-רינדור שזורקת = "הטאב לא נפתח", בלי שגיאה על המסך והסיידבר ממשיך לעבוד
// ולכן מטעה.** ר' feedback_tab_wont_open_check_render_throw. בדיקת-תחביר אינה תופסת מזהה
// חסר, וכאן יש template literal מקונן בשלוש רמות.
//
// ⚠️ הפונקציה **נשלפת מ-admin-dashboard.html עצמו** לפי תוכן, לא לפי מספרי-שורה
// (feedback_test_harness_anchor_by_content).
//
//   node scratch_test_push_ui.js
//
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'admin-dashboard.html'), 'utf8');
const START = 'function nativePushTabHtml() {';
const END = '// ⚠️ **אישור לפני שליחה';
const i = html.indexOf(START);
const j = html.indexOf(END, i);
if (i < 0 || j < 0) throw new Error('לא נמצאה nativePushTabHtml ב-admin-dashboard.html');
const block = html.slice(i, j);

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render({ fans, selected, draft, sending, result, audienceType }) {
  const fn = new Function(
    'esc', 'MOCK_FANS', 'selectedFanIds', 'broadcastAudienceType', 'pushDraft', 'pushSending', 'pushResult',
    block + '\nreturn nativePushTabHtml;'
  );
  return fn(esc, fans, new Set(selected || []), audienceType || 'fans',
            draft || { title: '', body: '', link: '' }, !!sending, result || null)();
}

const FANS = [
  { id: 'f1', status: 'approved' }, { id: 'f2', status: 'approved' },
  { id: 'f3', status: 'pending' },  { id: 'f4', status: 'approved' },
];

const CASES = [
  {
    t: 'בלי בחירה — כל המאושרים (3 מתוך 4)',
    o: { fans: FANS },
    check: (h) => h.includes('כל 3 האוהדים המאושרים') && h.includes('שלח ל-3 אוהדים'),
  },
  {
    t: 'עם בחירה ידנית — הכפתור סופר את הנבחרים',
    o: { fans: FANS, selected: ['f1', 'f2'] },
    check: (h) => h.includes('קהל נבחר ידנית') && h.includes('שלח ל-2 אוהדים'),
  },
  {
    t: 'בזמן שליחה — הכפתור נעול',
    o: { fans: FANS, sending: true },
    check: (h) => h.includes('disabled') && h.includes('שולח'),
  },
  {
    t: 'אין אוהדים כלל — הכפתור נעול ולא שולח לאפס',
    o: { fans: [] },
    check: (h) => h.includes('disabled'),
  },
  {
    // 🔑 הבדיקה שבשבילה הסיכום נכתב: מסך שמראה רק "נשלח" היה נותן למנהל להאמין שההודעה הגיעה
    t: 'סיכום עם אפס רשומים — מוצגת אזהרה מפורשת',
    o: { fans: FANS, result: { recipients: 3, withTokens: 0, devicesSent: 0, devicesRemoved: 0 } },
    check: (h) => h.includes('אף אחד מהנמענים אינו רשום לפוש עדיין'),
  },
  {
    t: 'סיכום עם שליחה מוצלחת + ניקוי טוקנים',
    o: { fans: FANS, result: { recipients: 3, withTokens: 2, devicesSent: 3, devicesRemoved: 1 } },
    check: (h) => h.includes('<b>2</b>') && h.includes('<b>3</b>') && h.includes('1 טוקנים מתים נוקו')
                  && !h.includes('אף אחד מהנמענים'),
  },
  {
    t: 'הזרקת HTML בטיוטה — מסוננת',
    o: { fans: FANS, draft: { title: '<img src=x onerror=alert(1)>', body: 'ok', link: '' } },
    check: (h) => h.includes('&lt;img') && !h.includes('<img src=x'),
  },
];

let pass = 0, fail = 0;
for (const c of CASES) {
  let out = null, err = null;
  try { out = render(c.o); } catch (e) { err = e; }
  if (err) { console.log(`✗ ${c.t} — זרקה: ${err.message}`); fail++; continue; }
  if (typeof out !== 'string' || !out.trim()) { console.log(`✗ ${c.t} — לא הוחזר HTML`); fail++; continue; }
  if (!c.check(out)) { console.log(`✗ ${c.t} — הפלט אינו כמצופה`); fail++; continue; }
  console.log(`✓ ${c.t}`);
  pass++;
}
console.log(`\n${pass}/${CASES.length} עברו${fail ? ` · ${fail} נכשלו` : ''}`);
process.exit(fail ? 1 : 0);
