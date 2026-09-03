// ── §411 — מריץ את google-signup.js עצמו: סדר האלמנטים, הנוסח, והמדידה ─────────────────
// ⚠️ הקובץ הוא IIFE שנטען בדפדפן; כאן הוא רץ ב-vm עם DOM מינימלי מדומה.
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync('google-signup.js', 'utf8');
if (!code.includes("track('gsBlocked')")) throw new Error('נטען קובץ בלי המדידה של §411');

function makeDom(googleDraws) {
  const nodes = {};
  const mk = (id) => (nodes[id] = { id, style: {}, children: [], childElementCount: 0,
                                    innerHTML: '', textContent: '', classList: { add(){}, remove(){}, toggle(){} },
                                    addEventListener(){}, focus(){}, appendChild(){} });
  ['gsHost','hbGsStyle','warn-email','firstName','lastName','email'].forEach(mk);
  const host = nodes['gsHost'];
  host.clientWidth = 343;
  Object.defineProperty(host, 'innerHTML', {
    get() { return this._h || ''; },
    set(v) {
      this._h = v;
      // "מפרש" את המרקאפ: מוציא את סדר ה-id-ים ויוצר להם צמתים
      const ids = [...v.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
      host._order = ids;
      ids.forEach(mk);
    },
  });
  return {
    document: {
      getElementById: (id) => nodes[id] || null,
      createElement: () => ({ style: {}, id: '', textContent: '', addEventListener(){} }),
      head: { appendChild(){} }, body: { appendChild(){} },
    },
    nodes,
    google: googleDraws ? { accounts: { id: {
      initialize() {},
      renderButton(btnHost) { btnHost.childElementCount = 1; },   // צויר בהצלחה
    } } } : undefined,
  };
}
function run(googleDraws) {
  const dom = makeDom(googleDraws);
  const logged = [];
  const box = { window: {}, document: dom.document, console: { warn(){}, error(){} },
                setTimeout: (fn, ms) => { if (ms === 1500) fn(); return 0; }, clearTimeout(){} };
  box.window.google = dom.google;
  box.google = dom.google;
  vm.createContext(box);
  vm.runInContext(code, box);
  box.window.hbGoogleSignup.init({
    hostId: 'gsHost', warnId: 'warn-email',
    fields: { first: 'firstName', last: 'lastName', email: 'email' },
    log: (ch) => logged.push(ch),
  });
  return { dom, logged, api: box.window.hbGoogleSignup };
}
const chk = (t, c) => { console.log((c ? '✅' : '❌') + ' ' + t); if (!c) process.exitCode = 1; };

// 1. הכפתור צויר
let r = run(true);
console.log('סדר האלמנטים בפועל: ' + (r.dom.nodes['gsHost']._order || []).join(' → '));
chk('🔑 §411 — הכיתוב מופיע **לפני** הכפתור במרקאפ',
    (r.dom.nodes['gsHost']._order || []).indexOf('hbGsCap') === 0);
const cap = r.dom.nodes['hbGsCap'];
console.log('הנוסח: ' + String(cap.innerHTML).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
// §412 — הנוסח פותח ב"הרשמה" (כי גוגל כותבת "כניסה" על הכפתור), ומבטיח את הקוד ולא שדות
chk('🔑 §412 — פותח במילה "הרשמה"', /^\s*הרשמה/.test(cap.innerHTML));
chk('ומזכיר את Google במפורש', /Google/.test(cap.innerHTML));
chk('ההבטחה היא הקוד', /בלי לזכור קוד/.test(cap.innerHTML));
chk('⚠️ "השם והמייל" ירד — הבטחה של שני שדות מתוך שמונה', !/השם והמייל/.test(cap.innerHTML));
chk('⚠️ "המייל יאומת" עדיין לא שם', !/יאומת/.test(cap.innerHTML));
chk('וקצר מכל הגרסאות הקודמות', cap.innerHTML.replace(/<[^>]+>/g, '').length < 62);
chk('🔑 נרשם gsShown כשהכפתור צויר', r.logged.includes('gsShown'));
chk('ולא נרשם gsBlocked', !r.logged.includes('gsBlocked'));

// 2. גוגל קיימת אבל הכפתור לא צויר — הכשל שהיה בלתי-נראה
r = run(true);
r.dom.nodes['hbGsBtnHost'].childElementCount = 0;   // מדמה origin לא מאושר
// מריצים שוב את הבדיקה-בדיעבד דרך render
r = (function () {
  const dom = makeDom(true);
  dom.google.accounts.id.renderButton = function () {};   // לא מצייר כלום
  const logged = [];
  const box = { window: {}, document: dom.document, console: { warn(){}, error(){} },
                setTimeout: (fn, ms) => { if (ms === 1500) fn(); return 0; }, clearTimeout(){} };
  box.window.google = dom.google; box.google = dom.google;
  vm.createContext(box); vm.runInContext(code, box);
  box.window.hbGoogleSignup.init({ hostId: 'gsHost', warnId: 'warn-email',
    fields: { first: 'firstName', last: 'lastName', email: 'email' }, log: (ch) => logged.push(ch) });
  return { dom, logged };
})();
chk('🔑 §411 — כפתור שלא צויר נרשם כ-gsBlocked', r.logged.includes('gsBlocked'));
chk('ולא נספר כ"נראה"', !r.logged.includes('gsShown'));
chk('והבלוק הוסתר', r.dom.nodes['gsHost'].style.display === 'none');

// 3. בלי `log` בכלל — לא קורס (business.html לפני שהוזרק, או דף עתידי)
r = (function () {
  const dom = makeDom(true);
  const box = { window: {}, document: dom.document, console: { warn(){}, error(){} },
                setTimeout: (fn, ms) => { if (ms === 1500) fn(); return 0; }, clearTimeout(){} };
  box.window.google = dom.google; box.google = dom.google;
  vm.createContext(box); vm.runInContext(code, box);
  let threw = null;
  try { box.window.hbGoogleSignup.init({ hostId: 'gsHost', warnId: 'warn-email',
        fields: { first: 'firstName', last: 'lastName', email: 'email' } }); }
  catch (e) { threw = e.message; }
  return threw;
})();
chk('בלי מדידה מוזרקת — לא קורס', r === null);

// ── §411 — הצד השני: שקלול הנתונים במרכז הניהול ──────────────────────────────────────────
(function () {
  const src = fs.readFileSync('admin-dashboard.html', 'utf8');
  const a = src.indexOf('function googleSignupButtonStats(');
  const b = src.indexOf('\n}\n', a);
  if (a < 0 || b < 0) throw new Error('googleSignupButtonStats לא נמצאה');
  const fn = src.slice(a, b + 2);
  const ev = (s, ch, blk) => ({ type: 'formStep', sessionId: s, channel: ch, blockId: blk || 'fanRegister' });
  const box = { Array, Set, Math, console, platformEvents: [
    ev('A', 'gsShown'), ev('A', 'gsUsed'),
    ev('B', 'gsShown'),
    ev('C', 'gsBlocked'),
    ev('D', 'gsBlocked'), ev('D', 'gsShown'),          // נחסם ואז הצליח — נספר כ"ראה" בלבד
    ev('E', 'gsShown'), ev('E', 'gsShown'),            // אותו סשן פעמיים — נספר פעם אחת
    ev('X', 'gsShown', 'bizForm'), ev('X', 'gsUsed', 'bizForm'),   // טופס אחר
  ] };
  vm.createContext(box);
  vm.runInContext(fn + '\n; globalThis.__f = googleSignupButtonStats;', box);
  const r = box.__f('fanRegister');
  console.log('\n── שקלול בפאנל ──');
  console.log('   ' + JSON.stringify(r));
  chk('ראו את הכפתור — 4 סשנים (A,B,D,E), בלי כפילות', r.shown === 4);
  chk('השתמשו — 1 (A)', r.used === 1);
  chk('🔑 D נספר כ"ראה" ולא כ"נחסם"', r.blocked === 1);
  chk('אחוז השימוש מחושב על מי שראה', r.pct === 25);
  const bz = box.__f('bizForm');
  chk('⚠️ טופס העסק נספר בנפרד', bz.shown === 1 && bz.used === 1);
  box.platformEvents = null;
  vm.runInContext('globalThis.__r = __f("fanRegister");', box);
  chk('לפני שהאירועים נטענו — null ולא 0', box.__r === null);
})();
