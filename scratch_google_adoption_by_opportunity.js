// ── אימוץ Google מול המכנה הנכון: מי בכלל היה לו הזדמנות לחבר ──────────────────────────────
// קריאה בלבד.
//
// 🔑 **תיקון למדידה של §399.** שם חילקתי את המקושרים בכל המאושרים וקיבלתי "8.6%", כאילו
// זהו שיעור-אימוץ. **המשתמש הצביע על הפגם: חיבור Google נפתח רק ב-2.9 בערב.** רוב 199
// המאושרים נרשמו ואושרו **שבועות לפני שהאפשרות בכלל היתה קיימת**, וחלקם לא פתחו את האתר
// מאז. לספור אותם ב"לא חיברו" זה כמו לספור אנשים שלא לחצו על כפתור שלא היה על המסך שלהם.
//
// המכנה הנכון: מי שפתח את דף הבית **מאז שהחיבור נפתח** — הם היחידים שראו את הבאנר.
// זה מה ש-`lastSeenAt` יודע לענות (נכתב בכל טעינה של home.html, ר' §388).
//
// ⚠️ **תקרת-אמינות שחייבת להיאמר:** `lastSeenAt` הוא **הביקור האחרון בלבד**. מי שביקר
// בזמן-הבאנר ואז שוב אתמול — נספר נכון. מי שביקר בזמן-הבאנר ומאז לא — גם. אבל אין דרך
// לדעת **כמה פעמים** הוא ראה את הבאנר, ולכן זהו אומדן-רצפה של ההזדמנות, לא ספירה מדויקת.
//
// הרצה: node scratch_google_adoption_by_opportunity.js

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
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {} });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

const S = (f, k) => f[k]?.stringValue || '';
const T = (f, k) => f[k]?.timestampValue || '';
const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';

(async () => {
  const token = await getToken();
  const members = await listAll(token, 'members');
  const approved = members.filter(m => S(m.f, 'status') === 'approved');
  const linked = approved.filter(m => S(m.f, 'googleEmail'));

  // 🔑 הרגע שבו החיבור נפתח נגזר **מהנתונים** ולא נכתב ידנית: החיבור המוקדם ביותר שקיים.
  // תאריך מוקלד היה מתיישן בשקט ברגע שמישהו יחבר מוקדם יותר (למשל אחרי backfill).
  const firstLink = linked.map(m => T(m.f, 'googleLinkedAt')).filter(Boolean).sort()[0];
  if (!firstLink) { console.log('אין עדיין אף חיבור — אין מה למדוד.'); return; }

  console.log(`החיבור הראשון במערכת: ${firstLink}`);
  console.log(`(כלומר האפשרות נפתחה בערך אז — לפני כן היא לא היתה על המסך של אף אחד)\n`);

  const seenSince = approved.filter(m => { const t = T(m.f, 'lastSeenAt'); return t && t >= firstLink; });
  const seenSinceLinked = seenSince.filter(m => S(m.f, 'googleEmail'));
  const neverSeen = approved.filter(m => !T(m.f, 'lastSeenAt'));
  const seenBefore = approved.filter(m => { const t = T(m.f, 'lastSeenAt'); return t && t < firstLink; });

  console.log('── המספר שדיווחתי ב-§399, והוא מטעה ─────────────────');
  console.log(`   ${linked.length} מקושרים מתוך ${approved.length} מאושרים = ${pct(linked.length, approved.length)}`);
  console.log(`   ⚠️ המכנה כולל ${seenBefore.length + neverSeen.length} אנשים שלא פתחו את האתר מאז שהאפשרות נפתחה.\n`);

  console.log('── המכנה הנכון: מי שפתח את האתר מאז ─────────────────');
  console.log(`   נחשפו לבאנר (lastSeenAt אחרי ${firstLink.slice(0, 16)}): ${seenSince.length}`);
  console.log(`   מתוכם חיברו: ${seenSinceLinked.length}`);
  console.log(`   🔑 שיעור אימוץ בקרב מי שהיתה לו הזדמנות: ${pct(seenSinceLinked.length, seenSince.length)}\n`);

  console.log('── מי שלא היתה לו הזדמנות ───────────────────────────');
  console.log(`   ביקרו לאחרונה לפני שהאפשרות נפתחה: ${seenBefore.length}`);
  console.log(`   מעולם לא נרשם להם ביקור:            ${neverSeen.length}`);
  console.log(`   ⚠️ lastSeenAt נכתב רק מ-2.8.26 — מי שנכנס לפני כן ולא חזר נספר כאן.`);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
