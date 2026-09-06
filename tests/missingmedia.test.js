// בדיקת missingMediaList בהרצה אמיתית — הפונקציה והתלויות שלה נחתכות מ-admin-dashboard.html
// ומורצות מול נתונים מלאכותיים. נכתבה ב-§419.
//
// ⚠️ חיתוך **לפי תוכן ולא לפי מספרי-שורה** (הלקח של §361). כל עוגן שנעלם מפיל את הבדיקה
// ברעש, במקום להריץ בשקט קוד ישן.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'admin-dashboard.html'), 'utf8');

function cut(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  if (a < 0) throw new Error(`עוגן ההתחלה לא נמצא: ${startMarker}`);
  const b = SRC.indexOf(endMarker, a);
  if (b < 0) throw new Error(`עוגן הסיום לא נמצא: ${endMarker}`);
  return SRC.slice(a, b);
}

// מסלולי-האימות + PHOTO_ROUTES + bizOwnerVerifStatus/Open
const HELPERS = cut('function fanVerifyMethod(f) {', '// הערך שהנרשם מסר בפועל במסלול שבחר');
// הפונקציה הנבדקת
const LIST = cut('// ══ §419 — "תמונה לא עלתה" שנגזרת מהמצב', '// כמה פתחו את הטופס ולא שלחו');

// הסביבה שהפונקציה מצפה לה במרכז הניהול. VERIFY_METHOD_LABELS מסופק כאן ולא נחתך —
// הבדיקה בודקת התנהגות, לא נוסח-תוויות.
const VERIFY_METHOD_LABELS = {
  subNumber: 'מספר מנוי', seatDetails: 'פרטי מושב', manual: 'אימות ידני',
  passScreenshot: 'צילום מנוי', purchaseEmail: 'אישור רכישה', standsPhoto: 'תמונה מהיציע',
};

function build(bizList, fanList, handled) {
  const body = `
    ${HELPERS}
    ${LIST}
    return missingMediaList;`;
  // §419 — findFan נוסף: bizOwnerMember מחפש את רשומת החבר של הבעלים דרכו.
  const fn = new Function('MOCK_BUSINESSES', 'MOCK_FANS', 'handledRegIssues', 'findBiz', 'findFan', 'VERIFY_METHOD_LABELS', body);
  return fn(bizList, fanList, handled || {},
    (id) => bizList.find((b) => b.id === id),
    (id) => fanList.find((f) => f.id === id),
    VERIFY_METHOD_LABELS);
}
const run = (biz, fans, handled) => build(biz, fans, handled)();

const AT = new Date('2026-09-04T10:40:50Z');
const biz = (o) => ({ id: 'b1', name: 'עסק', status: 'pending', registeredAt: AT, photos: [], ...o });
const fan = (o) => ({ id: 'f1', name: 'אוהד', status: 'pending', registeredAt: AT, ...o });

let pass = 0, fail = 0;
function is(name, got, want) {
  if (got === want) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      קיבלתי:  ' + JSON.stringify(got) + '\n      ציפיתי:  ' + JSON.stringify(want)); }
}
const keys = (rows) => rows.map((r) => r.key).sort().join(', ');

// ── המקרה שהוליד את הכל ────────────────────────────────────────────────────────────────
// AI Out Of The Box: מסמך קיים, אפס תמונות, אין ראיה, מסלול שדורש תמונה, אין שום אירוע.
console.log('\n— המקרה של AI Out Of The Box (§419) —');
{
  const rows = run([biz({ name: 'AI Out Of The Box', ownerPhone: '0500000001', isSubscriber: 'yes', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: '', logo: '' })], []);
  is('שתי שורות — ראיה חסרה + אפס תמונות', keys(rows), 'nomedia|images|b1, nomedia|proof|b1');
  is('שתיהן מצביעות על העסק', rows.every((r) => r.bizRef && r.bizRef.id === 'b1'), true);
  is('אף אחת אינה מסומנת כטופלה', rows.every((r) => r.handled === null), true);
  is('שתיהן photoFailed', rows.every((r) => r.kind === 'photoFailed'), true);
}

// ── מתי השורה **לא** אמורה להופיע ──────────────────────────────────────────────────────
console.log('\n— עסק · מתי לא מדווחים —');
{
  const rows = run([biz({ ownerIsSubscriber: true, ownerVerifyRoute: 'seatDetails', coverPhoto: 'x' })], []);
  is('מסלול שאינו דורש תמונה → אין שורת-ראיה', keys(rows), '');
}
{
  const rows = run([biz({ ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: 'https://x/p.jpg', coverPhoto: 'x' })], []);
  is('הראיה קיימת → אין שורה', keys(rows), '');
}
{
  const rows = run([biz({ status: 'approved', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '' })], []);
  is('עסק מאושר → ההחלטה כבר התקבלה, אין שורה', keys(rows), '');
}
{
  const rows = run([biz({ status: 'rejected', ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '' })], []);
  is('עסק שנדחה → אין שורה', keys(rows), '');
}
{
  const rows = run([biz({ ownerVerificationStatus: 'confirmed', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' })], []);
  is('האימות כבר אושר במפורש → אין שורה', keys(rows), '');
}
{
  const rows = run([biz({ ownerVerificationStatus: 'info_requested', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' })], []);
  is('התבקש מידע נוסף → ההחלטה עדיין פתוחה, כן מדווחים', keys(rows), 'nomedia|proof|b1');
}
{
  const rows = run([biz({ ownerIsSubscriber: true, ownerVerifyRoute: 'seatDetails', coverPhoto: '', logo: '', photos: [{ url: 'https://x/1.jpg' }] })], []);
  is('יש תמונת גלריה אחת → לא "אפס תמונות"', keys(rows), '');
}
{
  const rows = run([biz({ ownerIsSubscriber: true, ownerVerifyRoute: 'seatDetails', coverPhoto: '', logo: 'https://x/l.png' })], []);
  is('יש לוגו בלבד → לא "אפס תמונות"', keys(rows), '');
}
{
  const rows = run([biz({ status: 'approved', ownerVerificationStatus: 'confirmed', coverPhoto: '', logo: '' })], []);
  is('עסק מאושר בלי תמונות → לא ברשימה (יש לו את הבאנר של §376)', keys(rows), '');
}

// ── §419 — §361 בכיוון ההפוך: הראיה על רשומת החבר של הבעלים ───────────────────────────
// המקרה האמיתי: הבעלים נרשם כאוהד יום קודם, אומת ב-passScreenshot, ורק למחרת רשם עסק.
// הראיה שלו קיימת — על רשומת החבר. בלי הנפילה-לאחור הוא היה מופיע כתקלה בזמן שהתמונה
// מוצגת יפה בכרטיס שלו. ⚠️ כל הנתונים כאן מפוברקים — הריפו ציבורי.
console.log('\n— הראיה אצל הבעלים (§419) —');
{
  const f = fan({ id: 'mAyal', email: 'a@b.c', photoProofUrl: 'https://x/proof.jpg' });
  const b = biz({ ownerMemberId: 'mAyal', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' });
  is('מקושר דרך ownerMemberId → אין שורת-ראיה', keys(run([b], [f])), '');
}
{
  // 🔑 בדיוק המקרה של AI Out Of The Box: ownerMemberId **נכשל בכתיבה** ולכן null.
  // להסתמך עליו לבדו היה מפספס את המקרה שהנפילה-לאחור נועדה לו.
  const f = fan({ id: 'mAyal', email: 'owner@example.com', photoProofUrl: 'https://x/proof.jpg' });
  const b = biz({ ownerMemberId: null, ownerEmail: 'owner@example.com', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' });
  is('בלי ownerMemberId — נמצא לפי מייל', keys(run([b], [f])), '');
}
{
  const f = fan({ id: 'mAyal', email: 'Owner@EXAMPLE.com', photoProofUrl: 'https://x/proof.jpg' });
  const b = biz({ ownerMemberId: null, ownerEmail: '  owner@example.com ', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' });
  is('אות גדולה ורווחים במייל אינם מפספסים', keys(run([b], [f])), '');
}
{
  const f = fan({ id: 'mOther', email: 'someone@else.com', photoProofUrl: 'https://x/proof.jpg' });
  const b = biz({ ownerMemberId: null, ownerEmail: 'owner@example.com', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' });
  is('מייל של מישהו אחר אינו נחשב ראיה', keys(run([b], [f])), 'nomedia|proof|b1');
}
{
  const f = fan({ id: 'mAyal', email: 'a@b.c', photoProofUrl: '' });
  const b = biz({ ownerMemberId: 'mAyal', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' });
  // §419ז — **שורה אחת, של העסק.** עד §419ז היו כאן שתיים (גם על רשומת-החבר), והמשתמש
  // ביקש במפורש אחת: *"אני בודק הכל רק אצל העסק."*
  is('לבעלים אין ראיה גם הוא → שורה אחת, של העסק', keys(run([b], [f])), 'nomedia|proof|b1');
}
{
  const b = biz({ ownerMemberId: null, ownerEmail: '', ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' });
  is('בלי מייל ובלי קישור → כן שורה (ואין קריסה)', keys(run([b], [])), 'nomedia|proof|b1');
}

// ── לא-מנוי: המסלול נגזר ל-standsPhoto גם בלי verifyRoute מפורש ───────────────────────
console.log('\n— גזירת המסלול —');
{
  const rows = run([biz({ ownerIsSubscriber: false, ownerVerifyRoute: null, ownerProofPhotoUrl: '', coverPhoto: 'x' })], []);
  is('לא-מנוי בלי מסלול → standsPhoto, דורש תמונה', keys(rows), 'nomedia|proof|b1');
}
{
  const rows = run([biz({ ownerIsSubscriber: true, ownerVerifyRoute: null, ownerProofPhotoUrl: '', coverPhoto: 'x' })], []);
  is('מנוי בלי מסלול → אין מסלול, אין שורה', keys(rows), '');
}

// ── אוהדים ────────────────────────────────────────────────────────────────────────────
console.log('\n— אוהדים —');
{
  const rows = run([], [fan({ verifyMethod: 'standsPhoto', photoProofUrl: '' })]);
  is('מסלול תמונה בלי תמונה → שורה', keys(rows), 'nomedia|fan|f1');
  is('השורה מצביעה על האוהד', rows[0].fans[0].id, 'f1');
  is('ואין לה bizRef', rows[0].bizRef, null);
}
{
  const rows = run([], [fan({ verifyMethod: 'subNumber', subscriberNumber: '123', photoProofUrl: '' })]);
  is('מסלול מספר-מנוי → אין שורה', keys(rows), '');
}
{
  const rows = run([], [fan({ status: 'approved', verifyMethod: 'standsPhoto', photoProofUrl: '' })]);
  is('אוהד מאושר → אין שורה', keys(rows), '');
}
{
  const rows = run([], [fan({ verifyMethod: 'standsPhoto', photoProofUrl: 'https://x/p.jpg' })]);
  is('התמונה קיימת → אין שורה', keys(rows), '');
}
// 🔑 §361 — בלי הנפילה-לאחור הזאת **כל בעל-עסק** היה מופיע כאן בטעות.
{
  const b = biz({ id: 'b9', ownerProofPhotoUrl: 'https://x/proof.jpg', ownerVerifyRoute: 'passScreenshot', ownerIsSubscriber: true, coverPhoto: 'x' });
  const rows = run([b], [fan({ verifyMethod: 'standsPhoto', photoProofUrl: '', isBusinessOwner: true, linkedBusinessId: 'b9' })]);
  is('בעל-עסק שהראיה שלו על מסמך העסק → אין שורת-אוהד (§361)', keys(rows), '');
}
// ── §419ז — בעל-עסק מיוצג בשורה אחת: של העסק ──────────────────────────────────────────
// בקשת המשתמש אחרי בדיקה חיה. §361 דילג רק כשהראיה **נמצאה** על העסק — כלומר השאיר
// כפילות בדיוק במקרה שבו היא חסרה, שהוא המקרה היחיד שמגיע לרשימה מלכתחילה.
{
  const b = biz({ id: 'b9', ownerProofPhotoUrl: '', ownerVerifyRoute: 'seatDetails', ownerIsSubscriber: true, coverPhoto: 'x' });
  const rows = run([b], [fan({ verifyMethod: 'standsPhoto', photoProofUrl: '', isBusinessOwner: true, linkedBusinessId: 'b9' })]);
  is('אין ראיה גם על העסק → עדיין שורה אחת בלבד, של העסק', keys(rows), '');
}
{
  // הקישור נשבר לגמרי — אין עסק להצביע עליו, ולכן השורה **חייבת** להישאר.
  const rows = run([], [fan({ verifyMethod: 'standsPhoto', photoProofUrl: '', isBusinessOwner: true, linkedBusinessId: 'bGone' })]);
  is('בעל-עסק בלי עסק שנמצא → השורה נשארת', keys(rows), 'nomedia|fan|f1');
}
{
  // עסק שנדחה אינו כרטיס פתוח, ורשומת האוהד עדיין ממתינה להכרעה.
  const b = biz({ id: 'b9', status: 'rejected', ownerVerifyRoute: 'seatDetails', ownerIsSubscriber: true });
  const rows = run([b], [fan({ verifyMethod: 'standsPhoto', photoProofUrl: '', isBusinessOwner: true, linkedBusinessId: 'b9' })]);
  is('העסק נדחה → שורת-האוהד נשארת', keys(rows), 'nomedia|fan|f1');
}
{
  // 🔑 בדיוק המצב של §419: `linkedBusinessId` ו-`ownerMemberId` **שניהם** נכשלו בכתיבה.
  const b = biz({ id: 'b9', ownerMemberId: null, ownerEmail: 'a@b.c', ownerVerifyRoute: 'seatDetails', ownerIsSubscriber: true, coverPhoto: 'x' });
  const rows = run([b], [fan({ email: 'a@b.c', verifyMethod: 'standsPhoto', photoProofUrl: '', isBusinessOwner: false, linkedBusinessId: null })]);
  is('שני הקישורים נשברו — נמצא לפי מייל, שורה אחת', keys(rows), '');
}
{
  // הקישור ההפוך: linkedBusinessId חסר לוותיקים, ר' feedback על קישור דו-כיווני
  const b = biz({ id: 'b9', ownerMemberId: 'f1', ownerProofPhotoUrl: 'https://x/p.jpg', ownerVerifyRoute: 'passScreenshot', ownerIsSubscriber: true, coverPhoto: 'x' });
  const rows = run([b], [fan({ verifyMethod: 'standsPhoto', photoProofUrl: '', isBusinessOwner: true, linkedBusinessId: null })]);
  is('בלי linkedBusinessId — נמצא דרך ownerMemberId ההפוך', keys(rows), '');
}

// ── "טיפלתי" ──────────────────────────────────────────────────────────────────────────
console.log('\n— סימון "טיפלתי" —');
{
  const rows = run([biz({ ownerIsSubscriber: true, ownerVerifyRoute: 'passScreenshot', ownerProofPhotoUrl: '', coverPhoto: 'x' })], [],
    { 'nomedia|proof|b1': { at: '2026-09-06', note: 'ביקשתי במייל' } });
  is('השורה נושאת את הסימון (ולכן regIssueOpenList תסנן אותה)', !!rows[0].handled, true);
  is('וההערה נשמרת', rows[0].handled.note, 'ביקשתי במייל');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
