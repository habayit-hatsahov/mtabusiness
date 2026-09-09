// ── סריקה: האם קוד-כניסה חי מופיע בקובץ טקסט שמוגש פומבית ────────────────────────────────
// לא מנחשת לפי הקשר ("loginCode:") אלא לוקחת **כל** רצף בן 6 ספרות ומצליבה מול
// memberCodes החי. כך גם קוד שנכתב בלי תווית נתפס.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

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

const t = await token();
const live = new Map();   // code → memberId
let page = '';
do {
  const r = await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}/memberCodes?pageSize=300${page ? '&pageToken=' + page : ''}`, { headers: { Authorization: `Bearer ${t}` } })).json();
  for (const d of r.documents || []) {
    const c = d.fields?.loginCode?.stringValue;
    if (c) live.set(c, d.name.split('/').pop());
  }
  page = r.nextPageToken || '';
} while (page);
console.log(`קודים חיים במערכת: ${live.size}\n`);

const files = walk('.');
let found = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const hits = new Set();
  for (const m of s.matchAll(/(?<![0-9])[0-9]{6}(?![0-9])/g)) if (live.has(m[0])) hits.add(m[0]);
  if (hits.size) {
    found += hits.size;
    console.log(`🔴 ${f}`);
    for (const c of hits) console.log(`     ${c}  →  memberId ${live.get(c)}`);
  }
}
console.log(found ? `\n🔴 ${found} קודים חיים חשופים` : `\n✅ נסרקו ${files.length} קבצים — אין ולו קוד חי אחד`);
process.exit(found ? 1 : 0);
