// בדיקת §624 מול אמולטור Firestore אמיתי — לב ל"האוהד שמאחורי העסק" (storyLikes).
// המונה חייב לזוז רק יחד עם הלב האישי, ובדיוק באחד. הכתיבות כאן בנויות כמו ב-home.html:
// batch של set(by/uid) + set(parent, {count: increment(±1)}, {merge:true}).
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, deleteDoc, writeBatch, increment, serverTimestamp } = require('firebase/firestore');

const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const S = 'fan_BIZ1_2026-10-25';

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 160)); }
}

function like(db, uid, story = S) {
  const b = writeBatch(db);
  b.set(doc(db, 'storyLikes', story, 'by', uid), { at: serverTimestamp() });
  b.set(doc(db, 'storyLikes', story), { count: increment(1) }, { merge: true });
  return b.commit();
}
function unlike(db, uid, story = S) {
  const b = writeBatch(db);
  b.delete(doc(db, 'storyLikes', story, 'by', uid));
  b.set(doc(db, 'storyLikes', story), { count: increment(-1) }, { merge: true });
  return b.commit();
}

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-yellowzone', firestore: { rules: RULES } });
  await env.withSecurityRulesDisabled(async (c) => {
    for (const id of ['A', 'B', 'C']) await setDoc(doc(c.firestore(), 'members', id), { status: 'approved' });
  });
  const A = env.authenticatedContext('A').firestore();
  const B = env.authenticatedContext('B').firestore();
  const N = env.authenticatedContext('NOMEMBER').firestore();
  const D = env.authenticatedContext('demo_x', { role: 'demo' }).firestore();
  const anon = env.unauthenticatedContext().firestore();
  const count = async () => { let n; await env.withSecurityRulesDisabled(async (c) => { const s = await getDoc(doc(c.firestore(), 'storyLikes', S)); n = s.exists() ? s.data().count : 0; }); return n; };
  const expect = async (n) => { const c = await count(); if (c !== n) throw new Error('count=' + c + ' צפוי ' + n); };

  console.log('לב ראשון / שני / ביטול');
  await check('A נותן לב ראשון (יוצר את המונה)', assertSucceeds(like(A, 'A')));
  await check('המונה = 1', expect(1));
  await check('A לא יכול לתת לב פעמיים', assertFails(like(A, 'A')));
  await check('B נותן לב', assertSucceeds(like(B, 'B')));
  await check('המונה = 2', expect(2));
  await check('A מבטל', assertSucceeds(unlike(A, 'A')));
  await check('המונה = 1', expect(1));
  await check('A לא מבטל פעמיים', assertFails(unlike(A, 'A')));
  await check('A נותן לב שוב', assertSucceeds(like(A, 'A')));
  await check('המונה = 2', expect(2));

  console.log('ניסיונות לשבור');
  await check('אנונימי לא נותן לב', assertFails(like(anon, 'X')));
  await check('מחובר בלי רשומת חבר לא נותן לב', assertFails(like(N, 'NOMEMBER')));
  await check('אורח (demo) לא נותן לב', assertFails(like(D, 'demo_x')));
  await check('A לא נותן לב בשם C', assertFails(like(A, 'C')));
  await check('A לא מבטל את הלב של B', assertFails(unlike(A, 'B')));
  await check('ניפוח המונה בלי לב', assertFails(setDoc(doc(A, 'storyLikes', S), { count: increment(5) }, { merge: true })));
  await check('המונה +1 בלי לב אישי', assertFails(setDoc(doc(A, 'storyLikes', S), { count: increment(1) }, { merge: true })));
  await check('לב אישי בלי להזיז מונה', assertFails(setDoc(doc(B, 'storyLikes', 'fan_other', 'by', 'B'), { at: serverTimestamp() })));
  await check('C: +2 עם לב אחד', assertFails((() => { const C = env.authenticatedContext('C').firestore(); const b = writeBatch(C); b.set(doc(C, 'storyLikes', S, 'by', 'C'), { at: serverTimestamp() }); b.set(doc(C, 'storyLikes', S), { count: increment(2) }, { merge: true }); return b.commit(); })()));
  await check('שדה זר על המונה', assertFails((() => { const C = env.authenticatedContext('C').firestore(); const b = writeBatch(C); b.set(doc(C, 'storyLikes', S, 'by', 'C'), { at: serverTimestamp() }); b.set(doc(C, 'storyLikes', S), { count: increment(1), x: 1 }, { merge: true }); return b.commit(); })()));
  await check('שדה זר בלב האישי', assertFails((() => { const C = env.authenticatedContext('C').firestore(); const b = writeBatch(C); b.set(doc(C, 'storyLikes', S, 'by', 'C'), { at: serverTimestamp(), name: 'x' }); b.set(doc(C, 'storyLikes', S), { count: increment(1) }, { merge: true }); return b.commit(); })()));
  await check('מחיקת המונה', assertFails(deleteDoc(doc(A, 'storyLikes', S))));
  await check('המונה עדיין 2', expect(2));

  console.log('קריאה');
  await check('אנונימי קורא את המונה', assertSucceeds(getDoc(doc(anon, 'storyLikes', S))));
  await check('A קורא את הלב שלו', assertSucceeds(getDoc(doc(A, 'storyLikes', S, 'by', 'A'))));
  await check('A לא קורא את הלב של B', assertFails(getDoc(doc(A, 'storyLikes', S, 'by', 'B'))));

  await env.cleanup();
  console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
