// ── §415 — למי הכפתור של Google בכלל *יכול* לעבוד היום ─────────────────────────────────────
// קריאה בלבד. השאלה שהמשתמש שאל: לשים את גוגל **מעל** הקוד במסך הכניסה, ולהחביא את הקוד
// מאחורי לחיצה. 🔑 **זו לא שאלת עיצוב אלא שאלת מכנה:** גוגל עובדת רק כשהמייל שעל הרשומה
// הוא חשבון Google. אם רוב הכתובות אינן כאלה — "גוגל ראשון" מציג לרוב האנשים מסלול שנכשל
// אצלם, וזה בדיוק הכשל של §399 שבגללו הסדר הנוכחי נקבע.
//
// ⚠️ **אומדן-רצפה, ואסור להציג אותו כמדויק:** gmail.com/googlemail.com ודאי-כן. אבל גם
// כתובת בדומיין פרטי יכולה להיות Google Workspace, ואין שום דרך לדעת זאת מהצד שלנו בלי
// לשאול את גוגל על כל כתובת. לכן "כן" הוא רצפה, ו"אולי" הוא הקבוצה שאי אפשר להכריע.
// הרצה: node scratch_measure_google_eligibility.js
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
async function listAll(token, coll) {
  const out = []; let pt = '';
  do {
    const j = await (await fetch(`${API}/${coll}?pageSize=300${pt ? '&pageToken=' + pt : ''}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j.error) throw new Error(j.error.message);
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {} });
    pt = j.nextPageToken || '';
  } while (pt);
  return out;
}
const S = (f, k) => f[k]?.stringValue || '';
const T = (f, k) => f[k]?.timestampValue || '';
const B = (f, k) => f[k]?.booleanValue === true;
const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';

const SURE = new Set(['gmail.com', 'googlemail.com']);
// דומיינים שידוע שאינם Google — כאן הכפתור **לא** יעבוד, והקוד הוא הדרך היחידה.
const NOT_GOOGLE = new Set(['walla.com', 'walla.co.il', 'hotmail.com', 'hotmail.co.il', 'outlook.com',
  'outlook.co.il', 'live.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mail.ru',
  'nana.co.il', 'nana10.co.il', '013.net', '013net.net', 'bezeqint.net', 'netvision.net.il', 'zahav.net.il']);

(async () => {
  const token = await getToken();
  const members = await listAll(token, 'members');
  const approved = members.filter(m => S(m.f, 'status') === 'approved');

  const dom = (m) => (S(m.f, 'email').split('@')[1] || '').toLowerCase();
  const sure = approved.filter(m => SURE.has(dom(m)));
  const no = approved.filter(m => NOT_GOOGLE.has(dom(m)));
  const maybe = approved.filter(m => { const d = dom(m); return d && !SURE.has(d) && !NOT_GOOGLE.has(d); });
  const noEmail = approved.filter(m => !dom(m));
  const linked = approved.filter(m => S(m.f, 'googleEmail'));
  const never = approved.filter(m => !T(m.f, 'lastSeenAt'));
  const owners = approved.filter(m => B(m.f, 'isBusinessOwner'));

  console.log(`\n══ ${approved.length} חברים מאושרים ══\n`);
  console.log(`כבר חיברו חשבון Google:      ${linked.length}  (${pct(linked.length, approved.length)})`);
  console.log(`מעולם לא נכנסו:              ${never.length}  (${pct(never.length, approved.length)})`);
  console.log(`בעלי עסק מתוכם:              ${owners.length}\n`);
  console.log(`── לפי דומיין המייל (=האם הכפתור יכול לעבוד להם) ──`);
  console.log(`Gmail — יעבוד בוודאות:        ${sure.length}  (${pct(sure.length, approved.length)})`);
  console.log(`דומיין אחר — אי אפשר לדעת:    ${maybe.length}  (${pct(maybe.length, approved.length)})`);
  console.log(`ידוע שאינו Google:            ${no.length}  (${pct(no.length, approved.length)})`);
  console.log(`בלי מייל בכלל:                ${noEmail.length}`);

  const cnt = {};
  approved.forEach(m => { const d = dom(m); if (d && !SURE.has(d)) cnt[d] = (cnt[d] || 0) + 1; });
  console.log(`\n── הדומיינים הלא-Gmail הנפוצים ──`);
  Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([d, c]) => console.log(`  ${String(c).padStart(3)}  ${d}${NOT_GOOGLE.has(d) ? '  <- ידוע שאינו Google' : ''}`));

  const target = never.filter(m => SURE.has(dom(m)) && !S(m.f, 'googleEmail'));
  console.log(`\nמעולם לא נכנסו + Gmail + לא מקושרים = ${target.length} אנשים שהכפתור פותר להם מיד.`);
})();
