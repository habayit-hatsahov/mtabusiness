// ── בדיקת שגיאת-כתיב בדומיין של כתובת מייל ──────────────────────────────────────────────────
// למה זה קיים: מייל שנשלח לדומיין-עם-שגיאת-כתיב (yardenyv@gamil.com במקום gmail.com) לא נכשל
// בשום מקום — Brevo מקבל את הבקשה ומחזיר הצלחה, אנחנו מסמנים 'sent', והמייל פשוט לא מגיע לנמען
// לעולם. gamil.com/gmail.con וחבריהם הם דומיינים רשומים בפועל (typo-squatting) עם שרת-דואר משלהם,
// אז אין אפילו bounce שיסגיר את זה. באג-אמת: "יהב מטבחים", 2026-08-15, ר' docs/PROJECT_CONTEXT.md §203.
//
// script קלאסי (לא module) בכוונה — נטען ב-<head> וזמין כ-window.checkEmailDomain גם לטפסים
// שרצים ב-<script> רגיל וגם לאלה שב-<script type="module">.
//
// checkEmailDomain('a@gamil.com') -> { domain:'gamil.com', suggestedDomain:'gmail.com', suggested:'a@gmail.com' }
// checkEmailDomain('a@gmail.com') -> null   (וכך גם לכל דומיין עסקי לא-מוכר — לא מנחשים על עיוור)
(function () {
  'use strict';

  // הדומיינים שאנשים באמת מקלידים כאן — רק מולם מודדים "כמה קרוב", כדי לא לסמן דומיין עסקי תקין
  var POPULAR = [
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'msn.com',
    'walla.com', 'walla.co.il', 'nana10.co.il', 'protonmail.com', 'proton.me',
    'bezeqint.net', 'netvision.net.il', 'zahav.net.il', 'inter.net.il', '013net.net',
    'hotmail.co.il', 'yahoo.co.il', 'outlook.co.il'
  ];

  // דומיינים אמיתיים שקרובים-מדי לאחד הפופולריים ולכן היו נחשבים בטעות לשגיאת-כתיב
  var ALLOW = ['mail.com', 'email.com', 'ymail.com', 'rocketmail.com', 'gmx.com', 'aol.com', 'me.com', 'mac.com'];

  // סיומות שגויות נפוצות -> הסיומת הנכונה. נבדק גם על דומיין עסקי (info@shigur-yashir.con),
  // שם אין דומיין פופולרי להשוות אליו.
  // ‼️ רק סיומות שאינן קיימות באמת. `.co` ו-`.om` הן סיומות אמיתיות (getruck.co הוא עסק אמיתי
  // בבסיס-הנתונים) — הן לא כאן בכוונה; gmail.co/icloud.co נתפסים ממילא בשלב 2, לפי קרבה לדומיין
  // פופולרי, בלי לפגוע בדומיין עסקי לגיטימי.
  var TLD_FIX = {
    'con': 'com', 'cpm': 'com', 'vom': 'com', 'comm': 'com', 'ocm': 'com', 'cim': 'com',
    'cm': 'com', 'c': 'com', 'clm': 'com', 'xom': 'com'
  };

  function levenshtein(a, b) {
    if (a === b) return 0;
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function checkEmailDomain(email) {
    var e = String(email == null ? '' : email).trim().toLowerCase();
    var at = e.lastIndexOf('@');
    if (at < 1 || at === e.length - 1) return null;          // לא כתובת שלמה — הוולידציה הרגילה תטפל
    var local = e.slice(0, at);
    var domain = e.slice(at + 1);
    if (!domain || domain.indexOf('.') === -1) return null;
    if (ALLOW.indexOf(domain) !== -1) return null;
    if (POPULAR.indexOf(domain) !== -1) return null;

    var suggestion = null;

    // 1) סיומת שגויה — עובד גם על דומיינים עסקיים (orsim15@gmail.c, info@example.con)
    var parts = domain.split('.');
    var tld = parts[parts.length - 1];
    if (Object.prototype.hasOwnProperty.call(TLD_FIX, tld) && TLD_FIX[tld]) {
      suggestion = parts.slice(0, -1).join('.') + '.' + TLD_FIX[tld];
    }

    // 2) קרוב-מדי לדומיין פופולרי (gamil.com, gmial.com, hotmial.com) — גובר על תיקון-הסיומת,
    //    כי הוא מתקן את השם המלא ולא רק את הסוף (gmail.con -> gmail.com בשני המסלולים; gamil.con
    //    -> gmail.com רק כאן).
    var best = null, bestDist = 99;
    for (var i = 0; i < POPULAR.length; i++) {
      var cand = POPULAR[i];
      var d = levenshtein(domain, cand);
      // סף לפי אורך: דומיין קצר סובל פחות מרחק לפני שזה הופך לניחוש פרוע
      var max = cand.length >= 9 ? 2 : 1;
      if (d > 0 && d <= max && d < bestDist) { best = cand; bestDist = d; }
    }
    if (best) suggestion = best;

    if (!suggestion || suggestion === domain) return null;
    return { domain: domain, suggestedDomain: suggestion, suggested: local + '@' + suggestion };
  }

  window.checkEmailDomain = checkEmailDomain;
})();
