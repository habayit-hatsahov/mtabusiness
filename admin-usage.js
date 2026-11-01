// ══ §699 — מרכז הנתונים · לשונית "אפליקציה ושימוש" ═══════════════════════════════════════════════
// קובץ נפרד מ-admin-dashboard.html בכוונה: הקובץ הגדול נערך במקביל בכמה סשנים, וכאן כל המסך חי
// במקום אחד. admin-dashboard מייבא אותו בפעם הראשונה שנכנסים ללשונית (import דינמי), ומעביר
// ctx עם ה-db, פונקציות Firestore ושני המערכים שכבר טעונים אצלו (MOCK_FANS / MOCK_BUSINESSES).
//
// מקורות (בלי לטעון ~52,000 אירועים כמו המסך הישן):
//   • usageDaily/{יום}   – סיכום יומי מהוורקר (usage-agg.js), יום שהסתיים = מסמך אחד.
//   • אירועי היום        – נטענים חי (8 סוגים, היום בלבד) ומסוכמים באותה פונקציה בדיוק.
//   • רשומות חברים ועסקים – מה שמרכז הניהול כבר מחזיק בזיכרון (בלי קריאות נוספות).
// הדמו המאושר: app-usage-demo.html (§640ח–§640י).
import { aggregateUsageDay, USAGE_TYPES, FAN_STEPS, BIZ_STEPS } from './usage-agg.js?v=705';
import { ilDayKey, ilDayRange } from './platform-agg.js?v=587b';

const LAUNCH = '2026-10-26';
const MEASURE_FROM = '2026-10-11';
const PUSH_FROM = '2026-10-20';
let C = null;                       // ctx מ-admin-dashboard
let D = null;                       // { days: {key: agg}, today: key, loadedAt }
let loading = false, loadErr = '';
const S = { per: 'today', from: '', to: '', tile: 'fun', table: false, rq: { mode: 'mem', grp: 'all', from: '', to: '' }, trendK: 'act' };

// ── עזרים ──────────────────────────────────────────────────────────────────────────────────
const f = n => (Number(n) || 0).toLocaleString('he-IL');
const pc = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
const W = (a, b) => (b ? Math.max(a ? 1 : 0, a / b * 100) : 0).toFixed(1);
const esc = s => C && C.esc ? C.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inf = t => `<i class="yzu-inf" tabindex="0">!<span class="yzu-tt">${t}</span></i>`;
const hb = (l, n, max, cls = '') => `<div class="yzu-hb"><span>${l}</span><div class="yzu-tr"><i class="${cls}" style="width:${W(n, max)}%"></i></div><b>${f(n)}</b></div>`;
// ⚡ ilDayKey/ilDayRange בונים Intl.DateTimeFormat בכל קריאה – אלפי קריאות לציור = 4 שניות לכל לחיצה.
// כאן: פורמטר אחד, ומטמון לכל יום / תאריך.
const IL_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const DK = new Map();
const dk = d => { if (!d) return ''; const t = d instanceof Date ? d.getTime() : new Date(d).getTime(); let k = DK.get(t); if (k === undefined) { k = IL_FMT.format(t); DK.set(t, k); } return k; };
const START = new Map();
const dayStart = key => { let s = START.get(key); if (s === undefined) { s = ilDayRange(key)[0].getTime(); START.set(key, s); } return s; };
const addDays = (key, n) => dk(new Date(dayStart(key) + (n * 24 + 12) * 3600e3));
const dayDiff = (k1, k2) => Math.round((dayStart(k2) - dayStart(k1)) / 864e5);
const dayList = (a, b) => { const out = []; for (let k = a; k <= b; k = addDays(k, 1)) out.push(k); return out; };
const short = k => { const [, m, d] = k.split('-'); return (+d) + '.' + (+m); };
const by = (a, fn) => { const o = {}; a.forEach(x => { const k = fn(x); o[k] = (o[k] || 0) + 1; }); return o; };

const SRC = {
  dl: 'כל טלפון מקבל מספר זיהוי בפעם הראשונה שהוא פותח את האפליקציה. "הורדה" = הפעם הראשונה שטלפון פתח אותה. זה לא המספר מחנויות האפליקציות; מי שמחק והתקין מחדש נספר שוב.',
  reg: 'מרשומת החבר – התאריך שבו שלח את טופס ההרשמה. כל אדם פעם אחת, מהאפליקציה או מהאתר, אוהדים ובעלי עסקים.',
  ap: 'מרשומת החבר – התאריך שבו אישרת אותו. כולל מי שנרשם בימים קודמים.',
  rej: 'מרשומת החבר – התאריך שבו נדחה. רק מי שעדיין במצב "נדחה"; מי שתיקן ואושר כבר לא נספר.',
  first: 'חבר מאושר שזה היום הראשון שבו נכנס לאפליקציה או לאתר אחרי שאושר.',
  ret: 'חבר מאושר שנכנס ביום הזה, וכבר נכנס גם ביום קודם (אחרי האישור). ותיקים כלולים.',
  act: 'כמה טלפונים שונים פתחו את האפליקציה בתקופה – כולל מי שעוד לא נרשם.',
  members: 'כל רשומות החברים מאז שהאתר נפתח, בלי מנהלים. "ותיקים" = נרשמו לפני ההשקה (26.10). "פתחו את האפליקציה" = נכנסו לפחות פעם אחת מהאפליקציה (נמדד מ-11.10).',
  dlAll: 'כל הטלפונים שפתחו את האפליקציה מאז שהמדידה התחילה (11.10), בלי טלפונים של מנהלים. לכל טלפון – האם נשלח ממנו טופס, האם נכנסו ממנו לחשבון קיים, או אף אחד מהשניים.',
  biz: 'כל העסקים מאז שהאתר נפתח, לפי המצב שלהם. "בעלי עסקים באפליקציה" = בעל העסק נכנס לפחות פעם אחת מהאפליקציה.',
  fun: 'שלב 1 נספר לפי טלפונים (עוד אין שם). מהשלב השני – לפי אנשים, מרשומת החבר: מתי נרשם, האם אושר, והאם נכנס אחרי האישור.',
  st: 'מרשומת החבר: מצב (ממתין / אושר / נדחה), איך נרשם (קוד / Google / Apple), מאיזה טלפון, ומתי נכנס. כל אדם נספר במצב אחד.',
  regdrop: 'הטופס מדווח על כל שלב שעוברים בו. לכל טלפון שפתח טופס בתקופה ולא שלח – השלב האחרון שהגיע אליו.',
  ret2: 'לכל חבר – באילו ימים נכנס (אחרי האישור, מהאפליקציה או מהאתר). לכל טלפון – באילו ימים פתח את האפליקציה. נמדד מ-11.10.',
  push: 'חבר שהאפליקציה שמרה אצלו אישור לשלוח לו התראות. מחושב מתוך החברים המאושרים שנכנסו לאפליקציה מ-20.10.',
  use: 'בזמן שהמסך פתוח, האפליקציה מדווחת כשעוברים 30 שניות, 2, 5, 15 ו-30 דקות. כך יודעים כמה זמן נמשך כל ביקור.',
  trend: 'אותם מקורות כמו בשורת "מה קרה" למעלה – לפי יום.',
  land: 'דף הנחיתה מדווח על כל כניסה אליו ועל כל לחיצה על כפתור חנות. "מאיפה הגיעו" – לפי סימון בסוף הקישור (למשל ?src=ig).',
  dlday: 'כל טופס הרשמה יודע מאיזה טלפון נשלח, ולכל טלפון ידוע היום שבו פתח את האפליקציה בפעם הראשונה. משווים בין שני התאריכים.',
  more: 'הכרטיסים של המסך הקודם – אותו מקור כמו קודם.',
};

// ── טעינה ──────────────────────────────────────────────────────────────────────────────────
export function init(ctx) { C = ctx; }
export function isLoaded() { return !!D; }
export async function load(force) {
  if (loading || (D && !force)) return;
  loading = true; loadErr = '';
  try {
    const { db, fs } = C;
    const snap = await fs.getDocs(fs.collection(db, 'usageDaily'));
    const days = {};
    snap.docs.forEach(d => { days[d.id] = d.data(); });
    const today = ilDayKey(new Date());
    // היום החי – 8 סוגים, היום בלבד (האינדקס הקיים: type + createdAt יורד)
    const [start] = ilDayRange(today);
    const evs = [], capped = [];
    await Promise.all(USAGE_TYPES.map(async ty => {
      const q = fs.query(fs.collection(db, 'events'), fs.where('type', '==', ty), fs.where('createdAt', '>=', start), fs.orderBy('createdAt', 'desc'), fs.limit(10000));   // 10,000 = התקרה של Firestore לשאילתה
      const s = await fs.getDocs(q);
      if (s.docs.length >= 10000) capped.push(ty);   // יום חריג כמו יום ההשקה – המספרים של היום חלקיים, ונאמר על המסך
      s.docs.forEach(x => { const e = x.data(); evs.push({ type: e.type, path: e.path, blockId: e.blockId, memberId: e.memberId, sessionId: e.sessionId, device: e.device, channel: e.channel }); });
    }));
    const admins = (C.fans() || []).filter(m => m.isAdmin === true).map(m => m.id);
    days[today] = aggregateUsageDay(evs, admins);
    // יום שהסתיים ועוד אין לו סיכום (הוורקר רץ ב-05:17) – אתמול לפני הריצה: נשאר חסר ונאמר על המסך
    D = { days, today, loadedAt: new Date(), todayEvents: evs.length, capped };
    if (!S.from) { S.from = LAUNCH; S.to = today; }
    if (!S.rq.from) { S.rq.from = addDays(today, -6); S.rq.to = today; }
  } catch (e) { console.error(e); loadErr = e.message || String(e); }
  finally { loading = false; C.rerender(); }
}

// ── חישוב ──────────────────────────────────────────────────────────────────────────────────
// כל השאלות שחוצות ימים נענות כאן, מאיחוד הימים. נבנה פעם אחת לכל טעינה (cache לפי loadedAt+מספר חברים).
let X = null, Xkey = '';
function base() {
  const fans = (C.fans() || []).filter(m => m.isAdmin !== true);
  const key = D.loadedAt.getTime() + ':' + fans.length;
  if (X && Xkey === key) return X;
  const keys = Object.keys(D.days).filter(k => k >= MEASURE_FROM).sort();
  const devFirst = {}, devDays = {}, devMem = {}, subDev = new Set(), loginDev = new Set(), subByMem = {}, memDev = {}, far = {}, memActDays = {};
  for (const k of keys) {
    const a = D.days[k] || {};
    (a.appFirst || []).forEach(d => { if (!devFirst[d]) devFirst[d] = k; });
    (a.appActive || []).forEach(d => { (devDays[d] || (devDays[d] = new Set())).add(k); if (!devFirst[d]) devFirst[d] = k; });
    Object.entries(a.devMem || {}).forEach(([d, m]) => { devMem[d] = m; if (!memDev[m]) memDev[m] = d; });
    (a.submitDevs || []).forEach(d => subDev.add(d));
    (a.loginDevs || []).forEach(d => loginDev.add(d));
    Object.entries(a.submits || {}).forEach(([m, d]) => { if (d && !subByMem[m]) subByMem[m] = d; });
    Object.entries(a.far || {}).forEach(([d, v]) => {
      const cur = far[d];
      if (!cur || (cur[0] === 'b' && v[0] === 'f')) { far[d] = v; return; }
      if (cur[0] !== v[0]) return;
      const order = v[0] === 'f' ? FAN_STEPS : BIZ_STEPS;
      if (order.indexOf(v.slice(2)) > order.indexOf(cur.slice(2))) far[d] = v;
    });
    (a.memHome || []).forEach(m => (memActDays[m] || (memActDays[m] = new Set())).add(k));
  }
  // ביקור שנרשם לפני הכניסה לחשבון (מסך הפתיחה) לא נושא memberId – משייכים את ימי הטלפון לחבר שלו
  for (const k of keys) ((D.days[k] || {}).homeDevs || []).forEach(d => { const m = devMem[d]; if (m) (memActDays[m] || (memActDays[m] = new Set())).add(k); });
  const byId = new Map(fans.map(m => [m.id, m]));
  // ימי פעילות של חבר – רק אחרי האישור, מכל מקום; + יום הכניסה האחרונה מהרשומה
  const memDays = {};
  for (const m of fans) {
    if (m.status !== 'approved') continue;
    const apk = m.approvedAt ? dk(m.approvedAt) : '';
    const s = new Set([...(memActDays[m.id] || [])].filter(k => !apk || k >= apk));
    const ls = m.lastSeenAt ? dk(m.lastSeenAt) : '';
    if (ls && ls >= MEASURE_FROM && (!m.approvedAt || m.lastSeenAt >= m.approvedAt)) s.add(ls);
    if (s.size) memDays[m.id] = s;
  }
  const appMem = new Set(Object.values(devMem));
  const isVet = m => !m.registeredAtKnown || dk(m.registeredAt) < LAUNCH;
  const devClass = d => subDev.has(d) ? 'sub' : (devMem[d] || loginDev.has(d)) ? 'login' : 'none';
  const memDlDay = m => { const d = subByMem[m.id] || memDev[m.id]; return d ? devFirst[d] || '' : ''; };
  X = { fans, byId, keys, devFirst, devDays, devMem, subDev, loginDev, subByMem, memDev, far, memDays, appMem, isVet, devClass, memDlDay };
  Xkey = key;
  return X;
}

function range() {
  const t = D.today;
  if (S.per === 'today') return [t, t];
  if (S.per === 'yest') { const y = addDays(t, -1); return [y, y]; }
  if (S.per === '7') return [addDays(t, -6), t];
  if (S.per === '30') return [addDays(t, -29), t];
  if (S.per === 'launch') return [LAUNCH, t];
  if (S.per === 'all') return [firstDay(), t];   // §704 – מאז ומתמיד: מההרשמה הראשונה שנשמרה
  return [S.from || LAUNCH, S.to || t];
}
// §704 – "הכול": היום של ההרשמה הראשונה (רשומות החברים); הורדות ופעילות נמדדות רק מ-11.10
let FIRST = '';
function firstDay() { if (!FIRST) { FIRST = MEASURE_FROM; (C.fans() || []).forEach(m => { if (m.registeredAtKnown) { const k = dk(m.registeredAt); if (k < FIRST) FIRST = k; } }); } return FIRST; }
const rangeLabel = ([a, b]) => a === b ? (a === D.today ? 'היום' : a === addDays(D.today, -1) ? 'אתמול' : short(a)) : `${short(a)}–${short(b)}`;

// מה קרה בטווח [a,b]
function period(a, b) {
  const x = base(), keys = dayList(a, b);
  const inR = k => k && k >= a && k <= b;
  const dl = Object.keys(x.devFirst).filter(d => inR(x.devFirst[d]));
  const cls = by(dl, x.devClass);
  const reg = x.fans.filter(m => m.registeredAtKnown && inR(dk(m.registeredAt)));
  const entered = m => m.status === 'approved' && x.memDays[m.id] && [...x.memDays[m.id]].length > 0;
  const rgSt = by(reg, m => m.status || 'pending');
  const rAp = reg.filter(m => m.status === 'approved'), rEnt = rAp.filter(entered);
  const dlw = [0, 0, 0, 0, 0];   // אותו יום / יום לפני / 2–3 / 4+ / לא ידוע
  reg.forEach(m => { const d = x.memDlDay(m); if (!d) return dlw[4]++; const g = dayDiff(d, dk(m.registeredAt)); dlw[g <= 0 ? 0 : g === 1 ? 1 : g <= 3 ? 2 : 3]++; });
  const ap = x.fans.filter(m => m.approvedAt && inR(dk(m.approvedAt))).length;
  const rej = x.fans.filter(m => m.status === 'rejected' && m.rejectedAt && inR(dk(m.rejectedAt))).length;
  let first = 0, ret = 0, active = 0;
  for (const [id, s] of Object.entries(x.memDays)) {
    const ins = [...s].filter(inR); if (!ins.length) continue;
    active++;
    const firstEver = [...s].sort()[0];
    if (inR(firstEver)) { first++; if (ins.length > 1) ret++; } else ret++;
  }
  const act = new Set(); keys.forEach(k => ((D.days[k] || {}).appActive || []).forEach(d => act.add(d)));
  const methodOf = m => m.signupMethod === 'apple' ? 2 : m.signupMethod === 'google' ? 1 : 0;
  const meth = [0, 0, 0], os = [0, 0]; reg.forEach(m => { meth[methodOf(m)]++; if (m.signupOs === 'ios') os[0]++; else if (m.signupOs === 'android') os[1]++; });
  const missing = keys.filter(k => k >= MEASURE_FROM && !D.days[k]);   // לפני 11.10 אין מדידה – זה לא "חסר"
  return { a, b, dl: dl.length, dReg: cls.sub || 0, dLog: cls.login || 0, dNone: cls.none || 0, reg: reg.length, rgSt, rAp: rAp.length, rEnt: rEnt.length,
    rPend: rgSt.pending || 0, rRej: rgSt.rejected || 0, dlw, ap, rej, first, ret, active, act: act.size, meth, os, missing, regList: reg };
}

// ── תצוגה ──────────────────────────────────────────────────────────────────────────────────
const TILES = [
  ['fun', 'מהורדה לכניסה', 'לפי התקופה'], ['regdrop', 'איפה נושרים בהרשמה', 'לפי התקופה'], ['st', 'איפה כל אחד עומד', 'מצב עכשיו'],
  ['ret', 'חזרות', 'בחירת תאריכים'], ['push', 'התראות (פוש)', 'מצב עכשיו'], ['use', 'כמה זמן נשארים', 'לפי התקופה'],
  ['trend', 'לאורך זמן', 'לפי יום'], ['land', 'דף הנחיתה', 'לפי התקופה'], ['more', 'עוד במסך', 'כרטיסים קודמים'],
];
const SRCKEY = { ret: 'ret2' };
const STEP_HE = { open: 'פתחו ולא התחילו', identity: 'פרטים אישיים', birth: 'תאריך לידה', subscriber: 'שאלת המנוי', route: 'בחירת דרך האימות', proof: 'העלאת ההוכחה', submitTry: 'לחצו שליחה ונעצרו', start: 'שלב 1', step2: 'שלב 2', step3: 'שלב 3', step4: 'שלב 4', step5: 'שלב 5' };

export function html() {
  if (loadErr) return `<div class="yzu">${css()}<div class="yzu-box">הטעינה נכשלה: ${esc(loadErr)} · <button class="yzu-btn" onclick="yzuReload()">לנסות שוב</button></div></div>`;
  if (!D) return `<div class="yzu">${css()}<div class="yzu-box">טוען נתונים…</div></div>`;
  const R = range(), p = period(R[0], R[1]);
  const head = `<div class="yzu-top"><div class="yzu-pbar"><b>תקופה:</b>${[['today', 'היום'], ['yest', 'אתמול'], ['7', '7 ימים'], ['30', '30 ימים'], ['launch', 'מאז ההשקה'], ['all', 'הכול'], ['custom', 'בחירת תאריכים']].map(([k, l]) => `<button class="${S.per === k ? 'on' : ''}" onclick="yzuSet('per','${k}')" ${k === 'all' ? 'title="מאז ומתמיד – מההרשמה הראשונה. הורדות, כניסות וחזרות נמדדים מ-11.10"' : ''}>${l}</button>`).join('')}
      ${S.per === 'custom' ? `<span>מ-<input type="date" value="${S.from}" min="${MEASURE_FROM}" max="${D.today}" onchange="yzuSet('from',this.value)"> עד <input type="date" value="${S.to}" min="${MEASURE_FROM}" max="${D.today}" onchange="yzuSet('to',this.value)"></span>` : ''}</div>
    <div class="yzu-tools"><button class="yzu-btn ${S.table ? 'on' : ''}" onclick="yzuSet('table')">${S.table ? '◧ חזרה לתצוגה הרגילה' : '▦ תצוגת טבלה'}</button><button class="yzu-btn" onclick="yzuReload()" title="טוען מחדש את אירועי היום">↻ רענון</button>
      <span class="yzu-note">נטען ${D.loadedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}${p.missing.length ? ` · ⚠️ חסר סיכום ל-${p.missing.map(short).join(', ')}` : ''}${D.capped.length ? ' · ⚠️ היום עבר 10,000 אירועים מאותו סוג – המספרים של היום חלקיים' : ''}</span></div></div>`;
  if (S.table) return `<div class="yzu">${css()}${head}${tableView(p)}</div>`;
  return `<div class="yzu">${css()}<div class="yzu-ov">${overview()}</div>${head}<div class="yzu-day">${dayPanel(p)}</div>
    <div class="yzu-tiles">${TILES.map(([id, nm, u]) => `<button class="yzu-tile${S.tile === id ? ' on' : ''}" onclick="yzuSet('tile','${id}')"><div class="nm"><span>${nm}${inf(SRC[SRCKEY[id] || id])}</span><i>${u}</i></div>${tileBig(id, p)}</button>`).join('')}</div>
    <div class="yzu-det">${(DET[S.tile] || DET.fun)(p).replace('</h2>', inf(SRC[SRCKEY[S.tile] || S.tile]) + '</h2>')}</div></div>`;
}

function overview() {
  const x = base(), L = LAUNCH;
  const all = x.fans, st = by(all, m => m.status || 'pending');
  const ap = all.filter(m => m.status === 'approved');
  const neu = ap.filter(m => !x.isVet(m)), vet = ap.filter(m => x.isVet(m));
  const op = g => g.filter(m => x.appMem.has(m.id)).length;
  const devs = Object.keys(x.devDays), dc = by(devs, x.devClass);
  const vetDevs = devs.filter(d => x.devClass(d) === 'login' && x.byId.get(x.devMem[d]) && x.isVet(x.byId.get(x.devMem[d])));
  const vetPeople = new Set(vetDevs.map(d => x.devMem[d])).size;
  const vetSubPeople = new Set(devs.filter(d => x.devClass(d) === 'sub' && x.byId.get(x.devMem[d]) && x.isVet(x.byId.get(x.devMem[d]))).map(d => x.devMem[d])).size;
  const biz = (C.biz() || []), bst = by(biz, b => b.status || 'pending');
  const owners = new Map(); biz.forEach(b => { const o = b.ownerMemberId; if (!o) return; const c = owners.get(o); if (!c || b.registeredAt < c.registeredAt) owners.set(o, b); });
  const ow = [...owners].filter(([id]) => x.byId.has(id));
  const owOld = ow.filter(([, b]) => !b.registeredAtKnown || dk(b.registeredAt) < L), owNew = ow.filter(([, b]) => b.registeredAtKnown && dk(b.registeredAt) >= L);
  const owOp = g => g.filter(([id]) => x.appMem.has(id)).length;
  const bizNew = biz.filter(b => b.registeredAtKnown && dk(b.registeredAt) >= L), bnst = by(bizNew, b => b.status || 'pending');
  const bar = segs => { const t = segs.reduce((s, [n]) => s + n, 0) || 1; return '<div class="yzu-ovs">' + segs.map(([n, c]) => `<i style="width:${n / t * 100}%;background:${c}"></i>`).join('') + '</div>'; };
  // חדשים – נכנסו לדף הבית אחרי האישור (אותה הגדרה של "איפה כל אחד עומד"). ותיקים – פתחו את האפליקציה אי-פעם (מ-11.10)
  const nNeuOp = neu.filter(m => x.memDays[m.id]).length, nVetOp = op(vet);
  return `<div class="yzu-ovb"><h3><span>חברים – מאז פתיחת האתר${inf(SRC.members)}</span><b>${f(all.length)}</b></h3>
      ${bar([[st.approved || 0, 'var(--yzu-ok)'], [st.pending || 0, 'var(--yzu-acc)'], [st.rejected || 0, 'var(--yzu-bad)']])}
      <div class="yzu-ovr"><span style="--c:var(--yzu-ok)">מאושרים <b>${f(st.approved)}</b></span><span style="--c:var(--yzu-acc)">ממתינים <b>${f(st.pending)}</b></span><span style="--c:var(--yzu-bad)">נדחו <b>${f(st.rejected)}</b></span></div>
      <div class="yzu-ovn"><span class="eq"><b>${f(all.length)}</b> נרשמו אי-פעם = <b>${f(ap.length)}</b> מאושרים + <b>${f(all.length - ap.length)}</b> לא מאושרים (${f(st.pending)} ממתינים + ${f(st.rejected)} נדחו)</span>
        <table><tr><th>המאושרים</th><th class="n">כמה</th><th class="n">נכנסו לאפליקציה</th><th class="n">עוד לא</th></tr>
          <tr><td>נרשמו מההשקה</td><td class="n">${f(neu.length)}</td><td class="n">${f(nNeuOp)}</td><td class="n">${f(neu.length - nNeuOp)}</td></tr>
          <tr><td>ותיקים (נרשמו לפני ההשקה)</td><td class="n">${f(vet.length)}</td><td class="n">${f(nVetOp)}</td><td class="n">${f(vet.length - nVetOp)}</td></tr>
          <tr class="tot"><td>סה"כ</td><td class="n">${f(ap.length)}</td><td class="n">${f(nNeuOp + nVetOp)} (${pc(nNeuOp + nVetOp, ap.length)})</td><td class="n">${f(ap.length - nNeuOp - nVetOp)}</td></tr></table>
        <ul><li><b>${f(neu.length - nNeuOp)} החדשים</b> – נרשמו (ברוב המקרים מהאפליקציה), אושרו, ולא נכנסו מאז.</li>
          <li><b>${f(vet.length - nVetOp)} הוותיקים</b> – אין להם אף פתיחה של האפליקציה. כנראה עוד לא הורידו. (מי שהוריד ולא פתח – אין דרך לדעת.)</li></ul></div></div>
    <div class="yzu-ovb"><h3><span>הורדות – טלפונים שפתחו את האפליקציה${inf(SRC.dlAll)}</span><b>${f(devs.length)}</b></h3>
      ${bar([[dc.sub || 0, 'var(--yzu-ok)'], [dc.login || 0, 'var(--yzu-blue)'], [dc.none || 0, 'var(--yzu-bad)']])}
      <div class="yzu-ovr"><span style="--c:var(--yzu-ok)">נרשמו מהם <b>${f(dc.sub)}</b></span><span style="--c:var(--yzu-blue)">נכנסו לחשבון קיים <b>${f(dc.login)}</b></span><span style="--c:var(--yzu-bad)">לא נרשמו ולא נכנסו <b>${f(dc.none)}</b></span></div>
      <div class="yzu-ovn"><ul><li><b>נרשמו</b> – מהטלפון נשלח טופס הרשמה. כולל ${f(vetSubPeople)} ותיקים שנרשמו מהאפליקציה עצמה בשבוע שלפני ההשקה (20–25.10).</li>
        <li><b>נכנסו לחשבון קיים</b> – כבר היה חבר ולא היה צריך להירשם: ${f(vetDevs.length)} טלפונים של <b>${f(vetPeople)} ותיקים מתוך ${f(vet.length)}</b>, והשאר של חברים שנרשמו מטלפון אחר.</li>
        <li><b>לא נרשמו ולא נכנסו</b> – פתחו ויצאו בלי חשבון. אין לנו עליהם שם (מעקב "הורידו ולא נרשמו").</li></ul>
        יותר הורדות מחברים באפליקציה – כי יש טלפונים בלי חשבון, ממתינים ונדחים, שני טלפונים לאדם, והתקנה מחדש. המספר בחנויות שונה (סופר גם מי שלא פתח).</div></div>
    <div class="yzu-ovb"><h3><span>עסקים – מאז פתיחת האתר${inf(SRC.biz)}</span><b>${f(biz.length)}</b></h3>
      ${bar([[bst.approved || 0, 'var(--yzu-ok)'], [bst.pending || 0, 'var(--yzu-acc)'], [biz.length - (bst.approved || 0) - (bst.pending || 0), 'var(--yzu-bad)']])}
      <div class="yzu-ovr"><span style="--c:var(--yzu-ok)">מאושרים <b>${f(bst.approved)}</b></span><span style="--c:var(--yzu-acc)">ממתינים <b>${f(bst.pending)}</b></span>${biz.length - (bst.approved || 0) - (bst.pending || 0) ? `<span style="--c:var(--yzu-bad)">אחר <b>${f(biz.length - (bst.approved || 0) - (bst.pending || 0))}</b></span>` : ''}</div>
      <div class="yzu-ovn"><span class="eq"><b>${f(bizNew.length)}</b> נרשמו מההשקה = ${f(bnst.approved)} אושרו + ${f(bnst.pending)} ממתינים</span>
        <table><tr><th>בעלי העסקים</th><th class="n">כמה</th><th class="n">פתחו את האפליקציה</th><th class="n">עוד לא פתחו</th></tr>
          <tr><td>ותיקים (העסק לפני ההשקה)</td><td class="n">${f(owOld.length)}</td><td class="n">${f(owOp(owOld))}</td><td class="n">${f(owOld.length - owOp(owOld))}</td></tr>
          <tr><td>חדשים (העסק מההשקה)</td><td class="n">${f(owNew.length)}</td><td class="n">${f(owOp(owNew))}</td><td class="n">${f(owNew.length - owOp(owNew))}</td></tr>
          <tr class="tot"><td>סה"כ</td><td class="n">${f(ow.length)}</td><td class="n">${f(owOp(ow))}</td><td class="n">${f(ow.length - owOp(ow))}</td></tr></table>
        <span style="font-size:12px">כל בעל עסק פעם אחת, לפי העסק הראשון שלו. הרשימה עם וואטסאפ – במעקב "בעלי עסקים בלי האפליקציה".</span></div></div>`;
}

function dayPanel(p) {
  const single = p.a === p.b, prev = single ? period(addDays(p.a, -1), addDays(p.a, -1)) : null;
  const dt = k => { if (!prev || !prev[k]) return '<div class="dt">&nbsp;</div>'; const d = p[k] - prev[k]; return `<div class="dt ${k === 'rej' ? '' : d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${f(Math.abs(d))} מהיום הקודם</div>`; };
  const k = (key, l, hl) => `<div class="kp${hl ? ' hl' : ''}"><small>${l}${inf(SRC[key])}</small><b>${f(p[key])}</b>${dt(key)}</div>`;
  const past = p.dlw[1] + p.dlw[2] + p.dlw[3];
  return `<h2>מה קרה – ${rangeLabel([p.a, p.b])}</h2>
  <div class="yzu-kpis">${k('dl', 'הורדות', 1)}${k('reg', 'הרשמות', 1)}${k('ap', 'אושרו')}${k('rej', 'נדחו')}${k('first', 'נכנסו בפעם הראשונה')}${k('ret', single ? 'חזרו (נכנסו גם קודם)' : 'חזרו ביום נוסף')}${k('act', 'מכשירים פעילים')}</div>
  <div class="yzu-cols">
    <div class="yzu-box"><h3>מי שהוריד בתקופה – ${f(p.dl)} מכשירים</h3>
      <div class="flow"><span class="g">${f(p.dReg)} נרשמו</span> (${pc(p.dReg, p.dl)}) · <span class="g">${f(p.dLog)} נכנסו לחשבון קיים</span> · <span class="r">${f(p.dNone)} עוד לא נרשמו</span></div>
      <div class="flow sep"><b>+ ${f(past)} נרשמו בתקופה והורידו לפניה</b> (${f(p.dlw[1])} יום לפני · ${f(p.dlw[2])} 2–3 ימים · ${f(p.dlw[3])} 4+ ימים)${inf(SRC.dlday)}</div>
      <p class="yzu-note">סה"כ נרשמו בתקופה: ${f(p.dlw[0])} באותו יום שהורידו + ${f(past)} שהורידו קודם${p.dlw[4] ? ` + ${f(p.dlw[4])} לא ידוע (הטלפון לא זוהה)` : ''} = ${f(p.reg)}.</p></div>
    <div class="yzu-box"><h3>מי שנרשם בתקופה – ${f(p.reg)} אנשים</h3>
      <div class="flow"><span class="g">${f(p.rAp)} אושרו</span> (מתוכם ${f(p.rEnt)} כבר נכנסו) · <span class="y">${f(p.rPend)} ממתינים לאישור</span> · <span class="r">${f(p.rRej)} נדחו</span></div>
      <p class="yzu-note">קוד ${f(p.meth[0])} · Google ${f(p.meth[1])} · Apple ${f(p.meth[2])} &nbsp;|&nbsp; אייפון ${f(p.os[0])} · אנדרואיד ${f(p.os[1])}</p></div>
  </div>
  <p class="yzu-note">"אושרו" ו"נדחו" בשורה העליונה = מה שעשית בתקופה, כולל מי שנרשם קודם. בתיבה השמאלית – מה קרה עד עכשיו למי שנרשם בתקופה.</p>`;
}

function tileBig(id, p) {
  const x = base(), s = (big, sm, pct) => `<div class="big">${big} <small>${sm}</small></div><div class="pct">${pct}</div>`;
  if (id === 'fun') return s(f(p.rEnt), 'נכנסו', `מתוך ${f(p.reg)} שנרשמו בתקופה`);
  if (id === 'regdrop') { const r = drop(p); return s(f(r.fan.stop + r.biz.stop), 'עצרו בטופס', `אוהדים ${f(r.fan.stop)} · עסקים ${f(r.biz.stop)}`); }
  if (id === 'st') { const r = statuses(); return s(f(r.total), 'נרשמו מההשקה', `5 מצבים · ${f(r.rows[4].n)} חזרו`); }
  if (id === 'ret') { const r = retStats(); return s(f(r.back), 'חוזרים', `${pc(r.back, r.act)} מ-${f(r.act)} פעילים · ${short(r.a)}–${short(r.b)}`); }
  if (id === 'push') { const r = pushStats(); return s(f(r.on), 'מחוברים', `${pc(r.on, r.ent)} ממי שנכנס`); }
  if (id === 'use') { const u = useSum(p); const t = u.in.reduce((a, b) => a + b, 0); return s(pc(u.in.slice(2).reduce((a, b) => a + b, 0), t), 'מעל 2 דק׳', 'בתוך האפליקציה'); }
  if (id === 'trend') return s(f(p.act), 'פעילים', rangeLabel([p.a, p.b]));
  if (id === 'land') { const l = landSum(p); return s(f(l.sessions), 'ביקורים', `${pc(l.clickSessions, l.sessions)} לחצו על חנות`); }
  return s('↗', 'המסך הקודם', 'מקורות, כניסות שנכשלו, רשימות');
}

// ── חישובי האריחים ─────────────────────────────────────────────────────────────────────────
function drop(p) {
  const x = base(), keys = dayList(p.a, p.b);
  const seen = new Set(); keys.forEach(k => Object.keys((D.days[k] || {}).far || {}).forEach(d => seen.add(d)));
  const r = { fan: { opened: 0, sub: 0, stop: 0, at: {} }, biz: { opened: 0, sub: 0, stop: 0, at: {} } };
  seen.forEach(d => { const v = x.far[d]; if (!v) return; const g = v[0] === 'f' ? r.fan : r.biz; g.opened++; if (x.subDev.has(d)) g.sub++; else { g.stop++; const st = v.slice(2); g.at[st] = (g.at[st] || 0) + 1; } });
  return r;
}
function statuses() {
  const x = base();
  const reg = x.fans.filter(m => m.registeredAtKnown && dk(m.registeredAt) >= LAUNCH);
  const st = m => m.status === 'pending' || !m.status ? 0 : m.status === 'rejected' ? 1 : !x.memDays[m.id] ? 2 : x.memDays[m.id].size >= 2 ? 4 : 3;
  const rows = [['var(--yzu-acc)', 'ממתין לאישור', 'מחכה לך'], ['var(--yzu-bad)', 'נדחה', 'קיבל "האימות לא עבר" והזדמנות שנייה'], ['#E8833A', 'אושר ולא נכנס', 'צריך להיכנס'], ['var(--yzu-blue)', 'נכנס ביום אחד', 'צריך לחזור ביום נוסף'], ['var(--yzu-ok)', 'חזר 2+ ימים', 'פעיל']]
    .map(([c, l, note]) => ({ c, l, note, n: 0, m: [0, 0, 0], o: [0, 0] }));
  reg.forEach(m => { const r = rows[st(m)]; r.n++; r.m[m.signupMethod === 'apple' ? 2 : m.signupMethod === 'google' ? 1 : 0]++; if (m.signupOs === 'ios') r.o[0]++; else if (m.signupOs === 'android') r.o[1]++; });
  return { total: reg.length, rows };
}
function retStats() {
  const x = base(), a = S.rq.from, b = S.rq.to, rq = S.rq;
  const inR = k => k >= a && k <= b, days = dayList(a, b);
  let rows;
  if (rq.mode === 'mem') rows = Object.entries(x.memDays).filter(([id]) => { const m = x.byId.get(id); return rq.grp === 'all' || (rq.grp === 'vet') === x.isVet(m); }).map(([, s]) => [...s].sort());
  else rows = Object.entries(x.devDays).filter(([d]) => rq.grp === 'all' || (rq.grp === 'reg') === (x.devClass(d) !== 'none')).map(([, s]) => [...s].sort());
  const per = days.map(k => [k, 0, 0]); let act = 0, newIn = 0, back = 0, nb = 0, b7 = 0, b7n = 0; const hist = [0, 0, 0, 0, 0];
  const lastK = D.today, diff = dayDiff;
  rows.forEach(d => {
    const ins = d.filter(inR); if (!ins.length) return;
    act++;
    d.forEach((k, j) => { if (inR(k)) per[days.indexOf(k)][j ? 2 : 1]++; });
    const first = inR(d[0]); if (first) { newIn++; if (d.length > 1) nb++; if (diff(d[0], lastK) >= 7) { b7n++; if (d.some(k => k > d[0] && diff(d[0], k) <= 7)) b7++; } }
    if (!first || ins.length >= 2) back++;
    const n = ins.length; hist[n >= 7 ? 4 : n >= 4 ? 3 : n - 1]++;
  });
  return { a, b, per, act, newIn, back, nb, b7, b7n, hist, avg: per.reduce((s, x2) => s + x2[1] + x2[2], 0) / Math.max(1, per.length) };
}
function pushStats() {
  const x = base();
  const ent = x.fans.filter(m => m.status === 'approved' && m.lastSeenAt && dk(m.lastSeenAt) >= PUSH_FROM);
  const on = m => { const p = C.pushInfo(m); return !!(p && p.app); };
  const g = (list, fn) => { const o = {}; list.forEach(m => { const k = fn(m); const r = o[k] || (o[k] = [0, 0]); r[0]++; if (on(m)) r[1]++; }); return o; };
  return { ent: ent.length, on: ent.filter(on).length, os: g(ent, m => m.signupOs === 'ios' ? 'אייפון' : m.signupOs === 'android' ? 'אנדרואיד' : 'לא ידוע'),
    meth: g(ent.filter(m => !x.isVet(m)), m => m.signupMethod === 'apple' ? 'Apple' : m.signupMethod === 'google' ? 'Google' : 'קוד'),
    grp: g(ent, m => x.isVet(m) ? 'ותיקים' : 'נרשמו מההשקה') };
}
// §708 – הכרטיס "רוצים שנעדכן אתכם?": הוצג → לחצו כן / לא → מה מערכת ההפעלה ענתה. ביקורים, לפי התקופה למעלה.
function pushCardHtml() {
  const R = range(), pcS = {}; let days = 0;
  dayList(R[0], R[1]).forEach(k => { const d = (D.days[k] || {}).pushCard; if (!d) return; days++; Object.entries(d).forEach(([s, n]) => pcS[s] = (pcS[s] || 0) + n); });
  if (!days) return '<div class="yzu-how">הכרטיס "רוצים שנעדכן אתכם?" – המדידה נוספה ב-§707; בתקופה שנבחרה עוד אין נתונים. כאן יופיע כמה ראו אותו, כמה אישרו וכמה סירבו – כדי לדעת למה יש מי שנכנס בלי פוש.</div>';
  const sh = pcS.shown || 0, rows = [['הכרטיס הוצג', sh, ''], ['לחצו "כן"', pcS.accept || 0, 'ok'], ['לחצו "לא" / סגרו', pcS.decline || 0, 'hot'], ['הטלפון אישר התראות', pcS.granted || 0, 'ok'], ['הטלפון חסם (סירבו בחלון של המערכת)', pcS.denied || 0, 'hot'], ['כשל טכני (הכרטיס יחזור)', pcS.error || 0, '']];
  return `<div class="yzu-box"><h3>הכרטיס "רוצים שנעדכן אתכם?" – ${rangeLabel(R)}</h3>${rows.map(([l2, v, c]) => hb(l2, v, Math.max(1, sh), c)).join('')}
    <p class="yzu-note">ביקורים. מתוך מי שראה את הכרטיס: ${pc(pcS.accept || 0, sh)} אישרו, ${pc(pcS.decline || 0, sh)} סירבו.</p></div>`;
}
function useSum(p) { const u = { in: [0, 0, 0, 0, 0, 0], out: [0, 0, 0, 0, 0, 0] }; dayList(p.a, p.b).forEach(k => { const d = (D.days[k] || {}).use; if (!d) return; for (let i = 0; i < 6; i++) { u.in[i] += (d.in || [])[i] || 0; u.out[i] += (d.out || [])[i] || 0; } }); return u; }
function landSum(p) {
  const l = { views: 0, sessions: 0, mobile: 0, desktop: 0, clicks: 0, clickSessions: 0, ios: 0, android: 0, src: {}, depth: {}, depthDays: 0, perDay: [] };
  dayList(p.a, p.b).forEach(k => { const d = (D.days[k] || {}).land || {}; ['views', 'sessions', 'mobile', 'desktop', 'clicks', 'clickSessions', 'ios', 'android'].forEach(f2 => l[f2] += d[f2] || 0); Object.entries(d.src || {}).forEach(([s, n]) => l.src[s] = (l.src[s] || 0) + n); if (d.depth) { l.depthDays++; Object.entries(d.depth).forEach(([s, n]) => l.depth[s] = (l.depth[s] || 0) + n); } l.perDay.push([k, d.sessions || 0, d.clickSessions || 0]); });
  return l;
}
function trendRows(p) {
  const x = base(), regBy = {}, apBy = {};
  x.fans.forEach(m => { if (m.registeredAtKnown) { const k = dk(m.registeredAt); regBy[k] = (regBy[k] || 0) + 1; } if (m.approvedAt) { const k = dk(m.approvedAt); apBy[k] = (apBy[k] || 0) + 1; } });
  return dayList(p.a, p.b).map(k => {
    const a = D.days[k] || {};
    return { k, dl: (a.appFirst || []).length, act: (a.appActive || []).length, reg: regBy[k] || 0, ap: apBy[k] || 0 };
  });
}

// ── פירוט כל אריח ──────────────────────────────────────────────────────────────────────────
const bars = (rows, max, cls) => rows.map(([l, n]) => hb(l, n, max, cls)).join('');
const cbar = (cols, many) => `<div class="yzu-cbar" style="gap:${many ? 2 : 8}px">${cols.map(c => `<div class="c" title="${esc(c.t)}">${many ? '' : `<em>${f(c.a + c.b)}</em>`}<i class="f" style="height:${c.ha}%"></i><i class="r" style="height:${c.hb}%"></i></div>`).join('')}</div>`;
const DET = {
  fun: p => {
    const top = Math.max(1, p.dl), notEnt = p.rAp - p.rEnt;
    const step = (n, l, u, big, gap) => `<div class="yzu-fs"><div class="lbl">${n}. ${l}<span class="u">${u}</span><b>${f(big)}</b></div><div><div class="bar"><i style="width:${W(big, top)}%"></i></div><div class="gap">${gap}</div></div></div>`;
    return `<h2>מהורדה לכניסה – ${rangeLabel([p.a, p.b])}</h2>
    <p class="yzu-def">מי שהוריד בתקופה ומי שנרשם בתקופה – ומה קרה להם עד עכשיו. מתחת לכל שלב, בקטן – מי שלא עבר לשלב הבא. שלב 1 נספר לפי טלפון; משלב 2 – אנשים.</p>
    <div class="yzu-fun">
      ${step(1, 'הורידו ופתחו', 'מכשירים', p.dl, `<span class="d">${f(p.dNone)} לא נרשמו ולא נכנסו (${pc(p.dNone, p.dl)})</span> – מעקב "הורידו ולא נרשמו"<br>${f(p.dLog)} לא נרשמו כי כבר היו חברים – נכנסו לחשבון קיים`)}
      ${step(2, 'נרשמו', 'אנשים', p.reg, `<span class="w">${f(p.rPend)} ממתינים לאישור שלך</span> · <span class="d">${f(p.rRej)} נדחו</span><br>מתוכם ${f(p.dlw[0])} הורידו באותו יום, ${f(p.dlw[1] + p.dlw[2] + p.dlw[3])} הורידו קודם${p.dlw[4] ? `, ${f(p.dlw[4])} לא ידוע` : ''}`)}
      ${step(3, 'אושרו', 'אנשים', p.rAp, `<span class="d">${f(notEnt)} עוד לא נכנסו אף פעם (${pc(notEnt, p.rAp)})</span> – מעקב "אושרו ולא נכנסו"`)}
      ${step(4, 'נכנסו לאפליקציה', 'אנשים', p.rEnt, 'מתוך מי שנרשם בתקופה')}
    </div>
    <div class="yzu-how"><b>הפער כאן או במעקב?</b> כאן רואים את הפער לתקופה שנבחרה, כולל מי שהצטרף היום. במעקבים – קבוצה קבועה מתאריך, ובודקים כמה ממנה כבר טופלו. כאן רואים; שם פועלים.</div>`;
  },
  regdrop: p => {
    const r = drop(p), FAN = [['open', 'פתחו ולא התחילו'], ['identity', 'בפרטים האישיים'], ['birth', 'בתאריך הלידה'], ['subscriber', 'בשאלת המנוי'], ['route', 'בבחירת דרך האימות'], ['proof', 'בהעלאת ההוכחה'], ['submitTry', 'לחצו "שליחה" ונעצרו']];
    const BIZ = [['open', 'פתחו ולא התחילו'], ['start', 'בשלב 1'], ['step2', 'בשלב 2'], ['step3', 'בשלב 3'], ['step4', 'בשלב 4'], ['step5', 'בשלב 5 (האחרון)'], ['submitTry', 'לחצו "שליחה" ונעצרו']];
    const mf = Math.max(1, ...FAN.map(([k]) => r.fan.at[k] || 0)), mb = Math.max(1, ...BIZ.map(([k]) => r.biz.at[k] || 0));
    const proof = (r.fan.at.route || 0) + (r.fan.at.proof || 0);
    return `<h2>איפה נושרים בהרשמה – ${rangeLabel([p.a, p.b])}</h2>
    <p class="yzu-def">לכל טלפון שפתח טופס בתקופה – השלב הכי רחוק שהגיע אליו. מי ששלח לא נספר כאן.</p>
    <div class="yzu-cols">
      <div class="yzu-box"><h3>טופס אוהד – ${f(r.fan.opened)} פתחו · ${f(r.fan.sub)} שלחו (${pc(r.fan.sub, r.fan.opened)}) · ${f(r.fan.stop)} עצרו</h3>
        ${FAN.map(([k, l]) => hb(l, r.fan.at[k] || 0, mf, k === 'route' || k === 'proof' ? 'hot' : '')).join('')}
        <p class="yzu-note"><b>${f(proof)} מתוך ${f(r.fan.stop)} (${pc(proof, r.fan.stop)}) עצרו באימות</b> – בבחירת הדרך או בהעלאת ההוכחה.</p></div>
      <div class="yzu-box"><h3>טופס עסק – ${f(r.biz.opened)} פתחו · ${f(r.biz.sub)} שלחו (${pc(r.biz.sub, r.biz.opened)}) · ${f(r.biz.stop)} עצרו</h3>
        ${BIZ.map(([k, l]) => hb(l, r.biz.at[k] || 0, mb, k === 'open' ? 'hot' : '')).join('')}
        <p class="yzu-note">מכשיר שפתח גם טופס אוהד וגם טופס עסק נספר כאוהד.</p></div>
    </div>`;
  },
  st: () => {
    const r = statuses(), t = Math.max(1, r.total);
    return `<h2>איפה כל אחד עומד עכשיו – ${f(r.total)} שנרשמו מאז ההשקה</h2>
    <p class="yzu-def">כל אדם נמצא במצב אחד בלבד. סכום המצבים = כל מי שנרשם.</p>
    <div class="yzu-ovs" style="height:26px">${r.rows.map(x => `<i title="${x.l}" style="width:${x.n / t * 100}%;background:${x.c}"></i>`).join('')}</div>
    <div class="yzu-box yzu-tw"><table><tr><th>מצב</th><th class="n">סה"כ</th><th class="n">%</th><th class="n">קוד</th><th class="n">Google</th><th class="n">Apple</th><th class="n">אייפון</th><th class="n">אנדרואיד</th><th>מה חסר לשלב הבא</th></tr>
      ${r.rows.map(x => `<tr><td><span class="dot" style="background:${x.c}"></span>${x.l}</td><td class="n"><b>${f(x.n)}</b></td><td class="n">${pc(x.n, t)}</td><td class="n">${f(x.m[0])}</td><td class="n">${f(x.m[1])}</td><td class="n">${f(x.m[2])}</td><td class="n">${f(x.o[0])}</td><td class="n">${f(x.o[1])}</td><td class="muted">${x.note}</td></tr>`).join('')}
      <tr class="tot"><td>סה"כ</td><td class="n">${f(r.total)}</td><td class="n">100%</td>${[0, 1, 2].map(i => `<td class="n">${f(r.rows.reduce((s, x) => s + x.m[i], 0))}</td>`).join('')}${[0, 1].map(i => `<td class="n">${f(r.rows.reduce((s, x) => s + x.o[i], 0))}</td>`).join('')}<td></td></tr></table></div>`;
  },
  ret: () => {
    const r = retStats(), rq = S.rq, many = r.per.length > 21, mx = Math.max(1, ...r.per.map(x => x[1] + x[2]));
    const unit = rq.mode === 'mem' ? 'חברים' : 'מכשירים', t = D.today;
    const preset = (l, a, b) => `<button class="${rq.from === a && rq.to === b ? 'on' : ''}" onclick="yzuRq('${a}','${b}')">${l}</button>`;
    const grp = rq.mode === 'mem' ? [['all', 'כולם'], ['new', 'נרשמו מההשקה'], ['vet', 'ותיקים']] : [['all', 'כל המכשירים'], ['reg', 'נרשמו / נכנסו'], ['none', 'בלי חשבון']];
    return `<h2>חזרות – מי חוזר, ובכמה ימים</h2>
    <p class="yzu-def">כל טווח מ-11.10. <b>חוזר</b> = היה פעיל גם לפני אותו יום. <b>לפי חבר</b> – ימים אחרי האישור, מהאפליקציה או מהאתר. <b>לפי מכשיר</b> – כל טלפון שפתח את האפליקציה, גם בלי הרשמה.</p>
    <div class="yzu-chips"><button class="${rq.mode === 'mem' ? 'on' : ''}" onclick="yzuRqSet('mode','mem')">לפי חבר</button><button class="${rq.mode === 'dev' ? 'on' : ''}" onclick="yzuRqSet('mode','dev')">לפי מכשיר</button><span style="width:10px"></span>
      ${grp.map(([k, l]) => `<button class="${rq.grp === k ? 'on' : ''}" onclick="yzuRqSet('grp','${k}')">${l}</button>`).join('')}</div>
    <div class="yzu-chips">${preset('7 ימים אחרונים', addDays(t, -6), t)}${preset('14 ימים', addDays(t, -13), t)}${preset('30 ימים', addDays(t, -29), t)}${preset('מאז ההשקה', LAUNCH, t)}${preset('הכול', MEASURE_FROM, t)}
      <span>מ-<input type="date" value="${rq.from}" min="${MEASURE_FROM}" max="${t}" onchange="yzuRqSet('from',this.value)"> עד <input type="date" value="${rq.to}" min="${MEASURE_FROM}" max="${t}" onchange="yzuRqSet('to',this.value)"></span></div>
    <div class="yzu-kpis" style="grid-template-columns:repeat(5,1fr)">
      <div class="kp hl"><small>${unit} פעילים בטווח</small><b>${f(r.act)}</b><div class="dt">${short(r.a)}–${short(r.b)} · ${r.per.length} ימים</div></div>
      <div class="kp"><small>מהם חוזרים</small><b>${f(r.back)}</b><div class="dt">${pc(r.back, r.act)} – היו גם לפני, או ביומיים+ בטווח</div></div>
      <div class="kp"><small>חדשים בטווח</small><b>${f(r.newIn)}</b><div class="dt">היום הראשון שלהם בטווח</div></div>
      <div class="kp"><small>מהחדשים – חזרו ביום נוסף</small><b>${pc(r.nb, r.newIn)}</b><div class="dt">${f(r.nb)} מ-${f(r.newIn)} · תוך 7 ימים: ${r.b7n ? pc(r.b7, r.b7n) + ` (מ-${f(r.b7n)} שעברו להם 7 ימים)` : 'עוד לא עברו 7 ימים'}</div></div>
      <div class="kp"><small>ממוצע פעילים ביום</small><b>${f(Math.round(r.avg))}</b><div class="dt">&nbsp;</div></div></div>
    <div class="yzu-cols">
      <div class="yzu-box"><h3>${unit} פעילים בכל יום – בפעם הראשונה מול חוזרים</h3>
        ${cbar(r.per.map(([k, a, b]) => ({ t: `${short(k)}: ${a} בפעם הראשונה, ${b} חוזרים`, a, b, ha: a / mx * 100, hb: b / mx * 100 })), many)}
        <div class="yzu-cdays" style="gap:${many ? 2 : 8}px">${r.per.map(([k], i) => `<span>${!many || i % 5 === 0 ? short(k) : ''}</span>`).join('')}</div>
        <div class="yzu-legend"><span style="--c:var(--yzu-acc)">בפעם הראשונה</span><span style="--c:var(--yzu-blue)">חוזרים</span></div></div>
      <div class="yzu-box"><h3>בכמה ימים שונים היו פעילים בטווח</h3>
        ${bars([['יום אחד', r.hist[0]], ['2 ימים', r.hist[1]], ['3 ימים', r.hist[2]], ['4–6 ימים', r.hist[3]], ['7+ ימים', r.hist[4]]], Math.max(1, ...r.hist), 'ok')}
        <div class="yzu-tw" style="margin-top:10px;max-height:220px;overflow-y:auto"><table><tr><th>יום</th><th class="n">פעילים</th><th class="n">ראשונה</th><th class="n">חוזרים</th><th class="n">% חוזרים</th></tr>
          ${r.per.slice().reverse().map(([k, a, b]) => `<tr><td>${short(k)}</td><td class="n">${f(a + b)}</td><td class="n">${f(a)}</td><td class="n">${f(b)}</td><td class="n">${pc(b, a + b)}</td></tr>`).join('')}</table></div></div>
    </div>`;
  },
  push: () => {
    const r = pushStats(), tb = o => Object.entries(o).map(([k, [n, on]]) => `<tr><td>${k}</td><td class="n">${f(n)}</td><td class="n">${f(on)}</td><td class="n">${pc(on, n)}</td></tr>`).join('');
    const head = '<tr><th></th><th class="n">נכנסו</th><th class="n">עם פוש</th><th class="n">%</th></tr>';
    return `<h2>התראות – מי יכול לקבל פוש</h2>
    <p class="yzu-def">מצב עכשיו. המכנה הוא <b>מי שנכנס לאפליקציה</b> (מ-20.10), כי רק מי שנכנס יכול להפעיל התראות.</p>
    <div class="yzu-kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kp hl"><small>מחוברים להתראות</small><b>${f(r.on)}</b><div class="dt">${pc(r.on, r.ent)} מ-${f(r.ent)} שנכנסו</div></div>
      <div class="kp"><small>נכנסו בלי פוש</small><b>${f(r.ent - r.on)}</b><div class="dt">לא ידוע אם סירבו או לא ראו את הכרטיס</div></div></div>
    <div class="yzu-cols"><div class="yzu-box"><h3>לפי מכשיר</h3><table>${head}${tb(r.os)}</table><div style="height:10px"></div><table>${head}${tb(r.grp)}</table></div>
      <div class="yzu-box"><h3>נרשמו מההשקה – לפי דרך ההרשמה</h3><table>${head}${tb(r.meth)}</table></div></div>
    ${pushCardHtml()}`;
  },
  use: p => {
    const u = useSum(p), L = ['פחות מ-30 שנ׳', '30 שנ׳–2 דק׳', '2–5 דק׳', '5–15 דק׳', '15–30 דק׳', 'מעל 30 דק׳'];
    const ti = u.in.reduce((a, b) => a + b, 0), to = u.out.reduce((a, b) => a + b, 0);
    return `<h2>כמה זמן נשארים בכל ביקור – ${rangeLabel([p.a, p.b])}</h2>
    <p class="yzu-def">זמן שהמסך היה פתוח בפועל, באפליקציה. "בתוך האפליקציה" = ביקור שבו היה חבר מחובר או בדף הבית. השאר = מסך הפתיחה, הטופס, חלון הכניסה, ומי שמחכה לאישור.</p>
    <div class="yzu-cols"><div class="yzu-box"><h3>בתוך האפליקציה – ${f(ti)} ביקורים</h3>${L.map((l, i) => hb(l, u.in[i], Math.max(1, ...u.in), 'ok')).join('')}<p class="yzu-note">${pc(u.in.slice(2).reduce((a, b) => a + b, 0), ti)} נשארו יותר מ-2 דקות.</p></div>
      <div class="yzu-box"><h3>בהרשמה ובכניסה – ${f(to)} ביקורים</h3>${L.map((l, i) => hb(l, u.out[i], Math.max(1, ...u.out))).join('')}</div></div>`;
  },
  trend: p => {
    const rows = trendRows(p), M = { act: 'מכשירים פעילים', dl: 'הורדות', reg: 'הרשמות', ap: 'אושרו' }, k = S.trendK;
    const mx = Math.max(1, ...rows.map(r => r[k])), many = rows.length > 21;
    return `<h2>לאורך זמן – יום אחרי יום</h2>
    <p class="yzu-def">בוחרים מדד ורואים אותו לפי יום, בתקופה שנבחרה למעלה. ל"הכול" – לבחור תאריכים מ-11.10.</p>
    <div class="yzu-chips">${Object.entries(M).map(([kk, l]) => `<button class="${k === kk ? 'on' : ''}" onclick="yzuSet('trendK','${kk}')">${l}</button>`).join('')}</div>
    <div class="yzu-box">${cbar(rows.map(r => ({ t: `${short(r.k)}: ${r[k]}`, a: 0, b: r[k], ha: 0, hb: r[k] / mx * 100 })).map(c => ({ ...c, a: 0 })), many).replace(/<em>0<\/em>/g, '')}
      <div class="yzu-cdays" style="gap:${many ? 2 : 8}px">${rows.map((r, i) => `<span>${!many || i % 5 === 0 ? short(r.k) : ''}</span>`).join('')}</div></div>
    <div class="yzu-box yzu-tw"><table><tr><th>יום</th>${Object.values(M).map(l => `<th class="n">${l}</th>`).join('')}</tr>
      ${rows.slice().reverse().map(r => `<tr><td>${short(r.k)}</td><td class="n">${f(r.act)}</td><td class="n">${f(r.dl)}</td><td class="n">${f(r.reg)}</td><td class="n">${f(r.ap)}</td></tr>`).join('')}
      <tr class="tot"><td>סה"כ</td><td class="n">–</td><td class="n">${f(rows.reduce((s, r) => s + r.dl, 0))}</td><td class="n">${f(rows.reduce((s, r) => s + r.reg, 0))}</td><td class="n">${f(rows.reduce((s, r) => s + r.ap, 0))}</td></tr></table></div>`;
  },
  land: p => {
    const l = landSum(p), mx = Math.max(1, ...l.perDay.map(x => x[1])), many = l.perDay.length > 21;
    const src = Object.entries(l.src).sort((a, b) => b[1] - a[1]);
    return `<h2>דף הנחיתה – yellowzone.co.il – ${rangeLabel([p.a, p.b])}</h2>
    <p class="yzu-def">מי שנכנס לכתובת מדפדפן מגיע לדף הנחיתה. מי שפותח את האפליקציה מגיע למסך הפתיחה שלה – שני דפים שונים.</p>
    <div class="yzu-kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="kp hl"><small>ביקורים</small><b>${f(l.sessions)}</b><div class="dt">מובייל ${f(l.mobile)} · מחשב ${f(l.desktop)} (צפיות)</div></div>
      <div class="kp hl"><small>לחצו על חנות</small><b>${f(l.clickSessions)}</b><div class="dt">${pc(l.clickSessions, l.sessions)} מהביקורים</div></div>
      <div class="kp"><small>App Store / Google Play</small><b>${f(l.ios)} / ${f(l.android)}</b><div class="dt">לחיצות</div></div>
      <div class="kp"><small>הגיעו עם סימון מקור</small><b>${f(src.filter(([k]) => k !== 'direct').reduce((s, [, n]) => s + n, 0))}</b><div class="dt">${src.filter(([k]) => k !== 'direct').map(([k, n]) => `${esc(k)} ${n}`).join(' · ') || 'אין'}</div></div></div>
    <div class="yzu-box"><h3>ביקורים ולחיצות על חנות – לפי יום</h3>
      ${cbar(l.perDay.map(([k, v, c]) => ({ t: `${short(k)}: ${v} ביקורים, ${c} לחצו`, a: v - c, b: c, ha: (v - c) / mx * 100, hb: c / mx * 100 })), many)}
      <div class="yzu-cdays" style="gap:${many ? 2 : 8}px">${l.perDay.map(([k], i) => `<span>${!many || i % 5 === 0 ? short(k) : ''}</span>`).join('')}</div>
      <div class="yzu-legend"><span style="--c:var(--yzu-acc)">ביקרו ולא לחצו</span><span style="--c:var(--yzu-blue)">לחצו על חנות</span></div></div>
    ${(() => { const ORD = ['how', 'preview', 'biz', 'final'], NM = { how: 'איך זה עובד', preview: 'תצוגת העסקים', biz: 'העסקים', final: 'סוף הדף' };
      const dp = Object.entries(l.depth).sort((x, y) => (ORD.indexOf(x[0]) + 1 || 99) - (ORD.indexOf(y[0]) + 1 || 99)).map(([k, v]) => [NM[k] || k, v]);   // §708 – גלילה בדף הנחיתה
      return dp.length ? `<div class="yzu-box"><h3>עד לאן גוללים בדף הנחיתה</h3>${dp.map(([k, v]) => hb(esc(k), v, Math.max(1, l.sessions, ...dp.map(x => x[1])), 'acc')).join('')}<p class="yzu-note">מתוך ${f(l.sessions)} ביקורים. כל נקודה נספרת פעם אחת לביקור, כשהיא מופיעה על המסך.${l.depthDays < l.perDay.length ? ' ⚠️ נמדד רק בחלק מהתקופה (מ-§707).' : ''}</p></div>`
        : '<div class="yzu-how">עד לאן גוללים בדף הנחיתה – המדידה נוספה ב-§707; בתקופה שנבחרה עוד אין נתונים.</div>'; })()}`;
  },
  more: () => `<h2>עוד במסך – הכרטיסים הקודמים</h2>
    <p class="yzu-def">הכרטיסים שלא עברו עדיין לתצוגה החדשה, באותו מקור כמו קודם: מאיפה הגיעו לקישור, מאיפה הגיעו לדף הבית, כניסות שנכשלו, ההורדות בתקופה, נרשמים בתקופה, והורדות לפי מקור מהחנויות.</p>
    <div class="yzu-box">⚠️ פתיחת המסך הקודם טוענת הרבה אירועים (עשרות אלפי קריאות) – לפתוח רק כשצריך.<div style="margin-top:10px"><button class="yzu-btn on" onclick="yzuOpenOld()">פתיחת הכרטיסים הקודמים ↗</button></div></div>`,
};

// ── תצוגת טבלה: כל נתוני הלשונית בטבלה אחת, מחולקת לפי הריבועים ──────────────────────────────
function tableView(p) {
  const x = base(), r = statuses(), d = drop(p), rs = retStats(), pu = pushStats(), u = useSum(p), l = landSum(p), tr = trendRows(p);
  const ap = x.fans.filter(m => m.status === 'approved'), st = by(x.fans, m => m.status || 'pending');
  // אותה הגדרה של תמונת המצב: חדש – נכנס לדף הבית אחרי האישור; ותיק – פתח את האפליקציה
  const entered = m => x.isVet(m) ? x.appMem.has(m.id) : !!x.memDays[m.id];
  const devs = Object.keys(x.devDays), dc = by(devs, x.devClass), biz = C.biz() || [], bst = by(biz, b => b.status || 'pending');
  const secs = [
    ['תמונת מצב – חברים (מאז פתיחת האתר)', [['נרשמו אי-פעם', x.fans.length], ['מאושרים', st.approved || 0], ['ממתינים', st.pending || 0], ['נדחו', st.rejected || 0], ['מאושרים שנכנסו לאפליקציה', ap.filter(entered).length], ['מאושרים שעוד לא', ap.filter(m => !entered(m)).length], ['ותיקים מאושרים', ap.filter(x.isVet).length]]],
    ['תמונת מצב – הורדות (מ-11.10)', [['טלפונים שפתחו את האפליקציה', devs.length], ['נשלחה מהם הרשמה', dc.sub || 0], ['נכנסו לחשבון קיים', dc.login || 0], ['לא נרשמו ולא נכנסו', dc.none || 0]]],
    ['תמונת מצב – עסקים', [['עסקים', biz.length], ['מאושרים', bst.approved || 0], ['ממתינים', bst.pending || 0]]],
    [`מה קרה – ${rangeLabel([p.a, p.b])}`, [['הורדות', p.dl], ['הרשמות', p.reg], ['אושרו', p.ap], ['נדחו', p.rej], ['נכנסו בפעם הראשונה', p.first], ['חזרו', p.ret], ['מכשירים פעילים', p.act],
      ['מההורדות – נרשמו', p.dReg], ['מההורדות – נכנסו לחשבון קיים', p.dLog], ['מההורדות – עוד לא נרשמו', p.dNone],
      ['מהנרשמים – הורידו באותו יום', p.dlw[0]], ['מהנרשמים – הורידו יום לפני', p.dlw[1]], ['מהנרשמים – הורידו 2–3 ימים לפני', p.dlw[2]], ['מהנרשמים – הורידו 4+ ימים לפני', p.dlw[3]], ['מהנרשמים – לא ידוע', p.dlw[4]],
      ['מהנרשמים – אושרו', p.rAp], ['מהנרשמים – כבר נכנסו', p.rEnt], ['מהנרשמים – ממתינים', p.rPend], ['מהנרשמים – נדחו', p.rRej]]],
    [`איפה נושרים – טופס אוהד (${rangeLabel([p.a, p.b])})`, [['פתחו', d.fan.opened], ['שלחו', d.fan.sub], ['עצרו', d.fan.stop], ...FAN_STEPS.map(k => [`עצרו – ${STEP_HE[k]}`, d.fan.at[k] || 0])]],
    [`איפה נושרים – טופס עסק (${rangeLabel([p.a, p.b])})`, [['פתחו', d.biz.opened], ['שלחו', d.biz.sub], ['עצרו', d.biz.stop], ...BIZ_STEPS.map(k => [`עצרו – ${STEP_HE[k]}`, d.biz.at[k] || 0])]],
    ['איפה כל אחד עומד (נרשמו מההשקה)', r.rows.map(x2 => [x2.l, x2.n])],
    [`חזרות (${S.rq.mode === 'mem' ? 'חברים' : 'מכשירים'}, ${short(rs.a)}–${short(rs.b)})`, [['פעילים בטווח', rs.act], ['חוזרים', rs.back], ['חדשים בטווח', rs.newIn], ['מהחדשים חזרו ביום נוסף', rs.nb], ['ממוצע פעילים ביום', Math.round(rs.avg)]]],
    ['התראות', [['נכנסו מ-20.10', pu.ent], ['מחוברים להתראות', pu.on], ['בלי התראות', pu.ent - pu.on]]],
    [`כמה זמן נשארים (${rangeLabel([p.a, p.b])})`, ['פחות מ-30 שנ׳', '30 שנ׳–2 דק׳', '2–5 דק׳', '5–15 דק׳', '15–30 דק׳', 'מעל 30 דק׳'].map((lb, i) => [`בפנים: ${lb}`, u.in[i]]).concat(['פחות מ-30 שנ׳', '30 שנ׳–2 דק׳', '2–5 דק׳'].map((lb, i) => [`בהרשמה/כניסה: ${lb}`, u.out[i]]))],
    [`דף הנחיתה (${rangeLabel([p.a, p.b])})`, [['ביקורים', l.sessions], ['לחצו על חנות', l.clickSessions], ['לחיצות App Store', l.ios], ['לחיצות Google Play', l.android]]],
  ];
  return `<div class="yzu-box yzu-tw"><table class="yzu-big"><tr><th>נתון</th><th class="n">כמה</th></tr>
    ${secs.map(([t, rows]) => `<tr class="sec"><td colspan="2">${t}</td></tr>` + rows.map(([lb, n]) => `<tr><td>${lb}</td><td class="n">${f(n)}</td></tr>`).join('')).join('')}
    <tr class="sec"><td colspan="2">לאורך זמן – לפי יום (הורדות / הרשמות / אושרו / פעילים)</td></tr>
    ${tr.slice().reverse().map(rw => `<tr><td>${short(rw.k)}</td><td class="n">${f(rw.dl)} / ${f(rw.reg)} / ${f(rw.ap)} / ${f(rw.act)}</td></tr>`).join('')}</table></div>`;
}

// ── פעולות ─────────────────────────────────────────────────────────────────────────────────
window.yzuSet = (k, v) => {
  if (k === 'table') S.table = !S.table;
  else if (k === 'per') { S.per = v; if (v === 'custom' && !S.from) { S.from = LAUNCH; S.to = D.today; } }
  else S[k] = v;
  C.rerender();
};
window.yzuRq = (a, b) => { S.rq.from = a; S.rq.to = b; C.rerender(); };
window.yzuRqSet = (k, v) => { S.rq[k] = v; if (k === 'mode') S.rq.grp = 'all'; if (S.rq.from > S.rq.to) [S.rq.from, S.rq.to] = [S.rq.to, S.rq.from]; C.rerender(); };
window.yzuReload = () => { X = null; load(true); C.rerender(); };
window.yzuOpenOld = () => C.openOld();

function css() {
  return `<style>
  .yzu{--yzu-ink:#0A2A66;--yzu-muted:#5B6B8C;--yzu-line:#E7E7E0;--yzu-acc:#FFD400;--yzu-acc-soft:#FFF7DB;--yzu-acc-line:#FFE9A3;--yzu-ok:#1B8A4B;--yzu-ok-soft:#E7F6EC;--yzu-bad:#B42318;--yzu-gray:#EEF0F5;--yzu-blue:#3E63B8;color:var(--yzu-ink);font-size:14px}
  .yzu table{width:100%;border-collapse:collapse;font-size:13px}.yzu th,.yzu td{text-align:right;padding:6px 8px;border-top:1px solid var(--yzu-line);vertical-align:top}.yzu th{color:var(--yzu-muted);font-weight:600;font-size:12px;border-top:0}.yzu .n{text-align:left;font-variant-numeric:tabular-nums}.yzu tr.tot td{font-weight:700;background:var(--yzu-gray)}.yzu .muted{color:var(--yzu-muted);font-size:12.5px}
  .yzu-inf{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--yzu-gray);color:var(--yzu-muted);font-size:11px;font-weight:800;font-style:normal;cursor:help;position:relative;vertical-align:1px;margin-inline-start:5px}
  .yzu-inf:hover,.yzu-inf:focus{background:var(--yzu-ink);color:#fff;outline:none}.yzu-tt{display:none;position:absolute;top:20px;inset-inline-end:-8px;width:250px;background:var(--yzu-ink);color:#fff;font-size:12px;font-weight:400;line-height:1.55;padding:8px 10px;border-radius:9px;z-index:20;text-align:right;white-space:normal}.yzu-inf:hover .yzu-tt,.yzu-inf:focus .yzu-tt{display:block}
  .yzu-ov{display:grid;grid-template-columns:1.15fr 1fr .85fr;gap:10px;margin-bottom:12px}@media(max-width:1100px){.yzu-ov{grid-template-columns:1fr}}
  .yzu-ovb,.yzu-day,.yzu-det{background:#fff;border:1px solid var(--yzu-line);border-radius:14px;padding:12px 14px}.yzu-ovb h3{margin:0 0 8px;font-size:14px;display:flex;justify-content:space-between;align-items:center}.yzu-ovb h3 b{font-size:22px}
  .yzu-ovs{display:flex;height:10px;border-radius:6px;overflow:hidden;margin-bottom:8px;background:var(--yzu-gray)}.yzu-ovr{display:flex;gap:12px;flex-wrap:wrap;font-size:12.8px;color:var(--yzu-muted)}.yzu-ovr b{color:var(--yzu-ink);font-size:14px}.yzu-ovr span::before,.yzu-legend span::before{content:'';display:inline-block;width:9px;height:9px;border-radius:3px;margin-inline-end:5px;background:var(--c)}
  .yzu-ovn{font-size:12.5px;color:var(--yzu-muted);margin-top:8px;line-height:1.6;border-top:1px dashed var(--yzu-line);padding-top:7px}.yzu-ovn .eq{display:block;background:var(--yzu-gray);border-radius:8px;padding:6px 9px;margin:4px 0;color:var(--yzu-ink);font-size:13px}.yzu-ovn ul{margin:4px 0 0;padding-inline-start:18px}
  .yzu-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 10px}.yzu-pbar,.yzu-chips,.yzu-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.yzu-chips{margin-bottom:10px}
  .yzu-pbar button,.yzu-chips button,.yzu-btn{font:inherit;font-size:13px;border:1px solid var(--yzu-line);background:#fff;border-radius:999px;padding:5px 12px;cursor:pointer;color:var(--yzu-ink)}.yzu-pbar button.on,.yzu-chips button.on,.yzu-btn.on{background:var(--yzu-ink);color:#fff;border-color:var(--yzu-ink)}
  .yzu input[type=date]{font:inherit;font-size:13px;padding:4px 7px;border-radius:9px;border:1px solid var(--yzu-line);background:#fff;color:var(--yzu-ink);color-scheme:light}
  .yzu-note{font-size:12.5px;color:var(--yzu-muted);line-height:1.6;margin:6px 0 0}.yzu-def{margin:0 0 12px;color:var(--yzu-muted);font-size:13.5px;line-height:1.6}
  .yzu-day{margin-bottom:12px}.yzu-day h2,.yzu-det h2{margin:0 0 10px;font-size:17px}
  .yzu-kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:10px}@media(max-width:1100px){.yzu-kpis{grid-template-columns:repeat(4,1fr)!important}}@media(max-width:600px){.yzu-kpis{grid-template-columns:repeat(2,1fr)!important}}
  .yzu .kp{border:1px solid var(--yzu-line);border-radius:12px;padding:9px 11px;background:#FCFCFA}.yzu .kp small{display:block;font-size:12px;color:var(--yzu-muted)}.yzu .kp b{display:block;font-size:22px;font-weight:800;margin:2px 0}.yzu .kp .dt{font-size:11.5px;color:var(--yzu-muted)}.yzu .kp .dt.up{color:var(--yzu-ok)}.yzu .kp .dt.down{color:var(--yzu-bad)}.yzu .kp.hl{border-color:var(--yzu-acc-line);background:var(--yzu-acc-soft)}
  .yzu-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:900px){.yzu-cols{grid-template-columns:1fr}}
  .yzu-box{border:1px solid var(--yzu-line);border-radius:12px;padding:12px;background:#FCFCFA;min-width:0;margin-bottom:12px}.yzu-box h3{font-size:14px;margin:0 0 10px}.yzu-tw{overflow-x:auto}
  .yzu .flow{font-size:13px;line-height:1.9}.yzu .flow.sep{border-top:1px dashed var(--yzu-line);margin-top:6px;padding-top:6px}.yzu .g{color:var(--yzu-ok);font-weight:700}.yzu .y{color:#8A6A00;font-weight:700}.yzu .r,.yzu .d{color:var(--yzu-bad);font-weight:700}.yzu .w{color:#8A6A00;font-weight:700}
  .yzu-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:12px}
  .yzu-tile{background:#fff;border:2px solid var(--yzu-line);border-radius:14px;padding:10px 12px;cursor:pointer;text-align:right;font:inherit;color:inherit}.yzu-tile.on{border-color:var(--yzu-ink);box-shadow:0 2px 8px rgba(10,42,102,.12)}
  .yzu-tile .nm{font-size:13px;font-weight:700;display:flex;justify-content:space-between;gap:6px}.yzu-tile .nm i{font-style:normal;font-size:11px;font-weight:600;color:var(--yzu-muted);background:var(--yzu-gray);border-radius:6px;padding:0 5px;white-space:nowrap}.yzu-tile .nm .yzu-inf{margin-inline-start:4px;background:var(--yzu-gray);padding:0}
  .yzu-tile .big{font-size:22px;font-weight:800;margin:6px 0 2px}.yzu-tile .big small{font-size:12px;color:var(--yzu-muted);font-weight:500}.yzu-tile .pct{font-size:12px;color:var(--yzu-muted);line-height:1.5}
  .yzu-hb{display:grid;grid-template-columns:170px 1fr 54px;gap:8px;align-items:center;font-size:13px;margin-bottom:6px}.yzu-tr{height:15px;background:var(--yzu-gray);border-radius:4px;overflow:hidden}.yzu-tr i{display:block;height:100%;background:var(--yzu-blue);border-radius:4px}.yzu-tr i.hot{background:var(--yzu-bad)}.yzu-tr i.ok{background:var(--yzu-ok)}.yzu-tr i.acc{background:var(--yzu-acc)}.yzu-hb b{text-align:left}
  .yzu-fun{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}.yzu-fs{display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:center;border:1px solid var(--yzu-line);border-radius:12px;padding:10px 12px;background:#FCFCFA}.yzu-fs .lbl{font-size:13px;color:var(--yzu-muted)}.yzu-fs .lbl b{display:block;font-size:22px;color:var(--yzu-ink);font-weight:800}.yzu-fs .u{font-size:11px;background:var(--yzu-gray);border-radius:6px;padding:0 5px;margin-inline-start:4px}
  .yzu-fs .bar{height:12px;background:var(--yzu-gray);border-radius:6px;overflow:hidden}.yzu-fs .bar i{display:block;height:100%;background:var(--yzu-acc)}.yzu-fs .gap{font-size:12.5px;color:var(--yzu-muted);margin-top:6px;line-height:1.6}
  .yzu-how{background:var(--yzu-acc-soft);border:1px solid var(--yzu-acc-line);border-radius:10px;padding:8px 10px;font-size:12.8px;line-height:1.6}
  .yzu-cbar{display:flex;align-items:flex-end;height:160px;padding:20px 4px 0;border-bottom:1px solid var(--yzu-line)}.yzu-cbar .c{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative}.yzu-cbar .c i{display:block}.yzu-cbar .c i.f{background:var(--yzu-acc)}.yzu-cbar .c i.r{background:var(--yzu-blue)}.yzu-cbar .c em{position:absolute;top:-18px;left:0;right:0;text-align:center;font-style:normal;font-size:11px;color:var(--yzu-muted)}
  .yzu-cdays{display:flex;padding:4px 4px 0}.yzu-cdays span{flex:1;text-align:center;font-size:11px;color:var(--yzu-muted)}.yzu-legend{display:flex;gap:14px;font-size:12.5px;color:var(--yzu-muted);margin-top:8px}
  .yzu .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-inline-end:6px}
  .yzu-big tr.sec td{background:var(--yzu-ink);color:#fff;font-weight:700}
  </style>`;
}

// ── שיתוף עם לשונית "מעקבים" (admin-trackers.js) – אותם נתונים טעונים, בלי קריאות נוספות ──────────
export const shared = {
  get C() { return C; }, get D() { return D; }, base: () => base(),
  dk, addDays, dayList, dayDiff, short, f, pc, W, inf, hb, esc, css, LAUNCH, MEASURE_FROM,
};
