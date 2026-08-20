// ── hours.js — שעות פעילות מובנות: מודל, תצוגה והמרה ────────────────────────────────
// script קלאסי (לא module), נטען מוקדם — אותה קונבנציה בדיוק כמו phone-check.js
// ו-categories.js. חושף window.HB_HOURS.
//
// למה זה קיים (2026-08-20, ר' docs/PROJECT_CONTEXT.md §229):
//   1. עד היום שעות הפעילות היו שדה טקסט חופשי יחיד (hours). 37 העסקים מילאו אותו
//      ב-11 פורמטים שונים ("11-16", "א-ה 8-21 ו 8-14", "24/6", "כל השבוע"), ולא היה
//      אפשר להציג אותם אחיד או לדעת מתי עסק סגור.
//   2. ⚠️ באג-אמת שנמדד בדפדפן: טווח שעות בתוך טקסט עברי מרונדר **הפוך** —
//      "א-ה 09:00-18:00" הוצג ללקוחות כ-"א-ה 18:00-09:00" אצל כל 25 העסקים שמילאו
//      שעות. זו התנהגות bidi תקנית (המקף בין שני מספרים הוא תו ניטרלי שמקבל את כיוון
//      הסביבה וגורר איתו את סדר המספרים). fixBidi() כאן הוא התיקון, והוא חל גם על
//      הטקסט הישן — כלומר עסק שלא הומר עדיין מוצג נכון מהרגע הזה.
//
// המודל (מה שנשמר ב-Firestore על מסמך העסק):
//   hoursMode : 'fixed' | 'other'   — שני מצבים בלבד. "פתוח תמיד"/"לפי תיאום" נדחו
//                                     במפורש; מי שלא נכנס לטבלה כותב ב"אחר", והמנהל מנסח.
//   hoursDays : [{closed,open,close}] × 7, אינדקס 0=ראשון … 6=שבת   (רק ב-'fixed')
//   hoursOther: מחרוזת חופשית שעוברת אישור מנהל                     (רק ב-'other')
//   hours     : המחרוזת הישנה — **נשמרת תמיד**, ומסונכרנת לטקסט של המבנה בכל שמירה.
//               כך כל מסך שעדיין קורא רק את hours (מיילים, admin-businesses.html הישן,
//               כל מקום שנשכח) ממשיך להציג את האמת ולא ערך מיושן.

(function () {
  'use strict';

  var DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var DAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ── בידוד-כיוון לטווחי שעות ──────────────────────────────────────────────────
  // הפתרון היחיד שעבד במדידה: direction:ltr + unicode-bidi:isolate. עטיפה של **כל**
  // המחרוזת לא מתאימה — היא הייתה הופכת את העברית שבתוכה; לכן regex שעוטף רק את
  // הטווחים עצמם. סגנון inline ולא class, כדי שהמודול יהיה drop-in בכל דף בלי לגעת
  // ב-CSS שלו (ל-home.html כבר יש .ltr-value זהה בתפקידו לטלפון/מייל/אתר).
  var ISO = 'direction:ltr;unicode-bidi:isolate;white-space:nowrap';

  // ⚠️ **לא כל טווח שבור, ולא כל מקף מתנהג אותו דבר.** נמדד בדפדפן על טקסט RTL אמיתי
  // (getBoundingClientRect על כל מספר, לא הערכה), והתוצאה תואמת בדיוק את אלגוריתם
  // ה-bidi של יוניקוד:
  //     "09:00-18:00"    מקף רגיל **צמוד**  → ✓ תקין   (המקף הוא ES ומאחד שני מספרים)
  //     "09:00 - 18:00"  מקף עם רווחים      → ✗ הפוך   (הרווחים שוברים את כלל ה-ES)
  //     "09:00–18:00"    en-dash            → ✗ הפוך   (ON — מקבל את כיוון הסביבה)
  //     "09:00—18:00"    em-dash            → ✗ הפוך
  //     "08:00 עד 17:00" מילה עברית מפרידה  → ✗ הפוך   (קיים בפועל אצל "דנון ובניו")
  //     "24/6"                              → ✓ תקין
  // כלומר טבלת §229 הגזימה בהיקף: השורה "מקף רגיל בתוך משפט עברי → הפוך" **אינה
  // משוחזרת**. עדיין נכון לעטוף את כולם — העטיפה לא מזיקה לתקינים, ומגנה על השבורים.
  //
  // (^|[^\d:]) לפני, ו-(?!\d|:) אחרי — שני הגארדים האלה מונעים פגיעה במספרי טלפון:
  // "03-1234567" לא נתפס, כי אחרי שתי הספרות של הצד השני באה ספרה שלישית.
  // lookbehind נמנע בכוונה (לא נתמך ב-Safari מתחת ל-16.4).
  var RANGE_RX = /(^|[^\d:])(\d{1,2}(?::\d{2})?)(\s*[-–—/]\s*|\s+עד\s+)(\d{1,2}(?::\d{2})?)(?!\d|:)/g;

  // מקבל מחרוזת **שכבר עברה esc** ומחזיר HTML. (ה-esc לא מייצר ספרות סמוכות למקף,
  // ולכן אינו מפריע ל-regex.)
  function fixBidi(escaped) {
    return String(escaped == null ? '' : escaped).replace(RANGE_RX,
      function (m, pre, a, sep, b) {
        return pre + '<span style="' + ISO + '">' + a + sep + b + '</span>';
      });
  }

  // ── ברירות מחדל ונרמול ───────────────────────────────────────────────────────
  function defaultDays() {
    return DAY_NAMES.map(function (_, i) {
      return { closed: i === 6, open: '09:00', close: i === 5 ? '14:00' : '18:00' };
    });
  }

  var TIME_RX = /^([01]?\d|2[0-4]):([0-5]\d)$/;

  // מחזיר מערך תקין של 7 ימים, או null אם מה שהגיע מ-Firestore לא שמיש.
  // null (ולא ברירת-מחדל) בכוונה: כך מי שקורא יודע להיפול חזרה למחרוזת הישנה במקום
  // להציג "א–ה 09:00–18:00" מומצא שאיש לא הזין.
  function normalizeDays(v) {
    if (!Array.isArray(v) || v.length !== 7) return null;
    var out = [];
    for (var i = 0; i < 7; i++) {
      var d = v[i] || {};
      var closed = !!d.closed;
      var open = String(d.open || ''), close = String(d.close || '');
      if (!closed && !(TIME_RX.test(open) && TIME_RX.test(close))) return null;
      out.push({
        closed: closed,
        open: TIME_RX.test(open) ? open : '09:00',
        close: TIME_RX.test(close) ? close : '18:00',
      });
    }
    return out;
  }

  // ── קיבוץ ימים רצופים בעלי אותן שעות → "א–ה 09:00–18:00 · ו 09:00–14:00 · ש סגור"
  function groupDays(days) {
    var parts = [], i = 0;
    // שני ימים סגורים מתקבצים תמיד — השעות שנשמרו מאחוריהם לא מוצגות וממילא לא רלוונטיות.
    // בלי זה "ו סגור · ש סגור" לא היה מתאחד ל-"ו–ש סגור" רק בגלל ברירות-מחדל שונות.
    var same = function (a, b) {
      return (a.closed && b.closed) ||
        (a.closed === b.closed && a.open === b.open && a.close === b.close);
    };
    while (i < 7) {
      var d = days[i], j = i;
      while (j + 1 < 7 && same(d, days[j + 1])) j++;
      var span = i === j ? DAY_SHORT[i] : DAY_SHORT[i] + '–' + DAY_SHORT[j];
      parts.push({ span: span, closed: d.closed, open: d.open, close: d.close });
      i = j + 1;
    }
    return parts;
  }

  // ⚠️ טווח השעות מופרד ב**מקף רגיל צמוד** ולא ב-en-dash, בכוונה ולפי מדידה (ר' RANGE_RX):
  // מקף צמוד הוא הצורה היחידה שמרונדרת נכון ב-RTL **גם בלי שום עטיפה**. זה חשוב כי
  // המחרוזת הזאת נשמרת חזרה ל-hours הישן, וכל מסך שעדיין מציג אותו גולמי (מייל, קובץ
  // שנשכח) יראה אותה נכון. המקף בין אותיות-הימים ("א–ה") נשאר en-dash — שם אין מספרים
  // ולכן אין סיכון.
  function daysToPlain(days) {
    return groupDays(days).map(function (p) {
      return p.closed ? p.span + ' סגור' : p.span + ' ' + p.open + '-' + p.close;
    }).join(' · ');
  }

  function daysToHtml(days) {
    return groupDays(days).map(function (p) {
      return p.closed ? esc(p.span) + ' סגור'
        : esc(p.span) + ' <span style="' + ISO + '">' + p.open + '-' + p.close + '</span>';
    }).join(' · ');
  }

  // ── מה יש לעסק הזה בפועל ─────────────────────────────────────────────────────
  // מחזיר {kind:'fixed'|'other'|'legacy'|'none', days, text}
  function read(biz) {
    biz = biz || {};
    if (biz.hoursMode === 'fixed') {
      var days = normalizeDays(biz.hoursDays);
      if (days) return { kind: 'fixed', days: days, text: daysToPlain(days) };
    }
    if (biz.hoursMode === 'other') {
      var o = String(biz.hoursOther || '').trim();
      if (o) return { kind: 'other', days: null, text: o };
    }
    var legacy = String(biz.hours || '').trim();
    if (legacy) return { kind: 'legacy', days: null, text: legacy };
    return { kind: 'none', days: null, text: '' };
  }

  function hasHours(biz) { return read(biz).kind !== 'none'; }

  // HTML מוכן-לתצוגה. nl: 'br' (ברירת מחדל) | 'dot' | 'space' — איך לטפל בשורות
  // חדשות בטקסט הישן/החופשי (home.html:2977 השתמש ב-<br>, home.html:3045 ב-" · ").
  function toHtml(biz, opts) {
    var r = read(biz);
    if (r.kind === 'none') return '';
    if (r.kind === 'fixed') return daysToHtml(r.days);
    var nl = (opts && opts.nl) || 'br';
    var html = fixBidi(esc(r.text));
    return html.replace(/\n/g, nl === 'dot' ? ' · ' : nl === 'space' ? ' ' : '<br>');
  }

  // טקסט נקי בלי HTML — לסיכומים, מיילים, ולסנכרון חזרה ל-hours הישן.
  function toPlain(biz) { return read(biz).text; }

  // ══════════════════════════════════════════════════════════════════════════════
  //  הממיר — הפיכת הטקסט החופשי הישן למבנה. אותו קוד שנבדק בדמו על 37 העסקים.
  //  מחזיר {kind, parsed?, why?}:
  //    full    — ימים ושעות נגזרו במלואם
  //    assumed — נגזרו שעות בלי ימים, והונח א׳–ה׳ (החלטת המשתמש)
  //    manual  — שעות בלי ימים, אבל הטקסט מזכיר ימים נוספים במילים → לא לנחש
  //    prose   — אין מה לגזור → נכנס למצב "אחר"
  //    empty   — ריק
  // ══════════════════════════════════════════════════════════════════════════════
  // ── זיהוי יום ──────────────────────────────────────────────────────────────
  // (?![א-ת]) הוא הגארד הקריטי, ולא קישוט. בלעדיו האות הבודדת נתפסה כאות **ראשונה
  // של מילה ארוכה יותר**, ו-"סרף אין" ("א-ה 10:00-19:00 שישי 10:00-15:00") הומר
  // בשקט ל-"ש 10:00–15:00" — כלומר שעות שישי נכתבו על שבת, ושישי סומן סגור.
  // נתפס במדידה על 37 העסקים האמיתיים, לא הושער.
  // מילים מלאות נתמכות מאותה סיבה: בלעדיהן אותו עסק היה נופל ל"ידני" ומגיע לרשימת
  // המילוי הידני של המשתמש בלי צורך. סדר האלטרנטיבות — הארוכה קודם, אחרת "שלישי"
  // היה נחתך ל"שני".
  var DAY_WORDS = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'ששי': 5, 'שבת': 6 };
  var DAY_RE = "(?:ראשון|שלישי|רביעי|חמישי|שישי|ששי|שבת|שני|[אבגדהוש]['׳]?)(?![א-ת])";
  var SEP = '(?:\\s*[-–—]\\s*|\\s+עד\\s+)';   // גם מפריד מילולי: "08:00 עד 17:00" (דנון)

  // 'ה׳' → 4, 'שישי' → 5, 'ש' → 6
  function dayIndex(tok) {
    var s = String(tok || '').replace(/['׳]/g, '').trim();
    if (Object.prototype.hasOwnProperty.call(DAY_WORDS, s)) return DAY_WORDS[s];
    return DAY_SHORT.indexOf(s);
  }

  function normTime(t) {
    var m = String(t).trim().match(/^(\d{1,2})[:.]?(\d{2})?$/);
    if (!m) return null;
    var hh = +m[1], mm = m[2] ? +m[2] : 0;
    if (hh > 24 || mm > 59 || (hh === 24 && mm > 0)) return null;   // 24:00 קיים בפועל (DJ ZANO)
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  function convert(raw) {
    var s = String(raw || '').trim();
    if (!s) return { kind: 'empty' };
    if (!/\d/.test(s)) return { kind: 'prose' };
    var out = [];
    var timeRe = new RegExp('(\\d{1,2}(?:[:.]\\d{2})?)' + SEP + '(\\d{1,2}(?:[:.]\\d{2})?)', 'g');
    var tm;
    while ((tm = timeRe.exec(s))) {
      var from = normTime(tm[1]), to = normTime(tm[2]);
      if (!from || !to) continue;
      var before = s.slice(0, tm.index);
      var rng = before.match(new RegExp('(' + DAY_RE + ')\\s*[-–—]\\s*(' + DAY_RE + ")\\s*(?:בין\\s*)?(?:השעות\\s*)?[^\\d]*$"));
      var one = before.match(new RegExp('(?:^|[\\s,])(' + DAY_RE + ")\\s*(?:בין\\s*)?(?:השעות\\s*)?[^\\d]*$"));
      var days = null;
      if (rng) {
        var a = dayIndex(rng[1]), b = dayIndex(rng[2]);
        if (a >= 0 && b >= a) { days = []; for (var k = a; k <= b; k++) days.push(k); }
      } else if (one) {
        var k2 = dayIndex(one[1]);
        if (k2 >= 0) days = [k2];
      }
      out.push({ days: days, from: from, to: to });
    }
    if (!out.length) return { kind: 'prose' };
    // החלטת המשתמש (2026-08-20): "שעות בלי ימים = א-ה". חל רק כשאין בטקסט שום רמז
    // לימים אחרים. "בני שליחויות" מזכיר שישי ומוצ״ש **במילים ולא באותיות** — הנחת
    // א-ה הייתה מוחקת לו מידע אמיתי, ולכן הוא מסומן manual ולא מנוחש.
    var mentionsMoreDays = /שיש[יא]|שבת|מוצ|שבתות/.test(s);
    var missing = out.some(function (o) { return !o.days; });
    if (missing) {
      if (mentionsMoreDays) return { kind: 'manual', parsed: out, why: 'הטקסט מזכיר ימים נוספים במילים' };
      out.forEach(function (o) { if (!o.days) o.days = [0, 1, 2, 3, 4]; });
      return { kind: 'assumed', parsed: out };
    }
    return { kind: 'full', parsed: out };
  }

  // ימים שלא הוזכרו בטקסט נשארים **סגורים** — זו הקריאה הנכונה: "א-ה 9-17" אומר
  // שישי-שבת סגורים, ולא "לא ידוע".
  function parsedToDays(parsed) {
    var days = DAY_NAMES.map(function () { return { closed: true, open: '09:00', close: '18:00' }; });
    (parsed || []).forEach(function (p) {
      (p.days || []).forEach(function (i) {
        if (i >= 0 && i < 7) days[i] = { closed: false, open: p.from, close: p.to };
      });
    });
    return days;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  seed — מה הרכיב מראה כשפותחים אותו
  // ══════════════════════════════════════════════════════════════════════════════
  // מחזיר {mode, days, other, seeded}. seeded מסביר **מאיפה** הגיע הערך, כדי שהמסך
  // יוכל לומר "מילאנו עבורכם לפי מה שהיה רשום" רק כשזה באמת מה שקרה:
  //   'stored'    — כבר יש מבנה שמור, לא נגענו
  //   'converted' — נגזר מהטקסט הישן (יש לאשר/לתקן)
  //   'other'     — הטקסט הישן לא ניתן לגזירה, הועבר כמו-שהוא ל"אחר"
  //   'empty'     — לא היה כלום
  // 'manual' לעולם לא מנוחש (ר' convert) — הוא נופל ל'other' עם הטקסט המלא, כדי שלא
  // יימחק מידע אמיתי שבעל-העסק כתב.
  function seed(biz) {
    biz = biz || {};
    if (biz.hoursMode === 'fixed') {
      var d = normalizeDays(biz.hoursDays);
      if (d) return { mode: 'fixed', days: d, other: '', seeded: 'stored' };
    }
    if (biz.hoursMode === 'other' && String(biz.hoursOther || '').trim()) {
      return { mode: 'other', days: defaultDays(), other: String(biz.hoursOther).trim(), seeded: 'stored' };
    }
    var legacy = String(biz.hours || '').trim();
    if (!legacy) return { mode: 'fixed', days: defaultDays(), other: '', seeded: 'empty' };
    var r = convert(legacy);
    if (r.kind === 'full' || r.kind === 'assumed') {
      return { mode: 'fixed', days: parsedToDays(r.parsed), other: '', seeded: 'converted' };
    }
    return { mode: 'other', days: defaultDays(), other: legacy, seeded: 'other' };
  }

  // המטען לשמירה. hours הישן מסונכרן תמיד — ר' ההערה בראש הקובץ.
  function toPayload(m) {
    if (m.mode === 'other') {
      var o = String(m.other || '').trim();
      return { hoursMode: 'other', hoursOther: o, hoursDays: null, hours: o };
    }
    return { hoursMode: 'fixed', hoursDays: m.days, hoursOther: '', hours: daysToPlain(m.days) };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  הרכיב — מוטמע ב-3 מסכי העריכה (דשבורד העסק, טופס ההרשמה, האדמין)
  // ══════════════════════════════════════════════════════════════════════════════
  // מימוש אחד ולא שלושה במכוון: זה בדיוק סוג הרכיב שנוטה להתפצל בין הדפים ולהתחיל
  // להתנהג אחרת בכל אחד מהם. ה-CSS מוזרק מכאן מאותה סיבה — הרכיב drop-in, ודף
  // שרוצה להתאים אותו לעצמו דורס משתני-CSS (--hbh-*) במקום לשכתב כללים.

  var TIMES = (function () {
    var out = [];
    for (var h = 0; h <= 23; h++) { out.push(pad(h) + ':00'); out.push(pad(h) + ':30'); }
    out.push('24:00');                     // חצות — מופיע בפועל אצל DJ ZANO
    return out;
  })();
  function pad(n) { return String(n).padStart(2, '0'); }

  // האם חמשת ימי החול (א׳–ה׳) זהים — קובע אם השורה המקובצת מייצגת אותם נאמנה.
  function weekdaysUniform(days) {
    if (!days || days.length < 5) return true;
    var a = days[0];
    for (var i = 1; i < 5; i++) {
      var b = days[i];
      if (a.closed !== b.closed) return false;
      if (!a.closed && (a.open !== b.open || a.close !== b.close)) return false;
    }
    return true;
  }

  var CSS_ID = 'hbh-styles';
  var CSS = [
    // ⚠️ ברירות-המחדל נמסרות כ-fallback בתוך כל var(), ולא כהגדרה על .hbh עצמה.
    // הגדרה על .hbh הייתה **חוסמת דריסה מבחוץ** — משתנה שמוגדר על האלמנט עצמו גובר
    // תמיד על אותו משתנה שיורש מאב, ולכן דף כהה (admin) לא היה יכול להתאים את הרכיב.
    // נמדד בדפדפן, לא הושער.
    '.hbh{font-family:inherit;color:var(--hbh-text,#0A2A66)}',
    '.hbh-modes{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
    '.hbh-mode{flex:1;min-width:120px;padding:11px 12px;border-radius:11px;border:1.5px solid var(--hbh-border,#E7E7E0);',
    'background:var(--hbh-bg,#fff);font-family:inherit;font-size:12.5px;font-weight:700;color:var(--hbh-muted,#6B7A9B);cursor:pointer;transition:all .12s}',
    '.hbh-mode:hover{border-color:var(--hbh-accent,#0A2A66)}',
    '.hbh-mode.sel{border-color:var(--hbh-accent,#0A2A66);background:color-mix(in srgb,var(--hbh-accent,#0A2A66) 6%,transparent);color:var(--hbh-accent,#0A2A66)}',
    '.hbh-hint{font-size:11.5px;color:var(--hbh-muted,#6B7A9B);line-height:1.55;margin-bottom:12px}',
    '.hbh-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--hbh-border,#E7E7E0)}',
    '.hbh-row:last-child{border-bottom:none}',
    '.hbh-day{width:88px;flex:none;font-size:13px;font-weight:700}',
    '.hbh-day small{display:block;font-weight:400;font-size:10.5px;color:var(--hbh-muted,#6B7A9B)}',
    '.hbh-act{width:66px;flex:none;display:flex;align-items:center}',
    '.hbh-tg{position:relative;width:42px;height:23px;flex:none;cursor:pointer;display:block}',
    '.hbh-tg input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:2}',
    '.hbh-tg .hbh-track{position:absolute;inset:0;background:#D8DCE3;border-radius:99px;transition:background .15s}',
    '.hbh-tg .hbh-knob{position:absolute;top:3px;right:3px;width:17px;height:17px;background:#fff;border-radius:50%;',
    'transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.25)}',
    '.hbh-tg input:checked ~ .hbh-track{background:var(--hbh-on,#16A34A)}',
    '.hbh-tg input:checked ~ .hbh-knob{transform:translateX(-19px)}',
    '.hbh-times{display:flex;align-items:center;gap:6px;flex:1;min-width:0}',
    '.hbh-times select{font-family:inherit;font-size:12.5px;padding:6px 8px;border-radius:8px;border:1.5px solid var(--hbh-border,#E7E7E0);',
    'background:var(--hbh-bg,#fff);color:var(--hbh-text,#0A2A66);cursor:pointer;min-width:0;flex:1;max-width:96px}',
    '.hbh-times select:focus{outline:none;border-color:var(--hbh-accent,#0A2A66)}',
    '.hbh-sep{font-size:12px;color:var(--hbh-muted,#6B7A9B);flex:none}',
    '.hbh-closed{font-size:12px;color:var(--hbh-muted,#6B7A9B);font-weight:600}',
    '.hbh-row.off .hbh-times{opacity:.35;pointer-events:none}',
    // כפתור הפיצול יושב **בשורת א׳–ה׳ עצמה** ולא מתחת לטבלה: הוא פעולה על השורה הזו,
    // באותו מקום בדיוק שבו יושב המתג בשורות שישי/שבת (בקשה מפורשת של המשתמש).
    '.hbh-split{background:transparent;border:1.5px dashed var(--hbh-border,#E7E7E0);border-radius:8px;padding:5px 6px;',
    'font-family:inherit;font-size:10.5px;font-weight:700;color:var(--hbh-muted,#6B7A9B);cursor:pointer;white-space:nowrap;width:100%;text-align:center}',
    '.hbh-split:hover{border-color:var(--hbh-accent,#0A2A66);color:var(--hbh-accent,#0A2A66)}',
    // שורת-הפעולה של מצב "יום-יום" — הכפתור לבדו, מעל שבעת הימים (ר' ההערה ב-render)
    '.hbh-bar{display:flex;justify-content:flex-start;padding-bottom:9px;margin-bottom:2px;border-bottom:1px solid var(--hbh-border,#E7E7E0)}',
    '.hbh-bar .hbh-split{width:auto;padding:6px 14px}',
    '.hbh-other textarea{width:100%;min-height:78px;resize:vertical;font-family:inherit;font-size:13px;padding:11px 13px;',
    'border-radius:11px;border:1.5px solid var(--hbh-border,#E7E7E0);background:var(--hbh-bg,#fff);color:var(--hbh-text,#0A2A66);line-height:1.6}',
    '.hbh-other textarea:focus{outline:none;border-color:var(--hbh-accent,#0A2A66)}',
    '.hbh-note{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:10px 12px;border-radius:10px;',
    'background:var(--hbh-note-bg,rgba(255,222,0,.1));border:1px solid var(--hbh-note-border,rgba(255,222,0,.45));font-size:11.5px;line-height:1.55;color:var(--hbh-text,#0A2A66)}',
    '.hbh-note b{font-weight:800}',
    // מתחת ל-380px (iPhone SE וכל מסך צר) שלוש העמודות לא נכנסות בשורה אחת. במקום לכווץ
    // את הבוררים עד לאי-שימושיות, שם-היום עולה לשורה נפרדת מעל.
    '@media (max-width:380px){.hbh-row{flex-wrap:wrap}.hbh-day{width:100%;margin-bottom:4px}.hbh-act{width:56px}}',
  ].join('');

  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function timeSelect(val, onChange) {
    var sel = document.createElement('select');
    // ערך שנשמר ולא נופל על חצי-שעה (למשל 09:30 מהמרה, או 06:45 שהמנהל הזין ידנית)
    // מתווסף כאופציה משלו — אחרת הבורר היה "מתקן" אותו בשקט לערך אחר בשמירה הבאה.
    var list = TIMES.indexOf(val) === -1 && TIME_RX.test(val)
      ? TIMES.concat([val]).sort() : TIMES;
    list.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t; o.textContent = t;
      if (t === val) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { onChange(sel.value); };
    return sel;
  }

  // onToggle === null → שורה בלי מתג פתוח/סגור. משמש לשורת א׳–ה׳ המקובצת: אין עסק
  // שסוגר את כל חמשת ימי החול במכה, ומתג כזה רק מזמין לחיצה בטעות שמוחקת שבוע שלם
  // ("אף אחד לא ישתמש בזה" — המשתמש). מי שסוגר יום חול בודד עובר ל"יום-יום".
  function dayRow(label, sub, d, onToggle, onOpen, onClose, extraEl) {
    var row = document.createElement('div');
    row.className = 'hbh-row' + (d.closed ? ' off' : '');

    var nm = document.createElement('div');
    nm.className = 'hbh-day';
    nm.appendChild(document.createTextNode(label));
    if (sub) {
      var sm = document.createElement('small');
      sm.textContent = sub;
      nm.appendChild(sm);
    }
    row.appendChild(nm);

    var act = document.createElement('div');
    act.className = 'hbh-act';
    if (onToggle) {
      var tg = document.createElement('label');
      tg.className = 'hbh-tg';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !d.closed;
      cb.setAttribute('aria-label', 'פתוח ב' + label);
      cb.onchange = function () { onToggle(!cb.checked); };
      tg.appendChild(cb);
      var tr = document.createElement('span'); tr.className = 'hbh-track'; tg.appendChild(tr);
      var kn = document.createElement('span'); kn.className = 'hbh-knob'; tg.appendChild(kn);
      act.appendChild(tg);
    } else if (extraEl) {
      act.appendChild(extraEl);
      extraEl = null;                    // נצרך — לא להוסיף אותו שוב בסוף השורה
    }
    row.appendChild(act);

    var times = document.createElement('div');
    times.className = 'hbh-times';
    if (d.closed) {
      var cl = document.createElement('span'); cl.className = 'hbh-closed'; cl.textContent = 'סגור';
      times.appendChild(cl);
    } else {
      times.appendChild(timeSelect(d.open, onOpen));
      var sp = document.createElement('span'); sp.className = 'hbh-sep'; sp.textContent = '—';
      times.appendChild(sp);
      times.appendChild(timeSelect(d.close, onClose));
    }
    row.appendChild(times);
    if (extraEl) row.appendChild(extraEl);
    return row;
  }

  // mountEditor(container, biz, opts) → { getValue, getModel, setValue, refresh }
  //   opts.onChange(payload)  — נקרא בכל שינוי, עם אותו אובייקט שמחזיר getValue()
  //   opts.approvalNote:false — להסתיר את הערת "עובר אישור הצוות" (במסך האדמין,
  //                             שהוא-עצמו המאשר)
  function mountEditor(container, biz, opts) {
    injectCss();
    opts = opts || {};
    var box = typeof container === 'string' ? document.getElementById(container) : container;
    if (!box) return null;
    var m = seed(biz);
    // נפתח ב"יום-יום" כשחמשת ימי החול **אינם** אחידים — אחרת השורה המקובצת (שמציגה תמיד
    // את ראשון) הייתה מסתירה את ההבדל. קורה בפועל: "סרף אין" אחרי המרה, וכל עסק שסוגר
    // יום חול אחד. הצורה המקובצת נשארת ברירת-המחדל למקרה הנפוץ.
    var split = !weekdaysUniform(m.days);
    box.classList.add('hbh');

    function fire() { if (opts.onChange) opts.onChange(toPayload(m)); }

    function splitBtn() {
      var b = document.createElement('button');
      b.type = 'button';                 // בלי זה הכפתור שולח את הטופס ב-business.html
      b.className = 'hbh-split';
      b.textContent = split ? '↩ לאחד' : 'יום-יום';
      b.title = split ? 'שעה אחת לכל חמשת ימי החול' : 'שעות שונות לכל יום בנפרד';
      b.onclick = function () {
        // ⚠️ המעבר חזרה לתצוגה המקובצת **מאחד בפועל** את חמשת ימי החול לפי ראשון,
        // ולא רק מקפל את התצוגה. בלי זה השורה המקובצת הייתה משקרת: היא מציגה תמיד את
        // days[0], ולכן עסק שסגר את רביעי ואז לחץ "לאחד" ראה "ראשון–חמישי 08:00-17:00"
        // בזמן שהתצוגה-המקדימה לידו הכריזה "ד סגור". נתפס בבדיקת-אינטראקציה בדפדפן.
        // "לאחד" הוא גם בדיוק מה שהכפתור מבטיח, ולכן זו הפעולה שהמשתמש ביקש.
        if (split) {
          for (var i = 1; i < 5; i++) {
            m.days[i] = { closed: m.days[0].closed, open: m.days[0].open, close: m.days[0].close };
          }
          fire();
        }
        split = !split;
        render();
      };
      return b;
    }

    function render() {
      box.innerHTML = '';

      var modes = document.createElement('div');
      modes.className = 'hbh-modes';
      [['fixed', 'שעות קבועות'], ['other', 'אחר — אני אכתוב בעצמי']].forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'hbh-mode' + (m.mode === p[0] ? ' sel' : '');
        b.textContent = p[1];
        b.onclick = function () { if (m.mode === p[0]) return; m.mode = p[0]; render(); fire(); };
        modes.appendChild(b);
      });
      box.appendChild(modes);

      var hint = document.createElement('div');
      hint.className = 'hbh-hint';
      hint.textContent = m.mode === 'other'
        ? 'לעסקים שהשעות שלהם לא נכנסות לטבלה — כתבו במילים שלכם, ואנחנו נסדר את זה.'
        : 'יום שכבוי = סגור. שישי ושבת נפרדים כי כמעט לכל עסק הם שונים.';
      box.appendChild(hint);

      if (m.mode === 'other') {
        var wrap = document.createElement('div');
        wrap.className = 'hbh-other';
        var ta = document.createElement('textarea');
        ta.placeholder = 'לדוגמה: זמין תמיד בוואטסאפ · פתוח 24 שעות חוץ משבת · לפי תיאום מראש';
        ta.value = m.other || '';
        ta.oninput = function () { m.other = ta.value; fire(); };
        wrap.appendChild(ta);
        if (opts.approvalNote !== false) {
          var note = document.createElement('div');
          note.className = 'hbh-note';
          note.innerHTML = '<span>⏳</span><span><b>מה שתכתבו כאן עובר אישור של הצוות</b> לפני שהוא מוצג באתר — ' +
            'כדי שנוכל לנסח את זה אחיד ולוודא שהוא ברור ללקוחות.</span>';
          wrap.appendChild(note);
        }
        box.appendChild(wrap);
        return;
      }

      if (!split) {
        var wd = m.days[0];
        box.appendChild(dayRow('ראשון–חמישי', 'חמשת ימי החול', wd, null,
          function (v) { for (var i = 0; i < 5; i++) m.days[i].open = v; fire(); },
          function (v) { for (var i = 0; i < 5; i++) m.days[i].close = v; fire(); },
          splitBtn()));
        [5, 6].forEach(function (i) {
          box.appendChild(dayRow(DAY_NAMES[i], '', m.days[i],
            function (c) { m.days[i].closed = c; render(); fire(); },
            function (v) { m.days[i].open = v; fire(); },
            function (v) { m.days[i].close = v; fire(); }));
        });
      } else {
        // ⚠️ ב"יום-יום" הכפתור **חייב** שורה משל עצמו, ולא בתוך שורת ראשון.
        // עמודת-הפעולה תפוסה כאן במתג פתוח/סגור, ולכן הכפתור נפל לסוף השורה כפריט-flex
        // עם width:100% — ונמדד בדפדפן שהוא בלע 408px מתוך 592, וכיווץ את שני בוררי-השעה
        // של ראשון ל-18px כל אחד (מול 96px בכל יום אחר). כלומר לא היה אפשר לבחור שעות
        // ביום ראשון בכלל. דווח על ידי המשתמש ואומת במדידה.
        var bar = document.createElement('div');
        bar.className = 'hbh-bar';
        bar.appendChild(splitBtn());
        box.appendChild(bar);
        m.days.forEach(function (d, i) {
          box.appendChild(dayRow(DAY_NAMES[i], '', d,
            function (c) { d.closed = c; render(); fire(); },
            function (v) { d.open = v; fire(); },
            function (v) { d.close = v; fire(); }));
        });
      }
    }

    render();
    return {
      getValue: function () { return toPayload(m); },
      getModel: function () { return m; },
      seeded: m.seeded,
      setValue: function (b) { m = seed(b); split = false; render(); },
      refresh: render,
    };
  }

  window.HB_HOURS = {
    DAY_NAMES: DAY_NAMES, DAY_SHORT: DAY_SHORT, TIMES: TIMES,
    esc: esc, fixBidi: fixBidi,
    defaultDays: defaultDays, normalizeDays: normalizeDays,
    groupDays: groupDays, daysToPlain: daysToPlain, daysToHtml: daysToHtml,
    read: read, hasHours: hasHours, toHtml: toHtml, toPlain: toPlain,
    convert: convert, parsedToDays: parsedToDays,
    seed: seed, toPayload: toPayload, mountEditor: mountEditor,
  };
})();
