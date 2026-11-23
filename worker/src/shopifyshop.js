// ══ §797ג — "מה יש באתר" לחנויות Shopify (רמי, 24.11: "תבנה עכשיו את תצוגת המוצרים לשופיפיי") ══════════
// אותו פלט כמו buildBizShop של WooCommerce (onlineshops.js) – home.html / הדמו / דף הבחירה לא יודעים מה הפלטפורמה.
// מקורות ציבוריים בלבד (בלי מפתח), נבדקו 24.11 מול goalfit / xraytlv / stormo:
//   • /products.json?limit=250&page=N – כל הקטלוג (עד 8 עמודים = 2,000). ⚠️ מתעלם מ-sort_by (נמדד) – סדר אלפביתי.
//   • /collections.json – הקטגוריות (collections) עם products_count.
//   • /collections/<handle>/products.json – המוצרים בקטגוריה.
//   • "הכי נמכרים" – אין ב-JSON הציבורי. דף ה-HTML /collections/<handle>?sort_by=best-selling כן ממוין לפי
//     מכירות (Shopify עצמה), ומוציאים ממנו את סדר ה-handles של המוצרים (/products/<handle>).
//   • /search/suggest.json סגור (417) – החיפוש בדף הבחירה הוא סינון של הקטלוג לפי שם.
// מפתח לשונית: 'top' = הכי נמכרים, 'c<collection id>'. מזהי מוצר של Shopify (~13 ספרות) – בטוחים כמספר ב-JS.
const T = 15000;
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'he,en' };
const JUNK_COL = /^(all|all products|home ?page|frontpage|example|samples?( collection)?|כל המוצרים|הכל|דף הבית)$/i;
// ⚠️ לא \W – בלי דגל u עברית נחשבת "לא-מילה" וכל קטגוריה בעברית נפסלה (נתפס בבדיקה מול stormo, 24.11)
const PUNCT_ONLY = /^[\s\p{P}\p{S}]*$/u;
const BEST_COL = /best ?sell|הכי נמכר|נמכרים ביותר|רבי מכר/i;

// ⚠️ Shopify מחזירה 429 כשיש הרבה בקשות במקביל לאותה חנות (נמדד: 15+ במקביל → collections נפלו ריקות).
// לכן: עד 3 בקשות בו-זמנית לכל בנייה, וניסיון חוזר על 429 (0.8 ש' ואז 2 ש').
const MAX_PAR = 3;
let _active = 0; const _queue = [];
async function slot(fn) {
  if (_active >= MAX_PAR) await new Promise(r => _queue.push(r));
  _active++;
  try { return await fn(); } finally { _active--; const n = _queue.shift(); if (n) n(); }
}
async function fetchOk(url, headers) {
  for (let i = 0; ; i++) {
    const r = await slot(() => fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(T) }));
    if (r.status === 429 && i < 2) { await new Promise(res => setTimeout(res, i ? 2000 : 800)); continue; }
    if (!r.ok) throw new Error('http_' + r.status);
    return r;
  }
}
const getJson = async url => (await fetchOk(url, Object.assign({ Accept: 'application/json' }, UA))).json();
const getText = async url => (await fetchOk(url, UA)).text();
const imgW = (src, w) => !src ? '' : src.replace(/^\/\//, 'https://') + (src.includes('?') ? '&' : '?') + 'width=' + w;

// מוצר של products.json → הצורה של prodOut (id, n, p, w, img, url) + avail/handle לשימוש פנימי
export function shopifyProd(base, p) {
  const vs = p.variants || [];
  const live = vs.filter(v => v.available !== false);
  const pick = (live.length ? live : vs);
  const price = Math.min(...pick.map(v => +v.price || Infinity));
  const was = Math.max(0, ...pick.map(v => +v.compare_at_price || 0));
  const img = (p.images && p.images[0] && p.images[0].src) || '';
  return { id: p.id, n: String(p.title || ''), p: Number.isFinite(price) ? price : 0, w: was > price ? was : (Number.isFinite(price) ? price : 0),
    img: imgW(img, 400), url: base + '/products/' + p.handle, avail: vs.some(v => v.available !== false), handle: p.handle };
}
const usable = x => x && x.avail && x.img;
const out = x => ({ id: x.id, n: x.n, p: x.p, w: x.w, img: x.img, url: x.url });

export async function shopifyCatalog(base) {
  const all = [];
  for (let page = 1; page <= 8; page++) {
    const j = await getJson(`${base}/products.json?limit=250&page=${page}`);
    const ps = (j && j.products) || [];
    all.push(...ps.map(p => shopifyProd(base, p)));
    if (ps.length < 250) break;
  }
  return all;
}
export async function shopifyCollections(base) {
  const j = await getJson(`${base}/collections.json?limit=250`);
  return ((j && j.collections) || []).map(c => ({ id: c.id, handle: c.handle, t: String(c.title || '').trim(), count: +c.products_count || 0 }));
}
async function colMembers(base, handle) {
  const j = await getJson(`${base}/collections/${encodeURIComponent(handle)}/products.json?limit=250`);
  return ((j && j.products) || []).map(p => shopifyProd(base, p));
}
// סדר "הכי נמכרים" לפי דף ה-HTML של Shopify (sort_by=best-selling). מחזיר handles לפי הסדר.
async function bestHandles(base, handle, pages) {
  const outH = [];
  for (let page = 1; page <= pages; page++) {
    let h;
    try { h = await getText(`${base}/collections/${encodeURIComponent(handle)}?sort_by=best-selling&page=${page}`); } catch (e) { break; }
    const before = outH.length;
    for (const m of h.matchAll(/href="(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:collections\/[^"\/]+\/)?products\/([^"?#\/]+)/g)) {
      let x; try { x = decodeURIComponent(m[1]); } catch (e) { x = m[1]; }
      if (!outH.includes(x)) outH.push(x);
    }
    if (outH.length === before) break;
  }
  return outH;
}
// ממיין רשימה לפי סדר המכירות (מה שלא בדף – בסוף, בסדר המקורי)
const byBest = (list, order) => {
  const pos = new Map(order.map((h, i) => [h, i]));
  return list.map((x, i) => [x, pos.has(x.handle) ? pos.get(x.handle) : 1e6 + i]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
};
const okName = c => c.t && !JUNK_COL.test(c.t) && !PUNCT_ONLY.test(c.t);

// קטגוריות לבחירה בדף בעל העסק / ב-admin: { id, n, c }
export async function shopifyCats(base) {
  return (await shopifyCollections(base)).filter(c => c.count > 0 && okName(c)).map(c => ({ id: c.id, n: c.t, c: c.count })).sort((a, b) => b.c - a.c);
}
export async function shopifySearch(base, q) {
  q = String(q || '').trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return [];
  return (await shopifyCatalog(base)).filter(x => usable(x) && x.n.toLowerCase().includes(q)).slice(0, 12).map(out);
}

// הבונה. opt = { SHOP_MAX, TABS_MAX, SALE_RX, tabPinsOf } מ-onlineshops.js, כדי שהכללים יהיו זהים ל-WooCommerce.
export async function buildShopifyShop(shop, opt) {
  const { SHOP_MAX, TABS_MAX, SALE_RX, tabPinsOf } = opt;
  const base = shop.base;
  const auto = !(shop.shopMode === 'manual' && (shop.shopCats || []).length);
  const [catalog, cols, topOrder] = await Promise.all([shopifyCatalog(base), shopifyCollections(base), auto ? bestHandles(base, 'all', 3) : Promise.resolve([])]);
  const total = catalog.length || shop.products || 0;
  const byId = new Map(catalog.map(x => [x.id, x]));
  const col = id => cols.find(c => c.id === id);
  const plan = [];   // { k, t, col?, sale?, url, count }
  if (!auto) {
    for (const c of shop.shopCats.map(x => col(x.id)).filter(Boolean).slice(0, TABS_MAX)) plan.push({ k: 'c' + c.id, t: c.t, col: c, url: base + '/collections/' + c.handle, count: c.count, sale: SALE_RX.test(c.t) });
  } else {
    plan.push({ k: 'top', t: 'הכי נמכרים', url: base + '/collections/all', count: total });
    const okCol = c => c.count >= 3 && okName(c) && !SALE_RX.test(c.t) && !BEST_COL.test(c.t) && !(total && c.count > total * 0.8);
    const sale = cols.filter(c => c.count >= 3 && okName(c) && SALE_RX.test(c.t)).sort((a, b) => b.count - a.count)[0];
    const want = TABS_MAX - 1 - (sale ? 1 : 0);
    // הקטגוריות שהכי מופיעות בין 100 הנמכרים (כמו ב-WooCommerce). חברות לפי products.json של כל מועמדת (עד 10).
    const cands = cols.filter(okCol).sort((a, b) => b.count - a.count).slice(0, 8);
    const top100 = new Set(topOrder.slice(0, 100));
    const mem = await Promise.all(cands.map(c => colMembers(base, c.handle).catch(() => [])));
    const score = cands.map((c, i) => ({ c, s: mem[i].filter(x => top100.has(x.handle)).length }));
    // קטגוריה שלא נטענה (s=0 ו-0 חברים) לא נבחרת על פני אחת שנטענה
    const chosen = score.filter((x, i) => mem[i].length).sort((a, b) => b.s - a.s || b.c.count - a.c.count).slice(0, want).map(x => x.c);
    for (const c of chosen) plan.push({ k: 'c' + c.id, t: c.t, col: c, url: base + '/collections/' + c.handle, count: c.count, members: mem[cands.indexOf(c)] });
    if (sale) plan.push({ k: 'c' + sale.id, t: sale.t, col: sale, url: base + '/collections/' + sale.handle, count: sale.count, sale: true });
  }
  const tp = tabPinsOf(shop, plan[0] && plan[0].k);
  const hide = new Set((shop.hidden || []).map(x => x.id).filter(Number.isFinite));
  // לכל לשונית: החברים בקטגוריה ממוינים לפי סדר המכירות בדף שלה. 'top' = כל הקטלוג לפי סדר המכירות של /collections/all.
  const lists = await Promise.all(plan.map(async x => {
    if (!x.col) return byBest(catalog, topOrder);
    const [members, order] = await Promise.all([x.members ? Promise.resolve(x.members) : colMembers(base, x.col.handle).catch(() => []), bestHandles(base, x.col.handle, 1)]);
    return byBest(members, order);
  }));
  const tabs = [];
  plan.forEach((x, i) => {
    const pins = (tp[x.k] || []).map(p => byId.get(p.id)).filter(usable).slice(0, SHOP_MAX);
    const taken = new Set(pins.map(p => p.id));
    const fill = (lists[i] || []).filter(p => usable(p) && !hide.has(p.id) && !taken.has(p.id));
    const products = pins.concat(fill).slice(0, SHOP_MAX).map(out);
    if (products.length >= 3) tabs.push({ k: x.k, t: x.t, products, pinned: pins.length, url: x.url, count: x.count, sale: !!x.sale });
  });
  tabs.length = Math.min(tabs.length, TABS_MAX);
  const deal = tabs.find(t => t.sale);
  return { base, total, mode: auto ? 'auto' : 'manual', tabs, deal: deal ? { t: deal.t, count: deal.count } : null, at: new Date().toISOString(), platform: 'shopify' };
}
