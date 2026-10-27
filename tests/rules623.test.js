// בדיקת §623 מול אמולטור Firestore אמיתי — הקובץ firestore.rules של הריפו כפי שהוא, בלי שינוי.
//
// מה נבדק: "הודעה לבעל העסק" + "כתבו לנו" מתחת להודעה – בלי לגעת בחוקים.
//   1. בעל עסק (חבר, או בטוקן העסק) פותח שיחה חדשה עם הנושא "בנוגע ל: <כותרת>" – עובר (הנושא הוא מחרוזת רגילה).
//   2. 🔑 אין שדה קישור חדש: שיחה עם שדה נוסף (refId) נדחית – ולכן הקישור יושב בנושא.
//   3. מנהל קורא את התיבה של החבר בשאילתת קידומת על title (כך נשלפת ההודעה המקורית) – עובר; אחר – נדחה.
//   4. מנהל כותב messages/{id} עם השדה bizNote (הרישום של השליחה) – עובר; לא-מנהל – נדחה.
const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDocs, collection, query, where, limit, serverTimestamp, writeBatch } = require('firebase/firestore');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');
let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 160)); }
}
const REF = 'בנוגע ל: ';
const conv = (extra) => ({
  memberId: 'm1', status: 'open', subject: REF + 'עדכון על השינויים שביקשת', source: 'bizDashboard', bizId: 'b1',
  createdAt: serverTimestamp(), lastAt: serverTimestamp(), lastFrom: 'member', memberReadAt: serverTimestamp(), ...extra,
});
function openConv(db, id, c) {
  const b = writeBatch(db);
  b.set(doc(db, 'conversations/' + id), c);
  b.set(doc(db, 'conversations/' + id + '/messages/x1'), { from: 'member', text: 'למה לא אישרתם?', createdAt: serverTimestamp() });
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
    await setDoc(doc(d, 'members/m1'), { status: 'approved', firstName: 'יוסי', isBusinessOwner: true, linkedBusinessId: 'b1' });
    await setDoc(doc(d, 'members/m2'), { status: 'approved', firstName: 'אחר' });
    await setDoc(doc(d, 'members/adm'), { status: 'approved', isAdmin: true });
    await setDoc(doc(d, 'businesses/b1'), { status: 'approved', name: 'פיצה הדרום', ownerMemberId: 'm1' });
    await setDoc(doc(d, 'members/m1/inbox/msgA'), { kind: 'update', block: 'myBiz', title: 'עדכון על השינויים שביקשת', text: '❌ לא אושר: התמונה', bizId: 'b1', sentAt: new Date(), readAt: null });
    await setDoc(doc(d, 'members/m1/inbox/msgB'), { kind: 'update', block: 'allBiz', title: 'ערב השקה', text: 'x', sentAt: new Date(), readAt: null });
  });
  const owner = env.authenticatedContext('m1').firestore();
  const bizTok = env.authenticatedContext('b1').firestore();
  const other = env.authenticatedContext('m2').firestore();
  const admin = env.authenticatedContext('adm').firestore();

  console.log('שיחה "בנוגע ל:" מבעל העסק');
  await check('חבר-בעלים פותח שיחה "בנוגע ל: …"', assertSucceeds(openConv(owner, 'c1', conv())));
  await check('בטוקן העסק (דשבורד) – עובר', assertSucceeds(openConv(bizTok, 'c2', conv())));
  await check('🔑 שדה קישור חדש (refId) – נדחה (hasOnly), לכן הקישור בנושא', assertFails(openConv(owner, 'c3', conv({ refId: 'msgA' }))));
  await check('נושא ארוך מ-80 – נדחה (ולכן הכותרת מוגבלת ל-60)', assertFails(openConv(owner, 'c4', conv({ subject: REF + 'א'.repeat(80) }))));

  console.log('שליפת ההודעה המקורית במרכז הניהול');
  const t = 'עדכון על השינויים שביקשת';
  const q = (db) => getDocs(query(collection(db, 'members/m1/inbox'), where('title', '>=', t), where('title', '<=', t + ''), limit(20)));
  await check('מנהל – שאילתת קידומת על title בתיבה של החבר', assertSucceeds(q(admin)));
  const snap = await q(admin);
  await check('השאילתה מחזירה בדיוק את ההודעה (msgA)', snap.size === 1 && snap.docs[0].id === 'msgA' ? Promise.resolve() : Promise.reject(new Error('size=' + snap.size)));
  await check('חבר אחר – נדחה', assertFails(q(other)));

  console.log('רישום השליחה');
  const rec = { title: t, who: 'biz', kind: 'pick', aud: 'bizNote', block: 'myBiz', total: 1, bizNote: { bizId: 'b1', bizName: 'פיצה הדרום', origin: 'changes' }, status: 'sending', sentAt: serverTimestamp() };
  await check('מנהל כותב messages/{id} עם bizNote', assertSucceeds(setDoc(doc(admin, 'messages/n1'), rec)));
  await check('בעל העסק – לא יכול לכתוב messages', assertFails(setDoc(doc(owner, 'messages/n2'), rec)));

  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
