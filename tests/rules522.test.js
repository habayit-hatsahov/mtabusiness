// בדיקת §522 מול אמולטור Firestore — messages/{id} + recipients/{rid}: מנהל בלבד, בלי מחיקה.
const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs } = require('firebase/firestore');

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
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'members/admin1'), { status: 'approved', isAdmin: true });
    await setDoc(doc(d, 'members/fan1'), { status: 'approved' });
    await setDoc(doc(d, 'messages/m0'), { title: 'קיים' });
    await setDoc(doc(d, 'messages/m0/recipients/fan1'), { app: 'written' });
  });
  const admin = env.authenticatedContext('admin1').firestore();
  const fan = env.authenticatedContext('fan1').firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log('מנהל');
  await check('יוצר הודעה', assertSucceeds(setDoc(doc(admin, 'messages/m1'), { title: 'ת' })));
  await check('יוצר שורת נמען', assertSucceeds(setDoc(doc(admin, 'messages/m1/recipients/fan1'), { app: 'written' })));
  await check('מעדכן שורה (וואטסאפ נפתח)', assertSucceeds(updateDoc(doc(admin, 'messages/m1/recipients/fan1'), { wa: 'done' })));
  await check('קורא רשימה', assertSucceeds(getDocs(collection(admin, 'messages'))));
  await check('לא מוחק הודעה', assertFails(deleteDoc(doc(admin, 'messages/m0'))));
  await check('לא מוחק שורה', assertFails(deleteDoc(doc(admin, 'messages/m0/recipients/fan1'))));
  console.log('לא מנהל');
  await check('אוהד לא קורא הודעה', assertFails(getDoc(doc(fan, 'messages/m0'))));
  await check('אוהד לא קורא את השורה של עצמו', assertFails(getDoc(doc(fan, 'messages/m0/recipients/fan1'))));
  await check('אוהד לא יוצר', assertFails(setDoc(doc(fan, 'messages/x'), { title: 'ת' })));
  await check('אוהד לא מעדכן', assertFails(updateDoc(doc(fan, 'messages/m0'), { title: 'x' })));
  await check('אנונימי לא קורא', assertFails(getDoc(doc(anon, 'messages/m0'))));

  console.log(`\n${fail ? '✗' : '✅'} ${pass}/${pass + fail}`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
