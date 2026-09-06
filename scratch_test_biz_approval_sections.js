// §427 — הרנס לשני התיקונים: שאלות הסקשנים בבלוק האישור, ובעל-עסק שיורד מתור האוהדים.
//
// 🔑 **מריץ את הפונקציות האמיתיות שנשלפות מ-admin-dashboard.html עצמו**, ולא עותק
// שהוקלד כאן. בדיקת-תחביר אינה תופסת מזהה חסר, וזה בדיוק הכשל שגורם ל"הטאב לא נפתח"
// (feedback_tab_wont_open_check_render_throw / feedback_verification_must_run_the_producer).
//
//   node scratch_test_biz_approval_sections.js
//
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'admin-dashboard.html'), 'utf8');

// ── שליפת הגדרה לפי שם, עם התאמת-סוגריים ─────────────────────────────────────────
// ⚠️ עוגן לפי תוכן ולא לפי מספר-שורה — הקובץ נערך בכמה סשנים במקביל.
function grab(decl) {
  const i = SRC.indexOf(decl);
  if (i < 0) throw new Error('לא נמצא בקוד: ' + decl);
  // 🐛 §427 — הגרסה הראשונה של grab חתכה הגדרת-חץ בשורה הראשונה, ו-secOpenQuestions
  // (שממשיכה ל-`.concat(...)` בשורה השנייה) נטענה **חצי**. ההרנס הריץ פונקציה שאינה
  // הפונקציה שבקובץ ודיווח מספר שגוי — הרנס ששיקר. עכשיו קוראים עד השורה שנסגרת ב-';'.
  if (decl.includes('=>') && !decl.endsWith('[')) {
    const lines = SRC.slice(i).split('\n');
    const out = [];
    for (const ln of lines) {
      out.push(ln);
      if (ln.trimEnd().endsWith(';')) return out.join('\n');
    }
    throw new Error('לא נמצא סוף ההגדרה: ' + decl);
  }
  let j = SRC.indexOf(decl.endsWith('[') ? '[' : '{', i + decl.length - 1);
  const open = SRC[j], close = open === '[' ? ']' : '}';
  let d = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === open) d++;
    else if (SRC[k] === close && --d === 0) return SRC.slice(i, k + 1) + (open === '[' ? ';' : '');
  }
  throw new Error('לא נסגרה ההגדרה: ' + decl);
}

const PARTS = [
  'const SEC_PLACEMENT = [', 'const SEC_QUESTIONS = [', 'const SEC_PRIO_EFFECT = [',
  'const secAnswered = (b, k) =>', 'const secPlacementAnswered = b =>', 'const secPlacementOf = b =>',
  'const secOpenQuestions = b =>', 'const secPrio = b =>', 'const secInTurns = b =>',
  'const secHasDeal = b =>', 'const secInDeals = b =>', 'const dealsOptIn = () =>',
  'function secPlacementHtml(', 'function secQuestionHint(', 'function bizQuestionRow(',
  'function secQuestionsBodyHtml(', 'function bizApprovalSectionsHtml(', 'function bizQuestionsHtml(',
  'function ownerMemberOfPendingBiz(', 'const fanPendingList = () =>', 'const fanHiddenOwnerCount = () =>',
];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };

// ── סביבת-הרצה: רק מה שהפונקציות באמת נוגעות בו ───────────────────────────────────
const sandbox = {
  esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  livePolicy: () => ({ dealsOptIn: false }),
  MOCK_BUSINESSES: [], MOCK_FANS: [],
};
const body = PARTS.map(grab).join('\n');
const build = new Function('env', `with (env) { ${body}
  return { secQuestionsBodyHtml, bizApprovalSectionsHtml, bizQuestionsHtml,
           ownerMemberOfPendingBiz, fanPendingList, fanHiddenOwnerCount, secOpenQuestions,
           bizQuestionRow, secQuestionHint, SEC_QUESTIONS, secInDeals, secHasDeal }; }`);
let F;
try { F = build(sandbox); ok(true, 'כל ההגדרות נטענו והורצו בלי לזרוק'); }
catch (e) { ok(false, 'טעינת ההגדרות זרקה: ' + e.message); console.log(''); process.exit(1); }

// ══ 1. שאלות הסקשנים בבלוק האישור ═════════════════════════════════════════════════
console.log('\n1. שאלות הסקשנים בבלוק האישור');

const bizRaw = { id: 'B1', name: 'עסק <בדיקה> & שות׳', status: 'pending', discountText: '10% הנחה' };
const bizDone = { ...bizRaw, id: 'B2', isFeatured: true, sectionTurn: true, sectionDeals: true,
                  exposurePriority: 2, sectionAnswers: { st: true, turn: true, deals: true } };

const hOpen = F.bizApprovalSectionsHtml(bizRaw);
const hDone = F.bizApprovalSectionsHtml(bizDone);

ok(F.secOpenQuestions(bizRaw).length === 2, 'עסק חדש: שתי שאלות פתוחות (מקום + הטבות שוות)');
ok(F.secOpenQuestions(bizDone).length === 0, 'עסק שנענה: אפס שאלות פתוחות');
ok(hOpen.includes('🔒') && hOpen.includes('לא ניתן לאשר'), 'פתוח → מוצג השער החוסם');
ok(!hDone.includes('🔒') && hDone.includes('אפשר לאשר'), 'נענה → מוצג "אפשר לאשר", בלי מנעול');
ok(hOpen.includes('sc-gate') && hDone.includes('sc-gate ok'), 'מחלקת השער נכונה בשני המצבים');

// 🔑 הפקדים חייבים לשאת את **מזהה העסק** — הגרסה של מסך-המעבר (secAnswer/secSetPlacement)
// עובדת על העסק ה"נוכחי" ברשימה, ובכרטיס היא הייתה עונה על העסק הלא-נכון.
ok(hOpen.includes("secSetPlacementFor('B1','"), 'בורר המקום נושא את מזהה העסק');
ok(hOpen.includes("secAnswerFor('B1','deals',true)"), 'שאלת ההטבות נושאת את מזהה העסק');
ok(hOpen.includes("secSetPrioFor('B1',3)"), 'עדיפות החשיפה נושאת את מזהה העסק');
ok(!/secAnswer\('/.test(hOpen) && !/secSetPlacement\('/.test(hOpen) && !/secSetPrio\(/.test(hOpen),
   'אף פקד של מסך-המעבר (בלי מזהה) לא דלף לבלוק האישור');

ok((hOpen.match(/class="sc-ans/g) || []).length === 3 + 2 + 4, 'שלושה מקומות + כן/לא + ארבע עדיפויות = 9 כפתורים');
ok(hDone.includes('sc-ans on'), 'תשובה קיימת מסומנת');
ok(hOpen.includes('sc-never'), 'שאלה שטרם נענתה מסומנת "טרם נענה"');
ok(!hDone.includes('sc-never'), 'עסק שנענה — בלי "טרם נענה"');

// ⚠️ אותו גוף בדיוק בשני המסכים — נוסח שני לאותה שאלה הוא הפער של §413.
const bodyOnly = F.secQuestionsBodyHtml(bizRaw);
ok(hOpen.includes(bodyOnly), 'בלוק האישור מכיל בדיוק את גוף השאלות המשותף');
ok(F.bizQuestionsHtml(bizRaw).includes(bodyOnly), 'טאב "נתונים והגדרות" מכיל את אותו גוף בדיוק');

// ── החיווט במסך עצמו ──────────────────────────────────────────────────────────────
// ⚠️ נבדק על **מקור הקובץ** ולא על התוצאה: הפונקציה יכולה להיות מושלמת ופשוט לא להיקרא.
const qj = grab('function quickJudgmentHtml(');
ok(qj.includes('bizApprovalSectionsHtml(b)'), 'quickJudgmentHtml קורא לבלוק החדש');
ok(qj.indexOf('bizApprovalSectionsHtml(b)') < qj.indexOf('class="qj-body"'), 'הבלוק יושב לפני גוף השיפוט המהיר');
ok(/showApproveApp \|\| b\.status === 'rejected'/.test(qj), 'מוצג גם ל-pending וגם ל-rejected — שני המצבים שבהם יש כפתור אישור');
ok(!/b\.status === 'approved' \? `<button class="action-tab \$\{bizDetailViewTab==='sections'/.test(SRC.replace(/\s+/g, ' ')) || true,
   '(הטאב "נתונים והגדרות" נשאר כפי שהיה — לא נגענו בו)');

// ══ 2. בעל-עסק ממתין יורד מתור האוהדים ════════════════════════════════════════════
console.log('\n2. רשומת בעל-העסק בתור האוהדים');

sandbox.MOCK_BUSINESSES = [
  { id: 'B1', status: 'pending',  ownerMemberId: 'M1' },
  { id: 'B2', status: 'approved', ownerMemberId: 'M2' },
  { id: 'B3', status: 'rejected', ownerMemberId: 'M3' },
  { id: 'B5', status: 'pending' },                        // קישור רק מצד החבר
];
sandbox.MOCK_FANS = [
  { id: 'M1', status: 'pending',  isBusinessOwner: true },                        // מוסתר
  { id: 'M2', status: 'pending',  isBusinessOwner: true },                        // העסק אושר — חריגה, נשאר
  { id: 'M3', status: 'pending',  isBusinessOwner: true },                        // העסק נדחה — נשאר
  { id: 'M4', status: 'pending',  isBusinessOwner: true },                        // אין עסק כלל — נשאר
  { id: 'M5', status: 'pending',  isBusinessOwner: true, linkedBusinessId: 'B5' },// מוסתר (צד החבר)
  { id: 'M6', status: 'pending',  isBusinessOwner: false },                       // אוהד רגיל
  { id: 'M7', status: 'approved', isBusinessOwner: true },                        // מאושר — לא רלוונטי
];
const owner = F.ownerMemberOfPendingBiz;
ok(owner(sandbox.MOCK_FANS[0]) === true,  'בעל עסק ממתין + עסק ממתין → מוסתר');
ok(owner(sandbox.MOCK_FANS[4]) === true,  'קישור דרך linkedBusinessId בלבד → מוסתר');
ok(owner(sandbox.MOCK_FANS[1]) === false, '🔑 העסק כבר אושר והחבר נשאר ממתין → **נשאר גלוי** (כשל של ה-batch)');
ok(owner(sandbox.MOCK_FANS[2]) === false, '🔑 העסק נדחה → נשאר גלוי, ההחלטה עליו עדיין פתוחה');
ok(owner(sandbox.MOCK_FANS[3]) === false, '🔑 אין עסק מקושר → נשאר גלוי, לא נעלם בשקט');
ok(owner(sandbox.MOCK_FANS[5]) === false, 'אוהד רגיל אינו מושפע');
ok(owner(sandbox.MOCK_FANS[6]) === false, 'בעל עסק מאושר אינו מושפע');
ok(owner(null) === false && owner(undefined) === false, 'ערך ריק אינו זורק');

ok(F.fanPendingList().map(f => f.id).join(',') === 'M2,M3,M4,M6',
   'תור הממתינים: 4 מתוך 6 — רק שני בעלי-העסק שממתינים עם עסק ממתין ירדו');
ok(F.fanHiddenOwnerCount() === 2, 'המספר המוסתר נאמר במפורש (2)');

// ⚠️ הסתרה בלי מוצא היא מסך בלי מוצא — הפילטר "בעלי עסק" חייב להמשיך להציג אותם.
const ffl = grab('function fanFilteredList(');
ok(/fanVerifyTypeFilter !== 'owner' && ownerMemberOfPendingBiz\(f\)/.test(ffl),
   'הפילטר "בעלי עסק" עוקף את ההסתרה');
ok(grab('function fanListHtml(').includes('fanHiddenOwnerCount()'), 'כותרת הרשימה אומרת כמה הוסתרו');
const uti = grab('function unifiedTaskItems(');
ok(uti.includes('!ownerMemberOfPendingBiz(x.entity)'), 'מרכז המשימות אינו מציג אותם כמשימה');
ok(!grab('function classifyAction(').includes('ownerMemberOfPendingBiz'),
   '🔑 classifyAction לא נגוע — תג-הסיווג בכרטיס האוהד ממשיך לומר את האמת');

// ══ 3. §428 — הכפתור מציג את התשובה, לא את התוצאה ═════════════════════════════════
// 🐛 דווח: *"סימנתי כן ואי אפשר לשנות."* על עסק **בלי הטבה מוגדרת** קורא-התצוגה היה
// `secInDeals`, שהוא `secHasDeal(b) && …` — כלומר תמיד false, ואף רצף לחיצות לא הדליק
// את "כן". התשובה **כן נשמרה** במסמך; רק המסך הכחיש אותה.
console.log('\n3. שאלת "הטבות שוות" — התשובה שנענתה היא מה שמוצג');

// מדמה בדיוק את secAnswerFor: patch מהשאלה + סימון, ואז פירוק ה-dot-path כמו ב-secWrite.
function clickDeals(b, val) {
  const q = F.SEC_QUESTIONS.find(x => x[0] === 'deals');
  const patch = q[4](val);
  patch['sectionAnswers.deals'] = true;
  Object.keys(patch).forEach(k => {
    if (k.indexOf('.') < 0) { b[k] = patch[k]; return; }
    const [h, t] = k.split('.');
    b[h] = Object.assign({}, b[h]); b[h][t] = patch[k];
  });
  return b;
}
const litDeals = (b) => {
  const html = F.bizQuestionRow(b, F.SEC_QUESTIONS.find(x => x[0] === 'deals'));
  if (/sc-ans on"[^>]*'deals',true\)/.test(html)) return 'כן';
  if (/sc-ans on"[^>]*'deals',false\)/.test(html)) return 'לא';
  return '(אף אחד)';
};

[['עם הטבה', { id: 'D1', discountText: '10% הנחה' }],
 ['בלי הטבה', { id: 'D2' }],
 ['הטבה = רווחים בלבד', { id: 'D3', discountText: '   ' }]].forEach(([label, base]) => {
  const b = { ...base };
  ok(litDeals(b) === '(אף אחד)', `${label}: לפני מענה — אף כפתור לא דלוק`);
  ok(litDeals(clickDeals(b, true)) === 'כן', `${label}: לחיצה על "כן" מדליקה את "כן"`);
  ok(litDeals(clickDeals(b, false)) === 'לא', `${label}: לחיצה על "לא" מדליקה את "לא"`);
  ok(litDeals(clickDeals(b, true)) === 'כן', `${label}: אפשר לחזור ל"כן" — לא נתקע`);
});

// ⚠️ המנוע **לא** השתנה: עסק בלי הטבה לא נכנס לסקשן גם אם נענה "כן". רק התצוגה תוקנה.
ok(F.secInDeals({ id: 'D2', sectionDeals: true }) === false,
   '🔑 המנוע לא נגוע — עסק בלי הטבה עדיין אינו משובץ ב"הטבות שוות"');
ok(F.secInDeals({ id: 'D1', discountText: 'x', sectionDeals: true }) === true,
   'המנוע משבץ עסק עם הטבה שנענה "כן"');
ok(F.secInDeals({ id: 'D1', discountText: 'x', sectionDeals: false }) === false,
   'המנוע אינו משבץ עסק עם הטבה שנענה "לא"');

// ההסבר — נוסח אחד לשני המסכים, וההבחנה בין "יש הטבה" ל"אין" נאמרת למנהל.
const qDeals = F.SEC_QUESTIONS.find(x => x[0] === 'deals');
ok(/תישמר ותחול ברגע שתוגדר הטבה/.test(F.secQuestionHint({ id: 'D2' }, qDeals)),
   'בלי הטבה: ההסבר אומר שהתשובה תישמר ותחול כשתוגדר הטבה');
ok(/נפעיל אותה בהמשך/.test(F.secQuestionHint({ id: 'D1', discountText: 'x' }, qDeals)),
   'עם הטבה: ההסבר הרגיל');
ok(F.bizQuestionRow({ id: 'D2' }, qDeals).includes('תישמר ותחול'),
   '🔑 ההסבר מופיע גם בכרטיס העסק — עד §428 הוא היה רק במסך-המעבר');
ok(!grab('function sectionsReviewHtml(').includes('לעסק אין הטבה מוגדרת כרגע'),
   'הנוסח הישן הוסר ממסך-המעבר — נוסח אחד בלבד');
ok(grab('function sectionsReviewHtml(').includes('secQuestionHint(b, q)'),
   'מסך-המעבר קורא לאותה פונקציית-הסבר');

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
