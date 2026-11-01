// §699 — השלמת usageDaily לימים שעברו, באותו חישוב של הוורקר (usage-agg.js).
// הרצה: node scratch_usage_daily_backfill.mjs [--write] [מ-יום=2026-10-11]
// בלי --write: מחשב ושומר מקומית ל-usage-backfill.json בלבד (בדיקה). עם --write: כותב לפרודקשן.
// ⚠️ שאילתה לכל סוג אירוע ולכל יום (אינדקס type+createdAt) – בלי תקרת 30,000 של הוורקר,
// כי יום ההשקה עבר אותה.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { aggregateUsageDay, USAGE_TYPES } from './usage-agg.js';
import { ilDayKey, ilDayRange } from './platform-agg.js';
import { firestoreRunQuery, firestorePatch } from './worker/src/firestore.js';

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
const token = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }) })).json()).access_token;
const env = { FIREBASE_PROJECT_ID: KEY.project_id };
const API = `https://firestore.googleapis.com/v1/projects/${KEY.project_id}/databases/(default)/documents:runQuery`;
const val = (v) => v == null ? null : 'stringValue' in v ? v.stringValue : 'timestampValue' in v ? v.timestampValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : null;

async function eventsOf(key, type) {
  const [start, end] = ilDayRange(key);
  const out = []; let cursor = null;
  for (;;) {
    const r = await (await fetch(API, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'type' }, op: 'EQUAL', value: { stringValue: type } } },
        { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: start.toISOString() } } },
        { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'LESS_THAN', value: { timestampValue: (cursor || end).toISOString() } } }] } },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 5000 } }) })).json();
    if (r[0] && r[0].error) throw new Error(r[0].error.message);
    const docs = r.filter(x => x.document).map(x => x.document.fields || {});
    for (const f of docs) out.push({ type: val(f.type), path: val(f.path), blockId: val(f.blockId), memberId: val(f.memberId), sessionId: val(f.sessionId), device: val(f.device), channel: val(f.channel), at: new Date(val(f.createdAt)) });
    if (docs.length < 5000) return out;
    // האינדקס הקיים הוא type + createdAt **יורד** – מדפדפים אחורה. אירועים עם אותו createdAt בגבול הדף – נדיר
    cursor = new Date(val(docs[docs.length - 1].createdAt));
  }
}

const write = process.argv.includes('--write');
const from = process.argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || '2026-10-11';
const admins = (await firestoreRunQuery(env, token, 'members', 'isAdmin', true, 50)).map(m => m.id);
const today = ilDayKey(new Date());
const out = {};
for (let t = ilDayRange(from)[0].getTime() + 12 * 3600e3; ilDayKey(new Date(t)) < today; t += 864e5) {
  const key = ilDayKey(new Date(t));
  let evs = [];
  for (const ty of USAGE_TYPES) evs = evs.concat(await eventsOf(key, ty));
  const agg = aggregateUsageDay(evs, admins);
  out[key] = agg;
  console.log(key, 'events', evs.length, 'first', agg.appFirst.length, 'active', agg.appActive.length, 'members', agg.memActive.length, 'bytes', JSON.stringify(agg).length);
  if (write) await firestorePatch(env, token, `usageDaily/${key}`, { ...agg, day: key, computedAt: new Date() });
}
fs.writeFileSync('C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-----------/dca60afe-3006-42bd-a1e0-4ee22b1cf57e/scratchpad/usage-backfill.json', JSON.stringify(out));
console.log(write ? 'נכתב לפרודקשן' : 'בדיקה בלבד – לא נכתב');
