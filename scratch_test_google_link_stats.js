// ── בדיקת §400 — googleLinkStats על נתוני-אמת ─────────────────────────────────────────────
//
// 🔑 **הפונקציה מחולצת מ-admin-dashboard.html לפי שם ומורצת בפועל.** בדיקת-תחביר אינה
// תופסת מזהה חסר ואינה תופסת חשבון שגוי; רק הרצה מול הנתונים האמיתיים מראה אם המספר
// שיעלה למסך הוא המספר הנכון. ר' §361, §399ז.
//
// ⚠️ **המכנה של הבדיקה: הסקריפט העצמאי.** אם שתי הדרכים מסכימות, סביר שהחישוב נכון;
// אם לא — אחת מהן שגויה, וזה בדיוק מה שצריך לדעת לפני שמספר מנחה החלטת-מוצר.
//
// הרצה: node scratch_test_google_link_stats.js

const fs = require('fs');
const crypto = require('crypto');

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

// ── חילוץ לפי שם, לא לפי מספרי-שורה ולא לפי היסט קבוע ────────────────────────────────────
function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`לא נמצאה ${name}`);
  let depth = 0, end = -1;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) throw new Error(`סוגריים לא נסגרו ב-${name}`);
  return src.slice(start, end);
}

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
const D = (f, k) => f[k]?.timestampValue ? new Date(f[k].timestampValue) : null;

(async () => {
  const src = fs.readFileSync('admin-dashboard.html', 'utf8');
  const token = await getToken();
  const members = await listAll(token, 'members');

  // בונים את MOCK_FANS בדיוק בצורה ש-hydrateFan מייצר עבור השדות שהפונקציה נוגעת בהם.
  const fans = members.map(m => ({
    status: S(m.f, 'status'),
    googleEmail: S(m.f, 'googleEmail'),
    googleLinkedAt: D(m.f, 'googleLinkedAt'),
    registeredAt: D(m.f, 'submittedAt') || new Date(),
    registeredAtKnown: !!D(m.f, 'submittedAt'),
    lastSeenAt: D(m.f, 'lastSeenAt'),
  }));

  const win = (src.match(/const GOOGLE_SIGNUP_WINDOW_MS = ([^;]+);/) || [])[1];
  const fn = new Function('MOCK_FANS', 'GOOGLE_SIGNUP_WINDOW_MS',
    extract(src, 'googleLinkStats') + '\nreturn googleLinkStats();');
  const g = fn(fans, eval(win));

  console.log('§400 — googleLinkStats על נתוני-אמת\n');
  console.log(JSON.stringify(g, null, 2).replace(/[{}"]/g, '').split('\n').filter(l => l.trim()).join('\n'));

  // ── אותו חישוב, דרך שנייה ובלתי-תלויה ──────────────────────────────────────────────
  const approved = members.filter(m => S(m.f, 'status') === 'approved');
  const linked = members.filter(m => S(m.f, 'googleEmail'));
  const linkedApproved = approved.filter(m => S(m.f, 'googleEmail')).length;

  console.log('\nהשוואה מול חישוב עצמאי:');
  ok('מספר המאושרים', g.approved === approved.length, `${g.approved} מול ${approved.length}`);
  ok('מספר המקושרים', g.linked === linked.length, `${g.linked} מול ${linked.length}`);
  ok('מקושרים מבין המאושרים', g.linkedApproved === linkedApproved, `${g.linkedApproved} מול ${linkedApproved}`);
  ok('הסף = חצי מהמאושרים', g.half === Math.ceil(approved.length / 2), `${g.half}`);
  ok('דגל החצייה עקבי', g.crossed === (g.linkedApproved >= g.half));

  console.log('\nשפיות על החלוקה לנתיבים:');
  ok('שני הנתיבים מסתכמים לסה"כ', g.viaSignup + g.viaLater === g.linked,
     `${g.viaSignup}+${g.viaLater} ≠ ${g.linked}`);
  ok('הנחשפים אינם עולים על המאושרים', g.exposed <= g.approved);
  ok('מקושרים-מבין-הנחשפים אינם עולים על הנחשפים', g.exposedLinked <= g.exposed);
  ok('מי שנרשם מאז אינו עולה על כלל הרשומות', g.sinceSignup <= members.length);
  // 🔑 המבחן שהכי חשוב: השורה שהוסיף §399י חייבת להראות **שיעור שונה** מהשורה הראשונה.
  // אם שתיהן שוות, המכנה השני לא באמת מסנן — כלומר הסקשן חזר בדיוק לטעות שהוא תיקן.
  const rawPct = g.linkedApproved / g.approved;
  const expPct = g.exposed ? g.exposedLinked / g.exposed : 0;
  ok('שיעור-הנחשפים גבוה מהשיעור הגולמי', expPct > rawPct,
     `${(expPct * 100).toFixed(1)}% מול ${(rawPct * 100).toFixed(1)}% — אם הם שווים, המכנה לא מסנן`);

  console.log(`\n${fail ? '❌' : '✅'} ${pass} עוברות, ${fail} נכשלות`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
