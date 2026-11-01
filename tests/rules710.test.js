// בדיקת §710 מול אמולטור Firestore אמיתי — "✓ נכון" בכרטיס הצהוב (business-dashboard.html):
// בעל העסק כותב רק את serviceOwnerAckAt (timestamp) על העסק שלו. את התוכן עצמו (serviceModes /
// serviceSetBy) – רק דרך pendingChanges ואישור מנהל.
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, serverTimestamp } = require('firebase/firestore');

const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 160)); }
}

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-yellowzone', firestore: { rules: RULES } });
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    await setDoc(doc(f, 'businesses', 'BIZ1'), { status: 'approved', name: 'עסק', bizTypes: ['pro'], ownerMemberId: 'OWNER',
      serviceModes: ['toClient'], serviceSetBy: 'admin', serviceSetAt: '2026-11-01T10:00:00.000Z', regions: ['השרון'] });
    await setDoc(doc(f, 'businesses', 'BIZ2'), { status: 'approved', name: 'עסק אחר', ownerMemberId: 'OTHER' });
    await setDoc(doc(f, 'members', 'OWNER'), { status: 'approved' });
  });
  const owner = env.authenticatedContext('OWNER').firestore();
  const other = env.authenticatedContext('OTHER').firestore();
  const anon = env.unauthenticatedContext().firestore();
  const ref = (db, id = 'BIZ1') => doc(db, 'businesses', id);

  console.log('"✓ נכון"');
  await check('בעל העסק מאשר – serviceOwnerAckAt בלבד', assertSucceeds(updateDoc(ref(owner), { serviceOwnerAckAt: serverTimestamp() })));
  await check('בעל עסק אחר – לא', assertFails(updateDoc(ref(other), { serviceOwnerAckAt: serverTimestamp() })));
  await check('אנונימי – לא', assertFails(updateDoc(ref(anon), { serviceOwnerAckAt: serverTimestamp() })));
  await check('לא timestamp (מחרוזת) – לא', assertFails(updateDoc(ref(owner), { serviceOwnerAckAt: 'כן' })));

  console.log('התוכן עצמו – רק דרך אישור מנהל');
  await check('בעל העסק לא כותב serviceModes ישירות', assertFails(updateDoc(ref(owner), { serviceModes: ['remote'] })));
  await check('בעל העסק לא כותב serviceSetBy ישירות', assertFails(updateDoc(ref(owner), { serviceSetBy: 'owner' })));
  await check('אישור + שינוי תוכן באותה כתיבה – לא', assertFails(updateDoc(ref(owner), { serviceOwnerAckAt: serverTimestamp(), serviceModes: ['remote'] })));
  await check('בקשת שינוי ב-pendingChanges – כן (המסלול הקיים)', assertSucceeds(updateDoc(ref(owner), {
    pendingChanges: { serviceModes: ['atMine'], regions: [] }, pendingChangesAt: serverTimestamp() })));

  await env.cleanup();
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})();
