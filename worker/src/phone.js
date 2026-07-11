// זהה ללוגיקה שכבר קיימת ב-login.html — כדי להישאר תואם לפורמטים החופשיים שנשמרו ב-Firestore
export function normalizePhoneDigits(raw) {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (!d.startsWith('0')) d = '0' + d;
  return d; // "0501234567"
}

export function phoneCandidates(raw) {
  const local = normalizePhoneDigits(raw);
  const dashed = local.length === 10 ? local.slice(0, 3) + '-' + local.slice(3) : local;
  const e164 = '+972' + local.slice(1);
  return [...new Set([local, dashed, e164])];
}
