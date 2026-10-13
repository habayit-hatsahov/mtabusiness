// בדיקת §501 מול אמולטור Firestore אמיתי — הקובץ firestore.rules של הריפו כפי שהוא.
//
// מה נבדק: שיחות עם הצוות (conversations + messages).
//   1. 🔑 אוהד פותח שיחה + הודעה ראשונה באותו batch — עובר (getAfter).
//   2. בעל עסק מחובר בטוקן העסק (uid = businessId) פותח שיחה בשם החבר שלו — עובר; בשם אחר — נדחה.
//   3. התחזות: שיחה בשם חבר אחר, הודעה "from:admin" מבעלים, קריאת שיחה של אחר — נדחה.
//   4. הבעלים לא יכול לסגור/לסמן "ענינו"; לא יכול לכתוב לשיחה סגורה.
//   5. מנהל: קורא הכל, עונה (from:admin), סוגר. הודעות לא ניתנות לעריכה/מחיקה.
//   6. list עם where(memberId) — לבעלים עובר, בלי האילוץ נדחה.
const fs = require('fs');
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require('@firebase/rules-unit-testing');
const {
  doc, setDoc, getDoc, updateDoc, deleteDoc, getDocs, collection, query, where,
  serverTimestamp, writeBatch,
} = require('firebase/firestore');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 160)); }
}

const conv = (extra) => ({
  memberId: 'm1', status: 'open', subject: 'שאלה על ההטבה', source: 'app',
  createdAt: serverTimestamp(), lastAt: serverTimestamp(), lastFrom: 'member',
  memberReadAt: serverTimestamp(), ...extra,
});
const msg = (extra) => ({ from: 'member', text: 'שלום, יש לי שאלה', createdAt: serverTimestamp(), ...extra });

// שיחה + הודעה ראשונה באותו batch — בדיוק כמו conversations.js
function openConv(db, id, c, m) {
  const b = writeBatch(db);
  b.set(doc(db, 'conversations/' + id), c);
  b.set(doc(db, 'conversations/' + id + '/messages/x1'), m);
  return b.commit();
}

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
    await setDoc(doc(d, 'members/adm'), { status: 'approved', isAdmin: true });
    // §517 — "בעלים מקושר" רק לעסק מאושר (isLinkedBusinessOwnerOf). כמו במציאות: דשבורד = עסק מאושר.
    await setDoc(doc(d, 'businesses/b1'), { status: 'approved', name: 'שווארמה', ownerMemberId: 'm1' });
    // שיחה סגורה של m1, ושיחה של m2
    await setDoc(doc(d, 'conversations/closed1'), { ...conv(), status: 'closed', createdAt: new Date(), lastAt: new Date(), memberReadAt: new Date() });
    await setDoc(doc(d, 'conversations/other'), { ...conv({ memberId: 'm2' }), createdAt: new Date(), lastAt: new Date(), memberReadAt: new Date() });
    await setDoc(doc(d, 'conversations/other/messages/a'), { from: 'member', text: 'סוד', createdAt: new Date() });
  });

  const m1 = env.authenticatedContext('m1').firestore();
  const m2 = env.authenticatedContext('m2').firestore();
  const biz = env.authenticatedContext('b1').firestore();      // כניסה בטוקן העסק
  const adm = env.authenticatedContext('adm').firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log('\n══ פתיחת שיחה ══');
  await check('🔑 אוהד פותח שיחה + הודעה ראשונה באותו batch — עובר',
    assertSucceeds(openConv(m1, 'c1', conv(), msg())));
  await check('🔑 בעל עסק בטוקן העסק פותח שיחה בשם החבר שלו — עובר',
    assertSucceeds(openConv(biz, 'c2', conv({ source: 'bizDashboard', bizId: 'b1' }), msg())));
  await check('בעל עסק בטוקן העסק · בשם חבר אחר — נדחה',
    assertFails(openConv(biz, 'c3', conv({ memberId: 'm2' }), msg())));
  await check('אוהד · שיחה בשם חבר אחר — נדחה (התחזות)',
    assertFails(openConv(m1, 'c4', conv({ memberId: 'm2' }), msg())));
  await check('אנונימי · פתיחת שיחה — נדחה',
    assertFails(openConv(anon, 'c5', conv(), msg())));
  await check('אוהד · נולדת סגורה — נדחה',
    assertFails(openConv(m1, 'c6', conv({ status: 'closed' }), msg())));
  await check('אוהד · נולדת "ענינו" (lastFrom:admin) — נדחה',
    assertFails(openConv(m1, 'c7', conv({ lastFrom: 'admin' }), msg())));
  await check('אוהד · הודעה ראשונה from:admin — נדחה (שתילת תשובה)',
    assertFails(openConv(m1, 'c8', conv(), msg({ from: 'admin' }))));
  await check('אוהד · שדה זר בשיחה — נדחה',
    assertFails(openConv(m1, 'c9', conv({ isUrgent: true }), msg())));
  await check('אוהד · נושא של 81 תווים — נדחה',
    assertFails(openConv(m1, 'c10', conv({ subject: 'א'.repeat(81) }), msg())));
  await check('אוהד · הודעה של 2001 תווים — נדחה',
    assertFails(openConv(m1, 'c11', conv(), msg({ text: 'א'.repeat(2001) }))));
  await check('אוהד · הודעה של 2000 תווים — עובר',
    assertSucceeds(openConv(m1, 'c12', conv(), msg({ text: 'א'.repeat(2000) }))));

  console.log('\n══ המשך שיחה ══');
  const reply = (db, id, mid, m, upd) => {
    const b = writeBatch(db);
    b.set(doc(db, 'conversations/' + id + '/messages/' + mid), m);
    b.update(doc(db, 'conversations/' + id), upd);
    return b.commit();
  };
  await check('אוהד · הודעה נוספת בשיחה פתוחה שלו — עובר',
    assertSucceeds(reply(m1, 'c1', 'x2', msg(), { lastAt: serverTimestamp(), lastFrom: 'member', memberReadAt: serverTimestamp() })));
  await check('אוהד · הודעה בשיחה סגורה — נדחה',
    assertFails(reply(m1, 'closed1', 'x2', msg(), { lastAt: serverTimestamp(), lastFrom: 'member' })));
  await check('אוהד · הודעה בשיחה של אחר — נדחה',
    assertFails(reply(m1, 'other', 'x2', msg(), { lastAt: serverTimestamp(), lastFrom: 'member' })));
  await check('אוהד · סימון "נקרא" — עובר',
    assertSucceeds(updateDoc(doc(m1, 'conversations/c1'), { memberReadAt: serverTimestamp() })));
  await check('אוהד · "נקרא" גם בשיחה סגורה — עובר',
    assertSucceeds(updateDoc(doc(m1, 'conversations/closed1'), { memberReadAt: serverTimestamp() })));
  await check('אוהד · סוגר שיחה בעצמו — נדחה',
    assertFails(updateDoc(doc(m1, 'conversations/c1'), { status: 'closed' })));
  await check('אוהד · מסמן lastFrom:admin — נדחה',
    assertFails(updateDoc(doc(m1, 'conversations/c1'), { lastFrom: 'admin', lastAt: serverTimestamp() })));
  await check('אוהד · מעביר את השיחה לחבר אחר — נדחה',
    assertFails(updateDoc(doc(m1, 'conversations/c1'), { memberId: 'm2' })));
  await check('אוהד · עורך הודעה שנשלחה — נדחה',
    assertFails(updateDoc(doc(m1, 'conversations/c1/messages/x1'), { text: 'שונה' })));
  await check('אוהד · מוחק שיחה — נדחה',
    assertFails(deleteDoc(doc(m1, 'conversations/c1'))));

  console.log('\n══ קריאה ══');
  await check('אוהד · קורא שיחה שלו — עובר', assertSucceeds(getDoc(doc(m1, 'conversations/c1'))));
  await check('אוהד · קורא הודעות שלו — עובר', assertSucceeds(getDocs(collection(m1, 'conversations/c1/messages'))));
  await check('אוהד · קורא שיחה של אחר — נדחה', assertFails(getDoc(doc(m1, 'conversations/other'))));
  await check('אוהד · קורא הודעות של אחר — נדחה', assertFails(getDocs(collection(m1, 'conversations/other/messages'))));
  await check('🔑 אוהד · list עם where(memberId==עצמו) — עובר',
    assertSucceeds(getDocs(query(collection(m1, 'conversations'), where('memberId', '==', 'm1')))));
  await check('אוהד · list בלי אילוץ — נדחה',
    assertFails(getDocs(collection(m1, 'conversations'))));
  await check('אוהד · list עם where(memberId==אחר) — נדחה',
    assertFails(getDocs(query(collection(m1, 'conversations'), where('memberId', '==', 'm2')))));
  await check('🔑 בעל עסק בטוקן · list של החבר שלו — עובר',
    assertSucceeds(getDocs(query(collection(biz, 'conversations'), where('memberId', '==', 'm1')))));
  await check('בעל עסק בטוקן · list של חבר אחר — נדחה',
    assertFails(getDocs(query(collection(biz, 'conversations'), where('memberId', '==', 'm2')))));
  await check('אנונימי · קריאה — נדחה', assertFails(getDoc(doc(anon, 'conversations/c1'))));

  console.log('\n══ מנהל ══');
  await check('מנהל · list של הכל — עובר', assertSucceeds(getDocs(collection(adm, 'conversations'))));
  await check('מנהל · קורא הודעות של כל שיחה — עובר', assertSucceeds(getDocs(collection(adm, 'conversations/other/messages'))));
  await check('🔑 מנהל · עונה (from:admin) + "ענינו" — עובר',
    assertSucceeds(reply(adm, 'c1', 'r1', msg({ from: 'admin', text: 'תשובה' }), { lastAt: serverTimestamp(), lastFrom: 'admin', adminReadAt: serverTimestamp() })));
  await check('מנהל · הודעה from:member — נדחה (התחזות לאוהד)',
    assertFails(reply(adm, 'c1', 'r2', msg(), { lastAt: serverTimestamp() })));
  await check('מנהל · סוגר שיחה — עובר',
    assertSucceeds(updateDoc(doc(adm, 'conversations/c1'), { status: 'closed', closedAt: serverTimestamp() })));
  await check('מנהל · status לא מוכר — נדחה',
    assertFails(updateDoc(doc(adm, 'conversations/c1'), { status: 'deleted' })));
  await check('מנהל · מוחק הודעה — נדחה',
    assertFails(deleteDoc(doc(adm, 'conversations/c1/messages/x1'))));
  await check('אוהד · אחרי שנסגרה — כבר לא יכול לכתוב',
    assertFails(reply(m1, 'c1', 'x3', msg(), { lastAt: serverTimestamp(), lastFrom: 'member' })));
  await check('אוהד m2 · לא רואה את התשובה ל-m1',
    assertFails(getDocs(collection(m2, 'conversations/c1/messages'))));

  console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
