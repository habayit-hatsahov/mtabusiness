// ── social-links.js — נרמול קישורי אתר/פייסבוק/אינסטגרם ─────────────────────────────
// script קלאסי (לא module), נטען מוקדם — אותה קונבנציה בדיוק כמו hours.js, categories.js
// ו-phone-check.js. חושף window.HB_LINKS (וגם module.exports, לבדיקות node).
//
// למה זה קיים (2026-08-20, ר' docs/PROJECT_CONTEXT.md §232):
//   שדות "אתר / פייסבוק / אינסטגרם" הם טקסט חופשי בטופס ההרשמה ובדשבורד העסק, בלי שום
//   ולידציה. בפועל בעלי העסקים מילאו אותם בכל צורה אפשרית: קישור מלא, דומיין בלי https,
//   handle בלבד ("galgaash"), @handle, שני קישורים באותה שורה, וגם **שם העמוד בעברית**
//   ("ספורט אנד פול", "איה מצברים"). הרינדור ב-home.html היה `'https://' + value` נאיבי,
//   כלומר שם בעברית הפך ל-href שבור שלא נפתח — בדיוק הבאג שדווח.
//
//   ⚠️ בעל העסק לא יכול לגלות את זה בעצמו: בתצוגה-המקדימה בדשבורד שלו (business-dashboard.html)
//   צ'יפ הקישור מרונדר עם href="#" ו-onclick="return false" — הוא נראה תקין ולא נפתח בכלל.
//   לכן הנתונים השבורים הצטברו בשקט.
//
// העיקרון: **לא מנחשים, ולא מציגים קישור מת.**
//   - ערך שאפשר לגזור ממנו כתובת אמיתית → נגזר ומוצג.
//   - ערך שהוא שם/טקסט חופשי → מסומן unusable, והצ'יפ פשוט לא מוצג ללקוח.
//     המנהל רואה אותו ברשימת "קישורים שבורים" ומתקן מול העסק. עדיף בלי קישור מקישור מת.
//   - הערך הגולמי **לא נדרס** ב-Firestore — הנרמול הוא בזמן רינדור בלבד, כדי שתמיד יישאר
//     גלוי מה בעל העסק באמת כתב.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HB_LINKS = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // דומיין: לפחות שתי תוויות מופרדות בנקודה, אופציונלית עם נתיב/שאילתה. לא מקבל רווחים.
  var DOMAIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+([/?#].*)?$/;

  // שם-משתמש בפייסבוק: אותיות לטיניות, ספרות ונקודות בלבד, 5 תווים לפחות, ולא מתחיל/מסתיים
  // בנקודה — אלה הכללים של פייסבוק עצמה. קו-תחתון **אינו** חוקי שם, ולכן ערך כמו
  // "surfin_ISRAEL" לא ייגזר לקישור (הוא היה מוביל ל-404, וזה לא טוב יותר מקישור מת).
  var FB_HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9.]{3,48}[A-Za-z0-9]$/;

  // שם-משתמש באינסטגרם: אותיות, ספרות, נקודה וקו-תחתון, עד 30 תווים, ולא מתחיל/מסתיים בנקודה
  // (כלל של אינסטגרם) — כך "Cleaning." נדחה. שני תווים לפחות: שם-משתמש בן תו בודד כמעט לא
  // קיים בפועל, ותו בודד הוא כמעט תמיד שארית של שם שהוקלד בטעות (כמו "ד" של ד"ר אופטיקה).
  var IG_HANDLE_RE = /^[A-Za-z0-9_][A-Za-z0-9._]{0,28}[A-Za-z0-9_]$/;

  // ⚠️ שני ה-regex-ים לא מבחינים בין handle לבין *מילה* לטינית בודדת ("Metento"), כי הן זהות
  // צורנית. מה שכן נחסם הוא כל מה שנראה כמו שם ולא כמו handle: עברית, רווחים, תווים מיוחדים.
  // מילה לטינית אחת תמיד תתפרש כ-handle, וזו ההתנהגות הנכונה — ברוב המקרים היא באמת ה-handle.
  function hasLetter(s) { return /[A-Za-z]/.test(s); }

  // ⚠️ handle עם נקודה נראה בדיוק כמו דומיין: "mr.chumpytattoo" ו-"Shawarma.Shemesh" הם
  // שמות-משתמש אמיתיים בפייסבוק, ו-"golda.party" הוא שם-משתמש אמיתי באינסטגרם — אבל
  // DOMAIN_RE מקבל את שלושתם, וייצר מהם "https://mr.chumpytattoo/". לכן בשדות פייסבוק/
  // אינסטגרם מכריעים לפי הסיומת: רק סיומת מהרשימה הזו (או קו-נטוי/www. בערך) נחשבת דומיין,
  // וכל השאר מטופל כ-handle. רשימה מכוונת-מציאות ולא ממצה — ".party" למשל מושמט בכוונה,
  // כי בשדה אינסטגרם הוא כמעט תמיד סוף של handle ולא סיומת-דומיין.
  var COMMON_TLDS = ['com', 'net', 'org', 'co', 'il', 'uk', 'us', 'io', 'ai', 'app', 'dev',
                     'me', 'info', 'biz', 'shop', 'store', 'online', 'site', 'tv', 'ly',
                     'gov', 'edu', 'ac', 'xyz'];

  function hasKnownTld(s) {
    var host = s.split(/[/?#]/)[0];
    var parts = host.split('.');
    if (parts.length < 2) return false;
    return COMMON_TLDS.indexOf(parts[parts.length - 1].toLowerCase()) !== -1;
  }

  // בשדה חברתי: מתי להעדיף פירוש-כדומיין על פירוש-כ-handle
  function preferDomain(s) {
    return s.indexOf('/') !== -1 || /^(www|m)\./i.test(s) || hasKnownTld(s);
  }

  function looksLikeLink(tok) {
    return /^https?:\/\//i.test(tok) || DOMAIN_RE.test(tok);
  }

  // ── כתובת שנכתבה בסדר הפוך — "drorchen.facebook.com" (2026-09-02, §362) ──────────────
  // אוהד שנרשם באימות-ללא-מנוי הזין את השם **לפני** דומיין הרשת במקום אחריו. הערך הזה עובר
  // כל בדיקה מבנית שיש כאן: שלוש תוויות מופרדות בנקודה, סיומת .com מוכרת — ולכן preferDomain
  // הכריע "דומיין", DOMAIN_RE התאים, ונבנתה הכתובת https://drorchen.facebook.com/ עם
  // confidence **'exact'**, רמת-הביטחון הגבוהה ביותר שהמנוע הזה יודע לתת.
  //
  // ⚠️ זה הכישלון ההפוך בדיוק ממה שהקובץ הזה מבטיח בכותרת שלו. לא רק שהוצג קישור מת — הוא
  // הוצג **בלי שום סימן**: בכרטיס במרכז הניהול הוא נראה כמו אוהד שהדביק כתובת מלאה ותקינה,
  // בעוד ששם-משתמש עירום, שהוא ראיה חלשה *פחות*, מסומן במפורש "(כתובת שהושלמה מהשם)".
  // גם ההערה הרכה בטופס שתקה, כי מבחינתה הערך היה תקין לגמרי.
  //
  // הזיהוי ודאי ואינו ניחוש: תת-דומיין של facebook.com/instagram.com שאינו אחד מהמארחים
  // האמיתיים שלהן פשוט אינו קיים ב-DNS, והדפדפן ייפול על שגיאת-רשת תמיד. אין כאן שאלה של
  // "אולי הפרופיל נמחק" — הכתובת עצמה לא קיימת.
  var NET_HOSTS = {
    facebook:  ['facebook.com', 'fb.com', 'fb.me'],
    instagram: ['instagram.com', 'instagr.am'],
  };
  // המארחים האמיתיים של הרשתות. כל תת-דומיין אחר תחתיהן אינו קיים.
  var REAL_SUBHOSTS = ['www', 'm', 'web', 'mobile', 'touch', 'free', 'business',
                       'l', 'lm', 'developers', 'help', 'upload', 'about'];

  function reversedNetworkHost(s) {
    var host = String(s).replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
    for (var k in NET_HOSTS) {
      var list = NET_HOSTS[k];
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        if (host === d) return null;                                  // הדומיין עצמו — תקין
        if (host.slice(-(d.length + 1)) !== '.' + d) continue;
        var prefix = host.slice(0, -(d.length + 1));
        if (REAL_SUBHOSTS.indexOf(prefix) !== -1) return null;        // www.facebook.com וכו'
        return { network: k, domain: d, prefix: prefix };
      }
    }
    return null;
  }

  function result(ok, url, confidence, reason, raw) {
    return { ok: ok, url: url, confidence: confidence, reason: reason, raw: raw };
  }

  // kind: 'website' | 'facebook' | 'instagram'
  // מחזיר { ok, url, confidence:'exact'|'guessed'|null, reason, raw }
  //   exact   — הערך עצמו הוא כתובת/דומיין, רק הושלם לו https
  //   guessed — הערך הוא handle בלבד, והורכבה ממנו כתובת הפרופיל
  //   reason  — 'empty' | 'ok' | 'picked_first' | 'handle' | 'not_a_link' | 'bad_url' | 'reversed'
  //   suggest — רק כש-reason==='reversed': הכתובת כפי שהיא כנראה אמורה להיראות, כטקסט להצגה
  //             לנרשם. **לא** כתובת לפתיחה, ולעולם לא נשמרת אוטומטית.
  function normalize(kind, raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return result(false, null, null, 'empty', s);

    // שני קישורים באותה שורה, או קישור עם טקסט לידו ("z-zol.co.il   www.intex-pool.co.il")
    // — לוקחים את הטוקן הראשון שנראה כמו קישור. אם אין כזה, ממשיכים עם המחרוזת המלאה.
    var reason = 'ok';
    var tokens = s.split(/\s+/);
    if (tokens.length > 1) {
      var hit = null;
      for (var i = 0; i < tokens.length; i++) {
        if (looksLikeLink(tokens[i].replace(/^@/, ''))) { hit = tokens[i]; break; }
      }
      if (!hit) return result(false, null, null, 'not_a_link', s);
      s = hit;
      reason = 'picked_first';
    }

    s = s.replace(/^@/, '');

    // §362 — סדר הפוך. חייב להיבדק **לפני** ענף ה-http, כי "https://drorchen.facebook.com"
    // סובל מאותה תקלה בדיוק ו-new URL היה מקבל אותו בלי הנד עפעף.
    //
    // ⚠️ **לא נגזר מכאן קישור אוטומטית.** "drorchen" הוא כמעט בוודאות שם-המשתמש, אבל
    // "כמעט" מוביל לפרופיל של אדם אחר לגמרי שהמנהל מאשר לפיו בלי לדעת — בדיוק מה ש-§345
    // אוסר. ההצעה מוחזרת ב-`suggest` כטקסט להצגה בלבד: מי שמאשר אותה הוא הנרשם, בהקלדה.
    var rev = reversedNetworkHost(s);
    if (rev) {
      var bad = result(false, null, null, 'reversed', raw);
      // תת-דומיין מרובה-תוויות ("a.b.facebook.com") — לא ברור מה מתוכו השם, ולא מציעים ניחוש.
      bad.suggest = rev.prefix.indexOf('.') === -1 ? rev.domain + '/' + rev.prefix : null;
      return bad;
    }

    if (/^https?:\/\//i.test(s)) {
      try {
        var u = new URL(s);
        if (!u.hostname || u.hostname.indexOf('.') === -1) return result(false, null, null, 'bad_url', raw);
        return result(true, u.href, 'exact', reason, raw);
      } catch (e) { return result(false, null, null, 'bad_url', raw); }
    }

    var asDomain = function () {
      try {
        return result(true, new URL('https://' + s).href, 'exact', reason, raw);
      } catch (e2) { return result(false, null, null, 'bad_url', raw); }
    };

    // בשדות חברתיים ה-handle מנצח את פירוש-הדומיין, אלא אם הערך נראה כמו דומיין של ממש
    // (ר' ההערה על COMMON_TLDS למעלה).
    if (kind === 'facebook' || kind === 'instagram') {
      var handleRe = kind === 'facebook' ? FB_HANDLE_RE : IG_HANDLE_RE;
      var base = kind === 'facebook' ? 'https://www.facebook.com/' : 'https://www.instagram.com/';
      // hasLetter — שם-משתמש שכולו ספרות ("96") הוא כמעט תמיד שארית של טקסט שהוקלד, לא handle
      if (!preferDomain(s) && handleRe.test(s) && hasLetter(s)) {
        return result(true, base + s, 'guessed', 'handle', raw);
      }
      if (DOMAIN_RE.test(s)) return asDomain();
      return result(false, null, null, 'not_a_link', raw);
    }

    if (DOMAIN_RE.test(s)) return asDomain();
    return result(false, null, null, 'not_a_link', raw);
  }

  // נוחות לרינדור: מחזיר כתובת או null. חוסך `normalize(...).ok ? ... : ...` בכל אתר-קריאה.
  function toUrl(kind, raw) {
    var r = normalize(kind, raw);
    return r.ok ? r.url : null;
  }

  // הודעת-שגיאה לבעל העסק / למנהל, בעברית. null כשהערך תקין או ריק.
  function problemText(kind, raw) {
    var r = normalize(kind, raw);
    if (r.ok || r.reason === 'empty') return null;
    var what = kind === 'facebook' ? 'עמוד הפייסבוק' : kind === 'instagram' ? 'פרופיל האינסטגרם' : 'האתר';
    if (r.reason === 'reversed') {
      return 'נראה שהסדר התהפך — השם צריך לבוא **אחרי** הדומיין' +
             (r.suggest ? ', כלומר ' + r.suggest : '') + '.';
    }
    if (r.reason === 'bad_url') return 'הכתובת של ' + what + ' לא תקינה.';
    return 'זה נראה כמו שם ולא כמו כתובת. הדביקו את הקישור המלא ל' + what + ' (מתחיל ב-https://), לא את השם.';
  }

  return {
    normalize: normalize,
    toUrl: toUrl,
    problemText: problemText,
    DOMAIN_RE: DOMAIN_RE,
    FB_HANDLE_RE: FB_HANDLE_RE,
    IG_HANDLE_RE: IG_HANDLE_RE,
  };
});
