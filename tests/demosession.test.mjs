// בדיקת §516 — /demo-session בוורקר (worker/src/demo.js), הקוד האמיתי מול Firestore מדומה.
// מה נבדק: כניסה תקינה (מכשיר נרשם, custom token עם role:'demo') · אותו מכשיר שוב · מכשיר עודף
// נחסם ונרשם · ping (views) · ping ממכשיר לא רשום · כובה · פג · טוקן לא קיים (נספר כניסיון) ·
// מגבלת ניסיונות · קלט פגום. הרצה: node tests/demosession.test.mjs (מתוך worker/node_modules).
import { generateKeyPairSync } from 'node:crypto';
import { decodeJwt } from '../worker/node_modules/jose/dist/node/esm/index.js';
import { handleDemoSession } from '../worker/src/demo.js';

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name, extra ?? ''); } };

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kvStore = new Map([['google_access_token_v3', JSON.stringify({ token: 'fake', exp: Date.now() + 3600e3, expiresAt: Date.now() + 3600e3 })]]);
const env = {
  FIREBASE_PROJECT_ID: 'p',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: 'sa@p.iam.gserviceaccount.com' }),
  RATE_LIMIT_KV: {
    get: async (k, type) => { const v = kvStore.get(k); return v == null ? null : (type === 'json' ? JSON.parse(v) : v); },
    put: async (k, v) => { kvStore.set(k, v); },
  },
};

// ── Firestore REST מדומה: GET / PATCH על demoLinks ──
const docs = new Map();
const toVal = (v) => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } } : v;
const fromVal = (v) => 'stringValue' in v ? v.stringValue : 'integerValue' in v ? +v.integerValue : 'booleanValue' in v ? v.booleanValue
  : 'timestampValue' in v ? v.timestampValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(fromVal) : null;
let patches = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url); const id = decodeURIComponent(u.pathname.split('/').pop());
  if (!u.pathname.includes('/demoLinks/')) throw new Error('unexpected fetch ' + url);
  const d = docs.get(id);
  if ((opts.method || 'GET') === 'GET') {
    if (!d) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ name: 'x/demoLinks/' + id, fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, toVal(v)])) }));
  }
  const body = JSON.parse(opts.body); patches.push({ id, fields: Object.keys(body.fields) });
  for (const [k, v] of Object.entries(body.fields)) d[k] = fromVal(v);
  return new Response('{}');
};

const T = 'AbCdEfGhJkMnPqRsTuVwXyZ2';
const future = new Date(Date.now() + 86400e3).toISOString(), past = new Date(Date.now() - 1000).toISOString();
const reset = (extra = {}) => { docs.set(T, { guestName: 'יוסי', revoked: false, expiresAt: future, maxDevices: 2, devices: [], entries: 0, views: 0, ...extra }); patches = []; kvStore.delete('attempts:demo-ip:1.1.1.1'); };
const dev = (n) => 'device-' + n + '-xxxxxxxx';

console.log('כניסה');
reset();
let r = await handleDemoSession({ t: T, deviceId: dev(1) }, '1.1.1.1', env);
const claims = r.customToken ? decodeJwt(r.customToken) : {};
check('מחזיר custom token', !!r.customToken, r);
check('uid=demo_ + 12 תווים', claims.uid === 'demo_' + T.slice(0, 12), claims.uid);
check("claim role:'demo'", claims.claims && claims.claims.role === 'demo', claims.claims);
check('מחזיר את השם', r.name === 'יוסי');
check('המכשיר נרשם', docs.get(T).devices.length === 1 && docs.get(T).entries === 1);

r = await handleDemoSession({ t: T, deviceId: dev(1) }, '1.1.1.1', env);
check('אותו מכשיר שוב – עובר, בלי מכשיר נוסף', !!r.customToken && docs.get(T).devices.length === 1 && docs.get(T).entries === 2);
r = await handleDemoSession({ t: T, deviceId: dev(2) }, '1.1.1.1', env);
check('מכשיר שני – עובר', !!r.customToken && docs.get(T).devices.length === 2);
r = await handleDemoSession({ t: T, deviceId: dev(3) }, '1.1.1.1', env);
check('מכשיר שלישי – נחסם', r.error === 'invalid' && !r.customToken, r);
check('החסימה נרשמה', docs.get(T).blockedCount === 1 && !!docs.get(T).blockedAt && docs.get(T).devices.length === 2);

console.log('ping');
r = await handleDemoSession({ t: T, deviceId: dev(1), ping: true }, '1.1.1.1', env);
check('ping תקין – ok בלי token', r.ok === true && !r.customToken && docs.get(T).views === 1, r);
r = await handleDemoSession({ t: T, deviceId: dev(9), ping: true }, '1.1.1.1', env);
check('ping ממכשיר לא רשום – invalid', r.error === 'invalid');

console.log('לינק לא תקף');
reset({ revoked: true, devices: [dev(1)] });
r = await handleDemoSession({ t: T, deviceId: dev(1), ping: true }, '1.1.1.1', env);
check('כובה – ping מנתק', r.error === 'invalid');
r = await handleDemoSession({ t: T, deviceId: dev(1) }, '1.1.1.1', env);
check('כובה – אין כניסה', r.error === 'invalid' && patches.length === 0);
reset({ expiresAt: past, devices: [dev(1)] });
r = await handleDemoSession({ t: T, deviceId: dev(1) }, '1.1.1.1', env);
check('פג תוקף – אין כניסה', r.error === 'invalid');
reset({ expiresAt: '' });
r = await handleDemoSession({ t: T, deviceId: dev(1) }, '1.1.1.1', env);
check('בלי תאריך תפוגה – אין כניסה', r.error === 'invalid');

console.log('ניחוש וקלט');
reset();
r = await handleDemoSession({ t: 'ZZZZZZZZZZZZZZZZZZZZZZZZ', deviceId: dev(1) }, '1.1.1.1', env);
check('טוקן לא קיים – invalid ונספר', r.error === 'invalid' && kvStore.get('attempts:demo-ip:1.1.1.1') === '1');
for (let i = 0; i < 25; i++) await handleDemoSession({ t: 'ZZZZZZZZZZZZZZZZZZZZZZZZ', deviceId: dev(1) }, '1.1.1.1', env);
r = await handleDemoSession({ t: T, deviceId: dev(1) }, '1.1.1.1', env);
check('אחרי 20 ניחושים – חסום גם לטוקן תקין מאותו IP', r.error === 'too_many_attempts', r);
r = await handleDemoSession({ t: T, deviceId: dev(1) }, '2.2.2.2', env);
check('IP אחר – עובר', !!r.customToken);
for (const bad of [{}, { t: 'short', deviceId: dev(1) }, { t: T + '/../x', deviceId: dev(1) }, { t: T, deviceId: 'a b' }, { t: T }, null]) {
  r = await handleDemoSession(bad, '3.3.3.3', env);
  check('קלט פגום ' + JSON.stringify(bad) + ' – invalid', r.error === 'invalid');
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
