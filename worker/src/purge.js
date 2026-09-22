// ══════════════════════════════════════════════════════════════════════════════════════════
//  purge.js — תפוגת עותק-הגיבוי ביומן המחיקות  (§449)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  🔴 **למה זה קיים:** `terms.html?doc=privacy` סעיף 11 מבטיח לאוהד שעותק הגיבוי של
//  הרשומה שלו נשמר **שנים עשר חודשים ואז נמחק**. עד היום לא היה בקוד שום דבר שמוחק
//  אותו — ה-cron של הוורקר מטפל בתור המיילים בלבד. כלומר המסמך הבטיח פעולה שלא קורית.
//  (אותו ממצא עלה מכיוון אחר ב-§447: "אין היום מדיניות תפוגה לרשומות יומן".)
//
//  🔑 **ומה בדיוק נמחק — ההכרעה החשובה כאן, והיא לא "למחוק את המסמך".**
//
//  מסמך ב-`deletionLog` מחזיק **שני דברים שונים לגמרי**:
//    1. **עותק הרשומה** (`data`, `selfReason`, `actorEmail`, `label`) — זה מה שהמסמך
//       מבטיח למחוק, וזה מה שמאפשר שחזור.
//    2. **רישום הביקורת** (`docId`, `deletedAt`, `source`, `state`) — הראיה **שמחיקה
//       התרחשה**. זה בדיוק מה ש-§447 השקיע בו, עד כדי הפעלת Cloud Audit Logs.
//
//  **מחיקת המסמך כולו הייתה מוחקת את שניהם** — כלומר מקיימת את ההבטחה לאוהד ובו-בזמן
//  מוחקת את שובל-הביקורת שנבנה במכוון. לכן כאן **מרוקנים את עותק הרשומה ומשאירים את
//  קליפת הביקורת**. זו בדיוק ההבטחה שבמסמך ("העותק נמחק"), בלי לשלם עליה במה שאינו
//  עותק. ⚠️ **ומרגע זה השחזור של אותה רשומה אינו אפשרי יותר** — זו המשמעות המכוונת של
//  מדיניות התפוגה, ולא תופעת-לוואי. ר' [[project_deletion_log_restore]].
//
//  ── שלוש הגנות, כי הקוד הזה מוחק את רשת-השחזור ─────────────────────────────────────────
//    1. **תקרה לכל ריצה** — באג לא יכול לרוקן את היומן במכה אחת.
//    2. **רשומה בלי `deletedAt` תקין לעולם אינה נבחרת** — לא ב-Firestore (מסמך בלי השדה
//       אינו מוחזר בשאילתת טווח) וגם לא כאן, שוב, במפורש.
//    3. **הבחירה היא פונקציה טהורה** (`selectForPurge`), ולכן ניתנת לבדיקה בלי רשת —
//       ובלי להריץ ולו מחיקה אחת. ר' [[feedback_verification_must_run_the_producer]].
// ══════════════════════════════════════════════════════════════════════════════════════════

import { getGoogleAccessToken } from './jwt.js';
import { firestoreRunRangeQuery, firestorePatch } from './firestore.js';

// 🔑 **ביטוי ה-cron חי כאן ולא ב-`index.js`** — הוא חייב להיות **זהה תו-בתו** למה
// שב-`wrangler.toml`, אחרת `scheduled` לא יזהה את הטריגר, הניקוי לעולם לא ירוץ,
// ו**שום דבר לא ייראה שבור**: המיילים ימשיכו לעבוד והיומן פשוט לא יתנקה לנצח.
// `scratch_test_purge.js` נועל את שני המקומות זה לזה. 03:17 UTC ≈ 06:17 בישראל.
export const PURGE_CRON = '17 3 * * *';

// 🔑 **12 חודשים — הערך חייב להישאר זהה לנוסח ב-`terms.html`** ("שנים עשר חודשים").
// פער בין המספר כאן לנוסח שם הוא הבטחה שבורה, ולכן `scratch_test_purge.js` נועל אותם זה לזה.
export const RETENTION_MONTHS = 12;

// תקרה לכל ריצה. נמוכה בכוונה: ההיקף בפועל הוא יחידות בודדות, ומספר גדול כאן קונה
// מהירות שאף אחד לא צריך במחיר של באג שמרוקן הכל בבת-אחת.
export const MAX_PER_RUN = 50;

// כמה רשומות נשלפות מהשאילתה לפני הסינון. ⚠️ **זו תקרה ידועה:** רשומות שכבר רוקנו
// ממשיכות לחזור בשאילתה (ה-`deletedAt` שלהן לא משתנה), ולכן אם אי-פעם יצטברו יותר
// מ-SCAN_LIMIT רשומות מרוקנות, רשומה חדשה שחצתה את הגבול לא תיראה. בהיקף הנוכחי
// (יחידות בודדות אי-פעם) זה רחוק מאוד — ולכן נרשמת אזהרה מפורשת כשהחלון מתמלא,
// במקום לסבך את השאילתה באינדקס מורכב שדורש הגדרה ידנית בקונסולה.
export const SCAN_LIMIT = 300;

// ── מה מתרוקן ומה נשאר ──────────────────────────────────────────────────────────────────
// ⚠️ **רשימת-היתר הפוכה, ובמכוון:** כאן מנויים השדות שמתרוקנים. שדה חדש שמישהו יוסיף
// למסמך בעתיד **לא** יתרוקן מעצמו — כלומר השגיאה האפשרית היא "נשאר יותר מדי", שנתפסת
// בעין, ולא "נמחק משהו שלא התכוונו אליו", שאינה נתפסת לעולם.
// ר' [[feedback_normalize_drops_unknown_fields]].
export const PURGED_FIELDS = {
  data: null,          // עותק הרשומה עצמה — הלב של ההבטחה
  selfReason: '',      // הטקסט החופשי שהאדם כתב בתשובה ל"למה?"
  actorEmail: '',
  label: '(נמחק בתפוגה)',
  actorName: '(נמחק בתפוגה)',
};

// ── חישוב הגבול ─────────────────────────────────────────────────────────────────────────
// פונקציה טהורה. ⚠️ `setMonth` מטפל נכון בגלישת שנה; לא לכתוב חישוב ימים ביד.
export function cutoffDate(now, months = RETENTION_MONTHS) {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - months);
  return d;
}

// ── הבחירה — פונקציה טהורה, וזה הלב הנבדק של הקובץ ─────────────────────────────────────
// מקבלת שורות כפי ש-`firestoreRunRangeQuery` מחזירה ({ id, fields }) ומחזירה
// { pick: [...], skipped: { alreadyPurged, noDate, futureDate } }.
export function selectForPurge(rows, now, max = MAX_PER_RUN) {
  const cutoff = cutoffDate(now).getTime();
  const pick = [];
  const skipped = { alreadyPurged: 0, noDate: 0, futureDate: 0 };

  for (const r of rows || []) {
    const f = (r && r.fields) || {};

    // כבר רוקנה בריצה קודמת. ⚠️ הסימן הוא `purgedAt` ולא "data ריק" — מסמך ישן
    // שנוצר בלי `data` מסיבה אחרת אינו "מרוקן", והבחנה כזאת חשובה לספירה שמדווחת.
    if (f.purgedAt) { skipped.alreadyPurged++; continue; }

    // 🔴 הגנה 2 — בלי תאריך תקין לא נוגעים. Firestore ממילא לא היה מחזיר מסמך כזה
    // בשאילתת הטווח, וזו שכבה שנייה **בדיוק כי** מחיקה כאן אינה הפיכה.
    const t = f.deletedAt ? Date.parse(f.deletedAt) : NaN;
    if (!Number.isFinite(t)) { skipped.noDate++; continue; }

    // תאריך שעדיין לא חצה את הגבול (או תאריך עתידי משובש) — לא נוגעים.
    if (t >= cutoff) { skipped.futureDate++; continue; }

    pick.push(r.id);
    if (pick.length >= max) break;
  }

  return { pick, skipped };
}

// ── הריצה עצמה ──────────────────────────────────────────────────────────────────────────
// מחזירה סיכום; **אינה זורקת** — היא רצה מתוך cron, ושם זריקה נבלעת בלי שאיש יראה אותה.
export async function runDeletionLogPurge(env, now = new Date()) {
  const summary = { scanned: 0, purged: 0, failed: 0, skipped: null, windowFull: false, error: null };
  try {
    const accessToken = await getGoogleAccessToken(env);
    const cutoff = cutoffDate(now);

    const rows = await firestoreRunRangeQuery(
      env, accessToken, 'deletionLog', 'deletedAt', 'LESS_THAN', cutoff, SCAN_LIMIT,
    );
    summary.scanned = rows.length;
    summary.windowFull = rows.length >= SCAN_LIMIT;

    const { pick, skipped } = selectForPurge(rows, now);
    summary.skipped = skipped;

    for (const id of pick) {
      try {
        await firestorePatch(env, accessToken, `deletionLog/${id}`, {
          ...PURGED_FIELDS,
          purgedAt: now,
        });
        summary.purged++;
      } catch (e) {
        // ⚠️ כישלון ברשומה אחת אינו עוצר את השאר — והוא **נספר**, לא נבלע.
        summary.failed++;
        console.error('purge: רשומה נכשלה', id, e);
      }
    }

    if (summary.windowFull) {
      console.warn('purge: ⚠️ חלון הסריקה מלא (' + SCAN_LIMIT + ') — ייתכן שרשומות חדשות אינן נראות');
    }
    // 🔴 **ללא תנאי, ובכוונה — זו הראיה היחידה שהמנגנון רץ בכלל.**
    // היה כאן `if (purged || failed)`, ו**היום אין ולו רשומה אחת בת 12 חודשים ביומן**:
    // כלומר הריצה הראשונה הייתה מסתיימת בלי להשאיר שום עקבה, ו"רץ ומצא 0" היה נראה
    // **זהה לחלוטין** ל"ה-cron לא נרשם" או "הקוד לא נפרס". שורה אחת ביום היא מחיר
    // אפסי מול מנגנון שמוחק נתונים ואי-אפשר לדעת אם הוא חי.
    // ר' [[feedback_state_not_event_detection]] — היעדר אירוע נקרא כמו "הכל תקין".
    console.log('purge: נסרקו ' + summary.scanned + ', רוקנו ' + summary.purged +
                ', נכשלו ' + summary.failed +
                ', דולגו ' + JSON.stringify(summary.skipped));
  } catch (e) {
    summary.error = String((e && e.message) || e);
    console.error('purge: הריצה נכשלה', e);
  }
  return summary;
}
