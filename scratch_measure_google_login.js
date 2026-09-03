// ── כמה חברים בכלל חיברו Google, וכמה נכשלו בכפתור הכניסה ────────────────────────────────
// קריאה בלבד. השאלה: הכפתור "המשך עם Google" מוצג לכולם במסך הכניסה, אבל עובד רק למי
// שכבר חיבר — כמה זה בפועל, וכמה אנשים כבר נחתו על ההודעה "עדיין לא מחובר אצלנו".
//
// הרצה: node scratch_measure_google_login.js

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
  const token = await getToken();

  // ── 1. חברים ─────────────────────────────────────────────────────────────────────────
  const members = await listAll(token, 'members');
  const approved = members.filter(m => S(m.f, 'status') === 'approved');
  const linked = approved.filter(m => S(m.f, 'googleEmail'));
  console.log('── חברים ─────────────────────────────────────────');
  console.log(`סה"כ רשומות: ${members.length}   מאושרים: ${approved.length}`);
  console.log(`חיברו חשבון Google: ${linked.length} מתוך ${approved.length}  (${(linked.length / approved.length * 100).toFixed(1)}%)`);
  const pct = (approved.length - linked.length) / approved.length * 100;
  console.log(`🔑 כלומר הכפתור "המשך עם Google" במסך הכניסה **ייכשל** אצל ${pct.toFixed(1)}% מהמאושרים.`);
  if (linked.length) {
    console.log('\nמי כן חיבר, ומתי:');
    for (const m of linked.sort((a, b) => (S(a.f, 'googleLinkedAt') || a.f.googleLinkedAt?.timestampValue || '').localeCompare(b.f.googleLinkedAt?.timestampValue || ''))) {
      const when = m.f.googleLinkedAt?.timestampValue || '(ללא חותם)';
      console.log(`   ${S(m.f, 'firstName')} ${S(m.f, 'lastName')} — ${S(m.f, 'googleEmail')} — ${when}`);
    }
  }

  // ── 2. אירועי כשל-כניסה ──────────────────────────────────────────────────────────────
  // ⚠️ ה-collection נסרק במלואו ולא בשאילתה לפי זמן: שם שדה-הזמן אינו ידוע מראש, ושאילתה
  // על שדה שגוי מחזירה ריק — כלומר "אין כשלים", שזו בדיוק המסקנה השגויה שאסור להסיק.
  const events = await listAll(token, 'events');
  const timeKey = ['ts', 'at', 'createdAt', 'time'].find(k => events.some(e => e.f[k]?.timestampValue));
  const fails = events.filter(e => S(e.f, 'type') === 'loginFail');
  const gFails = fails.filter(e => S(e.f, 'channel').startsWith('google:'));
  console.log('\n── אירועי כניסה ──────────────────────────────────');
  console.log(`סה"כ events: ${events.length}   שדה-זמן: ${timeKey || '(לא נמצא)'}`);
  console.log(`loginFail: ${fails.length}   מתוכם במסלול Google: ${gFails.length}`);
  const byCh = {};
  for (const e of gFails) { const c = S(e.f, 'channel'); byCh[c] = (byCh[c] || 0) + 1; }
  for (const [c, n] of Object.entries(byCh).sort((a, b) => b[1] - a[1])) console.log(`   ${c}: ${n}`);
  if (gFails.length && timeKey) {
    const ts = gFails.map(e => e.f[timeKey]?.timestampValue).filter(Boolean).sort();
    console.log(`   טווח: ${ts[0]} → ${ts[ts.length - 1]}`);
  }
  const topFails = {};
  for (const e of fails) { const c = S(e.f, 'channel'); topFails[c] = (topFails[c] || 0) + 1; }
  console.log('\nכל ערוצי הכשל, לשם השוואה:');
  for (const [c, n] of Object.entries(topFails).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${c}: ${n}`);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
