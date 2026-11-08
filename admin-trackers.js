// ══ §700 — מרכז הנתונים · לשונית "מעקבים" ═══════════════════════════════════════════════════════
// הדמו המאושר: trackers-demo.html (§640–§640ז). 5 מעקבים: 1 אושרו ולא נכנסו · 2 הורידו ולא נרשמו ·
// 3 בעלי עסק בלי האפליקציה · 4 ותיקים שלא חזרו · 6 עסק ממתין.
//
// **הצילום מחושב מההיסטוריה, לא נשמר:** "בהתחלה" = מי שהיה בקבוצה בתחילת יום הצילום, לפי ימי
// הפעילות שב-usageDaily (§699) ורשומות החברים/העסקים. לכן אפשר לבחור כל יום כיום צילום, והקבוצה
// לא משתנה בדיעבד. "מאז" = מתוכם, מי שיצא מהקבוצה מאז; "נשארו" = מי שעדיין בה.
// אותם נתונים ש"אפליקציה ושימוש" כבר טען (shared מ-admin-usage.js) – בלי קריאות נוספות.
import { shared as U } from './admin-usage.js?v=717';

// §744 – pk/from/to = התקופה של "לפי ימים" (היום · אתמול · 7 · 14 · מאז הצילום · תאריכים)
const S = { snap: '2026-10-28', cur: 1, knows: false, wa: null, pk: '7', from: '', to: '', waEdit: false, wk: true };
const TRK = [[1, 'אושרו ולא נכנסו', 'חברים'], [2, 'הורידו ולא נרשמו', 'מכשירים'], [3, 'בעלי עסק בלי האפליקציה', 'חברים'], [4, 'ותיקים שלא חזרו', 'חברים'], [5, 'נכנסו פעם אחת', 'חברים'], [6, 'עסק ממתין', 'עסקים']];
// מה נחשב "יצאו מהקבוצה" בכל מעקב – הכותרת של העמודה ב"לפי ימים"
const OUT_LBL = { 1: 'נכנסו', 2: 'נרשמו / נכנסו', 3: 'פתחו את האפליקציה', 4: 'חזרו', 5: 'חזרו ליום שני', 6: 'אושרו' };

// ── §744 – הנוסחים המוכנים: "לשלוח" פותח את מרכז ההודעות עם הנוסח הזה – עורכים שם ושולחים ──────────
// {name} / {code} / {link} – המשתנים של מרכז ההודעות ({link} לאוהד = הורדת האפליקציה, כפתור צהוב במייל)
const BIZ_N = 'כמעט 150';   // 146 עסקים מאושרים ב-8.11 – רמי: לא לכתוב "קרוב ל-200" עד שזה נכון
const MAIL_FANS_BIZ = `${BIZ_N} עסקים של אוהדים כבר בפנים: מסעדות, בעלי מקצוע, DJ וצלמים לאירועים, מתנות וטיפוח – כל אחד עם הטבה רק לחברים.`;
const DOCS = {
  '5|now': { ch: { app: true, push: true, mail: false, wa: false },
    push: { title: 'כל בעלי העסקים שצריך – במקום אחד 💛', body: `${BIZ_N} עסקים של אוהדים כבר ב-Yellow Zone – בעלי מקצוע, אוכל, אירועים ומתנות, עם הטבות רק לחברים 💛` },
    app: { title: 'כל מה שצריך – אצל האוהדים', text: `צריכים בעל מקצוע, מסעדה, DJ לאירוע או מתנה?\nלפני שמחפשים בגוגל – בודקים ב-Yellow Zone.\nבעלי מקצוע, אוכל, אירועים ומתנות – ${BIZ_N} עסקים של אוהדים כבר כאן, כל אחד עם הטבה רק לחברים.\nהם פרגנו לקבוצה כל השנים – עכשיו התור שלנו להחזיר באהבה 💛`, link: '' } },
  '5|mail': { ch: { app: false, push: false, mail: true, wa: false },
    mail: { subject: '{name}, צריכים משהו? כמעט 150 עסקים של אוהדים מחכים לך', body: `היי {name},\n\nצריכים חשמלאי, מסעדה, DJ לאירוע או מתנה? לפני שמחפשים בגוגל – בודקים ב-Yellow Zone.\n\nבעלי מקצוע, אוכל, אירועים ומתנות – ${BIZ_N} עסקים של אוהדים כבר כאן, כל אחד עם הטבה רק לחברים.\n\nהם פרגנו לקבוצה כל השנים. עכשיו התור שלנו להחזיר באהבה 💛\n\n{link}` } },
  '1|*': { ch: { app: false, push: false, mail: true, wa: false },
    mail: { subject: '{name}, אושרת – והעסקים של האוהדים כבר מחכים לך', body: `היי {name},\n\nאושרת ל-Yellow Zone 🎉 והעסקים של האוהדים כבר מחכים לך.\n\n${MAIL_FANS_BIZ}\n\nהגיע הזמן להתחיל לקנות כחול צהוב 💛💙\n\nפותחים את Yellow Zone בטלפון שנרשמת ממנו. לא נכנס לבד? זה הקוד שלך:\n{code}\n\n{link}` } },
  '4|now': { ch: { app: false, push: false, mail: true, wa: false },
    mail: { subject: '{name}, מאז שנרשמת – Yellow Zone התמלאה בעסקים של אוהדים', body: `היי {name},\n\nנרשמת ל-Yellow Zone עוד לפני ההשקה – ומאז הרבה השתנה.\n\n${MAIL_FANS_BIZ}\n\nמתחילים לקנות כחול צהוב 💛💙\n\nמורידים את האפליקציה ונכנסים עם מספר הטלפון והקוד שלך:\n{code}\n\n{link}` } },
  // לעסק {link} = ניהול העסק – לכן קישור ההורדה כתוב קבוע (מהמחשב הם נכנסים מהקישור באזור האישי)
  '3|mail': { ch: { app: false, push: false, mail: true, wa: false },
    mail: { subject: '{business} – באפליקציה מחכים לך עדכונים', body: 'היי {name},\n\nהאוהדים כבר רואים את {business} באפליקציה של Yellow Zone.\n\nבאפליקציה מחכים לך עדכונים שיביאו לעסק יותר חשיפה ויותר עסקאות.\n\nמורידים את האפליקציה ונכנסים כמו שנרשמת:\nhttps://yellowzone.co.il/download' } },
};
const docFor = (id, k) => DOCS[id + '|' + k] || DOCS[id + '|*'] || null;
// הוואטסאפ במעקב 3 – נערך במסך ונשמר ב-settings/trackerTexts.wa3. {how} = הדרך שלו להיכנס (והקוד, אם הוא עם קוד)
const WA_DEFAULT = 'היי {name}, כאן רמי מ-Yellow Zone 💛\n{business} כבר באפליקציה, והאוהדים רואים את העסק.\nבאפליקציה מחכים לך עדכונים שיביאו לעסק יותר חשיפה ויותר עסקאות – מורידים כאן:\nhttps://yellowzone.co.il/download\n{how}';
const TXT = { wa3: null, loaded: false, loading: false, saving: false, err: '' };
async function loadTexts() {
  if (TXT.loading || TXT.loaded) return;
  TXT.loading = true;
  try { const { db, fs } = U.C, s = await fs.getDoc(fs.doc(db, 'settings', 'trackerTexts')); TXT.wa3 = (s.exists() && s.data().wa3) || null; }
  catch (e) { console.error(e); TXT.err = e.message || String(e); }
  finally { TXT.loading = false; TXT.loaded = true; U.C.rerender(); }
}
const waTpl = () => TXT.wa3 || WA_DEFAULT;
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
      plan: [{ k: 'wa', w: 'עכשיו · וואטסאפ', what: 'וואטסאפ אישי לכל אחד – הכפתור בכל שורה ברשימה', ids: left, wa: true },
        // §744 – מייל משלים לעסק (bizPick, כמו מעקב 6): קישור הורדה + "עדכונים שמחכים לך"
        { k: 'mail', w: 'עכשיו · מייל', what: 'מייל משלים לעסק: "באפליקציה מחכים לך עדכונים" + קישור להורדה', ids: left.filter(m => owners.get(m.id)), biz: left.map(m => owners.get(m.id)).filter(Boolean).map(b => b.id) }] };
  }
  if (id === 5) {
    // §744 – "נכנסו פעם אחת": אוהדים מאושרים (בלי בעלי עסק) שנכנסו ביום אחד בלבד. ותיקים נספרים מההשקה
    // (לפני כן לא היה מה לספור). "חזרו" = נכנסו ביום נוסף. אותה הגדרה כמו בדמו trackers-daily-demo.html.
    const fans = x.fans.filter(m => m.status === 'approved' && !(m.isBusinessOwner || m.linkedBusinessId));
    const daysOf = m => [...(x.memDays[m.id] || [])].filter(k => k >= (x.isVet(m) ? L : U.MEASURE_FROM));
    const onceBy = (m, d) => daysOf(m).filter(k => k <= d).length === 1;
    const prev = U.addDays(snap, -1);
    const start = fans.filter(m => onceBy(m, prev));
    const since = start.filter(m => daysOf(m).some(k => k >= snap)), left = start.filter(m => !daysOf(m).some(k => k >= snap));
    // לשליחה: כל מי שבקבוצה עכשיו (גם מי שנכנס אליה אחרי יום הצילום), ולא נראה 3 ימים ומעלה
    const old3 = U.addDays(U.D.today, -3);
    const due = fans.filter(m => { const d = daysOf(m); return d.length === 1 && d[0] <= old3; });
    const ago = m => U.dayDiff(daysOf(m)[0], U.D.today);
    return { start, since, left, people: true, sinceLbl: 'חזרו מאז',
      def: 'אוהדים מאושרים (בלי בעלי עסק) שעד יום הצילום נכנסו ביום אחד בלבד – ותיקים נספרים מההשקה. "חזרו" = נכנסו ביום נוסף מאז.',
      sinceSub: `${since.filter(pushOn).length} מהם עם פוש`,
      leftSub: `פוש ${left.filter(pushOn).length} · מייל בלבד ${left.filter(m => !pushOn(m) && m.email).length} · ${left.filter(x.isVet).length} ותיקים`,
      extra: `לשליחה עכשיו: <b>${U.f(due.length)}</b> – כל מי שבקבוצה היום (גם מי שהצטרף אליה אחרי יום הצילום) ולא נראה 3 ימים ומעלה.`,
      charts: [{ t: 'כמה זמן עבר מהכניסה היחידה (לשליחה)', rows: [['3–6 ימים', due.filter(m => ago(m) <= 6).length], ['7–13 ימים', due.filter(m => ago(m) >= 7 && ago(m) <= 13).length, 'hot'], ['14 ימים ויותר', due.filter(m => ago(m) >= 14).length, 'hot']] },
        { t: 'אפשר להגיע אליהם ב- (לשליחה)', rows: [['פוש', due.filter(pushOn).length], ['מייל בלבד (אין פוש)', due.filter(m => !pushOn(m) && m.email).length]] }],
      plan: [
        { k: 'now', w: 'עכשיו · פוש', what: 'פוש + הודעה באפליקציה – למי שיש פוש', ids: due.filter(pushOn) },
        { k: 'mail', w: 'עכשיו · מייל', what: 'מייל – למי שאין לו פוש (אף אחד לא מקבל פעמיים)', ids: due.filter(m => !pushOn(m) && m.email) }] };
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
  if (!t.flow) return '';   // §744 – מעקב 5 בלי "מה קורה להם בפועל": הם כבר נכנסו פעם אחת, הדרך עובדת
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
  // §744 – הנוסח נערך במסך (settings/trackerTexts.wa3); השם, העסק והדרך נכנסים לבד
  return waTpl().replace(/\{name\}/g, m.firstName || '').replace(/\{business\}/g, b.name || '').replace(/\{how\}/g, how);
}
// §744 – עריכת הנוסח: נשמר לכולם (settings/trackerTexts), ומהלחיצה הבאה הכפתור שולח אותו
window.yztWaSave = async (reset) => {
  const el = document.getElementById('yztWaTxt'), v = reset ? '' : (el ? el.value.trim() : '');
  if (!reset && !v) return;
  if (!reset && !v.includes('{how}') && !confirm('בנוסח אין {how} – השורה עם הדרך להיכנס והקוד לא תופיע. לשמור בכל זאת?')) return;
  TXT.saving = true; TXT.err = ''; U.C.rerender();
  try { const { db, fs } = U.C; await fs.setDoc(fs.doc(db, 'settings', 'trackerTexts'), { wa3: v || null, wa3At: new Date() }, { merge: true }); TXT.wa3 = v || null; S.waEdit = false; S.waDraft = null; }
  catch (e) { console.error(e); TXT.err = e.message || String(e); }
  finally { TXT.saving = false; U.C.rerender(); }
};
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
    const ms = await fs.getDocs(fs.query(fs.collection(db, 'messages'), fs.where('tracker.id', 'in', [1, 3, 4, 5, 6])));
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

// ══ §744 — "לפי ימים": כמה יצאו מהקבוצה בכל יום, חץ מול אתמול, סינון תקופה, 📨 על ימי שליחה ═════
// series(id) = לכל יום מיום הצילום עד היום: left = כמה מקבוצת הצילום עדיין בה בסוף היום, group = מי
// בקבוצה באותו יום (כולל מי שהצטרף אחרי הצילום). out = left של אתמול פחות left של היום.
// אותן הגדרות כמו tracker(id) – לכן "נשארו" בסוף התקופה = "נשארו" בכרטיס.
let SER = {}, SERkey = '';
function series(id) {
  const x = U.base(), h = hist(), snap = S.snap, L = U.LAUNCH, today = U.D.today, C = U.C;
  const key = U.D.loadedAt.getTime() + ':' + x.fans.length + ':' + snap + ':' + (C.biz() || []).length;
  if (SERkey !== key) { SER = {}; SERkey = key; }
  if (SER[id]) return SER[id];
  const days = []; for (let d = snap; d <= today; d = U.addDays(d, 1)) days.push(d);
  const arr = set => set ? [...set].sort() : [];
  const md = new Map(); const mdOf = m => { let a = md.get(m.id); if (!a) md.set(m.id, a = arr(x.memDays[m.id])); return a; };
  const any = (a, from, to) => a.some(k => k >= from && k <= to);
  const dkOf = d => d ? U.dk(d) : '';
  const t = tracker(id);
  let rows;
  if (id === 1) {
    const grp = x.fans.filter(m => !x.isVet(m) && m.status === 'approved' && m.approvedAt && dkOf(m.approvedAt) >= L);
    rows = days.map(d => [d, t.start.filter(m => m.status === 'approved' && !any(mdOf(m), snap, d)).length, grp.filter(m => dkOf(m.approvedAt) <= d && !any(mdOf(m), '0', d)).length]);
  } else if (id === 2) {
    const all = Object.keys(x.devFirst).filter(dv => x.devFirst[dv] >= L);
    rows = days.map(d => [d, t.start.filter(dv => !(h.devLink[dv] && h.devLink[dv] <= d)).length, all.filter(dv => x.devFirst[dv] <= d && !(h.devLink[dv] && h.devLink[dv] <= d)).length]);
  } else if (id === 3) {
    const ad = m => arr(h.appDays[m.id]), all = [...t.owners.keys()].map(i => x.byId.get(i)).filter(Boolean);
    rows = days.map(d => [d, t.start.filter(m => !any(ad(m), snap, d)).length, all.filter(m => !any(ad(m), '0', d)).length]);
  } else if (id === 4) {
    const vets = x.fans.filter(m => m.status === 'approved' && x.isVet(m));
    rows = days.map(d => [d, t.start.filter(m => !any(mdOf(m), snap, d)).length, vets.filter(m => !any(mdOf(m), L, d)).length]);
  } else if (id === 5) {
    const fans = x.fans.filter(m => m.status === 'approved' && !(m.isBusinessOwner || m.linkedBusinessId));
    const dd = m => mdOf(m).filter(k => k >= (x.isVet(m) ? L : U.MEASURE_FROM));
    rows = days.map(d => [d, t.start.filter(m => !any(dd(m), snap, d)).length, fans.filter(m => dd(m).filter(k => k <= d).length === 1).length]);
  } else {
    const B = (C.biz() || []).filter(b => b.registeredAtKnown);
    const apBy = (b, d) => b.status === 'approved' && b.approvedAt && dkOf(b.approvedAt) <= d;
    rows = days.map(d => [d, t.start.filter(b => !apBy(b, d)).length, B.filter(b => dkOf(b.registeredAt) <= d && (b.status === 'pending' || (b.status === 'approved' && b.approvedAt && dkOf(b.approvedAt) > d))).length]);
  }
  let prev = t.start.length;
  return (SER[id] = rows.map(([d, left, group]) => { const out = prev - left; prev = left; return { d, left, group, out, part: d === today }; }));
}

// ── 📨 הודעות שיצאו מיום הצילום: מתויגת-מעקב → המעקב שלה; כללית לכל האוהדים → 1,3,4,5; לעסקים → 3,6 ──
// רק המסמכים של ההודעות (בלי שורות הנמענים) – כמה עשרות קריאות.
const MS = { list: null, loading: false, err: '', snap: '' };
async function loadMsgs() {
  if (MS.loading) return;
  MS.loading = true; MS.err = ''; MS.snap = S.snap;
  try {
    const { db, fs } = U.C, from = new Date(U.addDays(S.snap, -1) + 'T00:00:00+02:00');
    const s = await fs.getDocs(fs.query(fs.collection(db, 'messages'), fs.where('sentAt', '>=', from), fs.orderBy('sentAt', 'asc')));
    MS.list = s.docs.map(x2 => { const m = x2.data(), at = m.sentAt && m.sentAt.toDate ? m.sentAt.toDate() : null; return at && { d: U.dk(at), title: m.title || '', who: m.who, kind: m.kind, total: m.total || 0, ch: m.ch || {}, mailScope: m.mailScope, tracker: m.tracker || null }; }).filter(Boolean);
  } catch (e) { console.error(e); MS.err = e.message || String(e); MS.list = []; }
  finally { MS.loading = false; U.C.rerender(); }
}
function msgTo(m) {
  const tr = m.tracker;
  if (tr && typeof tr.id === 'number') return { to: [tr.id], tag: true };
  if (m.total < 20) return { to: [] };   // הודעות אישיות / בדיקות – לא רלוונטי לקבוצה
  return m.who === 'fans' ? { to: [1, 3, 4, 5] } : { to: [3, 6] };
}
const CH_L = { push: 'פוש', app: 'באפליקציה', mail: 'מייל', wa: 'וואטסאפ' };
const msgsFor = id => (MS.list || []).map(m => ({ ...m, ...msgTo(m) })).filter(m => m.to.includes(id) && m.d >= S.snap)
  .map(m => ({ ...m, chs: Object.keys(CH_L).filter(k => m.ch[k]).map(k => CH_L[k]).join(' · ') + ` · ${U.f(m.total)} נמענים${m.tag && m.tracker.label ? ' · ' + m.tracker.label : m.tag ? '' : ' · הודעה כללית'}` }));

// ── התקופה ──────────────────────────────────────────────────────────────────────────────────
const PRESETS = [['today', 'היום'], ['yday', 'אתמול'], ['7', '7 ימים'], ['14', '14 ימים'], ['all', 'מאז הצילום'], ['custom', 'תאריכים']];
function per() {
  const T = U.D.today, k = S.pk;
  if (k !== 'custom' || !S.from) {
    if (k === 'today') S.from = S.to = T; else if (k === 'yday') S.from = S.to = U.addDays(T, -1);
    else if (k === '14') { S.from = U.addDays(T, -13); S.to = T; } else if (k === 'all') { S.from = S.snap; S.to = T; } else { S.from = U.addDays(T, -6); S.to = T; }
  }
  if (S.from < S.snap) S.from = S.snap; if (S.to > T) S.to = T; if (S.to < S.from) S.to = S.from;
  const n = U.dayDiff(S.from, S.to) + 1;
  return { from: S.from, to: S.to, n, pa: U.addDays(S.from, -n), pb: U.addDays(S.from, -1) };
}
const dt = (cls, txt) => `<span class="yzt-dt ${cls}">${txt}</span>`;
// יום אחד – מול היום הקודם; כמה ימים – ממוצע ליום מול התקופה הקודמת באותו אורך (רק ימים שיש עליהם נתונים)
function cmp(id, P) {
  const s = series(id), a = s.filter(x => x.d >= P.from && x.d <= P.to), b = s.filter(x => x.d >= P.pa && x.d <= P.pb);
  const now = a.reduce((t, x) => t + x.out, 0), bef = b.reduce((t, x) => t + x.out, 0);
  if (!b.length) return { now, html: dt('n', 'אין ימים לפני התקופה להשוואה (הנתונים מיום הצילום)'), short: dt('n', '–') };
  if (a.length === 1 && b.length === 1) { const d = now - bef; return { now, html: d ? dt(d > 0 ? 'g' : 'r', `${d > 0 ? '▲' : '▼'} ${U.f(Math.abs(d))} מהיום הקודם (${U.f(bef)})`) : dt('n', '= כמו היום הקודם'), short: d ? dt(d > 0 ? 'g' : 'r', `${d > 0 ? '▲' : '▼'} ${U.f(Math.abs(d))}`) + ' ' + dt('n', `מול ${U.f(bef)}`) : dt('n', '= כמו אתמול') }; }
  // §746 – רמי: בכמות, לא באחוזים. כמה יצאו בתקופה מול כמה יצאו בתקופה הקודמת באותו אורך
  const d = now - bef, part = b.length < a.length ? ` · בתקופה הקודמת יש נתונים רק על ${b.length} ימים` : '';
  return { now, html: d ? dt(d > 0 ? 'g' : 'r', `${d > 0 ? '▲' : '▼'} ${U.f(Math.abs(d))} מהתקופה הקודמת`) + `<div class="yzt-dt n">${U.f(now)} עכשיו מול ${U.f(bef)} ב-${b.length} הימים שלפני${part}</div>` : dt('n', '= כמו התקופה הקודמת'),
    short: d ? dt(d > 0 ? 'g' : 'r', `${d > 0 ? '▲' : '▼'} ${U.f(Math.abs(d))}`) + ' ' + dt('n', `מול ${U.f(bef)} בתקופה הקודמת`) : dt('n', '= כמו קודם') };
}
function effect(id, m) {
  const s = series(id).filter(x => !x.part), i = s.findIndex(x => x.d === m.d);
  if (i < 0) return `<div class="yzt-ef"><b class="t">📨 ${U.short(m.d)} · ${U.esc(m.title)}</b><div class="yzu-note">${m.chs}</div><div class="yzu-note">נשלחה היום – המספרים יופיעו מחר.</div></div>`;
  const sum = a => a.reduce((x2, y) => x2 + y.out, 0), bef = s.slice(Math.max(0, i - 3), i), aft = s.slice(i, i + 3);
  const avB = bef.length ? sum(bef) / bef.length : 0, avA = aft.length ? sum(aft) / aft.length : 0, pct = avB ? Math.round((avA - avB) / avB * 100) : 0;
  return `<div class="yzt-ef"><b class="t">📨 ${U.short(m.d)} · ${U.esc(m.title)}</b><div class="yzu-note">${m.chs}</div>
    <div class="row"><span>ביום ההודעה יצאו</span><b>${U.f(s[i].out)}</b></div>
    <div class="row"><span>ממוצע ליום – ${bef.length} ימים לפני</span><b>${bef.length ? avB.toFixed(1) : '–'}</b></div>
    <div class="row"><span>ממוצע ליום – ${aft.length} ימים מההודעה</span><b>${avA.toFixed(1)} ${bef.length ? dt(avA > avB ? 'g' : avA < avB ? 'r' : 'n', `${avA > avB ? '▲' : avA < avB ? '▼' : '='} ${Math.abs(avA - avB).toFixed(1)} ליום`) : ''}</b></div>
    ${aft.length < 3 ? '<div class="yzu-note">עוד לא עברו 3 ימים – המספר יתעדכן.</div>' : ''}</div>`;
}
function perBar(P) {
  return `<div class="yzt-per"><b>תקופה:</b>${PRESETS.map(([k, l]) => `<button class="yzt-pb${S.pk === k ? ' on' : ''}" onclick="yztPer('${k}')">${l}</button>`).join('')}
    <span>מ- <input type="date" value="${P.from}" min="${S.snap}" max="${U.D.today}" onchange="yztPer('custom',this.value,null)"></span>
    <span>עד <input type="date" value="${P.to}" min="${S.snap}" max="${U.D.today}" onchange="yztPer('custom',null,this.value)"></span>
    <span class="rng">${U.short(P.from)}${P.from !== P.to ? '–' + U.short(P.to) : ''} · ${P.n} ימים · הנתונים מיום הצילום (${U.short(S.snap)})</span></div>`;
}
window.yztPer = (k, from, to) => {
  if (k !== 'custom') { S.pk = k; S.from = ''; }
  else { if (S.pk !== 'custom') S.pk = 'custom'; if (from) { S.from = from; if (S.to < from) S.to = from; } if (to) { S.to = to; if (S.from > to) S.from = to; } }
  U.C.rerender();
};
function daysHtml(id, t, P) {
  const lbl = OUT_LBL[id], all = series(id), s = all.filter(x => x.d >= P.from && x.d <= P.to), last = s[s.length - 1] || all[all.length - 1];
  const c = cmp(id, P), ms = msgsFor(id), by = {}; ms.forEach(m => (by[m.d] || (by[m.d] = [])).push(m));
  const mx = Math.max(1, ...s.map(x => x.out));
  const chart = `<div class="yzt-chart">${s.map(x => { const m = by[x.d]; return `<div class="col${m ? ' sent' : ''}">${m ? `<span class="pin" title="${U.esc(m.map(z => z.title).join(' | '))}">📨</span>` : ''}<div class="v">${U.f(x.out)}</div><div class="bar${x.part ? ' part' : ''}" style="height:${Math.round(Math.max(0, x.out) / mx * 130)}px"></div></div>`; }).join('')}</div>
    <div class="yzt-xl">${s.map(x => `<span>${U.short(x.d)}</span>`).join('')}</div>`;
  const rows = [...s].reverse().map(x => { const m = by[x.d] || [], i = all.findIndex(z => z.d === x.d), pv = i > 0 ? all[i - 1] : null, d = pv ? x.out - pv.out : null;
    return `<tr class="${m.length ? 'sent' : ''}"><td>${U.short(x.d)}${x.part ? ' <span class="yzu-note">(היום, חלקי)</span>' : ''}${x.d === S.snap ? ' <span class="yzu-note">(יום הצילום)</span>' : ''}</td>
      <td class="n"><b>${U.f(x.out)}</b></td><td class="n">${d == null ? dt('n', '–') : d ? dt(d > 0 ? 'g' : 'r', `${d > 0 ? '▲' : '▼'} ${U.f(Math.abs(d))}`) : dt('n', '=')}</td>
      <td class="n">${U.f(x.left)}</td><td class="n">${U.f(x.group)}</td><td>${m.map(z => `<span class="yzt-tag">📨 ${U.esc(z.title)} · ${z.chs}</span>`).join('<br>') || '<span class="yzu-note">–</span>'}</td></tr>`; }).join('');
  const effs = ms.filter(m => m.d >= P.from && m.d <= P.to).map(m => effect(id, m)).join('');
  return `<div class="yzu-box yzt-days"><h3>לפי ימים</h3>
    <div class="yzt-kp"><div class="k"><small>${lbl} בתקופה</small><b>${U.f(c.now)}</b>${c.html}</div><div class="k"><small>נשארו בסוף התקופה (${U.short(last.d)})</small><b>${U.f(last.left)}</b></div><div class="k"><small>${lbl} מאז הצילום</small><b>${U.f(t.start.length - last.left)}</b></div><div class="k"><small>📨 הודעות בתקופה</small><b>${ms.filter(m => m.d >= P.from && m.d <= P.to).length}</b></div></div>
    <div class="yzu-note" style="margin:4px 0 2px">עמודה = כמה ${lbl} באותו יום · 📨 = יצאה הודעה שהגיעה לקבוצה (מסגרת כחולה) · פסים = היום, עוד לא נגמר${MS.loading ? ' · טוען הודעות…' : ''}${MS.err ? ` · ⚠️ טעינת ההודעות נכשלה: ${U.esc(MS.err)}` : ''}</div>
    ${chart}
    <div class="yzu-tw" style="margin-top:10px"><table><tr><th>יום</th><th class="n">${lbl}</th><th class="n">מול היום הקודם</th><th class="n">נשארו מהצילום</th><th class="n">בקבוצה באותו יום</th><th>הודעות שיצאו</th></tr>${rows}</table></div>
    <p class="yzu-note">החץ: <span class="yzt-dt g">▲ ירוק</span> = יותר ${lbl} מהיום הקודם (טוב), <span class="yzt-dt r">▼ אדום</span> = פחות. "בקבוצה באותו יום" כולל גם מי שהצטרף אחרי יום הצילום.</p>
    <h3 style="margin-top:12px">האם ההודעה עבדה?</h3><p class="yzu-note" style="margin:0 0 8px">לכל הודעה בתקופה: כמה ${lbl} ביום ההודעה וב-3 הימים אחריה, מול 3 הימים שלפניה. גם בלי הודעה המספר יורד עם הזמן – זה מראה אם הייתה קפיצה.</p>
    ${effs ? `<div class="yzt-eff">${effs}</div>` : '<div class="yzu-note">בתקופה הזו לא יצאה הודעה שהגיעה לקבוצה.</div>'}</div>`;
}

// ══ §745 — "השבוע": לוח של שבוע הפניות לפלחים (§741) – מה עושים בכל יום, באיזה מעקב, ואם כבר נשלח ══
// הסטטוס מחושב ממה שכבר נשלח מהכפתורים (אותו "כבר קיבלו" של לוח הפנייה) – לא מסמנים ידנית.
const WEEK = { from: '2026-11-09', to: '2026-11-15', days: [
  { d: '2026-11-09', t: 'נכנסו פעם אחת ולא חזרו', id: 5, steps: ['now', 'mail'], how: 'שני הכפתורים: קודם פוש + באפליקציה, אחר כך מייל למי שאין פוש. נשלח לכל מי שבקבוצה היום ולא נראה 3+ ימים – יותר מ"נשארו" בכרטיס, שסופר רק את מי שהיה בקבוצה ביום הצילום (28.10)' },
  { d: '2026-11-10', t: 'אושרו ולא נכנסו אף פעם', id: 1, steps: ['d7'], how: 'מייל "אושרת – והעסקים מחכים" (עם הקוד)' },
  { d: '2026-11-11', t: 'ותיקים שלא חזרו', id: 4, steps: ['now'], how: 'מייל "מאז שנרשמת – התמלאה בעסקים" (עם הקוד)' },
  { d: '2026-11-12', t: 'בעלי עסק בלי האפליקציה', id: 3, steps: ['wa', 'mail'], how: 'וואטסאפ – כפתור בכל שורה ברשימה (אתה לוחץ "שלח" בוואטסאפ), ואחר כך מייל משלים לכולם' },
  { d: '2026-11-13', t: 'לא שולחים – מודדים', measure: [5, 1], how: 'במעקב 5 ובמעקב 1: "לפי ימים" → "האם ההודעה עבדה?"' },
  { d: '2026-11-15', t: 'סיכום + גל שני', measure: [5, 1, 4, 3], how: 'עוברים על כל ארבעת המעקבים ומחליטים יחד למי שולחים שוב' }] };
const DOW_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const dowOf = k => DOW_HE[new Date(k + 'T12:00:00Z').getUTCDay()];
function weekHtml() {
  const today = U.D.today;
  if (today > U.addDays(WEEK.to, 2)) return '';
  if (S.wk === false) return `<div class="yzt-wk closed"><button class="yzu-btn" onclick="yztSet('wk',true)">▸ השבוע: מה עושים בכל יום (${U.short(WEEK.from)}–${U.short(WEEK.to)})</button></div>`;
  const rows = WEEK.days.map(w => {
    const isToday = w.d === today, past = w.d < today;
    if (w.measure) {
      return `<tr class="${isToday ? 'today' : ''}"><td><b>${dowOf(w.d)} ${U.short(w.d)}</b>${isToday ? '<div class="yzt-now">היום</div>' : ''}</td><td><b>${w.t}</b><div class="yzu-note">${w.how}</div></td>
        <td>${w.measure.map(id => `<button class="yzu-btn" onclick="yztWeekGo(${id})">מעקב ${id}</button>`).join(' ')}</td><td><span class="yzu-note">${past ? '–' : 'אין מה לשלוח'}</span></td></tr>`;
    }
    const t = tracker(w.id), st = w.steps.map(k => { const i = (t.plan || []).findIndex(p => p.k === k), p = t.plan[i]; return p && { k, i, p, s: stageSplit(w.id, p) }; }).filter(Boolean);
    const sentOf = x => x.s.got > 0 && x.s.last && U.dk(x.s.last) >= WEEK.from;
    const done = st.length && st.every(sentOf);
    const btns = st.map(x => {
      if (x.p.wa) return `<button class="yzu-btn" onclick="yztWeekGo(${w.id},true)">💬 לרשימת הוואטסאפ (${U.f(x.s.due.length)})</button>`;
      return x.s.due.length ? `<button class="yzu-btn on" onclick="yztWeekSend(${w.id},'${x.k}')">לשלוח: ${(docFor(w.id, x.k) || {}).ch && docFor(w.id, x.k).ch.push ? 'פוש + באפליקציה' : 'מייל'} ל-${U.f(x.s.due.length)}</button>` : '';
    }).join(' ');
    const stat = st.map(x => sentOf(x) ? `<div class="yzt-got">✓ ${x.p.w.replace('עכשיו · ', '')}: ${U.f(x.s.got)} · ${x.s.last.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</div>` : '').join('');
    const measureOn = st.filter(sentOf).map(x => U.short(U.addDays(U.dk(x.s.last), 3)))[0];
    const badge = done ? `<span class="yzt-ok">✓ נשלח</span>${measureOn ? `<div class="yzu-note">למדוד ב-${measureOn} (72 שעות)</div>` : ''}`
      : stat ? '<span class="yzt-part">חלקית</span>' : past ? '<span class="yzt-late">⚠️ לא נשלח</span>' : isToday ? '<span class="yzt-now">היום</span>' : '<span class="yzu-note">מתוכנן</span>';
    return `<tr class="${isToday ? 'today' : ''}${done ? ' done' : ''}"><td><b>${dowOf(w.d)} ${U.short(w.d)}</b></td><td><b>${w.t}</b> <span class="yzu-note">· מעקב ${w.id}</span><div class="yzu-note">${w.how}</div>${stat}</td>
      <td>${done ? `<button class="yzu-btn" onclick="yztWeekGo(${w.id})">למעקב ${w.id}</button>` : btns || `<button class="yzu-btn" onclick="yztWeekGo(${w.id})">למעקב ${w.id}</button>`}</td><td>${badge}</td></tr>`;
  }).join('');
  return `<div class="yzt-wk"><div class="hd"><h3>📅 השבוע: מה עושים בכל יום</h3><span class="yzu-note">${U.short(WEEK.from)}–${U.short(WEEK.to)} · הסטטוס מתעדכן לבד ממה שנשלח מהכפתורים${GOT.map ? '' : ' · טוען…'}</span><button class="yzu-btn" onclick="yztSet('wk',false)">▾ לקפל</button></div>
    <div class="yzu-tw"><table><tr><th>יום</th><th>מה</th><th>מה לוחצים</th><th>סטטוס</th></tr>${rows}</table></div>
    <p class="yzu-note">"לשלוח" פותח את מרכז ההודעות עם הנמענים והנוסח המוכן – בודקים, משנים אם צריך, ושולחים שם. בראש מרכז ההודעות צריך להופיע "📌 מגיע מהמעקבים"; בלעדיו השליחה לא תיספר כאן.</p></div>`;
}
window.yztWeekGo = (id, list) => { S.cur = id; U.C.rerender(); setTimeout(() => { const el = document.querySelector(list ? '.yzt-waed' : '.yzu-det'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); };
window.yztWeekSend = (id, k) => { S.cur = id; const i = (tracker(id).plan || []).findIndex(p => p.k === k); if (i >= 0) window.yztSend(i); };

// §744 – בכרטיס: כמה יצאו בתקופה + חץ, וכמה הודעות
function tilePer(id, P) {
  const c = cmp(id, P), n = msgsFor(id).filter(m => m.d >= P.from && m.d <= P.to).length;
  return `<div class="yzt-tp">בתקופה: <b>${U.f(c.now)}</b> ${OUT_LBL[id]} · ${c.short}<div class="ms">${n ? `📨 ${n} הודעות בתקופה` : '📨 אין הודעות בתקופה'}</div></div>`;
}
export function html() {
  if (!U.D) return '<div class="placeholder-note">טוען…</div>';
  if (!GOT.map && !GOT.loading && !GOT.err) loadGot();
  if (!MS.loading && (!MS.list || MS.snap !== S.snap)) loadMsgs();
  const t = tracker(S.cur), f = U.f, today = U.D.today, P = per();
  const tiles = TRK.map(([id, nm, unit]) => {
    const r = tracker(id), st = r.start.length, done = st - r.left.length;
    return `<button class="yzu-tile${S.cur === id ? ' on' : ''}" onclick="yztSet('cur',${id})"><div class="nm"><span>${id}. ${nm}</span><i>${unit}</i></div>
      <div class="big">${f(r.left.length)} <small>נשארו מתוך ${f(st)}</small></div><div class="yzt-prog"><i style="width:${U.W(done, st)}%"></i></div><div class="pct">${f(done)} ${r.sinceLbl || 'התחברו מאז'} ${U.short(S.snap)}</div>${tilePer(id, P)}</button>`;
  }).join('');
  const k = (cls, l, n, sub) => `<div class="yzt-k ${cls}"><small>${l}</small><b>${f(n)}</b><div class="sub">${sub || '&nbsp;'}</div></div>`;
  const charts = (t.charts || []).map(c => { const mx = Math.max(1, ...c.rows.map(r => r[1])); return `<div class="yzu-box"><h3>${c.t}</h3>${c.rows.map(([l, n, cls]) => U.hb(l, n, mx, cls || '')).join('')}</div>`; }).join('');
  const plan = t.noChannel ? `<div class="yzt-nochan">${t.noChannel}</div>` : `<div class="yzu-box"><h3>לוח פנייה</h3><p class="yzu-note" style="margin:0 0 8px">כל שלב יוצא בפוש למי שהפעיל התראות, ובמייל לכולם – במרכז ההודעות. "ממתינים עכשיו" = מי שנשאר בקבוצה, הגיע לשלב, <b>ועוד לא קיבל אותו</b>.</p>
    <table><tr><th>מתי</th><th>מה</th><th class="n">ממתינים עכשיו</th><th class="n">כבר קיבלו</th><th></th></tr>
    ${t.plan.map((p, i) => { const s = stageSplit(S.cur, p);
      return `<tr><td><span class="yzt-when">${p.w}</span></td><td>${p.what}</td><td class="n"><b>${f(s.due.length)}</b><div class="yzu-note" style="margin:0">פוש ${f(s.due.filter(m => { const q = U.C.pushInfo(m); return q && q.app; }).length)} · מייל ${f(s.due.filter(m => m.email).length)}</div></td>
      <td class="n">${GOT.map || p.wa ? (s.got ? `<b class="yzt-got">✓ ${f(s.got)}</b><div class="yzu-note" style="margin:0">${s.last ? 'אחרון ' + s.last.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : ''}</div>` : '–') : '…'}</td>
      <td>${p.wa ? '<span class="yzu-note">ברשימה למטה</span>' : s.due.length ? `<button class="yzu-btn on" onclick="yztSend(${i})">לשלוח ל-${f(s.due.length)}</button>` : '<span class="yzu-note">אין למי</span>'}</td></tr>`; }).join('')}</table>
    <p class="yzu-note">"לשלוח" פותח את מרכז ההודעות עם מי שעוד לא קיבל כבר מסומן, ועם הנוסח המוכן של השלב (אם יש) – עורכים שם ושולחים. כשהשליחה יוצאת משם – היא נרשמת כאן, ואותם אנשים לא יופיעו שוב באותו שלב.${GOT.err ? ` ⚠️ טעינת "מי קיבל" נכשלה: ${U.esc(GOT.err)}` : ''}</p></div>`;
  if (t.list && !TXT.loaded) loadTexts();
  const waBox = t.list ? `<div class="yzt-waed"><div class="hd"><b>💬 נוסח הוואטסאפ</b>${TXT.wa3 ? '<span class="yzu-note">נוסח שערכת</span>' : '<span class="yzu-note">הנוסח המוכן</span>'}
      ${S.waEdit ? '' : `<button class="yzu-btn" onclick="yztSet('waEdit',true)">✏️ לערוך</button>`}</div>
    ${S.waEdit ? `<textarea id="yztWaTxt" rows="7" dir="rtl" oninput="yztWaDraft(this.value)">${U.esc(S.waDraft != null ? S.waDraft : waTpl())}</textarea>
      <div class="yzu-note">{name} = השם הפרטי · {business} = שם העסק · {how} = הדרך שלו להיכנס, ולמי שעם קוד – גם הקוד. נשמר לכל מי שנכנס למרכז הניהול.</div>
      <div class="bt"><button class="yzu-btn on" ${TXT.saving ? 'disabled' : ''} onclick="yztWaSave()">${TXT.saving ? 'שומר…' : 'לשמור'}</button><button class="yzu-btn" onclick="yztSet('waEdit',false)">ביטול</button>${TXT.wa3 ? '<button class="yzu-btn" onclick="yztWaSave(true)">לחזור לנוסח המוכן</button>' : ''}</div>`
      : `<div class="pv">${U.esc(waTpl())}</div>`}
    ${TXT.err ? `<div class="yzu-note" style="color:var(--yzu-bad)">⚠️ ${U.esc(TXT.err)}</div>` : ''}</div>` : '';
  const list = t.list ? `<div class="yzu-box"><h3>הרשימה – ${f(t.list.length)} שנשארו</h3>${waBox}<div class="yzu-tw"><table>
    <tr><th>עסק</th><th>בעלים</th><th>טלפון</th><th>נכנס עם</th><th>כניסה אחרונה</th><th>וואטסאפ</th><th>נשלח</th></tr>
    ${t.list.map(m => { const b = t.owners.get(m.id), ph = m.phone || b.ownerPhone || ''; const href = waHref(ph, waText(m, b));
      return `<tr><td>${U.esc(b.name)}</td><td>${U.esc(m.name || '')}</td><td>${U.esc(ph)}</td><td>${methodOf(m)}</td><td>${m.lastSeenAt ? U.esc(m.lastSeenAt.toLocaleDateString('he-IL')) : 'אף פעם'}</td>
      <td>${href ? `<a class="yzt-wa" href="${href}" target="_blank" rel="noopener" onclick="yztWa('${m.id}')">וואטסאפ</a>` : '–'}</td>
      <td>${WA[m.id] || m.waNudgeAt ? `<span class="yzt-got">✓ ${(WA[m.id] || m.waNudgeAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</span>${m.waNudgeCount > 1 ? ` <span class="yzu-note">(${m.waNudgeCount} פעמים)</span>` : ''}` : '–'}</td></tr>`; }).join('')}</table></div>
    <p class="yzu-note">ההודעה כוללת את הדרך שלו – ולמי שנכנס עם קוד, גם את הקוד. נפתחת בוואטסאפ שלך, עם הנוסח מוכן; שולחים משם. הלחיצה נרשמת ("נשלח"), ומי שכבר קיבל מיום הצילום יוצא מ"ממתינים".</p></div>` : '';
  return `<div class="yzu">${U.css()}${css()}
    <div class="yzt-src"><b>מקור מספרים אחד:</b> מעקבי חברים – מרשומת החבר וימי הכניסה שלו (מי שהגיע לדף הבית). "הורידו ולא נרשמו" – לפי טלפון. <b>צילום</b> = מי שהיה בקבוצה בתחילת יום הצילום; "מאז" = מתוכם, מי שיצא מהקבוצה.
      <span style="white-space:nowrap">יום הצילום: <input type="date" value="${S.snap}" min="${U.addDays(U.LAUNCH, 1)}" max="${today}" onchange="yztSet('snap',this.value)"></span></div>
    ${weekHtml()}
    ${perBar(P)}
    <div class="yzu-tiles">${tiles}</div>
    <div class="yzu-det"><h2>${S.cur}. ${TRK.find(r => r[0] === S.cur)[1]}</h2><p class="yzu-def">${t.def}</p>
      <div class="yzt-three">${k('start', 'בהתחלה', t.start.length, t.startSub || `צילום ${U.short(S.snap)}`)}${k('since', t.sinceLbl || 'התחברו מאז', t.since.length, t.sinceSub)}${k('left', 'נשארו', t.left.length, t.leftSub)}</div>
      ${t.extra ? `<div class="yzt-extra">${t.extra}</div>` : ''}
      ${daysHtml(S.cur, t, P)}
      ${flowHtml(t)}
      ${legacyHtml()}
      <div class="yzu-cols"><div>${charts}</div><div>${plan}</div></div>${list}</div></div>`;
}

window.yztSet = (k, v) => { if (k === 'knows') S.knows = !S.knows; else S[k] = v; if (k === 'waEdit') S.waDraft = null; U.C.rerender(); };
// טיוטת הוואטסאפ נשמרת בזיכרון – רינדור מחדש (נתונים חיים) לא מוחק את מה שהוקלד
window.yztWaDraft = (v) => { S.waDraft = v; };
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
  // §744 – הנוסח המוכן של השלב נכנס למרכז ההודעות; עורכים שם ושולחים בכפתור
  const doc = docFor(S.cur, p.k);
  if (p.biz) { if (s.dueBiz.length) U.C.openSend('biz', s.dueBiz, trk, doc); }
  else if (s.due.length) U.C.openSend('fans', s.due.map(m => m.id), trk, doc);
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
  .yzt-per{display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:#fff;border:1px solid var(--yzu-line);border-radius:12px;padding:8px 11px;margin-bottom:12px;font-size:13px}
  .yzt-pb{border:1px solid var(--yzu-line);background:#fff;border-radius:999px;padding:4px 11px;font:inherit;font-size:13px;cursor:pointer}.yzt-pb.on{background:var(--yzu-blue);border-color:var(--yzu-blue);color:#fff}
  .yzt-per input{font:inherit;font-size:13px;border:1px solid var(--yzu-line);border-radius:8px;padding:3px 6px}.yzt-per .rng{color:var(--yzu-muted);margin-inline-start:auto}
  .yzt-dt{font-size:12px;font-weight:700}.yzt-dt.g{color:var(--yzu-ok)}.yzt-dt.r{color:var(--yzu-bad)}.yzt-dt.n{color:var(--yzu-muted);font-weight:400}
  .yzt-tp{border-top:1px dashed var(--yzu-line);margin-top:6px;padding-top:5px;font-size:12px;line-height:1.6}.yzt-tp .ms{color:var(--yzu-blue)}
  .yzt-kp{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px}@media(max-width:760px){.yzt-kp{grid-template-columns:1fr 1fr}}
  .yzt-kp .k{border:1px solid var(--yzu-line);border-radius:12px;padding:8px 11px;background:#FCFCFA}.yzt-kp small{display:block;color:var(--yzu-muted);font-size:12px}.yzt-kp b{font-size:22px;display:block}
  .yzt-chart{height:180px;display:flex;align-items:flex-end;gap:5px;padding:26px 4px 0;border-bottom:1px solid var(--yzu-line)}
  .yzt-chart .col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative}
  .yzt-chart .bar{width:100%;max-width:44px;background:var(--yzu-ok);border-radius:6px 6px 0 0;min-height:2px}.yzt-chart .bar.part{background:repeating-linear-gradient(45deg,var(--yzu-ok),var(--yzu-ok) 4px,#7cc59b 4px,#7cc59b 8px)}
  .yzt-chart .v{font-size:11px;font-weight:700;margin-bottom:2px}.yzt-chart .pin{position:absolute;top:-22px;font-size:14px;cursor:help}.yzt-chart .col.sent .bar{box-shadow:0 0 0 2px var(--yzu-blue)}
  .yzt-xl{display:flex;gap:5px;padding:0 4px}.yzt-xl span{flex:1;text-align:center;font-size:11px;color:var(--yzu-muted)}
  .yzt-days tr.sent td{background:#EEF3FB}.yzt-tag{display:inline-block;border-radius:8px;padding:1px 7px;font-size:12px;margin:1px 0;background:#DCE7F8;color:var(--yzu-blue)}
  .yzt-eff{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px}.yzt-ef{border:1px solid var(--yzu-line);border-radius:12px;padding:9px 11px;background:#FCFCFA;font-size:13px}.yzt-ef b.t{display:block;margin-bottom:3px}
  .yzt-ef .row{display:flex;justify-content:space-between;border-top:1px dashed var(--yzu-line);padding:4px 0}
  .yzt-wk{border:2px solid var(--yzu-acc);background:#FFFDF3;border-radius:14px;padding:10px 12px;margin-bottom:12px}.yzt-wk.closed{border-width:1px;padding:6px 10px}.yzt-wk .hd{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}.yzt-wk h3{margin:0;font-size:16px}.yzt-wk .hd .yzu-btn{margin-inline-start:auto}
  .yzt-wk tr.today td{background:#FFF4C2}.yzt-wk tr.done td{opacity:.75}.yzt-wk td .yzu-btn{margin:2px 0}
  .yzt-now{display:inline-block;background:var(--yzu-acc);border-radius:6px;padding:1px 7px;font-weight:800;font-size:12px}.yzt-ok{color:var(--yzu-ok);font-weight:800}.yzt-late{color:var(--yzu-bad);font-weight:700}.yzt-part{color:#B45309;font-weight:700}
  .yzt-waed{border:1px solid #BFE3CC;background:#F3FBF6;border-radius:10px;padding:9px 11px;margin-bottom:10px}.yzt-waed .hd{display:flex;gap:8px;align-items:center;margin-bottom:6px}.yzt-waed .hd .yzu-btn{margin-inline-start:auto}
  .yzt-waed .pv{white-space:pre-line;font-size:13px;background:#DCF8C6;border-radius:10px;padding:7px 10px;line-height:1.6}
  .yzt-waed textarea{width:100%;font:inherit;font-size:13.5px;line-height:1.6;border:1px solid var(--yzu-line);border-radius:8px;padding:7px 9px;box-sizing:border-box}.yzt-waed .bt{display:flex;gap:6px;margin-top:6px}
  .yzt-got{color:var(--yzu-ok);font-weight:700}.yzt-wa{font-size:12px;font-weight:700;background:#1FA855;color:#fff;border-radius:8px;padding:5px 9px;text-decoration:none;white-space:nowrap}
  </style>`;
}
