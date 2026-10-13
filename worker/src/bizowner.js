// ══ §517ג — קישור בעל העסק לרשומת חבר בהרשמת עסק – בצד השרת ════════════════════════════════
// עד היום business.html (אנונימי) עשה את זה בעצמו: /check-member-exists החזיר memberId לכל טלפון/מייל,
// והדף כתב על רשומת החבר הקיימת (ענף (א) של members update) ועל ownerMemberId של העסק (ענף (א) של
// businesses update). שני היתרי-כתיבה אנונימיים על רשומות של אנשים אחרים – זה מה שאיפשר את §517.
// 🔑 עכשיו: ההוכחה היא **טוקן העסק** (bizToken) – נוצר בדף שיצר את העסק הזה, ולא קיים בשום מקום אחר.
//    החבר הקיים נמצא לפי הטלפון/המייל **שעל מסמך העסק** (לא לפי מה שהלקוח שולח עכשיו).
//
// POST /link-biz-owner { bizId, accessToken, ownerBirthDate?, newMemberId? }
//   • בלי newMemberId: מחפש חבר קיים. נמצא → משלים אותו (isBusinessOwner, linkedBusinessId; תאריך לידה
//     ושם רק אם חסרים – בדיוק כמו business.html עד היום) ומקשר את העסק → { memberId }.
//     לא נמצא → { memberId: null } – הדף יוצר רשומה חדשה (members create, כמו היום) וקורא שוב:
//   • עם newMemberId: מוודא שהרשומה החדשה pending ומקושרת לעסק הזה → מקשר את העסק → { memberId }.
// אידמפוטנטי: עסק שכבר מקושר מחזיר את הקישור הקיים.
import { getGoogleAccessToken } from './jwt.js';
import { firestoreGetDoc, firestorePatch, firestoreRunQuery, claimBizToken } from './firestore.js';
import { normalizePhoneDigits, phoneCandidates } from './phone.js';

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DATE_RE = /^(19|20)\d\d-\d\d-\d\d$/;
const empty = (v) => v === undefined || v === null || String(v).trim() === '';

async function findExistingMember(env, at, biz) {
  const email = String(biz.ownerEmail || '').trim().toLowerCase();
  if (email) {
    const rows = await firestoreRunQuery(env, at, 'members', 'email', email);
    if (rows.length) return rows[0];
  }
  if (biz.ownerPhone) {
    for (const c of phoneCandidates(biz.ownerPhone)) {
      const rows = await firestoreRunQuery(env, at, 'members', 'phone', c);
      if (rows.length) return rows[0];
    }
  }
  return null;
}

export async function handleLinkBizOwner(input, env) {
  const { bizId, accessToken, ownerBirthDate, newMemberId } = (input && typeof input === 'object') ? input : {};
  if (typeof bizId !== 'string' || !ID_RE.test(bizId) || typeof accessToken !== 'string' || !TOKEN_RE.test(accessToken)) {
    return { error: 'invalid_request' };
  }
  if (newMemberId !== undefined && (typeof newMemberId !== 'string' || !ID_RE.test(newMemberId))) return { error: 'invalid_request' };
  const at = await getGoogleAccessToken(env);

  // טוקן העסק: תואם לקיים, או נתבע עכשיו לעסק pending שעדיין אין לו (כמו /upload-biz-media)
  if ((await claimBizToken(env, at, bizId, accessToken)) !== bizId) return { error: 'not_authorized' };
  const bizDoc = await firestoreGetDoc(env, at, `businesses/${bizId}`);
  if (!bizDoc) return { error: 'not_found' };
  const biz = bizDoc.fields;
  if (biz.ownerMemberId) return { memberId: biz.ownerMemberId, already: true };
  if (biz.status !== 'pending') return { error: 'not_pending' };

  if (newMemberId) {
    const m = await firestoreGetDoc(env, at, `members/${newMemberId}`);
    if (!m || m.fields.status !== 'pending' || m.fields.linkedBusinessId !== bizId) return { error: 'member_mismatch' };
    await firestorePatch(env, at, `businesses/${bizId}`, { ownerMemberId: newMemberId });
    return { memberId: newMemberId, created: true };
  }

  const existing = await findExistingMember(env, at, biz);
  if (!existing) return { memberId: null };
  const f = existing.fields;
  const patch = { isBusinessOwner: true, linkedBusinessId: bizId };
  // השלמה ולא דריסה (אירוע 2026-07-24: טלפון/מייל משותפים לשני אנשים) – כמו business.html עד היום
  if (empty(f.birthDate) && typeof ownerBirthDate === 'string' && DATE_RE.test(ownerBirthDate)) patch.birthDate = ownerBirthDate;
  if (empty(f.firstName)) {
    patch.firstName = String(biz.ownerFirst || '').slice(0, 60);
    patch.lastName = String(biz.ownerLast || '').slice(0, 60);
  }
  await firestorePatch(env, at, `members/${existing.id}`, patch);
  await firestorePatch(env, at, `businesses/${bizId}`, { ownerMemberId: existing.id });
  return { memberId: existing.id, created: false };
}

// לבדיקות בלבד
export const _test = { findExistingMember, normalizePhoneDigits };
