// §418ה — הרנס-בדיקה למדידת החשיפות (home.html).
//
// 🔑 **מריץ את הקוד שנשלף מ-home.html עצמו** ולא לוגיקה שהוקלדה כאן
// (ר' feedback_verification_must_run_the_producer), ו**תופס את הכתיבות במקום לבצע
// אותן** — כך נבדק בדיוק כמה כתיבות יוצאות ולאן, בלי לגעת בפרודקשן.
//
// 🔑 הדבר שהכי חשוב לבדוק כאן אינו "שנספר", אלא **שלא נספר יותר מדי**: מונה חשיפות
// שמתנפח בגלילה הלוך-ושוב הופך את כל הדוח לבעל-העסק לחסר משמעות.
//
//   node scratch_test_impressions.js
//
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
const START = '// ═══ §418ה — מדידת חשיפות';
const END = "document.addEventListener('visibilitychange'";
const i = html.indexOf(START);
const j = html.indexOf(END, i);
if (i < 0 || j < 0) throw new Error('לא נמצא בלוק מדידת החשיפות ב-home.html');
const block = html.slice(i, html.indexOf('\n', j) + 1);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };

// ── סביבה מדומה ────────────────────────────────────────────────────────────────
function makeEnv(opts) {
  opts = opts || {};
  const env = { commits: [], sets: [], failCommit: !!opts.failCommit, listeners: {}, timers: [] };
  let seq = 0;
  env.clock = 0;
  const pending = [];
  env.setTimeout = (fn, ms) => { const id = ++seq; pending.push({ id, fn, at: env.clock + ms }); return id; };
  env.clearTimeout = (id) => { const k = pending.findIndex(t => t.id === id); if (k >= 0) pending.splice(k, 1); };
  env.tick = async (ms) => {
    env.clock += ms;
    const due = pending.filter(t => t.at <= env.clock).sort((a, b) => a.at - b.at);
    due.forEach(t => { const k = pending.indexOf(t); if (k >= 0) pending.splice(k, 1); });
    for (const t of due) await t.fn();
    await new Promise(r => setImmediate(r));
  };

  const store = {};
  env.sessionStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  env.__store = store;

  env.observed = [];
  class IO {
    constructor(cb) { this.cb = cb; env.__io = this; }
    observe(el) { env.observed.push(el); }
  }
  class MO {
    constructor(cb) { this.cb = cb; }
    observe() {}
  }
  env.IntersectionObserver = IO;
  env.MutationObserver = MO;

  env.cards = [];
  env.document = {
    body: {},
    querySelectorAll: () => env.cards.filter(c => !c.attrs['data-imp']),
    addEventListener: (name, fn) => { env.listeners[name] = fn; },
    get visibilityState() { return env.__vis || 'visible'; },
  };

  env.db = {};
  env.doc = (...parts) => ({ path: parts.slice(1).join('/') });
  env.increment = (n) => ({ __inc: n });
  env.writeBatch = () => {
    const ops = [];
    return {
      set: (ref, data, opt) => ops.push({ ref, data, opt }),
      commit: async () => {
        if (env.failCommit) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
        env.commits.push(ops.slice());
        ops.forEach(o => env.sets.push(o));
      }
    };
  };
  env.console = { debug: () => {} };
  env.window = { IntersectionObserver: IO };
  return env;
}
function card(id) { return { attrs: {}, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; } }; }

function load(env) {
  const names = ['document', 'sessionStorage', 'IntersectionObserver', 'MutationObserver', 'setTimeout', 'clearTimeout',
                 'writeBatch', 'doc', 'db', 'increment', 'console', 'window'];
  const fn = new Function(...names, block + '\nreturn { mark: _impMark, flush: _impFlush, observe: _impObserveCards, seen: () => _impSeen, io: _impObserver };');
  return fn(...names.map(n => env[n]));
}

(async () => {
  console.log('── ספירה בסיסית ──');
  {
    const env = makeEnv();
    env.cards = [card('a'), card('b')];
    env.cards.forEach((c, k) => c.attrs['data-id'] = ['a', 'b'][k]);
    const M = load(env);
    ok(env.observed.length === 2, 'שני הכרטיסים נצפים');
    ok(env.cards.every(c => c.attrs['data-imp'] === '1'), 'וכל אחד מסומן כדי שלא ייצפה פעמיים');

    env.__io.cb([{ target: env.cards[0], isIntersecting: true }]);
    await env.tick(500);
    ok(env.commits.length === 0, 'חצי שנייה על המסך — עדיין לא נספר');
    await env.tick(600);
    ok(M.seen().has('a'), 'אחרי שנייה — נספר');
    ok(env.commits.length === 0, 'אבל עוד לא נכתב — הכתיבה מרוכזת');
    await env.tick(4100);
    ok(env.commits.length === 1, 'ואז יוצאת כתיבה אחת');
    ok(env.sets.length === 1 && env.sets[0].ref.path === 'businesses/a/statsDaily/' + new Date().toISOString().slice(0, 10),
      'למסמך היומי של אותו עסק (' + (env.sets[0] && env.sets[0].ref.path) + ')');
    ok(env.sets[0].data.imp && env.sets[0].data.imp.__inc === 1, 'והיא increment של 1');
    ok(env.sets[0].opt && env.sets[0].opt.merge === true, '⚠️ עם merge — אחרת הכתיבה הראשונה של היום הייתה מוחקת מסמך קיים');
  }

  console.log('\n── מה שלא נספר ──');
  {
    const env = makeEnv();
    env.cards = [card('a')]; env.cards[0].attrs['data-id'] = 'a';
    const M = load(env);
    env.__io.cb([{ target: env.cards[0], isIntersecting: true }]);
    await env.tick(400);
    env.__io.cb([{ target: env.cards[0], isIntersecting: false }]);
    await env.tick(5000);
    ok(!M.seen().has('a'), '🔑 גלילה מהירה אינה חשיפה — הכרטיס יצא לפני שהזמן חלף');
    ok(env.commits.length === 0, 'ולא יצאה שום כתיבה');
  }

  console.log('\n── דדופ: אותו עסק פעמיים ──');
  {
    const env = makeEnv();
    env.cards = [card('a')]; env.cards[0].attrs['data-id'] = 'a';
    const M = load(env);
    env.__io.cb([{ target: env.cards[0], isIntersecting: true }]);
    await env.tick(1100);
    env.__io.cb([{ target: env.cards[0], isIntersecting: false }]);
    env.__io.cb([{ target: env.cards[0], isIntersecting: true }]);
    await env.tick(5000);
    ok(env.sets.filter(s => s.ref.path.indexOf('businesses/a/') === 0).length === 1,
      '🔑 גלילה הלוך-ושוב נספרת פעם אחת בלבד — אחרת המונה חסר משמעות');
  }

  console.log('\n── ריכוז כתיבות ──');
  {
    const env = makeEnv();
    const ids = ['a', 'b', 'c', 'd', 'e'];
    env.cards = ids.map(id => { const c = card(id); c.attrs['data-id'] = id; return c; });
    const M = load(env);
    env.__io.cb(ids.map(id => ({ target: env.cards[ids.indexOf(id)], isIntersecting: true })));
    await env.tick(1100);
    await env.tick(4100);
    ok(env.commits.length === 1, 'חמישה כרטיסים = כתיבה מרוכזת אחת ולא חמש');
    ok(env.commits[0].length === 5, 'ובתוכה חמש פעולות');
  }

  console.log('\n── כשל בכתיבה ──');
  {
    const env = makeEnv({ failCommit: true });
    env.cards = [card('a')]; env.cards[0].attrs['data-id'] = 'a';
    const M = load(env);
    env.__io.cb([{ target: env.cards[0], isIntersecting: true }]);
    let threw = false;
    try { await env.tick(1100); await env.tick(4100); } catch (e) { threw = true; }
    ok(!threw, '⚠️ כשל בכתיבה אינו זורק — מדידה לעולם לא שוברת את הדף לגולש');
  }

  console.log('\n── תקרה לסשן ──');
  {
    const env = makeEnv();
    const ids = Array.from({ length: 100 }, (_, k) => 'b' + k);
    env.cards = ids.map(id => { const c = card(id); c.attrs['data-id'] = id; return c; });
    const M = load(env);
    env.__io.cb(ids.map((id, k) => ({ target: env.cards[k], isIntersecting: true })));
    await env.tick(1100);
    await env.tick(4100);
    ok(M.seen().size === 80, 'התקרה לסשן נאכפת (' + M.seen().size + ' מתוך 100)');
  }

  console.log('\n── שמירה בין טעינות ──');
  {
    const env = makeEnv();
    env.cards = [card('a')]; env.cards[0].attrs['data-id'] = 'a';
    let M = load(env);
    env.__io.cb([{ target: env.cards[0], isIntersecting: true }]);
    await env.tick(1100);
    await env.tick(4100);
    const key = 'yz_imp_' + new Date().toISOString().slice(0, 10);
    ok(env.__store[key] && JSON.parse(env.__store[key]).indexOf('a') >= 0, 'מי שנספר נשמר לסשן');

    // טעינה שנייה של אותו סשן — הכרטיס כבר לא נצפה בכלל
    env.observed.length = 0;
    env.cards = [card('a')]; env.cards[0].attrs['data-id'] = 'a';
    M = load(env);
    ok(env.observed.length === 0, '🔑 בטעינה חוזרת הוא כבר לא נצפה — לא נספר פעמיים באותו יום');
  }

  console.log('\n── כתיבה בסגירת הדף ──');
  {
    const env = makeEnv();
    env.cards = [card('a')]; env.cards[0].attrs['data-id'] = 'a';
    const M = load(env);
    env.__io.cb([{ target: env.cards[0], isIntersecting: true }]);
    await env.tick(1100);
    ok(env.commits.length === 0, 'עוד לא נכתב');
    env.__vis = 'hidden';
    await env.listeners['visibilitychange']();
    await new Promise(r => setImmediate(r));
    ok(env.commits.length === 1, 'הסתרת הדף מרוקנת את מה שהצטבר');
    ok(!!env.listeners['visibilitychange'], '⚠️ visibilitychange ולא unload — כתיבה בזמן סגירה אינה אמינה');
  }

  console.log('\n── לא נכנס ל-events ──');
  {
    ok(block.indexOf("collection(db, 'events')") < 0 && block.indexOf('logEvent') < 0,
      '🔑 החשיפות אינן נכתבות לאוסף events — שם התקרה של 10,000 הייתה חותכת בשקט את כל שאר המדידה');
    ok(block.indexOf('statsDaily') > 0, 'אלא למונה היומי של העסק');
    const rules = fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8');
    const m = rules.indexOf('match /statsDaily/{dateId}');
    const seg = rules.slice(m, m + 1200);
    ok(seg.indexOf("hasOnly(['imp'])") > 0, 'והחוקים מגבילים את הכתיבה הציבורית לשדה imp בלבד');
    ok(seg.indexOf('affectedKeys()') > 0, '⚠️ בעדכון נבדקים השדות שנגעו בהם ולא כל השדות במסמך');
  }

  console.log('\n' + pass + '/' + (pass + fail) + ' עברו' + (fail ? ' · ' + fail + ' נכשלו' : ''));
  process.exit(fail ? 1 : 0);
})();
