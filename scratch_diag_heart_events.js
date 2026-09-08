// ── אבחון §431: מה יקיר הראל עשה בפועל באתר ──────────────────────────────────────────
// קריאה בלבד. שולף את כל האירועים של memberId מסוים, ממוין לפי זמן, ומדגיש 'heart'.
// הרצה: node scratch_diag_heart_events.js 4SfxMCljhYKMLjsk2SOL

const fs = require('fs');
const crypto = require('crypto');

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
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

const S = (f, k) => (f && f[k] && (f[k].stringValue ?? f[k].timestampValue)) || '';

(async () => {
  const memberId = process.argv[2] || '4SfxMCljhYKMLjsk2SOL';
  const token = await getToken();
  const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'events' }],
        where: { fieldFilter: { field: { fieldPath: 'memberId' }, op: 'EQUAL', value: { stringValue: memberId } } },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 300,
      },
    }),
  });
  const j = await r.json();
  if (j.error) { console.log('ERROR', JSON.stringify(j.error).slice(0, 300)); return; }
  const rows = (Array.isArray(j) ? j : []).filter(x => x.document).map(x => x.document.fields || {});
  console.log('אירועים שנמצאו:', rows.length);
  const byType = {};
  for (const f of rows) byType[S(f, 'type')] = (byType[S(f, 'type')] || 0) + 1;
  console.log('לפי סוג:', JSON.stringify(byType));
  console.log('\nזמן                       | סוג        | מכשיר   | נתיב       | bizId');
  for (const f of rows.slice(0, 120)) {
    console.log([S(f, 'createdAt'), (S(f, 'type') + '          ').slice(0, 10), (S(f, 'device') + '       ').slice(0, 7), (S(f, 'path') + '          ').slice(0, 10), S(f, 'bizId')].join(' | '));
  }
})();
