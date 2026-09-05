// ── §415 — מה באמת שמור ב-settings/messageTemplates ────────────────────────────────────────
// קריאה בלבד. 🔑 **השאלה שזה עונה עליה:** האם אפשר להוריד את הקוד למשני בגוף המכתב מהקוד
// שלנו, או שזו תבנית שהמשתמש ערך ידנית — ואז רק הוא יכול לגעת בה (`tpl.body` דורס את גוף
// המכתב במלואו, ר' ההערה ב-worker/src/brevo.js).
// הרצה: node scratch_dump_mail_templates.js
const fs = require('fs'), crypto = require('crypto');
const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const API = `https://firestore.googleapis.com/v1/projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }) });
  const j = await r.json(); if (!j.access_token) throw new Error(JSON.stringify(j)); return j.access_token;
}

(async () => {
  const token = await getToken();
  const j = await (await fetch(`${API}/settings/messageTemplates`, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (j.error) { console.log('שגיאה:', j.error.message); return; }
  const f = j.fields || {};
  const keys = Object.keys(f).sort();
  console.log(`\n══ settings/messageTemplates — ${keys.length} שדות ══\n`);
  for (const k of keys) {
    const v = f[k].stringValue;
    if (v == null) { console.log(`${k}: (לא מחרוזת)`); continue; }
    console.log(`── ${k}  [${v.length} תווים]`);
    if (/Body$/i.test(k)) console.log(v.split('\n').map(l => '   ' + l).join('\n') + '\n');
    else console.log('   ' + v + '\n');
  }
})();
