// בדיקת §612 — /reg-status: מצב הבקשה לפי המפתח שבמכשיר, וכניסה לבד אחרי האישור.
// מריץ את הוורקר האמיתי מול Firestore מדומה (אותו דפוס כמו resendqueued562).
import worker from '../worker/src/index.js';
import { sha256Hex } from '../worker/src/regstatus.js';
import { generateKeyPair, exportPKCS8, decodeJwt } from '../worker/node_modules/jose/dist/node/esm/index.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };

let db = {};
const toV = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { integerValue: String(v) };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue : 'integerValue' in v ? Number(v.integerValue) : v;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }));
  if (u.pathname.endsWith(':runQuery')) return new Response(JSON.stringify([{}]));
  const m = u.pathname.match(/documents\/(.+)$/);
  if (!m) return new Response('{}', { status: 404 });
  let path = decodeURIComponent(m[1]);
  if (u.searchParams.get('documentId')) path += '/' + u.searchParams.get('documentId');
  if ((opts.method || 'GET') === 'GET') {
    if (!db[path]) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ name: 'x/documents/' + path, fields: Object.fromEntries(Object.entries(db[path]).map(([a, b]) => [a, toV(b)])) }));
  }
  const body = JSON.parse(opts.body);
  db[path] = { ...(db[path] || {}), ...Object.fromEntries(Object.entries(body.fields).map(([a, b]) => [a, fromV(b)])) };
  return new Response('{}');
};
const { privateKey } = await generateKeyPair('RS256', { extractable: true });
const env = {
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', ALLOWED_ORIGIN: 'https://yellowzone.co.il',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: await exportPKCS8(privateKey), client_email: 'sa@p.iam.gserviceaccount.com' }),
  RATE_LIMIT_KV: { get: async () => null, put: async () => {} },
};
const call = async (path, body, ip = '9.9.9.9') => {
  const r = await worker.fetch(new Request('https://w' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const ID = 'AbCdEfGhIjKlMnOpQrSt';
const ticket = 'tK_' + 'x'.repeat(40);
const hash = await sha256Hex(ticket);
db[`members/${ID}`] = { status: 'pending', firstName: 'דניאל', regTicketHash: hash };

console.log('/reg-status');
let r = await call('/reg-status', { memberId: ID, ticket });
check('ממתין → pending + שם', r.j && r.j.status === 'pending' && r.j.firstName === 'דניאל' && !r.j.customToken, r.j);
r = await call('/reg-status', { memberId: ID, ticket: ticket.slice(0, -1) + 'y' });
check('מפתח שגוי → invalid, בלי טוקן', r.j && r.j.error === 'invalid' && !r.j.customToken, r.j);
r = await call('/reg-status', { memberId: ID, ticket: 'short' });
check('מפתח בפורמט לא חוקי → invalid', r.j && r.j.error === 'invalid', r.j);
r = await call('/reg-status', { memberId: 'NoSuchMemberXXXXXXXX', ticket });
check('רשומה שלא קיימת → gone', r.j && r.j.status === 'gone', r.j);
db[`members/${ID}`].status = 'rejected';
r = await call('/reg-status', { memberId: ID, ticket });
check('נדחה → rejected, בלי טוקן', r.j && r.j.status === 'rejected' && !r.j.customToken, r.j);
db[`members/${ID}`].status = 'approved';
r = await call('/reg-status', { memberId: ID, ticket });
const claims = r.j && r.j.customToken ? decodeJwt(r.j.customToken) : {};
check('אושר → customToken על ה-uid של החבר', r.j && r.j.status === 'approved' && claims.uid === ID && claims.claims && claims.claims.role === 'member', claims);
db['members/NoHashMemberXXXXXXXX'] = { status: 'approved', firstName: 'x' };
r = await call('/reg-status', { memberId: 'NoHashMemberXXXXXXXX', ticket });
check('רשומה בלי hash (נרשם לפני §612) → invalid, בלי טוקן', r.j && r.j.error === 'invalid' && !r.j.customToken, r.j);
let limited = false;
for (let i = 0; i < 61; i++) { const x = await call('/reg-status', { memberId: ID, ticket: 'bad' }, '7.7.7.7'); if (x.status === 429) { limited = true; break; } }
check('מכסה: אחרי 60 בקשות ב-15 דק׳ → 429', limited);

console.log('/submit-member');
const base = { firstName: 'נ', lastName: 'ב', phone: '0549999999', email: 'n@x.co' };
r = await call('/submit-member', { memberId: 'SubmitMemberAAAAAAAA', data: { ...base, regTicketHash: hash } });
check('גיבוי ההרשמה שומר regTicketHash', r.j && r.j.ok && db['members/SubmitMemberAAAAAAAA'] && db['members/SubmitMemberAAAAAAAA'].regTicketHash === hash, r.j);
r = await call('/submit-member', { memberId: 'SubmitMemberBBBBBBBB', data: { ...base, phone: '0548888888', email: 'm@x.co', regTicketHash: 'not-a-hash' } });
check('hash לא חוקי נדחה', r.j && r.j.error === 'bad_field' && r.j.field === 'regTicketHash', r.j);

console.log(fail ? `❌ ${pass}/${pass + fail}` : `✅ ${pass}/${pass}`);
process.exit(fail ? 1 : 0);
