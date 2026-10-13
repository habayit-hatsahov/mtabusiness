// בדיקת §516 מול אמולטור Firestore אמיתי — לינק תצוגה לאורח.
//
// מה נבדק:
//   1. 🔑 אורח (uid=demo_…, role:'demo') קורא את מה שאורח צריך לראות: עסק מאושר, הגדרות ציבוריות,
//      רשימת השיחות שלו (ריקה).
//   2. 🔑 אורח לא כותב: שיחה חדשה, הודעה בשיחה, "כתבו לנו" (helpRequests fanMessage), לב לעסק.
//   3. demoLinks — מנהל בלבד, גם קריאה (מזהה המסמך הוא הלינק עצמו).
//   4. רגרסיה: חבר רגיל עדיין פותח שיחה ושולח "כתבו לנו".
const fs = require('fs');
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require('@firebase/rules-unit-testing');
const {
  doc, setDoc, getDoc, getDocs, updateDoc, collection, query, where, writeBatch, serverTimestamp, arrayUnion,
} = require('firebase/firestore');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 140)); }
}

const conv = (memberId) => ({
  memberId, status: 'open', subject: 'שלום', source: 'app',
  createdAt: serverTimestamp(), lastAt: serverTimestamp(), lastFrom: 'member', memberReadAt: serverTimestamp(),
});
const help = (memberId) => ({
  contact: 'a@b.c', message: 'שלום', source: 'fanMessage', memberId, status: 'new', createdAt: serverTimestamp(),
});

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
    await setDoc(doc(d, 'businesses/b1'), { status: 'approved', name: 'עסק', likedBy: [] });
    await setDoc(doc(d, 'settings/siteTexts'), { a: 1 });
    await setDoc(doc(d, 'demoLinks/TOKENtokenTOKENtoken1234'), { guestName: 'יוסי', revoked: false });
    await setDoc(doc(d, 'conversations/c_m1'), conv('m1'));
  });

  const demo = env.authenticatedContext('demo_TOKENtokenTO', { role: 'demo' }).firestore();
  const member = env.authenticatedContext('m1', { role: 'member' }).firestore();
  const admin = env.authenticatedContext('admin1', { role: 'member' }).firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log('אורח – קריאה');
  await check('קורא עסק מאושר', assertSucceeds(getDoc(doc(demo, 'businesses/b1'))));
  await check('קורא הגדרות ציבוריות', assertSucceeds(getDoc(doc(demo, 'settings/siteTexts'))));
  await check('רשימת השיחות שלו (ריקה)', assertSucceeds(getDocs(query(collection(demo, 'conversations'), where('memberId', '==', 'demo_TOKENtokenTO')))));
  await check('לא קורא שיחה של חבר אחר', assertFails(getDoc(doc(demo, 'conversations/c_m1'))));
  await check('לא קורא רשומת חבר אחר', assertFails(getDoc(doc(demo, 'members/m1'))));

  console.log('אורח – כתיבה נחסמת');
  await check('לא פותח שיחה', assertFails((() => {
    const b = writeBatch(demo); const ref = doc(collection(demo, 'conversations'));
    b.set(ref, conv('demo_TOKENtokenTO'));
    b.set(doc(collection(demo, 'conversations', ref.id, 'messages')), { from: 'member', text: 'היי', createdAt: serverTimestamp() });
    return b.commit();
  })()));
  await check('לא שולח "כתבו לנו"', assertFails(setDoc(doc(demo, 'helpRequests/h_demo'), help('demo_TOKENtokenTO'))));
  await check('לא מסמן לב', assertFails(updateDoc(doc(demo, 'businesses/b1'), { likedBy: arrayUnion('demo_TOKENtokenTO') })));
  await check('לא קורא demoLinks', assertFails(getDoc(doc(demo, 'demoLinks/TOKENtokenTOKENtoken1234'))));
  await check('לא כותב demoLinks', assertFails(updateDoc(doc(demo, 'demoLinks/TOKENtokenTOKENtoken1234'), { revoked: false })));

  console.log('demoLinks – מנהל בלבד');
  await check('מנהל קורא', assertSucceeds(getDoc(doc(admin, 'demoLinks/TOKENtokenTOKENtoken1234'))));
  await check('מנהל יוצר', assertSucceeds(setDoc(doc(admin, 'demoLinks/NEWtokenNEWtokenNEWtok12'), { guestName: 'דנה', revoked: false })));
  await check('מנהל מכבה', assertSucceeds(updateDoc(doc(admin, 'demoLinks/TOKENtokenTOKENtoken1234'), { revoked: true })));
  await check('חבר רגיל לא קורא', assertFails(getDoc(doc(member, 'demoLinks/TOKENtokenTOKENtoken1234'))));
  await check('אנונימי לא קורא', assertFails(getDoc(doc(anon, 'demoLinks/TOKENtokenTOKENtoken1234'))));
  await check('אנונימי לא מונה', assertFails(getDocs(collection(anon, 'demoLinks'))));

  console.log('רגרסיה – חבר רגיל');
  await check('חבר פותח שיחה', assertSucceeds((() => {
    const b = writeBatch(member); const ref = doc(collection(member, 'conversations'));
    b.set(ref, conv('m1'));
    b.set(doc(collection(member, 'conversations', ref.id, 'messages')), { from: 'member', text: 'היי', createdAt: serverTimestamp() });
    return b.commit();
  })()));
  await check('חבר שולח "כתבו לנו"', assertSucceeds(setDoc(doc(member, 'helpRequests/h_m1'), help('m1'))));
  await check('חבר קורא את השיחה שלו', assertSucceeds(getDoc(doc(member, 'conversations/c_m1'))));

  await env.cleanup();
  console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
