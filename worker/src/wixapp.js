// ══ §797 — אפליקציית Yellow Zone ב-Wix: ספירת רכישות בקוד הקופון באתרי Wix (23.11) ═══════════════
// רמי: "התחברתי לוויקס ושופייפי… תעשה מה שצריך בשביל לקדם את נושא האינטגרציה".
// ב-Wix מפתח API של בעל האתר לא מספיק לקריאת הזמנות (§796ג) – צריך אפליקציה שבעל העסק מתקין.
// האפליקציה (Wix Studio ← Custom Apps, "Yellow Zone", self-managed, basic OAuth):
//   App ID: 5cb9ea2a-7ed8-431b-a9d9-57cd81f72834 (ציבורי). הסוד – רק כסוד וורקר WIX_APP_SECRET.
//   הרשאות: Read Orders (SCOPE.DC-STORES.READ-ORDERS), Read Products (v1 + v3). אין הרשאת קופונים לקריאה בלבד –
//   הקוד נבדק מתוך ההזמנות (appliedDiscounts[].coupon.code).
//   קישור התקנה לבעלי עסקים: https://wix.to/n90asX2
// הזרימה:
//   1. בעל העסק מתקין מהקישור → Wix שולח webhook "App Installed" (JWT, RS256) ל-POST /wix-webhook.
//   2. הוורקר מאמת את החתימה, מקבל instanceId, מבקש טוקן (client credentials) וקורא את כתובת האתר.
//   3. wixInstalls/{instanceId} נשמר תמיד (גם בלי התאמה). אם כתובת האתר תואמת ל-website של עסק מאושר –
//      shopKeys/{bizId} = { platform:'wix', creds:{instanceId} } + onlineShops/{bizId}.key – כמו מפתח שהוזן ב-admin.
//   4. testWix (נקרא מ-testKey ב-onlineshops.js) – סופר הזמנות עם הקוד וסכום. בלי פרטי לקוחות.
// שני האוספים בלי חוקים = סגורים ללקוח (כמו onlineShops/shopKeys).
import { getGoogleAccessToken } from './jwt.js';
import { firestoreListDocs, firestoreGetDoc, firestorePatch } from './firestore.js';

export const WIX_APP_ID = '5cb9ea2a-7ed8-431b-a9d9-57cd81f72834';
// מפתח ציבורי לאימות ה-webhooks (מהדשבורד של האפליקציה ← Webhooks ← Code sample). ציבורי – מותר בריפו.
const WIX_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy5sY2H4JjyI5KD/893WzVlSlhf6QHzQBsahmQu+1fyCNFXT+ai36kU25YO8PFgKiXBtD+QZMHInJuVCZxTPwHgmgZMs3NeHO8odXJxdQa+dCEQBcPEsz12abJBBll3Am+kU0vFG3KjAeuOWyyL3QTcIysucHKgBkqTzHEpaiZes7XiH5Do3ZlSdx0mG6aFWHC7Jpr2yfHT5Txxb5hWt5HMSFP5/ooX8YXT+SQ/eQKjzjSAiiMv1TbrSaZKqlolaa6ZR9PYcuxEun/EEG/irnY1+DLhIkoUqraJs2oNmHjkaD2gH80+IsdscodeBBPSoKLjtOsZG9wc5cpg3rN1QCmQIDAQAB';
const T = 15000;
const API = 'https://www.wixapis.com';
const MAX_PAGES = 20;   // עד 2,000 הזמנות אחרונות לבדיקה

const b64urlToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const host = u => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } };

// ── אימות JWT של Wix (RS256) ומחזיר את האירוע: { eventType, instanceId, data } ──────────────────────
export async function verifyWixJwt(jwt) {
  const parts = String(jwt || '').trim().split('.');
  if (parts.length !== 3) throw new Error('not_jwt');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  if (header.alg !== 'RS256') throw new Error('bad_alg');
  const key = await crypto.subtle.importKey('spki', Uint8Array.from(atob(WIX_PUBLIC_KEY), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('bad_signature');
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (claims.exp && claims.exp * 1000 < Date.now() - 300000) throw new Error('expired');
  // ה-data של ה-JWT הוא JSON כמחרוזת: { eventType, instanceId, data: "<JSON>", identity: "<JSON>" }
  let ev = claims.data;
  if (typeof ev === 'string') ev = JSON.parse(ev);
  let inner = ev && ev.data;
  if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch (e) { /* נשאר מחרוזת */ } }
  return { eventType: ev && ev.eventType, instanceId: ev && ev.instanceId, data: inner };
}

// ── טוקן לאתר אחד (client credentials + instance_id). תוקף ~4 שעות; לא נשמר – מבקשים בכל פעם. ──────
export async function wixToken(env, instanceId) {
  if (!env.WIX_APP_SECRET) throw new Error('no_secret');
  const r = await fetch(`${API}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: WIX_APP_ID, client_secret: env.WIX_APP_SECRET, instance_id: instanceId }),
    signal: AbortSignal.timeout(T),
  });
  if (!r.ok) throw new Error('token_' + r.status);
  const j = await r.json();
  if (!j.access_token) throw new Error('no_token');
  return j.access_token;
}

async function wixGet(token, path) {
  const r = await fetch(API + path, { headers: { Authorization: token, Accept: 'application/json' }, signal: AbortSignal.timeout(T) });
  if (!r.ok) throw new Error(path.split('?')[0] + '_' + r.status);
  return r.json();
}
async function wixPost(token, path, body) {
  const r = await fetch(API + path, {
    method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(T),
  });
  if (!r.ok) throw new Error(path + '_' + r.status);
  return r.json();
}

// ── פרטי האתר שהתקין: כתובת + שם ─────────────────────────────────────────────────────────────────────
export async function wixSiteInfo(token) {
  const j = await wixGet(token, '/apps/v1/instance');
  const s = j.site || {};
  return { url: s.url || '', name: s.siteDisplayName || '', locale: s.locale || '' };
}

// ── ספירת הזמנות עם הקוד + סכום (מתוך ההזמנות; ספירה בלבד) ─────────────────────────────────────────
export async function testWix(env, k, code) {
  const at = new Date().toISOString();
  const instanceId = k && k.creds && k.creds.instanceId;
  if (!instanceId) return { ok: false, err: 'אין instanceId – בעל העסק צריך להתקין את האפליקציה מהקישור', at };
  let token;
  try { token = await wixToken(env, instanceId); }
  catch (e) { return { ok: false, err: 'Wix לא נתן טוקן (' + String(e.message || e).slice(0, 40) + ') – אולי האפליקציה הוסרה מהאתר', at }; }
  if (!code) return { ok: true, keyOk: true, found: null, at };
  const want = String(code).trim().toLowerCase();
  let usage = 0, sum = 0, scanned = 0, cursor = null, currency = '';
  try {
    for (let p = 0; p < MAX_PAGES; p++) {
      const search = cursor ? { cursorPaging: { limit: 100, cursor } } : { cursorPaging: { limit: 100 }, sort: [{ fieldName: 'createdDate', order: 'DESC' }] };
      const j = await wixPost(token, '/ecom/v1/orders/search', { search });
      for (const o of j.orders || []) {
        scanned++;
        const hit = (o.appliedDiscounts || []).some(d => d.coupon && String(d.coupon.code || '').trim().toLowerCase() === want);
        if (!hit) continue;
        if (o.status === 'CANCELED' || o.paymentStatus === 'FULLY_REFUNDED') continue;
        usage++;
        const t = o.priceSummary && o.priceSummary.total;
        sum += Number((t && t.amount) || 0);
        currency = currency || o.currency || '';
      }
      cursor = j.metadata && j.metadata.cursors && j.metadata.cursors.next;
      if (!cursor) break;
    }
  } catch (e) {
    const m = String(e.message || e);
    if (/_40[13]$/.test(m)) return { ok: false, keyOk: true, err: 'טוקן תקין, אבל אין הרשאה לקריאת הזמנות (Read Orders)', at };
    return { ok: false, keyOk: true, err: 'קריאת ההזמנות נכשלה (' + m.slice(0, 50) + ')', at };
  }
  return { ok: true, keyOk: true, found: usage > 0, usage, sum: Math.round(sum), currency, scanned, at };
}

// ── POST /wix-webhook — Wix שולח JWT בגוף הבקשה (text) ─────────────────────────────────────────────
export async function handleWixWebhook(request, env) {
  let ev;
  try { ev = await verifyWixJwt(await request.text()); }
  catch (e) { return new Response('bad', { status: 400 }); }
  const instanceId = String(ev.instanceId || '');
  if (!/^[a-f0-9-]{20,60}$/i.test(instanceId)) return new Response('ok');
  const at = await getGoogleAccessToken(env);
  const path = 'wixInstalls/' + instanceId;
  if (ev.eventType === 'AppRemoved') {
    await firestorePatch(env, at, path, { removedAt: new Date() });
    return new Response('ok');
  }
  if (ev.eventType !== 'AppInstalled') return new Response('ok');
  const rec = { instanceId, installedAt: new Date(), removedAt: null };
  try {
    const token = await wixToken(env, instanceId);
    const site = await wixSiteInfo(token);
    rec.siteUrl = site.url; rec.siteName = site.name;
    const bizId = await matchBusiness(env, at, site.url);
    if (bizId) { rec.bizId = bizId; await connectBiz(env, at, bizId, instanceId, site.url); }
  } catch (e) { rec.err = String(e.message || e).slice(0, 120); }
  await firestorePatch(env, at, path, rec);
  return new Response('ok');
}

// עסק מאושר שה-website שלו באותו דומיין כמו האתר שהתקין
async function matchBusiness(env, at, siteUrl) {
  const h = host(siteUrl);
  if (!h) return null;
  const bs = await firestoreListDocs(env, at, 'businesses');
  const m = bs.filter(b => b.fields.website && host(b.fields.website) === h && b.fields.status === 'approved');
  return m.length === 1 ? m[0].id : null;
}

// חיבור לעסק – אותו מבנה כמו saveKey ב-onlineshops.js (בלי סוד אמיתי: instanceId לבד לא נותן גישה בלי WIX_APP_SECRET)
export async function connectBiz(env, at, bizId, instanceId, siteUrl) {
  const base = siteUrl ? new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : 'https://' + siteUrl).origin : '';
  const k = { platform: 'wix', base, creds: { instanceId }, savedAt: new Date(), savedBy: 'wix-app' };
  await firestorePatch(env, at, 'shopKeys/' + bizId, k);
  const bd = await firestoreGetDoc(env, at, 'businesses/' + bizId);
  const test = await testWix(env, k, (bd && bd.fields.discountCode) || '');
  const cur = await firestoreGetDoc(env, at, 'onlineShops/' + bizId);
  const f = { key: { platform: 'wix', hint: 'אפליקציית Wix', savedAt: new Date(), partial: false }, test, updatedAt: new Date(), updatedBy: 'wix-app' };
  if (!cur || !cur.fields.stage || cur.fields.stage === 'todo' || cur.fields.stage === 'sent') f.stage = 'got';
  await firestorePatch(env, at, 'onlineShops/' + bizId, f);
  return test;
}
