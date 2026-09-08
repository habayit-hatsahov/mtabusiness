// כמה מהקהילה על אנדרואיד — לצורך גיוס 12 הבודקים ל-Play.
//
// 🔴 **הסקריפט הזה אינו עונה על השאלה שבכותרת, ואסור לקרוא את הפלט שלו כאילו כן.**
// האוסף `events` שומר `device` בלבד, והוא נגזר מ-`window.innerWidth <= 700` (ר' logEvent
// ב-home.html) — כלומר **mobile/desktop, לא אנדרואיד/אייפון**. אין באוסף שום שדה
// מערכת-הפעלה. הפלט למטה ("mobile 90.3%") נכון כשלעצמו אבל **אינו מספר האנדרואידים**,
// והכותרת + ההערה "כמה מהמחוברים הם אנדרואיד" למטה מטעות. נבדק ואומת 2026-09-08.
//
// כדי לענות באמת צריך להוסיף שדה חדש ב-logEvent (למשל `platform` מ-userAgentData /
// navigator.userAgent) ולחכות לתנועה — כלומר זו משימת-מדידה, לא שאילתה על מה שכבר יש.
// ⚠️ ו-firestore.rules אוכפת `hasOnly` על שדות האירוע: בלי להוסיף את השם לרשימת-ההיתר
// **כל** האירוע יידחה בשקט (ר' feedback_measurement_field_limits).
//
// 🔑 **למה זה חשוב לדעת מראש:** בודק ב-Closed Testing חייב מכשיר אנדרואיד. אם רוב
// הקהילה על אייפון, גיוס 12 בודקים הוא משימה קשה בהרבה ממה שנראה — ועדיף לגלות
// את זה עכשיו ולא אחרי שגוגל תאשר את הזהות והשעון יתחיל לרוץ.
//
//   node scratch_device_split.mjs
//
import { readFileSync } from 'fs';
import { createSign } from 'crypto';

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const PROJECT = 'habayit-hatsahov';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
const now = Math.floor(Date.now() / 1000);
const claim = { iss: key.client_email, scope: 'https://www.googleapis.com/auth/datastore',
                aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
const sig = createSign('RSA-SHA256').update(u).sign(key.private_key).toString('base64url');
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }),
})).json();

// ⚠️ סופרים **אנשים ולא צפיות** — מי שגולש הרבה היה מטה את הפילוח לגמרי.
// המפתח הוא memberId כשיש, ואחרת sessionId.
const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'events' }],
    // הסינון לפי type עבר לקוד — שאילתה עם where+orderBy דורשת אינדקס מורכב שאינו קיים
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: 5000,
  }}),
});
if (!res.ok) { console.error('query failed', res.status, (await res.text()).slice(0, 300)); process.exit(1); }

const rows = (await res.json()).filter(r => r.document && r.document.fields?.type?.stringValue === 'pageView');
console.log(`נסרקו ${rows.length} צפיות אחרונות\n`);

const byPerson = new Map();   // מזהה אדם → מכשיר
let earliest = null, latest = null;
for (const r of rows) {
  const f = r.document.fields || {};
  const dev = f.device?.stringValue || '(ריק)';
  const who = f.memberId?.stringValue || ('s:' + (f.sessionId?.stringValue || Math.random()));
  if (!byPerson.has(who)) byPerson.set(who, dev);
  const t = f.createdAt?.timestampValue;
  if (t) { if (!earliest || t < earliest) earliest = t; if (!latest || t > latest) latest = t; }
}

const counts = {};
for (const dev of byPerson.values()) counts[dev] = (counts[dev] || 0) + 1;
const total = byPerson.size;

console.log(`טווח התאריכים: ${(earliest || '').slice(0, 10)} — ${(latest || '').slice(0, 10)}`);
console.log(`אנשים שונים: ${total}\n`);
console.log('פילוח מכשירים:');
for (const [dev, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${dev.padEnd(12)} ${String(n).padStart(4)}  (${(n / total * 100).toFixed(1)}%)`);
}

// ── כמה מהמחוברים (memberId ידוע) הם אנדרואיד ─────────────────────────────────────────
// 🔑 אלה האנשים שאפשר באמת לפנות אליהם בשם — לאנונימיים אין דרך ליצור קשר.
const members = new Map();
for (const r of rows) {
  const f = r.document.fields || {};
  const mid = f.memberId?.stringValue;
  if (mid && !members.has(mid)) members.set(mid, f.device?.stringValue || '(ריק)');
}
const mc = {};
for (const d of members.values()) mc[d] = (mc[d] || 0) + 1;
console.log(`\nמתוכם מזוהים (יש memberId): ${members.size}`);
for (const [dev, n] of Object.entries(mc).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${dev.padEnd(12)} ${String(n).padStart(4)}`);
}
