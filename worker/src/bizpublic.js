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
//    מהמסמך המלא – שניהם זהים. likesOverride מגיע לציבורי תוך דקה; תיקון clicks – רק בשינוי הבא (§649).

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
  'kosher',   // §643 – כשר/לא כשר (מנהל או הרשמה)
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

// §649 — המסלול המהיר: רק המאושרים, באותו פורמט מסמך כמו listRaw ({name, fields})
async function listApproved(env, accessToken) {
  const r = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'businesses' }],
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } },
    } }),
  });
  if (!r.ok) throw new Error(`query approved businesses failed: ${r.status} ${await r.text()}`);
  return (await r.json()).filter((x) => x.document).map((x) => x.document);
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

// §649 — 💸 **עלות קריאות:** הריצה המלאה קראה כל דקה את כל businesses+bizPublic+bizCodes (148+93+9 נמדד
//    28.10) = כ-360 אלף קריאות ביום, גם בלילה בלי אף משתמש – רוב הבסיס החודשי של Firestore.
//    לכן שני מסלולים:
//    • **מהיר (כל דקה):** רק העסקים המאושרים (שאילתה אחת). מה שקיים בהעתק נלקח ממפת החתימות ב-KV
//      במקום מרשימת bizPublic/bizCodes – `hashes[id]` = נכתב ל-bizPublic, `hashes['c:'+id]` = נכתב ל-bizCodes.
//    • **מלא (כל 30 דק', `full`):** ההתנהגות הקודמת – משווה מול הרשימות עצמן ותופס העתק שנמחק ידנית,
//      bizCodes יתום, ומפה ישנה בלי מפתחות c:. ⚠️ עד הריצה המלאה הבאה מסלול מהיר לא ימחק bizCodes
//      שאינו מסומן במפה (קוד שהוסר יישאר גלוי לחברים עד 30 דק').
export async function syncBizPublic(env, accessToken, { force = false, full = true } = {}) {
  const kv = env.RATE_LIMIT_KV;
  const idOf = (d) => d.name.split('/').pop();
  const [biz, pub, codes, stored] = await Promise.all([
    full ? listRaw(env, accessToken, 'businesses') : listApproved(env, accessToken),
    full ? listRaw(env, accessToken, 'bizPublic') : null,
    full ? listRaw(env, accessToken, 'bizCodes') : null,
    kv.get(HASH_KEY, 'json'),
  ]);
  const hashes = (stored && typeof stored === 'object') ? stored : {};
  const approved = new Map();
  for (const d of biz) {
    const f = d.fields || {};
    if (f.status && f.status.stringValue === 'approved') approved.set(idOf(d), f);
  }
  const mapIds = Object.keys(hashes).filter((k) => !k.startsWith('c:'));
  const pubIds = new Set(full ? pub.map(idOf) : mapIds);
  const codeIds = new Set(full ? codes.map(idOf) : mapIds.filter((id) => hashes['c:' + id]));
  let mapChanged = false;
  let writes = 0, wrote = 0, removed = 0, pending = 0;
  const budget = () => writes < MAX_WRITES;
  for (const [id, f] of approved) {
    const p = publicProjection(f), c = codesProjection(f);
    // §649 — המונים (clicks/likedBy) מחוץ לחתימה: home.html כותב אותם לשני המסמכים באותו batch, ולכן
    //    שינוי בהם לא מצריך העתקה. לפני כן כל פתיחת כרטיס כתבה מחדש את ההעתק (ובערב ההשקה מילאה את
    //    תקציב 16 הכתיבות לדקה ועיכבה שינויים אמיתיים). הם עדיין מועתקים כשהמסמך נכתב מסיבה אחרת.
    //    ⚠️ תיקון ידני של clicks ע"י מנהל יגיע להעתק רק בשינוי הבא בעסק (likesOverride כן בחתימה).
    const { clicks: _c, likedBy: _l, ...stable } = p;
    const h = await sha(JSON.stringify(canon(stable)) + '|' + JSON.stringify(canon(c)));
    // ההעתק חסר (נמחק ידנית / ריצה ראשונה) – תמיד נכתב, גם כשהחתימה תואמת
    const missing = !pubIds.has(id) || (!!c !== codeIds.has(id));
    if (!force && !missing && hashes[id] === h) continue;
    if (!budget()) { pending++; continue; }
    await putDoc(env, accessToken, `bizPublic/${id}`, p); writes++;
    if (c) { await putDoc(env, accessToken, `bizCodes/${id}`, c); writes++; }
    else if (codeIds.has(id)) { await delDoc(env, accessToken, `bizCodes/${id}`); writes++; }
    hashes[id] = h;
    if (c) hashes['c:' + id] = 1; else delete hashes['c:' + id];
    wrote++;
  }
  // ריצה מלאה מיישרת את סימוני c: למצב האמיתי (גם כשלא נכתב כלום) – מפה ישנה בלי c: מתמלאת כאן
  if (full) {
    for (const id of approved.keys()) {
      if (!hashes[id]) continue;
      const has = !!hashes['c:' + id];
      if (codeIds.has(id) !== has) { if (has) delete hashes['c:' + id]; else hashes['c:' + id] = 1; mapChanged = true; }
    }
  }
  for (const id of pubIds) {
    if (approved.has(id)) continue;
    if (!budget()) { pending++; continue; }
    await delDoc(env, accessToken, `bizPublic/${id}`); writes++;
    if (codeIds.has(id)) { await delDoc(env, accessToken, `bizCodes/${id}`); writes++; }
    delete hashes[id]; delete hashes['c:' + id];
    removed++;
  }
  if (full) {
    for (const id of codeIds) {
      if (approved.has(id) || pubIds.has(id)) continue;
      if (!budget()) { pending++; continue; }
      await delDoc(env, accessToken, `bizCodes/${id}`); writes++; removed++;
      delete hashes['c:' + id];
    }
  }
  if (wrote || removed || mapChanged) await kv.put(HASH_KEY, JSON.stringify(hashes));
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
