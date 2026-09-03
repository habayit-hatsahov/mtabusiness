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

(async () => {
  const needle = (process.argv[2] || '').trim();
  if (!needle) { console.log('שימוש: node scratch_find_member.js "טקסט"'); return; }
  const token = await getToken();
  const members = await listAll(token, 'members');
  const hits = members.filter(m => JSON.stringify(m.f).includes(needle));
  console.log(`"${needle}" — ${hits.length} התאמות מתוך ${members.length} רשומות\n`);
  for (const m of hits) {
    const g = S(m.f, 'googleEmail');
    console.log(`${S(m.f, 'firstName')} ${S(m.f, 'lastName')}  ·  ${S(m.f, 'status')}  ·  ${S(m.f, 'phone')}  ·  ${S(m.f, 'email')}`);
    console.log(`   חשבון Google מקושר: ${g ? '✅ ' + g : '❌ לא מקושר'}`);
    // 🔑 השאלה המעשית: לחיצה על כפתור גוגל עם החשבון הזה — מה תיתן?
    console.log(`   → לחיצה עם חשבון ה-Google שלו תיתן: ${g ? '🔴 כניסה מוצלחת לחשבון שלו (לא מתאים לבדיקה)' : '✅ ההודעה google_not_linked (בדיוק מה שרוצים)'}`);
    console.log(`   members/${m.id}\n`);
  }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
