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
  // §763 – גל שני (15.11) רק למי שקיבל את הפוש של 9.11 ולא חזר: פותחים בצורך, לא בהצהרה. בפוש אין {name}
  '5|w2': { ch: { app: true, push: true, mail: false, wa: false },
    push: { title: 'צריכים חשמלאי, מסעדה או צלם לאירוע? 💛', body: `לפני שמחפשים בגוגל – בודקים מי מהאוהדים כבר ב-Yellow Zone. ${BIZ_N} עסקים, כל אחד עם הטבה רק לחברים.` },
    app: { title: 'לפני שמחפשים בגוגל', text: `צריכים חשמלאי, מסעדה, צלם לאירוע או מתנה?
שווה לבדוק קודם ב-Yellow Zone – ${BIZ_N} עסקים של אוהדים כבר כאן, כל אחד עם הטבה רק לחברים.
הם פרגנו לקבוצה כל השנים – עכשיו התור שלנו להחזיר באהבה 💛`, link: '' } },
  '5|mail': { ch: { app: false, push: false, mail: true, wa: false },   // §752 – מכתב אישי (ב-9.11 יצא ממותג ונחת ב'קידומי מכירות')
    mail: { subject: '{name}, לפני שמחפשים בגוגל', body: `היי {name},
כאן רמי מ-Yellow Zone.

מאז שנכנסת בהשקה נוספו לאפליקציה עוד עסקים של אוהדים – חשמלאים, מסעדות, צלמים לאירועים, מתנות. כל אחד עם הטבה רק לחברים.

בפעם הבאה שצריכים משהו – שווה לבדוק קודם אצלנו:

{link}

ואם משהו לא עבד לך באפליקציה – פשוט עונים למייל הזה, אני קורא הכול.

רמי`, personal: true } },
  '1|*': { ch: { app: false, push: false, mail: true, wa: false },
    mail: { subject: '{name}, אושרת ל-Yellow Zone 💛', body: `היי {name},\n\nאושרת ל-Yellow Zone 🎉 והעסקים של האוהדים כבר מחכים לך.\n\n${MAIL_FANS_BIZ}\n\nהגיע הזמן להתחיל לקנות כחול צהוב 💛💙\n\nפותחים את Yellow Zone בטלפון שנרשמת ממנו. לא נכנס לבד? נכנסים עם מספר הטלפון והקוד שלך:\n{code}\n\n{link}\n\nרמי, Yellow Zone 💛`, personal: true } },
  // §752ד – תזכורת 'יום 7': קצרה ושונה מהמייל הראשון ('1|*' משמש את יום 2 ויום 14)
  '1|d7': { ch: { app: false, push: false, mail: true, wa: false },
    mail: { subject: '{name}, משהו לא עבד בכניסה?', body: `היי {name},
שמתי לב שעוד לא נכנסת ל-Yellow Zone מאז שאושרת.

אם משהו נתקע – הכי פשוט: פותחים את Yellow Zone בטלפון שנרשמת ממנו. לא נכנס לבד? נכנסים עם מספר הטלפון והקוד שלך:
{code}

אין לך את האפליקציה?

{link}

ואם עדיין לא מסתדר – עונים למייל הזה ואני אעזור.

רמי`, personal: true } },
  // §765 – "הקהילה כבר בפנים – בלעדיך". מכתב אישי: {link} יוצא כקישור טקסט (§560), לכן שורת "לוחצים כאן" מעליו
  '4|now': { ch: { app: false, push: false, mail: true, wa: false },
    mail: { subject: '{name}, הקהילה כבר בפנים – חסר רק אותך', body: `היי {name},
כאן רמי מ-Yellow Zone.

נרשמת אלינו עוד לפני ההשקה – ומאז Yellow Zone התמלאה.
${MAIL_FANS_BIZ}

אבל כרגע כל זה קורה בלעדיך.
האוהדים כבר קונים זה מזה, ממליצים אחד לשני, ומחזירים לעסקים שפרגנו לקבוצה כל השנים. הקהילה הזאת נבנית מכל מי שמצטרף – ואנחנו רוצים אותך איתנו.

כל מה שצריך: להוריד את האפליקציה ולהיכנס עם מספר הטלפון והקוד שלך:

{code}

להורדת האפליקציה – לוחצים כאן:

{link}

מתחילים לקנות כחול צהוב 💛💙
רמי`, personal: true } },
  // לעסק {link} = ניהול העסק – לכן קישור ההורדה כתוב קבוע (מהמחשב הם נכנסים מהקישור באזור האישי)
  '3|mail': { ch: { app: false, push: false, mail: true, wa: false },
    mail: { subject: '{business} – באפליקציה מחכים לך עדכונים', body: 'היי {name},\n\nהאוהדים כבר רואים את {business} באפליקציה של Yellow Zone.\n\nבאפליקציה מחכים לך עדכונים שיביאו לעסק יותר חשיפה ויותר עסקאות.\n\nמורידים את האפליקציה ונכנסים כמו שנרשמת:\nhttps://yellowzone.co.il/download\n\nרמי, Yellow Zone 💛', personal: true } },
};
const docFor = (id, k) => DOCS[id + '|' + k] || DOCS[id + '|*'] || null;
// הוואטסאפ במעקב 3 – נערך במסך ונשמר ב-settings/trackerTexts.wa3. {how} = הדרך שלו להיכנס (והקוד, אם הוא עם קוד)
const WA_DEFAULT = 'היי {name}, כאן רמי מ-Yellow Zone 💛\n{business} כבר באפליקציה, והאוהדים רואים את העסק.\nבאפליקציה מחכים לך עדכונים שיביאו לעסק יותר חשיפה ויותר עסקאות – מורידים כאן:\nhttps://yellowzone.co.il/download\n{how}';
// §764 – וואטסאפ אישי במעקב 1 (אושרו ולא נכנסו): המייל של 10.11 נפתח ב-117 ונלחץ ב-9 – רמי: "חייב פתרון אחר".
// {how} = "פותחים בטלפון שנרשמת ממנו" + הטלפון והקוד שלו. מבקשים לענות – כדי שנדע מה נתקע.
const WA1_DEFAULT = `היי {name}, כאן רמי מ-Yellow Zone 💛
ההרשמה שלך אושרה, ו${BIZ_N} עסקים של אוהדים כבר מחכים לך באפליקציה – כל אחד עם הטבה רק לחברים.
ראיתי שעוד לא נכנסת – משהו נתקע?
{how}
אין לך את האפליקציה? https://yellowzone.co.il/download
לא מסתדר? פשוט עונים לי כאן ואני אעזור 🙏`;
const WA_DEF = { wa3: WA_DEFAULT, wa1: WA1_DEFAULT };
const TXT = { wa3: null, wa1: null, loaded: false, loading: false, saving: false, err: '' };
async function loadTexts() {
  if (TXT.loading || TXT.loaded) return;
  TXT.loading = true;
  try { const { db, fs } = U.C, s = await fs.getDoc(fs.doc(db, 'settings', 'trackerTexts')), d = s.exists() ? s.data() : {}; TXT.wa3 = d.wa3 || null; TXT.wa1 = d.wa1 || null; }
  catch (e) { console.error(e); TXT.err = e.message || String(e); }
  finally { TXT.loading = false; TXT.loaded = true; U.C.rerender(); }
}
const waKeyOf = id => id === 1 ? 'wa1' : 'wa3';
const waTpl = (key = waKeyOf(S.cur)) => TXT[key] || WA_DEF[key];
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
    const reach = left.concat(out);   // §752 – לוח הפנייה: הצילום + מי שאושר מאז
    const fan = m => !(m.isBusinessOwner || m.linkedBusinessId);   // בעלי עסק – במעקב 3 / 6, ולא מופיעים ברשימת האוהדים של מרכז ההודעות
    // §764 – רשימת הוואטסאפ: כל אוהד שאושר לפני יומיים ומעלה ועדיין לא נכנס. מי שפתח את המייל – ראשון
    const opened = GOT.open1 || new Set();
    const waList = reach.filter(m => fan(m) && age(m) >= 2).sort((a, b) => (opened.has(b.id) - opened.has(a.id)) || (age(b) - age(a)));
    return { start, since, left, outside: out, people: true, list: waList, opened,
      def: 'אוהדים שנרשמו מההשקה, אושרו לפני יום הצילום, ולא נכנסו אף פעם אחרי האישור (לא הגיעו לדף הבית).',
      sinceSub: `${since.filter(pushOn).length} מהם כבר עם פוש`,
      leftSub: `פוש ${left.filter(pushOn).length} · מייל ${left.filter(m => m.email).length}`,
      extra: out.length ? `מחוץ לצילום: <b>${U.f(out.length)}</b> שאושרו מיום הצילום ועוד לא נכנסו – גם הם בלוח הפנייה, כשמגיעים לשלב.` : '',
      charts: [{ t: 'כמה זמן עבר מהאישור (מי שנשאר)', rows: [['יום אחד', left.filter(m => age(m) <= 1).length], ['יומיים', left.filter(m => age(m) === 2).length], ['3–6 ימים', left.filter(m => age(m) >= 3 && age(m) <= 6).length, 'hot'], ['7 ימים ויותר', left.filter(m => age(m) >= 7).length, 'hot']] },
        { t: 'באיזו דרך נרשמו (מי שנשאר)', rows: Object.entries(by(left, methodOf)).sort((a, b) => b[1] - a[1]) },
        { t: 'אפשר להגיע אליהם ב-', rows: [['מייל', left.filter(m => m.email).length], ['↳ מייל מוסתר של Apple (כמעט לא נפתח)', left.filter(m => /privaterelay/i.test(m.email || '')).length], ['פוש', left.filter(pushOn).length]] }],
      // §752 – לוח הפנייה כולל גם מי שאושר אחרי יום הצילום (out): הוא באותו מצב, ובלעדיו 71 אוהדים לא קיבלו את 'יום 7' ב-10.11
      plan: [
        { k: 'wa', w: '12.11 · וואטסאפ', what: 'וואטסאפ אישי ממך – הכפתור בכל שורה ברשימה למטה. מי שפתח את המייל ולא נכנס – ראשון', ids: waList, wa: true },
        { k: 'd2', w: 'יום 2', what: 'מייל "אושרת – פותחים את Yellow Zone ונכנסים לבד"; למי שהחליף טלפון – הדרך והקוד', ids: reach.filter(m => fan(m) && age(m) >= 2) },
        { k: 'd7', w: 'יום 7', what: 'תזכורת במייל', ids: reach.filter(m => fan(m) && age(m) >= 7) },
        { k: 'd14', w: 'יום 14', what: 'מייל אחרון עם הטבות השבוע, ואז "רדום"', ids: reach.filter(m => fan(m) && age(m) >= 14) }],
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
      def: 'אוהדים מאושרים (בלי בעלי עסק) שנכנסו לאפליקציה ביום אחד בלבד – ותיקים נספרים מההשקה. מי שנכנס ביום נוסף "חזר" ויוצא מהקבוצה; מי שנכנס בפעם הראשונה מצטרף אליה.',
      sinceSub: `${since.filter(pushOn).length} מהם עם פוש`,
      leftSub: `פוש ${left.filter(pushOn).length} · מייל בלבד ${left.filter(m => !pushOn(m) && m.email).length} · ${left.filter(x.isVet).length} ותיקים`,
      extra: `לשליחה עכשיו: <b>${U.f(due.length)}</b> – כל מי שבקבוצה היום (גם מי שהצטרף אליה אחרי יום הצילום) ולא נראה 3 ימים ומעלה.`,
      charts: [{ t: 'כמה זמן עבר מהכניסה היחידה (לשליחה)', rows: [['3–6 ימים', due.filter(m => ago(m) <= 6).length], ['7–13 ימים', due.filter(m => ago(m) >= 7 && ago(m) <= 13).length, 'hot'], ['14 ימים ויותר', due.filter(m => ago(m) >= 14).length, 'hot']] },
        { t: 'אפשר להגיע אליהם ב- (לשליחה)', rows: [['פוש', due.filter(pushOn).length], ['מייל בלבד (אין פוש)', due.filter(m => !pushOn(m) && m.email).length]] }],
      plan: [
        { k: 'now', w: 'עכשיו · פוש', what: 'פוש + הודעה באפליקציה – למי שיש פוש', ids: due.filter(pushOn) },
        { k: 'mail', w: 'עכשיו · מייל', what: 'מייל – למי שאין לו פוש (אף אחד לא מקבל פעמיים)', ids: due.filter(m => !pushOn(m) && m.email) },
        // §763 – גל שני: רק מי שקיבל את הפוש הראשון ועדיין בקבוצה (לא חזר). מי שהצטרף לקבוצה אחר כך – בשלב "עכשיו · פוש"
        { k: 'w2', w: '15.11 · גל שני · פוש', what: 'פוש בנוסח חדש ("צריכים חשמלאי, מסעדה או צלם לאירוע?") – רק למי שקיבל את הפוש הראשון ולא חזר', ids: due.filter(pushOn).filter(m => gotOf(5, 'now').has(m.id)) }] };
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
  return waTpl('wa3').replace(/\{name\}/g, m.firstName || '').replace(/\{business\}/g, b.name || '').replace(/\{how\}/g, how);
}
// §764 – לאוהד במעקב 1: באותו טלפון נכנסים לבד (§612); מטלפון אחר – טלפון + קוד עובד לכל אחד (גם Google / Apple)
function waText1(m) {
  const code = m.loginCode || (window.memberCodeOf && window.memberCodeOf(m.id)) || '';
  if (!code && window.needMemberCodes) window.needMemberCodes([m.id]);
  const how = `פותחים את Yellow Zone בטלפון שנרשמת ממנו – נכנסים לבד. מטלפון אחר: נכנסים עם מספר הטלפון שלך והקוד${code ? `: *${code}*` : ' שקיבלת במייל'}`;
  return waTpl('wa1').replace(/\{name\}/g, m.firstName || '').replace(/\{how\}/g, how);
}
// §744 – עריכת הנוסח: נשמר לכולם (settings/trackerTexts), ומהלחיצה הבאה הכפתור שולח אותו
window.yztWaSave = async (reset) => {
  const el = document.getElementById('yztWaTxt'), v = reset ? '' : (el ? el.value.trim() : '');
  if (!reset && !v) return;
  if (!reset && !v.includes('{how}') && !confirm('בנוסח אין {how} – השורה עם הדרך להיכנס והקוד לא תופיע. לשמור בכל זאת?')) return;
  TXT.saving = true; TXT.err = ''; U.C.rerender();
  const key = waKeyOf(S.cur);
  try { const { db, fs } = U.C; await fs.setDoc(fs.doc(db, 'settings', 'trackerTexts'), { [key]: v || null, [key + 'At']: new Date() }, { merge: true }); TXT[key] = v || null; S.waEdit = false; S.waDraft = null; }
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
  const { db, fs } = U.C, map = {}, open1 = new Set();
  try {
    const ms = await fs.getDocs(fs.query(fs.collection(db, 'messages'), fs.where('tracker.id', 'in', [1, 3, 4, 5, 6])));
    await Promise.all(ms.docs.map(async m => {
      const md = m.data(), tr = md.tracker || {}, key = tr.id + '|' + tr.stage, at = md.sentAt && md.sentAt.toDate ? md.sentAt.toDate() : null;
      const rs = await fs.getDocs(fs.collection(db, 'messages', m.id, 'recipients'));
      const g = map[key] || (map[key] = new Map());
      rs.docs.forEach(r => { const prev = g.get(r.id); if (!prev || (at && at > prev)) g.set(r.id, at); if (+tr.id === 1 && r.data().mailOpenedAt) open1.add(r.id); });   // §764 – פתחו מייל של מעקב 1
    }));
    GOT.map = map; GOT.open1 = open1;
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

// ══ §748 — "כמה בקבוצה בכל יום" (רמי: "אני רוצה לראות תזוזה ומגמה… כמה היינו ומה השיפור") ═══════════
// series(id) = לכל יום מההשקה עד היום: group = כמה בקבוצה בסוף היום, out = כמה יצאו ממנה באותו יום
// (נכנסו / חזרו / נרשמו – השיפור), inn = כמה הצטרפו אליה (חדשים שנכנסו לקבוצה). group(היום) − group(אתמול) = inn − out.
// מגדירים לכל מעקב מי בקבוצה ביום d (inG), ומשווים יום ליום – לכן המספרים זזים כל יום.
let SER = {}, SERkey = '';
function series(id) {
  const x = U.base(), h = hist(), L = U.LAUNCH, today = U.D.today, C = U.C;
  const key = U.D.loadedAt.getTime() + ':' + x.fans.length + ':' + (C.biz() || []).length;
  if (SERkey !== key) { SER = {}; SERkey = key; }
  if (SER[id]) return SER[id];
  const days = []; for (let d = L; d <= today; d = U.addDays(d, 1)) days.push(d);
  const arr = set => set ? [...set].sort() : [];
  const md = new Map(); const mdOf = m => { let a = md.get(m.id); if (!a) md.set(m.id, a = arr(x.memDays[m.id])); return a; };
  const firstIn = (a, from) => a.find(k => k >= from) || '';   // היום הראשון מ-from שבו נכנס
  const dkOf = d => d ? U.dk(d) : '';
  const owner = m => !!(m.isBusinessOwner || m.linkedBusinessId);
  // לכל ישות: [מתי נכנסה לקבוצה, מתי יצאה ממנה ('' = עדיין בה)] – בקבוצה ביום d אם from <= d ו-(אין to או to > d)
  let span = [];
  if (id === 1) span = x.fans.filter(m => !x.isVet(m) && m.status === 'approved' && m.approvedAt && dkOf(m.approvedAt) >= L)
    .map(m => [dkOf(m.approvedAt), firstIn(mdOf(m), '0')]);
  else if (id === 2) span = Object.keys(x.devFirst).filter(dv => x.devFirst[dv] >= L).map(dv => [x.devFirst[dv], h.devLink[dv] || '']);
  else if (id === 3) {
    const own = new Map(); (C.biz() || []).forEach(b => { if (b.ownerMemberId && b.status === 'approved' && x.byId.has(b.ownerMemberId) && !own.has(b.ownerMemberId)) own.set(b.ownerMemberId, b); });
    span = [...own].map(([mid, b]) => [b.approvedAt && dkOf(b.approvedAt) > L ? dkOf(b.approvedAt) : L, firstIn(arr(h.appDays[mid]), '0')]);
  } else if (id === 4) span = x.fans.filter(m => m.status === 'approved' && x.isVet(m)).map(m => [L, firstIn(mdOf(m), L)]);
  else if (id === 5) span = x.fans.filter(m => m.status === 'approved' && !owner(m)).map(m => { const a = mdOf(m).filter(k => k >= (x.isVet(m) ? L : U.MEASURE_FROM)); return a.length ? [a[0], a[1] || ''] : null; }).filter(Boolean);
  else span = (C.biz() || []).filter(b => b.registeredAtKnown && (b.status === 'pending' || (b.status === 'approved' && b.approvedAt))).map(b => [dkOf(b.registeredAt) < L ? L : dkOf(b.registeredAt), b.status === 'approved' ? dkOf(b.approvedAt) : '']);
  // מי שיצא באותו יום שנכנס (למשל נרשם ונכנס באותו יום) – לא היה בקבוצה בסוף אף יום
  span = span.filter(([a, b]) => a && (!b || b > a));
  const inG = ([a, b], d) => a <= d && (!b || b > d);
  let prev = null;
  return (SER[id] = days.map(d => {
    const group = span.filter(s => inG(s, d)).length;
    const out = prev ? span.filter(s => s[1] === d && s[0] < d).length : 0;
    const inn = prev ? span.filter(s => s[0] === d).length : group;
    prev = d;
    return { d, group, out, inn, part: d === today };
  }));
}

// ── 📨 הודעות שיצאו מיום הצילום: מתויגת-מעקב → המעקב שלה; כללית לכל האוהדים → 1,3,4,5; לעסקים → 3,6 ──
// רק המסמכים של ההודעות (בלי שורות הנמענים) – כמה עשרות קריאות.
const MS = { list: null, loading: false, err: '', snap: '' };
async function loadMsgs() {
  if (MS.loading) return;
  MS.loading = true; MS.err = ''; MS.snap = S.snap;
  try {
    const { db, fs } = U.C, from = new Date(U.addDays(U.LAUNCH, -1) + 'T00:00:00+02:00');
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
const msgsFor = id => (MS.list || []).map(m => ({ ...m, ...msgTo(m) })).filter(m => m.to.includes(id) && m.d >= U.LAUNCH)
  .map(m => ({ ...m, chs: Object.keys(CH_L).filter(k => m.ch[k]).map(k => CH_L[k]).join(' · ') + ` · ${U.f(m.total)} נמענים${m.tag && m.tracker.label ? ' · ' + m.tracker.label : m.tag ? '' : ' · הודעה כללית'}` }));

// ── התקופה (§748: מההשקה, לא מיום הצילום) ─────────────────────────────────────────────────────
const PRESETS = [['today', 'היום'], ['yday', 'אתמול'], ['7', '7 ימים'], ['14', '14 ימים'], ['all', 'מאז ההשקה'], ['custom', 'תאריכים']];
function per() {
  const T = U.D.today, k = S.pk, L = U.LAUNCH;
  if (k !== 'custom' || !S.from) {
    if (k === 'today') S.from = S.to = T; else if (k === 'yday') S.from = S.to = U.addDays(T, -1);
    else if (k === '14') { S.from = U.addDays(T, -13); S.to = T; } else if (k === 'all') { S.from = L; S.to = T; } else { S.from = U.addDays(T, -6); S.to = T; }
  }
  if (S.from < L) S.from = L; if (S.to > T) S.to = T; if (S.to < S.from) S.to = S.from;
  return { from: S.from, to: S.to, n: U.dayDiff(S.from, S.to) + 1 };
}
const dt = (cls, txt) => `<span class="yzt-dt ${cls}">${txt}</span>`;
// §748 – גובה לפי הטווח של התקופה (לא מאפס), כדי שתזוזה קטנה תיראה. lo..hi → min..max פיקסלים
const hScale = (vals, min, max) => { const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.25 || 1; return v => Math.round(min + (v - (lo - pad)) / (hi - lo + pad) * (max - min)); };
// בקבוצה: ירידה = טוב (ירוק), עלייה = רע (אדום)
const chg = (d, tail) => d ? dt(d < 0 ? 'g' : 'r', `${d < 0 ? '▼' : '▲'} ${U.f(Math.abs(d))}${tail || ''}`) : dt('n', `= ללא שינוי${tail || ''}`);
// כמה היו בתחילת התקופה (סוף היום שלפני), כמה בסוף, ומה קרה בדרך
function perSum(id, P) {
  const s = series(id), a = s.filter(x => x.d >= P.from && x.d <= P.to), i0 = s.findIndex(x => x.d === P.from);
  // תקופה שמתחילה ביום ההשקה – אין יום לפני; מתחילים מסוף יום ההשקה (העמודות עדיין מציגות אותו)
  const before = i0 > 0 ? s[i0 - 1] : (a.length > 1 ? a[0] : null), end = a[a.length - 1] || s[s.length - 1];
  const run = before === a[0] ? a.slice(1) : a;
  return { a, before, end, startN: before ? before.group : 0, out: run.reduce((t, x) => t + x.out, 0), inn: run.reduce((t, x) => t + x.inn, 0) };
}
function effect(id, m) {
  const s = series(id).filter(x => !x.part), i = s.findIndex(x => x.d === m.d);
  if (i < 0) return `<div class="yzt-ef"><b class="t">📨 ${U.short(m.d)} · ${U.esc(m.title)}</b><div class="yzu-note">${m.chs}</div><div class="yzu-note">נשלחה היום – המספרים יופיעו מחר בבוקר.</div></div>`;
  const sum = a => a.reduce((x2, y) => x2 + y.out, 0), bef = s.slice(Math.max(0, i - 3), i), aft = s.slice(i, i + 3);
  const avB = bef.length ? sum(bef) / bef.length : 0, avA = aft.length ? sum(aft) / aft.length : 0;
  return `<div class="yzt-ef"><b class="t">📨 ${U.short(m.d)} · ${U.esc(m.title)}</b><div class="yzu-note">${m.chs}</div>
    <div class="row"><span>${OUT_LBL[id]} ביום ההודעה</span><b>${U.f(s[i].out)}</b></div>
    <div class="row"><span>ממוצע ליום – ${bef.length} ימים לפני</span><b>${bef.length ? avB.toFixed(1) : '–'}</b></div>
    <div class="row"><span>ממוצע ליום – ${aft.length} ימים מההודעה</span><b>${avA.toFixed(1)} ${bef.length ? dt(avA > avB ? 'g' : avA < avB ? 'r' : 'n', `${avA > avB ? '▲' : avA < avB ? '▼' : '='} ${Math.abs(avA - avB).toFixed(1)} ליום`) : ''}</b></div>
    ${aft.length < 3 ? '<div class="yzu-note">עוד לא עברו 3 ימים – המספר יתעדכן.</div>' : ''}</div>`;
}
function perBar(P) {
  return `<div class="yzt-per"><b>תקופה:</b>${PRESETS.map(([k, l]) => `<button class="yzt-pb${S.pk === k ? ' on' : ''}" onclick="yztPer('${k}')">${l}</button>`).join('')}
    <span>מ- <input type="date" value="${P.from}" min="${U.LAUNCH}" max="${U.D.today}" onchange="yztPer('custom',this.value,null)"></span>
    <span>עד <input type="date" value="${P.to}" min="${U.LAUNCH}" max="${U.D.today}" onchange="yztPer('custom',null,this.value)"></span>
    <span class="rng">${U.short(P.from)}${P.from !== P.to ? '–' + U.short(P.to) : ''} · ${P.n} ימים · הנתונים מההשקה (${U.short(U.LAUNCH)})</span></div>`;
}
window.yztPer = (k, from, to) => {
  if (k !== 'custom') { S.pk = k; S.from = ''; }
  else { if (S.pk !== 'custom') S.pk = 'custom'; if (from) { S.from = from; if (S.to < from) S.to = from; } if (to) { S.to = to; if (S.from > to) S.from = to; } }
  U.C.rerender();
};
function daysHtml(id, t, P) {
  const lbl = OUT_LBL[id], all = series(id), ps = perSum(id, P), s = ps.a, ms = msgsFor(id), by = {}; ms.forEach(m => (by[m.d] || (by[m.d] = [])).push(m));
  const nMs = ms.filter(m => m.d >= P.from && m.d <= P.to).length, met = S.met || 'group', gm = met === 'start' ? 'group' : met;
  const from14 = U.addDays(P.to, -13), cs = all.filter(x => x.d >= (P.from < from14 ? P.from : from14) && x.d <= P.to && (gm === 'group' || x.d > U.LAUNCH));
  const val = x => x[gm], vals = cs.map(val);
  const sc = gm === 'group' ? hScale(vals, 8, 130) : (v => Math.round(4 + v / Math.max(1, ...vals) * 126));
  const MET = { start: `כמה בקבוצה בסוף כל יום – ${ps.before ? U.short(ps.before.d) : 'ההשקה'} ("היו") מסומן`, group: 'כמה בקבוצה בסוף כל יום (הגובה לפי הטווח, לא מאפס)', out: `כמה ${lbl} בכל יום – השיפור`, inn: 'כמה הצטרפו לקבוצה בכל יום' };
  const chart = `<div class="yzt-chart ${gm}">${cs.map(x => { const m = by[x.d], dim = x.d < P.from, mk = met === 'start' && ps.before && x.d === ps.before.d; return `<div class="col${m ? ' sent' : ''}${dim && !mk ? ' dim' : ''}${mk ? ' mk' : ''}">${m ? `<span class="pin" title="${U.esc(m.map(z => z.title).join(' | '))}">📨</span>` : ''}<div class="v">${U.f(val(x))}</div><div class="bar${x.part ? ' part' : ''}" style="height:${sc(val(x))}px"></div></div>`; }).join('')}</div>
    <div class="yzt-xl">${cs.map(x => `<span class="${x.d < P.from ? 'dim' : ''}">${U.short(x.d)}</span>`).join('')}</div>`;
  const rows = [...s].reverse().map(x => { const m = by[x.d] || [], i = all.findIndex(z => z.d === x.d), pv = i > 0 ? all[i - 1] : null;
    return `<tr class="${m.length ? 'sent' : ''}"><td>${U.short(x.d)}${x.part ? ' <span class="yzu-note">(היום, עוד לא נגמר)</span>' : ''}${x.d === U.LAUNCH ? ' <span class="yzu-note">(ההשקה)</span>' : ''}</td>
      <td class="n"><b>${U.f(x.group)}</b></td><td class="n">${pv ? chg(x.group - pv.group) : dt('n', '–')}</td>
      <td class="n">${pv ? `<b class="yzt-got">${U.f(x.out)}</b>` : '–'}</td><td class="n">${pv ? U.f(x.inn) : '–'}</td>
      <td>${m.map(z => `<span class="yzt-tag">📨 ${U.esc(z.title)} · ${z.chs}</span>`).join('<br>') || '<span class="yzu-note">–</span>'}</td></tr>`; }).join('');
  const effs = ms.filter(m => m.d >= P.from && m.d <= P.to).map(m => effect(id, m)).join('');
  return `<div class="yzu-box yzt-days"><h3>כמה בקבוצה – יום אחרי יום</h3>
    <div class="yzt-kp">
      <div class="k sel${met === 'start' ? ' on' : ''}" onclick="yztSet('met','start')"><small>${ps.before ? `היו ב-${U.short(ps.before.d)}` : 'בהשקה'}</small><b>${U.f(ps.startN)}</b></div>
      <div class="k sel${met === 'group' ? ' on' : ''}" onclick="yztSet('met','group')"><small>בקבוצה עכשיו${ps.end.d !== U.D.today ? ` (${U.short(ps.end.d)})` : ''}</small><b>${U.f(ps.end.group)}</b>${ps.before ? chg(ps.end.group - ps.startN, ' בתקופה') : ''}</div>
      <div class="k good sel${met === 'out' ? ' on' : ''}" onclick="yztSet('met','out')"><small>✓ ${lbl} בתקופה – השיפור</small><b>${U.f(ps.out)}</b><div class="yzt-dt n">יצאו מהקבוצה לכיוון הטוב</div></div>
      <div class="k sel${met === 'inn' ? ' on' : ''}" onclick="yztSet('met','inn')"><small>+ הצטרפו לקבוצה בתקופה</small><b>${U.f(ps.inn)}</b><div class="yzt-dt n">חדשים שנכנסו לקבוצה${nMs ? ` · 📨 ${nMs} הודעות` : ''}</div></div></div>
    <div class="yzu-note" style="margin:4px 0 2px"><b>בגרף: ${MET[met]}</b> · לוחצים על ריבוע כדי להחליף · מוצגים לפחות 14 ימים – מה שלפני התקופה בהיר · 📨 = יצאה הודעה שהגיעה לקבוצה (מסגרת כחולה) · פסים = היום, עוד לא נגמר${MS.loading ? ' · טוען הודעות…' : ''}${MS.err ? ` · ⚠️ טעינת ההודעות נכשלה: ${U.esc(MS.err)}` : ''}</div>
    ${chart}
    <div class="yzu-tw" style="margin-top:10px"><table><tr><th>יום</th><th class="n">בקבוצה</th><th class="n">שינוי מאתמול</th><th class="n">✓ ${lbl}</th><th class="n">+ הצטרפו</th><th>הודעות שיצאו</th></tr>${rows}</table></div>
    <p class="yzu-note"><span class="yzt-dt g">▼ ירוק</span> = הקבוצה קטנה (טוב), <span class="yzt-dt r">▲ אדום</span> = גדלה. השינוי מאתמול = מי שהצטרפו פחות מי ש${lbl}. קבוצה יכולה לגדול גם כשהרבה ${lbl} – אם הצטרפו אליה עוד יותר.</p>
    <h3 style="margin-top:12px">האם ההודעה עבדה?</h3><p class="yzu-note" style="margin:0 0 8px">לכל הודעה בתקופה: כמה ${lbl} ביום ההודעה וב-3 הימים אחריה, מול 3 הימים שלפניה. הנתונים של יום נסגרים בבוקר שלמחרת.</p>
    ${effs ? `<div class="yzt-eff">${effs}</div>` : '<div class="yzu-note">בתקופה הזו לא יצאה הודעה שהגיעה לקבוצה.</div>'}</div>`;
}

// ══ §745 — "השבוע": לוח של שבוע הפניות לפלחים (§741) – מה עושים בכל יום, באיזה מעקב, ואם כבר נשלח ══
// הסטטוס מחושב ממה שכבר נשלח מהכפתורים (אותו "כבר קיבלו" של לוח הפנייה) – לא מסמנים ידנית.
const WEEK = { from: '2026-11-09', to: '2026-11-15', days: [
  { d: '2026-11-09', t: 'נכנסו פעם אחת ולא חזרו', id: 5, steps: ['now', 'mail'], how: 'שני הכפתורים: קודם פוש + באפליקציה, אחר כך מייל למי שאין פוש.' },
  { d: '2026-11-10', t: 'אושרו ולא נכנסו אף פעם', id: 1, steps: ['d2'], how: 'מייל "אושרת ל-Yellow Zone 💛" (עם הקוד) · שלב "יום 2" (הראשון) · ל-331 אוהדים' },
  { d: '2026-11-11', t: 'ותיקים שלא חזרו', id: 4, steps: ['now'], how: 'מייל "מאז שנרשמת – התמלאה בעסקים" (עם הקוד)' },
  { d: '2026-11-12', t: 'בעלי עסק בלי האפליקציה', id: 3, steps: ['wa', 'mail'], how: 'וואטסאפ – כפתור בכל שורה ברשימה (אתה לוחץ "שלח" בוואטסאפ), ואחר כך מייל משלים לכולם' },
  { d: '2026-11-12', t: 'אושרו ולא נכנסו – וואטסאפ אישי', id: 1, steps: ['wa'], how: 'המייל של 10.11 נפתח ב-117 ונלחץ ב-9 – עכשיו וואטסאפ ממך: כפתור בכל שורה, קודם מי שפתח את המייל ("רק מי שפתח")' },   // §764
  { d: '2026-11-13', t: 'לא שולחים – מודדים', measure: [5, 1], how: 'במעקב 5 ובמעקב 1: "לפי ימים" → "האם ההודעה עבדה?"' },
  { d: '2026-11-15', t: 'תזכורת: אושרו ועדיין לא נכנסו', id: 1, steps: ['d7'], how: 'מייל "{name}, משהו לא עבד בכניסה?" (עם הקוד) · שלב "יום 7" – 5 ימים אחרי "יום 2", רק למי שעדיין לא נכנס (המספר על הכפתור)' },   // §752ה
  { d: '2026-11-15', t: 'גל שני: נכנסו פעם אחת ולא חזרו', id: 5, steps: ['w2'], how: 'פוש + באפליקציה בנוסח חדש "צריכים חשמלאי, מסעדה או צלם לאירוע? 💛" · רק למי שקיבל את הפוש של 9.11 ולא חזר (בשעות הערב – רוב הכניסות הגיעו תוך שעה)' },   // §763
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

// §748 – בכרטיס: כמה בקבוצה עכשיו, מגמה קטנה לפי ימים, וכמה היו בתחילת התקופה
function tilePer(id, P) {
  const ps = perSum(id, P), sc = hScale(ps.a.map(x => x.group), 3, 28), ms = msgsFor(id), n = ms.filter(m => m.d >= P.from && m.d <= P.to).length;
  const spark = ps.a.length > 1 ? `<div class="yzt-spark">${ps.a.map(x => `<i class="${ms.some(m => m.d === x.d) ? 'm' : ''}" style="height:${sc(x.group)}px" title="${U.short(x.d)}: ${U.f(x.group)}"></i>`).join('')}</div>` : '';
  return `${spark}<div class="yzt-tp">${ps.before ? `ב-${U.short(ps.before.d)} היו <b>${U.f(ps.startN)}</b> · ${chg(ps.end.group - ps.startN)}` : 'מההשקה'}
    <div>✓ ${U.f(ps.out)} ${OUT_LBL[id]} · + ${U.f(ps.inn)} הצטרפו</div><div class="ms">${n ? `📨 ${n} הודעות בתקופה` : '📨 אין הודעות בתקופה'}</div></div>`;
}
export function html() {
  if (!U.D) return '<div class="placeholder-note">טוען…</div>';
  if (!GOT.map && !GOT.loading && !GOT.err) loadGot();
  if (!MS.loading && !MS.list) loadMsgs();
  const t = tracker(S.cur), f = U.f, today = U.D.today, P = per();
  const tiles = TRK.map(([id, nm, unit]) => {
    const now = series(id), cur = now[now.length - 1];
    return `<button class="yzu-tile${S.cur === id ? ' on' : ''}" onclick="yztSet('cur',${id})"><div class="nm"><span>${id}. ${nm}</span><i>${unit}</i></div>
      <div class="big">${f(cur.group)} <small>בקבוצה עכשיו</small></div>${tilePer(id, P)}</button>`;
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
      <div class="yzu-note">${S.cur === 1 ? '{name} = השם הפרטי · {how} = "פותחים בטלפון שנרשמת ממנו – נכנסים לבד. מטלפון אחר: הטלפון והקוד" עם הקוד שלו' : '{name} = השם הפרטי · {business} = שם העסק · {how} = הדרך שלו להיכנס, ולמי שעם קוד – גם הקוד'}. נשמר לכל מי שנכנס למרכז הניהול.</div>
      <div class="bt"><button class="yzu-btn on" ${TXT.saving ? 'disabled' : ''} onclick="yztWaSave()">${TXT.saving ? 'שומר…' : 'לשמור'}</button><button class="yzu-btn" onclick="yztSet('waEdit',false)">ביטול</button>${TXT.wa3 ? '<button class="yzu-btn" onclick="yztWaSave(true)">לחזור לנוסח המוכן</button>' : ''}</div>`
      : `<div class="pv">${U.esc(waTpl())}</div>`}
    ${TXT.err ? `<div class="yzu-note" style="color:var(--yzu-bad)">⚠️ ${U.esc(TXT.err)}</div>` : ''}</div>` : '';
  const list = t.list && S.cur === 1 ? list1Html(t, waBox) : t.list ? `<div class="yzu-box"><h3>הרשימה – ${f(t.list.length)} שנשארו</h3>${waBox}<div class="yzu-tw"><table>
    <tr><th>עסק</th><th>בעלים</th><th>טלפון</th><th>נכנס עם</th><th>כניסה אחרונה</th><th>וואטסאפ</th><th>נשלח</th></tr>
    ${t.list.map(m => { const b = t.owners.get(m.id), ph = m.phone || b.ownerPhone || ''; const href = waHref(ph, waText(m, b));
      return `<tr><td>${U.esc(b.name)}</td><td>${U.esc(m.name || '')}</td><td>${U.esc(ph)}</td><td>${methodOf(m)}</td><td>${m.lastSeenAt ? U.esc(m.lastSeenAt.toLocaleDateString('he-IL')) : 'אף פעם'}</td>
      <td>${href ? `<a class="yzt-wa" href="${href}" target="_blank" rel="noopener" onclick="yztWa('${m.id}')">וואטסאפ</a>` : '–'}</td>
      <td>${WA[m.id] || m.waNudgeAt ? `<span class="yzt-got">✓ ${(WA[m.id] || m.waNudgeAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</span>${m.waNudgeCount > 1 ? ` <span class="yzu-note">(${m.waNudgeCount} פעמים)</span>` : ''}` : '–'}</td></tr>`; }).join('')}</table></div>
    <p class="yzu-note">ההודעה כוללת את הדרך שלו – ולמי שנכנס עם קוד, גם את הקוד. נפתחת בוואטסאפ שלך, עם הנוסח מוכן; שולחים משם. הלחיצה נרשמת ("נשלח"), ומי שכבר קיבל מיום הצילום יוצא מ"ממתינים".</p></div>` : '';
  return `<div class="yzu">${U.css()}${css()}
    <div class="yzt-src"><b>איך לקרוא:</b> המספר הגדול בכל כרטיס = <b>כמה בקבוצה עכשיו</b>, והעמודות הקטנות = איך זה זז בכל יום בתקופה. <span class="yzt-dt g">▼ ירוק</span> = הקבוצה קטנה – טוב. "✓" = כמה יצאו ממנה לכיוון הטוב (נכנסו / חזרו / נרשמו), "+" = כמה חדשים הצטרפו אליה. מקור: רשומות החברים וימי הכניסה (מי שהגיע לדף הבית), מההשקה.</div>
    ${weekHtml()}
    ${perBar(P)}
    <div class="yzu-tiles">${tiles}</div>
    <div class="yzu-det"><h2>${S.cur}. ${TRK.find(r => r[0] === S.cur)[1]}</h2><p class="yzu-def">${t.def}</p>
      ${daysHtml(S.cur, t, P)}
      ${t.extra ? `<div class="yzt-extra">${t.extra}</div>` : ''}
      <details class="yzt-snap"><summary>מתקדם: קבוצה קבועה מיום צילום (${U.short(S.snap)})</summary>
        <p class="yzu-note">כאן סופרים רק את מי שהיה בקבוצה ביום הצילום, ולא מוסיפים חדשים – כמה מהם כבר יצאו. משמש את לוח הפנייה של מעקבים 3 ו-4. במעקב 1 לוח הפנייה כולל גם מי שאושר אחרי יום הצילום. יום הצילום: <input type="date" value="${S.snap}" min="${U.addDays(U.LAUNCH, 1)}" max="${today}" onchange="yztSet('snap',this.value)"></p>
        <div class="yzt-three">${k('start', 'היו ביום הצילום', t.start.length, t.startSub || `צילום ${U.short(S.snap)}`)}${k('since', t.sinceLbl || 'התחברו מאז', t.since.length, t.sinceSub)}${k('left', 'מתוכם עדיין בקבוצה', t.left.length, t.leftSub)}</div></details>
      ${flowHtml(t)}
      ${legacyHtml()}
      <div class="yzu-cols"><div>${charts}</div><div>${plan}</div></div>${list}</div></div>`;
}

// §764 – רשימת הוואטסאפ של מעקב 1: מי שפתח את המייל ולא נכנס – ראשון; סינון "רק מי שפתח"; מי שכבר קיבל – בסוף
function list1Html(t, waBox) {
  const f = U.f, op = t.opened, sentAt = m => WA[m.id] || (m.waNudgeAt && U.dk(m.waNudgeAt) >= S.snap ? m.waNudgeAt : null);
  const all = t.list, nOpen = all.filter(m => op.has(m.id)).length, nSent = all.filter(sentAt).length;
  const rows = (S.waOpen ? all.filter(m => op.has(m.id)) : all).slice().sort((a, b) => (!!sentAt(a) - !!sentAt(b)));
  const age = m => m.approvedAt ? U.dayDiff(U.dk(m.approvedAt), U.D.today) : '';
  return `${stuckHtml(t, sentAt)}<div class="yzu-box"><h3>💬 וואטסאפ – ${f(all.length)} שאושרו ועדיין לא נכנסו</h3>${waBox}
    <div class="yzt-per" style="margin:0 0 8px"><button class="yzt-pb${S.waOpen ? '' : ' on'}" onclick="yztSet('waOpen',false)">כולם (${f(all.length)})</button><button class="yzt-pb${S.waOpen ? ' on' : ''}" onclick="yztSet('waOpen',true)">רק מי שפתח את המייל (${f(nOpen)})</button>
      <span class="rng">נשלחו ${f(nSent)} · נשארו ${f(all.length - nSent)}${GOT.map ? '' : ' · טוען מי פתח…'}</span></div>
    <div class="yzu-tw"><table><tr><th>שם</th><th>טלפון</th><th>נרשם עם</th><th>אושר לפני</th><th>המייל</th><th>וואטסאפ</th><th>נשלח</th></tr>
    ${rows.map(m => { const href = waHref(m.phone, waText1(m)), s = sentAt(m);
      return `<tr${s ? ' style="opacity:.55"' : ''}><td>${U.esc(m.name || '')}</td><td>${U.esc(m.phone || '')}</td><td>${methodOf(m)}</td><td>${age(m)} ימים</td>
      <td>${op.has(m.id) ? '<b class="yzt-got">פתח</b>' : '<span class="yzu-note">לא פתח</span>'}</td>
      <td>${href ? `<a class="yzt-wa" href="${href}" target="_blank" rel="noopener" onclick="yztWa('${m.id}')">וואטסאפ</a>` : '–'}</td>
      <td>${s ? `<span class="yzt-got">✓ ${s.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</span>` : '–'}</td></tr>`; }).join('')}</table></div>
    <p class="yzu-note">לחיצה על "וואטסאפ" פותחת את הוואטסאפ שלך עם ההודעה מוכנה, כולל הקוד שלו – שולחים משם. הלחיצה נרשמת ("נשלח"), והשורה יורדת לסוף הרשימה. מי שנכנס לאפליקציה יוצא מהרשימה לבד.</p></div>`;
}
// §768 – "תקועים": הטלפון שנרשם ממנו (usageDaily.submits) חזר לאפליקציה **אחרי** יום האישור, והוא עדיין לא נכנס.
// בטלפון הזה הכניסה אמורה להיות לבד (§612) – כלומר הוא ניסה ומשהו חסם. ב-11.11: 26 כאלה (21 iOS), רובם בלי פנייה.
// ⚠️ לא נתפסים כאן: טלפון שגם ההרשמה ממנו לא הגיעה למדידה (חסימה מלאה של Google, §766–§767) – אין לו submits.
function stuckOf(t) {
  const x = U.base();
  return t.list.map(m => {
    const d = x.subByMem[m.id];
    if (!d || !m.approvedAt) return null;
    const ap = U.dk(m.approvedAt), days = [...(x.devDays[d] || [])].filter(k => k > ap).sort();
    return days.length ? { m, n: days.length, last: days[days.length - 1] } : null;
  }).filter(Boolean).sort((a, b) => (b.n - a.n) || (a.last < b.last ? 1 : -1));
}
function stuckHtml(t, sentAt) {
  const rows = stuckOf(t), f = U.f;
  if (!rows.length) return '';
  const nSent = rows.filter(r => sentAt(r.m)).length;
  const sorted = rows.slice().sort((a, b) => !!sentAt(a.m) - !!sentAt(b.m));
  return `<div class="yzu-box yzt-stuck"><h3>🆘 תקועים – ${f(rows.length)} ניסו ולא הצליחו להיכנס</h3>
    <p class="yzu-note" style="margin:0 0 8px">הטלפון שממנו נרשמו חזר לאפליקציה <b>אחרי</b> האישור – ובטלפון הזה הכניסה אמורה להיות לבד. כלומר הם ניסו ומשהו חסם. לפנות אליהם קודם. נשלחו ${f(nSent)} · נשארו ${f(rows.length - nSent)}.</p>
    <div class="yzu-tw"><table><tr><th>שם</th><th>טלפון</th><th>מכשיר</th><th>אושר לפני</th><th>חזר אחרי האישור</th><th>אחרון</th><th>וואטסאפ</th><th>נשלח</th></tr>
    ${sorted.map(({ m, n, last }) => { const href = waHref(m.phone, waText1(m)), s = sentAt(m);
      return `<tr${s ? ' style="opacity:.55"' : ''}><td>${U.esc(m.name || '')}</td><td>${U.esc(m.phone || '')}</td><td>${m.signupOs === 'ios' ? 'אייפון' : m.signupOs === 'android' ? 'אנדרואיד' : '–'}</td>
      <td>${m.approvedAt ? U.dayDiff(U.dk(m.approvedAt), U.D.today) + ' ימים' : '–'}</td><td><b>${f(n)}</b> ${n === 1 ? 'יום' : 'ימים'}</td><td>${U.short(last)}</td>
      <td>${href ? `<a class="yzt-wa" href="${href}" target="_blank" rel="noopener" onclick="yztWa('${m.id}')">וואטסאפ</a>` : '–'}</td>
      <td>${s ? `<span class="yzt-got">✓ ${s.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</span>` : '–'}</td></tr>`; }).join('')}</table></div>
    <p class="yzu-note">אותו נוסח וואטסאפ של הרשימה למטה (עם הקוד שלו). מי שנכנס יוצא מכאן לבד. לא מופיעים כאן טלפונים שגם ההרשמה מהם לא נמדדה (חסימה מלאה של Google) – אותם מאתרים ידנית.</p></div>`;
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
  .yzt-spark{display:flex;align-items:flex-end;gap:2px;height:28px;margin:6px 0 2px}.yzt-spark i{flex:1;background:#C9D6EA;border-radius:2px 2px 0 0;min-width:2px}.yzt-spark i.m{background:var(--yzu-blue)}
  .yzt-kp .k.sel{cursor:pointer}.yzt-kp .k.sel:hover{border-color:var(--yzu-blue)}.yzt-kp .k.on{box-shadow:0 0 0 2px var(--yzu-blue) inset}
  .yzt-chart .col.mk .bar{background:var(--yzu-blue)}.yzt-chart .col.dim{opacity:.35}.yzt-xl span.dim{opacity:.45}.yzt-chart.inn .bar{background:var(--yzu-blue)}
  .yzt-kp .k.good{border-color:#BFE3CC;background:var(--yzu-ok-soft)}
  .yzt-snap{border:1px dashed var(--yzu-line);border-radius:10px;padding:7px 10px;margin:10px 0;font-size:13px}.yzt-snap summary{cursor:pointer;color:var(--yzu-blue)}.yzt-snap .yzt-three{margin-top:8px}
  .yzt-waed{border:1px solid #BFE3CC;background:#F3FBF6;border-radius:10px;padding:9px 11px;margin-bottom:10px}.yzt-waed .hd{display:flex;gap:8px;align-items:center;margin-bottom:6px}.yzt-waed .hd .yzu-btn{margin-inline-start:auto}
  .yzt-waed .pv{white-space:pre-line;font-size:13px;background:#DCF8C6;border-radius:10px;padding:7px 10px;line-height:1.6}
  .yzt-waed textarea{width:100%;font:inherit;font-size:13.5px;line-height:1.6;border:1px solid var(--yzu-line);border-radius:8px;padding:7px 9px;box-sizing:border-box}.yzt-waed .bt{display:flex;gap:6px;margin-top:6px}
  .yzt-stuck{border:2px solid #F5C7C2;background:#FFFAF9}.yzt-stuck h3{color:var(--yzu-bad)}
  .yzt-got{color:var(--yzu-ok);font-weight:700}.yzt-wa{font-size:12px;font-weight:700;background:#1FA855;color:#fff;border-radius:8px;padding:5px 9px;text-decoration:none;white-space:nowrap}
  </style>`;
}
