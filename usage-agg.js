// ══ §699 — usageDaily: סיכום יומי ל"אפליקציה ושימוש" במרכז הנתונים ══════════════════════════════
// מקור-אמת **אחד** לחישוב, משותף לוורקר (כותב `usageDaily/{YYYY-MM-DD}` לכל יום שהסתיים, באותה
// ריצה ובאותם אירועים של platformDaily – בלי קריאות נוספות) ולמרכז הניהול (מחשב את היום הנוכחי
// מהאירועים החיים, באותה פונקציה בדיוק).
//
// למה: המסך הישן טען ~52,000 אירועים בכל פתיחה (זה היה החשוד העיקרי לפרצי הקריאות ב-28–29.10).
// כאן נשמרות **רשימות מזהים** ולא רק ספירות, כי השאלות חוצות ימים: "הורדה" ביום אחד והרשמה
// ביום אחר, חזרה ביום אחר, טלפון שמתחבר לחבר שנרשם קודם. מזהה מכשיר = blockId של visit/engaged.
// גודל: ביום ההשקה ~2,600 מכשירים פעילים ≈ 50KB – רחוק מתקרת המסמך (1MB).
//
// ⚠️ שינוי בהגדרה חל רק על ימים שיחושבו מעכשיו – להעלות את USAGE_AGG_VERSION ולהריץ את
// scratch_usage_daily_backfill.mjs.
export const USAGE_AGG_VERSION = 1;
export const USAGE_TYPES = ['visit', 'engaged', 'formOpen', 'formStep', 'formSubmit', 'loginOk', 'pageView', 'landingBlockClick'];

// הסדר בטופס – "הכי רחוק" לכל מכשיר. אוהד: מסך הפתיחה של הטופס → … → לחצו שליחה.
export const FAN_STEPS = ['open', 'identity', 'birth', 'subscriber', 'route', 'proof', 'submitTry'];
export const BIZ_STEPS = ['open', 'start', 'step2', 'step3', 'step4', 'step5', 'submitTry'];
const MILES = ['30s', '2m', '5m', '15m', '30m'];

export function aggregateUsageDay(evsIn, adminIds) {
  const admins = adminIds instanceof Set ? adminIds : new Set(adminIds || []);
  const evs = (evsIn || []).filter(e => USAGE_TYPES.includes(e.type));
  // מכשירים של מנהלים (באותו יום) – נזרקים מכל הספירות, כמו בשאר המסכים
  const sessDev = {}, adminDev = new Set();
  for (const e of evs) {
    if ((e.type === 'visit' || e.type === 'engaged') && e.sessionId && e.blockId) sessDev[e.sessionId] = e.blockId;
    if (e.memberId && admins.has(e.memberId) && (e.type === 'visit' || e.type === 'engaged') && e.blockId) adminDev.add(e.blockId);
  }
  const devOf = e => (e.type === 'visit' || e.type === 'engaged') ? e.blockId : sessDev[e.sessionId] || '';
  const appFirst = new Set(), appActive = new Set(), memActive = new Set(), submitDevs = new Set(), loginDevs = new Set();
  // נכנס = הגיע לדף הבית. רק חבר מאושר מגיע אליו – ממתין רואה את מסך ההמתנה – ולכן ימים כאלה הם ימי שימוש אמיתיים
  const memHome = new Set(), homeDevs = new Set();
  const firstOs = { ios: 0, android: 0, other: 0 };
  const devMem = {}, submits = {}, far = {};
  const sess = {};   // sessionId → { app, inApp, max } – לזמן בביקור
  const land = { views: 0, sessions: 0, mobile: 0, desktop: 0, src: {}, clicks: 0, clickSessions: 0, ios: 0, android: 0 };
  const lSess = new Set(), lClick = new Set();
  // אוהד גובר על עסק: מכשיר שפתח את שני הטפסים נמדד בטופס האוהד
  const bump = (dev, kind, step) => {
    const cur = far[dev];
    if (cur && cur[0] === 'f' && kind === 'b') return;
    if (!cur || cur[0] !== kind) { far[dev] = kind + ':' + step; return; }
    const order = kind === 'f' ? FAN_STEPS : BIZ_STEPS;
    if (order.indexOf(step) > order.indexOf(cur.slice(2))) far[dev] = kind + ':' + step;
  };
  for (const e of evs) {
    if (e.memberId && admins.has(e.memberId)) continue;
    const dev = devOf(e);
    if (dev && adminDev.has(dev)) continue;
    const ch = String(e.channel || '');
    if (e.type === 'visit' || e.type === 'engaged') {
      const surf = ch.split(':')[0];
      if (surf === 'app' && dev) {
        appActive.add(dev);
        if (e.type === 'visit' && ch.endsWith(':first')) { appFirst.add(dev); const os = ch.split(':')[1]; firstOs[os === 'ios' || os === 'android' ? os : 'other']++; }
        if (e.memberId) devMem[dev] = e.memberId;
      }
      if (e.memberId) memActive.add(e.memberId);
      if (e.path === '/home.html') { if (e.memberId) memHome.add(e.memberId); if (dev) homeDevs.add(dev); }
      if (e.sessionId) {
        const s = sess[e.sessionId] || (sess[e.sessionId] = { app: false, inApp: false, max: -1 });
        if (surf === 'app') s.app = true;
        if (e.memberId || e.path === '/home.html') s.inApp = true;
        if (e.type === 'engaged') { const i = MILES.indexOf(ch.split(':')[1]); if (i > s.max) s.max = i; }
      }
    } else if (e.type === 'formOpen') {
      if (!dev) continue;
      if (e.blockId === 'joinModal' || e.blockId === 'fanRegister') bump(dev, 'f', 'open');
      else if (e.blockId === 'bizForm') bump(dev, 'b', 'open');
    } else if (e.type === 'formStep') {
      if (!dev) continue;
      const st = ch.split(':')[0];
      if (e.blockId === 'fanRegister' && FAN_STEPS.includes(st)) bump(dev, 'f', st);
      else if (e.blockId === 'bizForm' && BIZ_STEPS.includes(st)) bump(dev, 'b', st);
    } else if (e.type === 'formSubmit') {
      if (dev) submitDevs.add(dev);
      if (e.memberId) submits[e.memberId] = dev || '';
    } else if (e.type === 'loginOk') {
      if (dev) { loginDevs.add(dev); if (e.memberId) devMem[dev] = e.memberId; }
      if (e.memberId) memActive.add(e.memberId);
    } else if (e.type === 'pageView' && e.path === '/landing.html') {
      const src = String(e.blockId || '').startsWith('landing:') ? e.blockId.slice(8) : '';
      if (src === 'test') continue;
      land.views++;
      if (e.device === 'mobile') land.mobile++; else if (e.device === 'desktop') land.desktop++;
      const k = (src || 'direct').replace(/[\/`.]/g, '_'); land.src[k] = (land.src[k] || 0) + 1;
      if (e.sessionId) lSess.add(e.sessionId);
    } else if (e.type === 'landingBlockClick' && e.path === '/landing.html') {
      const b = String(e.blockId || '');
      if (!b.startsWith('store:') || b.endsWith(':test')) continue;
      land.clicks++; if (b.startsWith('store:ios')) land.ios++; else if (b.startsWith('store:android')) land.android++;
      if (e.sessionId) lClick.add(e.sessionId);
    }
  }
  land.sessions = lSess.size; land.clickSessions = lClick.size;
  const use = { in: [0, 0, 0, 0, 0, 0], out: [0, 0, 0, 0, 0, 0] };
  for (const s of Object.values(sess)) if (s.app) use[s.inApp ? 'in' : 'out'][s.max + 1]++;
  return {
    v: USAGE_AGG_VERSION,
    appFirst: [...appFirst], firstOs, appActive: [...appActive], memActive: [...memActive], memHome: [...memHome], homeDevs: [...homeDevs],
    devMem, submits, submitDevs: [...submitDevs], loginDevs: [...loginDevs], far, use, land,
  };
}
