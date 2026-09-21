// ══ §447ב — חקירה נקודתית של היתום היחיד שאינו מוסבר ═══════════════════════════════════
//
// 🔴 **קריאה בלבד.**
//
// `memberCodes/Uw1Caau9QFS8Voy2V6ij` — נוצר 24.8, **עודכן 11.9**, ואין לו רשומה ביומן
// המחיקות. היומן נולד ב-3.9, כלומר בזמן שהקוד הזה נכתב הוא כבר היה חי — ולכן "לא היה
// יומן" אינו הסבר כאן. תת-האוסף `activity` שרד עם 2 רשומות, כלומר החבר אכן היה קיים.
//
// שלוש ההשערות שאפשר להפריד ביניהן בנתונים, וזו המטרה:
//   א. הרשומה נמחקה בנתיב שאינו רושם         → נצפה לאפס רשומות ביומן על ה-docId הזה
//   ב. הרשומה נרשמה ביומן, והרשומה ביומן נמחקה → נצפה לפער בין מה שמופיע למה שאמור
//   ג. מעולם לא הייתה מחיקה — הקוד נוצר יתום  → `activity` היה מתרוקן/לא קיים
//
// הרצה:  node scratch_probe_one_orphan.mjs

import fs from 'fs';
import crypto from 'crypto';

const TARGET = 'Uw1Caau9QFS8Voy2V6ij';

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function token() {
  const n = Math.floor(Date.now() / 1e3);
  const claim = { iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: n + 3600, iat: n };
  const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }),
  })).json();
  return j.access_token;
}
const t = await token();
const get = async (p, q) => (await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}/${p}${q || ''}`,
  { headers: { Authorization: `Bearer ${t}` } })).json());
const s = (v) => v?.stringValue ?? null;

async function all(coll) {
  const out = []; let page = '';
  do {
    const r = await get(coll, `?pageSize=300${page ? '&pageToken=' + page : ''}`);
    for (const d of r.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {}, t: d.createTime, u: d.updateTime });
    page = r.nextPageToken || '';
  } while (page);
  return out;
}

console.log('══ היעד ═══════════════════════════════════════════════');
const code = await get(`memberCodes/${TARGET}`);
console.log(`  memberCodes/${TARGET}`);
console.log(`    נוצר ${code.createTime?.slice(0, 19)} · עודכן ${code.updateTime?.slice(0, 19)}`);
// ⚠️ הקוד עצמו לא מודפס — סוד חי.
console.log(`    שדות: ${Object.keys(code.fields || {}).join(', ')}`);
const m = await get(`members/${TARGET}`);
console.log(`  members/${TARGET} → ${m.error ? 'לא קיים (' + m.error.status + ')' : 'קיים!'}`);

console.log('\n══ א. יומן המחיקות — כל אזכור של ה-docId ══════════════');
const log = await all('deletionLog');
const hits = log.filter((l) => s(l.f.docId) === TARGET);
console.log(`  רשומות ביומן שמזכירות אותו: ${hits.length}`);
hits.forEach((h) => console.log(`    ${s(h.f.collectionName)} · ${s(h.f.state)} · ${s(h.f.source)} · ${(h.f.deletedAt?.timestampValue || '').slice(0, 10)}`));

// ── ב. האם ביומן עצמו יש חור? רצף התאריכים מול מה שידוע ────────────────────────────
// 🔑 `deletionLog` ניתן למחיקה ע"י מנהל (firestore.rules). רשומה שנמחקה משם לא תשאיר
// עקבות — ולכן השאלה "האם היומן שלם" אינה נענית ישירות. מה שכן אפשר: להציג את כל
// הרשומות לפי תאריך, כדי שאפשר יהיה לראות אם חסר משהו סביב 11–15.9.
console.log('\n══ ב. כל היומן לפי תאריך ══════════════════════════════');
log.map((l) => ({
  d: (l.f.deletedAt?.timestampValue || '').slice(0, 10),
  c: s(l.f.collectionName), lab: s(l.f.label), src: s(l.f.source), st: s(l.f.state), id: s(l.f.docId),
})).sort((a, b) => a.d.localeCompare(b.d))
  .forEach((r) => console.log(`  ${r.d} · ${String(r.c).padEnd(10)} · ${String(r.src).padEnd(15)} · ${r.st.padEnd(9)} · ${r.lab}${r.id === TARGET ? '   ← היעד' : ''}`));

console.log('\n══ ג. עקבות שהמחיקה אינה נוגעת בהן ════════════════════');
const act = await get(`members/${TARGET}/activity`, '?pageSize=20');
const acts = act.documents || [];
console.log(`  activity: ${acts.length} רשומות`);
acts.forEach((a) => {
  const f = a.fields || {};
  const when = f.at?.timestampValue || f.createdAt?.timestampValue || a.createTime;
  console.log(`    ${(when || '').slice(0, 19)} · ${s(f.type) || s(f.action) || Object.keys(f).join(',')}`);
});

// מי עוד מצביע עליו: עסק שהוא הבעלים שלו, או טוקן/ראיה.
const membersAll = await all("members"); const memberIdsAll = new Set(membersAll.map(x=>x.id));
const biz = (await all("businesses")).filter((b) => s(b.f.ownerMemberId) === TARGET);
console.log(`  עסקים עם ownerMemberId=היעד: ${biz.length}`);
biz.forEach((b) => console.log(`    ${b.id} · ${s(b.f.name)} · status=${s(b.f.status)}`));
for (const coll of ['bizTokens', 'bizProofs']) {
  const d = await get(`${coll}/${TARGET}`);
  console.log(`  ${coll}/${TARGET} → ${d.error ? 'אין' : 'קיים'}`);
}

console.log('\n⚠️  קריאה בלבד — לא נכתב ולא נמחק דבר.');

// ── ההכרעה: האם 11.9 היה מבצע-המוני או פעולה נקודתית? ──────────────────────────────────
// 🔑 `activity` של היעד נעצר ב-27.8, אבל הקוד נכתב ב-11.9. שתי השערות מתחרות:
//   א. **מיגרציה/סריקה המונית** ב-11.9 שכתבה קודים לכולם → נצפה להרבה מסמכים באותו יום
//   ב. **פעולה נקודתית** — מנהל הנפיק קוד לשורה שכבר לא קיימת → מסמך אחד בלבד
// ב׳ היא הממצא המעניין: `setDoc(memberCodes/{id})` **יוצר מסמך גם כשהחבר אינו קיים**,
// כלומר שורת-UI ישנה (onSnapshot מפגר, טאב פתוח) מייצרת יתום בלי שום שגיאה.
console.log('\n══ ד. מה עוד נכתב ב-memberCodes ב-11.9? ═══════════════');
const codes = await all('memberCodes');
const byDay = {};
codes.forEach((c) => { const d = (c.u || '').slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
Object.entries(byDay).sort().slice(-12).forEach(([d, n]) =>
  console.log(`  ${d}: ${String(n).padStart(3)} מסמכים${d === '2026-09-11' ? '   ← היום של היעד' : ''}`));
const sameDay = codes.filter((c) => (c.u || '').startsWith('2026-09-11'));
console.log(`\n  ב-11.9 בדיוק: ${sameDay.length} מסמכים`);
sameDay.forEach((c) => console.log(`    ${c.id} · ${(c.u || '').slice(11, 19)} · ${memberIdsAll.has(c.id) ? 'החבר קיים' : '🔴 יתום'}`));
console.log(sameDay.length === 1
  ? '\n  → מסמך יחיד. זו **פעולה נקודתית**, לא מיגרציה.'
  : '\n  → כמה מסמכים באותו יום — ייתכן מבצע המוני.');
