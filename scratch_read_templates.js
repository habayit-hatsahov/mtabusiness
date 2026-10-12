// §499 — קריאה בלבד: כל מסמכי settings עם טקסט שנשלח/מוצג למשתמשים (תבניות מייל, וואטסאפ, הצלחה).
// מדפיס כל שדה-טקסט במלואו, כדי לסרוק "באתר / welcome.html / home.html / להרשמה".
// הרצה: node scratch_read_templates.js
const fs = require('fs');
const crypto = require('crypto');

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const API = `https://firestore.googleapis.com/v1/projects/${KEY.project_id}/databases/(default)/documents`;
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

function flat(v, path, out) {
  if (!v) return;
  if ('stringValue' in v) out.push([path, v.stringValue]);
  else if ('mapValue' in v) for (const [k, x] of Object.entries(v.mapValue.fields || {})) flat(x, path + '.' + k, out);
  else if ('arrayValue' in v) (v.arrayValue.values || []).forEach((x, i) => flat(x, path + '[' + i + ']', out));
}

(async () => {
  const token = await getToken();
  const j = await (await fetch(`${API}/settings?pageSize=100`, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (j.error) throw new Error(j.error.message);
  const only = process.argv[2];
  for (const d of j.documents || []) {
    const id = d.name.split('/').pop();
    if (only && id !== only) continue;
    const out = [];
    for (const [k, v] of Object.entries(d.fields || {})) flat(v, k, out);
    const texts = out.filter(([, s]) => /[\u0590-\u05FF]/.test(s) && s.length > 20);
    if (!only) { console.log(id, '—', texts.length, 'Hebrew text fields'); continue; }
    for (const [p, s] of texts) console.log('[' + p + ']\n' + s + '\n');
  }
})().catch(e => { console.error(e.message); process.exit(1); });
