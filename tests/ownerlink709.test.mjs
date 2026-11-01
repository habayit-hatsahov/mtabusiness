// §709 — בעל עסק ממתין שניסה להיכנס עם קוד: pendingOwnerMailLink (worker/src/ownerpending.js)
// אותו Firestore מדומה כמו ownerpending666. הרצה: node tests/ownerlink709.test.mjs
import { pendingOwnerMailLink, maskEmail } from '../worker/src/ownerpending.js';
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
  if (u.hostname === 'api.brevo.com') { brevo.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ messageId: 'm1' })); }
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
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', RATE_LIMIT_KV: { get: async (k) => kv[k] ?? null, put: async (k, v) => { kv[k] = v; } },
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: await exportPKCS8(privateKey), client_email: 'sa@p.iam.gserviceaccount.com' }),
};

let kv = {}, sent = [], brevo = [];
const send = async (_env, m) => { sent.push(m); };
const MID = 'MmMmMmMmMmMmMmMmMmMm', BIZ = 'BbBbBbBbBbBbBbBbBbBb', TOKEN = '11111111-2222-3333-4444-555555555555';
const reset = () => {
  writes = []; kv = {}; sent = [];
  db = {
    [`members/${MID}`]: { status: 'pending', isBusinessOwner: true, linkedBusinessId: BIZ, firstName: 'דני', email: 'danny.demo@gmail.com' },
    [`businesses/${BIZ}`]: { status: 'pending', ownerMemberId: MID, name: 'פרגולות הדוגמה', ownerFirst: 'דני', ownerEmail: 'biz@example.com' },
    [`bizTokens/${BIZ}`]: { accessToken: TOKEN },
  };
};
const row = () => ({ id: MID, fields: db[`members/${MID}`] });

console.log('בעל עסק ממתין');
reset();
let r = await pendingOwnerMailLink(env, 'at', row(), send);
check('מחזיר רק כתובת מוסתרת', r && r.sentTo === 'da•••@gmail.com' && Object.keys(r).length === 1, r);
check('מייל אחד, לכתובת שברשומה', sent.length === 1 && sent[0].toEmail === 'danny.demo@gmail.com', sent);
check('הקישור לדשבורד עם הטוקן', sent[0] && sent[0].link === 'https://yellowzone.co.il/business-dashboard.html?token=' + TOKEN, sent[0]);
check('שם העסק והשם הפרטי במייל', sent[0] && sent[0].businessName === 'פרגולות הדוגמה' && sent[0].toName === 'דני', sent[0]);
check('לא נכתב כלום ל-Firestore (בלי מפתח)', writes.length === 0, writes);
check('בתשובה אין טוקן', !JSON.stringify(r).includes(TOKEN));

console.log('בלי מייל על החבר – ownerEmail של העסק');
reset(); db[`members/${MID}`].email = '';
r = await pendingOwnerMailLink(env, 'at', row(), send);
check('נשלח ל-ownerEmail', sent.length === 1 && sent[0].toEmail === 'biz@example.com' && r.sentTo === 'bi•••@example.com', { r, sent });

console.log('תקרה: 3 בשעה לעסק');
reset();
for (let i = 0; i < 5; i++) r = await pendingOwnerMailLink(env, 'at', row(), send);
check('רק 3 מיילים', sent.length === 3, sent.length);
check('אחרי התקרה: already + כתובת', r && r.already === true && r.sentTo === 'da•••@gmail.com', r);

console.log('לא שולחים');
reset(); db[`members/${MID}`].isBusinessOwner = false;
check('לא בעל עסק', (await pendingOwnerMailLink(env, 'at', row(), send)) === null && sent.length === 0);
reset(); db[`members/${MID}`].status = 'rejected';
check('חבר שנדחה', (await pendingOwnerMailLink(env, 'at', row(), send)) === null && sent.length === 0);
reset(); db[`businesses/${BIZ}`].status = 'approved';
check('עסק שכבר אושר', (await pendingOwnerMailLink(env, 'at', row(), send)) === null && sent.length === 0);
reset(); db[`businesses/${BIZ}`].ownerMemberId = 'XxXxXxXxXxXxXxXxXxXx';
check('העסק מצביע על חבר אחר', (await pendingOwnerMailLink(env, 'at', row(), send)) === null && sent.length === 0);
reset(); db[`members/${MID}`].linkedBusinessId = '../x';
check('מזהה עסק לא תקין', (await pendingOwnerMailLink(env, 'at', row(), send)) === null && sent.length === 0);
reset(); db[`members/${MID}`].email = ''; db[`businesses/${BIZ}`].ownerEmail = '';
check('אין שום מייל', (await pendingOwnerMailLink(env, 'at', row(), send)) === null && sent.length === 0);
reset(); delete db[`bizTokens/${BIZ}`];
check('אין טוקן לעסק', (await pendingOwnerMailLink(env, 'at', row(), send)) === null && sent.length === 0);
check('maskEmail קצר', maskEmail('ab@x.co') === 'a•••@x.co' && maskEmail('nope') === '');

console.log('מקצה לקצה – /mint-member-token (handleMemberLogin)');
const worker = (await import('../worker/src/index.js')).default;
const login = async (phone) => (await worker.fetch(new Request('https://w/mint-member-token', { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify({ phone, code: '123456' }) }), env, { waitUntil() {} })).json();
reset(); brevo = []; db[`members/${MID}`].phone = '0501234567';
let L = await login('050-1234567');
check('pending + bizMail עם כתובת מוסתרת', L.error === 'pending' && L.bizMail && L.bizMail.sentTo === 'da•••@gmail.com', L);
check('בלי טוקן ובלי customToken בתשובה', !JSON.stringify(L).includes(TOKEN) && !L.customToken, L);
check('מייל אחד ל-Brevo, לכתובת שברשומה, עם הקישור', brevo.length === 1 && brevo[0].to[0].email === 'danny.demo@gmail.com' && brevo[0].htmlContent.includes(TOKEN), brevo.map((b) => b.to));
check('תג dashLink (ה-webhook מדלג עליו)', !!brevo[0] && Array.isArray(brevo[0].tags) && brevo[0].tags.includes('dashLink'), brevo[0] && brevo[0].tags);
reset(); brevo = []; db[`members/${MID}`].phone = '0501234567'; db[`members/${MID}`].isBusinessOwner = false;
L = await login('0501234567');
check('אוהד ממתין רגיל – pending בלי bizMail ובלי מייל', L.error === 'pending' && !L.bizMail && brevo.length === 0, L);
reset(); brevo = []; db[`members/${MID}`].phone = '0501234567'; db[`members/${MID}`].status = 'rejected';
L = await login('0501234567');
check('נדחה – rejected בלי מייל', L.error === 'rejected' && brevo.length === 0, L);

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
