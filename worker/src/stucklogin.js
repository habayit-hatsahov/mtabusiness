// ══ §769 — "תקועים": חבר מאושר שקיבל מפתח כניסה ולא הגיע לדף הבית ═══════════════════════════════
// רמי: "שהיא תתעדכן כל פעם שנראה שמישהו מאושר לא הצליח להתחבר… שיופיעו בתקלות כניסה, שנדע לחזור אליהם".
//
// (1) noteMemberToken – בכל הנפקת custom token לחבר (קוד, Google, Apple, כניסה לבד מהמכשיר שנרשם) נכתב
//     על הרשומה `tokenAt` + `tokenVia`. זה הרגע שבו **השרת** כבר אישר אותו – מכאן הכול תלוי במכשיר.
// (2) runStuckLogins – בכל 10 דק' (מה-cron): מי שקיבל מפתח לפני 10 דק'+ ולא הגיע לדף הבית מאז
//     (`lastSeenAt` – נכתב ע"י home.html) → אירוע `loginFail` אחד עם channel 'stuck' ב-events, עם memberId
//     וטלפון. הוא נכנס לבד ל"תקלות כניסה" במרכז הניהול ("תקלה שלנו"), וכשהחבר ייכנס – אותו מסך כבר
//     מסמן "✅ נכנס בסוף" (כל אירוע עם memberId אחרי זמן הכשל). createdAt = זמן הכתיבה (ר' למטה).
// 🔑 למה בשרת ולא בדף: אצל מי שנתקע באמת (§766–§767) שום דבר מהמכשיר לא מגיע ל-Firestore – גם לא loginFail.
// ⚠️ פעם אחת לכל מפתח: `stuckFor` = ה-tokenAt שכבר דווח. ניסיון חדש (מפתח חדש) שנתקע – שורה חדשה.
import { getGoogleAccessToken } from './jwt.js';
import { firestorePatch, firestoreRunRangeQuery, firestoreCreateDoc } from './firestore.js';

export const STUCK_AFTER_MS = 10 * 60 * 1000;
const LOOKBACK_MS = 3 * 24 * 3600 * 1000;

// לא נכשל אף פעם: כניסה שהצליחה לא נופלת בגלל רישום.
export async function noteMemberToken(env, memberId, via, accessToken) {
  try {
    if (typeof memberId !== 'string' || !memberId) return;
    const t = accessToken || await getGoogleAccessToken(env);
    await firestorePatch(env, t, `members/${memberId}`, { tokenAt: new Date(), tokenVia: String(via || '').slice(0, 20) });
  } catch (e) { console.error('noteMemberToken failed', String(e)); }
}

const ms = (v) => { const n = v ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : 0; };

export async function runStuckLogins(env, accessToken, now = Date.now()) {
  const rows = await firestoreRunRangeQuery(env, accessToken, 'members', 'tokenAt', 'GREATER_THAN_OR_EQUAL', new Date(now - LOOKBACK_MS), 300);
  let wrote = 0;
  for (const { id, fields: f } of rows) {
    const tok = ms(f.tokenAt);
    if (!tok || now - tok < STUCK_AFTER_MS) continue;           // עוד לא עברו 10 דק'
    if (f.status !== 'approved' || f.isAdmin === true) continue;
    if (ms(f.lastSeenAt) >= tok - 60 * 1000) continue;          // הגיע לדף הבית אחרי המפתח (דקה מרווח לשעונים)
    if (f.stuckFor === f.tokenAt) continue;                      // כבר דווח על המפתח הזה
    await firestoreCreateDoc(env, accessToken, 'events', {
      type: 'loginFail', bizId: null, memberId: id,
      sessionId: ('srv_' + id.slice(0, 10) + '_' + tok.toString(36)).slice(0, 50),
      path: '/welcome.html', referrer: null, device: 'mobile',
      blockId: ('via:' + (f.tokenVia || '?')).slice(0, 50), channel: 'stuck',
      ...(typeof f.phone === 'string' && f.phone ? { phone: f.phone.slice(0, 20) } : {}),
      // ⚠️ זמן הכתיבה ולא זמן המפתח: מרכז הניהול טוען את האירועים בהשלמה (delta) רק מ'האחרון שכבר יש לו פחות 15 דק'',
      // ואירוע עם זמן בעבר לא נשלף לעולם (נתפס חי, 11.11). 'נכנס בסוף' לא נפגע: נכתב רק למי שלא הגיע לדף הבית מאז המפתח.
      createdAt: new Date(now),
    });
    await firestorePatch(env, accessToken, `members/${id}`, { stuckFor: f.tokenAt });
    wrote++;
  }
  return { checked: rows.length, wrote };
}
