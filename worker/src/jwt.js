import { importPKCS8, SignJWT } from 'jose';
import { firestoreGetDoc } from './firestore.js';

let cachedKey = null; // { key, clientEmail } — נשמר בזיכרון ה-isolate בין קריאות (best-effort, לא קריטי)

async function getServiceAccountKey(env) {
  if (cachedKey) return cachedKey;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const key = await importPKCS8(sa.private_key, 'RS256');
  cachedKey = { key, clientEmail: sa.client_email };
  return cachedKey;
}

// טוקן custom להתחברות הלקוח מול Firebase Auth (signInWithCustomToken)
export async function mintFirebaseCustomToken(env, { uid, claims }) {
  const { key, clientEmail } = await getServiceAccountKey(env);
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ uid, claims: claims || {} })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

// טוקן OAuth2 שה-Worker עצמו צריך כדי לקרוא/לכתוב ב-Firestore REST API (service-to-service).
// כולל גם scope ל-Firebase/Cloud Storage (devstorage.read_write) — נדרש ל-backfill thumbnails
// (src/index.js /backfill-thumbnails), שמעלה קבצים חדשים ל-Storage עם אותו service account בדיוק.
export async function getGoogleAccessToken(env) {
  const cached = await env.RATE_LIMIT_KV.get('google_access_token_v2', 'json');
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return cached.token;

  const { key, clientEmail } = await getServiceAccountKey(env);
  const scope = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_write';
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  if (!resp.ok) throw new Error('google_oauth_failed: ' + (await resp.text()));
  const { access_token, expires_in } = await resp.json();
  await env.RATE_LIMIT_KV.put(
    'google_access_token_v2',
    JSON.stringify({ token: access_token, exp: now + expires_in }),
    { expirationTtl: Math.max(60, expires_in - 60) }
  );
  return access_token;
}

// מאמת ID token אמיתי של Firebase Auth (client-side, מ-auth.currentUser.getIdToken()) ומוודא isAdmin===true
// על members/{uid}. נדרש ל-endpoints שנקראים ישירות מדפדפן ודורשים admin אמיתי (למשל /send-broadcast-email) —
// בניגוד ל-ADMIN_BACKFILL_SECRET/PUSH_TEST_SECRET (סוד סטטי), כאן הקוד הקורא (admin-dashboard.html)
// ציבורי בפועל (קובץ סטטי הניתן להורדה), אז סוד מוטבע שם לא באמת סוד. accounts:lookup הוא ה-REST API
// הסטנדרטי של Identity Toolkit לאימות ID token בלי צורך במימוש JWT-signature verification עצמאי.
export async function verifyAdminIdToken(env, idToken) {
  if (!idToken) throw new Error('missing_id_token');
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!resp.ok) throw new Error('invalid_id_token');
  const data = await resp.json();
  const uid = data.users?.[0]?.localId;
  if (!uid) throw new Error('invalid_id_token');

  const accessToken = await getGoogleAccessToken(env);
  const member = await firestoreGetDoc(env, accessToken, `members/${uid}`);
  if (!member || member.fields.isAdmin !== true) throw new Error('not_admin');
  return uid;
}

// ── §370 — מי מחובר, בלי דרישת מנהל ────────────────────────────────────────────────────
// אותה קריאה בדיוק של verifyAdminIdToken, רק בלי בדיקת isAdmin. משמשת את /google-link,
// שבו צריך לדעת רק **מי** מחובר כדי לקשור אליו את חשבון הגוגל שלו.
// ⚠️ בכוונה לא מיזגתי את שתי הפונקציות לאחת עם דגל. verifyAdminIdToken הוא שער-הרשאות
// חי שמגן על כל נתיבי הניהול, ורפקטור שלו לטובת שיתוף-קוד הוא בדיוק סוג השינוי שנופל
// בשקט ופותח דלת. עדיף כפל של ארבע שורות.
export async function uidFromIdToken(env, idToken) {
  if (!idToken) throw new Error('missing_id_token');
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!resp.ok) throw new Error('invalid_id_token');
  const data = await resp.json();
  const uid = data.users?.[0]?.localId;
  if (!uid) throw new Error('invalid_id_token');
  return uid;
}
