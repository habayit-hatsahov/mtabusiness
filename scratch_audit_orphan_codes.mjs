// ══ §447 — מי הם הקודים היתומים, ומאיזה נתיב הם הגיעו ═══════════════════════════════════
//
// 🔴 **קריאה בלבד. הסקריפט הזה אינו כותב ואינו מוחק דבר.**
//
// הרקע: §432ז ספר 6 מסמכי `memberCodes` בלי `members` תואם, **ו-3 מהם לא היו ביומן
// המחיקות כלל** — כלומר נמחקו בנתיב שאינו מתועד. ההצעה שם הייתה "לנקות את השישה
// ולסגור את נתיב-המחיקה שמשאיר אותם".
//
// ⚠️ **אבל §432ח, שנכתב 12 יום אחריו, נשען על בדיוק ההתנהגות הזאת** כדי לשחזר את חשבון
// הבודק של Google Play: `restoreDeleted` משחזר **רק את מסמך החבר**, והקוד חזר להתאים
// אך ורק מפני ש-`memberCodes/{id}` **שרד** את המחיקה. זה גם מתועד במפורש בראש
// `deletion-log.js` כהחלטה, לא כתקלה.
//
// כלומר שתי ההוראות סותרות, והמסמך אינו אומר איזו מהן גוברת. הסקריפט הזה אוסף את
// העובדות שדרושות כדי להכריע — ולא מכריע בעצמו.
//
// הרצה:  node scratch_audit_orphan_codes.mjs

import fs from 'fs';
import crypto from 'crypto';

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

async function loadAll(t, coll) {
  const out = [];
  let page = '';
  do {
    const r = await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}/${coll}?pageSize=300${page ? '&pageToken=' + page : ''}`,
      { headers: { Authorization: `Bearer ${t}` } })).json();
    if (r.error) throw new Error(coll + ': ' + r.error.message);
    for (const d of r.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {}, t: d.createTime, u: d.updateTime });
    page = r.nextPageToken || '';
  } while (page);
  return out;
}

const s = (v) => v?.stringValue ?? null;
// ⚠️ הקוד עצמו **לעולם אינו מודפס** — הוא סוד חי. ר' [[feedback_docs_are_public]].
const mask = (c) => (c ? '••••••' : '(ריק)');

const t = await token();
const [codes, members, log] = await Promise.all([
  loadAll(t, 'memberCodes'), loadAll(t, 'members'), loadAll(t, 'deletionLog'),
]);

const memberIds = new Set(members.map((m) => m.id));
const orphans = codes.filter((c) => !memberIds.has(c.id));

console.log('══ מצב נוכחי ═══════════════════════════════════════════');
console.log(`  memberCodes : ${codes.length}`);
console.log(`  members     : ${members.length}`);
console.log(`  deletionLog : ${log.length}`);
console.log(`  🔴 יתומים   : ${orphans.length}   (§432ז ספר 6 ב-8.9)`);

// ── לכל יתום: האם יש לו רשומת-מחיקה, ומה היא אומרת ────────────────────────────────────
// 🔑 **זו השאלה האמיתית.** יתום עם רשומה ביומן הוא **תכנון** — הקוד נשמר בכוונה כדי
// שהשחזור יעבוד. יתום **בלי** רשומה הוא נתיב-מחיקה שאינו מתועד, וזה מה שהסתיר את
// מחיקת חשבון-הבודק במשך חמישה ימים.
const logByDoc = new Map();
for (const l of log) {
  if (s(l.f.collectionName) !== 'members') continue;
  const d = s(l.f.docId);
  if (d) (logByDoc.get(d) || logByDoc.set(d, []).get(d)).push(l);
}

console.log('\n══ פירוט היתומים ══════════════════════════════════════');
const noLog = [];
orphans.forEach((o, i) => {
  const entries = logByDoc.get(o.id) || [];
  const code = s(o.f.loginCode);
  console.log(`\n  ${i + 1}. docId=${o.id}`);
  console.log(`     קוד: ${mask(code)} · נוצר: ${(o.t || '').slice(0, 10)} · עודכן: ${(o.u || '').slice(0, 10)}`);
  if (!entries.length) {
    console.log('     🔴 אין רשומת מחיקה ביומן — נתיב לא מתועד');
    noLog.push(o.id);
  } else {
    entries.forEach((e) => {
      console.log(`     ✅ ביומן: ${s(e.f.label) || '(ללא תווית)'} · ${s(e.f.state)} · ` +
                  `ע"י ${s(e.f.actorName) || '?'} · מקור ${s(e.f.source) || '?'} · ` +
                  `${(e.f.deletedAt?.timestampValue || '').slice(0, 10)}`);
    });
  }
});

console.log('\n══ ההכרעה שנדרשת ══════════════════════════════════════');
console.log(`  יתומים שהמחיקה שלהם מתועדת : ${orphans.length - noLog.length}`);
console.log(`     → אלה **לא** תקלה. deletion-log.js משאיר אותם בכוונה,`);
console.log(`       ו-restoreDeleted משחזר רק את מסמך החבר — כלומר מחיקתם`);
console.log(`       תהפוך את השחזור לבלתי-שלם (§432ח).`);
console.log(`  🔴 יתומים בלי תיעוד          : ${noLog.length}`);
console.log(`     → אלה הממצא האמיתי: קיים נתיב שמוחק חבר בלי לרשום.`);

// ── האם יומן המחיקות עצמו שלם? ────────────────────────────────────────────────────────
// בקרת-נגד: כמה מחיקות-חברים תועדו בסך הכל, מול כמה יתומים יש. אם יש מחיקות מתועדות
// **בלי** יתום תואם, זה נתיב שכן מנקה — וכדאי לדעת שהוא קיים.
const deletedIds = [...logByDoc.keys()];
const loggedButNoCode = deletedIds.filter((id) => !codes.some((c) => c.id === id) && !memberIds.has(id));
console.log('\n══ בקרת-נגד ═══════════════════════════════════════════');
console.log(`  מחיקות חברים ביומן        : ${deletedIds.length}`);
console.log(`  מהן שהקוד שלהן כבר לא קיים : ${loggedButNoCode.length}`);
console.log(`     → אם >0, קיים גם נתיב ש**כן** מנקה memberCodes, ושני הנתיבים חיים במקביל.`);
console.log('\n⚠️  הסקריפט הזה לא כתב ולא מחק דבר.');

// ── חקירה נקודתית: היתומים שאינם מוסברים ע"י "נוצרו לפני שהיומן נולד" ────────────────
// 🔑 יומן המחיקות נולד ב-3.9.2026 (commit 12a3e25). יתום שנוצר ועודכן לפני התאריך הזה
// אינו ראיה לנתיב לא-מתועד — פשוט לא היה יומן. מה שדורש הסבר הוא יתום שה**עדכון**
// האחרון שלו מאוחר ל-3.9. ר' [[feedback_absence_of_evidence]].
const LOG_BORN = '2026-09-03';
console.log('\n══ סינון לפי תאריך לידת היומן (3.9) ═══════════════════');
for (const id of noLog) {
  const o = orphans.find((x) => x.id === id);
  const after = (o.u || '') > LOG_BORN;
  console.log(`  ${id}  עודכן ${(o.u || '').slice(0, 10)}  → ${after ? '🔴 דורש הסבר' : '✅ קודם ליומן'}`);
  if (!after) continue;
  // תת-אוסף activity שורד מחיקה (ר' deletion-log.js) — קיומו מוכיח שהחבר היה קיים.
  const act = await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}/members/${id}/activity?pageSize=3`,
    { headers: { Authorization: `Bearer ${t}` } })).json();
  const n = (act.documents || []).length;
  console.log(`     activity שורד: ${n} רשומות ${n ? '→ החבר אכן היה קיים ונמחק' : '→ אין עקבות'}`);
}

// ── ובקרת-הנגד: 6 המחיקות המתועדות בלי קוד — האם הן בכלל היו מאושרות? ────────────────
// 🔑 חבר `pending` **מעולם לא קיבל קוד** (הקוד מונפק רק באישור). כלומר "מחיקה מתועדת
// בלי קוד" אינה עדות לנתיב שמנקה — היא ככל הנראה עדות לחבר שלא אושר. הצילום ביומן
// מחזיק את `status` כפי שהיה, ולכן אפשר להכריע במקום לנחש.
console.log('\n══ 6 המחיקות המתועדות שאין להן קוד — מה היה הסטטוס ═════');
const tally = {};
for (const id of loggedButNoCode) {
  const e = (logByDoc.get(id) || [])[0];
  const st = e?.f?.data?.mapValue?.fields?.status?.stringValue || '(חסר)';
  tally[st] = (tally[st] || 0) + 1;
}
console.log('  ', JSON.stringify(tally));
console.log('   → אם כולם pending/rejected: אין שום נתיב שמנקה codes, וההנחה של §432ז שגויה.');

// ── והמקרה היחיד שכן היה approved: מי מחק אותו? ──────────────────────────────────────
// אם המקור הוא הוורקר (מחיקה עצמית, §420) — זו התנהגות **נכונה**: הוא מוחק גם את הקוד
// וגם רושם ביומן. אז אין שום "נתיב שמנקה בשקט", וההנחה של §432ז נופלת לגמרי.
console.log('\n══ המחיקה היחידה של חבר approved שגם ניקתה קוד ═════════');
for (const id of loggedButNoCode) {
  const e = (logByDoc.get(id) || [])[0];
  if ((e?.f?.data?.mapValue?.fields?.status?.stringValue) !== 'approved') continue;
  console.log(`  מקור: ${s(e.f.source) || '?'} · ע"י ${s(e.f.actorName) || '?'} · ` +
              `${(e.f.deletedAt?.timestampValue || '').slice(0, 10)} · state=${s(e.f.state)}`);
}
