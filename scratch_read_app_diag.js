// ── חיפוש רשומת-חבר לפי טקסט חופשי ─────────────────────────────────────────────────────────
// קריאה בלבד. מדפיס את השדות שרלוונטיים לשאלה "האם החשבון הזה מתאים לבדיקת google_not_linked".
// הרצה: node scratch_find_member.js "רון"

const fs = require('fs');
const crypto = require('crypto');

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(JSON.stringify(j));
  return j.access_token;
}

async function listAll(token, coll) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${API}/${coll}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const j = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j.error) throw new Error(j.error.message);
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {} });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

const S = (f, k) => f[k]?.stringValue || '';

// §466 — קריאת דוחות האבחון מהאפליקציה (app-diag.js → /app-diag → appDiag). קריאה בלבד.
// הרצה: node scratch_read_app_diag.js [דקות-אחורה=30]
(async () => {
  const mins = Number(process.argv[2] || 30);
  const t = await getToken();
  const since = new Date(Date.now() - mins * 60000).toISOString();
  const body = { structuredQuery: { from: [{ collectionId: 'appDiag' }], where: { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN', value: { timestampValue: since } } }, orderBy: [{ field: { fieldPath: 'at' } }], limit: 50 } };
  const r = await (await fetch(API + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  for (const x of r) {
    if (!x.document) { if (x.error) console.log(x.error); continue; }
    const f = x.document.fields;
    console.log('──', f.at.timestampValue, f.kind.stringValue, f.sid.stringValue, '\n   ua:', (f.ua.stringValue || '').slice(0, 160));
    try { console.log(JSON.stringify(JSON.parse(f.body.stringValue), null, 1)); } catch { console.log(f.body.stringValue); }
  }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
