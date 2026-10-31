// ══ §672 — "צריך לתקן" (שלב 2): בעל העסק מסמן שתיקן, ורמי מקבל התראה ═══════════════════════════
// רמי (29.10): "המסלול: צריך לתקן ← הוא שולח תיקון ← חוזר לממתין עם 🔁 תוקן… ושיתריע לי מבקשות מבעלי
// עסקים". שלושה מקורות לתיקון/בקשה, אותה התראה (פוש לכל מנהל עם מכשיר + מייל, כמו §548):
//   1. /biz-fix-done – "✅ תיקנתי – שליחה לבדיקה" בדשבורד העסק. הזיהוי – טוקן העסק בלבד (כמו
//      /biz-reg-status). עסק שלא ב"צריך לתקן" – לא נכתב כלום.
//   2. /upload-biz-media על עסק ב"צריך לתקן" (מסך "העסק שלך אצלנו", §664) – markFixFromUpload.
//   3. בקשת שינוי מהדשבורד (pendingChanges נכתב מהדפדפן, בלי וורקר) – runBizRequestAlerts בסריקה
//      של ה-cron: עסק עם pendingChangesAt חדש מ-adminAlertedChangesAt. רבע שעה שקטה לעסק, כדי
//      שבעל עסק ששומר חמש פעמים ברצף לא יקפיץ חמש התראות.
// fixSubmittedAt = "🔁 תוקן" במרכז הניהול; "סיכום ושליחה" מאפס אותו בסבב הבא/באישור/בדחייה.
import { getGoogleAccessToken } from './jwt.js';
import { firestoreGetDoc, firestorePatch, firestoreCreateDoc, firestoreRunQuery, firestoreRunRangeQuery, bizIdFromToken } from './firestore.js';
import { sendFcmToMember } from './fcm.js';
import { sendAdminAlertEmail } from './brevo.js';

const ADMIN_EMAIL = 'yellowzonemta@gmail.com';
const BIZ_ID_RE = /^[A-Za-z0-9]{20}$/;
const str = (f, k) => (typeof f[k] === 'string' ? f[k] : '');
const inFix = (f) => f.inReview === true && (str(f, 'status') === 'pending' || str(f, 'status') === 'approved');
const QUIET_MS = 15 * 60 * 1000;

// פוש לכל מנהל שיש לו מכשיר + מייל. כשל באחד לא מפיל את השני.
export async function alertAdmins(env, accessToken, { title, line, rows }) {
  const out = { email: 'skipped', push: 0 };
  try {
    await sendAdminAlertEmail(env, { to: ADMIN_EMAIL, subject: title, rows });
    out.email = 'sent';
  } catch (e) { console.error('admin alert email failed', e); out.email = 'failed'; }
  try {
    const admins = await firestoreRunQuery(env, accessToken, 'members', 'isAdmin', true, 10);
    for (const a of admins) {
      const tokens = a.fields.nativePushTokens || {};
      if (!Object.keys(tokens).length) continue;
      const r = await sendFcmToMember(env, accessToken, tokens, { title, body: line, data: { link: '/admin-dashboard.html' } });
      out.push += r.sent;
      if (r.deadKeys.length) {
        const remaining = Object.fromEntries(Object.entries(tokens).filter(([k]) => !r.deadKeys.includes(k)));
        try { await firestorePatch(env, accessToken, `members/${a.id}`, { nativePushTokens: remaining }); } catch (e) {}
      }
    }
  } catch (e) { console.error('admin alert push failed', e); }
  return out;
}

async function markFixed(env, accessToken, bizId, f, how) {
  const now = new Date();
  await firestorePatch(env, accessToken, `businesses/${bizId}`, { fixSubmittedAt: now });
  try {
    await firestoreCreateDoc(env, accessToken, `businesses/${bizId}/activity`, {
      type: 'fixDone', title: '🔁 בעל העסק שלח תיקון', detail: how, field: 'fixSubmittedAt', before: null, after: 'submitted',
      source: 'owner', actorName: str(f, 'ownerFirst'), createdAt: now,
    });
  } catch (e) { console.error('fixDone activity failed', e); }
  const name = str(f, 'name') || 'עסק';
  await alertAdmins(env, accessToken, {
    title: `🔁 ${name} תיקן – מחכה לבדיקה`,
    line: `${str(f, 'ownerFirst') || 'בעל העסק'} שלח תיקון (${how}).`,
    rows: [['מה קרה', 'בעל העסק שלח תיקון ל"צריך לתקן"'], ['איך', how], ['שם העסק', name], ['בעל העסק', str(f, 'ownerFirst')], ['מזהה עסק', bizId]],
  });
}

export async function handleBizFixDone({ bizId, token } = {}, env) {
  if (typeof bizId !== 'string' || !BIZ_ID_RE.test(bizId)) return { error: 'invalid' };
  if (typeof token !== 'string' || token.length < 16 || token.length > 200) return { error: 'invalid' };
  const accessToken = await getGoogleAccessToken(env);
  if ((await bizIdFromToken(env, accessToken, token)) !== bizId) return { error: 'invalid' };
  const b = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  if (!b) return { error: 'gone' };
  const f = b.fields || {};
  if (!inFix(f)) return { ok: true, status: str(f, 'status') || 'pending', notInFix: true };
  await markFixed(env, accessToken, bizId, f, 'סימן "תיקנתי" בדשבורד העסק');
  return { ok: true };
}

// מ-/upload-biz-media: העלאה לעסק ב"צריך לתקן" היא תיקון
export async function markFixFromUpload(env, accessToken, bizId, uploadedFields) {
  const b = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  const f = (b && b.fields) || {};
  if (!inFix(f)) return;
  await markFixed(env, accessToken, bizId, f, 'העלה תמונות: ' + uploadedFields.join(', '));
}

// הסריקה: בקשות שינוי חדשות מהדשבורד (pendingChanges). רצה מה-cron כל 5 דקות.
export async function runBizRequestAlerts(env, accessToken) {
  const since = new Date(Date.now() - 30 * 60 * 1000);   // הסריקה כל 5 דק' – חצי שעה מספיקה, ובפריסה לא מתפרצות התראות על בקשות ישנות
  const rows = await firestoreRunRangeQuery(env, accessToken, 'businesses', 'pendingChangesAt', 'GREATER_THAN_OR_EQUAL', since, 50);
  let sent = 0;
  for (const { id, fields: f } of rows) {
    const at = f.pendingChangesAt instanceof Date ? f.pendingChangesAt : new Date(f.pendingChangesAt);
    const last = f.adminAlertedChangesAt ? new Date(f.adminAlertedChangesAt) : null;
    if (!(at > 0) || (last && at <= last)) continue;
    if (last && Date.now() - last.getTime() < QUIET_MS) continue;
    const name = str(f, 'name') || 'עסק';
    const keys = Object.keys(f.pendingChanges || {}).filter((k) => !/Thumb$|^discountBuilder$|^discountText$|^cat$/.test(k));
    await firestorePatch(env, accessToken, `businesses/${id}`, { adminAlertedChangesAt: new Date() });
    await alertAdmins(env, accessToken, {
      title: `📝 ${name} ביקש שינויים`,
      line: `${keys.length || 'כמה'} שינויים מחכים לך${inFix(f) ? ' – העסק ב"צריך לתקן"' : ''}.`,
      rows: [['מה קרה', 'בקשת שינוי מדשבורד העסק'], ['שם העסק', name], ['שדות', keys.join(', ')], ['צריך לתקן', inFix(f) ? 'כן' : ''], ['מזהה עסק', id]],
    });
    sent++;
  }
  return { scanned: rows.length, sent };
}
