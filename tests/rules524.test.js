// בדיקת §524 מול אמולטור — התיבה האישית: clickedAt ("לפרטים") ו-pushOpenedAt (נפתח מהפוש), לסטטיסטיקה.
const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, serverTimestamp } = require('firebase/firestore');
const RULES = require('path').join(__dirname, '..', 'firestore.rules');
let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 140)); }
}
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-yellowzone', firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 } });
  const item = { kind: 'update', block: 'members', title: 'כותרת', text: 'תוכן', link: '/home.html', sentAt: new Date(), readAt: null };
  const seed = async () => { await env.clearFirestore(); await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'members/m1'), { status: 'approved' }); await setDoc(doc(d, 'members/m2'), { status: 'approved' });
    await setDoc(doc(d, 'members/m1/inbox/i1'), item);
  }); };
  const m1 = env.authenticatedContext('m1').firestore(), m2 = env.authenticatedContext('m2').firestore();
  console.log('מותר');
  await seed();
  await check('readAt + clickedAt יחד (לחיצה על "לפרטים")', assertSucceeds(updateDoc(doc(m1, 'members/m1/inbox/i1'), { readAt: serverTimestamp(), clickedAt: serverTimestamp() })));
  await seed();
  await check('readAt + pushOpenedAt (נפתח מהפוש)', assertSucceeds(updateDoc(doc(m1, 'members/m1/inbox/i1'), { readAt: serverTimestamp(), pushOpenedAt: serverTimestamp() })));
  await check('clickedAt לבד', assertSucceeds(updateDoc(doc(m1, 'members/m1/inbox/i1'), { clickedAt: serverTimestamp() })));
  await check('רגרסיה: readAt לבד', assertSucceeds(updateDoc(doc(m1, 'members/m1/inbox/i1'), { readAt: serverTimestamp() })));
  console.log('נחסם');
  await seed();
  await check('clickedAt בתאריך בדוי', assertFails(updateDoc(doc(m1, 'members/m1/inbox/i1'), { clickedAt: new Date(0) })));
  await check('pushOpenedAt בתאריך בדוי', assertFails(updateDoc(doc(m1, 'members/m1/inbox/i1'), { pushOpenedAt: new Date(0) })));
  await check('readAt בדוי עם clickedAt תקין', assertFails(updateDoc(doc(m1, 'members/m1/inbox/i1'), { readAt: new Date(0), clickedAt: serverTimestamp() })));
  await check('שינוי כותרת יחד עם clickedAt', assertFails(updateDoc(doc(m1, 'members/m1/inbox/i1'), { clickedAt: serverTimestamp(), title: 'זויף' })));
  await check('חבר אחר', assertFails(updateDoc(doc(m2, 'members/m1/inbox/i1'), { clickedAt: serverTimestamp() })));
  console.log(`\n${fail ? '✗' : '✅'} ${pass}/${pass + fail}`);
  await env.cleanup(); process.exit(fail ? 1 : 0);
})();
