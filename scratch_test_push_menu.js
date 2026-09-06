// §420ה — הרנס ל-updatePushMenuItem אחרי שנוסף אליו המסלול הנייטיב.
//
// 🔑 **הבדיקה המרכזית כאן היא רגרסיה, לא הפיצ'ר:** §283 הסתיר את הכפתור מכל גולשי האתר
// בכוונה, והמשתמש ביקש במפורש שאף שינוי לא ייראה לאוהדים עד יום ההשקה. שינוי שמחזיר
// אותו בטעות לדפדפן הוא בדיוק מה שאסור.
//
// ⚠️ הפונקציה נשלפת מ-home.html עצמו לפי תוכן (feedback_test_harness_anchor_by_content).
//
//   node scratch_test_push_menu.js
//
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
const START = 'window.updatePushMenuItem = function() {';
const END = 'window.enableNativePush = async function() {';
const i = html.indexOf(START);
const j = html.indexOf(END, i);
if (i < 0 || j < 0) throw new Error('לא נמצאה updatePushMenuItem ב-home.html');
const block = html.slice(i, j);

// ההרצה אסינכרונית (permissionState מחזיר Promise) — לכן כל מקרה ממתין tick אחד.
function run({ bridge, permission, moduleMissing, moduleThrows }) {
  return new Promise((resolve) => {
    const item = { style: { display: 'INITIAL' } };
    const win = {};
    if (!moduleMissing) {
      win.YZNativePush = {
        available: () => { if (moduleThrows) throw new Error('boom'); return !!bridge; },
        permissionState: () => Promise.resolve(permission || 'prompt'),
      };
    }
    const doc = { getElementById: (id) => (id === 'menuPushItem' ? item : null) };
    const fn = new Function('window', 'document', 'Notification', 'navigator',
      block + '\nreturn window.updatePushMenuItem;');
    let threw = null;
    try {
      fn(win, doc, undefined, {})();
    } catch (e) { threw = e; }
    // tick אחד ל-Promise של permissionState
    setTimeout(() => resolve({ display: item.style.display, threw }), 5);
  });
}

const CASES = [
  {
    t: '🔴 רגרסיה: דפדפן רגיל — הכפתור נשאר מוסתר (§283)',
    o: { bridge: false }, want: 'none',
  },
  {
    t: '🔴 רגרסיה: המודול לא נטען כלל — מוסתר',
    o: { moduleMissing: true }, want: 'none',
  },
  {
    t: 'באפליקציה, ההרשאה עוד לא ניתנה — מוצג',
    o: { bridge: true, permission: 'prompt' }, want: 'flex',
  },
  {
    t: 'באפליקציה, ההרשאה כבר ניתנה — נעלם (כמו במסלול הדפדפן)',
    o: { bridge: true, permission: 'granted' }, want: 'none',
  },
  {
    t: 'באפליקציה, ההרשאה נדחתה — עדיין מוצג (יש הסבר בלחיצה)',
    o: { bridge: true, permission: 'denied' }, want: 'flex',
  },
];

(async () => {
  let pass = 0, fail = 0;
  for (const c of CASES) {
    const r = await run(c.o);
    if (r.threw) { console.log(`✗ ${c.t} — זרקה: ${r.threw.message}`); fail++; continue; }
    if (r.display !== c.want) {
      console.log(`✗ ${c.t} — ציפינו '${c.want}', קיבלנו '${r.display}'`); fail++; continue;
    }
    console.log(`✓ ${c.t}`);
    pass++;
  }
  console.log(`\n${pass}/${CASES.length} עברו${fail ? ` · ${fail} נכשלו` : ''}`);
  process.exit(fail ? 1 : 0);
})();
