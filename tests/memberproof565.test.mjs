// בדיקת §565 — /upload-member-proof בוורקר האמיתי, מול Storage מדומה. נבדק: תמונה תקינה עולה
// לנתיב members/proofs/{id}_<אקראי> עם טוקן-הורדה · הסוג נקבע מהבייטים ולא מהכותרת · דחיות:
// מזהה לא תקין, קובץ חסר, לא-תמונה (גם כשהכותרת אומרת image/jpeg), גדול מ-14MB · מגבלת קצב ל-IP.
import worker from '../worker/src/index.js';
let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };
let uploads = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }));
  if (u.hostname === 'storage.googleapis.com' && u.pathname.startsWith('/upload/')) {
    const body = new TextDecoder('latin1').decode(opts.body);
    const meta = JSON.parse(body.split('\r\n\r\n')[1].split('\r\n')[0]);
    uploads.push({ meta, contentType: (body.match(/--yz[^\r]+\r\nContent-Type: (image\/[a-z]+)/) || [])[1] });
    return new Response('{}');
  }
  return new Response('{}', { status: 404 });
};
const kv = new Map();
const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_STORAGE_BUCKET: 'b.app', ALLOWED_ORIGIN: 'https://yellowzone.co.il',
  RATE_LIMIT_KV: { get: async (k) => (k.startsWith('quota:') ? kv.get(k) || null : { token: 'fake', exp: Math.floor(Date.now() / 1000) + 3600 }), put: async (k, v) => { kv.set(k, v); } } };
const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0]);
const call = async (id, bytes, type = 'image/jpeg', ip = '1.1.1.1') => {
  const fd = new FormData();
  if (id !== null) fd.append('memberId', id);
  if (bytes) fd.append('file', new Blob([bytes], { type }), 'proof');
  const r = await worker.fetch(new Request('https://w/upload-member-proof', { method: 'POST', body: fd, headers: { Origin: 'https://yellowzone.co.il', 'CF-Connecting-IP': ip } }), env, { waitUntil() {} });
  return r.json();
};
const ID = 'Abcdefghij0123456789';
let r = await call(ID, JPEG);
check('JPEG תקין → ok + כתובת עם טוקן', r.ok && /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/b\.app\/o\/members%2Fproofs%2FAbcdefghij0123456789_[0-9a-f-]{36}\?alt=media&token=/.test(r.url), r);
check('נשמר עם טוקן-הורדה ו-image/jpeg', uploads[0] && uploads[0].meta.metadata.firebaseStorageDownloadTokens && uploads[0].contentType === 'image/jpeg', uploads[0]);
r = await call(ID, PNG, 'image/jpeg');
check('PNG שהוצהר כ-JPEG → נשמר כ-PNG (לפי הבייטים)', r.ok && uploads[1].contentType === 'image/png', uploads[1]);
check('מזהה לא תקין → bad_member_id', (await call('../etc', JPEG)).error === 'bad_member_id');
check('בלי מזהה → bad_member_id', (await call(null, JPEG)).error === 'bad_member_id');
check('בלי קובץ → missing_file', (await call(ID, null)).error === 'missing_file');
check('טקסט עם כותרת image/jpeg → not_image', (await call(ID, new TextEncoder().encode('<script>alert(1)</script>'), 'image/jpeg', '2.2.2.2')).error === 'not_image');
const big = new Uint8Array(14 * 1024 * 1024 + 1); big.set(JPEG);
check('מעל 14MB → file_too_large', (await call(ID, big, 'image/jpeg', '3.3.3.3')).error === 'file_too_large');
check('לא נשמרו קבצים בדחיות', uploads.length === 2, uploads.length);
const ip = '9.9.9.9'; let last;
for (let i = 0; i < 9; i++) last = await call(ID, JPEG, 'image/jpeg', ip);
check('הבקשה ה-9 מאותו IP ב-15 דק\' → too_many_attempts', last.error === 'too_many_attempts', last);
console.log(fail ? `\n❌ ${fail} נכשלו, ${pass} עברו` : `\n✅ ${pass}/${pass}`);
process.exit(fail ? 1 : 0);
