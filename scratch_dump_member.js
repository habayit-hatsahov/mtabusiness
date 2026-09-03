// ── הדפסת רשומות-חבר לפי מזהה ──────────────────────────────────────────────────────────────
// קריאה בלבד. הרצה: node scratch_dump_member.js <id> [<id> …]

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

const show = (v) => v === undefined ? '(חסר)'
  : v.nullValue !== undefined ? 'null'
  : v.stringValue !== undefined ? v.stringValue
  : v.integerValue !== undefined ? v.integerValue
  : v.booleanValue !== undefined ? String(v.booleanValue)
  : v.timestampValue || JSON.stringify(v).slice(0, 120);

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.log('שימוש: node scratch_dump_member.js <id> [<id> …]'); return; }
  const token = await getToken();
  for (const id of ids) {
    const r = await fetch(`${API}/members/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) { console.log(`\n--- members/${id} — 🔴 לא קיימת`); continue; }
    const d = await r.json();
    console.log(`\n--- members/${id}  created=${d.createTime}  updated=${d.updateTime}`);
    const f = d.fields || {};
    for (const k of Object.keys(f).sort()) console.log(`    ${k}: ${show(f[k])}`);
  }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
