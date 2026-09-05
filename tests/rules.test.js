// בדיקת חוקי §417 מול אמולטור Firestore אמיתי — לא קריאה בקוד.
// הקובץ שנבדק הוא firestore.rules של הריפו עצמו, כפי שהוא כרגע.
const fs = require('fs');
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, getDocs, deleteDoc,
} = require('firebase/firestore');

const RULES = require('path').join(__dirname, '..', 'firestore.rules');
const MSG = (from) => ({ from, text: 'שלום', createdAt: new Date(), readAt: null });

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 120)); }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-yellowzone',
    firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();

  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'members/admin1'), { isAdmin: true, status: 'approved' });
    await setDoc(doc(d, 'members/m1'), { status: 'approved' });
    await setDoc(doc(d, 'members/x1'), { status: 'approved' });
    await setDoc(doc(d, 'businesses/b1'), { status: 'approved', ownerMemberId: 'm1', name: 'עסק' });
    await setDoc(doc(d, 'businesses/b1/messages/fromAdmin'), MSG('admin'));
    await setDoc(doc(d, 'businesses/b1/messages/fromBiz'), MSG('biz'));
  });

  const admin = env.authenticatedContext('admin1').firestore();
  const biz = env.authenticatedContext('b1').firestore();      // בעל עסק שנכנס עם טוקן העסק
  const owner = env.authenticatedContext('m1').firestore();    // אותו אדם, שנכנס כחבר (§397)
  const stranger = env.authenticatedContext('x1').firestore(); // חבר מחובר, לא קשור לעסק
  const anon = env.unauthenticatedContext().firestore();
  const msgs = (d) => collection(d, 'businesses/b1/messages');

  console.log('\n— שליחה —');
  await check('מנהל שולח from=admin', assertSucceeds(addDoc(msgs(admin), MSG('admin'))));
  await check('עסק שולח from=biz', assertSucceeds(addDoc(msgs(biz), MSG('biz'))));
  await check('בעל-עסק שנכנס כחבר שולח from=biz', assertSucceeds(addDoc(msgs(owner), MSG('biz'))));
  await check('עסק מתחזה למנהל — נדחה', assertFails(addDoc(msgs(biz), MSG('admin'))));
  await check('מנהל מתחזה לעסק — נדחה', assertFails(addDoc(msgs(admin), MSG('biz'))));
  await check('זר שולח — נדחה', assertFails(addDoc(msgs(stranger), MSG('biz'))));
  await check('אנונימי שולח — נדחה', assertFails(addDoc(msgs(anon), MSG('biz'))));
  await check('טקסט ריק — נדחה', assertFails(addDoc(msgs(biz), { from: 'biz', text: '', createdAt: new Date(), readAt: null })));
  await check('טקסט מעל 2000 תווים — נדחה', assertFails(addDoc(msgs(biz), { from: 'biz', text: 'א'.repeat(2001), createdAt: new Date(), readAt: null })));
  await check('שדה זר בהודעה — נדחה', assertFails(addDoc(msgs(biz), { from: 'biz', text: 'x', createdAt: new Date(), readAt: null, isAdmin: true })));

  console.log('\n— קריאה —');
  await check('מנהל קורא', assertSucceeds(getDocs(msgs(admin))));
  await check('עסק קורא', assertSucceeds(getDocs(msgs(biz))));
  await check('בעל-עסק כחבר קורא', assertSucceeds(getDocs(msgs(owner))));
  await check('זר קורא — נדחה', assertFails(getDocs(msgs(stranger))));
  await check('אנונימי קורא — נדחה', assertFails(getDocs(msgs(anon))));

  console.log('\n— עריכה ומחיקה —');
  const M = (d, id) => doc(d, 'businesses/b1/messages/' + id);
  await check('עסק מסמן נקרא על הודעת מנהל', assertSucceeds(updateDoc(M(biz, 'fromAdmin'), { readAt: new Date() })));
  await check('מנהל מסמן נקרא על הודעת עסק', assertSucceeds(updateDoc(M(admin, 'fromBiz'), { readAt: new Date() })));
  await check('עסק מסמן נקרא על ההודעה של עצמו — נדחה', assertFails(updateDoc(M(biz, 'fromBiz'), { readAt: new Date() })));
  await check('עסק עורך טקסט של הודעת מנהל — נדחה', assertFails(updateDoc(M(biz, 'fromAdmin'), { text: 'שונה' })));
  await check('מנהל עורך טקסט — נדחה', assertFails(updateDoc(M(admin, 'fromBiz'), { text: 'שונה' })));
  await check('עסק מוחק — נדחה', assertFails(deleteDoc(M(biz, 'fromAdmin'))));
  await check('מנהל מוחק', assertSucceeds(deleteDoc(M(admin, 'fromBiz'))));

  console.log('\n— שדות הסיכום על מסמך העסק —');
  const B = (d) => doc(d, 'businesses/b1');
  await check('עסק מעדכן סיכום אחרי ששלח', assertSucceeds(updateDoc(B(biz), { msgLastAt: new Date(), msgLastFrom: 'biz', msgUnreadAdmin: true })));
  await check('עסק כותב msgLastFrom=admin — נדחה', assertFails(updateDoc(B(biz), { msgLastFrom: 'admin' })));
  await check('עסק מדליק לעצמו msgUnreadBiz — נדחה', assertFails(updateDoc(B(biz), { msgUnreadBiz: true })));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'businesses/b1'), { msgLastFrom: 'admin', msgUnreadBiz: true });
  });
  // 🔑 הרגרסיה שנשמרתי ממנה במפורש: כשההודעה האחרונה היא מהמנהל, msgLastFrom=='admin'
  // יושב על המסמך — ובדיקה מול request.resource.data (במקום מול affectedKeys) הייתה
  // חוסמת את העסק מלנקות את הדגל של עצמו.
  await check('עסק מנקה msgUnreadBiz כשההודעה האחרונה מהמנהל', assertSucceeds(updateDoc(B(biz), { msgUnreadBiz: false })));
  await check('עסק מבריח שדה אחר (ערך חדש) יחד עם הסיכום — נדחה', assertFails(updateDoc(B(biz), { msgUnreadAdmin: true, name: 'שם שהעסק שינה לעצמו' })));
  // כתיבת אותו ערך בדיוק אינה נספרת כשינוי ב-affectedKeys, ולכן עוברת. זו אינה פרצה:
  // המסמך יוצא זהה. הבדיקה הקודמת כאן נכשלה בדיוק בגלל זה — היא כתבה status='approved'
  // על מסמך שכבר היה approved, כלומר לא ניסתה כלום.
  await check('כתיבת אותו ערך בדיוק אינה שינוי — עוברת (מתועד, לא פרצה)', assertSucceeds(updateDoc(B(biz), { msgUnreadAdmin: true, status: 'approved' })));

  console.log('\n— מתג ההשקה —');
  await check('כל אחד קורא settings/appLaunch', assertSucceeds(getDoc(doc(anon, 'settings/appLaunch'))));
  await check('מנהל כותב', assertSucceeds(setDoc(doc(admin, 'settings/appLaunch'), { bannerFans: false })));
  await check('עסק כותב — נדחה', assertFails(setDoc(doc(biz, 'settings/appLaunch'), { bannerFans: true })));
  await check('זר כותב — נדחה', assertFails(setDoc(doc(stranger, 'settings/appLaunch'), { bannerFans: true })));

  await env.cleanup();
  console.log('\n════════  עברו: ' + pass + '   נכשלו: ' + fail + '  ════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('קריסה:', e); process.exit(2); });
