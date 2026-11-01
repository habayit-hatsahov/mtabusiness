// ══ §702 — מרכז הנתונים · לשונית "מעורבות" ══════════════════════════════════════════════════════
// הדמו המאושר: engagement-demo.html (§640ט) + המפרט של §695 (חשיפות ושיתופים, §640י).
// מקורות:
//   • engageDaily/{יום}  – סיכום יומי מהוורקר (engage-agg.js): פתיחות, לבבות, פניות, קישורים, מימוש,
//                          קרוסלות, שיתופים, ולכל עסק – כולל חשיפות מ-statsDaily (imp).
//   • היום               – אירועי היום (7 סוגים) + statsDaily של היום לכל עסק, חי.
//   • מסירת הודעות       – messages/*/recipients, נטען רק כשפותחים את האריח (לפי התקופה).
// העיצוב, בחירת התקופה ו"!" – מ-admin-usage.js (shared), כמו בשתי הלשוניות האחרות.
import { aggregateEngageDay, ENGAGE_TYPES } from './engage-agg.js?v=702';
import { shared as U } from './admin-usage.js?v=704';

const LAUNCH = '2026-10-26', SHARE_FROM = '2026-11-01', BENVIEW_FROM = '2026-11-01';
let E = null, loading = false, err = '';
const S = { per: 'launch', from: '', to: '', tile: 'trend', table: false, trK: 'open', sort: 'o', q: '' };
const MSG = { key: '', data: null, loading: false, err: '' };

const f = n => U.f(n), pc = (a, b) => U.pc(a, b), inf = t => U.inf(t);
const SRC = {
  imp: 'כמה פעמים כרטיס של עסק הופיע על המסך (חשיפה). נספר בדף הבית לכל עסק ולכל יום. בלי מנהלים, ובלי בעל העסק בכרטיס של עצמו. ⚠️ היום של החשיפות לפי שעון UTC – הפרש של 2–3 שעות בקצה היום.',
  open: 'כל פעם שאוהד פותח כרטיס של עסק – מהרשימה, מהחיפוש או מהקרוסלה. "אוהדים" = כמה אנשים שונים.',
  heart: 'כל לחיצה על לב בתקופה. המספר שעל העסק הוא הסך הכולל מאז ומעולם; כאן – רק מה שנלחץ בתקופה.',
  contact: 'לחיצה על וואטסאפ או על מספר הטלפון בכרטיס העסק או בחלון "איך מממשים". נספרות גם ב"פניות" שבעל העסק רואה.',
  link: 'לחיצה על אתר, אינסטגרם, פייסבוק, מפות או Waze בכרטיס העסק.',
  redeem: 'פתיחת החלון "איך מממשים", ומה עשו בתוכו: העתיקו קוד, עברו לאתר, פנו בוואטסאפ או התקשרו.',
  car: 'הקרוסלה בדף הבית מדווחת לכל תיבה: נראתה, נפתחה, נקראה עד הסוף, לחצו על עסק, לב, שיתוף. כל ביקור נספר פעם אחת.',
  share: 'לחיצה על שיתוף: אוהד משתף עסק, בעל עסק משתף את העסק שלו, או "הזמינו חברים" – ודרך מה (וואטסאפ / שיתוף של הטלפון / העתקת קישור). נמדד מ-1.11.',
  biz: 'אותן לחיצות, מקובצות לפי עסק, יחד עם החשיפות שלו. "% פתיחה" = פתיחות ÷ חשיפות באותה תקופה.',
  msg: 'לכל הודעה נשמר מה יצא לכל נמען: באפליקציה, בפוש ובמייל. שירות המיילים (Brevo) מחזיר לנו אם המייל נמסר, חזר, נפתח או נלחץ.',
  trend: 'אותם מקורות – לפי יום.',
  todo: 'דברים שלא נמדדים היום.',
};

// ── טעינה ──────────────────────────────────────────────────────────────────────────────────
export async function load(force) {
  // ⚠️ אחרי כשל – לא לנסות שוב לבד: renderMain קורא ל-load בכל ציור, וכשל חוזר = לולאה שמקפיאה את הדף
  if (loading || ((E || err) && !force)) return;
  if (!U.D) return;   // מחכה לנתוני "אפליקציה ושימוש" (היום, הרשימות)
  loading = true; err = '';
  const C = U.C, { db, fs } = C;
  try {
    const snap = await fs.getDocs(fs.collection(db, 'engageDaily'));
    const days = {}; snap.docs.forEach(d => { days[d.id] = d.data(); });
    const today = U.D.today, [start] = (await import('./platform-agg.js?v=587b')).ilDayRange(today);
    const evs = [];
    await Promise.all(ENGAGE_TYPES.map(async ty => {
      const s = await fs.getDocs(fs.query(fs.collection(db, 'events'), fs.where('type', '==', ty), fs.where('createdAt', '>=', start), fs.orderBy('createdAt', 'desc'), fs.limit(10000)));
      s.docs.forEach(x => { const e = x.data(); evs.push({ type: e.type, blockId: e.blockId, memberId: e.memberId, sessionId: e.sessionId, channel: e.channel, bizId: e.bizId }); });
    }));
    const admins = (C.fans() || []).filter(m => m.isAdmin === true).map(m => m.id);
    const agg = aggregateEngageDay(evs, admins);
    // חשיפות היום – statsDaily של היום (תאריך UTC) לכל עסק
    const utc = new Date().toISOString().slice(0, 10), imp = {}; let impTotal = 0;
    await Promise.all((C.biz() || []).map(async b => { try { const d = await fs.getDoc(fs.doc(db, 'businesses', b.id, 'statsDaily', utc)); const v = d.exists() ? Number(d.data().imp) || 0 : 0; if (v) { imp[b.id] = v; impTotal += v; } } catch (e) { /* בלי חשיפות לעסק הזה */ } }));
    days[today] = { ...agg, imp, impTotal };
    E = { days, loadedAt: new Date() };
    if (!S.from) { S.from = LAUNCH; S.to = today; }
  } catch (e) { console.error(e); err = e.message || String(e); }
  finally { loading = false; C.rerender(); }
}
export const isLoaded = () => !!E;

// ── חישוב לתקופה ────────────────────────────────────────────────────────────────────────────
function range() {
  const t = U.D.today;
  if (S.per === 'today') return [t, t];
  if (S.per === 'yest') { const y = U.addDays(t, -1); return [y, y]; }
  if (S.per === '7') return [U.addDays(t, -6), t];
  if (S.per === '30') return [U.addDays(t, -29), t];
  if (S.per === 'launch' || S.per === 'all') return [LAUNCH, t];   // §704 – "הכול" = מתחילת המדידה של המעורבות (26.10)
  return [S.from < LAUNCH ? LAUNCH : S.from, S.to || t];
}
const lbl = ([a, b]) => a === b ? (a === U.D.today ? 'היום' : a === U.addDays(U.D.today, -1) ? 'אתמול' : U.short(a)) : `${U.short(a)}–${U.short(b)}`;
function sum(a, b) {
  const keys = U.dayList(a, b).filter(k => k >= LAUNCH);
  const T = { n: {}, imp: 0, openers: new Set(), redeemers: new Set(), linkCh: {}, shareCh: {}, car: {}, carBiz: {}, biz: {}, impBiz: {}, perDay: [], missing: [] };
  const add = (o, src) => { for (const [k, v] of Object.entries(src || {})) o[k] = (o[k] || 0) + v; };
  for (const k of keys) {
    const d = E.days[k];
    if (!d) { T.missing.push(k); T.perDay.push({ k }); continue; }
    add(T.n, d.n); T.imp += d.impTotal || 0;
    (d.openers || []).forEach(x => T.openers.add(x)); (d.redeemers || []).forEach(x => T.redeemers.add(x));
    add(T.linkCh, d.linkCh); add(T.shareCh, d.shareCh); add(T.carBiz, d.carBiz); add(T.impBiz, d.imp);
    for (const [kind, acts] of Object.entries(d.car || {})) add(T.car[kind] || (T.car[kind] = {}), acts);
    for (const [id, r] of Object.entries(d.biz || {})) add(T.biz[id] || (T.biz[id] = {}), r);
    T.perDay.push({ k, ...d.n, imp: d.impTotal || 0, car: Object.values(d.car || {}).reduce((s, x) => s + (x.open || 0), 0) });
  }
  return T;
}

// ── תצוגה ──────────────────────────────────────────────────────────────────────────────────
const TILES = [['trend', 'לאורך זמן', 'לפי יום'], ['biz', 'עסקים', 'טבלה'], ['card', 'מה עושים בכרטיס העסק', 'פעולות'], ['redeem', 'הטבות ומימוש', 'פעולות'],
  ['car', 'קרוסלות', '6 תיבות'], ['share', 'שיתופים', 'מ-1.11'], ['msg', 'מסירת הודעות', 'מייל · פוש · אפליקציה'], ['todo', 'מה עוד למדוד', 'חסר']];
const SRCK = { trend: 'trend', biz: 'biz', card: 'contact', redeem: 'redeem', car: 'car', share: 'share', msg: 'msg', todo: 'todo' };
const bizName = id => { const b = (U.C.biz() || []).find(x => x.id === id); return b ? b.name : '(עסק שנמחק)'; };
const catName = id => { const b = (U.C.biz() || []).find(x => x.id === id); const c = b && (window.CATEGORIES || []).find(x => x.key === b.catKey); return c ? c.label : ''; };

export function html() {
  if (err) return `<div class="yzu">${U.css()}<div class="yzu-box">הטעינה נכשלה: ${U.esc(err)} · <button class="yzu-btn" onclick="yzeReload()">לנסות שוב</button></div></div>`;
  if (!E) return '<div class="placeholder-note">טוען את נתוני המעורבות…</div>';
  const R = range(), T = sum(R[0], R[1]), today = U.D.today;
  const head = `<div class="yzu-top"><div class="yzu-pbar"><b>תקופה:</b>${[['today', 'היום'], ['yest', 'אתמול'], ['7', '7 ימים'], ['30', '30 ימים'], ['launch', 'מאז ההשקה'], ['all', 'הכול'], ['custom', 'בחירת תאריכים']].map(([k, l]) => `<button class="${S.per === k ? 'on' : ''}" onclick="yzeSet('per','${k}')" ${k === 'all' ? 'title="מאז ומתמיד – נתוני המעורבות נמדדים מ-26.10"' : ''}>${l}</button>`).join('')}
      ${S.per === 'custom' ? `<span>מ-<input type="date" value="${S.from}" min="${LAUNCH}" max="${today}" onchange="yzeSet('from',this.value)"> עד <input type="date" value="${S.to}" min="${LAUNCH}" max="${today}" onchange="yzeSet('to',this.value)"></span>` : ''}</div>
    <div class="yzu-tools"><button class="yzu-btn ${S.table ? 'on' : ''}" onclick="yzeSet('table')">${S.table ? '◧ חזרה לתצוגה הרגילה' : '▦ תצוגת טבלה'}</button><button class="yzu-btn" onclick="yzeReload()">↻ רענון</button>
      <span class="yzu-note">נטען ${E.loadedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} · נמדד מ-26.10${T.missing.length ? ` · ⚠️ חסר סיכום ל-${T.missing.map(U.short).join(', ')}` : ''}</span></div></div>`;
  if (S.table) return `<div class="yzu">${U.css()}${css()}${head}${tableView(R, T)}</div>`;
  const n = T.n, kp = (k, l, v, sub, hl) => `<div class="kp${hl ? ' hl' : ''}"><small>${l}${inf(SRC[k])}</small><b>${v}</b><div class="dt">${sub || '&nbsp;'}</div></div>`;
  const shareOk = R[1] >= SHARE_FROM;
  return `<div class="yzu">${U.css()}${css()}${head}
    <div class="yzu-day"><h2>תמונת מצב – ${lbl(R)}</h2>
      <div class="yzu-kpis" style="grid-template-columns:repeat(8,1fr)">
        ${kp('imp', 'חשיפות לעסקים', f(T.imp), `${pc(n.open || 0, T.imp)} נפתחו`, 1)}
        ${kp('open', 'פתיחות כרטיס עסק', f(n.open || 0), `${f(T.openers.size)} אוהדים שונים`, 1)}
        ${kp('heart', 'לבבות', f(n.heart || 0))}
        ${kp('contact', 'וואטסאפ / חיוג', f((n.wa || 0) + (n.phone || 0) + (n.rWa || 0) + (n.rPhone || 0)), `וואטסאפ ${f((n.wa || 0) + (n.rWa || 0))} · חיוג ${f((n.phone || 0) + (n.rPhone || 0))}`)}
        ${kp('link', 'אתר / אינסטגרם / ניווט', f((n.link || 0) + (n.rSite || 0)))}
        ${kp('redeem', 'פתחו "איך מממשים"', f(n.rOpen || 0), `${f(T.redeemers.size)} אוהדים · ${f(n.rCopy || 0)} העתיקו קוד`)}
        ${kp('car', 'פתיחות בקרוסלה', f(Object.values(T.car).reduce((s, x) => s + (x.open || 0), 0)))}
        ${kp('share', 'שיתופים', shareOk ? f(n.share || 0) : '–', shareOk ? '' : 'נמדד מ-1.11')}
      </div></div>
    <div class="yzu-tiles">${TILES.map(([id, nm, u]) => `<button class="yzu-tile${S.tile === id ? ' on' : ''}" onclick="yzeSet('tile','${id}')"><div class="nm"><span>${nm}${inf(SRC[SRCK[id]])}</span><i>${u}</i></div>${big(id, T, R)}</button>`).join('')}</div>
    <div class="yzu-det">${(DET[S.tile] || DET.trend)(T, R).replace('</h2>', inf(SRC[SRCK[S.tile]]) + '</h2>')}</div></div>`;
}

function big(id, T, R) {
  const n = T.n, s = (b, sm, p) => `<div class="big">${b} <small>${sm}</small></div><div class="pct">${p}</div>`;
  if (id === 'trend') return s(f(n.open || 0), 'פתיחות', lbl(R));
  if (id === 'biz') { const ids = Object.keys(T.biz).filter(k => (T.biz[k].o || 0) > 0); return s(f(ids.length), `מ-${f((U.C.biz() || []).filter(b => b.status === 'approved').length)} נפתחו`, 'מי מקבל תשומת לב, ומה עושים בו'); }
  if (id === 'card') { const act = (n.wa || 0) + (n.phone || 0); return s(pc(act, n.open || 0), 'פנו לעסק', `${f(act)} פניות מ-${f(n.open || 0)} פתיחות`); }
  if (id === 'redeem') return s(f(n.rOpen || 0), 'פתחו "איך מממשים"', `${f(n.rCopy || 0)} העתיקו קוד`);
  if (id === 'car') return s(f(Object.values(T.carBiz).reduce((a, b) => a + b, 0)), 'לחיצות על עסק', 'מתוך הקרוסלה');
  if (id === 'share') return R[1] >= SHARE_FROM ? s(f(n.share || 0), 'שיתופים', 'עסק · עסק שלי · הזמנת חברים') : s('–', '', 'נמדד מ-1.11');
  if (id === 'msg') return s('↗', 'מייל · פוש', 'נמסר / נפתח / נלחץ');
  return s('4', 'פריטים', 'חיפוש, סקשנים, כרטיס פוש, גלילה');
}

const cbar = (vals, labels, mx) => `<div class="yzu-cbar" style="gap:${vals.length > 21 ? 2 : 8}px">${vals.map((v, i) => `<div class="c" title="${labels[i]}: ${v}">${vals.length > 21 ? '' : `<em>${f(v)}</em>`}<i class="r" style="height:${v / Math.max(1, mx) * 100}%;border-radius:4px 4px 0 0"></i></div>`).join('')}</div>
  <div class="yzu-cdays" style="gap:${vals.length > 21 ? 2 : 8}px">${labels.map((l, i) => `<span>${vals.length <= 21 || i % 5 === 0 ? l : ''}</span>`).join('')}</div>`;

const DET = {
  trend: (T, R) => {
    const M = { open: 'פתיחות כרטיס עסק', imp: 'חשיפות', heart: 'לבבות', wa: 'וואטסאפ', link: 'קישורים', rOpen: '"איך מממשים"', rCopy: 'העתקת קוד', car: 'פתיחות קרוסלה', share: 'שיתופים' };
    const v = T.perDay.map(d => d[S.trK] || 0), labels = T.perDay.map(d => U.short(d.k));
    return `<h2>לאורך זמן – ${lbl(R)}</h2><p class="yzu-def">בוחרים מדד ורואים אותו לפי יום, בתקופה שנבחרה למעלה.</p>
      <div class="yzu-chips">${Object.entries(M).map(([k, l]) => `<button class="${S.trK === k ? 'on' : ''}" onclick="yzeSet('trK','${k}')">${l}</button>`).join('')}</div>
      <div class="yzu-box">${cbar(v, labels, Math.max(...v))}</div>
      <div class="yzu-box yzu-tw"><table><tr><th>יום</th>${Object.values(M).map(l => `<th class="n">${l}</th>`).join('')}</tr>
        ${T.perDay.slice().reverse().map(d => `<tr><td>${U.short(d.k)}</td>${Object.keys(M).map(k => `<td class="n">${d.open === undefined ? '–' : f(d[k] || 0)}</td>`).join('')}</tr>`).join('')}</table></div>`;
  },
  biz: (T, R) => {
    const all = (U.C.biz() || []).filter(b => b.status === 'approved' || T.biz[b.id]);
    const rows = all.map(b => { const r = T.biz[b.id] || {}; const imp = T.impBiz[b.id] || 0;
      return { id: b.id, name: b.name, cat: catName(b.id), imp, o: r.o || 0, pct: imp ? (r.o || 0) / imp : -1, h: r.h || 0, c2: (r.wa || 0) + (r.ph || 0), l: r.l || 0, r: r.r || 0, c: r.c || 0, car: r.car || 0, sh: r.sh || 0, likes: b.likesOverride ?? b.likes ?? 0, clicks: b.clicks || 0 }; })
      .filter(x => !S.q || String(x.name).includes(S.q) || String(x.cat).includes(S.q))
      .sort((a, b) => (b[S.sort] || 0) - (a[S.sort] || 0));
    const th = (k, l) => `<th class="n"><a class="yze-sort${S.sort === k ? ' on' : ''}" onclick="yzeSet('sort','${k}')">${l}</a></th>`;
    const noOpen = all.filter(b => b.status === 'approved' && !(T.biz[b.id] && T.biz[b.id].o)).length;
    return `<h2>עסקים – ${lbl(R)}</h2><p class="yzu-def">כל העסקים המאושרים, עם החשיפות והפעולות בתקופה. לחיצה על כותרת עמודה ממיינת. ${noOpen ? `<b>${f(noOpen)} עסקים</b> לא נפתחו אף פעם בתקופה.` : ''}</p>
      <div class="yzu-chips"><input type="text" placeholder="חיפוש עסק או קטגוריה" value="${U.esc(S.q)}" oninput="yzeQ(this.value)" style="font:inherit;font-size:13px;padding:6px 10px;border-radius:9px;border:1px solid var(--yzu-line);min-width:220px"></div>
      <div class="yzu-box yzu-tw" style="max-height:620px;overflow-y:auto"><table>
        <tr><th>עסק</th>${th('imp', 'חשיפות')}${th('o', 'פתיחות')}${th('pct', '% פתיחה')}${th('h', 'לבבות')}${th('c2', 'וואטסאפ / חיוג')}${th('l', 'קישורים')}${th('r', '"איך מממשים"')}${th('c', 'העתיקו קוד')}${th('car', 'מהקרוסלה')}${th('sh', 'שיתופים')}${th('likes', 'סה"כ לבבות')}${th('clicks', 'סה"כ לחיצות')}</tr>
        ${rows.map(x => `<tr><td>${U.esc(x.name)}<div class="yzu-note" style="margin:0">${U.esc(x.cat)}</div></td><td class="n">${x.imp ? f(x.imp) : '–'}</td><td class="n"><b>${f(x.o)}</b></td><td class="n">${x.pct >= 0 ? Math.round(x.pct * 100) + '%' : '–'}</td><td class="n">${f(x.h)}</td><td class="n">${f(x.c2)}</td><td class="n">${f(x.l)}</td><td class="n">${f(x.r)}</td><td class="n">${f(x.c)}</td><td class="n">${f(x.car)}</td><td class="n">${R[1] >= SHARE_FROM ? f(x.sh) : '–'}</td><td class="n">${f(x.likes)}</td><td class="n">${f(x.clicks)}</td></tr>`).join('')}
      </table></div>
      <p class="yzu-note">"סה"כ לבבות / לחיצות" = המונה שעל העסק מאז ומעולם (מה שהיה במרכז הנתונים הקודם). שאר העמודות – רק בתקופה שנבחרה.</p>`;
  },
  card: (T, R) => {
    const n = T.n, act = [['לבבות', n.heart || 0, 'acc'], ['קישורים (אתר, אינסטגרם…)', n.link || 0, 'ok'], ['וואטסאפ', n.wa || 0, 'ok'], ['חיוג', n.phone || 0, 'ok']], mx = Math.max(1, ...act.map(a => a[1]));
    const L = Object.entries(T.linkCh).sort((a, b) => b[1] - a[1]), NM = { website: 'אתר', instagram: 'אינסטגרם', facebook: 'פייסבוק', maps: 'מפות', waze: 'Waze', email: 'מייל' };
    const sumAct = act.reduce((s, a) => s + a[1], 0);
    return `<h2>מה עושים בכרטיס העסק – ${lbl(R)}</h2><p class="yzu-def">אחרי שפותחים כרטיס עסק – לאן ממשיכים.</p>
      <div class="yzu-cols"><div class="yzu-box"><h3>מ-${f(n.open || 0)} פתיחות כרטיס</h3>${act.map(([l, v, c]) => U.hb(l, v, mx, c)).join('')}
        <p class="yzu-note">על כל 100 פתיחות – ${n.open ? Math.round(sumAct / n.open * 100) : 0} פעולות. פנייה ישירה לעסק – ${n.open ? (((n.wa || 0) + (n.phone || 0)) / n.open * 100).toFixed(1) : 0} לכל 100.</p></div>
        <div class="yzu-box"><h3>קישורים – לאן</h3>${L.length ? L.map(([k, v]) => U.hb(NM[k] || k, v, L[0][1])).join('') : '<p class="yzu-note">אין בתקופה</p>'}</div></div>`;
  },
  redeem: (T, R) => {
    const n = T.n, rows = [['עברו לאתר העסק', n.rSite || 0], ['העתיקו קוד קופון', n.rCopy || 0], ['פנו בוואטסאפ מהחלון', n.rWa || 0], ['התקשרו מהחלון', n.rPhone || 0]], mx = Math.max(1, n.rOpen || 0);
    return `<h2>הטבות ומימוש – ${lbl(R)}</h2><p class="yzu-def">"איך מממשים" = חלון ההטבה בכרטיס העסק. הפעולות בתוכו נספרות בנפרד.</p>
      <div class="yzu-cols"><div class="yzu-box"><h3>מ-${f(n.rOpen || 0)} פתיחות "איך מממשים" (${f(T.redeemers.size)} אוהדים)</h3>${rows.map(([l, v]) => U.hb(l, v, mx, 'ok')).join('')}
        <p class="yzu-note">מימוש בחנות (מראים את המסך) לא נמדד – ולכן מי שלא עשה פעולה כאן לא בהכרח לא מימש.</p></div>
        <div class="yzu-box"><h3>לפי עסק</h3>${Object.entries(T.biz).filter(([, r]) => r.r).sort((a, b) => b[1].r - a[1].r).slice(0, 10).map(([id, r]) => U.hb(U.esc(bizName(id)), r.r, Math.max(...Object.values(T.biz).map(x => x.r || 0)))).join('') || '<p class="yzu-note">אין בתקופה</p>'}</div></div>`;
  },
  car: (T, R) => {
    const K = [['ben', 'הטבה בלעדית'], ['fan', 'האוהד שמאחורי העסק'], ['us', 'מי אנחנו'], ['redeem', 'איך מממשים'], ['forbiz', 'לבעלי עסקים'], ['invite', 'הזמינו חברים']];
    const benViewOk = R[0] >= BENVIEW_FROM;
    const acts = c => [c.like ? `${f(c.like)} לבבות` : '', c.shareFan ? `${f(c.shareFan)} שיתפו לחבר` : '', c.shareBiz ? `${f(c.shareBiz)} שיתפו לעסק` : '', c.bizSignup ? `${f(c.bizSignup)} לחצו "הרשמת עסק"` : '', (c['follow-instagram'] || 0) + (c['follow-facebook'] || 0) ? `${f((c['follow-instagram'] || 0) + (c['follow-facebook'] || 0))} עקבו` : ''].filter(Boolean).join(' · ');
    const benBiz = Object.entries(T.carBiz).filter(([k]) => k.startsWith('ben|')).map(([k, v]) => [bizName(k.split('|')[1]), v]).sort((a, b) => b[1] - a[1]);
    const fanBiz = Object.entries(T.carBiz).filter(([k]) => k.startsWith('fan|')).map(([k, v]) => [bizName(k.split('|')[1]), v]);
    return `<h2>קרוסלות בדף הבית – ${lbl(R)}</h2><p class="yzu-def">לכל תיבה: ראו → פתחו → קראו עד הסוף → פעולה. לפי ביקור.${benViewOk ? '' : ' ⚠️ "ראו" של ההטבה הבלעדית נמדד נכון רק מ-1.11 (§695), ולכן בתקופה הזו לא מוצג.'}</p>
      <div class="yzu-box yzu-tw"><table><tr><th>תיבה</th><th class="n">ראו</th><th class="n">פתחו</th><th class="n">% פתיחה</th><th class="n">קראו עד הסוף</th><th class="n">לחצו על עסק</th><th>פעולות</th></tr>
        ${K.map(([k, l]) => { const c = T.car[k] || {}; const view = k === 'ben' && !benViewOk ? null : c.view || 0;
          return `<tr><td><b>${l}</b></td><td class="n">${view === null ? '–' : f(view)}</td><td class="n">${f(c.open || 0)}</td><td class="n">${view ? pc(c.open || 0, view) : '–'}</td><td class="n">${f(c.readEnd || 0)}</td><td class="n">${c.bizClick ? f(c.bizClick) : '–'}</td><td class="yzu-note" style="margin:0">${acts(c)}</td></tr>`; }).join('')}</table></div>
      <div class="yzu-cols"><div class="yzu-box"><h3>הטבה בלעדית – לאן לחצו</h3>${benBiz.length ? benBiz.map(([nm, v]) => U.hb(U.esc(nm), v, benBiz[0][1])).join('') : '<p class="yzu-note">אין בתקופה</p>'}</div>
        <div class="yzu-box"><h3>האוהד שמאחורי העסק – לאן לחצו</h3>${fanBiz.length ? fanBiz.map(([nm, v]) => U.hb(U.esc(nm), v, Math.max(...fanBiz.map(x => x[1])))).join('') : '<p class="yzu-note">אין בתקופה</p>'}</div></div>`;
  },
  share: (T, R) => {
    if (R[1] < SHARE_FROM) return `<h2>שיתופים</h2><div class="yzu-how">השיתוף נמדד מ-1.11 (§695). התקופה שנבחרה מסתיימת לפני כן.</div>`;
    const CTX = { 'biz-sheet': 'אוהד משתף עסק', 'biz-menu': 'בעל עסק משתף את העסק שלו', app: '"הזמינו חברים"' }, CH = { whatsapp: 'וואטסאפ', native: 'שיתוף של הטלפון', copy: 'העתקת קישור' };
    const byCtx = {}, byCh = {};
    Object.entries(T.shareCh).forEach(([k, v]) => { const [c, ch] = k.split('|'); byCtx[c] = (byCtx[c] || 0) + v; byCh[ch] = (byCh[ch] || 0) + v; });
    const top = Object.entries(T.biz).filter(([, r]) => r.sh).sort((a, b) => b[1].sh - a[1].sh).slice(0, 10);
    const carShare = (T.car.invite || {}).shareFan || 0;
    return `<h2>שיתופים – ${lbl(R)}</h2><p class="yzu-def">${R[0] < SHARE_FROM ? '⚠️ נמדד מ-1.11 – הימים שלפני כן בתקופה לא נספרים. ' : ''}שיתוף = הגעה של אנשים חדשים.</p>
      <div class="yzu-cols"><div class="yzu-box"><h3>מי שיתף – ${f(T.n.share || 0)}</h3>${Object.entries(byCtx).map(([k, v]) => U.hb(CTX[k] || k, v, T.n.share || 1, 'ok')).join('') || '<p class="yzu-note">אין בתקופה</p>'}
        <div style="height:8px"></div>${Object.entries(byCh).map(([k, v]) => U.hb(CH[k] || k, v, T.n.share || 1)).join('')}
        <p class="yzu-note">בנוסף: ${f(carShare)} שיתופים מהתיבה "הזמינו חברים" בקרוסלה (נמדדים שם).</p></div>
        <div class="yzu-box"><h3>העסקים ששותפו הכי הרבה</h3>${top.length ? top.map(([id, r]) => U.hb(U.esc(bizName(id)), r.sh, top[0][1].sh, 'ok')).join('') : '<p class="yzu-note">אין בתקופה</p>'}</div></div>`;
  },
  msg: (T, R) => {
    const key = R.join('|');
    if (MSG.key !== key && !MSG.loading) { MSG.key = key; MSG.data = null; loadMsgs(R); }
    if (MSG.err) return `<h2>מסירת הודעות</h2><div class="yzu-box">הטעינה נכשלה: ${U.esc(MSG.err)}</div>`;
    if (!MSG.data) return `<h2>מסירת הודעות – ${lbl(R)}</h2><div class="yzu-box">טוען את ההודעות של התקופה…</div>`;
    const d = MSG.data, row = (l, x) => `<tr><td>${l}</td><td class="n">${f(x.n)}</td><td class="n">${f(x.mail)}</td><td class="n">${f(x.del)} (${pc(x.del, x.mail)})</td><td class="n">${f(x.bad)}</td><td class="n">${f(x.open)} (${pc(x.open, x.mail)})</td><td class="n">${f(x.click)}</td><td class="n">${f(x.app)}</td><td class="n">${f(x.push)}</td></tr>`;
    const TPL = { tpl_login: 'אושרתם + קוד כניסה', tpl_rejectRetry: '"האימות לא עבר – נסו שוב"', tpl_combined: 'אישור + הודעה (משולב)', tpl_resend: 'שליחה חוזרת של הקוד', tpl_rejectFinal: 'נדחה סופית' };
    return `<h2>מסירת הודעות – ${lbl(R)}</h2><p class="yzu-def">מייל: Brevo מדווח נמסר / חזר / נפתח / נלחץ. פוש: יודעים שנשלח למכשיר. באפליקציה: נכתב לתיבת ההודעות. הפירוט לכל הודעה – בהיסטוריה של מרכז ההודעות.</p>
      <div class="yzu-box yzu-tw"><table><tr><th>הודעה</th><th class="n">נמענים</th><th class="n">מייל נשלח</th><th class="n">נמסר</th><th class="n">חזר</th><th class="n">נפתח</th><th class="n">נלחץ</th><th class="n">באפליקציה</th><th class="n">פוש</th></tr>
        ${Object.entries(d.tpl).filter(([, x]) => x.n).map(([k, x]) => row(TPL[k] || k, x)).join('')}
        ${row(`ממרכז ההודעות – ${f(d.sends)} שליחות (${f(d.pick)} אישיות · ${f(d.mass)} תפוצה)`, d.manual)}</table></div>
      <p class="yzu-note">"נפתח" במייל נמדד בתמונה קטנה במייל – כתובות מוסתרות של Apple (${f(d.relay)} בתקופה) לא מדווחות פתיחה בכלל, וחלק משירותי הדואר חוסמים אותה.</p>`;
  },
  todo: () => `<h2>מה עוד למדוד</h2><p class="yzu-def">חשיפות, שיתוף עסק וצפייה בקרוסלה – כבר נמדדים (§695). נשארו:</p>
    <div class="yzu-box yzu-tw"><table><tr><th>מה</th><th>למה</th></tr>
      <tr><td><b>חיפוש וסינון</b> – מה חיפשו, ואם נמצא משהו</td><td>חיפוש בלי תוצאה = עסק שחסר לנו</td></tr>
      <tr><td><b>אילו סקשנים / קטגוריות פותחים</b> בדף הבית</td><td>לדעת מה מעניין, ולהחליט סדר</td></tr>
      <tr><td><b>כרטיס "רוצים שנעדכן אתכם?"</b> – הוצג / אישרו / סירבו</td><td>מי שנכנס בלי פוש – לא יודעים למה</td></tr>
      <tr><td><b>גלילה בדף הנחיתה</b> (landing.html)</td><td>היום נמדדת רק במסך הפתיחה באפליקציה</td></tr></table></div>`,
};

// ── מסירת הודעות – נטען רק לאריח, לפי התקופה ──────────────────────────────────────────────────
async function loadMsgs(R) {
  MSG.loading = true; MSG.err = '';
  const { db, fs } = U.C, { ilDayRange } = await import('./platform-agg.js?v=587b');
  const from = ilDayRange(R[0])[0], to = ilDayRange(R[1])[1];
  const z = () => ({ n: 0, mail: 0, del: 0, bad: 0, open: 0, click: 0, app: 0, push: 0 });
  const out = { tpl: {}, manual: z(), sends: 0, pick: 0, mass: 0, relay: 0 };
  const acc = (x, r) => { x.n++; if (r.mail === 'sent') { x.mail++; if (r.mailDelivery === 'delivered') x.del++; else if (r.mailDelivery) x.bad++; if (r.mailOpenedAt) x.open++; if (r.mailClickedAt) x.click++; if (/privaterelay/i.test(r.email || '')) out.relay++; } if (r.app === 'written') x.app++; if (r.push === 'sent') x.push++; };
  try {
    await Promise.all(['tpl_login', 'tpl_rejectRetry', 'tpl_combined', 'tpl_resend', 'tpl_rejectFinal'].map(async t => {
      const s = await fs.getDocs(fs.query(fs.collection(db, 'messages', t, 'recipients'), fs.where('sentAt', '>=', from), fs.where('sentAt', '<', to)));
      const x = out.tpl[t] = z(); s.docs.forEach(d => acc(x, d.data()));
    }));
    const ms = await fs.getDocs(fs.query(fs.collection(db, 'messages'), fs.where('sentAt', '>=', from), fs.where('sentAt', '<', to)));
    out.sends = ms.size;
    await Promise.all(ms.docs.map(async m => {
      const md = m.data(); if (md.kind === 'mass') out.mass++; else out.pick++;
      const s = await fs.getDocs(fs.collection(db, 'messages', m.id, 'recipients')); s.docs.forEach(d => acc(out.manual, d.data()));
    }));
    MSG.data = out;
  } catch (e) { console.error(e); MSG.err = e.message || String(e); }
  finally { MSG.loading = false; U.C.rerender(); }
}

// ── תצוגת טבלה ────────────────────────────────────────────────────────────────────────────
function tableView(R, T) {
  const n = T.n, K = [['ben', 'הטבה בלעדית'], ['fan', 'האוהד שמאחורי העסק'], ['us', 'מי אנחנו'], ['redeem', 'איך מממשים'], ['forbiz', 'לבעלי עסקים'], ['invite', 'הזמינו חברים']];
  const secs = [
    [`תמונת מצב – ${lbl(R)}`, [['חשיפות לעסקים', T.imp], ['פתיחות כרטיס עסק', n.open || 0], ['אוהדים שפתחו עסק', T.openers.size], ['לבבות', n.heart || 0], ['וואטסאפ', (n.wa || 0) + (n.rWa || 0)], ['חיוג', (n.phone || 0) + (n.rPhone || 0)], ['קישורים', (n.link || 0) + (n.rSite || 0)], ['פתחו "איך מממשים"', n.rOpen || 0], ['העתיקו קוד', n.rCopy || 0], ['שיתופים (מ-1.11)', n.share || 0]]],
    ['קרוסלות – פתחו / לחצו על עסק', K.map(([k, l]) => [l, `${f((T.car[k] || {}).open || 0)} / ${f((T.car[k] || {}).bizClick || 0)}`])],
    ['עסקים – 15 הכי נפתחים (פתיחות / חשיפות)', Object.entries(T.biz).sort((a, b) => (b[1].o || 0) - (a[1].o || 0)).slice(0, 15).map(([id, r]) => [bizName(id), `${f(r.o || 0)} / ${f(T.impBiz[id] || 0)}`])],
  ];
  return `<div class="yzu-box yzu-tw"><table class="yzu-big"><tr><th>נתון</th><th class="n">כמה</th></tr>
    ${secs.map(([t, rows]) => `<tr class="sec"><td colspan="2">${t}</td></tr>` + rows.map(([l, v]) => `<tr><td>${U.esc(l)}</td><td class="n">${typeof v === 'number' ? f(v) : v}</td></tr>`).join('')).join('')}
    <tr class="sec"><td colspan="2">לפי יום (פתיחות / חשיפות / לבבות)</td></tr>
    ${T.perDay.slice().reverse().map(d => `<tr><td>${U.short(d.k)}</td><td class="n">${d.open === undefined ? '–' : `${f(d.open || 0)} / ${f(d.imp || 0)} / ${f(d.heart || 0)}`}</td></tr>`).join('')}</table></div>`;
}

window.yzeSet = (k, v) => { if (k === 'table') S.table = !S.table; else if (k === 'sort') S.sort = v; else S[k] = v; U.C.rerender(); };
window.yzeQ = (v) => { S.q = v; clearTimeout(window.__yzeQT); window.__yzeQT = setTimeout(() => { U.C.rerender(); const i = document.querySelector('.yzu-chips input[type=text]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 350); };
window.yzeReload = () => { E = null; MSG.key = ''; load(true); U.C.rerender(); };
function css() { return `<style>.yze-sort{cursor:pointer;color:inherit;text-decoration:none}.yze-sort.on{color:var(--yzu-ink);font-weight:800;text-decoration:underline}</style>`; }
