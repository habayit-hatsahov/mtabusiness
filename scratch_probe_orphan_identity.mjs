// ══ §447ד — מי היה `Uw1Caau9QFS8Voy2V6ij` ═══════════════════════════════════════════════
//
// 🔴 **קריאה בלבד.**
//
// מה שכבר ידוע (§447ג): הקוד נוצר 24.8, נכתב מחדש 11.9 ב-12:38:36 בתוך batch של שלושה,
// `members/{id}` אינו קיים, אין רשומה ביומן, ותת-האוסף `activity` שרד עם 2 רשומות
// `adminEdit` (12.8, 27.8). כל נתיב-מחיקה באפליקציה רושם — ולכן המחיקה לא עברה דרך האתר.
//
// ── ארבעה מקורות שהמחיקה של `members/{id}` **אינה** נוגעת בהם ──────────────────────────
//   1. **Firebase Auth** — משתמש ה-Auth שורד מחיקת מסמך (נצפה במפורש ב-§432ח), וה-UID
//      שלו הוא בדיוק ה-docId. זה המקור החזק ביותר: הוא מחזיק מייל, טלפון ותאריכים.
//   2. **`events`** — שכבת המדידה נושאת `memberId` על `loginOk`/`pageView`/`loginFail`,
//      ו-`loginFail` נושא גם `phone` ו-`email` (§355/§407). זה נותן ציר-זמן אמיתי.
//   3. **`activity`** — תת-אוסף ששורד, ובו מה שהמנהל ערך בפועל.
//   4. **`deletionLog`** — צילומי רשומות אחרות עשויים להצביע עליו (`duplicateOfId`).
//
// ⚠️ **מידע מזהה מוצג ממוסך חלקית.** הפלט הזה נועד למסך ולא לקובץ, ושום ערך חי אינו
// נכנס לריפו. ר' [[feedback_docs_are_public]].
//
// הרצה:  node scratch_probe_orphan_identity.mjs

import fs from 'fs';
import crypto from 'crypto';

const TARGET = 'Uw1Caau9QFS8Voy2V6ij';
const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

// ⚠️ שני scopes: datastore ל-Firestore, ו-cloud-platform ל-Identity Toolkit.
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
const H = { Authorization: `Bearer ${tFs}`, 'Content-Type': 'application/json' };
const get = async (p, q) => (await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}/${p}${q || ''}`, { headers: H })).json());
const s = (v) => v?.stringValue ?? null;

// מיסוך שמאפשר זיהוי בלי להדפיס ערך שלם.
const maskMail = (e) => (e ? e.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : '—');
const maskPhone = (p) => (p ? String(p).replace(/^(\d{3})\d+(\d{2})$/, '$1•••••$2') : '—');
const ts = (v) => (v || '').slice(0, 19).replace('T', ' ');

// ══ 1. Firebase Auth — המקור החזק ביותר ═════════════════════════════════════════════════
console.log('══ 1. משתמש ה-Auth (שורד מחיקת מסמך — §432ח) ══════════');
try {
  const tId = await token('https://www.googleapis.com/auth/cloud-platform');
  const r = await (await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${KEY.project_id}/accounts:lookup`, {
    method: 'POST', headers: { Authorization: `Bearer ${tId}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [TARGET] }),
  })).json();
  if (r.error) console.log(`  ⛔ ${r.error.message}`);
  else if (!r.users || !r.users.length) console.log('  אין משתמש Auth עם ה-UID הזה — נמחק גם הוא, או שלא נוצר מעולם');
  else {
    const u = r.users[0];
    console.log(`  ✅ קיים`);
    console.log(`     מייל   : ${maskMail(u.email)}${u.emailVerified ? ' (מאומת)' : ''}`);
    console.log(`     טלפון  : ${maskPhone(u.phoneNumber)}`);
    console.log(`     שם     : ${u.displayName || '—'}`);
    console.log(`     נוצר   : ${u.createdAt ? ts(new Date(+u.createdAt).toISOString()) : '—'}`);
    console.log(`     כניסה אחרונה: ${u.lastLoginAt ? ts(new Date(+u.lastLoginAt).toISOString()) : '—'}`);
    console.log(`     ספקים  : ${(u.providerUserInfo || []).map((p) => p.providerId).join(', ') || 'custom token בלבד'}`);
    console.log(`     מושבת  : ${u.disabled ? 'כן' : 'לא'}`);
  }
} catch (e) { console.log('  ⛔ ' + e.message); }

// ══ 2. activity — מה המנהל ערך בפועל ════════════════════════════════════════════════════
console.log('\n══ 2. תת-האוסף activity (שורד מחיקה) ══════════════════');
const act = await get(`members/${TARGET}/activity`, '?pageSize=50');
for (const a of act.documents || []) {
  const f = a.fields || {};
  const when = f.at?.timestampValue || f.createdAt?.timestampValue || a.createTime;
  console.log(`  ${ts(when)} · ${s(f.type) || s(f.action) || '?'}`);
  for (const [k, v] of Object.entries(f)) {
    if (['at', 'createdAt', 'type', 'action'].includes(k)) continue;
    let val = s(v) ?? v.integerValue ?? v.booleanValue ?? (v.mapValue ? JSON.stringify(Object.keys(v.mapValue.fields || {})) : JSON.stringify(v).slice(0, 120));
    if (/mail/i.test(k)) val = maskMail(val);
    if (/phone/i.test(k)) val = maskPhone(val);
    console.log(`      ${k}: ${String(val).slice(0, 160)}`);
  }
}

// ══ 3. events — ציר-זמן אמיתי ═══════════════════════════════════════════════════════════
// ⚠️ `limit` על האוסף הזה הוא תקרה קשיחה (§351); כאן שולפים לפי שאילתה ממוקדת על
// memberId, ולכן זה זול ולא נוגע בתקרה של הפאנל.
console.log('\n══ 3. events עם memberId=היעד ═════════════════════════');
const q = await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'events' }],
    where: { fieldFilter: { field: { fieldPath: 'memberId' }, op: 'EQUAL', value: { stringValue: TARGET } } },
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
    limit: 100,
  } }),
})).json();
const rows = (Array.isArray(q) ? q : []).filter((x) => x.document);
console.log(`  ${rows.length} אירועים`);
for (const r of rows) {
  const f = r.document.fields || {};
  console.log(`  ${ts(f.createdAt?.timestampValue)} · ${s(f.type)} · ${s(f.channel) || ''} ` +
              `${f.phone ? '· ' + maskPhone(s(f.phone)) : ''}${f.email ? ' · ' + maskMail(s(f.email)) : ''}`);
}

// ══ 4. מי עוד מצביע עליו ════════════════════════════════════════════════════════════════
console.log('\n══ 4. הצבעות מאוספים אחרים ════════════════════════════');
async function all(coll) {
  const out = []; let page = '';
  do {
    const r = await get(coll, `?pageSize=300${page ? '&pageToken=' + page : ''}`);
    for (const d of r.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {} });
    page = r.nextPageToken || '';
  } while (page);
  return out;
}
const members = await all('members');
const dups = members.filter((m) => s(m.f.duplicateOfId) === TARGET);
console.log(`  חברים עם duplicateOfId=היעד: ${dups.length}`);
dups.forEach((d) => console.log(`    ${d.id} · ${s(d.f.firstName)} ${s(d.f.lastName)} · ${s(d.f.status)} · reviewFlag=${s(d.f.reviewFlag)}`));

const log = await all('deletionLog');
const mentions = log.filter((l) => JSON.stringify(l.f).includes(TARGET));
console.log(`  רשומות ביומן שמזכירות את המזהה איפשהו: ${mentions.length}`);
mentions.forEach((l) => console.log(`    ${s(l.f.collectionName)}/${s(l.f.docId)} · ${s(l.f.label)} · ${s(l.f.state)}`));

console.log('\n⚠️  קריאה בלבד — לא נכתב ולא נמחק דבר.');
