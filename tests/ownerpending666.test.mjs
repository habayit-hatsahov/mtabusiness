// §666 — בעל עסק ממתין שמתחבר עם Google/Apple: worker/src/ownerpending.js
// Firestore מדומה (אותו דפוס כמו bizregstatus664). הרצה: node tests/ownerpending666.test.mjs
import { pendingOwnerExtras } from '../worker/src/ownerpending.js';
import { handleRegStatus } from '../worker/src/regstatus.js';
import { handleBizRegStatus } from '../worker/src/bizregstatus.js';
import { generateKeyPair, exportPKCS8 } from '../worker/node_modules/jose/dist/node/esm/index.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };

let db = {};
const toV = (v) => v === null || v === undefined ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(toV) } } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { integerValue: String(v) };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : v;
const docOut = (path) => ({ name: 'x/documents/' + path, fields: Object.fromEntries(Object.entries(db[path]).map(([a, b]) => [a, toV(b)])) });
let writes = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }));
  if (u.pathname.endsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery, coll = q.from[0].collectionId, ff = q.where && q.where.fieldFilter;
    const rows = Object.keys(db).filter((p) => p.startsWith(coll + '/') && (!ff || db[p][ff.field.fieldPath] === fromV(ff.value)));
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
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', RATE_LIMIT_KV: { get: async () => null, put: async () => {} },
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: await exportPKCS8(privateKey), client_email: 'sa@p.iam.gserviceaccount.com' }),
};

const MID = 'MmMmMmMmMmMmMmMmMmMm', BIZ = 'BbBbBbBbBbBbBbBbBbBb', TOKEN = '11111111-2222-3333-4444-555555555555';
const reset = () => {
  writes = [];
  db = {
    [`members/${MID}`]: { status: 'pending', isBusinessOwner: true, linkedBusinessId: BIZ, firstName: 'דני' },
    [`businesses/${BIZ}`]: { status: 'pending', ownerMemberId: MID, name: 'פרגולות הדוגמה', ownerFirst: 'דני' },
    [`bizTokens/${BIZ}`]: { accessToken: TOKEN },
  };
};
const row = () => ({ id: MID, fields: db[`members/${MID}`] });

console.log('בעל עסק ממתין, בלי מפתח');
reset();
let r = await pendingOwnerExtras(env, 'at', row());
check('מחזיר עסק + טוקן', r && r.bizId === BIZ && r.token === TOKEN && r.name === 'פרגולות הדוגמה' && r.ownerFirst === 'דני', r);
check('מפתח חדש + memberId', r && r.memberId === MID && typeof r.ticket === 'string' && r.ticket.length >= 40, r);
check('ה-hash נכתב לרשומה', /^[0-9a-f]{64}$/.test(db[`members/${MID}`].regTicketHash || ''), db[`members/${MID}`]);
check('רק רשומת החבר נכתבה', writes.length === 1 && writes[0] === `members/${MID}`, writes);

console.log('אחרי האישור – המפתח מכניס דרך /reg-status (§612)');
const ticket = r.ticket;
db[`members/${MID}`].status = 'approved';
const s = await handleRegStatus({ memberId: MID, ticket }, env);
check('approved + customToken', s.status === 'approved' && typeof s.customToken === 'string', s);
check('§668 – method: code (בלי Google/Apple מחוברים)', s.method === 'code', s);
db[`members/${MID}`].googleSub = 'g1';
check('§668 – method: google כשמחובר', (await handleRegStatus({ memberId: MID, ticket }, env)).method === 'google');
const bad = await handleRegStatus({ memberId: MID, ticket: 'x'.repeat(43) }, env);
check('מפתח אחר נדחה', bad.error === 'invalid', bad);

console.log('יש כבר מפתח (מכשיר אחר) – לא דורסים');
reset();
db[`members/${MID}`].regTicketHash = 'a'.repeat(64);
r = await pendingOwnerExtras(env, 'at', row());
check('עסק + טוקן בלי מפתח', r && r.token === TOKEN && !('ticket' in r) && !('memberId' in r), r);
check('לא נכתב כלום', writes.length === 0 && db[`members/${MID}`].regTicketHash === 'a'.repeat(64), writes);

console.log('לא מקבלים כלום');
reset(); db[`members/${MID}`].isBusinessOwner = false;
check('לא בעל עסק', (await pendingOwnerExtras(env, 'at', row())) === null);
reset(); db[`members/${MID}`].status = 'approved';
check('חבר מאושר', (await pendingOwnerExtras(env, 'at', row())) === null);
reset(); db[`businesses/${BIZ}`].status = 'approved';
check('העסק כבר מאושר', (await pendingOwnerExtras(env, 'at', row())) === null);
reset(); db[`businesses/${BIZ}`].ownerMemberId = 'ZzZzZzZzZzZzZzZzZzZz';
check('העסק שייך לחבר אחר', (await pendingOwnerExtras(env, 'at', row())) === null);
reset(); delete db[`bizTokens/${BIZ}`];
check('אין טוקן לעסק', (await pendingOwnerExtras(env, 'at', row())) === null);
reset(); db[`members/${MID}`].linkedBusinessId = '../x';
check('מזהה עסק לא תקין', (await pendingOwnerExtras(env, 'at', row())) === null);
check('בכל אלה לא נכתב כלום', writes.length === 0, writes);

console.log('"למה ממתינים" מגיע למסך (/biz-reg-status)');
reset();
Object.assign(db[`businesses/${BIZ}`], { coverPhoto: 'x', inReviewReasons: ['other', 'deal', 'bogus', 'cover'], inReviewOther: '  הטלפון לא עונה ' });
let st = await handleBizRegStatus({ bizId: BIZ, token: TOKEN }, env);
check('reasons בסדר הקבוע, בלי מפתח זר', JSON.stringify(st.reasons) === JSON.stringify(['cover', 'deal', 'other']), st);
check('other מנוקה', st.other === 'הטלפון לא עונה', st);
db[`businesses/${BIZ}`].inReviewOther = '';
st = await handleBizRegStatus({ bizId: BIZ, token: TOKEN }, env);
check('"אחר" ריק לא נשלח', !st.reasons.includes('other') && !('other' in st), st);
db[`businesses/${BIZ}`].inReviewReasons = [];
st = await handleBizRegStatus({ bizId: BIZ, token: TOKEN }, env);
check('בלי סיבות – מערך ריק', Array.isArray(st.reasons) && !st.reasons.length, st);
db[`businesses/${BIZ}`].status = 'approved';
st = await handleBizRegStatus({ bizId: BIZ, token: TOKEN }, env);
check('מאושר – בלי reasons', st.status === 'approved' && !('reasons' in st), st);

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
