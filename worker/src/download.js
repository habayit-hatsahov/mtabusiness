// פרוקסי הורדת תמונה — עוקף את חסימת ה-CORS של הדפדפן על fetch() ישיר לכתובת Firebase Storage
// (ר' docs/PROJECT_CONTEXT.md סעיף 12 — כפתור ⬇ ב-admin-businesses.html). מדובר בניווט <a href>
// רגיל (לא fetch/XHR), אז CORS לא רלוונטי בכלל לתגובה עצמה — ה-Worker רק מביא את הקובץ
// בצד-שרת (שם אין הגבלת CORS) ומחזיר אותו עם Content-Disposition כדי שהדפדפן ישמור אותו.
//
// מוגבל במפורש רק לכתובות מתוך ה-bucket שלנו (לא open proxy לכתובת שרירותית כלשהי).
export async function handleDownloadImage(request, env) {
  const url = new URL(request.url);
  const imgUrl = url.searchParams.get('url') || '';
  const filename = (url.searchParams.get('filename') || 'image.jpg').replace(/[\r\n"]/g, '');

  const allowedPrefix = `https://firebasestorage.googleapis.com/v0/b/${env.FIREBASE_STORAGE_BUCKET}/o/`;
  if (!imgUrl || !imgUrl.startsWith(allowedPrefix)) {
    return new Response('Invalid or disallowed url', { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(imgUrl);
  } catch (e) {
    return new Response('Download failed: ' + String(e), { status: 502 });
  }
  if (!upstream.ok) {
    return new Response('Download failed: upstream status ' + upstream.status, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
