// בדיקת classifyRegError בהרצה אמיתית — הפונקציה נחתכת מ-admin-dashboard.html ומורצת,
// לא נקראת בעין. נכתבה ב-§419 אחרי שהתגלה שהתווית של כשלי-מדיה נשברה ב-§381 ואיש לא ידע.
//
// ⚠️ החיתוך הוא **לפי תוכן ולא לפי מספרי-שורה** — הלקח של §361: `slice(2670,2783)` זז בכל
// עריכה, והרנס ששיקר גרוע מהרנס שנפל. אם אחד מהעוגנים ייעלם, הבדיקה נופלת ברעש.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'admin-dashboard.html'), 'utf8');

function cut(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  if (a < 0) throw new Error(`עוגן ההתחלה לא נמצא ב-admin-dashboard.html: ${startMarker}`);
  const b = SRC.indexOf(endMarker, a);
  if (b < 0) throw new Error(`עוגן הסיום לא נמצא ב-admin-dashboard.html: ${endMarker}`);
  return SRC.slice(a, b);
}

// מ-UPLOAD_ERR_LABELS ועד סוף classifyRegError (העוגן הבא בקובץ הוא כותרת §302).
const BLOCK = cut('const UPLOAD_ERR_LABELS = {', '// ── §302 — "טיפלתי" לשורת תקלה');
const classifyRegError = new Function(BLOCK + '\n; return classifyRegError;')();

let pass = 0, fail = 0;
function is(name, got, want) {
  if (got === want) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      קיבלתי:  ' + got + '\n      ציפיתי:  ' + want); }
}
function has(name, got, needle) {
  if (String(got).includes(needle)) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      קיבלתי:  ' + got + '\n      חסר בו:  ' + needle); }
}

// ── כשל-מדיה של עסק — הפורמט של §381: bm:<tag>:<name> ─────────────────────────────────
// זה הבאג שהבדיקה נולדה בשבילו: לפני §419 שתי השורות האלה החזירו detail באנגלית גולמית
// ('proof:TimeoutError'), כי חיפשנו את המחרוזת כולה כמפתח ב-MEDIA_ERR_LABELS.
console.log('\n— כשל מדיה של עסק (§381: bm:<tag>:<name>) —');
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:proof:TimeoutError' });
  is('ראיה · kind', c.kind, 'photoFailed');
  is('ראיה · תג', c.badge, 'ראיה חסרה');
  has('ראיה · כותרת מדברת על תמונת האימות', c.title, 'תמונת האימות של בעל העסק');
  has('ראיה · הסיבה תורגמה לעברית', c.detail, 'ההעלאה נתקעה ונקטעה');
  has('ראיה · נאמר שזה חוסם אישור', c.detail, 'אי אפשר לאשר את האימות');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:rest:TypeError' });
  is('שאר התמונות · תג', c.badge, 'תמונות חסרות');
  has('שאר התמונות · כותרת', c.title, 'תמונות העסק לא עלו');
  has('שאר התמונות · הסיבה תורגמה', c.detail, 'הבקשה לא יצאה');
  has('שאר התמונות · נאמר אילו תמונות', c.detail, 'לוגו/תמונה מייצגת/גלריה');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:rest:MediaPhaseTimeout' });
  has('MediaPhaseTimeout מתורגם גם הוא', c.detail, 'ההעלאה נתקעה ונקטעה');
}

// ── §419 — קודים שמגיעים מתשובת-שרת שנדחתה, לא מחריגה ─────────────────────────────────
// עד §419 המקרים האלה **לא נרשמו כאירוע בכלל**: `if (!result.ok)` הדליק דגל מקומי ותו לא,
// והשורה מעולם לא הגיעה ל-catch שרושם את האירוע. תשובה שהתקבלה ונדחתה אינה זורקת.
console.log('\n— תשובת שרת שנדחתה (§419) —');
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:proof:invalid_token' });
  is('invalid_token · תג ראיה', c.badge, 'ראיה חסרה');
  has('invalid_token · מתורגם למה שקרה', c.detail, 'לא היה לו טוקן בזמן ההרשמה');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:rest:invalid_token' });
  is('invalid_token · תג תמונות', c.badge, 'תמונות חסרות');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:rest:files:3' });
  has('files:3 — כמה נדחו, והשאר עלו', c.detail, '3 קבצים נדחו בשרת');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:rest:files:1' });
  has('files:1 — יחיד ולא רבים', c.detail, 'קובץ אחד נדחה בשרת');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:proof:failed' });
  has('failed גנרי', c.detail, 'השרת דחה את ההעלאה');
}

// ── נפילה-לאחור: אירועים שנרשמו לפני §381 אין להם תג, והם עדיין ברשימה ─────────────────
console.log('\n— אירועים ישנים (לפני §381, בלי תג) —');
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:TimeoutError' });
  is('ישן · kind', c.kind, 'photoFailed');
  is('ישן · תג', c.badge, 'תמונות חסרות');
  is('ישן · הסיבה תורגמה ולא הוצגה גולמית', c.detail, 'ההעלאה נתקעה ונקטעה');
}
{
  // שם-שגיאה שאינו במפה חייב עדיין להופיע, ולא להיעלם — מוטב אנגלית מאשר שורה ריקה.
  const c = classifyRegError({ blockId: 'bizForm', channel: 'bm:proof:SomeNewError' });
  has('שם לא מוכר נשמר כמו שהוא', c.detail, 'SomeNewError');
}

// ── כשל תמונת-אימות של אוהד — הפורמט של §290: pu:<code>|<KB>k|<type> ───────────────────
console.log('\n— תמונת אימות של אוהד (§290: pu:) —');
{
  const c = classifyRegError({ blockId: 'fanRegister', channel: 'pu:unauthorized|640k|jpeg' });
  is('אוהד · kind', c.kind, 'photoFailed');
  is('אוהד · תג', c.badge, 'תמונה חסרה');
  has('אוהד · הכותרת אומרת "אוהד"', c.title, 'של אוהד');
  has('אוהד · הסיבה תורגמה', c.detail, 'אינו תמונה או מעל 15MB');
  has('אוהד · גודל הקובץ מוצג', c.detail, '640KB');
  has('אוהד · סוג הקובץ מוצג', c.detail, 'jpeg');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'pu:upload-timeout|120k|webp' });
  has('אותו פורמט על עסק אומר "עסק"', c.title, 'של עסק');
}
{
  // §288 ומטה
  const c = classifyRegError({ blockId: 'fanRegister', channel: 'proof-upload:storage/canceled' });
  has('פורמט ישן (§288) עדיין מתורגם', c.detail, 'ההעלאה בוטלה');
}

// ── כשל הרשמה אמיתי — לא תמונה ─────────────────────────────────────────────────────────
// ההבחנה הזאת היא כל הנקודה של §296: "אין רשומה" מול "יש רשומה, חסרה תמונה".
console.log('\n— כשל הרשמה (אין רשומה בכלל) —');
{
  const c = classifyRegError({ blockId: 'fanRegister', channel: 'permission-denied' });
  is('kind אינו photoFailed', c.kind, 'failed');
  is('תג', c.badge, 'הרשמה נכשלה');
  has('כותרת', c.title, 'הרשמת אוהד נכשלה');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: 'offline' });
  has('offline מתורגם', c.detail, 'לא היה חיבור לאינטרנט');
}
{
  const c = classifyRegError({ blockId: 'bizForm', channel: '' });
  is('ערוץ ריק אינו קורס', c.kind, 'failed');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
