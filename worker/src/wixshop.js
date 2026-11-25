// ══ §811 — "מה יש באתר" לחנויות Wix (רמי, 25.11: "MUGS – למה אין לה אופציה בלינק לסדר את הנראות? כן, תבנה") ══
// אותו פלט כמו buildBizShop של WooCommerce / buildShopifyShop – home.html, הדמו ודף הבחירה לא יודעים מה הפלטפורמה.
// מקורות ציבוריים בלבד (בלי מפתח ובלי האפליקציה), נבדקו 25.11 מול chenhayek.com (MUGS):
//   • /store-categories-sitemap.xml – הקטגוריות (/category/<slug>).
//   • דף קטגוריה – נתוני החנות המוטמעים ב-HTML: כל מוצרי הקטגוריה עם שם, מחיר, מחיר לפני הנחה, מלאי ותמונה
//     (אובייקטים {"id":"<uuid>","options":…,"urlPart":…}). ב-JSON-LD של הדף יש רק 5 – לכן לא ממנו.
//   • /store-products-sitemap.xml – כל המוצרים (112 אצל MUGS, רק 33 משויכים לקטגוריה): קישור, תמונה,
//     תיאור התמונה ו-lastmod. בלי מחיר → המחיר נשלף מה-JSON-LD של דף המוצר, רק למוצרים שמוצגים בפועל.
//   • "הכי נמכרים" – אין מקור ציבורי. הלשונית הראשונה = "חדשים באתר" (lastmod), והסדר בקטגוריה = כמו באתר.
// מזהים: מספר מגובב מה-slug (לוח הבחירה ו-tabPins עובדים עם מספרים). מפתח לשונית: 'top' או 'c<hash>'.
const T = 15000;
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'he,en' };
const PRICE_FETCH_MAX = 24;   // כמה דפי מוצר לכל בנייה (תקרת בקשות-משנה בוורקר)
const JUNK_CAT = /^(all|all products|כל המוצרים|הכל)$/i;

const getText = async url => { const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(T) }); if (!r.ok) throw new Error('http_' + r.status); return r.text(); };
// FNV-1a 32 ביט → מספר חיובי (עד 10 ספרות, בתוך TABKEY_RX וב-Number.isFinite)
const hid = s => { let h = 0x811c9dc5; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h || 1; };
const slugOf = u => { try { return decodeURIComponent(String(u).split('/').filter(Boolean).pop() || ''); } catch (e) { return String(u).split('/').pop() || ''; } };
const xmlDec = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const img500 = src => !src ? '' : /\/v1\//.test(src) ? src : src + '/v1/fit/w_500,h_500,q_90/file.jpg';
// שם תצוגה מתיאור התמונה ב-sitemap ("כוס מצחיקה – ספל עם הכיתוב …") או מה-slug
const nameOf = (title, slug) => (xmlDec(title) || slug.replace(/[-_]+/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 90);

async function sitemapProducts(base) {
  const x = await getText(base + '/store-products-sitemap.xml');
  return [...x.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => {
    const b = m[1], loc = xmlDec((b.match(/<loc>([^<]+)<\/loc>/) || [])[1] || ''), slug = slugOf(loc);
    return { id: hid(slug), slug, url: loc, n: nameOf((b.match(/<image:title>([^<]*)<\/image:title>/) || [])[1], slug),
      img: img500(xmlDec((b.match(/<image:loc>([^<]+)<\/image:loc>/) || [])[1] || '')), mod: (b.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || '', p: null, w: null, stock: true };
  }).filter(p => p.slug);
}
async function sitemapCats(base) {
  const x = await getText(base + '/store-categories-sitemap.xml');
  return [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => { const url = xmlDec(m[1]), slug = slugOf(url); return { id: hid('cat:' + slug), slug, url, t: slug.replace(/[-_]+/g, ' ').trim() }; })
    .filter(c => c.slug && !JUNK_CAT.test(c.t));
}
// מוצרי קטגוריה מהנתונים המוטמעים בדף
function embeddedProducts(h, base) {
  const out = new Map(), re = /\{"id":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}","options":/g;
  let m;
  while ((m = re.exec(h))) {
    let i = m.index, depth = 0, inStr = false, esc = false;
    for (; i < h.length && i < m.index + 60000; i++) {
      const c = h[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) break; }
    }
    try {
      const o = JSON.parse(h.slice(m.index, i + 1));
      if (!o.urlPart || !o.name) continue;
      const slug = String(o.urlPart), price = +o.price || 0;
      if (!out.has(slug)) out.set(slug, { id: hid(slug), slug, url: base + '/product-page/' + slug, n: String(o.name).trim(), p: price, w: Math.max(+o.comparePrice || 0, price),
        stock: o.isInStock !== false, img: img500((o.media && o.media[0] && (o.media[0].fullUrl || (o.media[0].url && 'https://static.wixstatic.com/media/' + o.media[0].url))) || '') });
    } catch (e) { /* אובייקט שבור – מדלגים */ }
  }
  return [...out.values()];
}
async function catProducts(c, base) {
  try { return embeddedProducts(await getText(c.url), base); } catch (e) { return []; }
}
// מחיר + שם מדויק + מלאי מה-JSON-LD של דף המוצר
async function enrich(p) {
  try {
    const h = await getText(p.url);
    for (const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      let j; try { j = JSON.parse(m[1]); } catch (e) { continue; }
      const prod = [].concat(j).find(x => x && x['@type'] === 'Product');
      if (!prod) continue;
      const off = [].concat(prod.offers || [])[0] || {};
      const price = +(off.price || off.lowPrice || 0);
      if (prod.name) p.n = String(prod.name).trim().slice(0, 90);
      if (price) { p.p = price; p.w = Math.max(p.w || 0, price); }
      if (off.availability) p.stock = !/OutOfStock/i.test(off.availability);
      const im = [].concat(prod.image || [])[0]; if (!p.img && im) p.img = img500(typeof im === 'string' ? im : im.url || im.contentUrl || '');
      return;
    }
  } catch (e) { /* המוצר נשאר בלי מחיר */ }
}
const usable = x => x && x.stock && x.img;
const out = x => ({ id: x.id, n: x.n, p: x.p || 0, w: x.w || x.p || 0, img: x.img, url: x.url });

async function loadAll(base) {
  const [prods, cats] = await Promise.all([sitemapProducts(base), sitemapCats(base)]);
  const mem = await Promise.all(cats.map(c => catProducts(c, base)));
  const byId = new Map(prods.map(p => [p.id, p]));
  cats.forEach((c, i) => {
    c.members = mem[i].map(x => { const s = byId.get(x.id); if (s) { Object.assign(s, { n: x.n, p: x.p, w: x.w, stock: x.stock, img: x.img || s.img }); return s; } byId.set(x.id, x); return x; });
    c.count = c.members.length;
  });
  return { all: [...byId.values()], cats: cats.filter(c => c.count > 0), byId };
}

// קטגוריות לבחירה בדף בעל העסק / ב-admin: { id, n, c }
export async function wixCats(base) {
  const { cats } = await loadAll(base);
  return cats.map(c => ({ id: c.id, n: c.t, c: c.count })).sort((a, b) => b.c - a.c);
}
export async function wixSearch(base, q) {
  q = String(q || '').trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return [];
  const { all } = await loadAll(base);
  const hit = all.filter(x => x.img && (x.n.toLowerCase().includes(q) || x.slug.toLowerCase().includes(q))).slice(0, 12);
  await Promise.all(hit.filter(x => x.p == null).map(enrich));
  return hit.filter(usable).map(out);
}

// הבונה. opt = { SHOP_MAX, TABS_MAX, SALE_RX, tabPinsOf } מ-onlineshops.js – אותם כללים כמו WooCommerce/Shopify.
export async function buildWixShop(shop, opt) {
  const { SHOP_MAX, TABS_MAX, SALE_RX, tabPinsOf } = opt;
  const base = shop.base;
  const { all, cats, byId } = await loadAll(base);
  const auto = !(shop.shopMode === 'manual' && (shop.shopCats || []).length);
  const newest = all.filter(x => x.img).sort((a, b) => String(b.mod).localeCompare(String(a.mod)));
  const plan = [];
  if (!auto) {
    for (const c of shop.shopCats.map(x => cats.find(k => k.id === x.id)).filter(Boolean).slice(0, TABS_MAX)) plan.push({ k: 'c' + c.id, t: c.t, list: c.members, url: c.url, count: c.count, sale: SALE_RX.test(c.t) });
  } else {
    plan.push({ k: 'top', t: 'חדשים באתר', list: newest, url: base, count: all.length });
    const sale = cats.filter(c => c.count >= 3 && SALE_RX.test(c.t)).sort((a, b) => b.count - a.count)[0];
    const want = TABS_MAX - 1 - (sale ? 1 : 0);
    for (const c of cats.filter(c => c.count >= 3 && !SALE_RX.test(c.t)).sort((a, b) => b.count - a.count).slice(0, want)) plan.push({ k: 'c' + c.id, t: c.t, list: c.members, url: c.url, count: c.count });
    if (sale) plan.push({ k: 'c' + sale.id, t: sale.t, list: sale.members, url: sale.url, count: sale.count, sale: true });
  }
  const tp = tabPinsOf(shop, plan[0] && plan[0].k);
  const hide = new Set((shop.hidden || []).map(x => x.id).filter(Number.isFinite));
  const tabsRaw = plan.map(x => {
    const pins = (tp[x.k] || []).map(p => byId.get(p.id)).filter(Boolean).slice(0, SHOP_MAX);
    const taken = new Set(pins.map(p => p.id));
    const fill = (x.list || []).filter(p => p.img && p.stock && !hide.has(p.id) && !taken.has(p.id));
    return { x, pins, items: pins.concat(fill).slice(0, SHOP_MAX + 4) };   // +4 – רזרבה למוצר שיתברר שאזל
  });
  // מחיר רק למה שמוצג (מוצר שאין לו מחיר מדף הקטגוריה), עד PRICE_FETCH_MAX דפים
  const need = [...new Set(tabsRaw.flatMap(t => t.items.slice(0, SHOP_MAX)).filter(p => p.p == null))].slice(0, PRICE_FETCH_MAX);
  for (let i = 0; i < need.length; i += 6) await Promise.all(need.slice(i, i + 6).map(enrich));
  const tabs = [];
  for (const { x, pins, items } of tabsRaw) {
    const products = items.filter(p => usable(p) && p.p != null).slice(0, SHOP_MAX).map(out);
    if (products.length >= 3) tabs.push({ k: x.k, t: x.t, products, pinned: pins.length, url: x.url, count: x.count, sale: !!x.sale });
  }
  tabs.length = Math.min(tabs.length, TABS_MAX);
  const deal = tabs.find(t => t.sale);
  return { base, total: all.length, mode: auto ? 'auto' : 'manual', tabs, deal: deal ? { t: deal.t, count: deal.count } : null, at: new Date().toISOString(), platform: 'wix' };
}
