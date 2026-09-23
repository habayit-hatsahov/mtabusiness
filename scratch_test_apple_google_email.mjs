// §456ב — כניסת Apple מזהה חבר גם לפי googleEmail (לא רק members.email).
//
// 🔑 מריץ את `worker/src/index.js` האמיתי דרך `default.fetch`. מדומה רק הרשת: JWKS של אפל,
// ו-Firestore בזיכרון ש**באמת מסנן** runQuery לפי השדה (בניגוד להרנס של §455 שהחזיר []).
// המקרה המרכזי הוא בדיוק מה שנמדד אצל רמי: email=mezizzz, googleEmail=ramibentl.
//
// הרצה:  node --conditions=workerd scratch_test_apple_google_email.mjs

import { generateKeyPair, exportJWK, SignJWT } from './worker/node_modules/jose/dist/browser/index.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

const ISS = 'https://appleid.apple.com';
const PROJECT = 'yz-test';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const kp = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(kp.publicKey)), kid: 'a1', alg: 'RS256', use: 'sig' };

async function appleTok({ sub = 'S-rami', email = 'ramibentl@gmail.com', relay = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email, email_verified: 'true', ...(relay ? { is_private_email: 'true' } : {}) })
    .setProtectedHeader({ alg: 'RS256', kid: 'a1' }).setIssuer(ISS).setAudience('il.co.yellowzone.web')
    .setSubject(sub).setIssuedAt(now).setExpirationTime(now + 600).sign(kp.privateKey);
}

// ── Firestore בזיכרון ─────────────────────────────────────────────────────────────────
const db = new Map();
const fv = (v) => typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
function put(id, obj) { db.set('members/' + id, Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fv(v)]))); }
const val = (x) => x && (x.stringValue ?? x.booleanValue);

globalThis.fetch = async (url, init = {}) => {
  const u = String(url && url.url ? url.url : url);
  const method = (init.method || 'GET').toUpperCase();
  if (u === 'https://appleid.apple.com/auth/keys') return Response.json({ keys: [jwk] });
  if (u.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signUp') ||
      u.startsWith('https://oauth2.googleapis.com')) return Response.json({});
  if (u.startsWith(FS)) {
    if (u.endsWith(':runQuery')) {
      const q = JSON.parse(init.body).structuredQuery;
      const ff = q.where.fieldFilter; const want = val(ff.value);
      const coll = q.from[0].collectionId;
      const out = [...db.entries()].filter(([p, f]) => p.startsWith(coll + '/') && val(f[ff.field.fieldPath]) === want)
        .slice(0, q.limit || 1000).map(([p, f]) => ({ document: { name: 'x/documents/' + p, fields: f } }));
      return Response.json(out.length ? out : [{}]);
    }
    const path = decodeURIComponent(u.slice(FS.length + 1).split('?')[0]);
    if (method === 'GET') { const f = db.get(path); return f ? Response.json({ name: 'x/documents/' + path, fields: f }) : new Response('nf', { status: 404 }); }
    if (method === 'PATCH') { const b = JSON.parse(init.body); db.set(path, { ...(db.get(path) || {}), ...b.fields }); return Response.json({}); }
  }
  throw new Error('unexpected_network_call: ' + method + ' ' + u);
};

const worker = (await import('./worker/src/index.js')).default;
// ⚠️ mintFirebaseCustomToken דורש מפתח service-account אמיתי — נותנים אחד שנוצר כאן.
const sa = await generateKeyPair('RS256', { extractable: true });
const { exportPKCS8 } = await import('./worker/node_modules/jose/dist/browser/index.js');
const env = {
  APPLE_CLIENT_IDS: 'il.co.yellowzone.web,il.co.yellowzone.app', FIREBASE_PROJECT_ID: PROJECT,
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: await exportPKCS8(sa.privateKey), client_email: 'sa@test' }),
  RATE_LIMIT_KV: { get: async (k) => k === 'google_access_token_v3' ? { token: 'at', exp: 9e9 } : null, put: async () => {} },
  ALLOWED_ORIGIN: 'https://yellowzone.co.il',
};
async function call(path, body) {
  const r = await worker.fetch(new Request('https://w.test' + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il' }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return r.json();
}
function reset() { db.clear(); }

console.log('\n1. המקרה של רמי — email שונה, googleEmail זהה');
{
  reset();
  put('M1', { firstName: 'שומע', lastName: 'מ', email: 'mezizzz@gmail.com', googleEmail: 'ramibentl@gmail.com', status: 'approved' });
  put('M2', { firstName: 'אחר', email: 'someone@x.co', status: 'approved' });
  const tok = await appleTok();
  const login = await call('/apple-login', { idToken: tok });
  check('/apple-login מחזיר apple_not_linked עם linkable (ולא סתם "לא מחובר")',
    login.error === 'apple_not_linked' && login.linkable && login.linkable.memberId === 'M1', JSON.stringify(login));
  const att = await call('/apple-attach', { idToken: tok, memberId: 'M1' });
  check('🔑 /apple-attach מקבל את אותה רשומה (לא email_mismatch)', att.ok === true, JSON.stringify(att));
  check('ומחזיר customToken (approved) — כלומר נכנס', typeof att.customToken === 'string' && att.customToken.length > 20);
  check('appleSub נכתב על M1', val(db.get('members/M1').appleSub) === 'S-rami');
  const again = await call('/apple-login', { idToken: tok });
  check('מהפעם הבאה — כניסה ישירה', typeof again.customToken === 'string', JSON.stringify(again).slice(0, 80));
}

console.log('\n2. השערים לא נחלשו');
{
  reset();
  put('M1', { email: 'a@x.co', googleEmail: 'ramibentl@gmail.com', status: 'approved' });
  put('M3', { email: 'b@x.co', googleEmail: 'ramibentl@gmail.com', status: 'approved' });
  const l = await call('/apple-login', { idToken: await appleTok() });
  check('שתי רשומות עם אותו googleEmail → אין linkable (כפילות = עצירה)', l.error === 'apple_not_linked' && !l.linkable, JSON.stringify(l));
}
{
  reset();
  put('M1', { email: 'a@x.co', googleEmail: 'ramibentl@gmail.com', status: 'pending' });
  const l = await call('/apple-login', { idToken: await appleTok() });
  check('רשומה pending → אין linkable', !l.linkable, JSON.stringify(l));
}
{
  reset();
  put('M1', { email: 'a@x.co', googleEmail: 'ramibentl@gmail.com', status: 'approved', appleSub: 'OTHER' });
  const l = await call('/apple-login', { idToken: await appleTok() });
  check('כבר מקושר לחשבון Apple אחר → אין linkable', !l.linkable, JSON.stringify(l));
}
{
  reset();
  put('M1', { email: 'a@x.co', googleEmail: 'zz@privaterelay.appleid.com', status: 'approved' });
  const l = await call('/apple-login', { idToken: await appleTok({ email: 'zz@privaterelay.appleid.com', relay: true }) });
  check('כתובת-ממסר → אין linkable (לא ראיה לשליטה בתיבה)', !l.linkable, JSON.stringify(l));
}
{
  reset();
  put('M1', { email: 'a@x.co', googleEmail: 'other@gmail.com', status: 'approved' });
  const a = await call('/apple-attach', { idToken: await appleTok(), memberId: 'M1' });
  check('attach לרשומה שאף מייל שלה לא תואם → email_mismatch', a.error === 'email_mismatch', JSON.stringify(a));
}
{
  reset();
  put('M1', { email: 'ramibentl@gmail.com', status: 'approved' });
  const l = await call('/apple-login', { idToken: await appleTok() });
  check('בקרה: המסלול הרגיל (email תואם) עדיין עובד', l.linkable && l.linkable.memberId === 'M1', JSON.stringify(l));
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
