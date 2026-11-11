// בדיקת §766 — /reg-reply: מאושר שהכניסה שלו נתקעה כותב לנו דרך הוורקר → פנייה ב-helpRequests.
// אותו Firestore מדומה כמו regstatus612. גם המסלול הקיים (§735, צריך לתקן) נבדק שלא נשבר.
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
  return new Response(JSON.stringify({ name: 'x/documents/' + path + '/NEWDOC' }));
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
const helpDocs = () => Object.keys(db).filter((k) => k === 'helpRequests');

console.log('/reg-reply');
db[`members/${ID}`] = { status: 'approved', firstName: 'דניאל', lastName: 'כהן', phone: '0541234567', regTicketHash: hash };
let r = await call('/reg-reply', { memberId: ID, ticket, text: 'נשאר על נכנסים' });
const h = db['helpRequests'] || {};
check('מאושר → ok ופנייה ב-helpRequests', r.j && r.j.ok && helpDocs().length === 1, r.j);
check('הפנייה: שם, טלפון, טקסט, loginFail/authTimeout, memberId, new', h.name === 'דניאל כהן' && h.contact === '0541234567' && h.message === 'נשאר על נכנסים' && h.source === 'loginFail' && h.errCode === 'authTimeout' && h.memberId === ID && h.status === 'new', h);
check('מאושר לא נוגע ב-fixReplies', !('fixReplies' in db[`members/${ID}`]), db[`members/${ID}`]);
delete db['helpRequests'];
r = await call('/reg-reply', { memberId: ID, ticket: ticket.slice(0, -1) + 'y', text: 'x' });
check('מפתח שגוי → invalid, בלי פנייה', r.j && r.j.error === 'invalid' && helpDocs().length === 0, r.j);
r = await call('/reg-reply', { memberId: ID, ticket, text: '   ' });
check('טקסט ריק → empty', r.j && r.j.error === 'empty', r.j);
db[`members/${ID}`].status = 'pending';
r = await call('/reg-reply', { memberId: ID, ticket, text: 'x' });
check('ממתין → not_allowed, בלי פנייה', r.j && r.j.error === 'not_allowed' && helpDocs().length === 0, r.j);
db[`members/${ID}`] = { status: 'rejected', retryAllowed: true, firstName: 'דניאל', regTicketHash: hash };
r = await call('/reg-reply', { memberId: ID, ticket, text: 'אין לי אינסטגרם' });
check('§735 צריך לתקן – עדיין נשמר ב-fixReplies', r.j && r.j.ok && db[`members/${ID}`].fixReplyAt !== undefined && helpDocs().length === 0, r.j);

console.log(fail ? `❌ ${pass}/${pass + fail}` : `✅ ${pass}/${pass}`);
