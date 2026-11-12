// ══ §775 — מכירות בקוד קופון של הטבה בלעדית (WooCommerce של העסק) ═══════════════════════════════
// רמי: "עכשיו גם יש לנו חיבור לקוד ואנחנו יודעים כמה מוכרים? תחבר לי את זה עם הנתונים על הקרוסלה".
// מרכז הנתונים (לשונית "מעורבות" ← "הטבות בלעדיות") שולח idToken של מנהל + אתר + קוד + תאריכים,
// והוורקר קורא מ-WooCommerce **רק סיכומים**: כמה הזמנות, מכירות, פריטים, ממוצע, סכום ההנחה, ולפי יום.
// בלי שמות / טלפונים / כתובות של לקוחות – לא נקראים ולא נשמרים.
// 🔑 המפתחות (Read בלבד) – סודות בוורקר: GS_WC_KEY / GS_WC_SECRET. הריפו פומבי – לעולם לא בקוד.
// ⚠️ רק אתרים מהרשימה כאן: הוורקר לא שולח את המפתח לכתובת שמגיעה מהבקשה.
import { verifyAdminIdToken } from './jwt.js';

const SITES = {
  glory: { base: 'https://glory-street.com', key: 'GS_WC_KEY', secret: 'GS_WC_SECRET' },
};
const TIMEOUT_MS = 15000;
const ymd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };

async function wc(site, env, path) {
  const auth = 'Basic ' + btoa(env[site.key] + ':' + env[site.secret]);
  const r = await fetch(site.base + path, { headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error('wc_' + r.status);
  return r.json();
}

export async function handleBenefitSales(body, env) {
  const { idToken, site: siteId, code, from, to } = body || {};
  try { await verifyAdminIdToken(env, idToken); } catch (e) { return { error: 'not_admin' }; }
  const site = SITES[siteId];
  if (!site) return { error: 'unknown_site' };
  if (!env[site.key] || !env[site.secret]) return { error: 'no_key' };
  if (typeof code !== 'string' || !/^[\p{L}\p{N}_+-]{1,40}$/u.test(code)) return { error: 'bad_code' };
  if (!ymd(from) || !ymd(to) || from > to) return { error: 'bad_dates' };
  try {
    const cs = await wc(site, env, '/wp-json/wc/v3/coupons?code=' + encodeURIComponent(code.toLowerCase()));
    const c = Array.isArray(cs) && cs[0];
    if (!c) return { ok: true, found: false };
    // before = היום שאחרי "to", כדי לכלול את כל היום האחרון (שעון האתר)
    const end = new Date(to + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
    const q = `coupon_includes=${c.id}&after=${from}T00:00:00&before=${end.toISOString().slice(0, 10)}T00:00:00&interval=day&per_page=100`;
    const st = await wc(site, env, '/wp-json/wc-analytics/reports/orders/stats?' + q);
    const t = (st && st.totals) || {};
    const days = ((st && st.intervals) || []).map(x => ({ d: String(x.interval || '').slice(0, 10), o: num(x.subtotals && x.subtotals.orders_count), r: num(x.subtotals && x.subtotals.net_revenue) }))
      .filter(x => x.o || x.r);
    return {
      ok: true, found: true,
      coupon: { amount: num(c.amount), type: String(c.discount_type || ''), usage: num(c.usage_count), expires: c.date_expires || null, individual: !!c.individual_use },
      totals: { orders: num(t.orders_count), revenue: num(t.net_revenue), items: num(t.num_items_sold), avg: num(t.avg_order_value), discount: num(t.coupons) },
      days, at: new Date().toISOString(),
    };
  } catch (e) {
    console.error('benefitSales failed', String(e));
    return { error: String(e.message || e).slice(0, 60) };
  }
}
