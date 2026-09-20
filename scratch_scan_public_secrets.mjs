// ── סריקה: מה מתוך הנתונים החיים מופיע בקובץ שמוגש פומבית ────────────────────────────────
// 🔑 **הרקע (§432ג):** `docs/PROJECT_CONTEXT.md` נכתב כיומן פיתוח פנימי, אבל GitHub Pages
// מגיש את **כל** הריפו — כלומר הוא דף חי באתר (`yellowzone.co.il/docs/…` מחזיר 200), והריפו
// עצמו ציבורי. שלושה קודי-כניסה חיים ישבו שם, אחד מהם של חבר `isAdmin`, **עם הטלפונים
// התואמים באותו קובץ** — כלומר זוג-כניסה שלם.
//
// שתי שכבות:
//   1. 🔴 **קוד כניסה חי** — לא מנחשת לפי הקשר ("loginCode:") אלא לוקחת **כל** רצף בן 6
//      ספרות ומצליבה מול `memberCodes` החי. כך גם קוד שנכתב בלי תווית נתפס.
//   2. 🟠 **מידע אישי של חבר** (§432ו) — טלפון/מייל שמופיע בתיעוד ומצליב מול `members`.
//      לא אישורי-כניסה, אבל מידע אישי של אנשים אמיתיים על אתר ציבורי.
//
// ⚠️ ההבדל בין השתיים אינו סגנוני: **קוד שדלף מחליפים, טלפון אי-אפשר.** לכן שכבה 1 היא
// חירום ושכבה 2 היא היגיינה — אבל שתיהן נכשלות את הסריקה, כי שתיהן לא אמורות להיות שם.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

// ⚠️ כתובות של הפרויקט עצמו — מופיעות בתיעוד ובאתר **בכוונה**. הן גם רשומות כחבר
// במערכת, ולכן בלי ההחרגה הזאת הסורק היה מסמן אותן בכל ריצה — אזעקת-שווא קבועה
// שגורמת להתעלם מהסורק כולו. ר' feedback_loose_detector_false_alarm.
const PROJECT_OWNED = new Set(['yellowzonemta@gmail.com', 'noreply@yellowzone.co.il', 'ramibentl@gmail.com']);

// ⚠️ **חשבון-הבדיקה של Google Play מתועד בכוונה** (§430, `docs/play-store-listing.md` סעיף 10):
// הבודק של גוגל חייב את פרטי הכניסה, והם נמסרים לו בלי הקוד — שנשאר רק ב-`memberCodes`.
// זה לא אדם אמיתי ולא מידע אישי, ולכן אינו "דליפה". בלי ההחרגה הזאת הסורק היה מסמן אותו
// בכל ריצה עד שיפסיקו להסתכל עליו.
const TEST_ACCOUNT_PHONES = new Set(['0526404898']);
const TEST_ACCOUNT_MAILS = new Set(['bdika@gmail.com']);

async function token() {
  const n = Math.floor(Date.now() / 1e3);
  const claim = { iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: n + 3600, iat: n };
  const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }) })).json();
  return j.access_token;
}

// ⚠️ **רק קבצים שמנוהלים בגיט.** סריקה של הדיסק מייצרת אזעקות-שווא: worktrees מקומיים
// תחת `.claude/` ותיקיות `build/` של אנדרואיד מכילים מספרים בני 6 ספרות שמתנגשים במקרה
// בקודים חיים — ואף אחד מהם אינו בריפו ואינו מוגש. ר' feedback_loose_detector_false_alarm.
function walk() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(f => /\.(md|txt|json|rules|toml|html|js|mjs)$/i.test(f));
}

async function loadAll(t, coll) {
  const out = [];
  let page = '';
  do {
    const r = await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}/${coll}?pageSize=300${page ? '&pageToken=' + page : ''}`, { headers: { Authorization: `Bearer ${t}` } })).json();
    for (const d of r.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {} });
    page = r.nextPageToken || '';
  } while (page);
  return out;
}

const t = await token();

const live = new Map();   // code → memberId
for (const d of await loadAll(t, 'memberCodes')) {
  const c = d.f.loginCode?.stringValue;
  if (c) live.set(c, d.id);
}
const phones = new Map(), mails = new Map();   // ערך מנורמל → memberId
for (const m of await loadAll(t, 'members')) {
  const p = (m.f.phone?.stringValue || '').replace(/\D/g, '');
  const e = (m.f.email?.stringValue || '').toLowerCase();
  if (p && !TEST_ACCOUNT_PHONES.has(p)) phones.set(p, m.id);
  if (e && !PROJECT_OWNED.has(e) && !TEST_ACCOUNT_MAILS.has(e)) mails.set(e, m.id);
}
console.log(`חי במערכת: ${live.size} קודים · ${phones.size} טלפונים · ${mails.size} מיילים\n`);

const files = walk();
let codeHits = 0, piiHits = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const codes = new Set(), pii = new Set();

  for (const m of s.matchAll(/(?<![0-9])[0-9]{6}(?![0-9])/g)) if (live.has(m[0])) codes.add(m[0]);
  for (const m of s.matchAll(/(?<![0-9])0(?:5[0-9]|[2-4]|[89])-?[0-9]{7,8}(?![0-9])/g)) {
    const d = m[0].replace(/-/g, '');
    if (phones.has(d)) pii.add(`טלפון ${m[0]} → ${phones.get(d)}`);
  }
  for (const m of s.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const e = m[0].toLowerCase();
    if (mails.has(e)) pii.add(`מייל ${m[0]} → ${mails.get(e)}`);
  }

  if (!codes.size && !pii.size) continue;
  console.log(`${codes.size ? '🔴' : '🟠'} ${f}`);
  for (const c of codes) { codeHits++; console.log(`     🔴 קוד כניסה חי ${c}  →  memberId ${live.get(c)}`); }
  for (const p of pii) { piiHits++; console.log(`     🟠 ${p}`); }
}

if (!codeHits && !piiHits) console.log(`✅ נסרקו ${files.length} קבצים — אין קוד חי ואין מידע אישי של חבר`);
else {
  if (codeHits) console.log(`\n🔴 ${codeHits} קודים חיים חשופים — **להחליף**, מחיקה לבדה לא מספיקה (היסטוריית git ציבורית)`);
  if (piiHits) console.log(`${codeHits ? '' : '\n'}🟠 ${piiHits} פרטים אישיים של חברים חשופים — להסתיר ב-•••`);
}
process.exit(codeHits || piiHits ? 1 : 0);
