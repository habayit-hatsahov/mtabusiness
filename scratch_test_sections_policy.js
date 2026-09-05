// §414 — הרנס-בדיקה למנוע הסקשנים (sections-policy.js), מול נתוני פרודקשן חיים.
//
// 🔑 **הבדיקה מריצה את הקובץ עצמו** (window.HB_SECTIONS נטען מהמקור), לא לוגיקה
// שהוקלדה כאן — ר' feedback_verification_must_run_the_producer.
//
// 🔑 **וההוכחה המרכזית היא סימולציה של תקופות רצופות, לא צילום של תקופה אחת.** השאלה
// שהמנוע נועד לענות עליה היא "האם כל 62 העסקים באמת יקבלו חשיפה, ותוך כמה זמן" —
// ותקופה בודדת אינה יכולה להראות זאת. הסימולציה מריצה שבוע-אחרי-שבוע, רושמת היסטוריה
// בדיוק כמו שמרכז הניהול ירשום, ומודדת מתי כולם כוסו.
//
//   node scratch_test_sections_policy.js
//
const fs = require('fs');
const path = require('path');

// ── טעינת המודול האמיתי (script קלאסי שמצפה ל-window) ──
global.window = {};
new Function(fs.readFileSync(path.join(__dirname, 'sections-policy.js'), 'utf8')).call(global);
const S = global.window.HB_SECTIONS;
if (!S) throw new Error('sections-policy.js לא חשף את window.HB_SECTIONS');

const FS_URL = 'https://firestore.googleapis.com/v1/projects/habayit-hatsahov/databases/(default)/documents:runQuery';
const QUERY = { structuredQuery: { from: [{ collectionId: 'businesses' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } }, limit: 300 } };

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✔ ' + msg); } else { fail++; console.log('  ✘ ' + msg); } };
const head = (t) => console.log('\n── ' + t + ' ──');

// מדמה בדיוק את מה שמרכז הניהול יכתוב בסוף כל תקופה
function recordPeriod(state, sectionKey, periodIdx, list, range) {
  state.log.unshift({
    s: sectionKey, p: periodIdx,
    from: range.from.toISOString(), to: range.to.toISOString(),
    ids: list.map(b => b.id),
  });
  if (state.log.length > 120) state.log.length = 120;
}

(async () => {
  const res = await fetch(FS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(QUERY) });
  const g = (f, k) => { const v = f[k]; return v ? (v.stringValue ?? v.booleanValue ?? v.timestampValue ?? undefined) : undefined; };
  const arr = (f, k) => (f[k] && f[k].arrayValue && f[k].arrayValue.values) || [];
  const businesses = (await res.json()).filter(x => x.document).map(x => {
    const f = x.document.fields || {};
    return {
      id: x.document.name.split('/').pop(),
      name: g(f, 'name'),
      isFeatured: g(f, 'isFeatured'), featuredUntil: g(f, 'featuredUntil'),
      isNew: g(f, 'isNew'), newUntil: g(f, 'newUntil'),
      approvedAt: g(f, 'approvedAt'),
      clicks: Number((f.clicks && (f.clicks.integerValue ?? f.clicks.doubleValue)) || 0),
      likedBy: arr(f, 'likedBy').map(v => v.stringValue),
      hasDiscount: g(f, 'hasDiscount'), discountText: g(f, 'discountText'),
      logo: g(f, 'logo'), logoThumb: g(f, 'logoThumb'),
      coverPhoto: g(f, 'coverPhoto'), coverPhotoThumb: g(f, 'coverPhotoThumb'),
      desc: g(f, 'desc'), hours: g(f, 'hours'), hoursOther: g(f, 'hoursOther'),
      hoursDays: arr(f, 'hoursDays'), tags: arr(f, 'tags').map(v => v.stringValue),
      photos: arr(f, 'photos'), isSubscriber: g(f, 'isSubscriber'),
    };
  });
  const N = businesses.length;
  console.log('נתוני פרודקשן: ' + N + ' עסקים מאושרים');

  // ── כבוי = בדיוק ההתנהגות ההיסטורית ────────────────────────────────────────
  head('מצב כבוי — אפס שינוי באתר החי');
  const offPol = S.normalizePolicy({});
  const offF = S.buildFeatured(businesses, offPol, {});
  const offNew = S.buildNew(businesses, offPol, {});
  const manualF = businesses.filter(b => S.isFlaggedFeatured(b));
  const manualN = businesses.filter(b => S.isFlaggedNew(b));
  ok(!offF.enabled && offF.list.length === manualF.length, 'נבחרים כבוי מחזיר בדיוק את המסומנים ⭐ (' + manualF.length + ')');
  ok(!offNew.enabled && offNew.list.length === manualN.length, 'חדשים כבוי מחזיר בדיוק את המסומנים ✨ (' + manualN.length + ')');

  // ── נרמול ──────────────────────────────────────────────────────────────────
  head('נרמול — סכום שכבות שלא יכול לחרוג');
  const over = S.normalizePolicy({ featured: { size: 10, anchors: 8, opportunity: 7 } });
  ok(over.featured.anchors + over.featured.opportunity <= over.featured.size, 'עוגנים+הזדמנות נחתכים לגודל הסקשן (' + over.featured.anchors + '+' + over.featured.opportunity + ' ≤ ' + over.featured.size + ')');
  ok(S.rotationCount(over) >= 0, 'הסבב לעולם אינו שלילי (' + S.rotationCount(over) + ')');
  const neg = S.normalizePolicy({ featured: { size: -5, periodDays: 0 }, 'new': { days: -3, maxShown: 999 } });
  ok(neg.featured.size >= 1 && neg.featured.periodDays >= 1 && neg['new'].days >= 1 && neg['new'].maxShown <= 60, 'ערכים חריגים נחסמים לטווח שפוי');

  // ── "חדש אצלנו" — חלון-זמן, ללא תור ────────────────────────────────────────
  // 🔑 **ההבטחה היחידה שנבדקת כאן: עסק שאושר עכשיו מופיע עכשיו.** המשתמש דחה את
  // גרסת-התור בדיוק בגלל זה — "מי שנכנס לא מופיע ישר וזה בעייתי, מה גם שעסק שהצטרף
  // חדש פתאום מופיע אחרי חודש". שתי התכונות האלה נבדקות במפורש למטה.
  head('חדש אצלנו — חלון-זמן: נכנס מיד, יוצא לבד');
  const newPol = S.normalizePolicy({ 'new': { enabled: true, days: 21, maxShown: 10 } });
  const nowMs = Date.now();
  const built = S.buildNew(businesses, newPol, { now: nowMs });
  console.log('  ' + built.inWindow + ' עסקים בחלון של 21 יום · ' + built.list.length + ' מוצגים · ' +
              built.trimmed.length + ' נחתכו מהתקרה');

  // (1) עסק שאושר לפני רגע — חייב להיות ברשימה, ובמקום הראשון
  const brandNew = { id: '__new__', name: 'עסק שאושר עכשיו', approvedAt: new Date(nowMs).toISOString(), clicks: 0, likedBy: [] };
  const withNew = S.buildNew(businesses.concat([brandNew]), newPol, { now: nowMs });
  ok(withNew.list.some(b => b.id === '__new__'), 'עסק שאושר לפני שנייה מופיע בסקשן מיד');
  ok(withNew.list[0].id === '__new__', 'והוא ראשון ברשימה — התקרה חותכת מהוותיק בלבד');

  // (2) גם כשהחלון גדוש הרבה מעבר לתקרה, החדש עדיין נכנס
  const tight = S.normalizePolicy({ 'new': { enabled: true, days: 21, maxShown: 3 } });
  const tightWithNew = S.buildNew(businesses.concat([brandNew]), tight, { now: nowMs });
  ok(tightWithNew.list.length === 3 && tightWithNew.list[0].id === '__new__',
     'גם בתקרה צפופה (3) עסק חדש נכנס ראשון ולא נדחף החוצה');

  // (3) עסק ותיק לא "חוזר" להיות חדש
  const oldBiz = { id: '__old__', name: 'עסק מלפני חצי שנה', approvedAt: new Date(nowMs - 180 * 86400000).toISOString(), clicks: 0, likedBy: [] };
  const withOld = S.buildNew(businesses.concat([oldBiz]), newPol, { now: nowMs });
  ok(!withOld.list.some(b => b.id === '__old__'), 'עסק שאושר לפני חצי שנה אינו מופיע כ"חדש" לעולם');

  // (4) יוצא לבד בדיוק אחרי days
  const exit = S.newExitDate(brandNew, newPol);
  ok(Math.abs((exit - nowMs) / 86400000 - 21) < 0.01, 'תאריך היציאה הוא בדיוק ' + newPol['new'].days + ' יום מהאישור');
  // ⚠️ נבדק על **inWindow** ולא על list: הרצפה (minShown) עשויה להשלים כרטיסים אחרי
  // שהחלון התרוקן — וזו התנהגות רצויה, לא כשל. list ריק היה אומר שהרצפה לא עובדת.
  const later = S.buildNew([brandNew], newPol, { now: nowMs + 22 * 86400000 });
  ok(later.inWindow === 0, 'אחרי שהחלון נגמר העסק יוצא ממנו לבד, בלי שאיש כיבה דגל');

  // (5) חסר-מצב לגמרי — אותה תוצאה בלי שום יומן
  const noState = S.buildNew(businesses, newPol, { now: nowMs, state: { log: [] } });
  ok(JSON.stringify(noState.list.map(b => b.id)) === JSON.stringify(built.list.map(b => b.id)),
     'התוצאה אינה תלויה ביומן כלל — הסקשן עובד גם אם איש לא נכנס למרכז הניהול');

  // (6) מנת ההשקה — הלב של יום שני
  const LAUNCH = '2026-09-07T00:00:00.000Z';
  const polL = S.normalizePolicy({ launchAt: LAUNCH, 'new': { enabled: true, days: 15, maxShown: 0 } });
  const atLaunch = new Date(LAUNCH).getTime() + 3600000;
  const bL = S.buildNew(businesses, polL, { now: atLaunch });
  ok(bL.list.length === businesses.length, 'ביום ההשקה כל ' + businesses.length + ' העסקים מופיעים ב"חדש אצלנו" (' + bL.list.length + ')');
  ok(bL.launchCohort === businesses.length, 'כולם מזוהים כמנת-השקה — נספרים מיום ההשקה ולא מהאישור');
  const exitL = S.newExitDate(businesses[0], polL);
  ok(Math.abs(exitL - (new Date(LAUNCH).getTime() + 15 * 86400000)) < 1000, 'מנת ההשקה יוצאת 15 יום אחרי ההשקה: ' + exitL.toLocaleDateString('he-IL'));
  const after16 = S.buildNew(businesses, polL, { now: new Date(LAUNCH).getTime() + 16 * 86400000 });
  ok(after16.inWindow === 0, 'כעבור 16 יום מנת ההשקה יצאה כולה מהחלון, והסקשן מתפנה למי שבאמת חדש');
  // (7) תקרה + רצפה + סבב יומי — התשובה ל"מה נשים 50 עסקים ביחד" ול"ביום אחד אין עסקים"
  const polR = S.normalizePolicy({ launchAt: LAUNCH, 'new': { enabled: true, days: 15, maxShown: 12, minShown: 6 } });
  const seenIds = new Set(); let everyDay12 = true;
  for (let d = 0; d < 15; d++) {
    const day = S.buildNew(businesses, polR, { now: atLaunch + d * 86400000 });
    if (day.list.length !== 12) everyDay12 = false;
    day.list.forEach(b => seenIds.add(b.id));
  }
  ok(everyDay12, 'לאורך כל 15 ימי ההשקה מוצגים בדיוק 12 כרטיסים — לא 62');
  ok(seenIds.size === businesses.length, 'ובכל זאת כל ' + businesses.length + ' העסקים נחשפו (' + seenIds.size + ') — הסבב היומי מכסה את כולם');
  const cyc = S.buildNew(businesses, polR, { now: atLaunch }).cohortCycleDays;
  ok(cyc > 0 && cyc <= 7, 'סבב מלא על מנת ההשקה נמשך ' + cyc + ' ימים');
  const d1 = S.buildNew(businesses, polR, { now: atLaunch }).list.map(b => b.id).join();
  const d2 = S.buildNew(businesses, polR, { now: atLaunch + 86400000 }).list.map(b => b.id).join();
  ok(d1 !== d2, 'המדף מתחלף בין יום ליום');
  ok(S.buildNew(businesses, polR, { now: atLaunch }).list.map(b => b.id).join() === d1, 'ובתוך אותו יום הוא יציב');
  // הרצפה — אחרי שמנת ההשקה יצאה, המדף לא מתרוקן
  const afterEnd = S.buildNew(businesses, polR, { now: atLaunch + 17 * 86400000 });
  ok(afterEnd.inWindow === 0, 'כעבור 17 יום אף עסק כבר אינו בחלון');
  ok(afterEnd.list.length === 6, 'ולמרות זאת המדף מציג 6 — הרצפה מונעת יום עם מדף ריק');
  ok(afterEnd.floorAdded.length === 6, 'ששת אלה הגיעו מהרצפה, ומסומנים ככאלה למנהל');
  // "נכנס מיד" גובר על הסבב
  const post = { id: '__post__', name: 'אושר אחרי ההשקה', approvedAt: new Date(atLaunch + 3 * 86400000).toISOString(), clicks: 0, likedBy: [] };
  const withPost = S.buildNew(businesses.concat([post]), polR, { now: atLaunch + 3 * 86400000 + 60000 });
  ok(withPost.list[0].id === '__post__', 'עסק שאושר אחרי ההשקה תופס את המקום הראשון — הסבב לא נוגע בו');

  const stateN = { log: [] };   // נשאר לצורך בדיקות ההיסטוריה למטה

  // ── סימולציה: "נבחרים" — 3 שכבות ───────────────────────────────────────────
  head('נבחרים — 10 מקומות: עוגנים / סבב / הזדמנות');
  const anchorIds = businesses.filter(b => S.isFlaggedFeatured(b)).slice(0, 2).map(b => b.id);
  const fPol = S.normalizePolicy({
    featured: { enabled: true, size: 10, anchors: 2, opportunity: 2, periodDays: 7, cooldown: 2, criteria: ['neverShown', 'leastClicks'] },
  });
  const stateF = { log: [] };
  const seenRot = {}, seenOpp = {};
  const F0 = S.periodIndex(fPol, 'featured', Date.now());
  let sizeOk = true, dupOk = true, layerOk = true, coolOk = true;
  const oppByWeek = [];
  for (let w = 0; w < 26; w++) {
    const p = F0 + w;
    const b = S.buildFeatured(businesses, fPol, { state: stateF, periodIndex: p, anchorIds });
    if (b.list.length !== 10) sizeOk = false;
    if (new Set(b.list.map(x => x.id)).size !== b.list.length) dupOk = false;
    if (b.anchors.length !== 2 || b.opportunity.length !== 2 || b.rotation.length !== 6) layerOk = false;
    b.rotation.forEach(x => seenRot[x.id] = (seenRot[x.id] || 0) + 1);
    b.opportunity.forEach(x => seenOpp[x.id] = (seenOpp[x.id] || 0) + 1);
    oppByWeek.push(b.opportunity.map(x => x.id));
    // צינון: אף אחד לא חוזר להזדמנות בתוך cooldown תקופות
    for (let k = 1; k <= 2 && w - k >= 0; k++) {
      if (oppByWeek[w].some(id => oppByWeek[w - k].includes(id))) coolOk = false;
    }
    recordPeriod(stateF, 'featured', p, b.list, S.periodRange(fPol, 'featured', p));
  }
  const first = S.buildFeatured(businesses, fPol, { state: { log: [] }, periodIndex: F0, anchorIds });
  ok(sizeOk, 'הסקשן מחזיק בדיוק 10 מקומות בכל תקופה');
  ok(dupOk, 'אין עסק שמופיע פעמיים באותה תקופה');
  ok(layerOk, 'חלוקת השכבות נשמרת: 2 עוגנים + 6 סבב + 2 הזדמנות');
  ok(coolOk, 'הצינון עובד — אף עסק לא חזר להזדמנות בתוך ' + fPol.featured.cooldown + ' תקופות');
  const rotPoolSize = first.poolSize - 2;
  const rotSeen = Object.keys(seenRot).length;
  ok(rotSeen >= rotPoolSize, 'כל ' + rotPoolSize + ' עסקי מאגר ה-⭐ שאינם עוגנים קיבלו תור בסבב (' + rotSeen + ')');
  console.log('  מאגר ⭐: ' + first.poolSize + ' · סבב מלא כל ' + first.periodsToCyclePool + ' תקופות');
  console.log('  שכבת ההזדמנות נתנה חשיפה ל-' + Object.keys(seenOpp).length + ' עסקים שונים ב-26 שבועות');
  ok(Object.keys(seenOpp).length >= 20, 'ההזדמנות אינה חוזרת על אותם מעטים (' + Object.keys(seenOpp).length + ' שונים)');

  // ── קריטריונים ─────────────────────────────────────────────────────────────
  head('קריטריונים — כל אחד באמת משנה את הבחירה');
  const orders = S.CRITERIA.filter(c => c.kind === 'order');
  const filters = S.CRITERIA.filter(c => c.kind === 'filter');
  ok(orders.length >= 5 && filters.length >= 4, 'יש ' + orders.length + ' קריטריוני דירוג ו-' + filters.length + ' קריטריוני סינון');
  ok(S.CRITERIA.every(c => c.label && c.desc && c.why), 'לכל קריטריון יש כותרת, הסבר ונימוק (לתצוגה בממשק)');
  const pick = (crit) => S.buildFeatured(businesses, S.normalizePolicy({
    featured: { enabled: true, size: 10, anchors: 0, opportunity: 3, cooldown: 0, criteria: crit },
  }), { state: { log: [] }, periodIndex: 0 }).opportunity.map(b => b.name);
  // ⚠️ שני זוגות **אמורים** להתלכד כשאין נתונים: neverShown≡longestWait כשהיומן ריק
  // (לאיש אין היסטוריה), ו-manualPriority אינו מבחין כשלאף עסק לא נקבעה עדיפות.
  // דרישת "כולם שונים" הייתה נכשלת על התנהגות נכונה — נבדק שאין **יותר** התלכדויות.
  const distinct = new Set(orders.map(c => JSON.stringify(pick([c.key]))));
  ok(distinct.size >= orders.length - 2, 'קריטריוני הדירוג מייצרים בחירות שונות (' + distinct.size + '/' + orders.length + ')');

  // הקריטריון הידני — נבדק מול ערכים אמיתיים, כי בלעדיהם אין לו מה להבחין
  // ⚠️ המועמדים חייבים להילקח **מחוץ** למאגר ה-⭐ — שכבת ההזדמנות מתעלמת מהמסומנים
  // בכוונה (הם מקבלים את הסבב). בחירה עיוורת מהרשימה הכללית הפילה את הבדיקה בפועל.
  const vip = businesses.filter(b => !S.isFlaggedFeatured(b)).slice(0, 3).map(b => b.id);
  const boosted = businesses.map(b => vip.includes(b.id) ? { ...b, exposurePriority: 3 } : b);
  const manualPick = S.buildFeatured(boosted, S.normalizePolicy({
    featured: { enabled: true, size: 10, anchors: 0, opportunity: 3, cooldown: 0, criteria: ['manualPriority'] },
  }), { state: { log: [] }, periodIndex: 0 }).opportunity;
  ok(manualPick.length === 3 && manualPick.every(b => vip.includes(b.id)),
     'עדיפות ידנית 3 דוחפת בדיוק את מי שסומן לראש התור (' + manualPick.map(b => b.name).join(' · ') + ')');
  const noPri = S.buildFeatured(businesses, S.normalizePolicy({
    featured: { enabled: true, size: 10, anchors: 0, opportunity: 3, cooldown: 0, criteria: ['manualPriority'] },
  }), { state: { log: [] }, periodIndex: 0 }).opportunity;
  ok(noPri.length === 3, 'בלי שאיש סומן, הקריטריון אינו מרוקן את השכבה — הוא פשוט לא מבחין');
  orders.forEach(c => console.log('  ' + c.label + ' → ' + pick([c.key]).join(' · ')));
  // ⚠️ סינון שמרוקן את המאגר לגמרי הוא **באג בקריטריון**, לא בחירה לגיטימית של המנהל —
  // כך נתפס בפועל isSubscriber ששמור כמחרוזת 'yes'/'no' ולכן `!b.isSubscriber` היה
  // תמיד false. סינון צר (אך לא ריק) הוא לגיטימי, ומודפס כאזהרה שתוצג גם בממשק.
  let filtersOk = true;
  filters.forEach(c => {
    const n = businesses.filter(c.test).length;
    const warn = n === 0 ? '  ✘ מרוקן את המאגר לגמרי' : n < 6 ? '  ⚠️ סינון צר מאוד' : '';
    console.log('  ' + c.label + ' → ' + n + ' מתוך ' + N + ' עסקים עוברים' + warn);
    if (n === 0) filtersOk = false;
  });
  ok(filtersOk, 'אף קריטריון סינון אינו מרוקן את המאגר לגמרי');

  // ── היסטוריה ───────────────────────────────────────────────────────────────
  head('היסטוריה — מה נשמר לכרטיס העסק');
  // מדמים 6 תקופות רישום, בדיוק כמו שמרכז הניהול כותב אותן
  const PN = S.periodIndex(newPol, 'new', Date.now());
  for (let w = 0; w < 6; w++) {
    const p2 = PN - w;
    recordPeriod(stateN, 'new', p2, S.buildNew(businesses, newPol, { now: Date.now() - w * 7 * 86400000 }).list, S.periodRange(newPol, 'new', p2));
  }
  const someone = businesses.find(b => S.bizHistory(stateN, b.id).length > 0);
  const h = S.bizHistory(stateN, someone.id);
  ok(h.length > 0, 'נשמרת היסטוריית הופעות לעסק: ' + someone.name + ' — ' + h.length + ' תקופות');
  ok(h.every(e => e.from && e.to && e.section), 'לכל רשומת היסטוריה יש סקשן וטווח תאריכים');
  const r0 = S.periodRange(newPol, 'new', S.periodIndex(newPol, 'new', Date.now()));
  ok(r0.from <= new Date() && new Date() <= r0.to, 'טווח התקופה הנוכחית מכיל את עכשיו (' + r0.from.toLocaleDateString('he-IL') + ' – ' + r0.to.toLocaleDateString('he-IL') + ')');

  // ── אינטגרציה: מה שהמנהל רואה = מה שהאוהד רואה ──────────────────────────────
  // 🔑 **זו הבדיקה החשובה ביותר בקובץ.** §413 היה בדיוק הכשל הזה: שני מסכים, שתי
  // הגדרות, ואיש לא ידע. כאן נשלפת פונקציית-החברוּת **מתוך home.html עצמו** ומורצת
  // מול היומן שמרכז הניהול היה כותב — ומושווית לרשימה שהמנוע בנה.
  head('אינטגרציה — home.html מול מרכז הניהול');
  const homeHtml = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
  const fnStart = homeHtml.indexOf('function sectionMembersFor(key) {');
  if (fnStart < 0) throw new Error('sectionMembersFor לא נמצאה ב-home.html');
  const fnEnd = homeHtml.indexOf('\n}', fnStart) + 2;
  const fnSrc = homeHtml.slice(fnStart, fnEnd);

  // מריצים את הפונקציה האמיתית מול הגלובלים שהיא מצפה להם.
  // businesses מוזרק כי מאז §414ב היא מחשבת את 'new' מקומית ונשענת עליו.
  const runHome = (policyRaw, stateRaw, key) => new Function(
    'HB_SECTIONS', 'sectionPolicyDoc', 'sectionStateDoc', 'businesses', 'key',
    'const window = { HB_SECTIONS };\n' + fnSrc + '\nreturn sectionMembersFor(key);'
  )(S, policyRaw, stateRaw, businesses, key);

  const livePol = S.normalizePolicy({
    featured: { enabled: true, size: 10, anchors: 0, opportunity: 2, periodDays: 7, cooldown: 2, criteria: ['neverShown', 'leastClicks'] },
    'new': { enabled: true, days: 21, maxShown: 10 },
  });
  const liveState = { log: [] };
  ['featured', 'new'].forEach(key => {
    const pIdx = S.periodIndex(livePol, key, Date.now());
    const built = key === 'featured'
      ? S.buildFeatured(businesses, livePol, { state: liveState, periodIndex: pIdx, anchorIds: [] })
      : S.buildNew(businesses, livePol, {});
    recordPeriod(liveState, key, pIdx, built.list, S.periodRange(livePol, key, pIdx));
  });

  ['featured', 'new'].forEach(key => {
    const pIdx = S.periodIndex(livePol, key, Date.now());
    const adminList = (liveState.log.find(e => e.s === key && e.p === pIdx) || {}).ids || [];
    const homeSet = runHome(livePol, liveState, key);
    const same = homeSet && homeSet.size === adminList.length && adminList.every(id => homeSet.has(id));
    ok(same, key + ': home.html מציג בדיוק את ' + adminList.length + ' העסקים שנרשמו במרכז הניהול');
  });
  ok(runHome(null, { log: [] }, 'featured') === null, 'בלי מדיניות שמורה — home.html חוזר להתנהגות הידנית (null)');
  ok(runHome(S.normalizePolicy({}), liveState, 'featured') === null, 'מדיניות כבויה — home.html חוזר להתנהגות הידנית (null)');
  // תקופה שטרם נרשמה → נופלים לאחרונה שכן נרשמה, לא לרשימה ריקה
  const stale = { log: liveState.log.map(e => ({ ...e, p: e.p - 3 })) };
  const fallback = runHome(livePol, stale, 'new');
  ok(fallback && fallback.size > 0, 'תקופה שטרם נרשמה נופלת לתקופה האחרונה שכן נרשמה (' + (fallback ? fallback.size : 0) + ' עסקים), לא לסקשן ריק');

  console.log('\n' + pass + '/' + (pass + fail) + ' עברו' + (fail ? ' · ' + fail + ' נכשלו' : ''));
  process.exit(fail ? 1 : 0);
})();
