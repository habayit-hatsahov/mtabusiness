// בדיקת §664 — /biz-reg-status: מצב העסק ומה חסר בו, לפי טוקן העסק שנשמר במכשיר שנרשם.
// מריץ את הוורקר האמיתי מול Firestore מדומה (אותו דפוס כמו regstatus612), כולל runQuery על bizTokens.
import worker from '../worker/src/index.js';
import { generateKeyPair, exportPKCS8 } from '../worker/node_modules/jose/dist/node/esm/index.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };

let db = {};
const toV = (v) => v === null || v === undefined ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(toV) } } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { integerValue: String(v) };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue : 'integerValue' in v ? Number(v.integerValue) : v;
const docOut = (path) => ({ name: 'x/documents/' + path, fields: Object.fromEntries(Object.entries(db[path]).map(([a, b]) => [a, toV(b)])) });
const writes = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }));
  if (u.pathname.endsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId, ff = q.where && q.where.fieldFilter;
    const rows = Object.keys(db).filter((p) => p.startsWith(coll + '/') && p.split('/').length === 2 && (!ff || db[p][ff.field.fieldPath] === fromV(ff.value)));
    return new Response(JSON.stringify(rows.length ? rows.map((p) => ({ document: docOut(p) })) : [{}]));
  }
  const m = u.pathname.match(/documents\/(.+)$/);
  if (!m) return new Response('{}', { status: 404 });
  const path = decodeURIComponent(m[1]);
  if ((opts.method || 'GET') === 'GET') return db[path] ? new Response(JSON.stringify(docOut(path))) : new Response('{}', { status: 404 });
  writes.push(path);
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
const call = async (body, ip = '8.8.8.8') => {
  const r = await worker.fetch(new Request('https://w/biz-reg-status', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const BIZ = 'AbCdEfGhIjKlMnOpQrSt', OTHER = 'ZyXwVuTsRqPoNmLkJiHg';
const TOKEN = '11111111-2222-3333-4444-555555555555', T2 = '99999999-2222-3333-4444-555555555555';
const reset = () => {
  db = {};
  db[`bizTokens/${BIZ}`] = { accessToken: TOKEN };
  db[`bizTokens/${OTHER}`] = { accessToken: T2 };
  db[`businesses/${BIZ}`] = { status: 'pending', name: 'Aviv Production', ownerFirst: 'Aviv', ownerPhone: '0500000000', verifyRoute: 'passScreenshot', coverPhoto: '', logo: '', photos: [] };
  db[`businesses/${OTHER}`] = { status: 'pending', name: 'אחר' };
};

console.log('/biz-reg-status');
reset();
let r = await call({ bizId: BIZ, token: TOKEN });
check('ממתין בלי שום תמונה → missing: תמונה ראשית + צילום אימות + לוגו + גלריה', r.j && r.j.status === 'pending' && r.j.missing && r.j.missing.cover && r.j.missing.proof && r.j.missing.logo && r.j.missing.gallery, r.j);
check('שם העסק ושם פרטי חוזרים', r.j.name === 'Aviv Production' && r.j.ownerFirst === 'Aviv', r.j);
check('בלי טלפון/מייל בתשובה', !JSON.stringify(r.j).includes('0500000000'), r.j);

db[`bizProofs/${BIZ}`] = { photoProofUrl: 'https://firebasestorage.googleapis.com/x' };
db[`businesses/${BIZ}`].coverPhoto = 'https://firebasestorage.googleapis.com/c';
r = await call({ bizId: BIZ, token: TOKEN });
check('אחרי העלאה: תמונה ראשית וצילום כבר לא חסרים', r.j && !r.j.missing.cover && !r.j.missing.proof && r.j.missing.logo, r.j);

reset();
db[`businesses/${BIZ}`].verifyRoute = 'seatDetails';
r = await call({ bizId: BIZ, token: TOKEN });
check('מסלול אימות בלי תמונה (פרטי מושב) → צילום לא נדרש', r.j && r.j.missing && !r.j.missing.proof && r.j.missing.cover, r.j);

reset();
r = await call({ bizId: BIZ, token: T2 });
check('טוקן של עסק אחר → invalid, בלי פרטים', r.j && r.j.error === 'invalid' && !r.j.name, r.j);
r = await call({ bizId: BIZ, token: 'short' });
check('טוקן קצר → invalid', r.j && r.j.error === 'invalid', r.j);
r = await call({ bizId: '../businesses', token: TOKEN });
check('bizId לא תקין → invalid', r.j && r.j.error === 'invalid', r.j);

reset();
db[`businesses/${BIZ}`].status = 'approved';
r = await call({ bizId: BIZ, token: TOKEN });
check('מאושר → approved, בלי missing', r.j && r.j.status === 'approved' && !r.j.missing, r.j);
db[`businesses/${BIZ}`].status = 'rejected';
r = await call({ bizId: BIZ, token: TOKEN });
check('נדחה → rejected', r.j && r.j.status === 'rejected', r.j);

// §419 – הטוקן לא נכתב מהדפדפן: claimBizToken רושם אותו לעסק ממתין בלבד
reset();
delete db[`bizTokens/${BIZ}`];
writes.length = 0;
r = await call({ bizId: BIZ, token: TOKEN });
check('טוקן שלא נכתב + עסק ממתין → נרשם ועובד', r.j && r.j.status === 'pending' && db[`bizTokens/${BIZ}`] && db[`bizTokens/${BIZ}`].accessToken === TOKEN, r.j);
reset();
delete db[`bizTokens/${BIZ}`];
db[`businesses/${BIZ}`].status = 'approved';
r = await call({ bizId: BIZ, token: TOKEN });
check('טוקן שלא נכתב + עסק מאושר → invalid (לא נתבע)', r.j && r.j.error === 'invalid' && !db[`bizTokens/${BIZ}`], r.j);

reset();
delete db[`businesses/${BIZ}`];
delete db[`bizTokens/${BIZ}`];
r = await call({ bizId: BIZ, token: TOKEN });
check('עסק שנמחק → invalid (המכשיר מוחק את המפתח)', r.j && (r.j.error === 'invalid' || r.j.status === 'gone'), r.j);

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
