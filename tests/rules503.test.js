// בדיקת §503 מול אמולטור Firestore אמיתי — הקובץ firestore.rules של הריפו כפי שהוא.
//
// מה נבדק: תיבת העדכונים האישית (members/{id}/inbox) ויומן העדכונים (areaUpdates).
//   1. 🔑 החבר קורא את התיבה שלו; בעל עסק בטוקן העסק קורא את התיבה של החבר שלו.
//   2. אחר / אנונימי — לא קורא.
//   3. "נקרא" בלבד: readAt == request.time; שום שדה אחר; לא בשביל אחר.
//   4. יצירה/מחיקה — אף לקוח (רק הוורקר); areaUpdates — מנהל קורא, אף אחד לא כותב.
const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, orderBy, serverTimestamp } = require('firebase/firestore');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');
let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 160)); }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-yellowzone',
    firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  const item = { kind: 'update', block: 'members', title: 'כותרת', text: 'תוכן', link: '', sentAt: new Date(), readAt: null };
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'members/m1'), { status: 'approved' });
    await setDoc(doc(d, 'members/m2'), { status: 'approved' });
    await setDoc(doc(d, 'members/adm'), { status: 'approved', isAdmin: true });
    await setDoc(doc(d, 'businesses/b1'), { name: 'שווארמה', ownerMemberId: 'm1' });
    await setDoc(doc(d, 'members/m1/inbox/i1'), item);
    await setDoc(doc(d, 'members/m1/inbox/i2'), item);
    await setDoc(doc(d, 'members/m2/inbox/j1'), item);
    await setDoc(doc(d, 'areaUpdates/u1'), { title: 'x' });
  });
  const m1 = env.authenticatedContext('m1').firestore();
  const m2 = env.authenticatedContext('m2').firestore();
  const biz = env.authenticatedContext('b1').firestore();
  const adm = env.authenticatedContext('adm').firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log('\n══ קריאה ══');
  await check('🔑 החבר קורא את התיבה שלו (כמו area-updates.js)',
    assertSucceeds(getDocs(query(collection(m1, 'members/m1/inbox'), orderBy('sentAt', 'desc')))));
  await check('🔑 בעל עסק בטוקן העסק קורא את התיבה של החבר שלו',
    assertSucceeds(getDocs(collection(biz, 'members/m1/inbox'))));
  await check('בעל עסק בטוקן · תיבה של חבר אחר — נדחה', assertFails(getDocs(collection(biz, 'members/m2/inbox'))));
  await check('חבר אחר — נדחה', assertFails(getDocs(collection(m2, 'members/m1/inbox'))));
  await check('חבר אחר · פריט בודד — נדחה', assertFails(getDoc(doc(m2, 'members/m1/inbox/i1'))));
  await check('אנונימי — נדחה', assertFails(getDocs(collection(anon, 'members/m1/inbox'))));
  await check('מנהל — עובר', assertSucceeds(getDocs(collection(adm, 'members/m1/inbox'))));

  console.log('\n══ "נקרא" ══');
  await check('🔑 החבר מסמן נקרא — עובר', assertSucceeds(updateDoc(doc(m1, 'members/m1/inbox/i1'), { readAt: serverTimestamp() })));
  await check('בעל עסק בטוקן מסמן נקרא — עובר', assertSucceeds(updateDoc(doc(biz, 'members/m1/inbox/i2'), { readAt: serverTimestamp() })));
  await check('readAt בתאריך בדוי — נדחה', assertFails(updateDoc(doc(m1, 'members/m1/inbox/i1'), { readAt: new Date(0) })));
  await check('שינוי הכותרת — נדחה', assertFails(updateDoc(doc(m1, 'members/m1/inbox/i1'), { title: 'זויף' })));
  await check('העברה לבלוק אחר — נדחה', assertFails(updateDoc(doc(m1, 'members/m1/inbox/i1'), { block: 'myBiz', readAt: serverTimestamp() })));
  await check('חבר אחר מסמן נקרא — נדחה', assertFails(updateDoc(doc(m2, 'members/m1/inbox/i1'), { readAt: serverTimestamp() })));

  console.log('\n══ יצירה/מחיקה — רק הוורקר ══');
  await check('החבר יוצר פריט לעצמו — נדחה', assertFails(setDoc(doc(m1, 'members/m1/inbox/fake'), item)));
  await check('מנהל יוצר פריט מהדפדפן — נדחה', assertFails(setDoc(doc(adm, 'members/m1/inbox/fake'), item)));
  await check('החבר מוחק פריט — נדחה', assertFails(deleteDoc(doc(m1, 'members/m1/inbox/i1'))));

  console.log('\n══ areaUpdates ══');
  await check('מנהל קורא — עובר', assertSucceeds(getDocs(collection(adm, 'areaUpdates'))));
  await check('חבר קורא — נדחה', assertFails(getDocs(collection(m1, 'areaUpdates'))));
  await check('מנהל כותב מהדפדפן — נדחה', assertFails(setDoc(doc(adm, 'areaUpdates/x'), { title: 'x' })));

  console.log('\n══ רגרסיה ══');
  await check('activity של חבר — עדיין מנהל בלבד', assertFails(getDocs(collection(m1, 'members/m1/activity'))));

  console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
