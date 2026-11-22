// ══ §796 — עסקים אונליין: סריקת החנות באתר + פרטי האינטגרציה לספירת רכישות בקוד קופון ══════════════
// רמי (22.11): "דף נפרד בדשבורד ניהול… אופציה בעסקים אונליין להזין את הקודים שהם נותנים לי לאינטגרציה.
// כל עסק שיתן יוכל לעלות, אני יסמן לך מהדשבורד".
// POST /admin-shops { idToken, action, bizId?, ... } – מנהל בלבד. admin-shops.html הוא הצרכן היחיד.
//
// שני אוספים חדשים, שניהם **בלי חוקים ב-firestore.rules = סגורים ללקוח** (רק הוורקר, דרך מפתח השירות):
//   • onlineShops/{bizId} – מה שהסריקה מצאה (פלטפורמה, מוצרים, מבצעים) + הסימונים של רמי (שלב, הערה,
//     "מאושר לעלות") + מצב המפתח (פלטפורמה, 4 תווים אחרונים, בדיקה אחרונה). **אין בו סוד.**
//   • shopKeys/{bizId} – הסוד עצמו (מפתח WooCommerce / טוקן Magento / Shopify). לא חוזר לדפדפן לעולם –
//     גם לא למנהל. הריפו פומבי, ולכן הסוד לא נכתב לשום קובץ.
// ⚠️ הכתובת שאליה נשלח המפתח נגזרת מהאתר שרשום בעסק (בצד הוורקר), לא מהבקשה – כמו SITES ב-benefitsales.js.
//    חריג: Shopify – כתובת ה-myshopify.com שבעל העסק נותן, ורק בתבנית הזאת.
// מה נקרא מהחנויות: רק ספירות (מוצרים, מבצעים, כמה פעמים נוצל הקוד). בלי פרטי לקוחות.
import { verifyAdminIdToken, getGoogleAccessToken } from './jwt.js';
import { firestoreListDocs, firestoreGetDoc, firestorePatch, firestoreDeleteDoc } from './firestore.js';
import { SITES } from './benefitsales.js';

const T = 15000;
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'he,en' };
const STAGES = ['todo', 'sent', 'got', 'live', 'no'];
const SALE_RX = /outlet|sale|אאוטלט|אוטלט|מבצע|סייל|הנח/i;
const dec = s => String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
const tail = s => '…' + String(s || '').slice(-4);
const err = e => String((e && e.message) || e).slice(0, 80);

async function get(url, headers) {
  return fetch(url, { headers: Object.assign({}, UA, headers || {}), redirect: 'follow', signal: AbortSignal.timeout(T) });
}
async function getJson(url, headers) {
  const r = await get(url, Object.assign({ Accept: 'application/json' }, headers || {}));
  if (!r.ok) throw new Error('http_' + r.status);
  return { r, j: await r.json() };
}
function siteUrl(w) {
  let u = String(w || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; }
}

// ── סריקה: איזו פלטפורמה, כמה מוצרים פתוחים לשליפה, כמה במבצע, אילו קטגוריות מבצע ─────────────────────
// ⚠️ "במבצע" לפי האתר לא תמיד מבצע: ב-Glory וב-STORMO כל המוצרים מסומנים (מחיר מחוק קבוע). allOnSale מסמן את זה.
async function scanSite(website) {
  const u = siteUrl(website);
  if (!u) return { platform: 'none', scanErr: 'אין כתובת תקינה' };
  let r, html;
  try { r = await get(u); html = await r.text(); } catch (e) { return { platform: 'down', scanErr: 'האתר לא נטען (' + err(e) + ')' }; }
  const base = new URL(r.url).origin, has = x => html.includes(x);
  const out = { base, finalUrl: r.url.slice(0, 300), products: null, onSale: null, saleCats: [], open: false };
  if (/instagram\.com|tiktok\.com|facebook\.com|linktr\.ee/i.test(base)) return Object.assign(out, { platform: 'social' });
  if (has('cdn.shopify.com') || has('Shopify.theme')) {
    out.platform = 'shopify';
    let n = 0, sale = 0, page = 1, more = false;
    try {
      for (; page <= 8; page++) {
        const { j } = await getJson(`${base}/products.json?limit=250&page=${page}`);
        const ps = (j && j.products) || [];
        if (!ps.length) break;
        for (const p of ps) { n++; if ((p.variants || []).some(v => v.compare_at_price && +v.compare_at_price > +v.price)) sale++; }
        if (ps.length < 250) break;
        if (page === 8) more = true;
      }
      if (n) Object.assign(out, { open: true, products: n, onSale: sale, more });
    } catch (e) { out.scanErr = 'products.json סגור (' + err(e) + ')'; }
  } else if (has('wp-content') || has('woocommerce')) {
    out.platform = 'wordpress';
    try {
      const p = await get(`${base}/wp-json/wc/store/v1/products?per_page=1`, { Accept: 'application/json' });
      const tot = p.headers.get('x-wp-total');
      if (p.ok && tot != null) {
        out.platform = 'woocommerce'; out.open = true; out.products = +tot;
        const s = await get(`${base}/wp-json/wc/store/v1/products?per_page=1&on_sale=true`, { Accept: 'application/json' });
        out.onSale = s.ok ? +(s.headers.get('x-wp-total') || 0) : null;
        try {
          const { j } = await getJson(`${base}/wp-json/wc/store/v1/products/categories?per_page=100`);
          if (Array.isArray(j)) out.saleCats = j.filter(c => SALE_RX.test(dec(c.name))).map(c => ({ n: dec(c.name), c: +c.count || 0 })).slice(0, 12);
        } catch (e) { /* הקטגוריות לא חובה */ }
      } else if (has('woocommerce')) { out.platform = 'woocommerce'; out.scanErr = 'Store API חסום (' + p.status + ')'; }
    } catch (e) { if (has('woocommerce')) { out.platform = 'woocommerce'; out.scanErr = 'Store API חסום (' + err(e) + ')'; } }
  } else if (has('Magento_') || has('mage/cookies') || has('magento-init')) {
    out.platform = 'magento';
    try {
      const q = encodeURIComponent('{categoryList(filters:{}){product_count children{name product_count}}}');
      const { j } = await getJson(`${base}/graphql?query=${q}`);
      const root = j && j.data && j.data.categoryList && j.data.categoryList[0];
      if (root) {
        Object.assign(out, { open: true, products: +root.product_count || 0 });
        out.saleCats = (root.children || []).filter(c => SALE_RX.test(c.name)).map(c => ({ n: c.name, c: +c.product_count || 0 }));
      }
    } catch (e) { out.scanErr = 'GraphQL סגור (' + err(e) + ')'; }
  } else if (has('static.wixstatic.com') || has('parastorage.com')) {
    out.platform = has('/product-page/') ? 'wixstore' : 'wix';
  } else if (has('konimbo')) out.platform = 'konimbo';
  else if (has('2all.co.il')) out.platform = '2all';
  else out.platform = 'other';
  if (out.products && out.onSale != null) out.allOnSale = out.onSale >= out.products * 0.9;
  return out;
}

// ── בדיקת חיבור: המפתח עובד? כמה פעמים נוצל הקוד? (ספירה בלבד) ──────────────────────────────────────
async function testKey(k, code) {
  const at = new Date().toISOString();
  try {
    if (k.platform === 'woocommerce') {
      const H = { Authorization: 'Basic ' + btoa(k.creds.ck + ':' + k.creds.cs) };
      const any = await get(`${k.base}/wp-json/wc/v3/coupons?per_page=1`, Object.assign({ Accept: 'application/json' }, H));
      if (any.status === 401 || any.status === 403) return { ok: false, err: 'המפתח לא מתקבל באתר (' + any.status + ') – לבדוק שההרשאה היא קריאה ושהקודים הועתקו במלואם', at };
      if (!any.ok) return { ok: false, err: 'האתר החזיר ' + any.status, at };
      if (!code) return { ok: true, keyOk: true, found: null, at };
      const { j } = await getJson(`${k.base}/wp-json/wc/v3/coupons?code=${encodeURIComponent(code.toLowerCase())}`, H);
      const c = Array.isArray(j) && j[0];
      return c ? { ok: true, keyOk: true, found: true, usage: +c.usage_count || 0, amount: String(c.amount || ''), type: String(c.discount_type || ''), at }
        : { ok: true, keyOk: true, found: false, at };
    }
    if (k.platform === 'magento') {
      const H = { Authorization: 'Bearer ' + k.creds.token };
      const f = 'searchCriteria[filterGroups][0][filters][0][field]=code&searchCriteria[filterGroups][0][filters][0][value]=' + encodeURIComponent(code || '___') + '&searchCriteria[filterGroups][0][filters][0][conditionType]=eq';
      const r = await get(`${k.base}/rest/V1/coupons/search?${f}`, Object.assign({ Accept: 'application/json' }, H));
      if (r.status === 401 || r.status === 403) return { ok: false, err: 'הטוקן לא מתקבל באתר (' + r.status + ') – צריך הרשאה ל-Marketing/Cart Price Rules', at };
      if (!r.ok) return { ok: false, err: 'האתר החזיר ' + r.status, at };
      const j = await r.json(), c = j && j.items && j.items[0];
      if (!code) return { ok: true, keyOk: true, found: null, at };
      return c ? { ok: true, keyOk: true, found: true, usage: +c.times_used || 0, at } : { ok: true, keyOk: true, found: false, at };
    }
    if (k.platform === 'shopify') {
      // אפליקציה מה-Dev Dashboard (מ-1.1.2026 אין יצירת מפתח ישן מהניהול): client credentials → טוקן קצר → GraphQL
      const tr = await fetch(`https://${k.creds.shop}/admin/oauth/access_token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: k.creds.clientId, client_secret: k.creds.clientSecret }), signal: AbortSignal.timeout(T),
      });
      if (!tr.ok) return { ok: false, err: 'Shopify לא נתן טוקן (' + tr.status + ') – לבדוק שהאפליקציה מותקנת בחנות ושהפרטים נכונים', at };
      const { access_token } = await tr.json();
      if (!code) return { ok: true, keyOk: true, found: null, at };
      const gq = await fetch(`https://${k.creds.shop}/admin/api/2025-10/graphql.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access_token },
        body: JSON.stringify({ query: 'query($c:String!){codeDiscountNodeByCode(code:$c){codeDiscount{... on DiscountCodeBasic{asyncUsageCount} ... on DiscountCodeFreeShipping{asyncUsageCount} ... on DiscountCodeBxgy{asyncUsageCount}}}}', variables: { c: code } }),
        signal: AbortSignal.timeout(T),
      });
      const j = await gq.json();
      if (j.errors) return { ok: false, keyOk: true, err: 'טוקן תקין, אבל חסרה הרשאה לקריאת הנחות (read_discounts)', at };
      const n = j.data && j.data.codeDiscountNodeByCode;
      return n ? { ok: true, keyOk: true, found: true, usage: +((n.codeDiscount || {}).asyncUsageCount) || 0, at } : { ok: true, keyOk: true, found: false, at };
    }
    return { ok: null, note: 'נשמר בלבד – לפלטפורמה הזאת עוד אין בדיקה אוטומטית', at };
  } catch (e) { return { ok: false, err: err(e), at }; }
}

// ── קלט המפתח לפי פלטפורמה. מחזיר { creds, hint } או { error } ─────────────────────────────────────
function parseCreds(platform, c) {
  const s = v => String(v || '').trim();
  if (platform === 'woocommerce') {
    const ck = s(c.ck), cs = s(c.cs);
    if (!/^ck_[a-f0-9]{30,60}$/i.test(ck) || !/^cs_[a-f0-9]{30,60}$/i.test(cs)) return { error: 'צריך שני קודים: אחד שמתחיל ב-ck_ ואחד שמתחיל ב-cs_ (להעתיק במלואם)' };
    return { creds: { ck, cs }, hint: tail(ck) };
  }
  if (platform === 'magento') {
    const token = s(c.token);
    if (!/^[A-Za-z0-9._-]{20,400}$/.test(token)) return { error: 'הטוקן לא נראה תקין (Access Token מ-System ← Integrations)' };
    return { creds: { token }, hint: tail(token) };
  }
  if (platform === 'shopify') {
    const shop = s(c.shop).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(shop)) return { error: 'כתובת החנות צריכה להסתיים ב-myshopify.com' };
    const clientId = s(c.clientId), clientSecret = s(c.clientSecret);
    if (!clientId && !clientSecret) return { creds: { shop }, hint: shop, partial: true };
    if (!/^[A-Za-z0-9]{16,80}$/.test(clientId) || !/^[A-Za-z0-9_-]{16,120}$/.test(clientSecret)) return { error: 'Client ID / Client secret לא נראים תקינים' };
    return { creds: { shop, clientId, clientSecret }, hint: shop };
  }
  const text = s(c.text);
  if (!text || text.length > 2000) return { error: 'להדביק את הפרטים שבעל העסק נתן (עד 2,000 תווים)' };
  return { creds: { text }, hint: tail(text) };
}

const pickBiz = (id, f) => ({
  id, name: f.name || '', website: f.website || '', status: f.status || '',
  code: f.discountCode || '', redeem: [].concat(f.discountRedeemMode || []), discountText: f.discountText || '',
  phone: f.whatsapp || f.ownerPhone || f.phone || '', owner: [f.ownerFirst, f.ownerLast].filter(Boolean).join(' '),
});

export async function handleOnlineShops(body, env) {
  const { idToken, action, bizId } = body || {};
  let admin;
  try { admin = await verifyAdminIdToken(env, idToken); } catch (e) { return { error: 'not_admin' }; }
  const by = typeof admin === 'string' ? admin : 'admin';
  const at = await getGoogleAccessToken(env);
  if (action === 'list') {
    const [bs, ss] = await Promise.all([firestoreListDocs(env, at, 'businesses'), firestoreListDocs(env, at, 'onlineShops')]);
    const shops = Object.fromEntries(ss.map(d => [d.id, d.fields]));
    // עסק שכבר מחובר ב-benefitsales.js (סוד בוורקר, Glory) – מסומן legacyKey כדי שלא ייראה "בלי מפתח"
    const legacy = Object.values(SITES).filter(s => env[s.key] && env[s.secret]).map(s => new URL(s.base).hostname.replace(/^www\./, ''));
    const host = w => { const u = siteUrl(w); try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch (e) { return ''; } };
    const rows = bs.filter(d => d.fields.status === 'approved' && String(d.fields.website || '').trim())
      .map(d => Object.assign(pickBiz(d.id, d.fields), { shop: shops[d.id] || null, legacyKey: legacy.includes(host(d.fields.website)) }));
    return { ok: true, rows };
  }
  if (typeof bizId !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(bizId)) return { error: 'bad_biz' };
  const bd = await firestoreGetDoc(env, at, 'businesses/' + bizId);
  if (!bd) return { error: 'no_biz' };
  const biz = bd.fields, path = 'onlineShops/' + bizId;
  if (action === 'scan') {
    const s = await scanSite(biz.website);
    const rec = Object.assign({ platform: s.platform, base: s.base || null, finalUrl: s.finalUrl || null, open: !!s.open, products: s.products ?? null,
      onSale: s.onSale ?? null, allOnSale: !!s.allOnSale, more: !!s.more, saleCats: s.saleCats || [], scanErr: s.scanErr || null }, { scannedAt: new Date() });
    await firestorePatch(env, at, path, rec);
    return { ok: true, shop: rec };
  }
  if (action === 'set') {
    const f = {};
    if ('stage' in body) { if (!STAGES.includes(body.stage)) return { error: 'bad_stage' }; f.stage = body.stage; }
    if ('isShop' in body) f.isShop = body.isShop === true ? true : body.isShop === false ? false : null;
    if ('showProducts' in body) f.showProducts = body.showProducts === true;
    if ('note' in body) f.note = String(body.note || '').slice(0, 1000);
    if (!Object.keys(f).length) return { error: 'nothing' };
    f.updatedAt = new Date(); f.updatedBy = by;
    await firestorePatch(env, at, path, f);
    return { ok: true };
  }
  if (action === 'saveKey') {
    const cur = await firestoreGetDoc(env, at, path);
    const platform = String(body.platform || (cur && cur.fields.platform) || '');
    if (!['woocommerce', 'magento', 'shopify', 'wixstore', 'wix', 'konimbo', '2all', 'other'].includes(platform)) return { error: 'bad_platform' };
    const p = parseCreds(platform, body.creds || {});
    if (p.error) return { error: p.error };
    const base = (cur && cur.fields.base) || (siteUrl(biz.website) && new URL(siteUrl(biz.website)).origin);
    if (!base && platform !== 'shopify') return { error: 'קודם לסרוק את האתר' };
    const k = { platform, base, creds: p.creds, savedAt: new Date(), savedBy: by };
    const test = p.partial ? { ok: null, note: 'נשמרה רק כתובת החנות – ממתין ל-Client ID ו-Client secret', at: new Date().toISOString() } : await testKey(k, biz.discountCode || '');
    await firestorePatch(env, at, 'shopKeys/' + bizId, k);
    const key = { platform, hint: p.hint, savedAt: new Date(), partial: !!p.partial };
    const f = { key, test, updatedAt: new Date(), updatedBy: by };
    if (!cur || !cur.fields.stage || cur.fields.stage === 'todo' || cur.fields.stage === 'sent') f.stage = 'got';
    await firestorePatch(env, at, path, f);
    return { ok: true, key, test, stage: f.stage };
  }
  if (action === 'test') {
    const kd = await firestoreGetDoc(env, at, 'shopKeys/' + bizId);
    if (!kd) return { error: 'no_key' };
    const test = await testKey(kd.fields, biz.discountCode || '');
    await firestorePatch(env, at, path, { test });
    return { ok: true, test };
  }
  if (action === 'delKey') {
    await firestoreDeleteDoc(env, at, 'shopKeys/' + bizId);
    await firestorePatch(env, at, path, { key: null, test: null, updatedAt: new Date(), updatedBy: by });
    return { ok: true };
  }
  return { error: 'bad_action' };
}
