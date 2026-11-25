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
import { firestoreListDocs, firestoreGetDoc, firestorePatch, firestoreDeleteDoc, firestoreRunQuery } from './firestore.js';
import { SITES, legacyCouponTotals } from './benefitsales.js';
import { testWix } from './wixapp.js';   // §797
import { MAIL_DOMAIN } from './couponmail.js';   // §804
import { buildShopifyShop, shopifyCats, shopifySearch } from './shopifyshop.js';   // §797ג

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
  else if (has('eshopstoresframework')) out.platform = 'eshop';   // §796יח – מערכת ישראלית (Max Sport)
  else if (/Firewall Alert|Access Denied|Attention Required/i.test(html.slice(0, 3000))) Object.assign(out, { platform: 'other', scanErr: 'האתר חוסם סריקה אוטומטית – לבחור מערכת ידנית' });
  else out.platform = 'other';
  if (out.products && out.onSale != null) out.allOnSale = out.onSale >= out.products * 0.9;
  return out;
}

// ── בדיקת חיבור: המפתח עובד? כמה פעמים נוצל הקוד? (ספירה בלבד) ──────────────────────────────────────
async function testKey(k, code, env) {
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
    // §797 – Wix: מחובר דרך אפליקציית Yellow Zone (instanceId מה-webhook), לא מפתח שהוזן ידנית
    if ((k.platform === 'wix' || k.platform === 'wixstore') && k.creds && k.creds.instanceId) return testWix(env, k, code);
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

// ══ §796ד/יב — "מה יש באתר" לכל עסק WooCommerce: לשוניות + מוצרים (רמי, 23.11) ═══════════════════════
// עד 6 לשוניות קטגוריה, 12 מוצרים בכל אחת. (§796יב, רמי: "אל תחייב לשים מומלצים, שפשוט יהיה 6 קטגוריות"
// + "הוא יכול לבחור בכל קטגוריה איזה מוצר ולא רק בראשונה?") – אין לשונית "מומלצים" נפרדת. שני מצבים:
//   • auto – "הכי נמכרים" + 4 הקטגוריות שהכי מופיעות בין 100 הנמכרים + קטגוריית מבצעים/אאוטלט אם יש (אחרת 5).
//   • manual – עד 6 הקטגוריות שבעל העסק בחר, בסדר שלו (shopCats).
// בכל לשונית: המוצרים שנבחרו לה (tabPins[k], בסדר 1–12) ראשונים, ואחריהם הנמכרים ביותר עד 12.
// מפתח לשונית: 'top' = הכי נמכרים, 'c<id>' = קטגוריה. מוצר שהוסר (hidden) לא מופיע באף לשונית, אלא אם נבחר במפורש.
// "הכי נמכרים" = orderby=popularity של WooCommerce עצמו (מונה המכירות של כל מוצר, מתחילת הדרך).
// מידע ציבורי (Store API, בלי מפתח). נשמר ב-KV לכל עסק, מתרענן כל 6 שעות ומתבטל בשמירת הגדרות.
const SHOP_MAX = 12, TABS_MAX = 6, BIZSHOP_TTL = 6 * 3600 * 1000;
const JUNK_CAT = /^(upsell|uncategorized|ללא קטגוריה|כללי|all|הכל|כל המוצרים)$/i;
// (§797ג) היה /^(top|cd{1,12})$/ – בק-סלאש שנבלע ב-heredoc: tabPins של לשוניות קטגוריה נזרקו בשמירה. Shopify: מזהי collection של 12+ ספרות.
const TABKEY_RX = /^(top|c\d{1,15})$/;
// §797ג – חנות שאפשר להציג: WooCommerce פתוחה, או Shopify (נסרקה כפתוחה, או סומנה ידנית כ-Shopify). platformManual גובר.
const platOf = f => (f && (f.platformManual || f.platform)) || '';
// §804 – חיבור במייל: חנות בלי API (למשל Wix בלי האפליקציה) מפנה את התראת ההזמנה בקוד ל-<mailKey>@in.yellowzone.co.il
const mailOk = f => !!(f && f.connMode === 'mail' && f.mailKey);
const linkOk = f => shopOk(f) || mailOk(f);
const shopOk = f => !!(f && f.base && ((platOf(f) === 'woocommerce' && f.open) || (platOf(f) === 'shopify' && (f.open || f.platformManual === 'shopify'))));
const sapi = (base, q) => getJson(`${base}/wp-json/wc/store/v1/${q}`).then(x => x.j);
const prodOut = p => {
  const pr = p.prices || {}, div = Math.pow(10, pr.currency_minor_unit || 0);
  return { id: p.id, n: dec(p.name), p: Number(pr.price) / div, w: Number(pr.regular_price) / div, img: (p.images && p.images[0] && (p.images[0].thumbnail || p.images[0].src)) || '', url: p.permalink };
};
const usable = p => p && p.is_in_stock !== false && p.images && p.images[0];
// מוצרים שנבחרו ללשוניות. תאימות: pinned הישן (רשימה אחת, §796ד–יא) = הבחירה של הלשונית הראשונה.
function tabPinsOf(shop, firstKey) {
  const tp = Object.assign({}, shop.tabPins || {});
  if (!shop.tabPins && (shop.pinned || []).length && firstKey) tp[firstKey] = shop.pinned;
  return tp;
}
export async function buildBizShop(shop) {
  if (platOf(shop) === 'shopify') return buildShopifyShop(shop, { SHOP_MAX, TABS_MAX, SALE_RX, tabPinsOf });   // §797ג
  const base = shop.base;
  const auto = !(shop.shopMode === 'manual' && (shop.shopCats || []).length);
  const [catsR, topR] = await Promise.all([
    sapi(base, 'products/categories?per_page=100'),
    auto ? sapi(base, 'products?per_page=100&orderby=popularity&order=desc') : null,
  ]);
  const cats = catsR || [];
  const total = shop.products || 0;
  const cat = id => cats.find(c => c.id === id);
  const plan = [];   // { k, t, cat?, sale?, url, count }
  if (!auto) {
    for (const c of shop.shopCats.map(x => cat(x.id)).filter(Boolean).slice(0, TABS_MAX)) plan.push({ k: 'c' + c.id, t: dec(c.name), cat: c, url: c.permalink || base, count: c.count, sale: SALE_RX.test(dec(c.name)) });
  } else {
    plan.push({ k: 'top', t: 'הכי נמכרים', url: base, count: total });
    const freq = {};
    for (const p of topR || []) for (const c of p.categories || []) freq[c.id] = (freq[c.id] || 0) + 1;
    // קטגוריה בשם "הכי נמכרים…" של האתר היא כפילות של הלשונית שלנו (נמדד ב-Glory: "הכי נמכרים החודש")
    const ok = c => c && c.count >= 3 && !JUNK_CAT.test(dec(c.name).trim()) && !SALE_RX.test(dec(c.name)) && !/הכי נמכר|נמכרים ביותר|best ?sell/i.test(dec(c.name)) && !(total && c.count > total * 0.8);
    const sale = cats.filter(c => c.count >= 3 && SALE_RX.test(dec(c.name)) && !JUNK_CAT.test(dec(c.name))).sort((a, b) => b.count - a.count)[0];
    const want = TABS_MAX - 1 - (sale ? 1 : 0);
    const chosen = Object.keys(freq).map(Number).map(cat).filter(ok).sort((a, b) => freq[b.id] - freq[a.id] || b.count - a.count).slice(0, want);
    if (chosen.length < want) chosen.push(...cats.filter(c => ok(c) && !chosen.includes(c)).sort((a, b) => b.count - a.count).slice(0, want - chosen.length));
    for (const c of chosen) plan.push({ k: 'c' + c.id, t: dec(c.name), cat: c, url: c.permalink || base, count: c.count });
    if (sale) plan.push({ k: 'c' + sale.id, t: dec(sale.name), cat: sale, url: sale.permalink || base, count: sale.count, sale: true });
  }
  const tp = tabPinsOf(shop, plan[0] && plan[0].k);
  const pinsFor = k => (tp[k] || []).map(x => x.id).filter(Number.isFinite).slice(0, SHOP_MAX);
  const allPinned = [...new Set(plan.flatMap(x => pinsFor(x.k)))];
  const hide = new Set((shop.hidden || []).map(x => x.id).filter(Number.isFinite));
  // במקביל (ברצף זה לקח ~15 שנ' מול האתרים – נמדד 23.11): המוצרים שנבחרו (בקשה אחת) + כל קטגוריה
  const [pinR, ...lists] = await Promise.all([
    allPinned.length ? sapi(base, `products?include=${allPinned.slice(0, 100).join(',')}&per_page=${Math.min(100, allPinned.length)}`).catch(() => []) : null,
    ...plan.map(x => x.cat ? sapi(base, `products?per_page=30&orderby=popularity&order=desc&category=${x.cat.id}`).catch(() => []) : Promise.resolve(topR || [])),
  ]);
  const byId = Object.fromEntries((pinR || []).filter(usable).map(p => [p.id, prodOut(p)]));
  const tabs = [];
  plan.forEach((x, i) => {
    const pins = pinsFor(x.k).map(id => byId[id]).filter(Boolean);
    const taken = new Set(pins.map(p => p.id));
    const fill = (lists[i] || []).filter(p => usable(p) && !hide.has(p.id) && !taken.has(p.id)).map(prodOut);
    const products = pins.concat(fill).slice(0, SHOP_MAX);
    if (products.length >= 3) tabs.push({ k: x.k, t: x.t, products, pinned: pins.length, url: x.url, count: x.count, sale: !!x.sale });
  });
  const deal = tabs.find(t => t.sale);
  return { base, total, mode: auto ? 'auto' : 'manual', tabs, deal: deal ? { t: deal.t, count: deal.count } : null, at: new Date().toISOString() };
}
const bizShopKey = id => 'bizShop2:' + id;   // §796יב – מפתח חדש: התצוגות הישנות (עם לשונית "מומלצים") לא נקראות יותר
async function bizShopFresh(env, at, id, force) {
  if (!force) {
    const c = await env.RATE_LIMIT_KV.get(bizShopKey(id), 'json');
    if (c && c.body && Date.now() - c.t < BIZSHOP_TTL) return c.body;
  }
  let sd = await firestoreGetDoc(env, at, 'onlineShops/' + id);
  // עסק שעוד לא נסרק (רמי לא הריץ "סריקת האתרים") – נסרק כאן פעם אחת, כדי שקישור הדוגמה לא ייצא ריק
  if (!sd) {
    const bd = await firestoreGetDoc(env, at, 'businesses/' + id);
    if (!bd || bd.fields.status !== 'approved' || !bd.fields.website) throw new Error('not_open_woo');
    const s = await scanSite(bd.fields.website);
    const rec = { platform: s.platform, base: s.base || null, finalUrl: s.finalUrl || null, open: !!s.open, products: s.products ?? null, onSale: s.onSale ?? null,
      allOnSale: !!s.allOnSale, more: !!s.more, saleCats: s.saleCats || [], scanErr: s.scanErr || null, scannedAt: new Date() };
    await firestorePatch(env, at, 'onlineShops/' + id, rec);
    sd = { fields: rec };
  }
  if (!shopOk(sd.fields)) throw new Error('not_open_woo');
  const body = JSON.stringify(await buildBizShop(sd.fields));
  await env.RATE_LIMIT_KV.put(bizShopKey(id), JSON.stringify({ t: Date.now(), body }));
  return body;
}
// GET /biz-shop?biz=<id> – ציבורי (אותו מידע שבאתר של העסק). ל-biz-shop-demo.html ובהמשך לכרטיס העסק.
export async function handleBizShop(url, env) {
  const id = url.searchParams.get('biz') || '';
  const H = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' };
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return new Response('{"error":"bad_biz"}', { status: 400, headers: H });
  try {
    return new Response(await bizShopFresh(env, await getGoogleAccessToken(env), id, false), { headers: H });
  } catch (e) {
    const m = err(e);
    return new Response(JSON.stringify({ error: m === 'not_open_woo' ? m : 'shop_unavailable' }), { status: m === 'not_open_woo' ? 404 : 502, headers: H });
  }
}

// GET /biz-shop-list → { ids:[...] } – העסקים שרמי סימן "מאושר לעלות לכרטיס" (showProducts) ושיש להם חנות WooCommerce פתוחה.
// home.html קורא פעם אחת לטעינה, ורק לעסק ברשימה פונה ל-/biz-shop כשהכרטיס נפתח (לא בקשה על כל עסק).
// Cache API של Cloudflare ל-10 דקות (בלי כתיבות KV – התקרה החינמית 1,000 ביום); סימון חדש עולה תוך ≤10 דק'.
export async function handleBizShopList(request, env, ctx) {
  const H = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' };
  const cache = caches.default, key = new Request(new URL('/biz-shop-list', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const at = await getGoogleAccessToken(env);
    const rows = await firestoreRunQuery(env, at, 'onlineShops', 'showProducts', true, 300);
    const ids = rows.filter(r => shopOk(r.fields)).map(r => r.id);
    const res = new Response(JSON.stringify({ ids }), { headers: H });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    console.error('bizShopList failed', String(e));
    return new Response('{"ids":[]}', { headers: Object.assign({}, H, { 'Cache-Control': 'no-store' }) });
  }
}

// ══ §796ו — קישור לבעל העסק: בוחר בעצמו אוטומטי / 5 קטגוריות + מוצרים ראשונים (רמי, 23.11) ══════════════
// shop-setup.html?biz=<id>&k=<חתימה>. החתימה = HMAC-SHA256 של "<bizId>:<linkVer>" במפתח שנגזר מהמפתח הפרטי של
// חשבון השירות (סוד קיים בוורקר – בלי סוד חדש). "קישור חדש" ב-admin מעלה את linkVer ← הקישור הקודם מפסיק לעבוד.
// הקישור נותן רק את השדות האלה (shopMode / shopCats / tabPins / hidden) – לא מפתחות, לא שלב, לא אישור לעלות.
let _linkKey = null;
async function linkKey(env) {
  if (_linkKey) return _linkKey;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sa.private_key + '|shop-owner-link-v1'));
  _linkKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return _linkKey;
}
async function linkSig(env, bizId, ver) {
  const s = await crypto.subtle.sign('HMAC', await linkKey(env), new TextEncoder().encode(bizId + ':' + (ver || 1)));
  return btoa(String.fromCharCode(...new Uint8Array(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 24);
}
const sameStr = (a, b) => { a = String(a || ''); b = String(b || ''); if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
function cleanShopFields(body) {
  const f = {};
  if ('shopMode' in body) f.shopMode = body.shopMode === 'manual' ? 'manual' : 'auto';
  if ('shopCats' in body) f.shopCats = [].concat(body.shopCats || []).slice(0, TABS_MAX)
    .map(c => ({ id: Math.trunc(+c.id), n: String(c.n || '').slice(0, 80) })).filter(c => c.id > 0);
  if ('pinned' in body) f.pinned = [].concat(body.pinned || []).slice(0, SHOP_MAX)
    .map(p => ({ id: Math.trunc(+p.id), n: String(p.n || '').slice(0, 120), img: String(p.img || '').slice(0, 400) })).filter((p, i, a) => p.id > 0 && a.findIndex(x => x.id === p.id) === i);
  if ('tabPins' in body) {
    const tp = {}, src = body.tabPins && typeof body.tabPins === 'object' ? body.tabPins : {};
    for (const k of Object.keys(src).filter(k => TABKEY_RX.test(k)).slice(0, 20)) {
      const arr = [].concat(src[k] || []).slice(0, SHOP_MAX).map(p => ({ id: Math.trunc(+p.id), n: String(p.n || '').slice(0, 120), img: String(p.img || '').slice(0, 400) })).filter((p, i, a2) => p.id > 0 && a2.findIndex(x => x.id === p.id) === i);
      if (arr.length) tp[k] = arr;
    }
    f.tabPins = tp; f.pinned = [];   // pinned הישן מתבטל ברגע שיש tabPins
  }
  if ('hidden' in body) f.hidden = [].concat(body.hidden || []).slice(0, 200)
    .map(p => ({ id: Math.trunc(+p.id), n: String(p.n || '').slice(0, 120), img: String(p.img || '').slice(0, 400) })).filter((p, i, a) => p.id > 0 && a.findIndex(x => x.id === p.id) === i);
  return f;
}
async function siteCats(base, plat) {
  if (plat === 'shopify') return shopifyCats(base);   // §797ג
  const cs = await sapi(base, 'products/categories?per_page=100');
  return (cs || []).filter(c => c.count > 0 && !JUNK_CAT.test(dec(c.name).trim())).map(c => ({ id: c.id, n: dec(c.name), c: c.count })).sort((a, b) => b.c - a.c);
}
async function siteSearch(base, q, plat) {
  if (plat === 'shopify') return shopifySearch(base, q);   // §797ג
  q = String(q || '').trim().slice(0, 60);
  if (q.length < 2) return [];
  const a = await sapi(base, 'products?per_page=12&search=' + encodeURIComponent(q));
  return (a || []).filter(usable).map(prodOut);
}
// התצוגה הנוכחית (מה-KV או בנייה) – לרשימת "המוצרים שבכרטיס עכשיו" בדף הבחירה
async function currentShop(env, at, id) {
  try { const j = JSON.parse(await bizShopFresh(env, at, id, false)); return { tabs: (j.tabs || []).map(t => ({ k: t.k, t: t.t, pinned: t.pinned || 0, products: t.products })) }; } catch (e) { return null; }
}
// §796יג – האם האתר מחובר לספירת הקופון: מפתח שנבדק ועבד, או סוד ותיק בוורקר (Glory, SITES ב-benefitsales.js)
function keyState(env, s) {
  const host = u => { try { return new URL(u).hostname.replace(/^www./, ''); } catch (e) { return ''; } };
  const legacy = s.base && Object.values(SITES).some(x => env[x.key] && env[x.secret] && host(x.base) === host(s.base));
  if (legacy) return { connected: true, legacy: true };
  if (mailOk(s)) return { connected: true, mail: true };   // §804
  if (s.key && !s.key.partial && (!s.test || s.test.ok !== false)) return { connected: true, hint: s.key.hint, found: s.test ? s.test.found : null };
  return { connected: false, err: s.test && s.test.ok === false ? s.test.err : null };
}
// POST /shop-owner { biz, k, action: 'get' | 'search' | 'save', ... } – ציבורי, מאומת בחתימה בלבד
export async function handleShopOwner(body, env) {
  const { biz, k, action } = body || {};
  if (typeof biz !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(biz) || typeof k !== 'string') return { error: 'bad_link' };
  const at = await getGoogleAccessToken(env);
  const sd = await firestoreGetDoc(env, at, 'onlineShops/' + biz);
  if (!sd || !sameStr(k, await linkSig(env, biz, sd.fields.linkVer || 1))) return { error: 'bad_link' };
  const s = sd.fields;
  if (!linkOk(s)) return { error: 'not_open_woo' };
  const plat = platOf(s);
  try {
    // §804 – מצב מייל: הדף מציג רק את הוראות ההפניה + כמה התראות כבר התקבלו (בלי לשוניות ומוצרים – אין קטלוג)
    if (!shopOk(s)) {
      if (action !== 'get') return { error: 'not_open_woo' };
      const bd = await firestoreGetDoc(env, at, 'businesses/' + biz);
      const mails = await firestoreRunQuery(env, at, 'couponMails', 'bizId', biz, 200).catch(() => []);
      const last = mails.map(m => m.fields.at).filter(Boolean).sort().pop() || null;
      return { ok: true, mailMode: true, mailAddr: s.mailKey + '@' + MAIL_DOMAIN, mails: mails.length, withAmount: mails.filter(m => m.fields.amount != null).length, last,
        code: (bd && bd.fields.discountCode) || '', name: (bd && bd.fields.name) || '', platform: plat };
    }
    if (action === 'get') {
      const bd = await firestoreGetDoc(env, at, 'businesses/' + biz);
      const shop = await currentShop(env, at, biz);
      const first = shop && shop.tabs[0] && shop.tabs[0].k;
      return { ok: true, key: keyState(env, s), code: (bd && bd.fields.discountCode) || '', name: (bd && bd.fields.name) || '', site: s.base, total: s.products || 0, mode: s.shopMode === 'manual' ? 'manual' : 'auto', cats: s.shopCats || [], tabPins: tabPinsOf(s, first), hidden: s.hidden || [], allCats: await siteCats(s.base, plat), shop, platform: plat };
    }
    if (action === 'search') return { ok: true, products: await siteSearch(s.base, body.q, plat) };
    // §796יג – בעל העסק מחבר את האתר בעצמו (מפתח קריאה של WooCommerce): נבדק מיד, ורק אם עבד – נשמר כמחובר
    if (action === 'saveKey') {
      // §801 – רמי: "תנעל את האפשרות לגעת בקודים". אתר שכבר מחובר – החיבור לא מוחלף מהקישור (רק דרכנו, ב-admin-shops).
      if (keyState(env, s).connected) return { error: 'האתר כבר מחובר. לשינוי החיבור – כתבו לנו 💛' };
      const pc = parseCreds(plat, body.creds || {});   // §797ג – Shopify: myshopify + Client ID + Client secret
      if (pc.error) return { error: pc.error };
      if (pc.partial) return { error: 'צריך גם את ה-Client ID וגם את ה-Client secret' };
      const bd = await firestoreGetDoc(env, at, 'businesses/' + biz);
      const k = { platform: plat, base: s.base, creds: pc.creds, savedAt: new Date(), savedBy: 'owner-link' };
      const test = await testKey(k, (bd && bd.fields.discountCode) || '', env);
      if (test.ok !== true) return { error: test.err || (plat === 'shopify' ? 'החיבור לא הצליח – בדקו את כתובת ה-myshopify ושהעתקתם את Client ID ו-Client secret במלואם' : 'החיבור לא הצליח – בדקו שהעתקתם את שני הקודים במלואם ושההרשאה היא "קריאה"') };
      await firestorePatch(env, at, 'shopKeys/' + biz, k);
      const f = { key: { platform: plat, hint: pc.hint, savedAt: new Date(), partial: false }, test, updatedAt: new Date(), updatedBy: 'owner-link' };
      if (!s.stage || s.stage === 'todo' || s.stage === 'sent') f.stage = 'got';
      await firestorePatch(env, at, 'onlineShops/' + biz, f);
      return { ok: true, key: { connected: true, hint: pc.hint, found: test.found } };
    }
    if (action === 'save') {
      // (23.11) רמי: חיבור האתר הוא חובה בקישור – "זה מדרבן אותם"
      if (!keyState(env, s).connected) return { error: 'קודם מחברים את האתר (שלב 1) – ואז שומרים' };
      const f = cleanShopFields(body);
      if (f.shopMode === 'manual' && !(f.shopCats || []).length) return { error: 'במצב ידני צריך לבחור לפחות קטגוריה אחת' };
      f.updatedAt = new Date(); f.updatedBy = 'owner-link'; f.ownerSetAt = new Date();
      // §801/§802 – רמי: "לא רוצה לאשר, זו החלטה שלו – רק חשוב לי לדעת… אבל בשינויים מבעל העסק".
      // נכנס לתוקף מיד; על מסמך העסק נרשם shopOwnerChangeAt + תקציר → תגית "🛍️ שינה את 'מה יש באתר'" ליד השם במרכז הניהול.
      // (במקום המייל+פוש של §801.) כשל ברישום לא מפיל את השמירה.
      await firestorePatch(env, at, 'onlineShops/' + biz, f);
      try {
        const pinsN = Object.values(f.tabPins || {}).reduce((n, x) => n + x.length, 0);
        const sum = (f.shopMode === 'manual' ? 'ידני: ' + (f.shopCats || []).map(c => c.n).join(' · ') : 'אוטומטי') + ' · ' + pinsN + ' קבועים · ' + (f.hidden || []).length + ' הוסרו';
        await firestorePatch(env, at, 'businesses/' + biz, { shopOwnerChangeAt: new Date(), shopOwnerChange: sum.slice(0, 300) });
      } catch (e) { console.error('owner shop change mark failed', e); }
      try { await bizShopFresh(env, at, biz, true); } catch (e) { return { ok: true, rebuild: err(e) }; }
      return { ok: true, shop: await currentShop(env, at, biz) };
    }
  } catch (e) { return { error: 'האתר לא ענה (' + err(e) + ')' }; }
  return { error: 'bad_action' };
}

// POST /biz-shop-link { accessToken } או { idToken, bizId } – מהאזור האישי של העסק (business-dashboard.html):
// אותו אימות כמו /biz-weekly-stats, ומחזיר את הקישור החתום ל-shop-setup.html. רק לעסק שכבר "עלה לכרטיס" (showProducts).
export async function handleBizShopLink(body, env, ownerBizId) {
  const bizId = await ownerBizId(body);
  if (!bizId) return { error: 'not_owner' };
  const at = await getGoogleAccessToken(env);
  let sd = await firestoreGetDoc(env, at, 'onlineShops/' + bizId);
  // §796יב – עסק חדש (עוד לא נסרק): נסרק כאן, כדי שכל עסק עם חנות יקבל את הבחירה כבר אחרי ההרשמה, בלי פעולה של רמי
  if (!sd) {
    const bd = await firestoreGetDoc(env, at, 'businesses/' + bizId);
    if (!bd || bd.fields.status !== 'approved' || !bd.fields.website) return { ok: true, shop: false };
    const sc = await scanSite(bd.fields.website);
    const rec = { platform: sc.platform, base: sc.base || null, finalUrl: sc.finalUrl || null, open: !!sc.open, products: sc.products ?? null, onSale: sc.onSale ?? null,
      allOnSale: !!sc.allOnSale, more: !!sc.more, saleCats: sc.saleCats || [], scanErr: sc.scanErr || null, scannedAt: new Date() };
    await firestorePatch(env, at, 'onlineShops/' + bizId, rec);
    sd = { fields: rec };
  }
  const f = sd.fields;
  if (mailOk(f) && !shopOk(f)) return { ok: true, shop: true, mailMode: true, url: await setupUrl(env, bizId, f.linkVer || 1) };   // §804
  if (!shopOk(f) || f.isShop === false) return { ok: true, shop: false };
  return { ok: true, shop: true, live: !!f.showProducts, filled: !!f.ownerSetAt, url: await setupUrl(env, bizId, f.linkVer || 1), mode: f.shopMode === 'manual' ? 'manual' : 'auto',
    pinned: Object.values(f.tabPins || {}).reduce((n, x) => n + x.length, 0) || (f.pinned || []).length, cats: (f.shopCats || []).map(c => c.n) };
}
const setupUrl = async (env, bizId, ver) => `https://yellowzone.co.il/shop-setup.html?biz=${bizId}&k=${await linkSig(env, bizId, ver)}`;

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
    // §796יח – גם עסקים שממתינים לאישור (רמי: "העסק שממתין מקס ספורט… תוסיף אותו לרשימה")
    const rows = bs.filter(d => (d.fields.status === 'approved' || d.fields.status === 'pending') && String(d.fields.website || '').trim())
      .map(d => Object.assign(pickBiz(d.id, d.fields), { shop: shops[d.id] || null, legacyKey: legacy.includes(host(d.fields.website)) }));
    // §796ח – הקישור לבעל העסק ליד כל חנות WooCommerce פתוחה (רמי: "את הלינק תוסיף לרשימה ליד כל עסק")
    for (const r of rows) if (linkOk(r.shop)) r.setupUrl = await setupUrl(env, r.id, r.shop.linkVer || 1);
    return { ok: true, rows };
  }
  // §804 – מרכז הנתונים: "מימושי קוד קופון" – שורה לכל חנות מחוברת (מפתח / אפליקציה / ותיק בוורקר / מייל).
  // מפתח ואפליקציה – בדיקה חיה (testKey, כמו "בדיקה" ב-admin-shops); ותיק – benefitsales; מייל – סיכום couponMails.
  if (action === 'redemptions') {
    const [bs, ss, mails] = await Promise.all([firestoreListDocs(env, at, 'businesses'), firestoreListDocs(env, at, 'onlineShops'), firestoreListDocs(env, at, 'couponMails').catch(() => [])]);
    const bizF = Object.fromEntries(bs.map(d => [d.id, d.fields]));
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
    const rows = await Promise.all(ss.filter(d => bizF[d.id] && keyState(env, d.fields).connected).map(async d => {
      const f = d.fields, b = bizF[d.id], code = b.discountCode || '', ks = keyState(env, f);
      const r = { id: d.id, name: b.name || '', platform: platOf(f) || '', code, conn: ks.mail ? 'mail' : ks.legacy ? 'key' : platOf(f) === 'wix' || platOf(f) === 'wixstore' ? 'app' : 'key', orders: null, revenue: null, last: null, err: '' };
      try {
        if (ks.mail) {
          const m = mails.filter(x => x.fields.bizId === d.id);
          r.orders = m.length; r.revenue = m.reduce((s2, x) => s2 + (Number(x.fields.amount) || 0), 0);
          r.noAmount = m.filter(x => x.fields.amount == null).length;
          r.last = m.map(x => x.fields.at).filter(Boolean).sort().pop() || null; r.mailAddr = f.mailKey + '@' + MAIL_DOMAIN;
          r.list = m.map(x => ({ at: x.fields.at || '', amount: x.fields.amount == null ? null : Number(x.fields.amount) }));   // §805
        } else if (ks.legacy) {
          const sid = Object.keys(SITES).find(k => host(SITES[k].base) === host(f.base));
          const t = await legacyCouponTotals(sid, code, env);
          if (t && t.found) { r.orders = t.orders; r.revenue = t.revenue; r.usage = t.usage; r.list = t.list || []; } else r.err = 'הקוד לא נמצא באתר';
          r.last = new Date().toISOString();
        } else {
          const kd = await firestoreGetDoc(env, at, 'shopKeys/' + d.id);
          const t = kd ? await testKey(kd.fields, code, env) : null;
          if (t && t.ok) { r.orders = t.usage ?? null; r.revenue = t.sum ?? null; if (t.found === false) r.err = 'הקוד לא נמצא באתר'; await firestorePatch(env, at, 'onlineShops/' + d.id, { test: t }); }
          else r.err = (t && t.err) || 'אין מפתח שמור';
          r.last = (t && t.at) || null;
        }
      } catch (e) { r.err = err(e); }
      return r;
    }));
    rows.sort((x, y) => (y.orders || 0) - (x.orders || 0));
    return { ok: true, rows, unmatched: mails.filter(x => !x.fields.bizId).length };
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
    if ('platformManual' in body) f.platformManual = ['', 'woocommerce', 'shopify', 'magento', 'wix', 'konimbo', '2all', 'eshop', 'other'].includes(body.platformManual) ? (body.platformManual || null) : null;   // §796יח – כשהסריקה לא מזהה
    if ('focus' in body) f.focus = body.focus === true;
    // §804 – חיבור במייל + הכתובת האישית (<mailKey>@in.yellowzone.co.il). mailKey ייחודי – נבדק מול שאר החנויות.
    if ('connMode' in body) f.connMode = body.connMode === 'mail' ? 'mail' : null;
    if ('mailKey' in body) {
      const mk = String(body.mailKey || '').toLowerCase().trim();
      if (mk && !/^[a-z0-9][a-z0-9-]{1,30}$/.test(mk)) return { error: 'mailKey: אותיות אנגליות קטנות, ספרות ומקף' };
      if (mk) { const dup = await firestoreRunQuery(env, at, 'onlineShops', 'mailKey', mk, 2); if (dup.some(d => d.id !== bizId)) return { error: 'הכתובת תפוסה לעסק אחר' }; }
      f.mailKey = mk || null;
    }   // §796טו – "📞 לטיפול" בראש הרשימה
    // §796ד – מה מוצג בכרטיס: אוטומטי / 5 קטגוריות ידניות / מוצרים ראשונים
    if ('shopMode' in body) f.shopMode = body.shopMode === 'manual' ? 'manual' : 'auto';
    if ('shopCats' in body) f.shopCats = [].concat(body.shopCats || []).slice(0, TABS_MAX)
      .map(c => ({ id: Math.trunc(+c.id), n: String(c.n || '').slice(0, 80) })).filter(c => c.id > 0);
    if ('pinned' in body) f.pinned = [].concat(body.pinned || []).slice(0, SHOP_MAX)
      .map(p => ({ id: Math.trunc(+p.id), n: String(p.n || '').slice(0, 120), img: String(p.img || '').slice(0, 400) })).filter(p => p.id > 0);
    if ('hidden' in body) f.hidden = cleanShopFields({ hidden: body.hidden }).hidden;
    if ('tabPins' in body) Object.assign(f, cleanShopFields({ tabPins: body.tabPins }));
    if (!Object.keys(f).length) return { error: 'nothing' };
    f.updatedAt = new Date(); f.updatedBy = by;
    await firestorePatch(env, at, path, f);
    if ('shopMode' in f || 'shopCats' in f || 'pinned' in f || 'hidden' in f || 'tabPins' in f) {
      try { await bizShopFresh(env, at, bizId, true); } catch (e) { return { ok: true, rebuild: err(e) }; }
    }
    return { ok: true };
  }
  // §802 – רמי: "בכרטיס של העסק במרכז הניהול – לראות את הלינק, האם הוא מחובר באינטגרציה ולאיזו מערכת"
  if (action === 'bizInfo') {
    const sd = await firestoreGetDoc(env, at, path);
    if (!sd) return { ok: true, scanned: false, website: !!String(biz.website || '').trim() };
    const f = sd.fields, ok = linkOk(f);
    return { ok: true, scanned: true, isShop: f.isShop !== false && (ok || !!platOf(f)), platform: platOf(f) || '', open: !!f.open,
      mailMode: mailOk(f), mailAddr: mailOk(f) ? f.mailKey + '@' + MAIL_DOMAIN : '',
      connected: keyState(env, f).connected, live: !!f.showProducts, ownerSetAt: f.ownerSetAt || null,
      url: ok ? await setupUrl(env, bizId, f.linkVer || 1) : '' };
  }
  if (action === 'ownerLink') {
    const sd = await firestoreGetDoc(env, at, path);
    if (!sd || !linkOk(sd.fields)) return { error: 'רק לחנות WooCommerce / Shopify שנסרקה, או חנות שמחוברת במייל' };
    let ver = sd.fields.linkVer || 1;
    if (body.renew) { ver += 1; await firestorePatch(env, at, path, { linkVer: ver }); }
    else if (!sd.fields.linkVer) await firestorePatch(env, at, path, { linkVer: 1 });
    return { ok: true, url: await setupUrl(env, bizId, ver) };
  }
  if (action === 'cats' || action === 'searchProducts') {
    const sd = await firestoreGetDoc(env, at, path);
    const base = sd && sd.fields.base;
    if (!base || !shopOk(sd.fields)) return { error: 'רק לחנות WooCommerce / Shopify שנסרקה' };
    try {
      if (platOf(sd.fields) === 'shopify') return action === 'cats' ? { ok: true, cats: await shopifyCats(base) } : { ok: true, products: await shopifySearch(base, body.q) };   // §797ג
      if (action === 'cats') {
        const cs = await sapi(base, 'products/categories?per_page=100');
        return { ok: true, cats: (cs || []).filter(c => c.count > 0 && !JUNK_CAT.test(dec(c.name).trim())).map(c => ({ id: c.id, n: dec(c.name), c: c.count, parent: c.parent || 0 })).sort((a, b) => b.c - a.c) };
      }
      const q = String(body.q || '').trim().slice(0, 60);
      if (q.length < 2) return { ok: true, products: [] };
      const a = await sapi(base, 'products?per_page=12&search=' + encodeURIComponent(q));
      return { ok: true, products: (a || []).filter(usable).map(prodOut) };
    } catch (e) { return { error: 'האתר לא ענה (' + err(e) + ')' }; }
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
    const test = p.partial ? { ok: null, note: 'נשמרה רק כתובת החנות – ממתין ל-Client ID ו-Client secret', at: new Date().toISOString() } : await testKey(k, biz.discountCode || '', env);
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
    const test = await testKey(kd.fields, biz.discountCode || '', env);
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
