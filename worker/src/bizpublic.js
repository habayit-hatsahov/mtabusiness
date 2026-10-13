// ══ §517ב — העתק ציבורי של העסקים (bizPublic) + קודי הקופון לחברים בלבד (bizCodes) ══════════
// 🔴 למה: מסמך עסק מאושר היה קריא לכל אחד בלי התחברות **במלואו** – טלפון ומייל של הבעלים (65/65),
//    מספר מנוי (47/65), פרטי מושב ואימות, שדות מעקב מייל, וקודי הקופון שאמורים להיות לחברים בלבד.
//    חוקי Firestore לא יכולים להסתיר שדות בתוך מסמך – רק מסמכים שלמים.
// 🔑 הפתרון: `businesses/{id}` נשאר המסמך המלא (מנהל, בעלים, וורקר – בלי שינוי בקוד שלהם), ו**העתק**
//    עם השדות הציבוריים בלבד נכתב כאן ל-`bizPublic/{id}`. הדפים הציבוריים (home/landing/welcome/open)
//    קוראים רק אותו. הקודים – ל-`bizCodes/{id}`, שחוקי Firestore פותחים רק לחבר רשום.
// ⚠️ **רשימת-היתר, לא רשימת-חסימה:** שדה חדש שיתווסף למסמך העסק **לא** ייחשף עד שיתווסף כאן במפורש.
// ⚠️ הערכים מועתקים **בטיפוס המקורי של Firestore** (timestamp נשאר timestamp) – בלי המרה.
// ⚠️ likedBy/clicks: home.html כותב אותם לשני המסמכים באותו batch (תגובה מיידית בלב); כאן הם מועתקים
//    מהמסמך המלא – שניהם זהים, ופעולות מנהל (likesOverride, תיקון clicks) מגיעות לציבורי תוך דקה.

const BASE = (projectId) => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

export const PUBLIC_FIELDS = [
  'status', 'name', 'categoryPrimary', 'alsoUnderCategory', 'tags', 'bizTypes', 'profession', 'regions',
  'desc', 'description', 'branches', 'bizPhone', 'phone', 'whatsapp', 'serviceEmail', 'website', 'instagram', 'facebook',
  'hours', 'hoursMode', 'hoursDays', 'hoursOther',
  'logo', 'logoThumb', 'logoFit', 'coverPhoto', 'coverPhotoThumb', 'coverPhotoPosition', 'coverPhotoZoom', 'coverPhotoBg', 'photos',
  'hasDiscount', 'discountText', 'discountTextFull', 'discountTypes', 'discountRedeemMode',
  'approvedAt', 'isNew', 'newUntil', 'isFeatured', 'featuredUntil', 'sectionDeals', 'sectionTurn', 'sectionQueuePos',
  'exposurePriority', 'isSubscriber', 'ownerFirst',
  'clicks', 'likedBy', 'likesOverride', 'likesOverrideUntil',
];

// additionalDiscounts – בלי `code`; במקומו hasCode (home.html מחשב לפיו את אופני המימוש).
function publicExtras(v) {
  const vals = (v && v.arrayValue && v.arrayValue.values) || [];
  return { arrayValue: { values: vals.map((x) => {
    const f = { ...((x.mapValue && x.mapValue.fields) || {}) };
    const hasCode = !!(f.code && f.code.stringValue && f.code.stringValue.trim());
    delete f.code;
    f.hasCode = { booleanValue: hasCode };
    return { mapValue: { fields: f } };
  }) } };
}

export function publicProjection(fields) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (k in fields) out[k] = fields[k];
  if ('additionalDiscounts' in fields) out.additionalDiscounts = publicExtras(fields.additionalDiscounts);
  const code = fields.discountCode && fields.discountCode.stringValue;
  out.hasCode = { booleanValue: !!(code && code.trim()) };
  return out;
}

export function codesProjection(fields) {
  const code = (fields.discountCode && fields.discountCode.stringValue) || '';
  const extras = ((fields.additionalDiscounts && fields.additionalDiscounts.arrayValue && fields.additionalDiscounts.arrayValue.values) || [])
    .map((x) => ((x.mapValue && x.mapValue.fields && x.mapValue.fields.code && x.mapValue.fields.code.stringValue) || ''));
  if (!code.trim() && !extras.some((c) => c.trim())) return null;
  return { discountCode: { stringValue: code }, extraCodes: { arrayValue: { values: extras.map((c) => ({ stringValue: c })) } } };
}

// ⚠️ סדר המפתחות בתשובת Firestore REST **אינו קבוע** (נמדד 13.10: אותו עסק, חתימה אחרת בכל ריצה
//    → אותם 16 עסקים נכתבו שוב ושוב והשאר לא הגיעו אף פעם). לכן חתימה על מבנה ממוין.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {});
  return v;
}
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function listRaw(env, accessToken, coll) {
  const out = [];
  let pageToken = '';
  do {
    const r = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}/${coll}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`,
      { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error(`list ${coll} failed: ${r.status} ${await r.text()}`);
    const j = await r.json();
    out.push(...(j.documents || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function putDoc(env, accessToken, path, fields) {
  // PATCH בלי updateMask = החלפת המסמך כולו (שדה שהוסר מהמקור יוסר גם כאן)
  const r = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}/${path}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`put ${path} failed: ${r.status} ${await r.text()}`);
}
async function delDoc(env, accessToken, path) {
  const r = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}/${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${path} failed: ${r.status}`);
}

// סנכרון: כותב רק מה שהשתנה, ומוחק העתקים של עסקים שכבר לא מאושרים/נמחקו.
// ⚠️ **תקציב קריאות:** הפעלת וורקר מוגבלת ל-50 קריאות-משנה (כולל KV), והסריקה של המיילים רצה באותה
//    הפעלה. נמדד 13.10: חתימה ב-KV לכל עסק (65 קריאות) תקעה את הסנכרון על 26 עסקים. לכן: **מפת
//    חתימות אחת** (get+put יחיד), ו**עד MAX_WRITES כתיבות להפעלה** – השאר בדקה הבאה.
const MAX_WRITES = 16;
const HASH_KEY = 'bizpub:v2:hashes';

export async function syncBizPublic(env, accessToken, { force = false } = {}) {
  const kv = env.RATE_LIMIT_KV;
  const [biz, pub, codes, stored] = await Promise.all([
    listRaw(env, accessToken, 'businesses'), listRaw(env, accessToken, 'bizPublic'), listRaw(env, accessToken, 'bizCodes'),
    kv.get(HASH_KEY, 'json'),
  ]);
  const hashes = (stored && typeof stored === 'object') ? stored : {};
  const idOf = (d) => d.name.split('/').pop();
  const approved = new Map();
  for (const d of biz) {
    const f = d.fields || {};
    if (f.status && f.status.stringValue === 'approved') approved.set(idOf(d), f);
  }
  const pubIds = new Set(pub.map(idOf)), codeIds = new Set(codes.map(idOf));
  let writes = 0, wrote = 0, removed = 0, pending = 0;
  const budget = () => writes < MAX_WRITES;
  for (const [id, f] of approved) {
    const p = publicProjection(f), c = codesProjection(f);
    const h = await sha(JSON.stringify(canon(p)) + '|' + JSON.stringify(canon(c)));
    // ההעתק חסר (נמחק ידנית / ריצה ראשונה) – תמיד נכתב, גם כשהחתימה תואמת
    const missing = !pubIds.has(id) || (!!c !== codeIds.has(id));
    if (!force && !missing && hashes[id] === h) continue;
    if (!budget()) { pending++; continue; }
    await putDoc(env, accessToken, `bizPublic/${id}`, p); writes++;
    if (c) { await putDoc(env, accessToken, `bizCodes/${id}`, c); writes++; }
    else if (codeIds.has(id)) { await delDoc(env, accessToken, `bizCodes/${id}`); writes++; }
    hashes[id] = h;
    wrote++;
  }
  for (const id of pubIds) {
    if (approved.has(id)) continue;
    if (!budget()) { pending++; continue; }
    await delDoc(env, accessToken, `bizPublic/${id}`); writes++;
    if (codeIds.has(id)) { await delDoc(env, accessToken, `bizCodes/${id}`); writes++; }
    delete hashes[id];
    removed++;
  }
  for (const id of codeIds) {
    if (approved.has(id) || pubIds.has(id)) continue;
    if (!budget()) { pending++; continue; }
    await delDoc(env, accessToken, `bizCodes/${id}`); writes++; removed++;
  }
  if (wrote || removed) await kv.put(HASH_KEY, JSON.stringify(hashes));
  return { approved: approved.size, wrote, removed, pending };
}

// ══ §519 — open.html דרך הוורקר (POST /public-biz-list) ═════════════════════════════════════════
// open.html (טיזר לעסק למי שלא מחובר) קרא את bizPublic ב-REST ישיר בלי SDK. כשנאכוף App Check על
// Firestore, REST בלי תעודה ייחסם – לכן אותה שאילתה בדיוק, דרך הוורקר, **באותו פורמט תשובה** (runQuery),
// כך שקוד הפענוח בדף לא משתנה. רק השדות שהטיזר צריך (כולם ממילא ציבוריים ב-bizPublic). מטמון 5 דק'.
const TEASER_FIELDS = ['name', 'tags', 'hasDiscount', 'discountText', 'coverPhoto', 'coverPhotoThumb',
  'coverPhotoPosition', 'coverPhotoZoom', 'coverPhotoBg'];
export async function handlePublicBizList(env, accessToken, ctx) {
  const cache = caches.default;
  const key = new Request('https://cache.yellowzone.internal/public-biz-list/v1');
  const hit = await cache.match(key);
  if (hit) return hit.text();
  const r = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'bizPublic' }],
      select: { fields: TEASER_FIELDS.map((p) => ({ fieldPath: p })) },
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } },
    } }),
  });
  if (!r.ok) throw new Error('public-biz-list query failed: ' + r.status);
  const text = await r.text();
  const put = cache.put(key, new Response(text, { headers: { 'Cache-Control': 'public, max-age=300' } }));
  if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  return text;
}
