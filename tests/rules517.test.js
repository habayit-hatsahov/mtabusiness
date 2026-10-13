// בדיקת §517 מול אמולטור Firestore אמיתי — סגירת השתלטות על חשבון דרך members update (א).
//
// 🔴 הפרצה: כל אחד, בלי להתחבר, יכול היה להחליף טלפון+מייל בכל רשומת חבר (גם מנהל), ואז
//    "שליחת קוד חוזרת" שלחה את קוד הכניסה למייל של התוקף.
// מה נבדק:
//   1. 🔑 אנונימי / חבר אחר / עסק — לא משנים טלפון, מייל, סטטוס, אימות, googleSub של חבר.
//   2. 🔑 הזרימה האמיתית של business.html (linkOrCreateOwnerMember) עדיין עוברת — בדיוק השדות שהיא שולחת.
//   3. השלמה ולא דריסה: תאריך לידה/שם רק כשאין; isBusinessOwner רק true; קישור רק לעסק pending קיים.
//   4. רגרסיה: החבר עצמו עדיין עורך טלפון/מייל (ענף ב); מנהל — הכול.
const fs = require('fs');
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc } = require('firebase/firestore');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 140)); }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-yellowzone',
    firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  const seed = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      await setDoc(doc(d, 'members/admin1'), { status: 'approved', isAdmin: true, phone: '0501111111', email: 'admin@x.co', firstName: 'מנהל' });
      await setDoc(doc(d, 'members/victim'), { status: 'approved', phone: '0502222222', email: 'v@x.co', firstName: 'קורבן', lastName: 'א', birthDate: '1990-01-01' });
      await setDoc(doc(d, 'members/noname'), { status: 'approved', phone: '0503333333', email: 'n@x.co', firstName: '' });
      await setDoc(doc(d, 'members/other'), { status: 'approved', phone: '0504444444', email: 'o@x.co', firstName: 'אחר' });
      await setDoc(doc(d, 'businesses/bizPending'), { status: 'pending', name: 'עסק חדש' });
      await setDoc(doc(d, 'businesses/bizApproved'), { status: 'approved', name: 'עסק קיים' });
    });
  };
  await seed();

  const anon = env.unauthenticatedContext().firestore();
  const other = env.authenticatedContext('other', { role: 'member' }).firestore();
  const victimSelf = env.authenticatedContext('victim', { role: 'member' }).firestore();
  const admin = env.authenticatedContext('admin1', { role: 'member' }).firestore();
  const bizIdentity = env.authenticatedContext('bizPending', { role: 'business_owner' }).firestore();

  console.log('🔴 ההשתלטות – נחסמת');
  await check('אנונימי לא מחליף מייל', assertFails(updateDoc(doc(anon, 'members/victim'), { email: 'attacker@evil.co' })));
  await check('אנונימי לא מחליף טלפון', assertFails(updateDoc(doc(anon, 'members/victim'), { phone: '0509999999' })));
  await check('אנונימי לא מחליף טלפון+מייל יחד', assertFails(updateDoc(doc(anon, 'members/victim'), { phone: '0509999999', email: 'attacker@evil.co' })));
  await check('אנונימי לא מחליף מייל של מנהל', assertFails(updateDoc(doc(anon, 'members/admin1'), { email: 'attacker@evil.co' })));
  await check('חבר אחר לא מחליף מייל', assertFails(updateDoc(doc(other, 'members/victim'), { email: 'attacker@evil.co' })));
  await check('זהות עסק לא מחליפה מייל', assertFails(updateDoc(doc(bizIdentity, 'members/victim'), { email: 'attacker@evil.co' })));
  await check('אנונימי לא מוריד ל-pending', assertFails(updateDoc(doc(anon, 'members/victim'), { status: 'pending' })));
  await check('אנונימי לא כותב googleSub', assertFails(updateDoc(doc(anon, 'members/victim'), { googleSub: '123', googleEmail: 'attacker@gmail.com' })));
  await check('אנונימי לא כותב שדות אימות', assertFails(updateDoc(doc(anon, 'members/victim'), { isSubscriber: true, verifyMethod: 'x' })));
  await check('הסוואה: מייל בתוך פאץ\' "לגיטימי"', assertFails(updateDoc(doc(anon, 'members/victim'), { isBusinessOwner: true, linkedBusinessId: 'bizPending', email: 'attacker@evil.co' })));

  console.log('השלמה, לא דריסה');
  await check('לא דורס תאריך לידה קיים', assertFails(updateDoc(doc(anon, 'members/victim'), { birthDate: '2000-02-02' })));
  await check('לא דורס שם קיים', assertFails(updateDoc(doc(anon, 'members/victim'), { firstName: 'זר', lastName: 'זר' })));
  await check('isBusinessOwner רק true', assertFails(updateDoc(doc(anon, 'members/victim'), { isBusinessOwner: false })));
  await check('לא מקשר לעסק מאושר', assertFails(updateDoc(doc(anon, 'members/victim'), { linkedBusinessId: 'bizApproved' })));
  await check('לא מקשר לעסק שלא קיים', assertFails(updateDoc(doc(anon, 'members/victim'), { linkedBusinessId: 'nope' })));

  console.log('🔑 business.html – הזרימה האמיתית עובדת');
  await check('קישור בעל עסק קיים (isBusinessOwner+linkedBusinessId)', assertSucceeds(updateDoc(doc(anon, 'members/victim'), { isBusinessOwner: true, linkedBusinessId: 'bizPending' })));
  await check('השלמת שם כשאין', assertSucceeds(updateDoc(doc(anon, 'members/noname'), { isBusinessOwner: true, linkedBusinessId: 'bizPending', firstName: 'דנה', lastName: 'כהן' })));
  await check('השלמת תאריך לידה כשאין', assertSucceeds(updateDoc(doc(anon, 'members/noname'), { birthDate: '1985-05-05' })));
  await check('גם כשמחובר כחבר אחר (§419)', assertSucceeds(updateDoc(doc(other, 'members/other'), { isBusinessOwner: true, linkedBusinessId: 'bizPending' })));

  console.log('רגרסיה');
  await check('החבר עצמו מחליף טלפון ומייל (ענף ב)', assertSucceeds(updateDoc(doc(victimSelf, 'members/victim'), { phone: '0505555555', email: 'new@x.co' })));
  await check('מנהל מחליף מייל לחבר', assertSucceeds(updateDoc(doc(admin, 'members/other'), { email: 'fixed@x.co' })));

  await env.cleanup();
  console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
