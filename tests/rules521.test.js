// בדיקת §521 מול אמולטור Firestore אמיתי — ספירת כניסות (visitDays + lastVisitDay) על members.
// מה נבדק:
//   1. החבר עצמו: יום חדש → +1; פעם ראשונה → 1 או 2 בלבד; יחד עם lastSeenAt (הכתיבה האמיתית של home.html).
//   2. 🔑 נחסם: אותו יום / יום קודם (מכשיר שני), קפיצה של יותר מ-1, ירידה, שדה אחד בלי השני, פורמט יום שגוי,
//      מספר שאינו שלם, פעם ראשונה עם 5.
//   3. חבר אחר / אנונימי לא כותבים; מנהל – כן.
//   4. רגרסיה: lastSeenAt לבד עדיין עובר (הכתיבה כשהקריאה נכשלה).
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
  const env = await initializeTestEnvironment({
    projectId: 'demo-yellowzone',
    firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  const seed = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      await setDoc(doc(d, 'members/admin1'), { status: 'approved', isAdmin: true });
      await setDoc(doc(d, 'members/fresh'), { status: 'approved', firstName: 'חדש' });
      await setDoc(doc(d, 'members/counted'), { status: 'approved', visitDays: 4, lastVisitDay: '2026-10-12' });
      await setDoc(doc(d, 'members/other'), { status: 'approved' });
    });
  };
  const fresh = env.authenticatedContext('fresh').firestore();
  const counted = env.authenticatedContext('counted').firestore();
  const other = env.authenticatedContext('other').firestore();
  const anon = env.unauthenticatedContext().firestore();
  const admin = env.authenticatedContext('admin1').firestore();
  const T = '2026-10-13';

  console.log('✅ מותר');
  await seed();
  await check('פעם ראשונה – 1 (יחד עם lastSeenAt, כמו home.html)', assertSucceeds(updateDoc(doc(fresh, 'members/fresh'), { lastSeenAt: serverTimestamp(), visitDays: 1, lastVisitDay: T })));
  await seed();
  await check('פעם ראשונה – 2 ("נכנס לפני שהתחלנו לספור")', assertSucceeds(updateDoc(doc(fresh, 'members/fresh'), { visitDays: 2, lastVisitDay: T })));
  await seed();
  await check('יום חדש – +1', assertSucceeds(updateDoc(doc(counted, 'members/counted'), { lastSeenAt: serverTimestamp(), visitDays: 5, lastVisitDay: T })));
  await check('רגרסיה: lastSeenAt לבד', assertSucceeds(updateDoc(doc(counted, 'members/counted'), { lastSeenAt: serverTimestamp() })));
  await check('מנהל כותב מספר כלשהו', assertSucceeds(updateDoc(doc(admin, 'members/counted'), { visitDays: 40, lastVisitDay: '2026-01-01' })));

  console.log('🔴 נחסם');
  await seed();
  await check('אותו יום שוב (מכשיר שני)', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 5, lastVisitDay: '2026-10-12' })));
  await check('יום קודם', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 5, lastVisitDay: '2026-10-11' })));
  await check('קפיצה של 2', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 6, lastVisitDay: T })));
  await check('ירידה', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 3, lastVisitDay: T })));
  await check('אותו מספר', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 4, lastVisitDay: T })));
  await check('visitDays בלי lastVisitDay', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 5 })));
  await check('lastVisitDay בלי visitDays', assertFails(updateDoc(doc(counted, 'members/counted'), { lastVisitDay: T })));
  await check('פורמט יום שגוי', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 5, lastVisitDay: '13/10/2026' })));
  await check('מספר לא שלם', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 4.5, lastVisitDay: T })));
  await check('פעם ראשונה עם 5', assertFails(updateDoc(doc(fresh, 'members/fresh'), { visitDays: 5, lastVisitDay: T })));
  await check('פעם ראשונה עם 0', assertFails(updateDoc(doc(fresh, 'members/fresh'), { visitDays: 0, lastVisitDay: T })));
  await check('חבר אחר', assertFails(updateDoc(doc(other, 'members/counted'), { visitDays: 5, lastVisitDay: T })));
  await check('אנונימי', assertFails(updateDoc(doc(anon, 'members/counted'), { visitDays: 5, lastVisitDay: T })));
  await check('הסוואה: +1 תקין עם שינוי סטטוס', assertFails(updateDoc(doc(counted, 'members/counted'), { visitDays: 5, lastVisitDay: T, status: 'pending' })));

  console.log(`\n${fail ? '✗' : '✅'} ${pass}/${pass + fail}`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
