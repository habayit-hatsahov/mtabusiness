// העלאה ל-Firebase Storage דרך ה-REST API (לא ה-Client SDK) — אותו bucket/service-account שכבר
// משמש ל-Firestore (ר' jwt.js, getGoogleAccessToken). לא מייצר download-token: ניסיון בפועל
// (2026-08-12) להוסיף firebaseStorageDownloadTokens ל-metadata אחרי ההעלאה (PATCH) נכשל עם
// 400 "Not allowed to set custom metadata for firebaseStorageDownloadTokens" — כנראה חסום
// ב-API הזה כשלא דרך ה-SDK הרשמי. הפתרון בפועל לצפייה בתמונה של עסק לא-מאושר עבר ל-proxy
// מאומת ב-Worker (ר' handleViewBizMedia ב-index.js) — לא כאן.
export async function uploadToFirebaseStorage(env, accessToken, path, bytes, contentType) {
  const encodedPath = encodeURIComponent(path);
  const base = `https://firebasestorage.googleapis.com/v0/b/${env.FIREBASE_STORAGE_BUCKET}/o`;
  const objectUrl = `${base}/${encodedPath}`;

  const resp = await fetch(`${base}?uploadType=media&name=${encodedPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': contentType },
    body: bytes,
  });
  if (!resp.ok) throw new Error('storage_upload_failed: ' + (await resp.text()));

  // immutable בטוח — נתיב ה-backfill תמיד ייחודי (ר' backfill.js), אותה קונבנציה כמו uploadFile
  // בצד-לקוח (business.html/business-dashboard.html וכו', ר' docs/PROJECT_CONTEXT.md). לא חוסם
  // את ה-backfill אם זה נכשל — התמונה כבר הועלתה, זה רק אופטימיזציית קאשינג.
  try {
    await fetch(objectUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cacheControl: 'public, max-age=31536000, immutable' }),
    });
  } catch (e) {
    console.error('⚠️ cacheControl patch failed (non-fatal):', e);
  }

  return `${objectUrl}?alt=media`;
}
