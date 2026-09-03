// ══════════════════════════════════════════════════════════════════════════════════════════
//  deletion-log.js — יומן מחיקות ושחזור  (§393)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  למה הקובץ הזה קיים:
//  ב-§392 נמחקה רשומת-חבר אמיתית, **ולא הייתה שום דרך לברר מי מחק אותה.** deleteDoc מוחק
//  ולא משאיר עקבות; ל-Firestore אין לוג-ביקורת מובנה; ולוג-הכתיבות של Cloud Logging מעולם
//  לא הופעל בפרויקט. בדיקה על 24 שעות החזירה אפס רשומות. כלומר: הרשומה נעלמה, וזהו.
//
//  🔑 **הסדר הוא כל העניין: רושמים, ורק אם הרישום הצליח — מוחקים.**
//  רישום *אחרי* המחיקה נראה כמעט זהה בקוד, ומייצר בדיוק את המצב של §392 בכל פעם שהכתיבה
//  נכשלת (הרשאות, רשת, שדה חורג) — הרשומה נעלמת והיומן ריק. לכן addDoc כאן אינו עטוף
//  ב-catch: כשל שלו מבטל את המחיקה. זו ההפך הגמור מ-logActivity, שם כשל-רישום *כן* נבלע
//  בכוונה — כי שם הפעולה עצמה כבר קרתה ואי-אפשר להחזיר אותה.
//
//  🔑 **הצילום נקרא מ-Firestore ולא מהזיכרון של המסך.** MOCK_FANS/members/businesses הם
//  גרסאות מעובדות (hydrate, המרות תאריך, שדות שמוזרקים ממקורות אחרים) — צילום מהן היה
//  משחזר משהו *דומה* לרשומה, לא אותה. getDoc נותן את המסמך כפי שהוא.
//
//  ⚠️ **מה הצילום לא כולל, ולמה זה בסדר:** deleteDoc ב-Firestore **אינו מוחק תת-אוספים.**
//  members/{id}/activity ו-businesses/{id}/activity שורדים את המחיקה כיתומים, וברגע
//  שמסמך-האב משוחזר על אותו ID — היומן ההיסטורי חוזר איתו מעצמו. גם memberCodes/{id},
//  bizProofs/{id} ו-bizTokens/{id} הם מסמכים נפרדים שהמחיקה כלל לא נוגעת בהם.
//
//  ⚠️ **קבצי Storage** (תמונות עסק/ראיות-אימות) גם הם אינם נמחקים, ולכן הכתובות בצילום
//  ממשיכות להצביע על קבצים קיימים אחרי שחזור.
//
// ══════════════════════════════════════════════════════════════════════════════════════════

import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

export const DELETION_LOG = 'deletionLog';

// ── תווית-זיהוי לרשומה שנמחקת ───────────────────────────────────────────────────────────────
// 🔑 **זה השורש המדויק של §392.** חלון-האישור הציג שם בלבד — ובאותו ערב היו במערכת *שתי*
// רשומות בשם "רמי בנטולילה" (האמיתית, ורשומת-בדיקה שנרשמה עם חשבון העבודה). אישור שמציג
// שם משותף לשתי רשומות אינו אישור: הוא נראה בדיוק אותו דבר בשני המקרים.
// לכן כל מקום שמאשר מחיקה — ובכל שלוש הדלתות — מציג מכאן גם טלפון, מייל ומספר-חבר.
export function deletionLabel(collectionName, data) {
  const d = data || {};
  if (collectionName === 'members') {
    const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || '(ללא שם)';
    return {
      name,
      lines: [
        d.phone ? `טלפון: ${d.phone}` : '',
        d.email ? `מייל: ${d.email}` : '',
        d.memberNumber ? `חבר מספר ${d.memberNumber}` : '',
        d.status ? `סטטוס: ${d.status}` : '',
      ].filter(Boolean),
    };
  }
  const owner = `${d.ownerFirst || ''} ${d.ownerLast || ''}`.trim();
  return {
    name: d.name || '(ללא שם)',
    lines: [
      owner ? `בעלים: ${owner}` : '',
      (d.ownerPhone || d.phone) ? `טלפון: ${d.ownerPhone || d.phone}` : '',
      d.ownerEmail ? `מייל: ${d.ownerEmail}` : '',
      d.status ? `סטטוס: ${d.status}` : '',
    ].filter(Boolean),
  };
}

// טקסט חלון-האישור. אותו נוסח בשלוש הדלתות — כולל שורות-הזיהוי, ובלי ההבטחה הישנה
// "לא ניתן לשחזר", שמהיום פשוט אינה נכונה.
export function deletionConfirmText(collectionName, data) {
  const { name, lines } = deletionLabel(collectionName, data);
  const what = collectionName === 'members' ? 'האוהד' : 'העסק';
  return [
    `למחוק לצמיתות את "${name}"?`,
    '',
    ...lines,
    '',
    '⚠️ ודא/י שזו הרשומה הנכונה — ייתכנו כמה רשומות באותו שם.',
    '',
    'הרשומה תירשם ביומן המחיקות (מי מחק, מתי, ותוכן מלא) וניתן יהיה לשחזר אותה משם.',
    `אם רק רצית ש${what} לא יופיע — "דחייה" עדיפה על מחיקה.`,
  ].join('\n');
}

// ── זהות המוחק ──────────────────────────────────────────────────────────────────────────────
// admin-dashboard.html מחזיק CURRENT_ADMIN מוכן; שני הדפים הישנים לא מחזיקים זהות כלל, ולכן
// כאן שולפים אותה מרשומת-החבר של המשתמש המחובר. נכשל? נרשם uid בלבד — **שם חסר לא מבטל
// את הרישום**, כי uid לבדו כבר עונה על השאלה "מי מחק".
export async function resolveActor(db, user, fallback) {
  if (fallback && fallback.uid && fallback.name) return fallback;
  if (!user) return { uid: null, name: '(לא ידוע)', email: '' };
  try {
    const s = await getDoc(doc(db, 'members', user.uid));
    const d = s.exists() ? s.data() : {};
    const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email || user.email || user.uid;
    return { uid: user.uid, name, email: d.email || user.email || '' };
  } catch {
    return { uid: user.uid, name: user.email || user.uid, email: user.email || '' };
  }
}

// ── רישום ואז מחיקה ─────────────────────────────────────────────────────────────────────────
// מחזירה { ok, reason }. reason === 'missing' = לא היה מה למחוק (המסמך כבר לא שם) — מצב
// אמיתי ולא שגיאה, ולכן הוא **נאמר** ולא נבלע בשקט כ"הצלחה".
export async function logAndDelete(db, collectionName, docId, actor, source) {
  const snap = await getDoc(doc(db, collectionName, docId));
  if (!snap.exists()) return { ok: false, reason: 'missing' };
  const data = snap.data();
  const { name } = deletionLabel(collectionName, data);

  // ⚠️ בלי catch, ובכוונה — ר' ההערה בראש הקובץ. כשל כאן מפיל את הפונקציה כולה, והמחיקה
  // למטה לא מגיעה לרוץ. זו הנקודה שכל §393 קיים בשבילה.
  const logRef = await addDoc(collection(db, DELETION_LOG), {
    collectionName, docId, data, label: name,
    actorUid: (actor && actor.uid) || null,
    actorName: (actor && actor.name) || '(לא ידוע)',
    actorEmail: (actor && actor.email) || '',
    source: source || 'admin',
    deletedAt: serverTimestamp(),
    // 'attempted' עד שהמחיקה עצמה חוזרת בהצלחה. רשומה שנתקעה כאן אומרת "ניסינו ולא ידוע
    // אם הצליח" — וזה בדיוק המידע שהיה חסר ב-§392, ולא ערך שראוי להמציא לו ודאות.
    state: 'attempted',
    restoredAt: null, restoredBy: null,
  });

  await deleteDoc(doc(db, collectionName, docId));
  // כשל כאן משאיר את הרשומה על 'attempted' — מצב עקבי: המסמך עדיין קיים, והשחזור יסרב
  // ממילא כי הוא בודק חי אם היעד תפוס.
  try { await updateDoc(logRef, { state: 'deleted' }); }
  catch (e) { console.error('deletion-log state update failed:', e); }
  return { ok: true, logId: logRef.id, name };
}

// ── קריאת היומן ─────────────────────────────────────────────────────────────────────────────
export async function fetchDeletionLog(db, max) {
  const s = await getDocs(query(collection(db, DELETION_LOG), orderBy('deletedAt', 'desc'), limit(max || 200)));
  return s.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

// ── שחזור ───────────────────────────────────────────────────────────────────────────────────
// 🔑 **הבדיקה היא חיה, לא מהרשומה.** state/restoredAt ביומן הם צילום-עבר; מה שקובע אם מותר
// לכתוב הוא האם ה-ID תפוס **עכשיו**. זה בדיוק הלקח של §392 — כשמדידה חיה סותרת רשומה ישנה,
// החיה צודקת. בלי הבדיקה הזאת, "שחזור" של רשומה שנרשמה מחדש בינתיים היה **דורס** אותה
// בגרסה ישנה, בלי שום סימן.
export async function restoreDeleted(db, logId, actor) {
  const logSnap = await getDoc(doc(db, DELETION_LOG, logId));
  if (!logSnap.exists()) return { ok: false, reason: 'noLog' };
  const entry = logSnap.data();
  if (!entry.data || !entry.collectionName || !entry.docId) return { ok: false, reason: 'noData' };

  const target = doc(db, entry.collectionName, entry.docId);
  const cur = await getDoc(target);
  if (cur.exists()) return { ok: false, reason: 'occupied' };

  await setDoc(target, entry.data);
  await updateDoc(doc(db, DELETION_LOG, logId), {
    state: 'restored',
    restoredAt: serverTimestamp(),
    restoredBy: (actor && actor.name) || '(לא ידוע)',
  });
  return { ok: true, name: entry.label || entry.docId };
}
