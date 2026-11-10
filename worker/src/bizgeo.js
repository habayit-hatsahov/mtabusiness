// ══ §762ב — נקודות על המפה, אוטומטית: כתובת כל סניף → lat/lng (Google Geocoding) ═════════════════════
// רמי: "עסק חדש או כתובת שהשתנתה – צריך שזה יהיה אוטומטי". פעם בשעה (scheduled, דקה 41):
//   1. כל העסקים המאושרים (שאילתה אחת).
//   2. מי שמקבל נקודה: חנות (bizTypes כולל 'physical') או בעל מקצוע שסימן atMine ("מגיעים אליו").
//   3. לכל סניף: נקודה קיימת ב-branchGeo עם אותה עיר+כתובת → נשאר. אחרת – מהזרע (biz-geo.json באתר, ההמרה
//      הראשונה מ-10.11 כולל תיקונים ידניים של רמי), ורק אם אין – Geocoding API.
//   4. שינוי → PATCH על businesses/{id} עם updateMask=branchGeo בלבד (שום שדה אחר לא נוגע). bizPublic מעתיק
//      את branchGeo (PUBLIC_FIELDS) תוך ≤5 דק', ודף הבית מצייר ממנו.
// 🔑 כללי הכתובת (רמי, 10.11): רחוב בלי מספר → "מספר 1" (ליד הרחוב); אין כתובת → מרכז העיר. סוגריים ("(תחנת דלק…)")
//    ו"סניף " בתחילת העיר – יורדים לפני ההמרה (בלי זה "אורט 18 (תחנת דלק דור אלון)" נפל לשדרה אחרת).
// 💸 תקרה בגוגל: Geocoding v3 = 330 ביום לכל הפרויקט. כאן עד MAX_GEOCODES להפעלה, כך שגם הצפה של עסקים חדשים
//    לא שורפת את היום. מפתח נפרד לשרת (GOOGLE_GEOCODE_KEY, secret) – מפתח הדפדפן מוגבל לאתר וגוגל דוחה אותו משרת.
const BASE = (p) => `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;
const SEED_URL = 'https://yellowzone.co.il/biz-geo.json';
const MAX_GEOCODES = 20;
const MAX_WRITES = 20;

// ── טהורים (נבדקים ב-test/bizgeo.test.mjs) ──
export function cleanCity(c) { return String(c || '').trim().replace(/\s+/g, ' ').replace(/^סניף\s+/, ''); }
export function cleanAddress(a) {
  let s = String(a || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (s && !/\d/.test(s)) s += ' 1';   // רחוב בלי מספר → מספר 1
  return s;
}
export function geocodeQuery(address, city) {
  const a = cleanAddress(address), c = cleanCity(city);
  return [a, c, 'ישראל'].filter(Boolean).join(', ');
}
export function isPlaced(f) {
  return (f.bizTypes || []).includes('physical') || (f.serviceModes || []).includes('atMine');
}
export function branchKeyList(branches) {
  return (branches || []).filter((b) => b && (b.city || b.address))
    .map((b) => ({ c: String(b.city || '').trim(), a: String(b.address || '').trim() }));
}
// התכנון לעסק אחד: מה יש, מה חסר. בלי רשת.
export function planOne(id, f, seed) {
  const want = branchKeyList(f.branches);
  const cur = Array.isArray(f.branchGeo) ? f.branchGeo : [];
  const seedList = (seed && seed[id]) || [];
  const out = [], missing = [];
  want.forEach((k, i) => {
    const hit = cur.find((x) => x && x.a === k.a && x.c === k.c) || seedList.find((x) => x && x.a === k.a && x.c === k.c);
    if (hit && typeof hit.lat === 'number' && typeof hit.lng === 'number') {
      const e = { c: k.c, a: k.a, lat: hit.lat, lng: hit.lng };
      if (hit.ap) e.ap = hit.ap;
      out[i] = e;
    } else { out[i] = null; missing.push(i); }
  });
  return { want, out, missing, cur };
}
export function sameGeo(a, b) {
  const n = (l) => JSON.stringify((l || []).map((x) => [x.c, x.a, x.lat, x.lng, x.ap || '']));
  return n(a) === n(b);
}

// ── רשת ──
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
}
function fromFs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  return null;
}
async function listApproved(env, token) {
  const r = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'businesses' }],
      select: { fields: ['branches', 'bizTypes', 'serviceModes', 'branchGeo'].map((fieldPath) => ({ fieldPath })) },
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } },
    } }),
  });
  if (!r.ok) throw new Error(`bizgeo query failed: ${r.status}`);
  return (await r.json()).filter((x) => x.document).map((x) => ({
    id: x.document.name.split('/').pop(),
    f: Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, fromFs(v)])),
  }));
}
async function loadSeed() {
  try {
    const r = await fetch(SEED_URL + '?w=' + Date.now(), { cf: { cacheTtl: 0 } });
    return r.ok ? await r.json() : {};
  } catch (e) { return {}; }
}
export async function geocode(env, address, city) {
  const q = geocodeQuery(address, city);
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?region=il&language=he&address=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(env.GOOGLE_GEOCODE_KEY);
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (j.status === 'OVER_QUERY_LIMIT' || j.status === 'OVER_DAILY_LIMIT' || j.status === 'REQUEST_DENIED') throw new Error('geocode ' + j.status);
  const g = j.results && j.results[0];
  if (!g) return null;
  const t = g.geometry.location_type;
  const e = { lat: +g.geometry.location.lat.toFixed(6), lng: +g.geometry.location.lng.toFixed(6) };
  // בלי כתובת = מרכז העיר בכוונה; כתובת שגוגל לא מצא (APPROXIMATE = העיר) / מרכז רחוב – "משוער"
  if (!String(address || '').trim() || t === 'APPROXIMATE') e.ap = 'city';
  else if (t === 'GEOMETRIC_CENTER') e.ap = 'street';
  return e;
}
async function patchGeo(env, token, id, list) {
  const r = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}/businesses/${id}?updateMask.fieldPaths=branchGeo&currentDocument.exists=true`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { branchGeo: toFs(list) } }),
  });
  if (!r.ok) throw new Error(`bizgeo patch ${id} failed: ${r.status}`);
}

// dry: מחזיר מה היה נכתב, בלי Geocoding ובלי כתיבה (לבדיקה)
export async function runBizGeo(env, token, { dry = false } = {}) {
  const res = { checked: 0, placed: 0, wrote: 0, geocoded: 0, pending: 0, failed: 0, plan: [] };
  if (!env.GOOGLE_GEOCODE_KEY && !dry) return { ...res, skipped: 'no GOOGLE_GEOCODE_KEY' };
  const [list, seed] = await Promise.all([listApproved(env, token), loadSeed()]);
  res.checked = list.length;
  let stop = false;
  for (const { id, f } of list) {
    if (res.wrote >= MAX_WRITES) { res.pending++; continue; }
    const placed = isPlaced(f);
    let next;
    if (!placed) next = [];
    else {
      res.placed++;
      const p = planOne(id, f, seed);
      for (const i of p.missing) {
        if (dry) { res.plan.push({ id, need: geocodeQuery(p.want[i].a, p.want[i].c) }); continue; }
        if (stop || res.geocoded >= MAX_GEOCODES) { res.pending++; continue; }
        try { const g = await geocode(env, p.want[i].a, p.want[i].c); res.geocoded++; if (g) p.out[i] = { c: p.want[i].c, a: p.want[i].a, ...g }; else res.failed++; }
        catch (e) { stop = true; res.pending++; console.error('bizgeo geocode stopped', String(e)); }
      }
      next = p.out.filter(Boolean);
    }
    const cur = Array.isArray(f.branchGeo) ? f.branchGeo : [];
    if ((!placed && !cur.length) || sameGeo(cur, next)) continue;
    if (dry) { res.plan.push({ id, write: next.length }); res.wrote++; continue; }
    await patchGeo(env, token, id, next);
    res.wrote++;
  }
  return res;
}
