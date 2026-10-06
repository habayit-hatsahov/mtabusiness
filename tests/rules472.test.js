// בדיקת §472 מול אמולטור Firestore אמיתי — הקובץ firestore.rules של הריפו כפי שהוא.
//
// מה נבדק: "כתבו לנו" של אוהד (helpRequests עם source:'fanMessage').
//   1. 🔑 אוהד מחובר שולח הודעה בשם עצמו — עובר.
//   2. התחזות: memberId של חבר אחר / אנונימי / בלי memberId — נדחה.
//   3. רגרסיה: פניות העזרה הקיימות (אנונימיות, בלי source, loginFail) עדיין עוברות.
//   4. ההגנות הקיימות (status, אורך, שדות זרים, קריאה) עדיין חוסמות גם את הסוג החדש.
const fs = require('fs');
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, serverTimestamp } = require('firebase/firestore');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 140)); }
}

let n = 0;
const msg = (extra) => ({
  name: 'איל מנדל', contact: 'a@b.c', message: 'שלום, יש לי הצעה', source: 'fanMessage',
  device: 'mobile', path: '/home.html', memberId: 'm1', status: 'new',
  createdAt: serverTimestamp(), ...extra,
});

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-yellowzone',
    firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'members/m1'), { status: 'approved', firstName: 'איל' });
    await setDoc(doc(d, 'members/m2'), { status: 'approved', firstName: 'אחר' });
  });

  const member = env.authenticatedContext('m1').firestore();
  const anon = env.unauthenticatedContext().firestore();
  const put = (db, data) => setDoc(doc(db, 'helpRequests/r' + (++n)), data);

  console.log('\n══ helpRequests · fanMessage ══');
  await check('🔑 אוהד מחובר שולח הודעה בשם עצמו — עובר',
    assertSucceeds(put(member, msg())));
  await check('אוהד מחובר · memberId של חבר אחר — נדחה (התחזות)',
    assertFails(put(member, msg({ memberId: 'm2' }))));
  await check('אוהד מחובר · בלי memberId — נדחה',
    assertFails(put(member, (({ memberId, ...r }) => r)(msg()))));
  await check('אוהד מחובר · memberId:null — נדחה',
    assertFails(put(member, msg({ memberId: null }))));
  await check('אנונימי · fanMessage עם memberId של חבר — נדחה',
    assertFails(put(anon, msg())));
  await check('אוהד מחובר · status:handled ביצירה — נדחה',
    assertFails(put(member, msg({ status: 'handled' }))));
  await check('אוהד מחובר · הודעה של 1001 תווים — נדחה',
    assertFails(put(member, msg({ message: 'א'.repeat(1001) }))));
  await check('אוהד מחובר · הודעה של 1000 תווים — עובר',
    assertSucceeds(put(member, msg({ message: 'א'.repeat(1000) }))));
  await check('אוהד מחובר · הודעה ריקה — נדחה',
    assertFails(put(member, msg({ message: '' }))));
  await check('אוהד מחובר · contact ריק — נדחה',
    assertFails(put(member, msg({ contact: '' }))));
  await check('אוהד מחובר · שדה זר (isAdmin) — נדחה',
    assertFails(put(member, msg({ isAdmin: true }))));
  await check('אוהד מחובר · source שאינו ברשימה — נדחה',
    assertFails(put(member, msg({ source: 'adminNote' }))));
  await check('אוהד מחובר · קריאת ההודעה שלו — נדחה (אפס קריאה פומבית)',
    assertFails(getDoc(doc(member, 'helpRequests/r1'))));

  console.log('\n══ רגרסיה · פניות העזרה הקיימות ══');
  const legacy = (extra) => ({ contact: '0500000000', message: 'נתקעתי', status: 'new', createdAt: serverTimestamp(), memberId: null, ...extra });
  await check('אנונימי · stuck (טופס ההרשמה) — עדיין עובר',
    assertSucceeds(put(anon, legacy({ source: 'stuck', device: 'mobile' }))));
  await check('אנונימי · loginFail (מודאל הכניסה) — עדיין עובר',
    assertSucceeds(put(anon, legacy({ source: 'loginFail', errCode: 'badCode' }))));
  await check('אנונימי · בלי שדה source בכלל — עדיין עובר',
    assertSucceeds(put(anon, { contact: 'x@y.z', message: 'שאלה', status: 'new', createdAt: serverTimestamp() })));
  await check('אנונימי · source:null — עדיין עובר',
    assertSucceeds(put(anon, legacy({ source: null }))));
  await check('אוהד מחובר · stuck עם memberId של אחר — עדיין עובר (לא השתנה; השדה לא מוצג כזהות)',
    assertSucceeds(put(member, legacy({ source: 'stuck', memberId: 'm2' }))));

  console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
