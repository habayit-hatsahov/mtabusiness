import { getGoogleAccessToken } from './jwt.js';
import { firestorePatch, bizIdFromToken } from './firestore.js';
import { uploadToFirebaseStorage } from './storage.js';

// מקבל FormData עם accessToken + קבצים (fanPhoto/logo גולמיים, cover/coverThumb/gallery/galleryThumb
// כבר דחוסים בצד-לקוח — אותה דחיסה בדיוק כמו קודם, ר' compressToFile ב-business.html) ומעלה ל-Firebase
// Storage מצד-השרת עם service account. מחליף את הזרימה הישנה (mint-biz-token→signInWithCustomToken→
// uploadBytes דרך ה-Client SDK, תלויה בטאב פתוח): ברגע שהבקשה הזו התקבלה כאן, ההעלאה ממשיכה עד הסוף
// גם אם המשתמש סוגר את הדף. accessToken מזהה את העסק (אותו מנגנון בדיוק כמו handleBusinessLogin
// ב-index.js) — לא סומכים על bizId גולמי מהלקוח.
export async function handleUploadBizMedia(request, env) {
  const form = await request.formData();
  const bizToken = form.get('accessToken');
  if (!bizToken) return { error: 'missing_access_token' };

  const googleToken = await getGoogleAccessToken(env);
  // §244 — הטוקן עבר ל-bizTokens/{businessId}, ר' bizIdFromToken ב-firestore.js
  const bizId = await bizIdFromToken(env, googleToken, bizToken);
  if (!bizId) return { error: 'invalid_token' };

  const updates = {};
  const tasks = [];
  // כל כשל-העלאה נאסף כאן וחוזר ללקוח (2026-08-22). קודם כל catch רשם console.error והפונקציה
  // החזירה { ok: true } בכל מקרה — כלומר עסק שנרשם עם תמונות יכול היה לקבל 'הבקשה התקבלה'
  // מלא בלי שאף תמונה נשמרה, ואיש לא ידע על כך: לא הוא, לא המנהל.
  const failed = [];

  // ── §382 — ראיית-האימות לא נוגעת יותר במסמך הציבורי ──────────────────────────────────────
  // שני שינויים, ורק הראשון הוא התיקון האמיתי:
  //
  //   1. 🔑 **הכתובת עוברת ל-`bizProofs/{bizId}`** במקום לשדה `photoProofUrl` על מסמך העסק.
  //      מסמך של עסק מאושר נקרא **ציבורית במלואו**, ולכן כתובת ההורדה — שנושאת טוקן שעוקף
  //      את חוקי ה-Storage — הייתה זמינה לכל אחד בקריאה אנונימית אחת. נמדד: 2 מתוך 56.
  //
  //   2. **שם-הקובץ אקראי** במקום `${bizId}_fan`. ⚠️ זו הגנה משלימה בלבד ו**לא** התיקון:
  //      `bizId` הוא מזהה של מסמך ציבורי, ולכן הנתיב הישן היה ניחוש טריוויאלי — אבל גם נתיב
  //      אקראי לא היה עוזר כל עוד הכתובת המלאה יושבת על מסמך ציבורי. ר' §293, שעשה בדיוק
  //      את אותו צעד בצד האוהד — ונעצר שם, בלי לחצות לצד העסקים.
  //
  // ⚠️ **קבצים ישנים נשארים בנתיב הישן.** הכתובת שלהם יורדת מהמסמך הציבורי במיגרציה,
  // אבל הקובץ עצמו עדיין נשלף בניחוש `members/proofs/{bizId}_fan` עד שיימחק ידנית.
  const fanPhoto = form.get('fanPhoto');
  if (fanPhoto && fanPhoto.size) {
    const proofPath = `members/proofs/${bizId}_${crypto.randomUUID()}`;
    tasks.push(
      fanPhoto.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, proofPath, bytes, fanPhoto.type || 'image/jpeg'))
        .then((url) => firestorePatch(env, googleToken, `bizProofs/${bizId}`, { photoProofUrl: url, at: new Date() }))
        .catch((e) => { console.error('fan photo upload failed:', e.message); failed.push('fanPhoto'); })
    );
  }

  const logo = form.get('logo');
  if (logo && logo.size) {
    tasks.push(
      logo.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/logo_${Date.now()}`, bytes, logo.type || 'image/jpeg'))
        .then((url) => { updates.logo = url; })
        .catch((e) => { console.error('logo upload failed:', e.message); failed.push('logo'); })
    );
  }

  const cover = form.get('cover');
  if (cover && cover.size) {
    tasks.push(
      cover.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/cover_${Date.now()}`, bytes, cover.type || 'image/webp'))
        .then((url) => { updates.coverPhoto = url; })
        .catch((e) => { console.error('cover upload failed:', e.message); failed.push('cover'); })
    );
  }
  const coverThumb = form.get('coverThumb');
  if (coverThumb && coverThumb.size) {
    tasks.push(
      coverThumb.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/cover_${Date.now()}_thumb`, bytes, coverThumb.type || 'image/webp'))
        .then((url) => { updates.coverPhotoThumb = url; })
        .catch((e) => { console.error('cover thumb upload failed:', e.message); failed.push('coverThumb'); })
    );
  }

  const galleryFiles = form.getAll('gallery');
  if (galleryFiles.length) {
    const photos = new Array(galleryFiles.length);
    updates.photos = photos;
    galleryFiles.forEach((f, i) => {
      tasks.push(
        f.arrayBuffer()
          .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/gallery_${Date.now()}_${i}`, bytes, f.type || 'image/webp'))
          .then((url) => { photos[i] = { url, name: f.name }; })
          .catch((e) => {
            console.error('gallery photo upload failed:', e.message);
            photos[i] = { url: '', name: f.name };
            failed.push('gallery[' + i + ']');
          })
      );
    });
  }

  // כל הקבצים מועלים במקביל (לא ברצף) — הזמן הכולל מוגבל לתמונה-האיטית-ביותר, לא לסכום כולן.
  // חשוב במיוחד ל"שולח..." שמוצג ללקוח לפני שרואים "הבקשה התקבלה" (ר' business.html).
  await Promise.all(tasks);

  // תמונת-גלריה שנכשלה נשארה קודם כרשומה ריקה ({ url: '', name }) בתוך photos — היא נספרת
  // כתמונה בכל מקום שסופר photos.length, אבל אין מה להציג בה. מסננים אותה החוצה.
  if (updates.photos) updates.photos = updates.photos.filter((ph) => ph && ph.url);

  if (Object.keys(updates).length) {
    await firestorePatch(env, googleToken, `businesses/${bizId}`, updates);
  }

  // כשל-העלאה נרשם גם על מסמך העסק עצמו — עד היום זה היה console.error בלוג של ה-Worker
  // בלבד, שנעלם תוך דקות. ⚠️ השדות האלה עדיין *לא* מוצגים בשום מסך ניהול; הם קיימים כדי
  // שיהיה מה לשלוף כשעסק מדווח "שלחתי תמונות ואין", ובהמשך אפשר לרנדר אותם באדמין.
  if (failed.length) {
    await firestorePatch(env, googleToken, `businesses/${bizId}`, {
      mediaUploadFailedAt: new Date(),
      mediaUploadFailed: failed,
    }).catch((e) => console.error('media failure flag write failed:', e.message));
  }

  return { ok: failed.length === 0, uploadedFields: Object.keys(updates), failed };
}
