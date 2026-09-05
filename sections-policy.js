// ── sections-policy.js — מי נמצא ב"עסקים נבחרים" ומי ב"חדש אצלנו", ולמה ───────────
// script קלאסי (לא module), נטען מוקדם — אותה קונבנציה בדיוק כמו hours.js,
// social-links.js, phone-check.js ו-categories.js. חושף window.HB_SECTIONS.
//
// למה זה קיים (2026-09-03, ר' docs/PROJECT_CONTEXT.md §414):
//   1. שני הסקשנים נשלטו עד היום ע"י שני דגלים ידניים על מסמך העסק — isFeatured/isNew
//      עם תאריך תפוגה. איש לא כיבה אותם: **28 עסקים "חדשים" מתוך 62 (45% מהאינדקס)**,
//      15 מהם אושרו לפני 16-19 יום, ו-13 שאושרו באמת ב-14 הימים האחרונים לא סומנו כלל.
//      כלומר מי שהסקשן קיים בשבילו — נעדר ממנו.
//   2. ⚠️ **הבעיה האמיתית אינה תחזוקה אלא הוגנוּת.** 62 עסקים מחכים לחשיפה, ולסקשן יש
//      10 מקומות. בלי תור מפורש, אותם עסקים תופסים אותם מקומות לנצח — נמדד: הנבחרים
//      מחזיקים 674 מתוך 988 הכניסות לכרטיסים באתר (68% מהתנועה).
//   3. §413 תיקן בדיוק את הסימפטום הזה בדף הנחיתה (9 מתוך 19 נבחרים לא הוצגו מעולם),
//      ו**הנוסחה שוכפלה שם בין שני קבצים ונפרדה**. הקובץ הזה הוא המסקנה: מקור-אמת אחד.
//
// המודל — הרכב הסקשן, לא רשימת שמות:
//   המנהל אינו בוחר "מי מוצג היום". הוא בוחר **מדיניות** (כמה מקומות, לכמה זמן, לפי
//   אילו כללים), והמדיניות מייצרת את הרשימה בכל תקופה מחדש. כך אף עסק לא נשכח, ואף
//   עסק לא נשאר בפנים לנצח.
//
//   "עסקים נבחרים" — 3 שכבות שמתחלקות ביניהן במקומות:
//     📌 עוגנים      — נבחרים ידנית, לא זזים. (settings/sectionAnchors, המנגנון הקיים)
//     🔄 סבב         — מהמאגר שסומן ⭐, כל אחד בתורו, סבב עגול מלא.
//     🎯 הזדמנות     — נבחר **אוטומטית** לפי קריטריונים. המנהל בוחר את הכללים, לא את השמות.
//
//   "חדש אצלנו" — **בלי תור ובלי תקופות.** מי שייך: מי שאושר בתוך `days` הימים
//   האחרונים. נכנס ברגע האישור, יוצא לבד. ועל זה שלושה כללי-תצוגה:
//     🔒 תקרה (maxShown) — לעולם לא יותר מזה על המדף
//     🔒 רצפה (minShown) — לעולם לא פחות; אם החלון דליל, משלימים מהבאים בתור
//     🔄 סבב יומי        — כשיש יותר בחלון מהתקרה, המוצגים מתחלפים כל יום
//   ⚠️ **הסבב חל רק על מנת-ההשקה.** מי שאושר באמת לאחרונה תופס את המקומות הראשונים
//   תמיד — "נכנס מיד" גובר על הסבב, תמיד.
//
// ⚠️ **הייתה כאן גרסה עם תור-חשיפה שהעביר את כל 62 העסקים דרך הסקשן, והמשתמש דחה
// אותה בצדק (2026-09-04):** עסק שהצטרף היום היה עלול לא להופיע היום, ועסק ותיק היה
// מופיע "כחדש" אחרי חודש. שני הדברים מכעיסים את בעל העסק, ושניהם גם פשוט לא נכונים.
// **החשיפה למסה עברה כולה לשכבת ההזדמנות של "נבחרים"** — שם המקום שלה.
//
// ⚠️ **שכבת ההזדמנות חייבת היסטוריה, ולכן היא חלק מהמנוע ולא תוספת עליו.** "מי מחכה
// הכי הרבה" ו"אל תבחר מי שהיה שבוע שעבר" אינם ניתנים לחישוב מתוך מסמך העסק — הם
// דורשים רישום של מי הוצג ומתי. ר' settings/sectionState למטה.

(function () {
  'use strict';

  var DAY_MS = 86400000;

  // ── מדיניות ברירת-מחדל ────────────────────────────────────────────────────────
  // enabled:false בכוונה — כל עוד המנהל לא הפעיל, שני הסקשנים מתנהגים **בדיוק** כמו
  // קודם (isFeatured/isNew הידניים). אין שינוי באתר החי ברגע שהקובץ נטען.
  var DEFAULT_POLICY = {
    featured: {
      enabled: false,
      size: 10,          // סך המקומות בסקשן
      anchors: 0,        // כמה מהם שמורים לעוגנים ידניים
      opportunity: 2,    // כמה מהם לשכבת ההזדמנות
      // סבב = size - anchors - opportunity   (נגזר תמיד, לא נשמר — כך אי אפשר לשמור סכום שגוי)
      periodDays: 7,     // כל כמה זמן הסבב מתחלף
      cooldown: 2,       // כמה תקופות עסק "נח" אחרי הזדמנות, לפני שיוכל לחזור
      criteria: ['neverShown', 'leastClicks']
    },
    'new': {
      enabled: false,
      days: 15,          // כמה ימים עסק נשאר "חדש" (החלטת המשתמש, 2026-09-04)
      maxShown: 12,      // 🔒 תקרה — לעולם לא יותר מזה על המדף. 0 = בלי תקרה.
      minShown: 6,       // 🔒 רצפה — לעולם לא פחות מזה. משלימים מהעסקים הבאים בתור.
      periodDays: 7,     // ⚠️ **רק לרישום ההיסטוריה.** אינו משפיע על מי מוצג — ר' buildNew.
      criteria: []       // סינון בלבד
    },
    startAt: null,       // ISO — מתי התקופה הראשונה של הסבב ב"נבחרים" מתחילה. null = מיד.

    // ── 🚀 יום ההשקה ─────────────────────────────────────────────────────────
    // 🔑 **"חדש" נמדד מרגע שהאוהד יכול היה לראות אותך, לא מרגע שאישרנו אותך.**
    // 62 העסקים אושרו לפני שבועות-חודשיים, אבל הפלטפורמה נפתחת לאוהדים רק עכשיו —
    // כלומר **אף אחד מהם לא נחשף לאף אוהד**. למדוד אותם מ-approvedAt היה מוציא את
    // כולם מ"חדש אצלנו" ביום הראשון, בזמן שלגולש הם כולם חדשים לחלוטין.
    // ולכן: עסק שאושר **לפני** התאריך הזה נספר כאילו אושר **בו**.
    // null = אין השקה מוגדרת, והמדידה היא מ-approvedAt בלבד (ההתנהגות הרגילה מכאן ואילך).
    launchAt: null
  };

  // ── הקריטריונים של שכבת ההזדמנות ──────────────────────────────────────────────
  // שני סוגים, ובכוונה מופרדים: **סינון** קובע מי בכלל מועמד, **דירוג** קובע מי ראשון
  // בתור. ערבוב של השניים לציון-משוקלל אחד היה עושה את הבחירה בלתי-ניתנת-להסבר, וזה
  // בדיוק מה שהמנהל צריך להסביר לבעל-עסק ששואל "למה הוא ולא אני".
  var CRITERIA = [
    // ── דירוג — מי ראשון בתור ────────────────────────────────────────────────────
    {
      key: 'neverShown', kind: 'order', label: 'מי שמעולם לא קיבל חשיפה',
      desc: 'עסקים שלא היו אף פעם בנבחרים נכנסים ראשונים. אחרי שכולם קיבלו תור, הקריטריון הזה כבר לא משפיע והבא בתור מכריע.',
      why: 'זה הקריטריון שמרוקן את המסה שנצברה. בלעדיו — מי שנכנס מוקדם ממשיך להיכנס.'
    },
    {
      key: 'longestWait', kind: 'order', label: 'מי שהכי הרבה זמן לא קיבל חשיפה',
      desc: 'לפי מתי היה בפעם האחרונה בנבחרים. מי שהיה לפני הכי הרבה זמן — ראשון.',
      why: 'ההמשך הטבעי של הקודם: אחרי סבב ראשון מלא, זה מה שממשיך לסובב את כולם בהוגנות.'
    },
    {
      key: 'leastClicks', kind: 'order', label: 'מי שקיבל הכי מעט כניסות לכרטיס',
      desc: 'לפי מונה הכניסות לכרטיס העסק (clicks). הנמוך ביותר — ראשון.',
      why: 'מכוון את החשיפה למי שבפועל לא נראה, ולא רק למי שלא סומן. נמדד: 3 עסקים עם 0 כניסות.'
    },
    {
      key: 'completeProfile', kind: 'order', label: 'מי שהפרופיל שלו הכי מלא',
      desc: 'לוגו, תמונה מייצגת, תיאור, שעות, הטבה, תגיות, גלריה — כל אחד נקודה. הגבוה ביותר ראשון.',
      why: 'החשיפה גם צריכה להיראות טוב. עסק בלי תמונה בשורה העליונה פוגע בכל השורה.'
    },
    {
      key: 'lovedButUnseen', kind: 'order', label: 'אהוב אבל לא נראה',
      desc: 'יחס לבבות לכניסות. עסק שהרבה ממי שכן ראה אותו אהב — אבל מעטים ראו.',
      why: 'הסימן החזק ביותר ל"זה יעבוד אם רק יראו אותו". מבוסס על התנהגות אוהדים, לא על הערכה.'
    },
    {
      key: 'manualPriority', kind: 'order', label: '⭑ עדיפות ידנית שקבעתי',
      desc: 'לפי דירוג 0–3 שאתה קובע בכרטיס העסק ("עדיפות חשיפה"). 3 = ראשון בתור, 0 = רגיל.',
      why: 'לא כל שיקול ניתן למדידה. עסק של חבר, מישהו מוכר ביציע, או עסק שפשוט מגיע לו — ' +
           'זה המקום להביע את זה **בלי לוותר על ההוגנות של כל השאר**. ⚠️ בניגוד לעיגון 📌, ' +
           'עדיפות אינה נועלת מקום: היא רק דוחפת קדימה בתור, והעסק עדיין מתחלף בבוא הזמן.',
      manual: true
    },
    {
      key: 'newestFirst', kind: 'order', label: 'הכי חדש באינדקס',
      desc: 'לפי תאריך האישור, החדש ביותר ראשון.',
      why: 'אם רוצים ששכבת ההזדמנות תשמש כקבלת-פנים ולא כפיצוי. ⚠️ מבטל בפועל את מטרת השכבה אם נבחר לבדו.'
    },
    // ── סינון — מי בכלל מועמד ────────────────────────────────────────────────────
    {
      key: 'onlyWithCover', kind: 'filter', label: 'רק עם תמונה מייצגת',
      desc: 'עסק בלי תמונה מייצגת לא ייכנס לשכבת ההזדמנות.',
      why: 'הכרטיס בשורה העליונה נשען על התמונה. בלעדיה הוא ריק ליד תשעה מלאים.',
      test: function (b) { return !!(b.coverPhoto || b.coverPhotoThumb); }
    },
    {
      key: 'onlyWithLogo', kind: 'filter', label: 'רק עם לוגו',
      desc: 'עסק בלי לוגו לא ייכנס לשכבת ההזדמנות.',
      why: 'משלים לקודם. ⚠️ שני הסינונים יחד מצמצמים את המאגר משמעותית — כדאי להסתכל בתצוגה המקדימה.',
      test: function (b) { return !!(b.logo || b.logoThumb); }
    },
    {
      key: 'onlyWithDiscount', kind: 'filter', label: 'רק עם הטבה מוגדרת',
      desc: 'רק עסקים שהגדירו הטבה בפועל בדשבורד שלהם.',
      why: 'החשיפה שווה יותר לאוהד כשיש מאחוריה הטבה, ושווה יותר לעסק כשהיא ממירה.',
      test: function (b) { return !!(b.hasDiscount || b.discountText); }
    },
    {
      key: 'onlyWithHours', kind: 'filter', label: 'רק עם שעות פעילות',
      desc: 'רק עסקים שמילאו שעות פעילות (מובנות או בטקסט חופשי שאושר).',
      why: 'סימן לפרופיל שתוחזק בפועל, ולא נזנח אחרי ההרשמה.',
      test: function (b) { return !!(b.hours || b.hoursOther || (b.hoursDays && b.hoursDays.length)); }
    },
    {
      key: 'excludeSubscribers', kind: 'filter', label: 'רק עסקים שאינם של מנויים',
      desc: 'מוציא עסקים של בעלי מנוי מהשכבה האוטומטית.',
      why: 'אם מנויים מקבלים חשיפה בדרכים אחרות, זה מפנה את שכבת ההזדמנות למי שאין לו אותן. ⚠️ נמדד: רק 5 מתוך 62 העסקים אינם של מנויים — סינון צר מאוד, כדאי להסתכל בתצוגה המקדימה לפני שמפעילים.',
      // ⚠️ **isSubscriber שמור כמחרוזת 'yes'/'no', לא כבוליאני.** `!b.isSubscriber` היה
      // מחזיר false על **שני** הערכים (שניהם truthy) ומרוקן את המאגר לגמרי — הרנס-הבדיקה
      // תפס את זה בפועל (0 מתוך 62 עברו). אותה מלכודת בדיוק כמו הדגלים ב-weekly_interest.
      test: function (b) { return b.isSubscriber !== true && b.isSubscriber !== 'yes'; }
    }
  ];

  function criterionByKey(k) {
    for (var i = 0; i < CRITERIA.length; i++) if (CRITERIA[i].key === k) return CRITERIA[i];
    return null;
  }

  // ── עזרי סדר יציב ─────────────────────────────────────────────────────────────
  // זהה בכוונה ל-home.html/§413: מיון לפי id לפני הערבוב, כי שאילתת Firestore בלי
  // orderBy אינה מבטיחה סדר יציב בין קריאות — וסבב שנשען על סדר-קלט משתנה אינו סבב.
  function seedFromString(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return h;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stableShuffle(arr, seedStr) {
    var rand = mulberry32(seedFromString(seedStr));
    var a = arr.slice().sort(function (x, y) { return String(x.id).localeCompare(String(y.id)); });
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function rotate(arr, offset) {
    if (!arr.length) return arr.slice();
    var o = ((offset % arr.length) + arr.length) % arr.length;
    return arr.slice(o).concat(arr.slice(0, o));
  }

  // ── תקופות ────────────────────────────────────────────────────────────────────
  // מספר-התקופה נמדד מ-startAt (או מ-epoch אם לא נקבע), לפי השעון **המקומי** — כדי
  // שהחלפת-תקופה תקרה בחצות ולא בשלוש לפנות בוקר, כמו כל שאר המנגנונים היומיים באתר.
  function localDayIndex(ms) {
    return Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / DAY_MS);
  }
  function periodIndex(policy, sectionKey, nowMs) {
    var sec = policy[sectionKey] || {};
    var days = Math.max(1, sec.periodDays || 7);
    var today = localDayIndex(nowMs == null ? Date.now() : nowMs);
    var start = policy.startAt ? localDayIndex(new Date(policy.startAt).getTime()) : 0;
    return Math.floor((today - start) / days);
  }
  function periodRange(policy, sectionKey, idx) {
    var sec = policy[sectionKey] || {};
    var days = Math.max(1, sec.periodDays || 7);
    var start = policy.startAt ? localDayIndex(new Date(policy.startAt).getTime()) : 0;
    var dayNo = start + idx * days;
    // בונים תאריך מקומי מתוך מספר-היום המקומי, ולא new Date(dayNo*DAY_MS) — שהוא UTC
    // ולכן היה מזיז את גבול התקופה בשעתיים-שלוש בישראל.
    var probe = new Date(dayNo * DAY_MS);
    var from = new Date(probe.getTime() + probe.getTimezoneOffset() * 60000);
    var to = new Date(from.getTime() + days * DAY_MS - 1);
    return { from: from, to: to };
  }

  // ── היסטוריה ──────────────────────────────────────────────────────────────────
  // state.log = [{ s:'featured'|'new', p:periodIdx, from:ISO, to:ISO, ids:[bizId...] }, ...]
  // כאן רק **קריאה** ממנו; הכתיבה היא באחריות מרכז הניהול (הוא היחיד שמורשה לכתוב).
  function historyFor(state, sectionKey) {
    var log = (state && state.log) || [];
    var out = [];
    for (var i = 0; i < log.length; i++) if (log[i] && log[i].s === sectionKey) out.push(log[i]);
    out.sort(function (a, b) { return b.p - a.p; });
    return out;
  }
  // bizId → { count, lastPeriod }  לפי סקשן
  function exposureIndex(state, sectionKey) {
    var hist = historyFor(state, sectionKey), map = {};
    for (var i = 0; i < hist.length; i++) {
      var ids = hist[i].ids || [];
      for (var j = 0; j < ids.length; j++) {
        var e = map[ids[j]];
        if (!e) map[ids[j]] = { count: 1, lastPeriod: hist[i].p };
        else { e.count++; if (hist[i].p > e.lastPeriod) e.lastPeriod = hist[i].p; }
      }
    }
    return map;
  }
  // כל התקופות שעסק מסוים הופיע בהן — לכרטיס העסק במרכז הניהול
  function bizHistory(state, bizId) {
    var log = (state && state.log) || [], out = [];
    for (var i = 0; i < log.length; i++) {
      var ids = (log[i] && log[i].ids) || [];
      if (ids.indexOf(bizId) >= 0) {
        out.push({ section: log[i].s, period: log[i].p, from: log[i].from, to: log[i].to });
      }
    }
    out.sort(function (a, b) { return b.period - a.period; });
    return out;
  }

  // ── דירוג לפי הקריטריונים שנבחרו ──────────────────────────────────────────────
  // כל קריטריון-דירוג מחזיר מיקום (0 = ראשון). הציון הסופי = **סכום המיקומים**, לא
  // סכום ערכים מנורמלים: כך קריטריון עם סקאלה גדולה (clicks) אינו מבליע קריטריון עם
  // סקאלה קטנה (לבבות), וכל קריטריון שנבחר שוקל בדיוק כמו האחרים.
  function profileScore(b) {
    var s = 0;
    if (b.logo || b.logoThumb) s++;
    if (b.coverPhoto || b.coverPhotoThumb) s++;
    if (b.desc && String(b.desc).trim().length > 30) s++;
    if (b.hours || b.hoursOther || (b.hoursDays && b.hoursDays.length)) s++;
    if (b.hasDiscount || b.discountText) s++;
    if (b.tags && b.tags.length) s++;
    if (b.photos && b.photos.length) s++;
    return s;
  }
  // ערכים גבוהים = "ראוי יותר לחשיפה". כל הקריטריונים מדברים באותו כיוון, כך שאי אפשר
  // להתבלבל בסימן כשמוסיפים קריטריון חדש.
  function metricFor(key, b, exp) {
    var e = exp[b.id];
    if (key === 'neverShown') return e ? 0 : 1;
    if (key === 'longestWait') return e ? -e.lastPeriod : Number.MAX_SAFE_INTEGER;
    if (key === 'leastClicks') return -(Number(b.clicks) || 0);
    if (key === 'completeProfile') return profileScore(b);
    if (key === 'lovedButUnseen') return ((b.likedBy || []).length + 1) / ((Number(b.clicks) || 0) + 3);
    if (key === 'newestFirst') return b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
    // ⚠️ נשמר כמספר על מסמך העסק (0–3). `Number(undefined) || 0` מכסה גם עסקים ישנים
    // שאין להם את השדה בכלל — הם פשוט 0, כלומר "רגיל".
    if (key === 'manualPriority') return Math.max(0, Math.min(3, Number(b.exposurePriority) || 0));
    return 0;
  }
  function rankCandidates(list, keys, exp) {
    var orderKeys = [];
    for (var i = 0; i < keys.length; i++) {
      var c = criterionByKey(keys[i]);
      if (c && c.kind === 'order') orderKeys.push(keys[i]);
    }
    // בלי קריטריון-דירוג נבחר, "מי מחכה הכי הרבה" הוא ברירת-המחדל — לא סדר שרירותי.
    if (!orderKeys.length) orderKeys = ['neverShown', 'longestWait'];

    var rankSum = {};
    orderKeys.forEach(function (key) {
      var sorted = list.slice().sort(function (a, b) {
        var d = metricFor(key, b, exp) - metricFor(key, a, exp);
        return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
      });
      sorted.forEach(function (b, r) { rankSum[b.id] = (rankSum[b.id] || 0) + r; });
    });
    return list.slice().sort(function (a, b) {
      var d = (rankSum[a.id] || 0) - (rankSum[b.id] || 0);
      return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
    });
  }

  // ── "האם מסומן ⭐/✨ ידנית" — הנוסחה של home.html, מקור-אמת אחד ────────────────
  // ⚠️ §413 תיקן את הפיצול הזה בין home.html ל-welcome.html. מכאן והלאה — כאן בלבד.
  function isFlaggedFeatured(b, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    return !!(b.isFeatured && (!b.featuredUntil || now < new Date(b.featuredUntil).getTime()));
  }
  function isFlaggedNew(b, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    return !!(b.isNew && b.newUntil && now < new Date(b.newUntil).getTime());
  }

  // ── בניית "עסקים נבחרים" ──────────────────────────────────────────────────────
  // מחזיר תמיד את שלוש השכבות בנפרד **וגם** את הרשימה המאוחדת — מרכז הניהול צריך
  // לדעת למה כל עסק נמצא שם, לא רק שהוא נמצא.
  function buildFeatured(businesses, policy, opts) {
    opts = opts || {};
    var pol = normalizePolicy(policy);
    var cfg = pol.featured;
    var now = opts.now == null ? Date.now() : opts.now;
    var state = opts.state || {};
    var pIdx = opts.periodIndex == null ? periodIndex(pol, 'featured', now) : opts.periodIndex;

    var pool = businesses.filter(function (b) { return isFlaggedFeatured(b, now); });

    if (!cfg.enabled) {
      // מצב כבוי = ההתנהגות ההיסטורית במדויק: כל מי שמסומן ⭐, בלי חיתוך ובלי שכבות.
      return {
        enabled: false, periodIndex: pIdx, poolSize: pool.length,
        anchors: [], rotation: pool, opportunity: [], list: pool,
        oppPoolSize: 0, oppCooledSize: 0
      };
    }

    var byId = {};
    businesses.forEach(function (b) { byId[b.id] = b; });

    // 📌 עוגנים — מגיעים מבחוץ (settings/sectionAnchors, המנגנון הקיים), נחתכים למכסה.
    var anchors = [];
    (opts.anchorIds || []).forEach(function (id) {
      if (anchors.length >= cfg.anchors) return;
      var b = byId[id];
      if (b && anchors.indexOf(b) < 0) anchors.push(b);
    });
    var taken = {};
    anchors.forEach(function (b) { taken[b.id] = 1; });

    // 🎯 הזדמנות — מחוץ למאגר ה-⭐, לפי הקריטריונים, בלי מי שהיה לאחרונה.
    var expF = exposureIndex(state, 'featured');
    var filters = cfg.criteria.map(criterionByKey).filter(function (c) { return c && c.kind === 'filter'; });
    var oppPool = businesses.filter(function (b) {
      if (taken[b.id]) return false;
      if (isFlaggedFeatured(b, now)) return false;   // מאגר ה-⭐ מקבל את הסבב, לא את ההזדמנות
      for (var i = 0; i < filters.length; i++) if (!filters[i].test(b)) return false;
      return true;
    });
    // ⚠️ **הצינון הוא לב השכבה, לא עידון שלה.** הדירוג יציב מטבעו — בלי צינון, אותו
    // עסק מנצח שבוע אחרי שבוע, וזה בדיוק ההפך ממה שהשכבה נועדה לו.
    var cool = Math.max(0, cfg.cooldown);
    var cooled = oppPool.filter(function (b) {
      var e = expF[b.id];
      return !e || (pIdx - e.lastPeriod) > cool;
    });
    // אם הצינון חיסל את המאגר — עדיף לחזור על עסק מאשר להשאיר מקום ריק. הדירוג עצמו
    // כבר מעדיף את מי שנח הכי הרבה זמן, ולכן החזרה אינה שרירותית.
    var oppRanked = rankCandidates(cooled.length >= cfg.opportunity ? cooled : oppPool, cfg.criteria, expF);
    var opportunity = oppRanked.slice(0, Math.max(0, cfg.opportunity));
    opportunity.forEach(function (b) { taken[b.id] = 1; });

    // 🔄 סבב — סבב עגול מלא על מאגר ה-⭐. אותו מנגנון שנבדק ב-§413.
    var rotCount = Math.max(0, cfg.size - anchors.length - opportunity.length);
    var rotPool = pool.filter(function (b) { return !taken[b.id]; });
    var rotation = [];
    if (rotPool.length && rotCount) {
      var base = stableShuffle(rotPool, 'yz-featured-pool');
      // הקידום הוא rotCount לתקופה — כך התקופה הבאה מתחילה בדיוק במקום שבו זו נגמרה,
      // וכל עסק במאגר מקבל תור אחת לכל ceil(pool/rotCount) תקופות.
      rotation = rotate(base, (pIdx * rotCount) % base.length).slice(0, rotCount);
    }

    return {
      enabled: true, periodIndex: pIdx, poolSize: pool.length,
      anchors: anchors, rotation: rotation, opportunity: opportunity,
      list: anchors.concat(rotation, opportunity),
      oppPoolSize: oppPool.length, oppCooledSize: cooled.length,
      periodsToCyclePool: rotCount > 0 ? Math.ceil(rotPool.length / rotCount) : Infinity
    };
  }

  // ── בניית "חדש אצלנו" ─────────────────────────────────────────────────────────
  // 🔑 **אין כאן תור, ואין תקופות.** הייתה כאן גרסה עם תור-חשיפה שהעביר את כל 62
  // העסקים דרך הסקשן, והמשתמש דחה אותה בצדק (2026-09-04): עסק שהצטרף היום היה עלול
  // לא להופיע היום, ועסק ותיק היה מופיע "כחדש" אחרי חודש. שני הדברים מכעיסים את בעל
  // העסק, ושניהם גם פשוט לא נכונים — "חדש" חייב להיות מה שהמילה אומרת.
  //
  // הכלל היחיד: **אושר בתוך `days` הימים האחרונים.** נכנס ברגע האישור, יוצא לבד.
  // ⚠️ ולכן הפונקציה הזו **חסרת-מצב לגמרי** — אינה נוגעת ב-state ואינה תלויה בשום
  // רישום. עסק שאושר לפני שנייה מופיע בטעינת הדף הבאה, בלי שאיש ייכנס למרכז הניהול.
  function buildNew(businesses, policy, opts) {
    opts = opts || {};
    var pol = normalizePolicy(policy);
    var cfg = pol['new'];
    var now = opts.now == null ? Date.now() : opts.now;
    var pIdx = opts.periodIndex == null ? periodIndex(pol, 'new', now) : opts.periodIndex;

    if (!cfg.enabled) {
      var flagged = businesses.filter(function (b) { return isFlaggedNew(b, now); });
      return { enabled: false, periodIndex: pIdx, list: flagged, inWindow: flagged.length, trimmed: [] };
    }

    var filters = cfg.criteria.map(criterionByKey).filter(function (c) { return c && c.kind === 'filter'; });
    var cut = now - Math.max(0, cfg.days) * DAY_MS;
    var inWindow = businesses.filter(function (b) {
      // ⚠️ עסק שתאריך-האישור שלו בעתיד אינו מוצג, גם אם החלון "מכסה" אותו. זה נראה
      // תיאורטי, אבל לפני ההשקה **כל** מנת-ההשקה מקבלת תאריך-התחלה אפקטיבי עתידי
      // (יום ההשקה) — ובלי ההפרדה הזאת לא היה אפשר להבדיל בין השניים.
      if (new Date(b.approvedAt || 0).getTime() > now) return false;
      var eff = effectiveNewStart(b, pol);
      if (eff == null || eff < cut) return false;
      for (var i = 0; i < filters.length; i++) if (!filters[i].test(b)) return false;
      return true;
    }).sort(function (a, b) {
      // מיון לפי הזמן שממנו נספר "חדש". ⚠️ שובר-השוויון הוא `approvedAt` האמיתי, וזה
      // חשוב דווקא במנת-ההשקה: לכולם אותו תאריך-התחלה אפקטיבי, ובלי שובר-שוויון הסדר
      // היה נקבע לפי מזהה — כלומר שרירותי. כך מי שנרשם אחרון עדיין מוצג ראשון.
      var d = effectiveNewStart(b, pol) - effectiveNewStart(a, pol);
      if (d !== 0) return d;
      var d2 = new Date(b.approvedAt || 0) - new Date(a.approvedAt || 0);
      return d2 !== 0 ? d2 : String(a.id).localeCompare(String(b.id));
    });

    // ── תקרה, רצפה, וסבב יומי ────────────────────────────────────────────────
    // 🔑 **שלושה כללים שפותרים יחד את שתי התקלות שהמשתמש הצביע עליהן (2026-09-04):**
    // *"ביום אחד אין עסקים ובהתחלה יש שם המון עסקים, מה נשים 50 עסקים ביחד?"*
    //
    //   🔒 תקרה  — לעולם לא יותר מ-maxShown על המדף. 50 כרטיסים ברצף אינם "מדף חדשים",
    //              הם רשימה. זה פותר את הקצה העמוס.
    //   🔒 רצפה  — לעולם לא פחות מ-minShown. אם החלון התרוקן, משלימים מהעסקים הבאים
    //              בתור (החדשים ביותר שמחוץ לחלון). זה פותר את "ביום אחד אין עסקים":
    //              **אין צוק, יש התכנסות.** המדף פשוט מפסיק להתחדש, אבל לא נעלם.
    //   🔄 סבב   — כשיש יותר בחלון מהתקרה, המוצגים **מתחלפים כל יום**. כך במנת-ההשקה
    //              כל 62 העסקים מקבלים חשיפה תוך כמה ימים, בלי להעמיס 62 כרטיסים בבת אחת.
    //
    // ⚠️ **הסבב חל רק על מנת-ההשקה, לעולם לא על מי שהצטרף באמת לאחרונה.** עסק שאושר
    // אחרי ההשקה תופס את המקומות הראשונים תמיד — זו הדרישה המקורית ("נכנס מיד"), והיא
    // גוברת על הסבב. הסבב מחלק רק את מה שנשאר.
    var cap = cfg.maxShown > 0 ? cfg.maxShown : inWindow.length;

    var genuinelyNew = [], cohort = [];
    inWindow.forEach(function (b) {
      (isLaunchCohort(b, pol) ? cohort : genuinelyNew).push(b);
    });

    var list = genuinelyNew.slice(0, cap);
    var rotated = [];
    var slotsLeft = cap - list.length;
    if (slotsLeft > 0 && cohort.length) {
      if (cohort.length <= slotsLeft) {
        rotated = cohort.slice();
      } else {
        // סבב יומי דטרמיניסטי — אותו מנגנון בדיוק שנבדק ב-§413 ובשכבת הסבב של "נבחרים":
        // בסיס יציב (זרע קבוע), מסובב לפי מספר-היום. כך כל עסק במנה מופיע בדיוק
        // ceil(cohort/slotsLeft) ימים מתוך כל מחזור, ואין אחד שנשכח.
        var base = stableShuffle(cohort, 'yz-new-launch');
        rotated = rotate(base, (localDayIndex(now) * slotsLeft) % base.length).slice(0, slotsLeft);
      }
      list = list.concat(rotated);
    }

    // 🔒 הרצפה — משלימים מהחדשים ביותר שמחוץ לחלון, לפי אותו סדר בדיוק.
    var floorAdded = [];
    if (cfg.minShown > 0 && list.length < cfg.minShown) {
      var inList = {};
      list.forEach(function (b) { inList[b.id] = 1; });
      var spare = businesses.filter(function (b) {
        if (inList[b.id] || !b.approvedAt) return false;
        if (new Date(b.approvedAt).getTime() > now) return false;
        for (var i = 0; i < filters.length; i++) if (!filters[i].test(b)) return false;
        return true;
      }).sort(function (a, b) {
        return effectiveNewStart(b, pol) - effectiveNewStart(a, pol);
      });
      floorAdded = spare.slice(0, cfg.minShown - list.length);
      list = list.concat(floorAdded);
    }

    var shownIds = {};
    list.forEach(function (b) { shownIds[b.id] = 1; });
    return {
      enabled: true, periodIndex: pIdx,
      list: list,
      trimmed: inWindow.filter(function (b) { return !shownIds[b.id]; }),
      floorAdded: floorAdded,
      inWindow: inWindow.length,
      cohortInWindow: cohort.length,
      rotatingCohort: cohort.length > (cap - genuinelyNew.length),
      // כל כמה ימים מסתיים סבב שלם על מנת-ההשקה — המספר שהמנהל שואל עליו
      cohortCycleDays: (cap - genuinelyNew.length) > 0 && cohort.length
        ? Math.ceil(cohort.length / (cap - genuinelyNew.length)) : 0,
      launchCohort: businesses.filter(function (b) { return isLaunchCohort(b, pol); }).length
    };
  }
  // מאיזה רגע נספרים ה"ימים כחדש" — הרגע שבו אוהד יכול היה לראות את העסק לראשונה.
  function effectiveNewStart(b, policy) {
    if (!b.approvedAt) return null;
    var t = new Date(b.approvedAt).getTime();
    var pol = policy && policy.featured ? policy : normalizePolicy(policy);
    if (!pol.launchAt) return t;
    var L = new Date(pol.launchAt).getTime();
    return t < L ? L : t;
  }
  // עסק שאושר לפני ההשקה — כלומר כזה שהחלון שלו נמדד מיום ההשקה ולא מהאישור
  function isLaunchCohort(b, policy) {
    var pol = policy && policy.featured ? policy : normalizePolicy(policy);
    if (!pol.launchAt || !b.approvedAt) return false;
    return new Date(b.approvedAt).getTime() < new Date(pol.launchAt).getTime();
  }
  // מתי עסק מסוים יוצא מ"חדש אצלנו" — לכרטיס העסק ולתצוגת המנהל
  function newExitDate(b, policy) {
    var pol = normalizePolicy(policy);
    var eff = effectiveNewStart(b, pol);
    if (eff == null) return null;
    return new Date(eff + Math.max(0, pol['new'].days) * DAY_MS);
  }

  // ── נרמול ─────────────────────────────────────────────────────────────────────
  // ⚠️ הסכום נאכף כאן ולא בממשק: anchors+opportunity לא יכולים לחרוג מ-size, אחרת
  // שכבת הסבב מקבלת מספר שלילי ונעלמת בשקט — בדיוק סוג התקלה שאין לה הודעת שגיאה.
  function normalizePolicy(raw) {
    var p = {
      startAt: (raw && raw.startAt) || DEFAULT_POLICY.startAt,
      launchAt: (raw && raw.launchAt) || DEFAULT_POLICY.launchAt
    };
    ['featured', 'new'].forEach(function (k) {
      var d = DEFAULT_POLICY[k], r = (raw && raw[k]) || {};
      var o = {};
      Object.keys(d).forEach(function (f) { o[f] = (r[f] === undefined || r[f] === null) ? d[f] : r[f]; });
      o.enabled = !!o.enabled;
      o.periodDays = Math.max(1, Math.min(90, Number(o.periodDays) || d.periodDays));
      o.criteria = Array.isArray(o.criteria) ? o.criteria.filter(criterionByKey) : [];
      if (k === 'featured') {
        o.size = Math.max(1, Math.min(40, Number(o.size) || d.size));
        o.anchors = Math.max(0, Math.min(o.size, Number(o.anchors) || 0));
        o.opportunity = Math.max(0, Math.min(o.size - o.anchors, Number(o.opportunity) || 0));
        o.cooldown = Math.max(0, Math.min(52, Number(o.cooldown) || 0));
      } else {
        // ל"חדש אצלנו" אין size ואין שכבות לחלק: החברוּת נגזרת מ-days בלבד, ו-maxShown
        // הוא תקרת-תצוגה שחותכת מהוותיק. ר' buildNew.
        o.days = Math.max(1, Math.min(365, Number(o.days) || d.days));
        // 0 מותר במפורש ומשמעותו "בלי תקרה" — ולכן אי אפשר להשתמש כאן ב-`|| d.maxShown`,
        // שהיה הופך 0 לברירת-המחדל ומחזיר תקרה שהמנהל ביטל בכוונה.
        o.maxShown = Math.max(0, Math.min(60, Number(o.maxShown) || 0));
        o.minShown = Math.max(0, Math.min(60, Number(o.minShown) || 0));
        // הרצפה לא יכולה לחרוג מהתקרה — אחרת התקרה חותכת ואז הרצפה מוסיפה בחזרה, בלולאה
        // שנראית כאילו התקרה פשוט אינה עובדת.
        if (o.maxShown > 0 && o.minShown > o.maxShown) o.minShown = o.maxShown;
      }
      p[k] = o;
    });
    return p;
  }
  function rotationCount(policy) {
    var c = normalizePolicy(policy).featured;
    return Math.max(0, c.size - c.anchors - c.opportunity);
  }

  window.HB_SECTIONS = {
    DEFAULT_POLICY: DEFAULT_POLICY,
    CRITERIA: CRITERIA,
    criterionByKey: criterionByKey,
    normalizePolicy: normalizePolicy,
    rotationCount: rotationCount,
    periodIndex: periodIndex,
    periodRange: periodRange,
    buildFeatured: buildFeatured,
    buildNew: buildNew,
    isFlaggedFeatured: isFlaggedFeatured,
    isFlaggedNew: isFlaggedNew,
    exposureIndex: exposureIndex,
    historyFor: historyFor,
    bizHistory: bizHistory,
    profileScore: profileScore,
    newExitDate: newExitDate,
    effectiveNewStart: effectiveNewStart,
    isLaunchCohort: isLaunchCohort
  };
})();
