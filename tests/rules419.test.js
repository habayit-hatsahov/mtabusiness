// בדיקת §419 מול אמולטור Firestore אמיתי — הקובץ firestore.rules של הריפו כפי שהוא.
//
// מה נבדק: הסרת `request.auth == null` משלושת המקומות שחסמו את הרשמת העסק אצל בעלים
// שכבר מחובר כאוהד. לכל אחד משלושתם שלוש שאלות, ושלושתן חייבות לעבור יחד:
//   1. 🔑 **חבר מחובר** מצליח — זה התיקון עצמו.
//   2. אנונימי עדיין מצליח — רגרסיה: זו הזרימה שעבדה עד היום ואסור לה להישבר.
//   3. כל שאר ההגנות עדיין חוסמות — הסרנו תנאי אחד, לא את רשימות-ההיתר.
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
  await env.clearFirestore();

  // הרשומה שהחבר המחובר הוא: אוהד מאושר, בדיוק כמו איל מנדל שנרשם יום קודם.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'members/m1'), { status: 'approved', firstName: 'איל', lastName: 'מנדל', email: 'a@b.c', phone: '05000' });
    await setDoc(doc(d, 'members/dedup1'), { status: 'pending', firstName: 'א', lastName: 'ב', email: 'x@y.z', phone: '05111' });
    await setDoc(doc(d, 'members/dedup2'), { status: 'pending', firstName: 'א', lastName: 'ב', email: 'x@y.z', phone: '05111' });
    await setDoc(doc(d, 'businesses/bPend'),  { status: 'pending',  name: 'ממתין' });
    await setDoc(doc(d, 'businesses/bPend2'), { status: 'pending',  name: 'ממתין 2' });
    await setDoc(doc(d, 'businesses/bAppr'),  { status: 'approved', name: 'מאושר' });
    await setDoc(doc(d, 'bizTokens/bAppr'), { accessToken: 'קיים-כבר' });
  });

  // 🔑 ההקשר שהיה חסום עד §419: חבר מאושר עם סשן חי, בדיוק כמו בטופס העסק.
  const member = env.authenticatedContext('m1').firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log('\n══ bizTokens · יצירת טוקן הכניסה לדשבורד ══');
  await check('🔑 חבר מחובר יוצר טוקן לעסק ממתין — עובר (התיקון)',
    assertSucceeds(setDoc(doc(member, 'bizTokens/bPend'), { accessToken: 'tok-1' })));
  await check('אנונימי יוצר טוקן — עדיין עובר (רגרסיה)',
    assertSucceeds(setDoc(doc(anon, 'bizTokens/bPend2'), { accessToken: 'tok-2' })));
  await check('חבר מחובר · עסק מאושר — עדיין נדחה',
    assertFails(setDoc(doc(member, 'bizTokens/bAppr2'), { accessToken: 'x' })));
  await check('חבר מחובר · עסק שאינו קיים — עדיין נדחה',
    assertFails(setDoc(doc(member, 'bizTokens/bNope'), { accessToken: 'x' })));
  await check('חבר מחובר · שדה נוסף מעבר ל-accessToken — עדיין נדחה',
    assertFails(setDoc(doc(member, 'bizTokens/bPend3'), { accessToken: 'x', isAdmin: true })));
  await check('חבר מחובר · דריסת טוקן קיים — עדיין נדחה (חטיפת דשבורד)',
    assertFails(setDoc(doc(member, 'bizTokens/bAppr'), { accessToken: 'נחטף' })));

  console.log('\n══ businesses · העדכון שאחרי היצירה (ownerMemberId + תמונות) ══');
  await check('🔑 חבר מחובר כותב ownerMemberId לעסק ממתין — עובר (התיקון)',
    assertSucceeds(updateDoc(doc(member, 'businesses/bPend'), { ownerMemberId: 'm1' })));
  await check('🔑 חבר מחובר כותב תמונות לעסק ממתין — עובר (התיקון)',
    assertSucceeds(updateDoc(doc(member, 'businesses/bPend'), { coverPhoto: 'https://x/c.jpg', logo: 'https://x/l.png', photos: [{ url: 'https://x/1.jpg', name: '1' }] })));
  await check('אנונימי כותב תמונות — עדיין עובר (רגרסיה)',
    assertSucceeds(updateDoc(doc(anon, 'businesses/bPend2'), { coverPhoto: 'https://x/c.jpg' })));
  await check('חבר מחובר · עסק מאושר — עדיין נדחה',
    assertFails(updateDoc(doc(member, 'businesses/bAppr'), { coverPhoto: 'https://x/c.jpg' })));
  await check('חבר מחובר · שדה מחוץ לרשימת-ההיתר — עדיין נדחה',
    assertFails(updateDoc(doc(member, 'businesses/bPend'), { name: 'שם חדש' })));
  await check('חבר מחובר · העלאת status ל-approved — עדיין נדחה',
    assertFails(updateDoc(doc(member, 'businesses/bPend'), { status: 'approved', coverPhoto: 'https://x/c.jpg' })));

  console.log('\n══ members · עדכון הדדופ (isBusinessOwner / linkedBusinessId) ══');
  await check('🔑 חבר מחובר מסמן רשומה קיימת כבעלת-עסק — עובר (התיקון)',
    assertSucceeds(updateDoc(doc(member, 'members/dedup1'), { isBusinessOwner: true, linkedBusinessId: 'bPend' })));
  await check('אנונימי מסמן — עדיין עובר (רגרסיה)',
    assertSucceeds(updateDoc(doc(anon, 'members/dedup2'), { isBusinessOwner: true, linkedBusinessId: 'bPend2' })));
  await check('חבר מחובר · העלאת status ל-approved — עדיין נדחה',
    assertFails(updateDoc(doc(member, 'members/dedup1'), { status: 'approved' })));
  await check('חבר מחובר · כתיבת isAdmin — עדיין נדחה',
    assertFails(updateDoc(doc(member, 'members/dedup1'), { isAdmin: true })));
  await check('חבר מחובר · שדה מחוץ לרשימת-ההיתר — עדיין נדחה',
    assertFails(updateDoc(doc(member, 'members/dedup1'), { memberNumber: '999' })));
  // ההגנה של 2026-07-24: הרשמה עם טלפון של חבר אמיתי דרסה לו את השם והמייל.
  await check('חבר מחובר · nameConflict שדורס שם קיים — עדיין נדחה',
    assertFails(updateDoc(doc(member, 'members/dedup1'), { nameConflict: true, firstName: 'אחר' })));

  console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
