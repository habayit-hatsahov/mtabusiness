// בדיקת claimBizToken (worker/src/firestore.js) בהרצה אמיתית מול fetch מדומה. נכתבה ב-§419.
//
// זו פונקציה **רגישה-אבטחתית**: היא כותבת טוקן-כניסה לדשבורד על סמך מזהה שהגיע מהלקוח.
// הכלל היחיד שמחזיק אותה הוא "לעולם לא לדרוס מסמך קיים" — מי שמנחש מזהה של עסק (והוא
// מזהה של מסמך **ציבורי**) היה מחליף את הטוקן ונכנס לדשבורד של עסק אחר. `node --check`
// אינו בודק את זה; רק הרצה בודקת.
import { claimBizToken } from '../worker/src/firestore.js';

const env = { FIREBASE_PROJECT_ID: 'demo' };

// מדמה את Firestore REST. `docs` הוא מפת path → fields (בפורמט הגולמי של Firestore).
// כל קריאה נרשמת, כדי שאפשר יהיה לטעון "לא נכתב כלום" ולא רק "הוחזר null".
function mockFirestore(docs) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const path = String(url).split('/documents/')[1].split('?')[0];
    calls.push({ method, path });
    if (method === 'PATCH') {
      docs[path] = JSON.parse(opts.body).fields;
      return { ok: true, status: 200, json: async () => ({ name: 'projects/demo/databases/(default)/documents/' + path }) };
    }
    if (!(path in docs)) return { ok: false, status: 404, text: async () => 'not found' };
    return {
      ok: true, status: 200,
      json: async () => ({ name: 'projects/demo/databases/(default)/documents/' + path, fields: docs[path] }),
    };
  };
  return { calls, docs, wrote: () => calls.some((c) => c.method === 'PATCH') };
}

const S = (v) => ({ stringValue: v });

let pass = 0, fail = 0;
function is(name, got, want) {
  if (got === want) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      קיבלתי:  ' + JSON.stringify(got) + '\n      ציפיתי:  ' + JSON.stringify(want)); }
}

console.log('\n— המסלול שנולד בשבילו: אין מסמך טוקן, העסק ממתין —');
{
  const m = mockFirestore({ 'businesses/b1': { status: S('pending') } });
  is('מחזיר את מזהה העסק', await claimBizToken(env, 'g', 'b1', 'tok-1'), 'b1');
  is('והטוקן נכתב', m.docs['bizTokens/b1'].accessToken.stringValue, 'tok-1');
}

console.log('\n— 🔒 חטיפה: מסמך טוקן קיים עם טוקן אחר —');
{
  const m = mockFirestore({ 'bizTokens/b1': { accessToken: S('הטוקן-האמיתי') }, 'businesses/b1': { status: S('pending') } });
  is('נדחה', await claimBizToken(env, 'g', 'b1', 'טוקן-של-תוקף'), null);
  is('ולא נכתב כלום', m.wrote(), false);
  is('והטוקן הקיים לא נגע', m.docs['bizTokens/b1'].accessToken.stringValue, 'הטוקן-האמיתי');
}

console.log('\n— מסמך טוקן קיים עם אותו טוקן (שליחה חוזרת / מרוץ מול הלקוח) —');
{
  const m = mockFirestore({ 'bizTokens/b1': { accessToken: S('tok-1') }, 'businesses/b1': { status: S('pending') } });
  is('מזוהה', await claimBizToken(env, 'g', 'b1', 'tok-1'), 'b1');
  is('בלי כתיבה מיותרת', m.wrote(), false);
}

console.log('\n— 🔒 העסק חייב להתקיים ולהיות pending —');
{
  const m = mockFirestore({});
  is('עסק שאינו קיים → נדחה', await claimBizToken(env, 'g', 'b404', 'tok'), null);
  is('בלי כתיבה', m.wrote(), false);
}
{
  const m = mockFirestore({ 'businesses/b1': { status: S('approved') } });
  is('עסק מאושר → נדחה (זו הייתה הנפקת-טוקן לעסק חי)', await claimBizToken(env, 'g', 'b1', 'tok'), null);
  is('בלי כתיבה', m.wrote(), false);
}
{
  const m = mockFirestore({ 'businesses/b1': { status: S('rejected') } });
  is('עסק שנדחה → נדחה', await claimBizToken(env, 'g', 'b1', 'tok'), null);
  is('בלי כתיבה', m.wrote(), false);
}

console.log('\n— ארגומנטים חסרים —');
{
  const m = mockFirestore({ 'businesses/b1': { status: S('pending') } });
  is('בלי מזהה עסק', await claimBizToken(env, 'g', '', 'tok'), null);
  is('בלי טוקן', await claimBizToken(env, 'g', 'b1', ''), null);
  is('ואף לא נגענו ברשת', m.calls.length, 0);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
