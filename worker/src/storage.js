// העלאה ל-Firebase Storage דרך ה-REST API (לא ה-Client SDK) — אותו bucket/service-account שכבר
// משמש ל-Firestore (ר' jwt.js, getGoogleAccessToken). לא מייצר download-token: ניסיון בפועל
// (2026-08-12) להוסיף firebaseStorageDownloadTokens ל-metadata אחרי ההעלאה (PATCH) נכשל עם
// 400 "Not allowed to set custom metadata for firebaseStorageDownloadTokens" — כנראה חסום
// ב-API הזה כשלא דרך ה-SDK הרשמי. הפתרון בפועל לצפייה בתמונה של עסק לא-מאושר עבר ל-proxy
// מאומת ב-Worker (ר' handleViewBizMedia ב-index.js) — לא כאן.
export async function uploadToFirebaseStorage(env, accessToken, path, bytes, contentType, opts = {}) {
  const encodedPath = encodeURIComponent(path);
  const base = `https://firebasestorage.googleapis.com/v0/b/${env.FIREBASE_STORAGE_BUCKET}/o`;
  const objectUrl = `${base}/${encodedPath}`;
  if (opts.withToken) return uploadWithDownloadToken(env, accessToken, path, bytes, contentType, objectUrl);

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

// ── §549 — העלאה **עם** טוקן-הורדה (תמונות אימות) ──────────────────────────────────────────
// §517 דורש טוקן בכתובת של `members/proofs/` כדי ש-/view-image יגיש אותה (download.js). ראיית-האימות
// של עסק עולה מהוורקר, ובלי טוקן מרכז הניהול הציג "לא נטענת" (18.10, הרשמת בדיקה של רמי).
// ⚠️ PATCH אחרי ההעלאה לא עובד: ב-firebasestorage נדחה (הערה למעלה), וב-GCS דורש devstorage.full_control.
// לכן הטוקן נכתב **בהעלאה עצמה**: GCS multipart (objects.insert, מספיק read_write) עם
// `metadata.firebaseStorageDownloadTokens`. נבדק חי: Firebase מזהה את הטוקן ו-/view-image מחזיר 200.
async function uploadWithDownloadToken(env, accessToken, path, bytes, contentType, objectUrl) {
  if (!/^image\/[A-Za-z0-9.+-]+$/.test(String(contentType))) contentType = 'image/jpeg';   // נכנס לכותרת – מהלקוח
  const token = crypto.randomUUID();
  const boundary = 'yz' + crypto.randomUUID();
  const meta = JSON.stringify({
    name: path, contentType, cacheControl: 'public, max-age=31536000, immutable',
    metadata: { firebaseStorageDownloadTokens: token },
  });
  const enc = new TextEncoder();
  const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const data = new Uint8Array(bytes);
  const body = new Uint8Array(head.length + data.length + tail.length);
  body.set(head, 0); body.set(data, head.length); body.set(tail, head.length + data.length);
  const resp = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!resp.ok) throw new Error('storage_upload_failed: ' + (await resp.text()));
  return `${objectUrl}?alt=media&token=${token}`;
}
