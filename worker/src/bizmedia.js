import { getGoogleAccessToken } from './jwt.js';
import { firestorePatch, bizIdFromToken, claimBizToken } from './firestore.js';
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
  let bizId = await bizIdFromToken(env, googleToken, bizToken);

  // ── §419 — נפילה-לאחור כשהטוקן עדיין לא נכתב ל-Firestore ────────────────────────────────
  // `bizId` הגולמי מהלקוח **אינו** מקור-סמכות ולא הפך לכזה: claimBizToken מאמת מול השרת
  // שהמסמך אינו קיים, שהעסק קיים, ושהוא `pending` — בדיוק שלושת התנאים שהחוקים אוכפים
  // ממילא על יצירה אנונימית. הוא משמש **רק** כשהטוקן לא נמצא, כלומר במצב שעד היום החזיר
  // `invalid_token` והפיל את כל התמונות. ר' ההסבר המלא ב-firestore.js.
  if (!bizId) {
    const claimed = form.get('bizId');
    if (claimed) bizId = await claimBizToken(env, googleToken, String(claimed), bizToken);
  }
  if (!bizId) return { error: 'invalid_token' };

  // ── §422 — כתובת של קובץ שכבר עלה, במקום בייטים ────────────────────────────────────────
  // הלקוח מעלה כל תמונה ל-`bizUploads/{uploadId}/` ברגע הבחירה (storage.rules §422),
  // ובשליחה נוסעת רק הכתובת. הבקשה שהייתה עד היום כמה מגה-בייטים הופכת למחרוזות.
  //
  // ⚠️ **ולידציה חובה, וזו הנקודה הקריטית כאן.** הכתובת מגיעה מהלקוח, והיא נכתבת ישר
  // למסמך העסק שמוצג לכל אוהד. בלי הבדיקה הזאת אפשר היה להזריק כתובת לכל דומיין —
  // כלומר להפוך את כרטיס העסק לנקודת-הגשה של תוכן זר. שני תנאים מצטברים: המארח חייב
  // להיות של Firebase Storage, והנתיב חייב להיות **בדיוק** `bizUploads/` — לא נתיב אחר
  // בבאקט שלנו, ולא בבאקט של פרויקט אחר.
  const bucket = env.FIREBASE_STORAGE_BUCKET;
  const okUrl = (u) => {
    if (!u || typeof u !== 'string' || u.length > 800) return '';
    let parsed;
    try { parsed = new URL(u); } catch (e) { return ''; }
    if (parsed.protocol !== 'https:') return '';
    if (parsed.hostname !== 'firebasestorage.googleapis.com') return '';
    // הנתיב הוא /v0/b/{bucket}/o/{objectPath מקודד}
    if (!parsed.pathname.startsWith(`/v0/b/${bucket}/o/`)) return '';
    const obj = decodeURIComponent(parsed.pathname.slice(`/v0/b/${bucket}/o/`.length));
    if (!obj.startsWith('bizUploads/')) return '';
    // ⚠️ **נתפס בבדיקה, לא בקריאה:** `bizUploads/../businesses/x/cover` עובר את
    // `startsWith` בשלום. ב-Firebase Storage שם-האובייקט הוא מחרוזת ליטרלית ו-`..`
    // אינו מנורמל, ולכן זה כנראה לא היה ניתן-לניצול בפועל — אבל ולידציה שנשענת על
    // "כנראה" של שכבה אחרת אינה ולידציה. כל מקטע-נתיב חשוד נדחה.
    if (obj.split('/').some((seg) => seg === '..' || seg === '.')) return '';
    return u;
  };

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

  // ── §422 — הכתובות מוכרעות ראשונות, ורק מה שאין לו כתובת נופל לנתיב הבייטים ────────
  // כל סלוט בנפרד: תמונה אחת שההעלאה המוקדמת שלה נכשלה אינה מפילה את השאר.
  const logoUrl = okUrl(form.get('logoUrl'));
  if (logoUrl) updates.logo = logoUrl;
  const coverUrl = okUrl(form.get('coverUrl'));
  const coverThumbUrl = okUrl(form.get('coverThumbUrl'));
  // ⚠️ שתיהן ביחד או אף אחת — קאבר בלי ממוזערת שולח כל כרטיס באתר לטעון 1600px
  // בתיבה של 400 (§317). הלקוח כבר אוכף את זה, וזו אכיפה שנייה בשרת.
  if (coverUrl && coverThumbUrl) {
    updates.coverPhoto = coverUrl;
    updates.coverPhotoThumb = coverThumbUrl;
  }
  let urlPhotos = [];
  try {
    const raw = form.get('galleryUrls');
    if (raw) {
      urlPhotos = JSON.parse(String(raw))
        .filter((p) => p && okUrl(p.url))
        .map((p) => ({ i: Number(p.i) || 0, url: okUrl(p.url), name: String(p.name || '').slice(0, 200) }));
    }
  } catch (e) { console.error('galleryUrls parse failed:', e.message); }

  const logo = logoUrl ? null : form.get('logo');
  if (logo && logo.size) {
    tasks.push(
      logo.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/logo_${Date.now()}`, bytes, logo.type || 'image/jpeg'))
        .then((url) => { updates.logo = url; })
        .catch((e) => { console.error('logo upload failed:', e.message); failed.push('logo'); })
    );
  }

  const cover = (coverUrl && coverThumbUrl) ? null : form.get('cover');
  if (cover && cover.size) {
    tasks.push(
      cover.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/cover_${Date.now()}`, bytes, cover.type || 'image/webp'))
        .then((url) => { updates.coverPhoto = url; })
        .catch((e) => { console.error('cover upload failed:', e.message); failed.push('cover'); })
    );
  }
  const coverThumb = (coverUrl && coverThumbUrl) ? null : form.get('coverThumb');
  if (coverThumb && coverThumb.size) {
    tasks.push(
      coverThumb.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/cover_${Date.now()}_thumb`, bytes, coverThumb.type || 'image/webp'))
        .then((url) => { updates.coverPhotoThumb = url; })
        .catch((e) => { console.error('cover thumb upload failed:', e.message); failed.push('coverThumb'); })
    );
  }

  // ── §422 — הגלריה מורכבת משני מקורות, ו**הסדר המקורי הוא מה שמחזיק אותם יחד** ────────
  // חלק מהתמונות עלו מראש (כתובות) וחלק נוסעות כבייטים. הסדר שהמשתמש בחר הוא הסדר
  // שמוצג בדף העסק (§257), ולכן כל פריט נושא את המיקום שלו: `galleryUrls[].i` מצד אחד,
  // ושדה `galleryIndex` המקביל לכל קובץ מצד שני. מיזוג לפי מיקום, לא לפי סדר-הגעה.
  const galleryFiles = form.getAll('gallery');
  const galleryIdx = form.getAll('galleryIndex').map((v) => Number(v));
  const bySlot = new Map();
  urlPhotos.forEach((p) => bySlot.set(p.i, { url: p.url, name: p.name }));
  if (galleryFiles.length || urlPhotos.length) {
    galleryFiles.forEach((f, n) => {
      // ⚠️ נפילה-לאחור למיקום לפי סדר-ההגעה: לקוח ישן (לפני §422) אינו שולח galleryIndex
      // כלל, ובלעדיה כל התמונות שלו היו נדחסות למיקום NaN ונעלמות.
      const slot = Number.isFinite(galleryIdx[n]) ? galleryIdx[n] : n;
      tasks.push(
        f.arrayBuffer()
          .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/gallery_${Date.now()}_${slot}`, bytes, f.type || 'image/webp'))
          .then((url) => { bySlot.set(slot, { url, name: f.name }); })
          .catch((e) => {
            console.error('gallery photo upload failed:', e.message);
            failed.push('gallery[' + slot + ']');
          })
      );
    });
  }

  // כל הקבצים מועלים במקביל (לא ברצף) — הזמן הכולל מוגבל לתמונה-האיטית-ביותר, לא לסכום כולן.
  // חשוב במיוחד ל"שולח..." שמוצג ללקוח לפני שרואים "הבקשה התקבלה" (ר' business.html).
  await Promise.all(tasks);

  // §422 — הרכבת הגלריה לפי המיקום המקורי. תמונה שנכשלה פשוט אינה ב-`bySlot`, ולכן
  // היא נופלת מהרשימה מעצמה — במקום להישאר כרשומה ריקה שנספרת ב-photos.length ואין
  // מה להציג בה (הכשל שתוקן קודם בסינון מפורש; עכשיו המבנה עצמו מונע אותו).
  if (bySlot.size) {
    updates.photos = [...bySlot.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, ph]) => ph)
      .filter((ph) => ph && ph.url);
  }

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
