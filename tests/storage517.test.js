// בדיקת §517 מול אמולטור Storage (+Firestore, ל-isAdmin) — storage.rules של הריפו כפי שהוא.
// 1. קבצי אימות ישנים בשם צפוי ({id}_fan) – אנונימי לא קורא; מנהל כן. שם אקראי – קריא (getDownloadURL אחרי העלאה, §293).
// 2. יצירה בלבד: אנונימי מעלה קובץ חדש, אבל לא דורס קובץ קיים (members/proofs, bizUploads); מנהל – כן.
// הרצה (משורש הריפו): npx firebase emulators:exec --config firebase.test-storage.json --only storage,firestore --project demo-yellowzone "node tests/storage517.test.js"
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, uploadBytes, getBytes } = require('firebase/storage');
const { doc, setDoc } = require('firebase/firestore');

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 140)); }
}
const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const meta = { contentType: 'image/png' };

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-yellowzone',
    storage: { rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearStorage();
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'members/admin1'), { status: 'approved', isAdmin: true });
    const st = ctx.storage();
    await uploadBytes(ref(st, 'members/proofs/BIZ123_fan'), IMG, meta);
    await uploadBytes(ref(st, 'members/proofs/m1_0f3c9a7e-1111-4222-8333-944455556666'), IMG, meta);
    await uploadBytes(ref(st, 'bizUploads/up1/cover_aaaa'), IMG, meta);
  });
  const anon = env.unauthenticatedContext().storage();
  const admin = env.authenticatedContext('admin1').storage();

  console.log('קריאה');
  await check('אנונימי לא קורא קובץ ישן {id}_fan', assertFails(getBytes(ref(anon, 'members/proofs/BIZ123_fan'))));
  await check('מנהל קורא קובץ ישן', assertSucceeds(getBytes(ref(admin, 'members/proofs/BIZ123_fan'))));
  await check('קובץ בשם אקראי – קריא (כמו לפני)', assertSucceeds(getBytes(ref(anon, 'members/proofs/m1_0f3c9a7e-1111-4222-8333-944455556666'))));

  console.log('כתיבה – יצירה בלבד');
  await check('אנונימי מעלה תמונת אימות חדשה', assertSucceeds(uploadBytes(ref(anon, 'members/proofs/m2_new-uuid-1234567890'), IMG, meta)));
  await check('אנונימי לא דורס תמונת אימות קיימת', assertFails(uploadBytes(ref(anon, 'members/proofs/m1_0f3c9a7e-1111-4222-8333-944455556666'), IMG, meta)));
  await check('אנונימי לא דורס קובץ ישן', assertFails(uploadBytes(ref(anon, 'members/proofs/BIZ123_fan'), IMG, meta)));
  await check('מנהל דורס', assertSucceeds(uploadBytes(ref(admin, 'members/proofs/BIZ123_fan'), IMG, meta)));
  await check('bizUploads – העלאה חדשה', assertSucceeds(uploadBytes(ref(anon, 'bizUploads/up2/cover_bbbb'), IMG, meta)));
  await check('bizUploads – לא דורס', assertFails(uploadBytes(ref(anon, 'bizUploads/up1/cover_aaaa'), IMG, meta)));
  await check('לא תמונה – נחסם', assertFails(uploadBytes(ref(anon, 'members/proofs/m3_x'), IMG, { contentType: 'text/html' })));

  await env.cleanup();
  console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
