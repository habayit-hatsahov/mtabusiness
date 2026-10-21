// ══ §587 — סיכום יומי של פאנל הפלטפורמה ומשפכי ההרשמה ══════════════════════════════════════
// מקור-אמת **אחד** לחישוב, משותף לוורקר (כותב `platformDaily/{YYYY-MM-DD}` לכל יום שהסתיים)
// ולמרכז הניהול (מחשב את היום הנוכחי מהאירועים החיים, באותה פונקציה בדיוק).
//
// למה: הפאנל טען את 10,000 האירועים האחרונים מכל הסוגים. מאז 20.10 זה ~3 ימים בלבד ו-27 שנ'
// טעינה – כלומר "30 יום" על המסך היה שקר. 30 יום גולמיים הם ~75,000 אירועים, ואת זה אי אפשר
// לטעון בכל פתיחה. סיכום יומי = 30 מסמכים קטנים + האירועים של היום.
//
// ⚠️ **ספירות "ייחודיות" (מבקרים, סשנים במשפך) הן סכום יומי**: סשן שחצה חצות נספר פעמיים.
// זה נדיר (sessionId מת עם הטאב) ונאמר על המסך.
// ⚠️ שינוי בהגדרה כאן חל רק על ימים שיחושבו מעכשיו. ימים קיימים נשארים כפי שחושבו –
// להעלות את PLATFORM_AGG_VERSION ולהריץ מחדש את scratch_platform_daily_backfill.mjs.
export const PLATFORM_AGG_VERSION = 2;   // 2 — סופר רק את AGG_TYPES (גם ב"N אירועים" ובאירועי-מנהלים)

// הסוגים היחידים שמונה כלשהו כאן קורא. מרכז הניהול טוען את היום החי רק בהם (~70% מהאירועים),
// ולכן גם הימים השמורים סופרים רק אותם – אחרת "N אירועים" של היום ושל אתמול לא היו באותה יחידה.
export const AGG_TYPES = ['pageView', 'scrollDepth', 'formOpen', 'formStep', 'formSubmit', 'loginOk', 'loginFail'];

// ── יום-לוח ישראלי ────────────────────────────────────────────────────────────────────────
// הפאנל תמיד ספר ימים לפי השעון של המנהל (ישראל). הוורקר רץ ב-UTC, ולכן הגבולות מחושבים
// במפורש לפי Asia/Jerusalem (כולל מעבר שעון קיץ/חורף).
const TZ = 'Asia/Jerusalem';
export function ilDayKey(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p;   // en-CA = YYYY-MM-DD
}
function ilOffsetMinutes(utcMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}
// [start, end) ב-UTC של יום-לוח ישראלי
export function ilDayRange(key) {
  const [y, m, d] = key.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const start = guess - ilOffsetMinutes(guess - 3 * 3600e3) * 60000;
  const g2 = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  const end = g2 - ilOffsetMinutes(g2 - 3 * 3600e3) * 60000;
  return [new Date(start), new Date(end)];
}
export function ilDayKeysBack(n, now = new Date()) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ilDayKey(new Date(now.getTime() - i * 864e5)));
  return [...new Set(out)];
}

// ── המשפכים (אותם מפתחות של FAN_FUNNEL/BIZ_FUNNEL במרכז הניהול) ─────────────────────────────
export const FUNNEL_DEFS = {
  fan: { openBlocks: ['fanRegister', 'joinModal'], block: 'fanRegister',
         steps: ['opened', 'identity', 'subscriber', 'route', 'proof', 'submitted'], optional: ['proof'] },
  biz: { openBlocks: ['bizForm'], block: 'bizForm',
         steps: ['opened', 'start', 'step2', 'step3', 'step4', 'step5', 'submitted'], optional: [] },
};
// אותו היגיון של funnelStats (§304/§324): סשן ששלח נספר גם בשלבי-החובה שלפניו.
function funnelDay(evs, def) {
  const S = {}; def.steps.forEach(k => S[k] = new Set());
  for (const e of evs) {
    if (!e.sessionId) continue;
    if (e.type === 'formOpen' && def.openBlocks.includes(e.blockId)) S.opened.add(e.sessionId);
    if (e.type === 'formSubmit' && e.blockId === def.block) S.submitted.add(e.sessionId);
    if (e.type === 'formStep' && e.blockId === def.block && S[e.channel]) S[e.channel].add(e.sessionId);
  }
  const chain = def.steps.filter(k => !def.optional.includes(k));
  for (let i = chain.length - 1; i > 0; i--) for (const id of S[chain[i]]) S[chain[i - 1]].add(id);
  return Object.fromEntries(def.steps.map(k => [k, S[k].size]));
}

// אותו היגיון של computePlatformStats (§281/§326), עם מספרים במקום Set-ים.
function statsDay(evs, adminIds, includeAdmins) {
  const a = {
    landing: 0, home: 0, landingSessions: 0, homeSessions: 0,
    fanOpen: 0, fanSubmit: 0, bizOpen: 0, bizSubmit: 0, loginOpen: 0,
    device: { mobile: 0, desktop: 0 }, sources: {}, direct: 0, adminHidden: 0, inRange: 0,
    depth: { regCard: 0, preview: 0, final: 0 },
  };
  const ls = new Set(), hs = new Set(), depth = { regCard: new Set(), preview: new Set(), final: new Set() };
  for (const e of evs) {
    const isAdminEvent = e.memberId && adminIds.has(e.memberId);
    if (isAdminEvent) { a.adminHidden++; if (!includeAdmins) continue; }
    a.inRange++;
    const path = String(e.path || '').toLowerCase();
    const isLanding = path.includes('welcome') || path.includes('landing') || path.includes('index') || path === '/' || path === '';
    const isHome = path.includes('home');
    if (e.type === 'pageView') {
      if (!isLanding && !isHome) continue;
      if (e.device === 'mobile' || e.device === 'desktop') a.device[e.device]++;
      // ⚠️ מפתח של map ב-Firestore לא יכול להכיל '/' או להיות ריק; referrer הוא מארח בלבד (§281)
      if (e.referrer) { const k = String(e.referrer).replace(/[\/`]/g, '_'); a.sources[k] = (a.sources[k] || 0) + 1; } else a.direct++;
      if (isLanding) { a.landing++; if (e.sessionId) ls.add(e.sessionId); }
      else { a.home++; if (e.sessionId) hs.add(e.sessionId); }
    } else if (e.type === 'scrollDepth') {
      if (e.sessionId && depth[e.blockId]) depth[e.blockId].add(e.sessionId);
    } else if (e.type === 'formOpen') {
      if (e.blockId === 'joinModal' || e.blockId === 'fanRegister') a.fanOpen++;
      else if (e.blockId === 'bizForm') a.bizOpen++;
      else if (e.blockId === 'loginModal') a.loginOpen++;
    } else if (e.type === 'formSubmit') {
      if (e.blockId === 'bizForm') a.bizSubmit++; else a.fanSubmit++;
    }
  }
  a.landingSessions = ls.size; a.homeSessions = hs.size;
  for (const k of Object.keys(depth)) a.depth[k] = depth[k].size;
  return a;
}

export function aggregatePlatformDay(evsIn, adminIds) {
  const evs = (evsIn || []).filter(e => AGG_TYPES.includes(e.type));
  const admins = adminIds instanceof Set ? adminIds : new Set(adminIds || []);
  // regAbandonStats
  const opened = new Set(), submitted = new Set();
  // googleSignupButtonStats('fanRegister')
  const gs = { shown: new Set(), used: new Set(), blocked: new Set() };
  const loginOk = { google: 0, googleLink: 0, code: 0, total: 0 };
  let googleFail = 0;
  const firstStep = {};
  for (const e of evs) {
    if (e.sessionId) {
      if (e.type === 'formOpen' && (e.blockId === 'fanRegister' || e.blockId === 'joinModal')) opened.add(e.sessionId);
      if (e.type === 'formSubmit' && e.blockId === 'fanRegister') submitted.add(e.sessionId);
      if (e.type === 'formStep' && e.blockId === 'fanRegister') {
        if (e.channel === 'gsShown') gs.shown.add(e.sessionId);
        else if (e.channel === 'gsUsed') gs.used.add(e.sessionId);
        else if (e.channel === 'gsBlocked') gs.blocked.add(e.sessionId);
      }
    }
    if (e.type === 'formStep' && e.at) {
      const t = e.at instanceof Date ? e.at.getTime() : new Date(e.at).getTime();
      if (!firstStep[e.blockId] || t < firstStep[e.blockId]) firstStep[e.blockId] = t;
    }
    if (e.type === 'loginOk') {
      loginOk.total++;
      const c = String(e.channel || '');
      if (c === 'google') loginOk.google++;
      else if (c === 'googleLink') loginOk.googleLink++;
      else if (c === 'code') loginOk.code++;
    }
    if (e.type === 'loginFail' && String(e.channel || '').startsWith('google:')) googleFail++;
  }
  for (const id of gs.shown) gs.blocked.delete(id);
  return {
    v: PLATFORM_AGG_VERSION,
    events: evs.length,
    all: statsDay(evs, admins, true),
    noAdmin: statsDay(evs, admins, false),
    funnel: { fan: funnelDay(evs, FUNNEL_DEFS.fan), biz: funnelDay(evs, FUNNEL_DEFS.biz) },
    abandon: { opened: opened.size, abandoned: [...opened].filter(s => !submitted.has(s)).length },
    gsFan: { shown: gs.shown.size, used: gs.used.size, blocked: gs.blocked.size },
    loginOk, googleFail,
    // מתי נרשם לראשונה formStep לכל טופס באותו יום (stepMeasureNote)
    firstStep: { fanRegister: firstStep.fanRegister || 0, bizForm: firstStep.bizForm || 0 },
  };
}

// ── איחוד ימים לטווח ──────────────────────────────────────────────────────────────────────
const addNum = (t, s) => { for (const [k, v] of Object.entries(s || {})) {
  if (typeof v === 'number') t[k] = (t[k] || 0) + v;
  else if (v && typeof v === 'object') addNum(t[k] || (t[k] = {}), v);
} };
export function mergePlatformDays(days) {
  const out = { events: 0, all: {}, noAdmin: {}, funnel: { fan: {}, biz: {} }, abandon: {}, gsFan: {}, loginOk: {}, googleFail: 0, firstStep: {} };
  for (const d of days) {
    if (!d) continue;
    out.events += d.events || 0;
    out.googleFail += d.googleFail || 0;
    addNum(out.all, d.all); addNum(out.noAdmin, d.noAdmin);
    addNum(out.funnel.fan, d.funnel && d.funnel.fan); addNum(out.funnel.biz, d.funnel && d.funnel.biz);
    addNum(out.abandon, d.abandon); addNum(out.gsFan, d.gsFan); addNum(out.loginOk, d.loginOk);
    for (const [k, t] of Object.entries(d.firstStep || {})) if (t && (!out.firstStep[k] || t < out.firstStep[k])) out.firstStep[k] = t;
  }
  return out;
}
