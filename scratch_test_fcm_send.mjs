// §420ט — בדיקה חיה של שליחת פוש נייטיב, מקצה לקצה.
//
// 🔑 **מייבא את `sendFcmToToken` האמיתית מ-worker/src/fcm.js** ולא משכפל אותה —
// הרנס עם עותק של הלוגיקה בודק את העותק. ר' feedback_verification_must_run_the_producer.
//
// מה נבדק כאן שאי-אפשר לבדוק בלי מכשיר:
//   · שה-scope firebase.messaging באמת ניתן (בלעדיו 403 שלא מזכיר scope)
//   · שמבנה ההודעה ש-fcm.js בונה מתקבל ע"י FCM
//   · שההתראה מגיעה בפועל למכשיר
//   · שההבחנה `dead` עובדת — נבדק בנפרד עם טוקן פגום
//
//   node scratch_test_fcm_send.mjs <FCM_TOKEN>
//
import { readFileSync } from 'fs';
import { createSign } from 'crypto';
import { sendFcmToToken } from './worker/src/fcm.js';

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const PROJECT = 'habayit-hatsahov';

const token = process.argv[2];
if (!token) { console.error('usage: node scratch_test_fcm_send.mjs <FCM_TOKEN>'); process.exit(1); }

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

// אותו scope בדיוק שהוורקר מבקש (jwt.js §420ג) — אם הוא חסר, נדע כאן ולא בפרודקשן.
async function getToken() {
  const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  };
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + sig,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('OAuth failed: ' + JSON.stringify(j));
  return j.access_token;
}

const env = { FIREBASE_PROJECT_ID: PROJECT };
const accessToken = await getToken();
console.log('✓ טוקן OAuth עם scope firebase.messaging התקבל\n');

// ── 1. שליחה אמיתית ─────────────────────────────────────────────────────────────────────
console.log('── שליחה למכשיר ──');
const ok = await sendFcmToToken(env, accessToken, token, {
  title: 'Yellow Zone — בדיקה',
  body: 'אם אתה רואה את זה, כל השרשרת עובדת 🎉',
  data: { source: 'scratch_test', n: 1 },   // ⚠️ n הוא מספר — בודק את ההמרה למחרוזת ב-fcm.js
  link: 'https://yellowzone.co.il/home.html',
});
console.log(JSON.stringify(ok, null, 1));

// ── 2. טוקן פגום — ההבחנה dead ──────────────────────────────────────────────────────────
// 🔑 זו ההבחנה שכל הניקוי נשען עליה: טוקן שאינו קיים חייב לחזור dead=true, אחרת מפת
// הטוקנים מתמלאת מכשירים שאינם קיימים. כשל רשת/500 חייב לחזור dead=false.
console.log('\n── טוקן פגום (אמור לחזור dead=true) ──');
const bad = await sendFcmToToken(env, accessToken, token.slice(0, -8) + 'ZZZZZZZZ', {
  title: 'לא אמור להגיע', body: 'לא אמור להגיע',
});
console.log(JSON.stringify({ ok: bad.ok, dead: bad.dead, status: bad.status }, null, 1));

console.log('\n── סיכום ──');
console.log('שליחה אמיתית :', ok.ok ? '✓ הצליחה' : '✗ נכשלה — ' + ok.error);
console.log('זיהוי טוקן מת:', (!bad.ok && bad.dead) ? '✓ עובד' : '✗ לא זוהה כמת (dead=' + bad.dead + ')');
process.exit((ok.ok && bad.dead) ? 0 : 1);
