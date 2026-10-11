// §497 — בדיקות ל-web-gate.js: הקוד נטען מהקובץ עצמו, ה-imports מוחלפים במוקים.
// הרצה: node scratch_test_web_gate.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/web-gate.js', 'utf8').replace(/^import .*$/gm, '');
let fail = 0;
const eq = (n, g, w) => { const ok = g === w; if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `got ${g} want ${w}`); };

async function run({ gated = true, mid = 'M1', user = { uid: 'M1' }, authSilent = false, member = { status: 'approved' }, getDocThrows = false }) {
  const classes = new Set(gated ? ['yz-gate'] : []);
  let result = 'pending';
  const env = {
    document: { documentElement: { classList: { contains: (c) => classes.has(c), remove: (c) => { classes.delete(c); if (result === 'pending') result = 'open'; } } } },
    localStorage: { getItem: (k) => (k === 'hb_memberId' ? mid : null) },
    location: { replace: (u) => { if (result === 'pending') result = 'redirect:' + u; } },
    auth: {}, db: {}, console: { warn() {} },
    doc: (_db, c, id) => ({ c, id }),
    getDoc: async () => { if (getDocThrows) throw new Error('net'); return { exists: () => !!member, data: () => member }; },
    onAuthStateChanged: (_a, cb) => { if (!authSilent) setTimeout(() => cb(user), 1); return () => {}; },
    setTimeout: (f, ms) => setTimeout(f, ms > 1000 ? 30 : ms),   // מקצרים את גבולות-הזמן פי ~200
    clearTimeout,
  };
  new Function(...Object.keys(env), src)(...Object.values(env));
  await new Promise((r) => setTimeout(r, 80));
  return result;
}

(async () => {
  eq('admin stays', await run({ member: { isAdmin: true } }), 'open');
  eq('business owner stays', await run({ member: { isBusinessOwner: true, linkedBusinessId: 'B1' } }), 'open');
  eq('owner flag without business → landing', await run({ member: { isBusinessOwner: true } }), 'redirect:landing.html');
  eq('fan → landing', await run({ member: { status: 'approved' } }), 'redirect:landing.html');
  eq('not logged in (no hb_memberId) → landing', await run({ mid: '' }), 'redirect:landing.html');
  eq('stale hb_memberId, no session → landing', await run({ user: null }), 'redirect:landing.html');
  eq('session of someone else → landing', await run({ user: { uid: 'OTHER' } }), 'redirect:landing.html');
  eq('auth never answers → fail-open', await run({ authSilent: true }), 'open');
  eq('member read fails → fail-open', await run({ getDocThrows: true }), 'open');
  eq('in app / iframe (not gated) → nothing', await run({ gated: false, member: { status: 'approved' } }), 'pending');
  console.log(fail ? `${fail} FAILED` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
