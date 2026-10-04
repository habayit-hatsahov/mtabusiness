// §460ח — בדיקת /admin-apple-revoke מול ה-Worker האמיתי (default export), עם רשת מדומה.
// הרצה: node --conditions=workerd scratch_test_admin_apple_revoke.mjs
// מכסה: not_admin · bad_log_id · log_not_found · not_member_deletion · not_apple ·
// member_still_exists · kept_other_member · no_token · revoked (ומחיקת appleTokens) ·
// ולכל ענף — שהתוצאה נרשמת ב-adminAppleRevoke על רשומת היומן.
import { generateKeyPairSync } from 'node:crypto';
import worker from './src/index.js';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const env = {
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k',
  APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K',
  APPLE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  APPLE_CLIENT_IDS: 'il.co.yellowzone.app',
  ALLOWED_ORIGINS: '*',
  RATE_LIMIT_KV: { get: async () => ({ token: 'AT', exp: Date.now() / 1000 + 3600 }), put: async () => {} },
};

let db, calls;
const sv = (v) => typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sv(x)])) } } : { nullValue: null };
const docJson = (path, obj) => ({ name: 'projects/p/databases/(default)/documents/' + path,
  fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sv(v)])) });

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = init.method || 'GET';
  calls.push(method + ' ' + url.replace(/\?.*/, ''));
  const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('accounts:lookup')) {
    const { idToken } = JSON.parse(init.body);
    return idToken === 'bad' ? res(400, {}) : res(200, { users: [{ localId: idToken }] });
  }
  if (url.startsWith('https://appleid.apple.com/auth/revoke')) return res(200, {});
  if (url.startsWith('https://appleid.apple.com/auth/token')) return res(400, { error: 'invalid_grant' });
  const m = url.match(/documents\/(.+?)(\?|$)/);
  if (url.endsWith(':runQuery')) {
    const q = JSON.parse(init.body).structuredQuery;
    const f = q.where.fieldFilter; const want = f.value.stringValue;
    const coll = q.from[0].collectionId;
    const hits = Object.entries(db).filter(([p, d]) => p.startsWith(coll + '/') && d[f.field.fieldPath] === want);
    return res(200, hits.length ? hits.map(([p, d]) => ({ document: docJson(p, d) })) : [{}]);
  }
  if (m) {
    const path = decodeURIComponent(m[1]);
    if (method === 'GET') return db[path] ? res(200, docJson(path, db[path])) : res(404, {});
    if (method === 'DELETE') { delete db[path]; return res(200, {}); }
    if (method === 'PATCH') {
      const body = JSON.parse(init.body).fields;
      db[path] = Object.assign(db[path] || {}, Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v.stringValue])));
      return res(200, docJson(path, db[path]));
    }
  }
  throw new Error('unmocked: ' + method + ' ' + url);
};

const call = async (body) => {
  const r = await worker.fetch(new Request('https://api.yellowzone.co.il/admin-apple-revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il' }, body: JSON.stringify(body),
  }), env, { waitUntil() {} });
  return r.json();
};

const base = () => ({
  'members/ADMIN': { isAdmin: true },
  'members/USER': { firstName: 'x' },
  'deletionLog/L1': { collectionName: 'members', docId: 'GONE', data: { appleSub: 'S1' } },
  'appleTokens/S1': { refreshToken: 'R', clientId: 'il.co.yellowzone.app' },
});

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('❌', name, extra ?? ''); } };

async function scenario(name, setup, body, expect, after) {
  db = base(); calls = []; setup(db);
  const out = await call(body);
  const got = out.error || out.result;
  check(name + ' → ' + expect, got === expect, JSON.stringify(out));
  if (after) after(out);
}

await scenario('לא מנהל', () => {}, { idToken: 'USER', logId: 'L1' }, 'not_admin',
  () => check('לא מנהל: אפל לא נקראה', !calls.some(c => c.includes('appleid'))));
await scenario('טוקן פגום', () => {}, { idToken: 'bad', logId: 'L1' }, 'not_admin');
await scenario('logId עם /', () => {}, { idToken: 'ADMIN', logId: '../members/X' }, 'bad_log_id');
await scenario('יומן לא קיים', () => {}, { idToken: 'ADMIN', logId: 'NOPE' }, 'log_not_found');
await scenario('מחיקת עסק', (d) => { d['deletionLog/L1'].collectionName = 'businesses'; }, { idToken: 'ADMIN', logId: 'L1' }, 'not_member_deletion');
await scenario('בלי Apple', (d) => { d['deletionLog/L1'].data = { firstName: 'a' }; }, { idToken: 'ADMIN', logId: 'L1' }, 'not_apple',
  () => check('בלי Apple: נרשם ביומן', db['deletionLog/L1'].adminAppleRevoke === 'not_apple'));
await scenario('הרשומה עדיין קיימת', (d) => { d['members/GONE'] = { appleSub: 'S1' }; }, { idToken: 'ADMIN', logId: 'L1' }, 'member_still_exists',
  () => check('עדיין קיימת: הטוקן נשאר', !!db['appleTokens/S1']));
await scenario('כפולה — רשומה אחרת עם אותו sub', (d) => { d['members/REAL'] = { appleSub: 'S1' }; }, { idToken: 'ADMIN', logId: 'L1' }, 'kept_other_member',
  () => { check('כפולה: אפל לא נקראה', !calls.some(c => c.includes('appleid'))); check('כפולה: הטוקן נשאר', !!db['appleTokens/S1']);
          check('כפולה: נרשם ביומן', db['deletionLog/L1'].adminAppleRevoke === 'kept_other_member'); });
await scenario('אין טוקן', (d) => { delete d['appleTokens/S1']; }, { idToken: 'ADMIN', logId: 'L1' }, 'no_token');
await scenario('ביטול', () => {}, { idToken: 'ADMIN', logId: 'L1' }, 'revoked',
  () => { check('ביטול: revoke נקרא', calls.some(c => c.includes('auth/revoke')));
          check('ביטול: אומת ב-refresh', calls.some(c => c.includes('auth/token')));
          check('ביטול: appleTokens נמחק', !db['appleTokens/S1']);
          check('ביטול: נרשם ביומן', db['deletionLog/L1'].adminAppleRevoke === 'revoked'); });

console.log(`${pass}/${pass + fail} עברו`);
process.exit(fail ? 1 : 0);
