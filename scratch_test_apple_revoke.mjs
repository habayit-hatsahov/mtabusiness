// §455 — בדיקות ביטול הטוקן של אפל: `/apple-exchange` ו-`/delete-account`.
//
// 🔑 **מריץ את הקוד האמיתי מקצה לקצה בתוך הוורקר:** `worker/src/index.js` נטען כמו
// שהוא, ובקשות נכנסות דרך `default.fetch` — כלומר הניתוב, האימות, ההחלפה, הכתיבה
// ל-Firestore והביטול רצים כולם. מה שמדומה הוא **רק הרשת**: אפל (JWKS / token / revoke),
// Identity Toolkit ו-Firestore REST, דרך מסנן `fetch` שמנתב לפי URL.
// ר' [[feedback_verification_must_run_the_producer]].
//
// 🔑 **ה-client_secret נחתם במפתח EC אמיתי** שנוצר כאן, ונבדק בחתימה מול המפתח הציבורי —
// לא רק "יש מחרוזת". זה כל מה שאפל תבדוק בו, חוץ מכך שהמפתח שלה.
//
// ⚠️ **מה שהבדיקה הזאת אינה יכולה לכסות, במפורש:**
//   1. **שאפל מקבלת את ה-client_secret שלנו.** זה דורש `.p8` אמיתי. חלק 4 שולח בקשות
//      אמיתיות לאפל עם מפתח מזויף, ונועל את ההתנהגות שנמדדה (ר' שם).
//   2. **שהלקוח באמת שולח קוד** — ר' הבדיקות בצד הלקוח.
//
// הרצה:  node --conditions=workerd scratch_test_apple_revoke.mjs
//        (בלי הדגל jose טוענת בנייה אחרת ומסנן ה-fetch לא נקרא — ר' scratch_test_apple_login.mjs)

import { generateKeyPair, exportJWK, exportPKCS8, SignJWT, jwtVerify, decodeProtectedHeader }
  from './worker/node_modules/jose/dist/browser/index.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

const ISS = 'https://appleid.apple.com';
const SERVICES_ID = 'il.co.yellowzone.web';
const BUNDLE_ID = 'il.co.yellowzone.app';
const PROJECT = 'yz-test';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── מפתחות ────────────────────────────────────────────────────────────────────────────
const appleSigning = await generateKeyPair('RS256');            // "אפל" חותמת id_tokens
const appleJwk = { ...(await exportJWK(appleSigning.publicKey)), kid: 'a1', alg: 'RS256', use: 'sig' };
const p8 = await generateKeyPair('ES256', { extractable: true }); // "ה-.p8 שלנו"
const P8_PEM = await exportPKCS8(p8.privateKey);

async function appleIdToken({ sub = '001.abc.1', aud = SERVICES_ID, email = 'a@b.co' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email, email_verified: 'true' })
    .setProtectedHeader({ alg: 'RS256', kid: 'a1' })
    .setIssuer(ISS).setAudience(aud).setSubject(sub)
    .setIssuedAt(now).setExpirationTime(now + 600)
    .sign(appleSigning.privateKey);
}

// ── Firestore בזיכרון ─────────────────────────────────────────────────────────────────
const db = new Map();   // path -> { fields (typed) }
const fv = (v) => v === null || v === undefined ? { nullValue: null }
  : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
  : { stringValue: String(v) };
function put(path, obj) { db.set(path, Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fv(v)]))); }
function plain(path) {
  const f = db.get(path); if (!f) return null;
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Object.values(v)[0]]));
}

// ── הרשת ──────────────────────────────────────────────────────────────────────────────
let appleCalls = [];          // { url, params }
let appleTokenReply = null;   // () => Response
let appleRevokeReply = null;
let docCounter = 0;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url && url.url ? url.url : url);
  const method = (init.method || 'GET').toUpperCase();
  if (u === 'https://appleid.apple.com/auth/keys') {
    return Response.json({ keys: [appleJwk] });
  }
  if (u === 'https://appleid.apple.com/auth/token' || u === 'https://appleid.apple.com/auth/revoke') {
    const params = Object.fromEntries(new URLSearchParams(String(init.body)));
    appleCalls.push({ url: u, params, contentType: init.headers && init.headers['Content-Type'] });
    return (u.endsWith('/token') ? appleTokenReply : appleRevokeReply)(params);
  }
  if (u.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
    const { idToken } = JSON.parse(init.body);
    return idToken === 'fb-good' ? Response.json({ users: [{ localId: 'm1' }] })
                                 : new Response('bad', { status: 400 });
  }
  if (u.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:delete')) {
    return Response.json({});
  }
  if (u.startsWith(FS)) {
    const rest = u.slice(FS.length + 1);
    if (rest.startsWith(':runQuery') || u.includes(':runQuery')) return Response.json([{}]);
    const path = decodeURIComponent(rest.split('?')[0]);
    if (method === 'GET') {
      const f = db.get(path);
      return f ? Response.json({ name: `x/documents/${path}`, fields: f }) : new Response('nf', { status: 404 });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(init.body);
      db.set(path, { ...(db.get(path) || {}), ...body.fields });
      return Response.json({ name: `x/documents/${path}`, fields: db.get(path) });
    }
    if (method === 'DELETE') { const had = db.delete(path); return new Response('{}', { status: had ? 200 : 404 }); }
    if (method === 'POST') {
      const id = 'log' + (++docCounter);
      db.set(`${path}/${id}`, JSON.parse(init.body).fields);
      return Response.json({ name: `x/documents/${path}/${id}` });
    }
  }
  throw new Error('unexpected_network_call: ' + method + ' ' + u);
};

const worker = (await import('./worker/src/index.js')).default;
const apple = await import('./worker/src/apple.js');

const KV = { get: async (k, t) => k === 'google_access_token_v3' ? { token: 'at', exp: 9e9 } : null,
             put: async () => {} };
function env(extra = {}) {
  return {
    APPLE_CLIENT_IDS: `${SERVICES_ID},${BUNDLE_ID}`,
    APPLE_TEAM_ID: 'MX427CFSV2', APPLE_KEY_ID: 'KEYID12345', APPLE_PRIVATE_KEY: P8_PEM,
    FIREBASE_PROJECT_ID: PROJECT, FIREBASE_WEB_API_KEY: 'k', RATE_LIMIT_KV: KV,
    ALLOWED_ORIGIN: 'https://yellowzone.co.il',
    ...extra,
  };
}
async function call(path, body, e = env()) {
  const req = new Request('https://w.test' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il' },
    body: JSON.stringify(body),
  });
  const r = await worker.fetch(req, e, { waitUntil() {} });
  return r.json();
}
function reset() { appleCalls = []; db.clear(); apple._resetAppleKeyCacheForTest(); }

// ══ 1. ה-client_secret ═══════════════════════════════════════════════════════════════
console.log('\n1. client_secret — JWT בחתימת ES256');
{
  reset();
  const jwt = await apple._appleClientSecretForTest(env(), BUNDLE_ID);
  const h = decodeProtectedHeader(jwt);
  check('alg=ES256', h.alg === 'ES256', h.alg);
  check('kid = APPLE_KEY_ID', h.kid === 'KEYID12345', h.kid);
  let payload = null;
  try { ({ payload } = await jwtVerify(jwt, p8.publicKey, { issuer: 'MX427CFSV2', audience: ISS })); }
  catch (e) { payload = null; check('החתימה מאומתת במפתח הציבורי', false, e.message); }
  if (payload) {
    check('החתימה מאומתת במפתח הציבורי', true);
    check('sub = ה-client_id שנמסר (Bundle)', payload.sub === BUNDLE_ID, payload.sub);
    check('תוקף קצר (≤ 6 חודשים, כאן 5 דק\')', payload.exp - payload.iat === 300, payload.exp - payload.iat);
  }
  // ⚠️ המפתח נשמר במטמון — אבל ה-sub חייב להשתנות לפי client_id
  const jwt2 = await apple._appleClientSecretForTest(env(), SERVICES_ID);
  const { payload: p2 } = await jwtVerify(jwt2, p8.publicKey);
  check('מטמון המפתח אינו מקבע את ה-sub', p2.sub === SERVICES_ID, p2.sub);

  for (const [label, pem] of [['CRLF', P8_PEM.replace(/\n/g, '\r\n')],
                              ['\\n מילולי (שורה אחת)', P8_PEM.replace(/\n/g, '\\n')]]) {
    apple._resetAppleKeyCacheForTest();
    let ok = true;
    try { await jwtVerify(await apple._appleClientSecretForTest(env({ APPLE_PRIVATE_KEY: pem }), BUNDLE_ID), p8.publicKey); }
    catch (e) { ok = false; }
    check(`מפתח עם ${label} עדיין נטען`, ok);
  }
}

// ══ 2. /apple-exchange ═════════════════════════════════════════════════════════════
console.log('\n2. /apple-exchange');
{
  reset();
  const sub = '001.web.1';
  appleTokenReply = async (p) => Response.json({
    access_token: 'x', refresh_token: 'RT-web', id_token: await appleIdToken({ sub, aud: SERVICES_ID }),
  });
  const out = await call('/apple-exchange', {
    idToken: await appleIdToken({ sub, aud: SERVICES_ID }), code: 'c1',
    redirectUri: 'https://yellowzone.co.il/fan-register.html',
  });
  check('מחזיר ok', out.ok === true, JSON.stringify(out));
  const tc = appleCalls.find((c) => c.url.endsWith('/token'));
  check('נשלחה בקשה ל-/auth/token', !!tc);
  if (tc) {
    check('form-urlencoded', tc.contentType === 'application/x-www-form-urlencoded', tc.contentType);
    check('grant_type=authorization_code', tc.params.grant_type === 'authorization_code');
    check('client_id = ה-aud של הטוקן (Services ID)', tc.params.client_id === SERVICES_ID, tc.params.client_id);
    check('code עבר כמו שהוא', tc.params.code === 'c1');
    check('redirect_uri עבר (אתר)', tc.params.redirect_uri === 'https://yellowzone.co.il/fan-register.html', tc.params.redirect_uri);
    const { payload } = await jwtVerify(tc.params.client_secret, p8.publicKey);
    check('client_secret חתום ו-sub שלו = client_id', payload.sub === SERVICES_ID);
  }
  const doc = plain(`appleTokens/${sub}`);
  check('נשמר appleTokens/{sub}', !!doc, JSON.stringify([...db.keys()]));
  check('refreshToken + clientId', doc && doc.refreshToken === 'RT-web' && doc.clientId === SERVICES_ID, JSON.stringify(doc));
  check('אף רשומת חבר לא נכתבה', ![...db.keys()].some((k) => k.startsWith('members/')));
}
{
  reset();
  appleTokenReply = async () => Response.json({
    refresh_token: 'RT-app', id_token: await appleIdToken({ sub: '001.app.1', aud: BUNDLE_ID }),
  });
  const out = await call('/apple-exchange', {
    idToken: await appleIdToken({ sub: '001.app.1', aud: BUNDLE_ID }), code: 'c2',
  });
  check('אפליקציה: ok', out.ok === true, JSON.stringify(out));
  const tc = appleCalls[0];
  check('אפליקציה: client_id = Bundle ID', tc && tc.params.client_id === BUNDLE_ID, tc && tc.params.client_id);
  check('אפליקציה: אין redirect_uri', tc && !('redirect_uri' in tc.params), tc && JSON.stringify(tc.params));
}
{
  reset();
  appleTokenReply = async () => Response.json({ refresh_token: 'RT', id_token: await appleIdToken({ sub: 'x' }) });
  await call('/apple-exchange', { idToken: await appleIdToken({ sub: 'x' }), code: 'c',
                                  redirectUri: 'https://evil.example/cb' });
  check('redirect_uri זר לא מועבר לאפל', appleCalls[0] && !('redirect_uri' in appleCalls[0].params),
        appleCalls[0] && appleCalls[0].params.redirect_uri);
}
{
  reset();
  // 🔴 הקוד שייך לאדם אחר: אפל מחזירה id_token עם sub אחר
  appleTokenReply = async () => Response.json({ refresh_token: 'RT-other', id_token: await appleIdToken({ sub: 'victim' }) });
  const out = await call('/apple-exchange', { idToken: await appleIdToken({ sub: 'attacker' }), code: 'c' });
  check('sub לא תואם → נדחה', out.error === 'apple_exchange_sub_mismatch', JSON.stringify(out));
  check('sub לא תואם → לא נשמר כלום', db.size === 0, [...db.keys()].join(','));
}
{
  reset();
  appleTokenReply = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
  const out = await call('/apple-exchange', { idToken: await appleIdToken(), code: 'expired' });
  check('קוד שפג → שגיאה בשמה, עם הסיבה של אפל', out.error === 'apple_exchange_rejected', JSON.stringify(out));
  check('קוד שפג → לא נשמר כלום', db.size === 0);
}
{
  reset();
  const out = await call('/apple-exchange', { idToken: 'garbage', code: 'c' });
  check('טוקן פגום → invalid_apple_token, בלי לפנות לאפל', out.error === 'invalid_apple_token' && appleCalls.length === 0, JSON.stringify(out));
  const out2 = await call('/apple-exchange', { idToken: await appleIdToken(), code: 'c' }, env({ APPLE_KEY_ID: '' }));
  check('מפתח לא מוגדר → skipped, בלי לפנות לאפל', out2.skipped === 'apple_key_not_configured' && appleCalls.length === 0, JSON.stringify(out2));
  const out3 = await call('/apple-exchange', { idToken: 'garbage' }, env({ APPLE_KEY_ID: '' }));
  check('מפתח לא מוגדר + טוקן פגום → לא מסגיר את מצב המפתח', out3.error === 'invalid_apple_token', JSON.stringify(out3));
  const out4 = await call('/apple-exchange', { idToken: await appleIdToken() });
  check('בלי code → missing_code', out4.error === 'missing_code', JSON.stringify(out4));
}

// ══ 3. /delete-account ═════════════════════════════════════════════════════════════
console.log('\n3. /delete-account — ביטול');
function seedMember(extra = {}) { put('members/m1', { firstName: 'רמי', email: 'r@x.co', status: 'approved', ...extra }); }
function lastLog() {
  const k = [...db.keys()].filter((x) => x.startsWith('deletionLog/')).pop();
  return k ? plain(k) : null;
}
{
  reset();
  seedMember({ appleSub: 'S1' });
  put('appleTokens/S1', { refreshToken: 'RT-S1', clientId: BUNDLE_ID });
  appleRevokeReply = async () => new Response('', { status: 200 });
  appleTokenReply = async (p) => p.grant_type === 'refresh_token'
    ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : new Response('', { status: 500 });
  const out = await call('/delete-account', { idToken: 'fb-good', reason: 'בדיקה' });
  check('המחיקה הצליחה', out.ok === true, JSON.stringify(out));
  const rc = appleCalls.find((c) => c.url.endsWith('/revoke'));
  check('נשלחה בקשה ל-/auth/revoke', !!rc);
  if (rc) {
    check('token = ה-refresh_token השמור', rc.params.token === 'RT-S1');
    check('token_type_hint=refresh_token', rc.params.token_type_hint === 'refresh_token');
    check('client_id = זה שהטוקן הונפק עבורו', rc.params.client_id === BUNDLE_ID, rc.params.client_id);
    const { payload } = await jwtVerify(rc.params.client_secret, p8.publicKey);
    check('client_secret של הביטול: sub = אותו client_id', payload.sub === BUNDLE_ID);
  }
  const vc = appleCalls.find((c) => c.url.endsWith('/token'));
  check('אחרי הביטול — ניסיון שימוש בטוקן (ההוכחה)', vc && vc.params.grant_type === 'refresh_token' && vc.params.refresh_token === 'RT-S1', vc && JSON.stringify(vc.params));
  check('ההוכחה אחרי הביטול, לא לפניו', appleCalls.findIndex((c) => c.url.endsWith('/revoke')) < appleCalls.findIndex((c) => c.url.endsWith('/token')));
  check('appleTokens/S1 נמחק אחרי ביטול מוצלח', !db.has('appleTokens/S1'));
  check('members/m1 נמחק', !db.has('members/m1'));
  check('היומן: selfAppleRevoke=revoked', lastLog() && lastLog().selfAppleRevoke === 'revoked', JSON.stringify(lastLog()));
}
{
  reset();
  seedMember({ appleSub: 'S2' });
  put('appleTokens/S2', { refreshToken: 'RT-S2', clientId: SERVICES_ID });
  appleRevokeReply = async () => Response.json({ error: 'invalid_client' }, { status: 400 });
  const out = await call('/delete-account', { idToken: 'fb-good' });
  check('אפל דוחה → המחיקה עדיין הצליחה', out.ok === true && !db.has('members/m1'), JSON.stringify(out));
  check('אפל דוחה → הטוקן נשאר לניסיון חוזר', db.has('appleTokens/S2'));
  check('אפל דוחה → היומן אומר מה קרה', lastLog() && /^apple_revoke_rejected:400:invalid_client$/.test(lastLog().selfAppleRevoke), lastLog() && lastLog().selfAppleRevoke);
}
// 🔴 **הרגרסיה שהבדיקה הזאת קיימת בשבילה:** 200 מ-revoke בלי הוכחה. לפני התיקון זה
// נרשם "revoked" — ר' הערת `revokeAppleToken`.
for (const [label, refreshReply, expect] of [
  ['הסוד נדחה (invalid_client) → לא "בוטל"',
    () => Response.json({ error: 'invalid_client' }, { status: 400 }), /^apple_revoke_unconfirmed:400:invalid_client$/],
  ['הטוקן עדיין עובד אחרי הביטול → not_effective',
    () => Response.json({ access_token: 'still-alive' }), /^apple_revoke_not_effective$/],
  ['תשובה לא צפויה בהוכחה → unconfirmed',
    () => new Response('oops', { status: 500 }), /^apple_revoke_unconfirmed:500:$/],
]) {
  reset();
  seedMember({ appleSub: 'S6' });
  put('appleTokens/S6', { refreshToken: 'RT', clientId: BUNDLE_ID });
  appleRevokeReply = async () => new Response('', { status: 200 });
  appleTokenReply = async () => refreshReply();
  const out = await call('/delete-account', { idToken: 'fb-good' });
  const got = lastLog() && lastLog().selfAppleRevoke;
  check('revoke=200 אבל ' + label, out.ok === true && expect.test(got || ''), got);
  check('   … והטוקן נשאר לניסיון חוזר', db.has('appleTokens/S6'));
}
{
  reset();
  seedMember({ appleSub: 'S3' });
  const out = await call('/delete-account', { idToken: 'fb-good' });
  check('נכנס עם Apple בלי טוקן שמור → no_token, והמחיקה הצליחה',
        out.ok === true && lastLog() && lastLog().selfAppleRevoke === 'no_token', lastLog() && lastLog().selfAppleRevoke);
  check('no_token → לא פונים לאפל', appleCalls.length === 0);
}
{
  reset();
  seedMember();
  const out = await call('/delete-account', { idToken: 'fb-good' });
  check('לא נכנס עם Apple → not_apple, בלי פנייה לאפל',
        out.ok === true && lastLog() && lastLog().selfAppleRevoke === 'not_apple' && appleCalls.length === 0,
        lastLog() && lastLog().selfAppleRevoke);
}
{
  reset();
  seedMember({ appleSub: 'S4' });
  put('appleTokens/S4', { refreshToken: 'RT', clientId: BUNDLE_ID });
  const out = await call('/delete-account', { idToken: 'fb-good' }, env({ APPLE_KEY_ID: '' }));
  check('מפתח לא מוגדר → היומן אומר זאת בשמו',
        out.ok === true && lastLog() && lastLog().selfAppleRevoke === 'apple_key_not_configured', lastLog() && lastLog().selfAppleRevoke);
  check('מפתח לא מוגדר → הטוקן נשאר', db.has('appleTokens/S4'));
}
{
  reset();
  seedMember({ appleSub: 'S5' });
  put('appleTokens/S5', { refreshToken: 'RT', clientId: BUNDLE_ID });
  appleRevokeReply = async () => { throw new TypeError('network down'); };
  const out = await call('/delete-account', { idToken: 'fb-good' });
  check('רשת נופלת מול אפל → המחיקה לא נופלת', out.ok === true && !db.has('members/m1'), JSON.stringify(out));
  check('רשת נופלת → נרשם apple_revoke_error', lastLog() && /^apple_revoke_error/.test(lastLog().selfAppleRevoke), lastLog() && lastLog().selfAppleRevoke);
}

// ══ 4. ⚠️ מול אפל האמיתית — מבנה בלבד ═══════════════════════════════════════════════
// 🔑 **החלק הזה הוא שגילה ש-200 מ-revoke אינו ראיה** (23.9.2026). הצפי המקורי היה
// `invalid_client` לשני הנתיבים, ושניהם נכשלו: token החזיר `invalid_grant`, ו-revoke
// החזיר **200** על מפתח מזויף וטוקן `bogus`. כלומר:
//   • אפל בודקת את ה-grant **לפני** ה-client — ועליו נשענת ההוכחה ב-`revokeAppleToken`;
//   • revoke עונה 200 על הכול — ולכן נדרשת הוכחה בכלל.
// הבדיקות כאן **נועלות את ההתנהגות שנמדדה**. אם אפל תשנה אותה, זה המקום שיצעק —
// ואז צריך לחזור ל-`revokeAppleToken` ולבדוק שהלוגיקה שם עדיין נכונה.
// ⚠️ **זה אינו מוכיח שמפתח אמיתי יתקבל.**
console.log('\n4. מול appleid.apple.com האמיתי (מפתח מזויף — נעילת ההתנהגות שנמדדה)');
if (process.env.SKIP_LIVE) {
  console.log('  — דולג (SKIP_LIVE)');
} else {
  // `node:https` ישירות — ה-fetch הגלובלי מנותב למוק למעלה.
  const liveFetch = async (u, init) => {
    const { request } = await import('node:https');
    return new Promise((resolve, reject) => {
      const r = request(u, { method: 'POST', headers: init.headers }, (res) => {
        let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
      });
      r.on('error', reject); r.end(init.body);
    });
  };
  apple._resetAppleKeyCacheForTest();
  const secret = await apple._appleClientSecretForTest(env(), BUNDLE_ID);
  const T = 'https://appleid.apple.com/auth/token', R = 'https://appleid.apple.com/auth/revoke';
  for (const [name, url, params, want] of [
    ['token/code מזויף → invalid_grant (grant נבדק לפני client)', T,
      { client_id: BUNDLE_ID, client_secret: secret, code: 'bogus', grant_type: 'authorization_code' },
      (r) => r.status === 400 && /"invalid_grant"/.test(r.body)],
    ['token/refresh מזויף → invalid_grant (זו "ההצלחה" של ההוכחה)', T,
      { client_id: BUNDLE_ID, client_secret: secret, refresh_token: 'bogus', grant_type: 'refresh_token' },
      (r) => r.status === 400 && /"invalid_grant"/.test(r.body)],
    ['token/grant לא מוכר → unsupported_grant_type (הכתובת והגוף נקראים)', T,
      { client_id: BUNDLE_ID, client_secret: secret, code: 'bogus', grant_type: 'zzz' },
      (r) => r.status === 400 && /unsupported_grant_type/.test(r.body)],
    ['revoke/מפתח מזויף וטוקן מזויף → 200 (!)', R,
      { client_id: BUNDLE_ID, client_secret: secret, token: 'bogus', token_type_hint: 'refresh_token' },
      (r) => r.status === 200],
    ['revoke/client_secret="x" → 200 (!)', R,
      { client_id: BUNDLE_ID, client_secret: 'x', token: 'bogus', token_type_hint: 'refresh_token' },
      (r) => r.status === 200],
  ]) {
    try {
      const r = await liveFetch(url, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                       body: new URLSearchParams(params).toString() });
      check(name, want(r), `${r.status} ${r.body}`);
    } catch (e) {
      check(name, false, 'network: ' + e.message);
    }
  }
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
