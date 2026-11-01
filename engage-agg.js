// ══ §702 — engageDaily: סיכום יומי ללשונית "מעורבות" במרכז הנתונים ══════════════════════════════
// מקור-אמת אחד, משותף לוורקר (כותב `engageDaily/{YYYY-MM-DD}` לכל יום שהסתיים, מאותם אירועים של
// platformDaily – בלי קריאות נוספות) ולמרכז הניהול (מחשב את היום הנוכחי מהאירועים החיים).
// חשיפות (businesses/{id}/statsDaily, §418ה) לא באוסף events – הוורקר מוסיף אותן בנפרד (imp).
// הגדרות האירועים: §610ז (carousel), §610ח (bizContact / bizLink), §275 (benefitRedeem), §695 (share).
export const ENGAGE_AGG_VERSION = 1;
// §708 – search (חיפוש / סינון) ו-section (קטגוריה / סקשן) נוספו; ימים קודמים פשוט בלי השדות האלה
export const ENGAGE_TYPES = ['carousel', 'bizClick', 'heart', 'bizContact', 'bizLink', 'benefitRedeem', 'share', 'search', 'section'];

const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const safeKey = s => String(s || '').replace(/[\/`.]/g, '_').slice(0, 60) || '_';

export function aggregateEngageDay(evsIn, adminIds) {
  const admins = adminIds instanceof Set ? adminIds : new Set(adminIds || []);
  const evs = (evsIn || []).filter(e => ENGAGE_TYPES.includes(e.type));
  // סשנים של מנהלים באותו יום – גם אירועים בלי memberId מאותו סשן לא נספרים
  const adminSess = new Set();
  for (const e of evsIn || []) if (e.memberId && admins.has(e.memberId) && e.sessionId) adminSess.add(e.sessionId);
  const n = { open: 0, heart: 0, wa: 0, phone: 0, link: 0, rOpen: 0, rCopy: 0, rSite: 0, rWa: 0, rPhone: 0, share: 0 };
  const openers = new Set(), redeemers = new Set(), linkCh = {}, shareCh = {}, carS = {}, carBiz = {}, biz = {};
  const qs = {}, qz = {}, filt = {}, sec = {};   // §708 – חיפושים (וכמה בלי תוצאה), סינונים, קטגוריות/סקשנים
  const B = id => biz[id] || (biz[id] = { o: 0, h: 0, wa: 0, ph: 0, l: 0, r: 0, c: 0, car: 0, sh: 0 });
  for (const e of evs) {
    if ((e.memberId && admins.has(e.memberId)) || (e.sessionId && adminSess.has(e.sessionId))) continue;
    const ch = String(e.channel || ''), bz = e.bizId || '';
    if (e.type === 'bizClick') { n.open++; if (e.memberId) openers.add(e.memberId); if (bz) B(bz).o++; }
    else if (e.type === 'heart') { n.heart++; if (bz) B(bz).h++; }
    else if (e.type === 'bizContact') { if (ch === 'whatsapp') { n.wa++; if (bz) B(bz).wa++; } else { n.phone++; if (bz) B(bz).ph++; } }
    else if (e.type === 'bizLink') { n.link++; inc(linkCh, safeKey(ch)); if (bz) B(bz).l++; }
    else if (e.type === 'benefitRedeem') {
      // §275 – open = נפתח "איך מממשים" (גם cardOpen / couponReveal הישנים); השאר פעולות בתוכו
      if (ch === 'open' || ch === 'cardOpen' || ch === 'couponReveal') { n.rOpen++; if (e.memberId) redeemers.add(e.memberId); if (bz) B(bz).r++; }
      else if (ch === 'couponCopy') { n.rCopy++; if (bz) B(bz).c++; }
      else if (ch === 'siteClick') { n.rSite++; if (bz) B(bz).l++; }
      else if (ch === 'contactWhatsapp') { n.rWa++; if (bz) B(bz).wa++; }
      else if (ch === 'contactPhone') { n.rPhone++; if (bz) B(bz).ph++; }
    }
    else if (e.type === 'share') { n.share++; inc(shareCh, safeKey(e.blockId) + '|' + safeKey(ch)); if (bz) B(bz).sh++; }
    else if (e.type === 'search') {
      if (e.blockId === 'filter') { inc(n, 'filter'); ch.split('|').filter(Boolean).forEach(k => inc(filt, safeKey(k))); }
      else { inc(n, 'search'); const q = safeKey(ch); inc(qs, q); if (String(e.blockId) === '0') { inc(n, 'searchZero'); inc(qz, q); } }
    }
    else if (e.type === 'section') { inc(n, 'section'); inc(sec, safeKey(ch) + '|' + safeKey(e.blockId)); }
    else if (e.type === 'carousel') {
      const k = safeKey(e.blockId), a = safeKey(ch);
      // לפי סשן: כל פעולה בתיבה נספרת פעם אחת לביקור (view נספר כך ממילא)
      const key = k + '|' + a, s = carS[key] || (carS[key] = new Set());
      s.add(e.sessionId || e.memberId || Math.random());
      if (a === 'bizClick' && bz) { inc(carBiz, k + '|' + bz); B(bz).car++; }
    }
  }
  const car = {};
  for (const [key, s] of Object.entries(carS)) { const [k, a] = key.split('|'); (car[k] || (car[k] = {}))[a] = s.size; }
  return { v: ENGAGE_AGG_VERSION, n, openers: [...openers], redeemers: [...redeemers], linkCh, shareCh, car, carBiz, biz, qs, qz, filt, sec };
}
