// ── phone-check.js — נרמול וּוולידציה של מספרי טלפון ישראליים ────────────────────────
// script קלאסי (לא module), נטען מוקדם, זהה בתפקידו ל-email-domain-check.js:
// חושף window.normalizeILPhone / window.isValidILPhone / window.waLink.
//
// למה זה קיים (2026-08-17): ה-regex שהיה בשימוש ב-business.html + fan-register.html
//     /^0[0-9]{1,2}[-.\s]?[0-9]{7,8}$/
// קיבל גם 11 ספרות (0 + "52" + "78786931"), ושדה ה-WhatSapp בטופס ההרשמה לא עבר
// ולידציה בכלל. כך נכנסו לבסיס-הנתונים מספרים שבורים: "יש הדברה" נשמר עם
// whatsapp="05278786931" (ספרת 8 מיותרת), "צ'ומפי" עם phone="05266000491".
// home.html בנה מהם https://wa.me/9725278786931 וּוואטסאפ ענה "המספר לא קיים".
// ר' docs/PROJECT_CONTEXT.md §204.

(function () {
  'use strict';

  // מספר ישראלי מקומי תקין, לפי הקידומת — כדי לתפוס גם ספרה עודפת וגם ספרה חסרה:
  //   05X / 07X  → בדיוק 10 ספרות (נייד, ו-VoIP מסוג 072/073/074/076/077)
  //   02/03/04/08/09 → בדיוק 9 ספרות (קווי)
  // הקידומות 1-700/1-800/*כוכבית נדחות — גם ה-regex הקודם דרש אפס מוביל, אז אין רגרסיה.
  var IL_LOCAL_RX = /^0(?:[57]\d{8}|[23489]\d{7})$/;

  // '+972 52-660-0491' / '972526600491' / '526600491' → '0526600491'
  function normalizeILPhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (!d) return '';
    // קידומת בינלאומית. התנאי length>9 מונע לגזור '972' ממספר מקומי שמתחיל בספרות האלה
    // (לא קיים בישראל — כל המספרים מתחילים ב-0 — אבל שומר על התנהגות זהה ל-normalizePhone
    // שכבר קיים ב-business.html/fan-register.html, שהוא חוזה-הפורמט של השמירה ל-Firestore).
    if (d.indexOf('972') === 0 && d.length > 9) d = '0' + d.slice(3);
    else if (d.charAt(0) !== '0' && d.length === 9) d = '0' + d;  // הוקלד בלי האפס המוביל
    return d;
  }

  function isValidILPhone(v) {
    return IL_LOCAL_RX.test(normalizeILPhone(v));
  }

  // קישור wa.me מלא, או null אם המספר לא תקין. השימוש המחייב: מי שקורא לפונקציה הזאת
  // חייב להסתיר את כפתור/שורת ה-WhatsApp כשמוחזר null — כפתור מת ("המספר לא קיים")
  // גרוע יותר מכפתור חסר. אין כאן fallback לטלפון הרגיל של העסק בכוונה: קווי 03/09
  // כמעט מעולם לא רשום בוואטסאפ, וזה בדיוק מה שיצר כפתורים מתים ל"יעדים לוגיסטיים"
  // ול"מאמא שושה", שכלל לא מסרו מספר WhatsApp.
  function waLink(v, text) {
    var d = normalizeILPhone(v);
    if (!IL_LOCAL_RX.test(d)) return null;
    return 'https://wa.me/972' + d.slice(1) + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  window.normalizeILPhone = normalizeILPhone;
  window.isValidILPhone   = isValidILPhone;
  window.waLink           = waLink;
})();
