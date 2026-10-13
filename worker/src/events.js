// ══ §519 — אירועי מדידה דרך הוורקר (POST /event) ═════════════════════════════════════════════
// ארבעה דפים כותבים אירועים ב-REST ישיר ל-Firestore בלי ה-SDK (download.html, landing.html, open.html,
// usage-track.js) – כדי להישאר קלים. כשנאכוף App Check על Firestore, בקשת REST בלי טוקן תיחסם, ולכן
// הם עוברים לכאן: הוורקר כותב עם מפתח השירות. **אותה סכמה בדיוק כמו match /events ב-firestore.rules**
// (רשימת-היתר של שדות וסוגים, אורכים, device) – כך שהנתיב הזה לא פותח שום דבר שהחוקים סוגרים.
// + 'appCheck' (§519): האם הדף קיבל טוקן App Check, לפי משטח (app/pwa/web) – המדידה של שלב 2.
// מכסה ל-IP. createdAt = זמן השרת.
import { getGoogleAccessToken } from './jwt.js';
import { firestoreCreateDoc } from './firestore.js';

export const EVENT_TYPES = new Set([
  'pageView', 'bizImpression', 'bizClick', 'bizContact', 'heart',
  'gateBlock', 'landingBlockClick', 'formOpen', 'formSubmit',
  'formError', 'formStep', 'benefitRedeem', 'loginFail', 'loginOk',
  'appBannerShown', 'appBannerClick', 'scrollDepth', 'visit', 'engaged',
  'appCheck',
]);
const LIMITS = { bizId: 100, memberId: 100, path: 200, referrer: 50, blockId: 50, channel: 50, phone: 20, email: 80 };

export function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  const allowed = new Set(['type', 'sessionId', 'device', ...Object.keys(LIMITS)]);
  if (keys.some((k) => !allowed.has(k))) return null;
  const { type, sessionId, device } = input;
  if (!EVENT_TYPES.has(type)) return null;
  if (device !== 'mobile' && device !== 'desktop') return null;
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 100) return null;
  const out = { type, sessionId, device };
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = input[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || v.length > max) return null;
    out[k] = v;
  }
  return out;
}

export async function handleEvent(input, env) {
  const ev = validateEvent(input);
  if (!ev) return { error: 'invalid_request' };
  const at = await getGoogleAccessToken(env);
  await firestoreCreateDoc(env, at, 'events', { ...ev, createdAt: new Date() });
  return { ok: true };
}
