// ══ §519 — אימות טוקן App Check בוורקר (שלב מדידה: רושם, לא חוסם) ═══════════════════════════
// הדפים מצרפים X-Firebase-AppCheck לכל בקשה לוורקר (app-check.js עוטף את fetch). כאן בודקים אותו
// ורושמים **מדגם** (1 מכל 10) כאירוע appCheck: `w:<נתיב>:ok|missing|bad` – כדי לדעת, לפני אכיפה,
// שכמעט כל הבקשות מהאתר/האפליקציות מגיעות עם טוקן תקין. האכיפה תבוא אחרי המדידה (שלב 3).
// אימות: JWT RS256 מול ה-JWKS של App Check; iss = .../<מספר הפרויקט>; aud כולל projects/<מספר>.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getGoogleAccessToken } from './jwt.js';
import { firestoreCreateDoc } from './firestore.js';

const PROJECT_NUMBER = '459607487972';
const JWKS = createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'));

export async function checkAppCheck(request) {
  const token = request.headers.get('X-Firebase-AppCheck') || '';
  if (!token) return 'missing';
  try {
    await jwtVerify(token, JWKS, {
      issuer: `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`,
      audience: `projects/${PROJECT_NUMBER}`,
    });
    return 'ok';
  } catch (e) {
    return 'bad';
  }
}

// נתיבים ציבוריים (בלי אימות משתמש) – אלה שהאכיפה תגן עליהם
export const APPCHECK_PATHS = new Set([
  '/check-member-exists', '/resend-login-code', '/mint-member-token', '/submit-member', '/check-biz-exists',
  '/demo-session', '/link-biz-owner', '/biz-short-title', '/event', '/public-biz-list', '/shorten-benefit', '/suggest-fallback-images',
  '/upload-biz-media', '/google-login', '/apple-login', '/biz-reg-failed', '/upload-member-proof',
]);

export async function sampleAppCheck(request, env, path) {
  if (Math.random() >= 0.1) return;
  const res = await checkAppCheck(request);
  const at = await getGoogleAccessToken(env);
  await firestoreCreateDoc(env, at, 'events', {
    type: 'appCheck', sessionId: 'worker', device: 'desktop',
    channel: ('w:' + path.replace(/^\//, '') + ':' + res).slice(0, 50), createdAt: new Date(),
  });
}
