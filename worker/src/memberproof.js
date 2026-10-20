import { getGoogleAccessToken } from './jwt.js';
import { uploadToFirebaseStorage } from './storage.js';

// ══ §565 — גיבוי להעלאת תמונת-האימות של אוהד ═══════════════════════════════════════════════
// דיווח-אמת (20.10): אוהדת נרשמה מאפליקציית האנדרואיד עם תמונה של 264KB. ההעלאה דרך ה-SDK
// של Firebase Storage לא התקדמה 45 שניות, לא נחת שום קובץ ב-bucket, וההרשמה נשמרה בלי
// התמונה. בדיוק הדפוס של §462 (Firestore תקוע בדפדפן מובייל בזמן שהוורקר עונה), רק בשכבת
// האחסון. fan-register.html שולח לכאן את אותו קובץ כשה-SDK לא מתקדם; הראשון שמצליח מנצח.
//
// 🔑 **אין כאן יכולת חדשה.** storage.rules כבר מתירים לכל אחד, בלי חשבון, *ליצור* תמונה
// ב-`members/proofs/` (§293/§381 – ההעלאה מתחילה לפני שהרשומה קיימת). הוורקר עושה בדיוק
// את זה, באותן מגבלות: תמונה בלבד (נבדקת לפי הבייטים, לא לפי הכותרת שהלקוח שלח), עד 14MB,
// שם-קובץ אקראי. מה שנוסף: מגבלת קצב לכל IP (ב-index.js), שאין ל-Storage.
// הכתובת שחוזרת נושאת טוקן-הורדה (§549), כמו זו של getDownloadURL, אחרת /view-image לא מגיש אותה.
const PROOF_MAX_BYTES = 14 * 1024 * 1024;   // זהה ל-fan-register.html (מתחת ל-15MB של storage.rules)

// סוג-התמונה נקבע מהחתימה של הקובץ עצמו. ⚠️ לא מ-`file.type`: הוא מגיע מהלקוח, ו-isImage()
// ב-storage.rules בודק אותו בלבד – כאן אפשר לבדוק טוב יותר, אז בודקים.
function sniffImageType(b) {
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  // HEIC/HEIF – 'ftyp' בבייט 4. הלקוח דוחס ל-JPEG, אבל דחיסה שנכשלה נופלת למקור (§290).
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  return '';
}

export async function handleUploadMemberProof(request, env) {
  let form;
  try { form = await request.formData(); } catch (e) { return { error: 'bad_form' }; }
  // המזהה שהטופס יצר מקומית (doc() של Firestore, 20 תווים). משמש **רק** לתחילית שם-הקובץ,
  // כמו בנתיב הרגיל – כדי שמנהל יוכל למצוא את הקובץ לפי הרשומה. לא נכתב לשום מסמך.
  const memberId = String(form.get('memberId') || '');
  if (!/^[A-Za-z0-9]{20}$/.test(memberId)) return { error: 'bad_member_id' };
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) return { error: 'missing_file' };
  if (file.size > PROOF_MAX_BYTES) return { error: 'file_too_large' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return { error: 'not_image' };

  const token = await getGoogleAccessToken(env);
  const path = `members/proofs/${memberId}_${crypto.randomUUID()}`;
  const url = await uploadToFirebaseStorage(env, token, path, bytes, type, { withToken: true });
  return { ok: true, url };
}
