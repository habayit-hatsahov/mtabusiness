// ── §586 — מריץ את handleGoogleLogin + unapprovedByVerifiedEmail **מתוך worker/src/index.js** ──
// ממתין לאישור שלוחץ Google עם המייל שעל הרשומה צריך לקבל 'pending', לא google_not_linked.
// הרצה: node scratch_test_unapproved_google.js
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('worker/src/index.js', 'utf8').replace(/\r\n/g, '\n');
const fnSrc = (name) => {
  const a = src.indexOf('async function ' + name + '(');
  const b = src.indexOf('\n}\n', a);
  if (a < 0 || b < 0) throw new Error('לא נמצאה ' + name);
  return src.slice(a, b + 2);
};
const code = ['handleGoogleLogin', 'handleAppleLogin', 'unapprovedByVerifiedEmail', 'linkableByVerifiedEmail', 'membersByGoogleSub']
  .map(fnSrc).join('\n') + '\nconst MEMBER_EMAIL_SCAN_LIMIT = 3000;';

const M = (o) => ({ id: o.id || 'M1', fields: Object.assign({ status: 'approved', firstName: 'דן', lastName: 'כהן' }, o) });
// db: רשימת רשומות; השאילתה מסננת לפי שדה=ערך כמו Firestore (רגיש לרישיות)
function run(db, g) {
  const box = {
    String, console, Number,
    verifyGoogleIdToken: async () => g, verifyAppleIdToken: async () => g,
    getGoogleAccessToken: async () => 't',
    firestoreRunQuery: async (env, tok, coll, field, val, lim) => db.filter(m => m.fields[field] === val).slice(0, lim || 1e9),
    mintFirebaseCustomToken: async () => 'TOKEN',
    membersByAppleSub: async (env, tok, sub) => db.filter(m => m.fields.appleSub === sub),
    mintAppleTicket: async () => 'TICKET',
  };
  vm.createContext(box);
  vm.runInContext(code + '\n; globalThis.__g = handleGoogleLogin; globalThis.__a = handleAppleLogin;', box);
  return box;
}
const G = (o) => Object.assign({ email: 'dan@gmail.com', emailVerified: true, sub: 'S1' }, o);

(async () => {
  const chk = (t, c) => { console.log((c ? '✅' : '❌') + ' ' + t); if (!c) process.exitCode = 1; };
  const g = async (db, gg) => run(db, gg || G()).__g({ idToken: 'x' }, null, {});
  const a = async (db, gg) => run(db, gg || G()).__a({ idToken: 'x' }, null, {});

  chk('🔑 ממתין לאישור, אותו מייל → pending (המקרה של סאגי)', (await g([M({ status: 'pending', email: 'dan@gmail.com' })])).error === 'pending');
  chk('נדחה, אותו מייל → rejected', (await g([M({ status: 'rejected', email: 'dan@gmail.com' })])).error === 'rejected');
  chk('מאושר ולא מקושר → google_not_linked עם linkable (קישור בלחיצה – ללא שינוי)', (r => r.error === 'google_not_linked' && !!r.linkable)(await g([M({ email: 'dan@gmail.com' })])));
  chk('לא רשום בכלל → google_not_linked בלי linkable (ללא שינוי)', (r => r.error === 'google_not_linked' && !r.linkable)(await g([])));
  chk('🔑 מייל שגוגל לא אימתה + רשומה ממתינה → לא חושף pending', (await g([M({ status: 'pending', email: 'dan@gmail.com' })], G({ emailVerified: false }))).error === 'google_not_linked');
  chk('ממתין + מאושר עם אותו מייל → לא pending (המסלול הרגיל)', (await g([M({ id: 'A', status: 'pending', email: 'dan@gmail.com' }), M({ id: 'B', email: 'dan@gmail.com' })])).error !== 'pending');
  chk('מקושר ומאושר → נכנס (ללא שינוי)', (await g([M({ googleSub: 'S1', email: 'x@y.com' })])).customToken === 'TOKEN');
  chk('Apple: ממתין, אותו מייל → pending', (await a([M({ status: 'pending', email: 'dan@gmail.com' })])).error === 'pending');
  chk('Apple: לא רשום → apple_not_linked עם ticket (ללא שינוי)', (r => r.error === 'apple_not_linked' && r.ticket === 'TICKET')(await a([])));
})();
