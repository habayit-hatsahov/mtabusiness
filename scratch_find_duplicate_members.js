// ── איתור רשומות-חבר כפולות ────────────────────────────────────────────────────────────────
// קריאה בלבד. נולד מ-§398: בן גולדשטיין נרשם פעמיים כי לא הצליח להיכנס. השאלה המתבקשת —
// כמה עוד כאלה יושבים במערכת בלי שאיש שם לב.
//
// 🔑 **שתי שאלות נפרדות, ולא אחת:** (1) מי מסומן `possible_duplicate` וממתין — אלה שהמנגנון
// תפס; (2) מי חולק טלפון או מייל עם רשומה אחרת **בלי** שהוא מסומן — אלה שנפלו בין הכיסאות,
// והם המסוכנים יותר, כי שתי רשומות מאושרות באותו טלפון שוברות את הכניסה.
//
// הרצה: node scratch_find_duplicate_members.js

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
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {}, created: d.createTime });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

const S = (f, k) => f[k]?.stringValue || '';
const name = (m) => `${S(m.f, 'firstName')} ${S(m.f, 'lastName')}`.trim() || '(ללא שם)';
// ⚠️ נרמול: מייל בהשוואת-אותיות-קטנות (§221), וטלפון בספרות בלבד — 052-707 ו-0527070
// הם אותו מספר, והשוואת מחרוזות גולמית הייתה מפספסת בדיוק את הכפילות שמחפשים.
const normPhone = (p) => (p || '').replace(/\D/g, '').replace(/^972/, '0');
const line = (m) => `      ${name(m)} · ${S(m.f, 'status')} · ${S(m.f, 'phone')} · ${S(m.f, 'email')} · ${m.created.slice(0, 10)} · members/${m.id}`;

(async () => {
  const token = await getToken();
  const members = await listAll(token, 'members');
  console.log(`נסרקו ${members.length} רשומות-חבר.\n`);

  // ── 1. מה שהמנגנון תפס ─────────────────────────────────────────────────────────────────
  const flagged = members.filter(m => S(m.f, 'reviewFlag'));
  console.log(`── מסומנות לבדיקה: ${flagged.length} ──`);
  for (const m of flagged) console.log(`   [${S(m.f, 'reviewFlag')}] ${line(m).trim()}`);
  if (!flagged.length) console.log('   אין.');

  // ── 2. מה שלא סומן ─────────────────────────────────────────────────────────────────────
  // 🔑 נבדק **בנפרד** לטלפון ולמייל: בני-משפחה חולקים מייל אבל לא טלפון, וזו הבחנה
  // שקובעת אם מדובר בכפילות אמיתית או בשתי רשומות לגיטימיות (§368).
  for (const [label, keyOf] of [['טלפון', m => normPhone(S(m.f, 'phone'))], ['מייל', m => S(m.f, 'email').trim().toLowerCase()]]) {
    const groups = {};
    for (const m of members) { const k = keyOf(m); if (k) (groups[k] = groups[k] || []).push(m); }
    const dups = Object.entries(groups).filter(([, v]) => v.length > 1);
    console.log(`\n── רשומות שחולקות ${label}: ${dups.length} קבוצות ──`);
    for (const [k, v] of dups) {
      const approved = v.filter(m => S(m.f, 'status') === 'approved').length;
      // ⚠️ **הכניסה עצמה אינה שבורה** — נבדק ב-`handleMemberLogin`: היא נפתרת לפי **הקוד**
      // (`memberIdFromLoginCode`) ורק אז מאמתת טלפון+סטטוס, ולכן כל קוד מוביל לרשומה שלו
      // באופן דטרמיניסטי. הניסוח הראשון כאן אמר "הכניסה שבורה" וזו הייתה קריאה שגויה.
      // 🔴 מה שכן אקראי: `handleResendCode` לוקח את **הראשונה שנמצאת** מבין המאושרות —
      // כלומר "שכחתי את הקוד" שולח את הקוד של אחת מהשתיים, בלי שליטה.
      const risk = (label === 'טלפון' && approved > 1) ? '  🔴 שתיהן מאושרות — "שכחתי את הקוד" יבחר אחת מהן שרירותית'
                 : (approved > 1) ? '  ⚠️ שתיהן מאושרות' : '';
      const sameName = new Set(v.map(m => name(m))).size === 1;
      console.log(`   ${k}  (${v.length} רשומות, ${approved} מאושרות)${risk}${sameName ? '  · אותו שם' : '  · שמות שונים'}`);
      for (const m of v) console.log(line(m));
    }
    if (!dups.length) console.log('   אין.');
  }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
