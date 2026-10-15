// בדיקת §536 מול אמולטור Firestore אמיתי — settings/splashScreen (תמונות מסך הפתיחה).
//   1. קריאה ציבורית: אורח לא-מחובר וחבר (welcome/home קוראים לפני ההתחברות).
//   2. כתיבה: מנהל בלבד. חבר ואורח נדחים.
//   3. רגרסיה: מסמך settings אחר שאינו ציבורי עדיין סגור לאורח.
const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 140)); }
}
const cfg = { enabled: true, items: [{ id: 'd1', url: 'https://yellowzone.co.il/images/splash/splash-1.jpg', path: '', on: true }] };

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-yellowzone',
    firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'members/admin1'), { status: 'approved', isAdmin: true });
    await setDoc(doc(d, 'members/m1'), { status: 'approved', firstName: 'איל' });
    await setDoc(doc(d, 'settings/splashScreen'), cfg);
    await setDoc(doc(d, 'settings/secretThing'), { a: 1 });
  });
  const admin = env.authenticatedContext('admin1', { role: 'member' }).firestore();
  const member = env.authenticatedContext('m1', { role: 'member' }).firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log('קריאה');
  await check('אורח לא-מחובר קורא', assertSucceeds(getDoc(doc(anon, 'settings/splashScreen'))));
  await check('חבר קורא', assertSucceeds(getDoc(doc(member, 'settings/splashScreen'))));
  console.log('כתיבה');
  await check('מנהל כותב', assertSucceeds(setDoc(doc(admin, 'settings/splashScreen'), { ...cfg, enabled: false })));
  await check('חבר לא כותב', assertFails(updateDoc(doc(member, 'settings/splashScreen'), { enabled: true })));
  await check('אורח לא כותב', assertFails(setDoc(doc(anon, 'settings/splashScreen'), cfg)));
  console.log('רגרסיה');
  await check('settings אחר סגור לאורח', assertFails(getDoc(doc(anon, 'settings/secretThing'))));

  console.log(`\n${pass}/${pass + fail}`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
