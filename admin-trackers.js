// ══ §700 — מרכז הנתונים · לשונית "מעקבים" ═══════════════════════════════════════════════════════
// הדמו המאושר: trackers-demo.html (§640–§640ז). 5 מעקבים: 1 אושרו ולא נכנסו · 2 הורידו ולא נרשמו ·
// 3 בעלי עסק בלי האפליקציה · 4 ותיקים שלא חזרו · 6 עסק ממתין.
//
// **הצילום מחושב מההיסטוריה, לא נשמר:** "בהתחלה" = מי שהיה בקבוצה בתחילת יום הצילום, לפי ימי
// הפעילות שב-usageDaily (§699) ורשומות החברים/העסקים. לכן אפשר לבחור כל יום כיום צילום, והקבוצה
// לא משתנה בדיעבד. "מאז" = מתוכם, מי שיצא מהקבוצה מאז; "נשארו" = מי שעדיין בה.
// אותם נתונים ש"אפליקציה ושימוש" כבר טען (shared מ-admin-usage.js) – בלי קריאות נוספות.
import { shared as U } from './admin-usage.js?v=717';

const S = { snap: '2026-10-28', cur: 1, knows: false, wa: null };
const TRK = [[1, 'אושרו ולא נכנסו', 'חברים'], [2, 'הורידו ולא נרשמו', 'מכשירים'], [3, 'בעלי עסק בלי האפליקציה', 'חברים'], [4, 'ותיקים שלא חזרו', 'חברים'], [6, 'עסק ממתין', 'עסקים']];
const methodOf = m => m.signupMethod === 'apple' ? 'Apple' : m.signupMethod === 'google' ? 'Google' : (m.googleEmail ? 'Google' : 'קוד');
const by = (a, fn) => { const o = {}; a.forEach(x => { const k = fn(x); o[k] = (o[k] || 0) + 1; }); return o; };

// ── ימים לפי חבר / מכשיר – נבנה פעם אחת לכל טעינה ──────────────────────────────────────────────
let H = null, Hkey = '';
function hist() {
  const D = U.D, x = U.base();
  const key = D.loadedAt.getTime() + ':' + x.fans.length;
  if (H && Hkey === key) return H;
  const appDays = {}, devLink = {};
  const add = (o, k, d) => { if (!o[k] || d < o[k]) o[k] = d; };
  for (const k of Object.keys(D.days).sort()) {
    const a = D.days[k] || {};
    Object.entries(a.devMem || {}).forEach(([dev, m]) => { (appDays[m] || (appDays[m] = new Set())).add(k); add(devLink, dev, k); });
    (a.submitDevs || []).forEach(dev => add(devLink, dev, k));
    (a.loginDevs || []).forEach(dev => add(devLink, dev, k));
  }
  H = { appDays, devLink }; Hkey = key;
  return H;
}
const before = (set, day) => !!set && [...set].some(k => k < day);
const onOrAfter = (set, day) => !!set && [...set].some(k => k >= day);

// ── כל מעקב: { start, since, left, ... } ──────────────────────────────────────────────────────
function tracker(id) {
  const x = U.base(), h = hist(), snap = S.snap, L = U.LAUNCH, C = U.C;
  const pushOn = m => { const p = C.pushInfo(m); return !!(p && p.app); };
  const dkOf = d => d ? U.dk(d) : '';
  const fanById = x.byId;
  if (id === 1) {
    const inGroup = m => !x.isVet(m) && m.approvedAt && dkOf(m.approvedAt) >= L && dkOf(m.approvedAt) < snap && !before(x.memDays[m.id], snap);
    const start = x.fans.filter(inGroup);
    const since = start.filter(m => onOrAfter(x.memDays[m.id], snap)), left = start.filter(m => m.status === 'approved' && !x.memDays[m.id]);
    const out = x.fans.filter(m => !x.isVet(m) && m.status === 'approved' && m.approvedAt && dkOf(m.approvedAt) >= snap && !x.memDays[m.id]);
    const age = m => U.dayDiff(dkOf(m.approvedAt), U.D.today);
    const fan = m => !(m.isBusinessOwner || m.linkedBusinessId);   // בעלי עסק – במעקב 3 / 6, ולא מופיעים ברשימת האוהדים של מרכז ההודעות
    return { start, since, left, outside: out, people: true,
      def: 'אוהדים שנרשמו מההשקה, אושרו לפני יום הצילום, ולא נכנסו אף פעם אחרי האישור (לא הגיעו לדף הבית).',
      sinceSub: `${since.filter(pushOn).length} מהם כבר עם פוש`,
      leftSub: `פוש ${left.filter(pushOn).length} · מייל ${left.filter(m => m.email).length}`,
      extra: out.length ? `מחוץ לצילום: <b>${U.f(out.length)}</b> שאושרו מיום הצילום ועוד לא נכנסו – ייכנסו לצילום הבא.` : '',
      charts: [{ t: 'כמה זמן עבר מהאישור (מי שנשאר)', rows: [['יום אחד', left.filter(m => age(m) <= 1).length], ['יומיים', left.filter(m => age(m) === 2).length], ['3–6 ימים', left.filter(m => age(m) >= 3 && age(m) <= 6).length, 'hot'], ['7 ימים ויותר', left.filter(m => age(m) >= 7).length, 'hot']] },
        { t: 'באיזו דרך נרשמו (מי שנשאר)', rows: Object.entries(by(left, methodOf)).sort((a, b) => b[1] - a[1]) },
        { t: 'אפשר להגיע אליהם ב-', rows: [['מייל', left.filter(m => m.email).length], ['↳ מייל מוסתר של Apple (כמעט לא נפתח)', left.filter(m => /privaterelay/i.test(m.email || '')).length], ['פוש', left.filter(pushOn).length]] }],
      plan: [
        { k: 'd2', w: 'יום 2', what: 'מייל "אושרת – פותחים את Yellow Zone ונכנסים לבד"; למי שהחליף טלפון – הדרך והקוד', ids: left.filter(m => fan(m) && age(m) >= 2) },
        { k: 'd7', w: 'יום 7', what: 'תזכורת במייל', ids: left.filter(m => fan(m) && age(m) >= 7) },
        { k: 'd14', w: 'יום 14', what: 'מייל אחרון עם הטבות השבוע, ואז "רדום"', ids: left.filter(m => fan(m) && age(m) >= 14) }],
      flow: 'f1', methods: by(left, methodOf) };
  }
  if (id === 2) {
    const devs = Object.keys(x.devFirst).filter(d => x.devFirst[d] >= L && x.devFirst[d] < snap && !(h.devLink[d] && h.devLink[d] < snap));
    const since = devs.filter(d => h.devLink[d]), left = devs.filter(d => !h.devLink[d]);
    const reopened = left.filter(d => onOrAfter(x.devDays[d], snap)).length;
    const out = Object.keys(x.devFirst).filter(d => x.devFirst[d] >= snap && !h.devLink[d]).length;
    const sub = since.filter(d => x.subDev.has(d)).length;
    const FAN = [['open', 'מיד בפתיחת הטופס'], ['identity', 'בפרטים האישיים'], ['birth', 'בתאריך הלידה'], ['subscriber', 'בשאלת המנוי'], ['route', 'בבחירת דרך האימות', 'hot'], ['proof', 'בהעלאת ההוכחה', 'hot'], ['submitTry', 'לחצו "שליחה" ונעצרו']];
    const fa = by(left.map(d => x.far[d] || ''), v => v);
    const noForm = left.filter(d => !x.far[d]).length;
    return { start: devs, since, left, people: false, sinceLbl: 'נרשמו מאז',
      def: 'מכשירים שפתחו את האפליקציה בפעם הראשונה מההשקה ועד יום הצילום, ומהם לא נשלחה הרשמה ולא הייתה כניסה עד אז. נספרים לפי מכשיר – ולכן יש בהם גם מעט אנשים שנרשמו ממכשיר אחר ועוד לא נכנסו מהמכשיר הזה.',
      sinceSub: `${U.f(sub)} שלחו טופס מהמכשיר · ${U.f(since.length - sub)} נכנסו לחשבון קיים`,
      leftSub: `${U.f(reopened)} פתחו שוב מאז – ועדיין לא`,
      extra: out ? `מחוץ לצילום: <b>${U.f(out)}</b> מכשירים חדשים מיום הצילום שעוד לא נרשמו.` : '',
      charts: [{ t: 'איפה עצרו – לפי סדר המסך (מי שנשאר)', rows: [['לא פתחו טופס', noForm], ...FAN.map(([k, l, c]) => [l, fa['f:' + k] || 0, c]), ['פתחו טופס עסק', Object.entries(fa).filter(([k]) => k.startsWith('b:')).reduce((s, [, n]) => s + n, 0)]] }],
      noChannel: 'אין לוח פנייה – אין למי לשלוח (אין שם, מייל או טלפון). המדד: האם "נרשמו מאז" עולה אחרי שיפור שלב האימות.', flow: 'f2' };
  }
  if (id === 3) {
    const owners = new Map(); (C.biz() || []).forEach(b => { if (b.ownerMemberId && b.status === 'approved' && fanById.has(b.ownerMemberId) && !owners.has(b.ownerMemberId)) owners.set(b.ownerMemberId, b); });
    const all = [...owners.keys()].map(id2 => fanById.get(id2));
    const start = all.filter(m => !before(h.appDays[m.id], snap));
    const since = start.filter(m => onOrAfter(h.appDays[m.id], snap)), left = start.filter(m => !h.appDays[m.id]);
    return { start, since, left, people: true, total: all.length, owners,
      def: 'בעל עסק שהעסק שלו מאושר, ולא פתח את האפליקציה עד יום הצילום. "מאז" = פתח מאז.',
      startSub: `מתוך ${U.f(all.length)} בעלי עסק מאושרים`,
      sinceSub: `${since.filter(pushOn).length} מהם עם פוש`,
      leftSub: `${left.filter(m => x.isVet(m)).length} ותיקים · ${left.filter(m => !x.isVet(m)).length} חדשים · ${left.filter(m => !m.lastSeenAt).length} לא נכנסו אף פעם`,
      charts: [{ t: 'באיזו דרך נכנסים (מי שנשאר)', rows: Object.entries(by(left, methodOf)).sort((a, b) => b[1] - a[1]) }],
      list: left, flow: 'f3', methods: by(left, methodOf),
      plan: [{ k: 'wa', w: 'עכשיו', what: 'וואטסאפ אישי לכל אחד – הכפתור בכל שורה ברשימה', ids: left, wa: true }] };
  }
  if (id === 4) {
    const vets = x.fans.filter(m => m.status === 'approved' && x.isVet(m));
    const start = vets.filter(m => ![...(x.memDays[m.id] || [])].some(k => k >= L && k < snap));
    const since = start.filter(m => onOrAfter(x.memDays[m.id], snap)), left = start.filter(m => m.status === 'approved' && !onOrAfter(x.memDays[m.id], snap));
    const owner = m => !!(m.isBusinessOwner || m.linkedBusinessId);
    return { start, since, left, people: true,
      def: `אושרו לפני ההשקה (${U.f(vets.length)} ותיקים), ולא נכנסו מההשקה ועד יום הצילום.`,
      startSub: `מתוך ${U.f(vets.length)} ותיקים`, sinceSub: `${since.filter(pushOn).length} מהם עם פוש`,
      leftSub: `פוש ${left.filter(pushOn).length} · מייל ${left.filter(m => m.email).length} · ${left.filter(m => !m.lastSeenAt).length} לא נכנסו אף פעם`,
      extra: `${U.f(left.filter(owner).length)} מהנשארים הם בעלי עסק – הם בטיפול במעקב 3 או 6, ולא יקבלו פעמיים.`,
      charts: [{ t: 'באיזו דרך נכנסים (מי שנשאר)', rows: Object.entries(by(left, methodOf)).sort((a, b) => b[1] - a[1]) }, { t: 'מי נשאר', rows: [['אוהדים', left.filter(m => !owner(m)).length], ['בעלי עסק', left.filter(owner).length]] }],
      plan: [{ k: 'now', w: 'עכשיו', what: 'מייל אישי עם הדרך והקוד של כל אחד', ids: left.filter(m => !owner(m)) }],
      flow: 'f4', methods: by(left, methodOf) };
  }
  // 6 – עסק ממתין
  const biz = (C.biz() || []).filter(b => b.registeredAtKnown && dkOf(b.registeredAt) < snap && (b.status === 'pending' || (b.status === 'approved' && b.approvedAt && dkOf(b.approvedAt) >= snap)));
  const since = biz.filter(b => b.status === 'approved'), left = biz.filter(b => b.status === 'pending');
  const nowPend = (C.biz() || []).filter(b => b.status === 'pending');
  const ow = b => fanById.get(b.ownerMemberId);
  const pendOwner = nowPend.filter(b => ow(b) && ow(b).status === 'pending'), apOwner = nowPend.filter(b => ow(b) && ow(b).status === 'approved');
  return { start: biz, since, left, people: false, sinceLbl: 'אושרו מאז',
    def: 'עסקים שנרשמו לפני יום הצילום וממתינים לאישור שלך. ההתקדמות כאן היא שלך – אישור העסק.',
    sinceSub: 'אושרו', leftSub: `עכשיו ממתינים בסך הכול ${U.f(nowPend.length)} (כולל חדשים)`,
    charts: [{ t: `מי בעל העסק (עכשיו, ${U.f(nowPend.length)})`, rows: [['גם הוא ממתין', pendOwner.length], ['מאושר כאוהד', apOwner.length, 'hot'], ['בלי רשומת חבר', nowPend.filter(b => !ow(b)).length]] }],
    // נשלח לעסק (bizPick) ולא לחבר: מרכז ההודעות לא מציג בעלי עסק ברשימת האוהדים (§660)
    plan: [{ k: 'now', w: 'עכשיו', what: `${apOwner.length} המאושרים כאוהדים: "העסק שלך עוד ממתין – חסר X"`, ids: apOwner.map(ow).filter(Boolean), biz: apOwner.map(b => b.id) }],
    flow: 'f6', n6: { pend: pendOwner.length, ap: apOwner.length, apIn: apOwner.filter(b => onOrAfter(h.appDays[b.ownerMemberId], U.LAUNCH)).length } };
}

// ── מה קורה בפועל לכל דרך כניסה (מהדמו המאושר, לפי הקוד החי) ──────────────────────────────────
const STEP = {
  googleIn: ['לוחץ "התחברות" ← "Google"', 'בוחר חשבון Google בטלפון', 'אם זה אותו Gmail שנרשם איתו (או שכבר חובר) – נכנס'],
  googleMiss: 'Gmail אחר → "נראה שעוד לא נרשמתם" – צריך להיכנס עם קוד',
  appleIn: ['לוחץ "התחברות" ← "Apple"', 'Face ID', 'אם נרשם עם Apple, או שהמייל תואם – נכנס'],
  appleMiss: 'מייל מוסתר / אחר → "היכנסו פעם אחת עם טלפון וקוד – ונחבר את Apple" – מהפעם הבאה Apple מכניס',
  codeIn: ['לוחץ "התחברות" ← מקליד טלפון', 'מקליד את הקוד מהמייל (בחלון: "חפשו yellowzone במייל")', 'נכנס'],
  codeMiss: 'אין קוד → "שלחו לי שוב" – הקוד נשלח שוב למייל',
};
const FLOW = {
  f1: { intro: 'נרשמו מהאפליקציה – ולכן בטלפון שנרשמו ממנו שמור "מפתח" (§612).', common: '<b>באותו טלפון שנרשמו ממנו – כולם, בלי קשר לדרך:</b> פותחים את האפליקציה ← נכנסים לבד תוך שנייה וחצי. בלי קוד, בלי Google, בלי Apple. <b>הבעיה היחידה: הם לא יודעים שאושרו.</b>', sub: 'רק אם החליף טלפון או התקין מחדש – אין מפתח, והוא צריך להתחבר לבד:',
    have: ['מפתח בטלפון – כניסה לבד (§612)', 'מייל אישור עם קוד', 'אחרי התנתקות – "בפעם הקודמת נכנסתם עם…" (§668)'], todo: ['מייל "אושרת – פותחים ונכנסים לבד" (פוש אין להם)', 'למייל מוסתר של Apple – כמעט לא נפתח; אין ערוץ אחר'], knows: true },
  f2: { intro: 'עוד לא נרשמו, ולכן אין להם דרך כניסה. זה מה שהם רואים כשהם פותחים שוב:', common: 'פותחים ← אם התחילו טופס: כרטיס <b>"ההרשמה שלכם מחכה"</b> עם "להמשיך מאיפה שעצרתי" – הטופס שמור (§639). מי שבעצם כבר רשום וממלא שוב ← <b>"כבר נרשמת – נכנסים עם…"</b> (§665).',
    have: ['שמירת הטופס + כרטיס החזרה (§639)', '"כבר נרשמת" למי שכבר רשום (§665)'], todo: ['שלב האימות – רוב מי שנעצר, נעצר בו. זה המקום לשפר', 'אין שום ערוץ אליהם מבחוץ'] },
  f3: { intro: 'רובם נרשמו באתר לפני האפליקציה – אין להם מפתח בטלפון, ואין זיכרון של כניסה קודמת.', warn: true, common: '<b>כולם:</b> פותחים ← מסך "הרשמה / התחברות" ← <b>המסך לא יודע מי הם ולא אומר להם איך נרשמו</b>. מי שלוחץ בטעות "הרשמה" וממלא ← "כבר נרשמת – כבעל העסק X, נכנסים עם…" והדרך שלו (§665). <b>לכן איתם מדברים אישית:</b> בוואטסאפ כל אחד מקבל את הדרך שלו (והקוד, אם הוא עם קוד).',
    have: ['"כבר נרשמת – כבעל העסק X" (§665)', '"חפשו yellowzone במייל" בחלון הכניסה (§667)', 'דשבורד העסק באתר – עובד גם בלי האפליקציה'], todo: ['וואטסאפ אישי לכל אחד: הורדה + הדרך שלו + הקוד שלו – הכפתור ברשימה'], knows: true, codeMiss: 'הקוד במייל האישור מלפני כמה שבועות – רובם לא ימצאו. "שלחו לי שוב" עובד' },
  f4: { intro: 'נרשמו באתר לפני האפליקציה – אין מפתח בטלפון ואין פוש.', warn: true, common: '<b>כולם:</b> פותחים ← מסך "הרשמה / התחברות" ← <b>המסך לא אומר להם איך נרשמו</b> – צריכים לבחור לבד ולזכור. מי שטועה לא נתקע (ר\' הטבלה), אבל עובר מסך או שניים.',
    have: ['Google עם אותו Gmail – נכנס לבד (§409)', '"כבר נרשמת – נכנסים עם…" (§665) · "חפשו yellowzone" (§667)'], todo: ['מייל אישי עם הדרך שלו – ולכולם גם הקוד, כי טלפון + קוד עובד לכל אחד', 'מי שלא פתח את המייל אחרי 7 ימים – תזכורת אחת, ואז לא יותר'], knows: true },
};
const KNOWS = `<div class="yzu-box" style="background:#fff"><h3>האם האפליקציה אומרת לו איך הוא נרשם?</h3><table>
  <tr><th>איפה</th><th>מה הוא רואה</th></tr>
  <tr><td>מסך הכניסה, בפעם הראשונה בטלפון הזה</td><td><b>לא.</b> האפליקציה עוד לא יודעת מי הוא. יש רק רמז כללי: "חפשו yellowzone במייל" (§667)</td></tr>
  <tr><td>מסך הכניסה, אחרי שכבר נכנס מהטלפון הזה</td><td><b>כן</b> – "בפעם הקודמת נכנסתם מהמכשיר הזה עם…" (§668)</td></tr>
  <tr><td>לחץ בטעות "הרשמה" ומילא טלפון / מייל ושם</td><td><b>כן</b> – "כבר נרשמת – נכנסים עם קוד / Google / Apple" לפי מה שאצלו (§665). לבעל עסק – גם שם העסק</td></tr></table>
  <h3 style="margin-top:12px">בחר דרך לא נכונה – מה קורה</h3><table>
  <tr><th>נרשם עם</th><th>לחץ על</th><th>מה קורה</th></tr>
  <tr><td>קוד</td><td>Google</td><td>אותו Gmail כמו בהרשמה – <b>נכנס</b>. Gmail אחר – "נראה שעוד לא נרשמתם" + "כניסה עם טלפון וקוד"</td></tr>
  <tr><td>קוד / Google</td><td>Apple</td><td>המייל של Apple זהה – <b>נכנס</b> (§456). מייל מוסתר – "היכנסו פעם אחת עם טלפון וקוד – ונחבר את Apple"</td></tr>
  <tr><td>Google / Apple</td><td>טלפון וקוד</td><td><b>נכנס</b> – כל חבר מאושר מקבל קוד. הבעיה היחידה: למצוא את הקוד ("שלחו לי שוב")</td></tr></table>
  <p class="yzu-note"><b>בשורה התחתונה:</b> טלפון + קוד עובד לכולם. מי שבוחר לא נכון לא נתקע – אבל עובר מסך או שניים.</p></div>`;

function flowHtml(t) {
  const F = FLOW[t.flow];
  if (t.flow === 'f6') {
    const n = t.n6;
    const card = (k, cnt, steps, end, cls) => `<div class="yzt-meth"><div class="mh">${k}<span>${U.f(cnt)}</span></div><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol><div class="end ${cls || ''}">${end}</div></div>`;
    return `<div class="yzt-flow"><h3>מה קורה להם בפועל</h3><p class="intro">שני מצבים שונים לגמרי – לפי מה שקורה לבעל העסק עצמו:</p>
      <div class="yzt-meths">${card('בעל העסק ממתין', n.pend, ['עם Google / Apple – רואה "העסק שלך אצלנו" + מה חסר (§666)', 'עם קוד – לממתין עוד אין קוד; הקוד נוצר באישור'], 'כשאתה מאשר – נכנס לבד', 'ok')}
      ${card('מאושר כאוהד', n.ap, [`נכנס לאפליקציה רגיל (${U.f(n.apIn)} מהם נכנסו)`, 'רואה דף בית של אוהד', 'שום דבר לא אומר לו שהעסק ממתין ומה חסר'], 'חסר: כרטיס "העסק בבדיקה" בדף הבית', 'bad')}</div>
      <div class="yzt-xt"><div class="have"><b>✓ מה כבר בנוי באפליקציה (באוויר)</b><ul><li>"העסק שלך אצלנו" לממתין עם Google / Apple (§664–§666)</li><li>באישור – נכנס לבד</li></ul></div><div class="todo"><b>מה חסר</b><ul><li>כרטיס "העסק בבדיקה" בדף הבית למאושרים כאוהדים</li><li>עד אז: הודעה "העסק שלך עוד ממתין – חסר X"</li></ul></div></div></div>`;
  }
  const m = t.methods || {};
  const cards = t.flow === 'f2' ? '' : `<div class="yzt-meths">${[['קוד', STEP.codeIn, F.codeMiss || STEP.codeMiss], ['Google', STEP.googleIn, STEP.googleMiss], ['Apple', STEP.appleIn, STEP.appleMiss]].map(([k, s, miss]) => `<div class="yzt-meth"><div class="mh">${k}<span>${U.f(m[k] || 0)}</span></div><ol>${s.map(x2 => `<li>${x2}</li>`).join('')}</ol><div class="yzu-note">↯ ${miss}</div></div>`).join('')}</div>`;
  return `<div class="yzt-flow"><h3>מה קורה להם בפועל – לפי דרך הכניסה</h3><p class="intro">${F.intro}</p>
    <div class="yzt-common${F.warn ? ' warn' : ''}">${F.common}</div>
    ${F.sub ? `<details><summary>${F.sub}</summary>${cards}</details>` : cards}
    ${F.knows ? `<button class="yzu-btn" style="margin-top:8px" onclick="yztSet('knows')">${S.knows ? '▾' : '▸'} האם הוא יודע איך נרשם? ומה קורה אם בחר דרך לא נכונה</button>${S.knows ? KNOWS : ''}` : ''}
    <div class="yzt-xt"><div class="have"><b>✓ מה כבר בנוי באפליקציה (באוויר)</b><ul>${F.have.map(x2 => `<li>${x2}</li>`).join('')}</ul></div><div class="todo"><b>מה חסר / מה עושים</b><ul>${F.todo.map(x2 => `<li>${x2}</li>`).join('')}</ul></div></div></div>`;
}

// ── וואטסאפ לבעל עסק ──────────────────────────────────────────────────────────────────────────
function waText(m, b) {
  const meth = methodOf(m);
  // §739 – הקודים כבר לא טעונים מראש במרכז הניהול: לבעל עסק עם קוד מבקשים אותו (רינדור מחדש כשחוזר)
  const code = meth === 'קוד' ? (m.loginCode || (window.memberCodeOf && window.memberCodeOf(m.id)) || '') : '';
  if (meth === 'קוד' && !code && window.needMemberCodes) window.needMemberCodes([m.id]);
  const how = meth === 'קוד' ? (code ? `נכנסים עם הטלפון שלך והקוד: *${code}*` : 'נכנסים עם הטלפון שלך והקוד שקיבלת במייל') : meth === 'Google' ? 'נכנסים עם Google – באותו Gmail שנרשמת איתו' : 'נכנסים עם Apple';
  return `היי ${m.firstName || ''}, כאן רמי מ-Yellow Zone 💛\n${b.name} כבר באפליקציה, והאוהדים רואים את העסק.\nכדי לנהל אותו מהטלפון – מורידים כאן:\nhttps://yellowzone.co.il/download\n${how}`;
}
const waHref = (phone, text) => { const p = String(phone || '').replace(/\D/g, '').replace(/^0/, '972'); return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : ''; };

// ── תצוגה ────────────────────────────────────────────────────────────────────────────────────
// ── §703 — מי כבר קיבל כל שלב ───────────────────────────────────────────────────────────────
// "לשלוח לקבוצה" מתייג את ההודעה במרכז ההודעות (messages.tracker = { id, stage, label }). מי שקיבל =
// שורות הנמענים של ההודעות המתויגות. וואטסאפ במעקב 3 – waNudgeAt על רשומת החבר (המונה של §415).
const GOT = { map: null, loading: false, err: '' };
async function loadGot() {
  if (GOT.loading) return;
  GOT.loading = true; GOT.err = '';
  const { db, fs } = U.C, map = {};
  try {
    const ms = await fs.getDocs(fs.query(fs.collection(db, 'messages'), fs.where('tracker.id', 'in', [1, 3, 4, 6])));
    await Promise.all(ms.docs.map(async m => {
      const md = m.data(), tr = md.tracker || {}, key = tr.id + '|' + tr.stage, at = md.sentAt && md.sentAt.toDate ? md.sentAt.toDate() : null;
      const rs = await fs.getDocs(fs.collection(db, 'messages', m.id, 'recipients'));
      const g = map[key] || (map[key] = new Map());
      rs.docs.forEach(r => { const prev = g.get(r.id); if (!prev || (at && at > prev)) g.set(r.id, at); });
    }));
    GOT.map = map;
  } catch (e) { console.error(e); GOT.err = e.message || String(e); GOT.map = {}; }
  finally { GOT.loading = false; U.C.rerender(); }
}
const gotOf = (id, stage) => (GOT.map && GOT.map[id + '|' + stage]) || new Map();
// לכל שלב: מי כבר קיבל, ומי עוד ממתין
function stageSplit(trId, p) {
  if (p.k === 'wa') {
    const sent = p.ids.filter(m => m.waNudgeAt && U.dk(m.waNudgeAt) >= S.snap);
    return { due: p.ids.filter(m => !sent.includes(m)), got: sent.length, last: sent.reduce((a, m) => (!a || m.waNudgeAt > a ? m.waNudgeAt : a), null) };
  }
  const g = gotOf(trId, p.k);
  if (p.biz) { const due = p.biz.filter(id => !g.has(id)); return { due: p.ids.filter((m, i) => !g.has(p.biz[i])), dueBiz: due, got: p.biz.length - due.length, last: [...g.values()].reduce((a, d) => (!a || (d && d > a) ? d : a), null) }; }
  const due = p.ids.filter(m => !g.has(m.id));
  return { due, got: p.ids.length - due.length, last: [...g.values()].reduce((a, d) => (!a || (d && d > a) ? d : a), null) };
}

export function html() {
  if (!U.D) return '<div class="placeholder-note">טוען…</div>';
  if (!GOT.map && !GOT.loading && !GOT.err) loadGot();
  const t = tracker(S.cur), f = U.f, today = U.D.today;
  const tiles = TRK.map(([id, nm, unit]) => {
    const r = tracker(id), st = r.start.length, done = st - r.left.length;
    return `<button class="yzu-tile${S.cur === id ? ' on' : ''}" onclick="yztSet('cur',${id})"><div class="nm"><span>${id}. ${nm}</span><i>${unit}</i></div>
      <div class="big">${f(r.left.length)} <small>נשארו מתוך ${f(st)}</small></div><div class="yzt-prog"><i style="width:${U.W(done, st)}%"></i></div><div class="pct">${U.pc(done, st)} ${r.sinceLbl || 'התחברו מאז'} ${U.short(S.snap)}</div></button>`;
  }).join('');
  const k = (cls, l, n, sub) => `<div class="yzt-k ${cls}"><small>${l}</small><b>${f(n)}</b><div class="sub">${sub || '&nbsp;'}</div></div>`;
  const charts = (t.charts || []).map(c => { const mx = Math.max(1, ...c.rows.map(r => r[1])); return `<div class="yzu-box"><h3>${c.t}</h3>${c.rows.map(([l, n, cls]) => U.hb(l, n, mx, cls || '')).join('')}</div>`; }).join('');
  const plan = t.noChannel ? `<div class="yzt-nochan">${t.noChannel}</div>` : `<div class="yzu-box"><h3>לוח פנייה</h3><p class="yzu-note" style="margin:0 0 8px">כל שלב יוצא בפוש למי שהפעיל התראות, ובמייל לכולם – במרכז ההודעות. "ממתינים עכשיו" = מי שנשאר בקבוצה, הגיע לשלב, <b>ועוד לא קיבל אותו</b>.</p>
    <table><tr><th>מתי</th><th>מה</th><th class="n">ממתינים עכשיו</th><th class="n">כבר קיבלו</th><th></th></tr>
    ${t.plan.map((p, i) => { const s = stageSplit(S.cur, p);
      return `<tr><td><span class="yzt-when">${p.w}</span></td><td>${p.what}</td><td class="n"><b>${f(s.due.length)}</b><div class="yzu-note" style="margin:0">פוש ${f(s.due.filter(m => { const q = U.C.pushInfo(m); return q && q.app; }).length)} · מייל ${f(s.due.filter(m => m.email).length)}</div></td>
      <td class="n">${GOT.map || p.wa ? (s.got ? `<b class="yzt-got">✓ ${f(s.got)}</b><div class="yzu-note" style="margin:0">${s.last ? 'אחרון ' + s.last.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : ''}</div>` : '–') : '…'}</td>
      <td>${p.wa ? '<span class="yzu-note">ברשימה למטה</span>' : s.due.length ? `<button class="yzu-btn on" onclick="yztSend(${i})">לשלוח ל-${f(s.due.length)}</button>` : '<span class="yzu-note">אין למי</span>'}</td></tr>`; }).join('')}</table>
    <p class="yzu-note">"לשלוח" פותח את מרכז ההודעות עם מי שעוד לא קיבל כבר מסומן. כשהשליחה יוצאת משם – היא נרשמת כאן, ואותם אנשים לא יופיעו שוב באותו שלב.${GOT.err ? ` ⚠️ טעינת "מי קיבל" נכשלה: ${U.esc(GOT.err)}` : ''}</p></div>`;
  const list = t.list ? `<div class="yzu-box"><h3>הרשימה – ${f(t.list.length)} שנשארו</h3><div class="yzu-tw"><table>
    <tr><th>עסק</th><th>בעלים</th><th>טלפון</th><th>נכנס עם</th><th>כניסה אחרונה</th><th>וואטסאפ</th><th>נשלח</th></tr>
    ${t.list.map(m => { const b = t.owners.get(m.id), ph = m.phone || b.ownerPhone || ''; const href = waHref(ph, waText(m, b));
      return `<tr><td>${U.esc(b.name)}</td><td>${U.esc(m.name || '')}</td><td>${U.esc(ph)}</td><td>${methodOf(m)}</td><td>${m.lastSeenAt ? U.esc(m.lastSeenAt.toLocaleDateString('he-IL')) : 'אף פעם'}</td>
      <td>${href ? `<a class="yzt-wa" href="${href}" target="_blank" rel="noopener" onclick="yztWa('${m.id}')">וואטסאפ</a>` : '–'}</td>
      <td>${WA[m.id] || m.waNudgeAt ? `<span class="yzt-got">✓ ${(WA[m.id] || m.waNudgeAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</span>${m.waNudgeCount > 1 ? ` <span class="yzu-note">(${m.waNudgeCount} פעמים)</span>` : ''}` : '–'}</td></tr>`; }).join('')}</table></div>
    <p class="yzu-note">ההודעה כוללת את הדרך שלו – ולמי שנכנס עם קוד, גם את הקוד. נפתחת בוואטסאפ שלך, עם הנוסח מוכן; שולחים משם. הלחיצה נרשמת ("נשלח"), ומי שכבר קיבל מיום הצילום יוצא מ"ממתינים".</p></div>` : '';
  return `<div class="yzu">${U.css()}${css()}
    <div class="yzt-src"><b>מקור מספרים אחד:</b> מעקבי חברים – מרשומת החבר וימי הכניסה שלו (מי שהגיע לדף הבית). "הורידו ולא נרשמו" – לפי טלפון. <b>צילום</b> = מי שהיה בקבוצה בתחילת יום הצילום; "מאז" = מתוכם, מי שיצא מהקבוצה.
      <span style="white-space:nowrap">יום הצילום: <input type="date" value="${S.snap}" min="${U.addDays(U.LAUNCH, 1)}" max="${today}" onchange="yztSet('snap',this.value)"></span></div>
    <div class="yzu-tiles">${tiles}</div>
    <div class="yzu-det"><h2>${S.cur}. ${TRK.find(r => r[0] === S.cur)[1]}</h2><p class="yzu-def">${t.def}</p>
      <div class="yzt-three">${k('start', 'בהתחלה', t.start.length, t.startSub || `צילום ${U.short(S.snap)}`)}${k('since', t.sinceLbl || 'התחברו מאז', t.since.length, t.sinceSub)}${k('left', 'נשארו', t.left.length, t.leftSub)}</div>
      ${t.extra ? `<div class="yzt-extra">${t.extra}</div>` : ''}
      ${flowHtml(t)}
      ${legacyHtml()}
      <div class="yzu-cols"><div>${charts}</div><div>${plan}</div></div>${list}</div></div>`;
}

window.yztSet = (k, v) => { if (k === 'knows') S.knows = !S.knows; else S[k] = v; U.C.rerender(); };
// §701 — שני קטעים שעברו מהמסך הקודם של מרכז הנתונים (החישוב נשאר ב-admin-dashboard: ctx.legacy).
// הם על **כל** המאושרים ובעלי העסק, לא רק על קבוצת הצילום – ולכן בתיבה נפרדת, עם הכותרת שלהם.
function legacyHtml() {
  const L = U.C.legacy;
  if (!L) return '';
  const box = (title, sub, body) => body ? `<div class="yzu-box"><h3>${title}</h3><p class="yzu-note" style="margin:0 0 8px">${sub}</p>${body}</div>` : '';
  if (S.cur === 1) return box('מה קרה למייל – לכל מי שאושר ולא נכנס', 'כל המאושרים שלא נכנסו אף פעם (לא רק קבוצת הצילום), לפי מה ש-Brevo דיווח על מייל הקוד. לחיצה על שורה פותחת את הרשימה.', L.notEnteredMail());
  if (S.cur === 3) return box('בעלי עסק – מוכנות לכניסה כחבר', 'כל בעלי העסקים המאושרים: האם יש להם רשומת חבר מאושרת עם קוד או Google – כלומר האם יוכלו להיכנס בכלל.', L.ownerReadiness());
  return '';
}
window.yztSend = (i) => {
  const t = tracker(S.cur), p = t.plan[i]; if (!p) return;
  const s = stageSplit(S.cur, p), trk = { id: S.cur, stage: p.k, label: `מעקב ${S.cur} · ${TRK.find(r => r[0] === S.cur)[1]} · ${p.w}` };
  if (p.biz) { if (s.dueBiz.length) U.C.openSend('biz', s.dueBiz, trk); }
  else if (s.due.length) U.C.openSend('fans', s.due.map(m => m.id), trk);
  GOT.map = null;   // אחרי שליחה – לטעון מחדש בכניסה הבאה למעקבים
};
// וואטסאפ ממעקב 3: נרשם במונה הקיים (§415). WA – הסימון המקומי עד שהרשומה תתעדכן מהשרת
const WA = {};
window.yztWa = (id) => { WA[id] = new Date(); if (U.C.waNudge) U.C.waNudge(id); setTimeout(() => U.C.rerender(), 50); };

function css() {
  return `<style>
  .yzt-src{background:var(--yzu-acc-soft);border:1px solid var(--yzu-acc-line);border-radius:12px;padding:9px 12px;font-size:13px;line-height:1.7;margin-bottom:12px}
  .yzt-prog{height:7px;background:var(--yzu-gray);border-radius:4px;overflow:hidden;margin:6px 0 4px}.yzt-prog i{display:block;height:100%;background:var(--yzu-ok)}
  .yzt-three{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:8px}@media(max-width:700px){.yzt-three{grid-template-columns:1fr}}
  .yzt-k{border:1px solid var(--yzu-line);border-radius:12px;padding:10px 12px;background:#FCFCFA}.yzt-k small{display:block;color:var(--yzu-muted);font-size:12.5px}.yzt-k b{font-size:26px;display:block}.yzt-k .sub{font-size:12px;color:var(--yzu-muted)}
  .yzt-k.start{border-top:4px solid var(--yzu-blue)}.yzt-k.since{border-top:4px solid var(--yzu-ok)}.yzt-k.left{border-top:4px solid var(--yzu-bad)}
  .yzt-extra{background:var(--yzu-gray);border-radius:10px;padding:8px 10px;font-size:12.5px;line-height:1.6;margin-bottom:12px}
  .yzt-flow{border:1px solid var(--yzu-line);border-radius:12px;background:#FCFCFA;padding:12px;margin-bottom:12px}.yzt-flow h3{font-size:15px;margin:0 0 4px}.yzt-flow .intro{font-size:13px;margin:0 0 10px;line-height:1.6}
  .yzt-common{background:var(--yzu-ok-soft);border:1px solid #BFE3CC;border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.6;margin-bottom:10px}.yzt-common.warn{background:#FEF3F2;border-color:#F5C7C2}
  .yzt-flow summary{cursor:pointer;font-size:13px;color:var(--yzu-blue);margin-bottom:8px}
  .yzt-meths{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}@media(max-width:860px){.yzt-meths{grid-template-columns:1fr}}
  .yzt-meth{background:#fff;border:1px solid var(--yzu-line);border-radius:12px;padding:10px 12px}.yzt-meth .mh{display:flex;justify-content:space-between;font-weight:800;margin-bottom:6px}.yzt-meth .mh span{font-size:12px;color:var(--yzu-muted)}
  .yzt-meth ol{margin:0;padding-inline-start:18px;font-size:12.8px;line-height:1.6}.yzt-meth .end{margin-top:6px;font-size:12.5px;font-weight:700}.yzt-meth .end.ok{color:var(--yzu-ok)}.yzt-meth .end.bad{color:var(--yzu-bad)}
  .yzt-xt{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}@media(max-width:860px){.yzt-xt{grid-template-columns:1fr}}.yzt-xt>div{border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.6}.yzt-xt .have{background:var(--yzu-ok-soft)}.yzt-xt .todo{background:var(--yzu-acc-soft)}.yzt-xt ul{margin:0;padding-inline-start:18px}
  .yzt-when{font-weight:700;background:var(--yzu-acc-soft);border:1px solid var(--yzu-acc-line);border-radius:8px;padding:2px 7px;font-size:12.5px;white-space:nowrap}
  .yzt-nochan{background:#FEF3F2;border:1px solid #F5C7C2;color:var(--yzu-bad);border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.6}
  .yzt-got{color:var(--yzu-ok);font-weight:700}.yzt-wa{font-size:12px;font-weight:700;background:#1FA855;color:#fff;border-radius:8px;padding:5px 9px;text-decoration:none;white-space:nowrap}
  </style>`;
}
