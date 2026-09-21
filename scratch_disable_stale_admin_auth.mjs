// ══ §447ה — השבתת זהות ה-Auth של המנהל הישן ═════════════════════════════════════════════
//
// 🔴 **כותב.** נוגע ב**משתמש Auth אחד בלבד**, ורק אם המצב זהה למה שנמדד ב-§447ד.
//
// ── מה מושבת ולמה ──────────────────────────────────────────────────────────────────────
// `Uw1Caau9QFS8Voy2V6ij` היה **זהות מנהל** (`actorUid` על עריכות של חברים אחרים,
// `actorName: רמי בנטולילה`). מסמך החבר שלו נמחק — לא דרך האתר — אבל **משתמש ה-Auth שרד
// ונשאר פעיל**, עם כניסה אחרונה ב-2.9.
//
// 🔑 **ההרשאה עצמה כבר אינה קיימת, ואומתה:** `isAdmin()` ב-`firestore.rules` נשען על
// `exists(members/{uid})`, ו-`handleMemberLogin` דורש מסמך-חבר `approved`. כלומר הזהות
// הזאת אינה מנהל ואינה יכולה להיכנס. ההשבתה אינה סוגרת פרצה פתוחה — היא מסירה **זהות
// מנהל בלי בעלים**, שההרשאה שלה תחזור ברגע שייווצר מסמך באותו UID.
//
// ── ולמה להשבית ולא למחוק ──────────────────────────────────────────────────────────────
// ⚠️ מחיקת משתמש Auth אינה הפיכה, ו**משחררת את ה-UID** — כלומר תיאורטית הוא יכול להיות
// מוקצה מחדש. השבתה חוסמת את אותו דבר בדיוק, נשארת הפיכה בלחיצה, ומשאירה את ה-UID תפוס.
// זה גם מה ש-§432ח לימד: זהות ששורדת מחיקה היא **נכס** כשצריך לשחזר.
//
// ── לבטל (אם יתברר שהחשבון עדיין בשימוש) ───────────────────────────────────────────────
//   node scratch_disable_stale_admin_auth.mjs --enable --apply
//
// הרצה:  node scratch_disable_stale_admin_auth.mjs            (יבש)
//         node scratch_disable_stale_admin_auth.mjs --apply    (משבית)

import fs from 'fs';
import crypto from 'crypto';

const TARGET = 'Uw1Caau9QFS8Voy2V6ij';
const APPLY = process.argv.includes('--apply');
const ENABLE = process.argv.includes('--enable');   // ביטול ההשבתה

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function token(scope) {
  const n = Math.floor(Date.now() / 1e3);
  const claim = { iss: KEY.client_email, scope, aud: 'https://oauth2.googleapis.com/token', exp: n + 3600, iat: n };
  const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }),
  })).json();
  return j.access_token;
}

const tFs = await token('https://www.googleapis.com/auth/datastore');
const tId = await token('https://www.googleapis.com/auth/cloud-platform');
const IDP = `https://identitytoolkit.googleapis.com/v1/projects/${KEY.project_id}`;
const idpH = { Authorization: `Bearer ${tId}`, 'Content-Type': 'application/json' };

const lookup = async () => (await (await fetch(`${IDP}/accounts:lookup`, {
  method: 'POST', headers: idpH, body: JSON.stringify({ localId: [TARGET] }),
})).json());

const fsGet = async (p) => (await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}/${p}`,
  { headers: { Authorization: `Bearer ${tFs}` } })).json());

console.log(APPLY ? `🔴 מצב ביצוע — ${ENABLE ? 'הפעלה מחדש' : 'השבתה'}\n` : '🧪 הרצה יבשה. --apply לביצוע\n');

// ── התנאים. כולם נבדקים חי, ברגע הפעולה ────────────────────────────────────────────────
const before = await lookup();
const u = (before.users || [])[0];
if (!u) { console.log('⛔ אין משתמש Auth עם ה-UID הזה — אין מה לעשות.'); process.exit(0); }
const member = await fsGet(`members/${TARGET}`);

console.log('══ המצב לפני ══════════════════════════════════════════');
console.log(`  UID         : ${TARGET}`);
console.log(`  מושבת       : ${u.disabled ? 'כן' : 'לא'}`);
console.log(`  כניסה אחרונה: ${u.lastLoginAt ? new Date(+u.lastLoginAt).toISOString().slice(0, 19) : '—'}`);
console.log(`  members/{uid}: ${member.error ? 'אינו קיים ✅' : '🔴 קיים!'}`);

if (!ENABLE) {
  // 🔑 **התנאי החוסם:** אם מסמך החבר קיים — החשבון חי ומשמש מישהו, וההנחה של §447ד נפלה.
  if (!member.error) { console.log('\n⛔ מסמך החבר קיים — החשבון בשימוש. לא נוגעים.'); process.exit(1); }
  if (u.disabled) { console.log('\n✅ כבר מושבת. אין מה לעשות.'); process.exit(0); }
}

const want = !ENABLE;
console.log(`\n══ הפעולה ═════════════════════════════════════════════`);
console.log(`  disableUser: ${u.disabled} → ${want}`);
if (!APPLY) { console.log('\n🧪 הרצה יבשה הסתיימה. שום דבר לא השתנה.'); process.exit(0); }

const res = await (await fetch(`${IDP}/accounts:update`, {
  method: 'POST', headers: idpH,
  body: JSON.stringify({ localId: TARGET, disableUser: want }),
})).json();
if (res.error) { console.log(`\n⛔ נכשל: ${res.error.message}`); process.exit(1); }

// ── אימות אחרי, מקריאה חוזרת ולא מהתשובה ───────────────────────────────────────────────
// 🔑 תשובת ה-API היא מה שהשרת **אמר**; קריאה חוזרת היא מה שבאמת נשמר. אותו עיקרון
// של §392 — מדידה חיה גוברת על דיווח.
const after = ((await lookup()).users || [])[0];
console.log('\n══ אימות (קריאה חוזרת) ════════════════════════════════');
console.log(`  מושבת: ${after.disabled ? '✅ כן' : '🔴 לא'}`);
console.log(`  ${after.disabled === want ? '✅ המצב תואם למבוקש' : '🔴 לא תואם!'}`);
console.log(`\n  לביטול: node scratch_disable_stale_admin_auth.mjs --enable --apply`);
