import { getGoogleAccessToken } from './jwt.js';
import { firestoreRunQuery, firestorePatch } from './firestore.js';
import { uploadToFirebaseStorage } from './storage.js';

// עסקים ישנים (נרשמו/נערכו לפני 2026-07-14) אין להם coverPhotoThumb/logoThumb בכלל — הכרטיס שלהם
// בפיד (home.html, bizCardImage()) עדיין טוען את התמונה המלאה (1280px) במקום thumbnail קטן (400px).
// ריצה חד-פעמית, לא cron: משלימה thumbnail לכל עסק approved שחסר לו, בצד שרת (fetch/canvas מהדפדפן
// חסום בלי CORS policy על ה-bucket — ר' docs/PROJECT_CONTEXT.md §12). אותה קונבנציה בדיוק כמו הלקוח
// (compressToFile ב-business.html/business-dashboard.html): 400px, WebP, איכות ~0.75.
const THUMB_SIZE = 400;
const THUMB_QUALITY = 75;
const THUMB_FORMAT = 'webp';
const THUMB_CONTENT_TYPE = 'image/webp';

function hasImage(url) {
  return !!url && typeof url === 'string' && !/\.html?(\?|#|$)/i.test(url);
}

async function makeThumbUrl(env, accessToken, sourceUrl, bizId, fieldName) {
  const sourceResp = await fetch(sourceUrl);
  if (!sourceResp.ok) throw new Error(`source_fetch_failed_${sourceResp.status}`);
  const sourceBytes = await sourceResp.arrayBuffer();

  const transformed = await env.IMAGES.input(sourceBytes)
    .transform({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'scale-down', quality: THUMB_QUALITY, format: THUMB_FORMAT })
    .output();
  const thumbBytes = await transformed.response().arrayBuffer();

  return uploadToFirebaseStorage(
    env,
    accessToken,
    `businesses/${bizId}/${fieldName}_thumb_backfill`,
    thumbBytes,
    THUMB_CONTENT_TYPE
  );
}

export async function runBackfillThumbnails(env) {
  const accessToken = await getGoogleAccessToken(env);
  const businesses = await firestoreRunQuery(env, accessToken, 'businesses', 'status', 'approved', 500);

  const result = { total: businesses.length, updated: 0, skipped: 0, errors: [] };

  for (const b of businesses) {
    const updates = {};
    try {
      if (hasImage(b.fields.coverPhoto) && !hasImage(b.fields.coverPhotoThumb)) {
        updates.coverPhotoThumb = await makeThumbUrl(env, accessToken, b.fields.coverPhoto, b.id, 'coverPhoto');
      }
      if (hasImage(b.fields.logo) && !hasImage(b.fields.logoThumb)) {
        updates.logoThumb = await makeThumbUrl(env, accessToken, b.fields.logo, b.id, 'logo');
      }
    } catch (e) {
      result.errors.push({ id: b.id, name: b.fields.name || '', error: String(e).slice(0, 300) });
      continue;
    }

    if (Object.keys(updates).length) {
      await firestorePatch(env, accessToken, `businesses/${b.id}`, updates);
      result.updated++;
    } else {
      result.skipped++;
    }
  }

  return result;
}
