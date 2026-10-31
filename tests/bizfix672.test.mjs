// בדיקת §672 — "✅ תיקנתי" (/biz-fix-done), העלאה לעסק ב"צריך לתקן", וסריקת בקשות השינוי → התראה לרמי.
// מריץ את הוורקר האמיתי מול Firestore מדומה (אותו דפוס כמו bizregstatus664), כולל runQuery עם טווח.
import worker from '../worker/src/index.js';
import { runBizRequestAlerts } from '../worker/src/bizfix.js';
import { generateKeyPair, exportPKCS8 } from '../worker/node_modules/jose/dist/node/esm/index.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };

let db = {};
const toV = (v) => v === null || v === undefined ? { nullValue: null } : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(toV) } }
  : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([a, b]) => [a, toV(b)])) } };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'timestampValue' in v ? new Date(v.timestampValue)
  : 'integerValue' in v ? Number(v.integerValue) : 'arrayValue' in v ? (v.arrayValue.values || []).map(fromV) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([a, b]) => [a, fromV(b)])) : null;
const docOut = (path) => ({ name: 'x/documents/' + path, fields: Object.fromEntries(Object.entries(db[path]).map(([a, b]) => [a, toV(b)])) });
const writes = [], mails = [];
const cmp = (a, b) => (a instanceof Date ? a.getTime() : a) >= (b instanceof Date ? b.getTime() : b);
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }));
  if (/brevo/.test(u.hostname)) { mails.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ messageId: 'm1' }), { status: 201 }); }
  if (u.pathname.endsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId, ff = q.where && q.where.fieldFilter;
    const rows = Object.keys(db).filter((p) => p.startsWith(coll + '/') && p.split('/').length === 2 && (!ff || (
      ff.op === 'GREATER_THAN_OR_EQUAL' ? db[p][ff.field.fieldPath] != null && cmp(db[p][ff.field.fieldPath], fromV(ff.value)) : db[p][ff.field.fieldPath] === fromV(ff.value))));
    return new Response(JSON.stringify(rows.length ? rows.map((p) => ({ document: docOut(p) })) : [{}]));
  }
  const m = u.pathname.match(/documents\/(.+)$/);
  if (!m) return new Response('{}', { status: 404 });
  const path = decodeURIComponent(m[1]);
  const method = opts.method || 'GET';
  if (method === 'GET') return db[path] ? new Response(JSON.stringify(docOut(path))) : new Response('{}', { status: 404 });
  const body = JSON.parse(opts.body);
  const fields = Object.fromEntries(Object.entries(body.fields || {}).map(([a, b]) => [a, fromV(b)]));
  if (method === 'POST') { const id = path + '/auto' + writes.length; writes.push(['create', id, fields]); db[id] = fields; return new Response(JSON.stringify({ name: 'x/documents/' + id })); }
  writes.push(['patch', path, fields]);
  db[path] = { ...(db[path] || {}), ...fields };
  return new Response('{}');
};
const { privateKey } = await generateKeyPair('RS256', { extractable: true });
const env = {
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', ALLOWED_ORIGIN: 'https://yellowzone.co.il', BREVO_API_KEY: 'b',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: await exportPKCS8(privateKey), client_email: 'sa@p.iam.gserviceaccount.com' }),
  RATE_LIMIT_KV: { get: async () => null, put: async () => {} },
};
const call = async (body, ip = '8.8.8.8') => {
  const r = await worker.fetch(new Request('https://w/biz-fix-done', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: r.status, j: await r.json().catch(() => null) };
};

const BIZ = 'AbCdEfGhIjKlMnOpQrSt', OTHER = 'ZyXwVuTsRqPoNmLkJiHg';
const TOKEN = '11111111-2222-3333-4444-555555555555', T2 = '99999999-2222-3333-4444-555555555555';
const reset = (biz) => {
  db = {}; writes.length = 0; mails.length = 0;
  db[`bizTokens/${BIZ}`] = { accessToken: TOKEN };
  db[`bizTokens/${OTHER}`] = { accessToken: T2 };
  db[`businesses/${BIZ}`] = { status: 'approved', name: 'N.r.g gas', ownerFirst: 'נריה', inReview: true, inReviewReasons: ['cover'], ...biz };
  db[`businesses/${OTHER}`] = { status: 'approved', name: 'אחר' };
};
const bizPatch = () => writes.filter((w) => w[0] === 'patch' && w[1] === `businesses/${BIZ}`);

console.log('/biz-fix-done');
reset();
let r = await call({ bizId: BIZ, token: TOKEN });
check('עסק מאושר ב"צריך לתקן" → ok', r.j && r.j.ok === true && !r.j.notInFix, r.j);
check('fixSubmittedAt נכתב', bizPatch().some((w) => w[2].fixSubmittedAt instanceof Date), writes);
check('ביומן העסק: "🔁 בעל העסק שלח תיקון"', writes.some((w) => w[0] === 'create' && w[1].startsWith(`businesses/${BIZ}/activity`) && w[2].type === 'fixDone'), writes);
check('מייל התראה לרמי', mails.length === 1 && /N\.r\.g gas תיקן/.test(mails[0].subject), mails.map((m) => m.subject));

reset({ status: 'pending', fixHidden: true });
r = await call({ bizId: BIZ, token: TOKEN });
check('עסק שהוסתר (pending) – גם עובד', r.j && r.j.ok === true && bizPatch().length === 1, r.j);

reset({ inReview: false });
r = await call({ bizId: BIZ, token: TOKEN });
check('עסק שלא ב"צריך לתקן" → notInFix, בלי כתיבה ובלי מייל', r.j && r.j.notInFix === true && !writes.length && !mails.length, r.j);

reset({ status: 'rejected' });
r = await call({ bizId: BIZ, token: TOKEN });
check('עסק שנדחה (inReview נשאר בטעות) → notInFix', r.j && r.j.notInFix === true && !writes.length, r.j);

reset();
r = await call({ bizId: BIZ, token: T2 });
check('טוקן של עסק אחר → invalid', r.j && r.j.error === 'invalid' && !writes.length, r.j);
r = await call({ bizId: 'short', token: TOKEN });
check('bizId לא תקין → invalid', r.j && r.j.error === 'invalid', r.j);

console.log('\nסריקת בקשות השינוי');
reset({ inReview: false, pendingChanges: { phone: '052', coverPhotoThumb: 'x' }, pendingChangesAt: new Date(Date.now() - 2 * 60 * 1000) });
let s = await runBizRequestAlerts(env, 'fake');
check('בקשה חדשה → התראה אחת', s.sent === 1 && mails.length === 1 && /ביקש שינויים/.test(mails[0].subject), { s, m: mails.map((m) => m.subject) });
check('adminAlertedChangesAt נכתב', bizPatch().some((w) => w[2].adminAlertedChangesAt instanceof Date), writes);
check('שדה-לוויין (Thumb) לא מופיע ברשימת השדות', /phone/.test(JSON.stringify(mails[0])) && !/coverPhotoThumb/.test(JSON.stringify(mails[0])), mails[0]);
s = await runBizRequestAlerts(env, 'fake');
check('סריקה שנייה – בלי התראה כפולה', s.sent === 0 && mails.length === 1, s);
db[`businesses/${BIZ}`].pendingChangesAt = new Date();
s = await runBizRequestAlerts(env, 'fake');
check('שמירה נוספת בתוך רבע שעה – שקט', s.sent === 0, s);
db[`businesses/${BIZ}`].adminAlertedChangesAt = new Date(Date.now() - 20 * 60 * 1000);
db[`businesses/${BIZ}`].pendingChangesAt = new Date(Date.now() - 60 * 1000);
s = await runBizRequestAlerts(env, 'fake');
check('אחרי רבע שעה – בקשה חדשה מתריעה שוב', s.sent === 1, s);
reset({ inReview: false, pendingChanges: { phone: '052' }, pendingChangesAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
s = await runBizRequestAlerts(env, 'fake');
check('בקשה ישנה (לפני שעתיים) – לא מתפרצת בפריסה', s.sent === 0 && !mails.length, s);

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
