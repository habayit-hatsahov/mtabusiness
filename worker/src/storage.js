// העלאה ל-Firebase Storage דרך ה-REST API (לא ה-Client SDK) — אותו bucket/service-account שכבר
// משמש ל-Firestore (ר' jwt.js, getGoogleAccessToken). לא מייצר download-token: storage.rules כבר
// מתירים read פומבי לתמונות של עסק approved בלי טוקן (ר' storage.rules), אז ה-URL הפשוט מספיק.
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
