// §462 — בדיקת /submit-member מול ה-Worker האמיתי (default export), עם רשת מדומה.
// הרצה: node --conditions=workerd scratch_test_submit_member.mjs
import worker from './src/index.js';

const env = {
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', ALLOWED_ORIGINS: '*',
  RATE_LIMIT_KV: { get: async () => ({ token: 'AT', exp: Date.now() / 1000 + 3600 }), put: async () => {} },
};

let db, calls;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = init.method || 'GET';
  calls.push(method + ' ' + url);
  const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const m = url.match(/documents\/members\?documentId=([^&]+)/);
  if (m && method === 'POST') {
    const id = decodeURIComponent(m[1]);
    if (db['members/' + id]) return res(409, { error: { status: 'ALREADY_EXISTS' } });
    db['members/' + id] = JSON.parse(init.body).fields;
    return res(200, { name: 'projects/p/databases/(default)/documents/members/' + id });
  }
  throw new Error('unmocked: ' + method + ' ' + url);
};

const call = async (body) => {
  const r = await worker.fetch(new Request('https://api.yellowzone.co.il/submit-member', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il' }, body: JSON.stringify(body),
  }), env, { waitUntil() {} });
  return r.json();
};

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('✅', name); } else { fail++; console.log('❌', name, extra ?? ''); } };

const ID = 'AbCdEfGhIjKlMnOpQrSt';
const good = () => ({
  firstName: 'בדיקה', lastName: 'בדיקה', birthDate: '1990-01-01', phone: '0501234567', email: 'a@b.co',
  isSubscriber: false, fanSport: 'football', verifiedSport: null, subscriberSection: null, subscriberTier: null,
  wasSubscriber: 'no', photoProofUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/y', status: 'pending',
  verifyMethod: 'standsPhoto', verifyTrust: 'low', subscriberNumber: null, seatArea: null, seatBlock: null,
  seatRow: null, seatNumber: null, verifyNote: null, facebookUrl: null, instagramUrl: null, profileRaw: null,
  profileSource: null,
});

db = {}; calls = [];
let out = await call({ memberId: ID, data: good() });
const saved = db['members/' + ID];
check('יצירה תקינה → created', out.ok && out.created === true, JSON.stringify(out));
check('status נכפה pending', saved?.status?.stringValue === 'pending');
check('submitPath=worker נכתב', saved?.submitPath?.stringValue === 'worker');
check('submittedAt הוא timestamp', !!saved?.submittedAt?.timestampValue);
check('isSubscriber נשמר כבוליאני', saved?.isSubscriber?.booleanValue === false);
check('אין reviewFlagAt בלי reviewFlag', !('reviewFlagAt' in saved));

out = await call({ memberId: ID, data: good() });
check('שליחה שנייה לאותו מזהה → ok, created:false (בלי דריסה)', out.ok && out.created === false, JSON.stringify(out));

db = {}; calls = [];
out = await call({ memberId: ID, data: { ...good(), status: 'approved' } });
check('status=approved מהדפדפן → נשמר pending', db['members/' + ID]?.status?.stringValue === 'pending');

const reject = async (name, body, expect) => {
  db = {}; calls = [];
  const o = await call(body);
  check(name + ' → ' + expect, o.error === expect && Object.keys(db).length === 0, JSON.stringify(o));
};
await reject('מזהה קצר', { memberId: 'abc', data: good() }, 'bad_member_id');
await reject('מזהה עם תווים אסורים', { memberId: '../admin/xxxxxxxxxxxx', data: good() }, 'bad_member_id');
await reject('appleSub', { memberId: ID, data: { ...good(), appleSub: 'S' } }, 'bad_field');
await reject('isAdmin', { memberId: ID, data: { ...good(), isAdmin: true } }, 'bad_field');
await reject('googleEmail', { memberId: ID, data: { ...good(), googleEmail: 'x@gmail.com' } }, 'bad_field');
await reject('isSubscriber כמחרוזת', { memberId: ID, data: { ...good(), isSubscriber: 'yes' } }, 'bad_field');
await reject('אובייקט בשדה טקסט', { memberId: ID, data: { ...good(), firstName: { a: 1 } } }, 'bad_field');
await reject('photoProofUrl זר', { memberId: ID, data: { ...good(), photoProofUrl: 'https://evil.com/x' } }, 'bad_field');
await reject('reviewFlag אחר', { memberId: ID, data: { ...good(), reviewFlag: 'trusted' } }, 'bad_field');
await reject('בלי שם', { memberId: ID, data: { ...good(), firstName: '' } }, 'missing_fields');
await reject('בלי טלפון ומייל', { memberId: ID, data: { ...good(), phone: '', email: '' } }, 'missing_fields');
await reject('data חסר', { memberId: ID }, 'invalid_request');

db = {}; calls = [];
out = await call({ memberId: ID, data: { ...good(), photoProofUrl: '', reviewFlag: 'possible_duplicate', duplicateOfId: 'XYZ' } });
const s2 = db['members/' + ID];
check('reviewFlag → גם reviewFlagAt', out.ok && !!s2?.reviewFlagAt?.timestampValue, JSON.stringify(out));
check('photoProofUrl ריק מתקבל', s2?.photoProofUrl?.stringValue === '');

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
