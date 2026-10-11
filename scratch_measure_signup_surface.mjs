// מדידה: מאיזה משטח (app / pwa / web) נשלחה כל הרשמה, מאז שהמשטח נכנס למדידה (§438, 16.9).
// קריאה בלבד. מצליב formSubmit ← pageView באותו sessionId (ה-channel נרשם על pageView בלבד).
// מדפיס מספרים בלבד — בלי שמות (הפלט עלול להיכנס לתיעוד, והריפו פומבי).
import fs from 'fs';
import crypto from 'crypto';

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
const token = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }) })).json()).access_token;
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const S = (f, k) => f?.[k]?.stringValue ?? f?.[k]?.timestampValue ?? '';

async function query(where, limit = 10000) {
  const r = await (await fetch(`${API}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'events' }], where, limit } }) })).json();
  if (r[0]?.error) throw new Error(r[0].error.message);
  return r.filter((x) => x.document).map((x) => x.document.fields);
}
const SINCE = process.argv[2] || '2026-09-16';
// סינון לפי type בצד הלקוח — שאילתה מורכבת (type+createdAt) דורשת אינדקס שאין.
const submits = (await query({ fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: SINCE + 'T00:00:00Z' } } })).filter((e) => S(e, 'type') === 'formSubmit');

const sessions = [...new Set(submits.map((e) => S(e, 'sessionId')))];
const chanBySession = {};
for (let i = 0; i < sessions.length; i += 30) {
  const pv = (await query({ fieldFilter: { field: { fieldPath: 'sessionId' }, op: 'IN', value: { arrayValue: { values: sessions.slice(i, i + 30).map((s) => ({ stringValue: s })) } } } })).filter((e) => S(e, 'type') === 'pageView');
  for (const e of pv) {
    const c = S(e, 'channel');
    if (c) (chanBySession[S(e, 'sessionId')] ||= new Set()).add(c);
  }
}

// רשומת החבר: שיטת הזיהוי בהרשמה (Apple / Google / ידני) — רק כשהרשומה עדיין קיימת.
const tally = {};
const rows = [];
for (const e of submits) {
  const sid = S(e, 'sessionId');
  const ch = [...(chanBySession[sid] || [])].join('+') || 'לא ידוע';
  const memberId = S(e, 'memberId');
  let method = 'נמחק';
  if (memberId) {
    const m = await (await fetch(`${API}/members/${memberId}`, { headers: H })).json();
    if (!m.error) {
      const f = m.fields || {};
      method = S(f, 'appleSub') ? 'Apple' : (S(f, 'googleEmail') ? 'Google' : 'ידני');
    }
  }
  const block = S(e, 'blockId');
  rows.push([S(e, 'createdAt').slice(0, 10), block, ch, S(e, 'device'), method].join(' | '));
  const k = `${block} · ${ch}`;
  tally[k] = (tally[k] || 0) + 1;
}
console.log(`formSubmit מאז ${SINCE}: ${submits.length}\n`);
rows.sort().forEach((r) => console.log(r));
console.log('\nסיכום (טופס · משטח):');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
