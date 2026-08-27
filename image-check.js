// ── image-check.js — בדיקת קובץ-תמונה **ברגע הבחירה** ─────────────────────────────────────
// ר' docs/PROJECT_CONTEXT.md §297.
//
// למה בכלל: עד היום קובץ בעייתי התגלה רק אחרי השליחה, ואז היה מאוחר מדי לומר לנרשם משהו
// מועיל — הוא כבר ראה "הבקשה התקבלה". שני מקרים אמיתיים שנמדדו ב-§296:
//
//   1. **HEIC של אייפון בדפדפן שלא מפענח אותו.** הדחיסה נופלת-לאחור למקור, הקובץ נשמר
//      כ-`image/heic`, עובר את `isImage()` ב-storage.rules — ומגיע למרכז הניהול כתמונה
//      **שבורה**, כי Chrome לא יודע להציג HEIC. המנהל רואה ריבוע ריק בלי לדעת למה.
//      (ב-iOS Safari הפענוח כן עובד, ואז הקובץ מומר ל-WebP/JPEG ואין בעיה בכלל.)
//   2. **קובץ שאינו תמונה** (PDF/מסמך שנבחר בטעות) — מועלה, נדחה בחוקים, והנרשם מקבל
//      הודעת-כשל גנרית במקום לדעת שהוא פשוט בחר את הקובץ הלא-נכון.
//
// שניהם נסגרים באותה נקודה: בודקים שהדפדפן **באמת** יודע לפענח את הקובץ, ואם לא — אומרים
// את זה מיד, עם מה לעשות. הכלל: אם הדפדפן של הנרשם לא הצליח לפתוח את התמונה, גם הדפדפן של
// המנהל לא יצליח. אין טעם להעלות אותה.
//
// ⚠️ מודול משותף ולא עותק בכל דף: fan-register ו-business מריצים את אותה בדיקה על שמונה
// קלטים שונים, ושני עותקים היו מתפצלים ביום הראשון.

// סיומות נבדקות בנוסף ל-type כי קובץ שהגיע משיתוף/אפליקציה מגיע לפעמים עם type ריק לגמרי.
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;

export const IMAGE_CHECK_MESSAGES = {
  notImage:
    'אפשר להעלות רק תמונה (JPG, PNG או WebP). הקובץ שנבחר אינו תמונה — בחרו קובץ אחר.',
  undecodable:
    'לא הצלחנו לפתוח את התמונה הזאת. אם צילמתם באייפון, היא כנראה בפורמט HEIC: פתחו אותה ' +
    'בגלריה, שתפו/שמרו אותה כ-JPG ונסו שוב — או פשוט צלמו צילום מסך שלה והעלו אותו.',
};

// מפענח את הקובץ בדיוק כמו נתיב הדחיסה עצמו, כדי שהבדיקה תשקף את מה שיקרה בפועל ולא
// הערכה נפרדת שעלולה לא להסכים איתו.
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return { source: await createImageBitmap(file), cleanup: () => {} }; } catch (_) {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error('decode-failed'));
      el.src = url;
    });
    return { source: img, cleanup: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * מחזיר null אם הקובץ תקין, או מפתח שגיאה מתוך IMAGE_CHECK_MESSAGES.
 * לעולם לא זורק — קלט לא צפוי מסווג כ-notImage ולא מפיל את הטופס.
 */
export async function checkImageFile(file) {
  if (!file) return null;
  const type = file.type || '';
  const name = file.name || '';

  // ⚠️ טיפוס ריק **אינו** עילה לדחייה. קובץ שהגיע משיתוף/אפליקציה (ולא מבורר-הקבצים) מגיע
  // לעיתים בלי `type` **ובלי סיומת** — והוא תמונה תקינה לגמרי; נמדד ב-§296 שהצינור דוחס
  // אותו בהצלחה ל-1600×1200. גרסה ראשונה של הבדיקה הזאת דחתה אותו, כלומר הייתה חוסמת
  // מקרה שעבד. הכלל: רק טיפוס **מפורש** שאינו תמונה נדחה מיד; ריק → נותנים לפענוח להכריע.
  if (type && !/^image\//.test(type)) return 'notImage';

  let handle = null;
  try {
    handle = await decode(file);
    // רוחב/גובה אפס = פוענח "בהצלחה" אך אין מה לצייר. קורה בקובץ קטוע.
    return (handle.source && handle.source.width && handle.source.height) ? null : 'undecodable';
  } catch (_) {
    // הפענוח נכשל. עכשיו הסיומת קובעת **איזו הודעה** לתת: לקובץ שנראה כמו תמונה נגיד
    // "לא הצלחנו לפתוח" (עם ההסבר על HEIC), ולכל השאר "זו לא תמונה" — כי אמירת HEIC
    // למי שבחר מסמך Word היא בדיוק סוג ההודעה ששולחת אנשים לכיוון הלא-נכון.
    if (!type && !IMAGE_EXT.test(name)) return 'notImage';
    return 'undecodable';
  } finally {
    try { handle?.cleanup?.(); handle?.source?.close?.(); } catch (_) {}
  }
}

/**
 * מחבר את הבדיקה לקלטי-קובץ לפי מזהים. קלט שנכשל **מתרוקן** — כך שהוולידציה הקיימת של
 * הטופס רואה "לא נבחר קובץ" ומתנהגת כרגיל, בלי שנצטרך לגעת בה.
 *
 * @param {string[]} ids            מזהי אלמנטי input[type=file]
 * @param {(id:string)=>Element|null} [errorSlot]  איפה לשים את הודעת השגיאה. ברירת מחדל:
 *                                  אלמנט חדש מיד אחרי הקלט.
 */
export function attachImageGuard(ids, errorSlot) {
  for (const id of ids) {
    const input = document.getElementById(id);
    if (!input || input.dataset.imgGuard) continue;
    input.dataset.imgGuard = '1';

    let slot = errorSlot ? errorSlot(id) : null;
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'field-error';
      input.insertAdjacentElement('afterend', slot);
    }
    const show = (msg, isErr) => {
      slot.textContent = msg || '';
      slot.style.display = msg ? 'block' : 'none';
      slot.style.opacity = isErr ? '' : '.75';
    };

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return show('');
      // תמונה גדולה לוקחת מאות מ"ש לפענוח — בלי השורה הזאת נראה כאילו כלום לא קרה.
      show('בודקים את הקובץ…', false);
      const bad = await checkImageFile(file);
      if (!bad) return show('');
      input.value = '';
      show(IMAGE_CHECK_MESSAGES[bad], true);
    });
  }
}
