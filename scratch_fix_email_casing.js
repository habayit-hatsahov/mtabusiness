// ── נרמול כתובות-מייל קיימות לאותיות קטנות ────────────────────────────────────────────────────
// ר' docs/PROJECT_CONTEXT.md §221. הרצה: node scratch_fix_email_casing.js
//
// למה: webhook המסירה של Brevo ובדיקת-הכפילות משווים מול הגרסה הקטנה בשוויון מדויק. כתובת
// שנשמרה עם אות גדולה לא נמצאת — אפס נתוני מסירה/פתיחה/החזרה, ואפשרות לרשומת-חבר כפולה.
// הקוד כבר מנרמל בכל נתיבי-הכתיבה החדשים; הסקריפט הזה מטפל ברשומות שנוצרו לפני כן.
//
// סורק את *כל* העסקים והחברים (כל הסטטוסים), מדפיס מה הוא עומד לשנות, ומתקן.
// הרצה חוזרת אחרי שהכול נורמל פשוט תדפיס "אין מה לתקן".

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const KEY = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: KEY.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  };
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(KEY.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + sig,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j));
  return j.access_token;
}

// שליפת אוסף שלם בעמודים (list, לא query — אין תלות בסטטוס)
async function listAll(token, collectionId) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${API}/${collectionId}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const j = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j.error) throw new Error(j.error.message);
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), fields: d.fields || {} });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

(async () => {
  const token = await getToken();
  const [biz, members] = await Promise.all([listAll(token, 'businesses'), listAll(token, 'members')]);
  console.log(`נסרקו ${biz.length} עסקים ו-${members.length} חברים.\n`);

  const jobs = [];
  for (const b of biz) {
    const e = b.fields.ownerEmail?.stringValue || '';
    if (e && e !== e.toLowerCase()) {
      jobs.push({ path: `businesses/${b.id}`, field: 'ownerEmail', from: e, to: e.toLowerCase(), label: b.fields.name?.stringValue || b.id });
    }
  }
  for (const m of members) {
    const e = m.fields.email?.stringValue || '';
    if (e && e !== e.toLowerCase()) {
      const nm = `${m.fields.firstName?.stringValue || ''} ${m.fields.lastName?.stringValue || ''}`.trim();
      jobs.push({ path: `members/${m.id}`, field: 'email', from: e, to: e.toLowerCase(), label: nm || m.id });
    }
  }

  if (!jobs.length) { console.log('אין מה לתקן — כל הכתובות כבר באותיות קטנות.'); return; }

  console.log('לתיקון:');
  for (const j of jobs) console.log(`   ${j.path.startsWith('businesses') ? 'עסק ' : 'חבר '}${j.label}: ${j.from} → ${j.to}`);
  console.log('');

  const writes = jobs.map(j => ({
    update: { name: `${DOCS}/${j.path}`, fields: { [j.field]: { stringValue: j.to } } },
    updateMask: { fieldPaths: [j.field] },
  }));
  const resp = await fetch(`${API}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!resp.ok) { console.log(`❌ הכתיבה נכשלה — ${resp.status}: ${(await resp.text()).slice(0, 400)}`); process.exit(1); }
  console.log(`✅ ${jobs.length} כתובות נורמלו.`);
})();
