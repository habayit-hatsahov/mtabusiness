// ══ §447ג — ניקוי שני קודי-הכניסה היתומים שקדמו ליומן המחיקות ═══════════════════════════
//
// 🔴 **הסקריפט הזה כותב ומוחק.** הוא נוגע ב**שני מזהים קבועים בלבד**, והוא מסרב לפעול
// אם משהו במצב אינו כפי שנמדד.
//
// ── מה נמחק ולמה דווקא אלה ──────────────────────────────────────────────────────────────
// מתוך 5 היתומים (§447):
//   · 2 נמחקו דרך `admin-dashboard` ב-15.9 **ויש להם רשומה ביומן** → הקוד שלהם הוא
//     **מנגנון השחזור** (`restoreDeleted` משחזר רק את מסמך החבר). לא נוגעים בהם.
//   · 1 אינו מוסבר ועדיין בחקירה → לא נוגעים בו.
//   · 2 עודכנו לאחרונה **לפני 3.9**, התאריך שבו יומן המחיקות נולד (commit `12a3e25`).
//     אין להם רשומה, ולכן **אי-אפשר לשחזר אותם בשום מקרה** — הקוד שלהם אינו משרת דבר.
//     אלה השניים שכאן.
//
// ── ולמה דרך היומן ולא deleteDoc ישיר ───────────────────────────────────────────────────
// 🔑 זו בדיוק הפעולה שהפרויקט הזה בנה את §393 בשבילה. ניקוי שמוחק בשקט מייצר את אותו
// מצב שאנחנו מנסים לסגור: מסמך שנעלם ואין דרך לברר מי ומתי. לכן אותו חוזה בדיוק —
// **רושמים, ורק אם הרישום הצליח מוחקים** — ובנוסף גיבוי מקומי מחוץ לריפו.
// ⚠️ `source: 'script:orphan-cleanup'` כדי שהשורות האלה יהיו מובחנות ביומן.
// ⚠️ ההגנה היא `currentDocument.exists=true` על המחיקה — מדידה חיה ברגע הכתיבה ולא
// בדיקה שקדמה לה. אותו עיקרון של §392/§432ח.
//
// הרצה:  node scratch_cleanup_prelog_orphans.mjs          (יבש — מראה מה יקרה)
//         node scratch_cleanup_prelog_orphans.mjs --apply  (מבצע)

import fs from 'fs';
import crypto from 'crypto';

const APPLY = process.argv.includes('--apply');
const TARGETS = ['3FHf9PHT8sHFO9nYmfGy', 'xUskdJ9skZhB560P1CRH'];
const LOG_BORN = '2026-09-03';
// ⚠️ מחוץ לריפו, במכוון — הגיבוי מכיל קודי-כניסה חיים. ר' [[feedback_docs_are_public]].
const BACKUP = `C:/Users/User/Downloads/yz-orphan-codes-backup-${Date.now()}.json`;

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
const H = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
const api = (p, q) => `https://firestore.googleapis.com/v1/${DOCS}/${p}${q || ''}`;
const get = async (p) => (await (await fetch(api(p), { headers: H })).json());

async function all(coll) {
  const out = []; let page = '';
  do {
    const r = await (await fetch(api(coll, `?pageSize=300${page ? '&pageToken=' + page : ''}`), { headers: H })).json();
    for (const d of r.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {} });
    page = r.nextPageToken || '';
  } while (page);
  return out;
}

console.log(APPLY ? '🔴 מצב ביצוע\n' : '🧪 הרצה יבשה — לא ייכתב דבר. להוספת --apply לביצוע\n');

const log = await all('deletionLog');
const plan = [];

for (const id of TARGETS) {
  console.log(`── ${id}`);
  const code = await get(`memberCodes/${id}`);
  if (code.error) { console.log(`   ⛔ memberCodes אינו קיים (${code.error.status}) — מדלג`); continue; }
  const member = await get(`members/${id}`);
  const hasLog = log.some((l) => l.f.docId?.stringValue === id);
  const upd = (code.updateTime || '').slice(0, 10);

  // ── שלושת התנאים. כולם חייבים להתקיים, וכל אחד מהם לבדו מבטל את המחיקה ───────────
  const ok1 = !!member.error;        // החבר באמת אינו קיים
  const ok2 = !hasLog;               // אין רשומת שחזור שתישבר
  const ok3 = upd < LOG_BORN;        // באמת קודם ליומן
  console.log(`   החבר אינו קיים : ${ok1 ? '✅' : '🔴 קיים! — לא נוגעים'}`);
  console.log(`   אין רשומת יומן : ${ok2 ? '✅' : '🔴 יש — מחיקה תשבור שחזור'}`);
  console.log(`   עודכן ${upd} < ${LOG_BORN} : ${ok3 ? '✅' : '🔴'}`);
  if (!(ok1 && ok2 && ok3)) { console.log('   ⛔ לא עומד בתנאים — מדלג\n'); continue; }
  plan.push({ id, fields: code.fields, createTime: code.createTime, updateTime: code.updateTime });
  console.log('   ✅ מתוכנן למחיקה\n');
}

console.log(`\n══ סה"כ מתוכננים: ${plan.length} מתוך ${TARGETS.length} ══`);
if (!plan.length) { console.log('אין מה לעשות.'); process.exit(0); }
if (!APPLY) { console.log('\n🧪 הרצה יבשה הסתיימה. שום דבר לא השתנה.'); process.exit(0); }

// ── גיבוי מקומי לפני כל כתיבה ──────────────────────────────────────────────────────────
fs.writeFileSync(BACKUP, JSON.stringify({ takenAt: new Date().toISOString(), docs: plan }, null, 2), 'utf8');
console.log(`\n💾 גיבוי נכתב: ${BACKUP}`);

const now = new Date().toISOString();
for (const p of plan) {
  console.log(`\n── מבצע: ${p.id}`);
  // 1. רושמים — **לפני** המחיקה. כשל כאן עוצר, ולא מוחק. זה כל §393.
  const logRes = await (await fetch(api('deletionLog'), {
    method: 'POST', headers: H,
    body: JSON.stringify({ fields: {
      collectionName: { stringValue: 'memberCodes' },
      docId: { stringValue: p.id },
      data: { mapValue: { fields: p.fields } },
      label: { stringValue: 'קוד-כניסה יתום (חבר נמחק לפני שהיומן נולד)' },
      actorUid: { nullValue: null },
      actorName: { stringValue: 'script:orphan-cleanup' },
      actorEmail: { stringValue: '' },
      source: { stringValue: 'script:orphan-cleanup' },
      deletedAt: { timestampValue: now },
      state: { stringValue: 'attempted' },
      restoredAt: { nullValue: null }, restoredBy: { nullValue: null },
      note: { stringValue: `origCreate=${p.createTime} origUpdate=${p.updateTime}` },
    } }),
  })).json();
  if (logRes.error) { console.log(`   ⛔ הרישום נכשל: ${logRes.error.message} — לא מוחק`); continue; }
  const logId = logRes.name.split('/').pop();
  console.log(`   ✅ נרשם ביומן: ${logId}`);

  // 2. ורק עכשיו מוחקים — עם תנאי חי שהמסמך עדיין שם.
  const del = await fetch(api(`memberCodes/${p.id}`, '?currentDocument.exists=true'), { method: 'DELETE', headers: H });
  if (!del.ok) { console.log(`   ⛔ המחיקה נכשלה (${del.status}) — הרשומה נשארת 'attempted'`); continue; }
  console.log('   ✅ נמחק');

  await fetch(api(`deletionLog/${logId}`, '?updateMask.fieldPaths=state'), {
    method: 'PATCH', headers: H, body: JSON.stringify({ fields: { state: { stringValue: 'deleted' } } }),
  });
}

// ── אימות אחרי ─────────────────────────────────────────────────────────────────────────
console.log('\n══ אימות ══════════════════════════════════════════════');
const codesAfter = await all('memberCodes');
const membersAfter = await all('members');
const orphansAfter = codesAfter.filter((c) => !membersAfter.some((m) => m.id === c.id));
console.log(`  memberCodes: ${codesAfter.length} · members: ${membersAfter.length} · יתומים: ${orphansAfter.length}`);
orphansAfter.forEach((o) => console.log(`    נשאר: ${o.id}`));
for (const id of TARGETS) {
  const d = await get(`memberCodes/${id}`);
  console.log(`  ${id} → ${d.error ? '✅ נמחק' : '🔴 עדיין קיים'}`);
}
