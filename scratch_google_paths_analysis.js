// ── ניתוח: מאיזה נתיב הגיעו חיבורי ה-Google, וכמה נרשמים משתמשים בזה ─────────────────────
// קריאה בלבד. מכין את הנתונים לסקשן החדש בפאנל הפלטפורמה.
//
// 🔴 **אין שדה שמבדיל בין שני נתיבי-החיבור.** `/google-link` (הבאנר) ו-`/google-attach`
// (טופס ההרשמה) כותבים שניהם בדיוק `googleSub` + `googleEmail` + `googleLinkedAt`.
// לכן ההבחנה כאן היא **אומדן ולא עובדה**, והיא חייבת להיאמר ככזאת גם במסך:
//
//   `/google-attach` רץ שניות אחרי שהרשומה נכתבה (הוא חלק מזרימת ההרשמה), ולכן
//   googleLinkedAt − submittedAt קטן. הבאנר, לעומתו, דורש אישור וכניסה — כלומר שעות
//   לפחות. הסף שנבחר: 10 דקות. ⚠️ מי שנרשם, אושר ונכנס באותו רבע שעה ייספר בטעות
//   כ"בהרשמה". במדגם הנוכחי זה בלתי-אפשרי (אישור הוא ידני), אבל זו הנחה ולא ערובה.
//
// 🔑 **התיקון האמיתי הוא שדה `googleLinkedVia` בוורקר** — שורה אחת בכל אחד משני
// ה-patch. אז ההבחנה תהיה עובדה, לפחות קדימה.
//
// הרצה: node scratch_google_paths_analysis.js

const fs = require('fs');
const crypto = require('crypto');

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const SIGNUP_WINDOW_MS = 10 * 60 * 1000;

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
const T = (f, k) => f[k]?.timestampValue || '';
const ms = (t) => t ? Date.parse(t) : NaN;
const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';

(async () => {
  const token = await getToken();
  const [members, events] = await Promise.all([listAll(token, 'members'), listAll(token, 'events')]);

  const all = members;                                    // כל הרשומות, לא רק מאושרות
  const approved = all.filter(m => S(m.f, 'status') === 'approved');
  const linked = all.filter(m => S(m.f, 'googleEmail'));

  // ── פילוח לפי נתיב (אומדן) ────────────────────────────────────────────────────────────
  const viaSignup = linked.filter(m => {
    const d = ms(T(m.f, 'googleLinkedAt')) - ms(T(m.f, 'submittedAt'));
    return Number.isFinite(d) && d >= 0 && d < SIGNUP_WINDOW_MS;
  });
  const viaLater = linked.filter(m => !viaSignup.includes(m));

  console.log('── חיבורי Google, לפי נתיב (אומדן לפי הפרש-זמן) ──────────────');
  console.log(`   סה"כ מקושרים:            ${linked.length}`);
  console.log(`   בטופס ההרשמה:            ${viaSignup.length}`);
  console.log(`   מאוחר יותר (באנר/תפריט): ${viaLater.length}\n`);

  // ── שיעור השימוש בהרשמה ───────────────────────────────────────────────────────────────
  // 🔑 המכנה נגזר מהנתונים: מי שנרשם **מאז** ההרשמה-עם-גוגל הראשונה. הרשמות קודמות
  // לא ראו את הכפתור בכלל — אותה טעות בדיוק שתוקנה ב-§399י.
  const firstSignupLink = viaSignup.map(m => T(m.f, 'submittedAt')).filter(Boolean).sort()[0];
  if (firstSignupLink) {
    const since = all.filter(m => T(m.f, 'submittedAt') && T(m.f, 'submittedAt') >= firstSignupLink);
    const sinceWith = since.filter(m => viaSignup.includes(m));
    console.log('── שימוש בגוגל בטופס ההרשמה ─────────────────────────────────');
    console.log(`   ההרשמה הראשונה עם גוגל: ${firstSignupLink}`);
    console.log(`   נרשמו מאז:              ${since.length}`);
    console.log(`   מתוכם עם גוגל:          ${sinceWith.length}  (${pct(sinceWith.length, since.length)})\n`);
  } else {
    console.log('── שימוש בגוגל בטופס ההרשמה ─────────────────────────────────');
    console.log('   🔴 אף הרשמה לא נקשרה בטופס. אם הכפתור אמור לעבוד שם — זה ממצא.\n');
  }

  // ── מד-הנגד: מי ניסה גוגל ולא הצליח ───────────────────────────────────────────────────
  const fails = events.filter(e => S(e.f, 'type') === 'loginFail');
  const gFails = fails.filter(e => S(e.f, 'channel').startsWith('google:'));
  const byCh = {};
  for (const e of gFails) { const c = S(e.f, 'channel'); byCh[c] = (byCh[c] || 0) + 1; }
  console.log('── מד-הנגד: ניסו גוגל ולא נכנסו ─────────────────────────────');
  for (const [c, n] of Object.entries(byCh).sort((a, b) => b[1] - a[1])) console.log(`   ${c}: ${n}`);
  console.log(`   סה"כ כשלי-כניסה: ${fails.length}, מהם במסלול גוגל: ${gFails.length} (${pct(gFails.length, fails.length)})\n`);

  // ── פירוט שמי, לאימות ידני של האומדן ─────────────────────────────────────────────────
  // ⚠️ **מספר שעולה למסך חייב להיבדק שמית קודם.** אומדן שמסווג רשומות-בדיקה כ"הרשמות
  // אמיתיות" מנפח בדיוק את המדד שאמור להנחות החלטה.
  console.log('── פירוט: מי סווג כ"נרשם עם גוגל" ───────────────────────────');
  for (const m of viaSignup.sort((a, b) => T(a.f, 'submittedAt').localeCompare(T(b.f, 'submittedAt')))) {
    const gap = Math.round((ms(T(m.f, 'googleLinkedAt')) - ms(T(m.f, 'submittedAt'))) / 1000);
    console.log(`   ${T(m.f, 'submittedAt').slice(0, 16)}  ${S(m.f, 'firstName')} ${S(m.f, 'lastName')}  ·  ${S(m.f, 'status')}  ·  +${gap}s`);
  }
  console.log('');

  // ── הסף ───────────────────────────────────────────────────────────────────────────────
  const half = Math.ceil(approved.length / 2);
  const linkedApproved = approved.filter(m => S(m.f, 'googleEmail')).length;
  console.log('── תנאי-החזרה של §399י ──────────────────────────────────────');
  console.log(`   מקושרים מבין המאושרים: ${linkedApproved} / ${approved.length}`);
  console.log(`   הסף (מחצית):           ${half}`);
  console.log(`   ${linkedApproved >= half ? '✅ הסף נחצה — להחזיר את גוגל למעלה במסך הכניסה' : `⏳ חסרים ${half - linkedApproved}`}`);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
