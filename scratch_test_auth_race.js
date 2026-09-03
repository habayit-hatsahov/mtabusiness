// ── §406 — מריץ את heroRunAuth **מתוך welcome.html** מול חמישה תרחישי-מרוץ ────────────────
// 🔴 התרחיש הראשון הוא באג-זהות אמיתי: זהות שכבר הייתה במכשיר ניצחה את המרוץ.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('welcome.html', 'utf8');
const a = src.indexOf('const HERO_AUTH_REJECT_GRACE_MS');
const b = src.indexOf('\n}\n', src.indexOf('function heroRunAuth(', a));
if (a < 0 || b < 0) throw new Error('לא נמצא הבלוק');
const code = src.slice(a, b + 2);
if (!code.includes('u.uid !== before')) throw new Error('נשלף בלוק בלי תיקון-הזהות — העוגן תפס גרסה ישנה');

function run({ current, callResolve, callReject, callDelay, stateUid, stateDelay }) {
  const box = { setTimeout, clearTimeout, Promise, console,
    auth: { currentUser: current ? { uid: current } : null },
    onAuthStateChanged: (auth, cb) => {
      // Firebase יורה **מיד** עם המצב הקיים — זה בדיוק מה שיצר את הבאג
      if (current) cb({ uid: current });
      if (stateUid) setTimeout(() => cb({ uid: stateUid }), stateDelay);
      return () => {};
    },
    signInWithCustomToken: () => new Promise((res, rej) => {
      if (callResolve) setTimeout(() => res({ user: { uid: callResolve } }), callDelay || 50);
      else if (callReject) setTimeout(() => rej(Object.assign(new Error('x'), { code: callReject })), callDelay || 50);
    }),
  };
  vm.createContext(box);
  vm.runInContext(code + '\n; globalThis.__f = heroRunAuth;', box);
  let doneUid = null;
  const h = box.__f('TOK', (uid) => { doneUid = uid; });
  const t0 = Date.now();
  return h.settled.then(
    uid => { h.done(uid); return { uid: doneUid, ms: Date.now() - t0 }; },
    err => ({ err: err.code || err.message, ms: Date.now() - t0 })
  );
}
(async () => {
  const chk = (t, c) => { console.log((c ? '✅' : '❌') + ' ' + t); if (!c) process.exitCode = 1; };

  // 1. 🔴 באג-הזהות: במכשיר כבר מחובר OLD, והכניסה החדשה היא של NEW
  const r1 = await run({ current: 'OLD', callResolve: 'NEW', callDelay: 300 });
  console.log('   1. מחובר OLD, נכנס NEW  →  ' + JSON.stringify(r1));
  chk('🔴 זהות קודמת אינה מנצחת — נכנס NEW ולא OLD', r1.uid === 'NEW');

  // 2. §322 חייב להישמר: ההבטחה נתקעת, מצב-ההזדהות מדווח הצלחה
  const r2 = await run({ stateUid: 'NEW', stateDelay: 200 });
  console.log('   2. ההבטחה תקועה, auth-state מדווח  →  ' + JSON.stringify(r2));
  chk('§322 נשמר — מצב-ההזדהות עדיין מכניס', r2.uid === 'NEW' && r2.ms < 1000);

  // 3. §406: ההבטחה **נדחתה**, ומיד אחריה מצב-ההזדהות נסגר
  const r3 = await run({ callReject: 'auth/network-request-failed', callDelay: 100, stateUid: 'NEW', stateDelay: 600 });
  console.log('   3. ההבטחה נדחתה ואז auth-state נסגר  →  ' + JSON.stringify(r3));
  chk('🔑 דחייה כבר לא הורגת את רשת-הביטחון של §322', r3.uid === 'NEW');

  // 4. דחייה בלי שום הצלחה — השגיאה המקורית נשמרת, אחרי חלון-החסד
  const r4 = await run({ callReject: 'auth/invalid-custom-token', callDelay: 100 });
  console.log('   4. דחייה בלי הצלחה  →  ' + JSON.stringify(r4));
  chk('כשל אמיתי עדיין נכשל', r4.err === 'auth/invalid-custom-token');
  chk('והקוד המקורי נשמר לאבחון (§406)', r4.err.indexOf('auth/') === 0);
  chk('העיכוב הוא חלון-החסד בלבד (~2.5 שנ\')', r4.ms > 2400 && r4.ms < 3200);

  // 5. מסלול תקין — בלי זהות קודמת
  const r5 = await run({ callResolve: 'NEW', callDelay: 80 });
  console.log('   5. מסלול תקין  →  ' + JSON.stringify(r5));
  chk('מסלול תקין ללא שינוי, ומהיר', r5.uid === 'NEW' && r5.ms < 500);

  // 6. אותו חבר נכנס שוב במכשיר שהוא כבר מחובר בו
  const r6 = await run({ current: 'ME', callResolve: 'ME', callDelay: 120 });
  console.log('   6. אותו חבר נכנס שוב  →  ' + JSON.stringify(r6));
  chk('אותו חבר — נכנס כרגיל דרך ההבטחה', r6.uid === 'ME');
})();
