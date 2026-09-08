// ── אבחון §431: "אין אופציה ללחוץ על הלב" ────────────────────────────────────────────
// קריאה בלבד. מאתר חבר לפי טלפון, ומדפיס את מה שקובע אם לחיצת-לב תצליח:
//  - status (רק approved מקבל custom token מהוורקר → request.auth != null)
//  - האם קיים משתמש ב-Firebase Auth עם ה-uid הזה (isSignedInMember דורש members/{uid})
//  - כמה לבבות כבר יש לו בפועל (likedBy ברחבי businesses)
// הרצה: node scratch_diag_heart_member.js 0522918655

const fs = require('fs');
const crypto = require('crypto');

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function getToken(scope) {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: KEY.client_email, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
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
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {}, t: d.updateTime });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

const S = (f, k) => (f[k] && (f[k].stringValue ?? f[k].integerValue ?? f[k].timestampValue)) || '';
const B = (f, k) => (f[k] ? f[k].booleanValue : undefined);
const digits = (s) => String(s || '').replace(/[^0-9]/g, '');

(async () => {
  const needle = digits(process.argv[2] || '0522918655');
  const token = await getToken('https://www.googleapis.com/auth/datastore');
  const members = await listAll(token, 'members');
  console.log('סה"כ חברים:', members.length);

  const hits = members.filter(m => {
    const p = digits(S(m.f, 'phone'));
    return p && (p.endsWith(needle.slice(-9)) || needle.endsWith(p.slice(-9)));
  });
  if (!hits.length) { console.log('❌ לא נמצא חבר עם הטלפון', needle); return; }

  const businesses = await listAll(token, 'businesses');

  for (const m of hits) {
    console.log('\n══════════════════════════════════════');
    console.log('memberId       :', m.id);
    console.log('שם             :', S(m.f, 'firstName'), S(m.f, 'lastName'), '|', S(m.f, 'fullName'));
    console.log('טלפון          :', S(m.f, 'phone'));
    console.log('מייל           :', S(m.f, 'email'));
    console.log('status         :', S(m.f, 'status'));
    console.log('isAdmin        :', B(m.f, 'isAdmin'));
    console.log('createdAt      :', S(m.f, 'createdAt'));
    console.log('lastSeenAt     :', S(m.f, 'lastSeenAt'));
    console.log('loginCode?     :', S(m.f, 'loginCode') ? 'יש' : 'אין');
    console.log('googleLinked   :', B(m.f, 'googleLinked'), '| googleEmail:', S(m.f, 'googleEmail'));
    console.log('updateTime     :', m.t);
    const liked = businesses.filter(b => (b.f.likedBy?.arrayValue?.values || []).some(v => v.stringValue === m.id));
    console.log('לבבות שנתן     :', liked.length, liked.map(b => S(b.f, 'name')).join(', '));
    console.log('כל שדות המסמך  :', Object.keys(m.f).join(', '));
  }

  // האם קיים משתמש Firebase Auth עם ה-uid הזה?
  try {
    const t2 = await getToken('https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform');
    for (const m of hits) {
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${KEY.project_id}/accounts:lookup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t2}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: [m.id] }),
      });
      const j = await r.json();
      const u = (j.users || [])[0];
      console.log('\n[Auth]', m.id, u ? `קיים · providers=${(u.providerUserInfo || []).map(p => p.providerId).join(',') || 'custom'} · lastLogin=${u.lastLoginAt ? new Date(+u.lastLoginAt).toISOString() : '?'} · lastRefresh=${u.lastRefreshAt || '?'} · disabled=${!!u.disabled}` : `❌ אין משתמש Auth (j=${JSON.stringify(j).slice(0, 200)})`);
    }
  } catch (e) { console.log('[Auth] בדיקה נכשלה:', e.message); }
})();
