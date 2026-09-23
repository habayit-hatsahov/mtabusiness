// ══ §446ו — נעילת ה-Services ID של אפל על שלושת המקומות שמחזיקים אותו ════════════════════
//
// **הבעיה שזה סוגר, והיא שקטה לחלוטין:** מזהה ה-Services של אפל יושב בשלושה קבצים —
// `apple-signup.js` (טופסי ההרשמה) · `welcome.html` (מסך הכניסה) · `worker/wrangler.toml`
// (`APPLE_CLIENT_IDS`, שהשרת מאמת מולו את ה-`aud` של הטוקן). פער בין השלושה מפיל **כל**
// כניסה עם אפל על שגיאת-audience — ובלי שום רמז לסיבה, כי ההודעה שהמשתמש רואה היא
// "האימות מול Apple לא הצליח", בדיוק אותה הודעה שמתקבלת על טוקן פגום.
//
// ══ 🔑 למה **בדיקה** ולא קובץ-קבועים משותף ═══════════════════════════════════════════════
//
// זו הייתה ההעדפה הראשונה, ו**המדידה פסלה אותה**: הערך בוורקר אינו אותו ערך אלא **רשימה**
// (`il.co.yellowzone.web,il.co.yellowzone.app` — ה-Services ID של הווב יחד עם ה-Bundle ID
// של iOS), והוא חי בזמן-ריצה אחר לגמרי שנפרס בנפרד (`wrangler deploy`). כלומר מודול
// משותף בצד-הלקוח היה סוגר את **הצמד הבטוח** (שני קבצי לקוח שמשתנים יחד באותו push)
// ומשאיר פתוח בדיוק את הצד המסוכן — זה שנפרס בנפרד ולכן זה שבאמת נוטה להישכח.
// ⚠️ וגם: `welcome.html` **אינו טוען את `apple-signup.js` בכוונה** (§446א — הוא מודול
// הרשמה), ולכן "פשוט לייבא את הקבוע" אינו אפשרי שם בלי להחזיר את הבעיה שנמנעה.
//
// הבדיקה הזאת מכסה את שלושת המקומות, ועולה אפס בזמן-ריצה.
//
// הרצה:  node scratch_test_apple_client_id.js

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

// ── החילוץ מעוגן בשם-הקבוע ובמבנה ההשמה, ולא במחרוזת הערך ────────────────────────────────
// ⚠️ עיגון על `il.co.yellowzone.web` היה מוצא אותו גם בתוך **הערה** שמסבירה אותו, ואז
// הבדיקה הייתה עוברת ירוק על קוד שהערך בו כבר שונה. זו בדיוק המלכודת שתועדה ב-`sw.js`
// (‏`grep -o 'yz-shell-v[0-9]*' | head -1` שתפס מחרוזת בתוך תיעוד).
// ר' [[feedback_test_harness_anchor_by_content]].
function grab(src, re, label) {
  const m = src.match(re);
  if (!m) { check('נמצא ' + label, false, 'הביטוי לא התאים — הקבוע שונה שם או הוסר'); return null; }
  return m[1].trim();
}

console.log('\n── 1. חילוץ שלושת הערכים ────────────────────────────────');

// ⚠️ 🔑 **`apple-live-test.html` נמצא ע"י סעיף 4 של הבדיקה הזאת, ולא היה ידוע לי מראש.**
// הוא דף האבחון של §445ג, ולכן הפיתוי היה לפטור אותו מהשוויון — **וזו הייתה טעות**:
// דווקא בו פער שקט הוא היקר ביותר. אם הוא יישאר עם ערך ישן, הדף שנועד לבדוק את השרשרת
// ייפול על `wrong_audience` בזמן שהדפים החיים עובדים — והסשן הבא יחפש תקלה שאינה קיימת,
// בדיוק במכשיר שאין בו DevTools. **כלי-אבחון ששקרן גרוע מכלי-אבחון שאינו קיים.**
const CLIENT_FILES = [
  ['apple-signup.js',      /^\s*var\s+SERVICES_ID\s*=\s*'([^']*)'\s*;/m,           'SERVICES_ID'],
  ['welcome.html',         /^\s*var\s+HB_APPLE_SERVICES_ID\s*=\s*'([^']*)'\s*;/m,  'HB_APPLE_SERVICES_ID'],
  ['apple-live-test.html', /^\s*var\s+SERVICES_ID\s*=\s*'([^']*)'\s*;/m,           'SERVICES_ID (דף אבחון)'],
  // §456 — חיבור חשבון Apple בפרופיל. עותק חמישי, ננעל לשוויון כמו כולם.
  ['apple-link.js',        /^\s*var\s+SERVICES_ID\s*=\s*'([^']*)'\s*;/m,           'SERVICES_ID'],
];

const clients = CLIENT_FILES.map(([file, re, label]) => {
  const v = grab(read(file), re, label + ' ב-' + file);
  check(file + ' מחזיק ערך', !!v, v);
  return { file, value: v };
});
const workerRaw = grab(read('worker/wrangler.toml'),
  /^\s*APPLE_CLIENT_IDS\s*=\s*"([^"]*)"/m, 'APPLE_CLIENT_IDS ב-wrangler.toml');
check('wrangler.toml מחזיק ערך', !!workerRaw, workerRaw);

if (clients.some((c) => !c.value) || !workerRaw) {
  console.log('\n❌ חילוץ נכשל — אי אפשר להשוות. ' + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(1);
}

const signup = clients[0].value;
const workerList = workerRaw.split(',').map((s) => s.trim()).filter(Boolean);
clients.forEach((c) => console.log('    ' + c.file.padEnd(22) + ': ' + c.value));
console.log('    ' + 'worker/wrangler.toml'.padEnd(22) + ': [' + workerList.join(' | ') + ']');

console.log('\n── 2. 🔴 השוויון עצמו ───────────────────────────────────');
clients.slice(1).forEach((c) => {
  check('🔑 ' + c.file + ' זהה ל-apple-signup.js',
    c.value === signup, c.value + '  ≠  ' + signup);
});
// ⚠️ **`includes` על הרשימה ולא שוויון**: הרשימה נושאת גם את ה-Bundle ID של iOS, ובכוונה —
// הטוקן מהמסלול הנייטיב נושא `aud` אחר לגמרי, ולכן `APPLE_CLIENT_IDS` הוא רשימה מלכתחילה (§423).
check('🔑 הערך של הלקוח נמצא ברשימת ה-aud של הוורקר',
  workerList.includes(signup), signup + ' אינו בתוך [' + workerList.join(' | ') + ']');

console.log('\n── 3. שפיות הערכים ──────────────────────────────────────');
// לא מקבעים את הערך עצמו — הוא עשוי להשתנות אם ייווצר Services ID חדש בפורטל. מה שכן
// נבדק הוא שהוא נראה כמו מזהה ולא כמו placeholder/ריק, ושהמתג לא נותר כבוי בטעות.
check('הערך אינו ריק (המתג של §445 דולק)', signup.length > 0);
check('הערך נראה כמו מזהה הפוך-דומיין', /^[a-z0-9.-]+\.[a-z0-9-]+$/i.test(signup), signup);
// ⚠️ ה-Bundle ID חייב להישאר ברשימה גם אם הוא עדיין לא בשימוש: הסרתו תשבור את המסלול
// הנייטיב ביום שבו יהיה `app/ios`, ואיש לא יקשר בין השניים. ר' §426.
check('רשימת הוורקר מחזיקה גם מזהה שני (ה-Bundle ID למסלול הנייטיב)',
  workerList.length >= 2, JSON.stringify(workerList));

console.log('\n── 4. אין עותק נוסף שנולד בשקט ──────────────────────────');
// 🔑 **הסעיף היחיד כאן שמסתכל קדימה, והוא זה שהוכיח את עצמו מיד:** הוא מצא את
// `apple-live-test.html`, עותק רביעי שלא ידעתי עליו. בלעדיו שלושת הקבצים שכן הכרתי היו
// נשארים עקביים, הבדיקה הייתה ירוקה — **והיא הייתה משקרת**. סריקה על כל הריפו היא מה
// שהופך נעילה של רשימה-ידועה לנעילה אמיתית.
// ⚠️ **תוספת לרשימה היא החלטה מודעת, לא השתקה:** כל קובץ שנכנס ל-CLIENT_FILES נבדק
// לשוויון בסעיף 2. פטור מהשוויון הוא הדבר היחיד שאסור כאן.
const KNOWN = CLIENT_FILES.map(([f]) => f);
const scanned = fs.readdirSync(__dirname)
  .filter((f) => /\.(js|html|mjs|toml)$/i.test(f))
  .filter((f) => !/^scratch_/.test(f));
const extra = [];
scanned.forEach((f) => {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  // שורות-הערה אינן עותק — הן בדיוק מה שמבקשים מהן להיות (הצלבה בין המקומות).
  const codeLines = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|#|\*|<!--)/.test(l));
  if (codeLines.some((l) => l.includes(signup)) && !KNOWN.includes(f)) extra.push(f);
});
check('אין קובץ נוסף שמקודד את המזהה מחוץ לרשימה הנעולה', extra.length === 0,
  extra.join(', ') + ' — להוסיף ל-CLIENT_FILES (כלומר לנעול לשוויון), לא לפטור');

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עוברות, ' + fail + ' נכשלות');
if (fail) {
  console.log('\n🔴 פער בין המקומות = כל כניסה עם אפל נופלת על שגיאת-audience,');
  console.log('   וההודעה למשתמש זהה לזו של טוקן פגום. לתקן לפני פריסה.');
}
process.exit(fail ? 1 : 0);
