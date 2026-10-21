// §587 — השלמת platformDaily לימים שעברו, **בקוד של הוורקר עצמו** (worker/src/platformdaily.js).
// הרצה: node scratch_platform_daily_backfill.mjs [ימים=31]
// ⚠️ כותב לפרודקשן (platformDaily/{יום}) – מסמכי-סיכום בלבד, לא נוגע באירועים.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { computePlatformDay } from './worker/src/platformdaily.js';
import { ilDayKey } from './platform-agg.js';
import { firestoreRunQuery } from './worker/src/firestore.js';

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
const token = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }) })).json()).access_token;
const env = { FIREBASE_PROJECT_ID: KEY.project_id };

const days = Number(process.argv[2] || 31);
const admins = (await firestoreRunQuery(env, token, 'members', 'isAdmin', true, 50)).map(m => m.id);
console.log('מנהלים:', admins.length);
let total = 0;
for (let i = 1; i <= days; i++) {
  const key = ilDayKey(new Date(Date.now() - i * 864e5));
  const n = await computePlatformDay(env, token, key, admins);
  total += n;
  console.log(key, n);
}
console.log('סה"כ אירועים:', total);
