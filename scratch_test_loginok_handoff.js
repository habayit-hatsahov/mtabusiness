// §460ה — loginOk עובר מ-welcome.html ל-home.html דרך sessionStorage.
// 🔑 מריץ את הקוד **האמיתי** משני הקבצים (נשלף לפי תוכן, לא לפי מספרי שורות), עם אחסון מדומה.
// הרצה: node scratch_test_loginok_handoff.js
const fs = require('fs');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  — ' + d : '')); } };

const W = fs.readFileSync(__dirname + '/welcome.html', 'utf8');
const H = fs.readFileSync(__dirname + '/home.html', 'utf8');
const finishSrc = W.slice(W.indexOf("const HB_PENDING_LOGIN_KEY"), W.indexOf('\n}\n', W.indexOf('function heroFinishLogin')) + 2);
const flushSrc = H.slice(H.indexOf('(function flushPendingLoginOk()'), H.indexOf('})();', H.indexOf('(function flushPendingLoginOk()')) + 5);
check('נשלף heroFinishLogin', finishSrc.includes('function heroFinishLogin'));
check('נשלף flushPendingLoginOk', flushSrc.includes('flushPendingLoginOk'));

function store(throwing) {
  const m = new Map();
  return { m, getItem: k => { if (throwing) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
           setItem: (k, v) => { if (throwing) throw new Error('blocked'); m.set(k, String(v)); },
           removeItem: k => { if (throwing) throw new Error('blocked'); m.delete(k); } };
}
function runWelcome(ss, via) {
  const sent = [], ls = store(false);
  const window = { logEvent: (t, e) => sent.push([t, e]), HB_NETFAIL_KEY: 'nf' };
  let navigated = false;
  new Function('window', 'sessionStorage', 'localStorage', 'heroGoHome', '_hbLoginVia',
    finishSrc + '\nheroFinishLogin("M1", null);')(window, ss, ls, () => { navigated = true; }, via);
  return { sent, navigated, ls };
}
function runHome(ss, now) {
  const sent = [];
  const window = { logEvent: (t, e) => sent.push([t, e]) };
  const D = { now: () => now || Date.now() };
  new Function('window', 'sessionStorage', 'Date', flushSrc)(window, ss, D);
  return sent;
}

console.log('\n1. כניסה רגילה: welcome שומר, home שולח');
{
  const ss = store(false);
  const w = runWelcome(ss, 'apple');
  check('welcome **לא** שולח בעצמו (הבקשה הייתה מתבטלת בניווט)', w.sent.length === 0, JSON.stringify(w.sent));
  check('ניווט ל-home עדיין קורה', w.navigated);
  check('hb_memberId נכתב', w.ls.m.get('hb_memberId') === 'M1');
  const p = JSON.parse(ss.m.get('hb_pending_loginOk') || 'null');
  check('הערוץ נשמר', p && p.channel === 'apple', JSON.stringify(p));
  const h = runHome(ss);
  check('🔑 home שולח loginOk עם הערוץ', h.length === 1 && h[0][0] === 'loginOk' && h[0][1].channel === 'apple', JSON.stringify(h));
  check('המפתח נמחק', !ss.m.has('hb_pending_loginOk'));
  check('רענון של home לא סופר שוב', runHome(ss).length === 0);
}
console.log('\n2. ביקור ב-home בלי כניסה');
{
  check('אין מפתח → אין loginOk', runHome(store(false)).length === 0);
}
console.log('\n3. ערך ישן (מעל 10 דק׳)');
{
  const ss = store(false);
  ss.setItem('hb_pending_loginOk', JSON.stringify({ channel: 'code', t: Date.now() - 11 * 60 * 1000 }));
  check('לא נשלח', runHome(ss).length === 0);
  check('...ובכל זאת נמחק', !ss.m.has('hb_pending_loginOk'));
}
console.log('\n4. sessionStorage חסום');
{
  const w = runWelcome(store(true), 'google');
  check('נופל לשליחה ישירה (עדיף מכלום)', w.sent.length === 1 && w.sent[0][1].channel === 'google', JSON.stringify(w.sent));
  check('home לא קורס', (() => { try { runHome(store(true)); return true; } catch (e) { return false; } })());
}
console.log('\n5. ערך פגום');
{
  const ss = store(false); ss.setItem('hb_pending_loginOk', '{not json');
  check('לא קורס ולא שולח', (() => { try { return runHome(ss).length === 0; } catch (e) { return false; } })());
}
console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
