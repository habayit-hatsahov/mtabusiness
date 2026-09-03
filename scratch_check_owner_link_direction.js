// ── §397ב בפרודקשן: כמה מרשומות-הבעלים באמת מחזיקות linkedBusinessId ──────────────────────
// קריאה בלבד.
//
// §396 מדד כיוון אחד — `businesses.ownerMemberId` — ומצא 58/58 שלם. §397 קידד מול הכיוון
// **השני** (`members.linkedBusinessId`) בלי שאיש מדד אותו, ו-§397ב הוסיף נפילה-לאחור לשאילתה
// על businesses. 🔑 **השאלה שנשארה פתוחה: כמה בעלי-עסק נשענים על הנפילה-לאחור בפועל.**
// אם התשובה גדולה, הנפילה-לאחור אינה מקרה-קצה אלא המסלול הראשי — ואז היא חייבת בדיקה
// באותה רמה, לא בדיקה של "רק אם".
//
// הרצה: node scratch_check_owner_link_direction.js

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
  const [biz, members] = await Promise.all([listAll(token, 'businesses'), listAll(token, 'members')]);
  const byId = Object.fromEntries(members.map(m => [m.id, m]));
  const approved = biz.filter(b => S(b.f, 'status') === 'approved');

  console.log(`עסקים מאושרים: ${approved.length}   רשומות-חבר: ${members.length}\n`);

  const rows = { ok: [], noLink: [], wrongLink: [], noMember: [], noOwnerId: [] };
  for (const b of approved) {
    const oid = S(b.f, 'ownerMemberId');
    const label = `${S(b.f, 'name')} (businesses/${b.id})`;
    if (!oid) { rows.noOwnerId.push(label); continue; }
    const m = byId[oid];
    if (!m) { rows.noMember.push(`${label} → members/${oid} אינה קיימת`); continue; }
    const link = S(m.f, 'linkedBusinessId');
    const who = `${S(m.f, 'firstName')} ${S(m.f, 'lastName')}`.trim();
    if (!link) rows.noLink.push(`${label} → ${who} — אין linkedBusinessId`);
    // ⚠️ קישור **שגוי** מסוכן יותר מקישור חסר: חסר נופל לשאילתה ומתקן את עצמו, ושגוי
    // פותח בשקט את הדשבורד של עסק אחר.
    else if (link !== b.id) rows.wrongLink.push(`🔴 ${label} → ${who} — linkedBusinessId מצביע ל-${link}`);
    else rows.ok.push(label);
  }

  const n = approved.length;
  const pct = (x) => n ? ` (${(x / n * 100).toFixed(1)}%)` : '';
  console.log(`✅ קישור דו-כיווני תקין:            ${rows.ok.length}${pct(rows.ok.length)}`);
  console.log(`⚠️  אין linkedBusinessId — נשען על הנפילה-לאחור של §397ב: ${rows.noLink.length}${pct(rows.noLink.length)}`);
  console.log(`🔴 linkedBusinessId מצביע לעסק אחר: ${rows.wrongLink.length}`);
  console.log(`🔴 ownerMemberId מצביע לרשומה שאינה קיימת: ${rows.noMember.length}`);
  console.log(`⚠️  אין ownerMemberId בכלל:          ${rows.noOwnerId.length}`);

  for (const [title, list] of [['🔴 קישור שגוי', rows.wrongLink], ['🔴 רשומה חסרה', rows.noMember], ['⚠️ בלי ownerMemberId', rows.noOwnerId], ['⚠️ בלי linkedBusinessId', rows.noLink]]) {
    if (!list.length) continue;
    console.log(`\n── ${title} (${list.length}) ──`);
    for (const s of list.slice(0, 40)) console.log('   ' + s);
    if (list.length > 40) console.log(`   … ועוד ${list.length - 40}`);
  }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
