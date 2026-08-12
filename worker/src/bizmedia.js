import { getGoogleAccessToken } from './jwt.js';
import { firestoreRunQuery, firestorePatch } from './firestore.js';
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
  const matches = await firestoreRunQuery(env, googleToken, 'businesses', 'accessToken', bizToken);
  if (!matches.length) return { error: 'invalid_token' };
  const bizId = matches[0].id;

  const updates = {};
  const tasks = [];

  const fanPhoto = form.get('fanPhoto');
  if (fanPhoto && fanPhoto.size) {
    tasks.push(
      fanPhoto.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `members/proofs/${bizId}_fan`, bytes, fanPhoto.type || 'image/jpeg'))
        .then((url) => { updates.photoProofUrl = url; })
        .catch((e) => console.error('fan photo upload failed:', e.message))
    );
  }

  const logo = form.get('logo');
  if (logo && logo.size) {
    tasks.push(
      logo.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/logo_${Date.now()}`, bytes, logo.type || 'image/jpeg'))
        .then((url) => { updates.logo = url; })
        .catch((e) => console.error('logo upload failed:', e.message))
    );
  }

  const cover = form.get('cover');
  if (cover && cover.size) {
    tasks.push(
      cover.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/cover_${Date.now()}`, bytes, cover.type || 'image/webp'))
        .then((url) => { updates.coverPhoto = url; })
        .catch((e) => console.error('cover upload failed:', e.message))
    );
  }
  const coverThumb = form.get('coverThumb');
  if (coverThumb && coverThumb.size) {
    tasks.push(
      coverThumb.arrayBuffer()
        .then((bytes) => uploadToFirebaseStorage(env, googleToken, `businesses/${bizId}/cover_${Date.now()}_thumb`, bytes, coverThumb.type || 'image/webp'))
        .then((url) => { updates.coverPhotoThumb = url; })
        .catch((e) => console.error('cover thumb upload failed:', e.message))
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
          })
      );
    });
  }

  // כל הקבצים מועלים במקביל (לא ברצף) — הזמן הכולל מוגבל לתמונה-האיטית-ביותר, לא לסכום כולן.
  // חשוב במיוחד ל"שולח..." שמוצג ללקוח לפני שרואים "הבקשה התקבלה" (ר' business.html).
  await Promise.all(tasks);

  if (Object.keys(updates).length) {
    await firestorePatch(env, googleToken, `businesses/${bizId}`, updates);
  }

  return { ok: true, uploadedFields: Object.keys(updates) };
}
