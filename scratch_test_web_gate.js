// §497 — בדיקות ל-web-gate.js: הקוד נטען מהקובץ עצמו, ה-imports מוחלפים במוקים.
// הרצה: node scratch_test_web_gate.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/web-gate.js', 'utf8').replace(/^import .*$/gm, '');
let fail = 0;
const eq = (n, g, w) => { const ok = g === w; if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `got ${g} want ${w}`); };

async function run({ gated = true, mid = 'M1', user = { uid: 'M1' }, authSilent = false, member = { status: 'approved' }, getDocThrows = false,
                     biz = { status: 'approved' }, token = 'TOK123', bizThrows = false,
                     search = '', pathname = '/home.html', session = {} }) {
  const classes = new Set(gated ? ['yz-gate'] : []);
  let result = 'pending';
  const env = {
    document: { documentElement: { classList: { contains: (c) => classes.has(c), remove: (c) => { classes.delete(c); if (result === 'pending') result = 'open'; } } } },
    localStorage: { getItem: (k) => (k === 'hb_memberId' ? mid : null) },
    location: { search, pathname, replace: (u) => { if (result === 'pending') result = 'redirect:' + u; } },
    sessionStorage: { getItem: (k) => (k in session ? session[k] : null), setItem: (k, v) => { session[k] = String(v); }, removeItem: (k) => { delete session[k]; } },
    auth: {}, db: {}, console: { warn() {} },
    doc: (_db, c, id) => ({ c, id }),
    getDoc: async (ref) => {
      if (ref.c === 'members') { if (getDocThrows) throw new Error('net'); return { exists: () => !!member, data: () => member }; }
      if (bizThrows) throw new Error('net');
      if (ref.c === 'businesses') return { exists: () => !!biz, data: () => biz };
      if (ref.c === 'bizTokens') return { exists: () => !!token, data: () => ({ accessToken: token }) };
      throw new Error('unexpected ' + ref.c);
    },
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
  const OWNER = { isBusinessOwner: true, linkedBusinessId: 'B1' };
  eq('approved business owner → his business dashboard', await run({ member: OWNER }), 'redirect:business-dashboard.html?token=TOK123');
  eq('owner of pending business → landing', await run({ member: OWNER, biz: { status: 'pending' } }), 'redirect:landing.html');
  eq('owner without token → landing', await run({ member: OWNER, token: '' }), 'redirect:landing.html');
  eq('owner lookup fails → landing (not fail-open)', await run({ member: OWNER, bizThrows: true }), 'redirect:landing.html');
  eq('owner flag without business → landing', await run({ member: { isBusinessOwner: true } }), 'redirect:landing.html');
  eq('fan → landing', await run({ member: { status: 'approved' } }), 'redirect:landing.html');
  eq('not logged in (no hb_memberId) → landing', await run({ mid: '' }), 'redirect:landing.html');
  eq('stale hb_memberId, no session → landing', await run({ user: null }), 'redirect:landing.html');
  eq('session of someone else → landing', await run({ user: { uid: 'OTHER' } }), 'redirect:landing.html');
  eq('auth never answers → fail-open', await run({ authSilent: true }), 'open');
  eq('member read fails → fail-open', await run({ getDocThrows: true }), 'open');
  eq('in app / iframe (not gated) → nothing', await run({ gated: false, member: { status: 'approved' } }), 'pending');
  // §499 — קישור-שיתוף ישן לעסק → כרטיס-הטיזר
  eq('old biz link, not logged in → teaser', await run({ mid: '', search: '?biz=שחר-גייזר' }), 'redirect:open.html?biz=' + encodeURIComponent('שחר-גייזר'));
  eq('old biz link, fan → teaser', await run({ search: '?biz=x' }), 'redirect:open.html?biz=x');
  eq('old biz link, approved owner → teaser (not his dashboard)', await run({ member: OWNER, search: '?biz=x' }), 'redirect:open.html?biz=x');
  eq('old biz link, admin → stays', await run({ member: { isAdmin: true }, search: '?biz=x' }), 'open');
  // §499 — מחיקת חשבון מהדפדפן
  const s1 = {};
  eq('delete page, not logged in → login (not landing)', await run({ mid: '', pathname: '/profile.html', search: '?delete=1', session: s1 }), 'redirect:welcome.html?login=1');
  eq('  …flag set for the login round-trip', s1.yz_delete_flow, '1');
  eq('back on home after login, flag → delete row', await run({ session: { yz_delete_flow: '1' } }), 'redirect:profile.html?delete=1');
  eq('delete page, logged in fan → page opens', await run({ pathname: '/profile.html', search: '?delete=1' }), 'open');
  eq('profile without ?delete=1, fan → landing', await run({ pathname: '/profile.html' }), 'redirect:landing.html');
  console.log(fail ? `${fail} FAILED` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
