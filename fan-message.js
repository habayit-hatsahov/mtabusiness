// ══ §472 → §501 — "כתבו לנו" בגיליון "צור קשר" ═══════════════════════════════════════════
// §472: הודעה ישירה לצוות מתוך "צור קשר", שנכתבה ל-helpRequests (source:'fanMessage').
// §501 (12.10, רמי: "תיבה אחת"): ההודעות עברו לשיחות של "האזור שלי" (conversations.js).
// האפשרות כאן היא עכשיו **קיצור דרך בלבד** — פותחת שיחה חדשה בלשונית "הודעות" בפרופיל,
// כדי שיהיה מקום אחד לכל השיחות ולא שתי תיבות. התשובה מגיעה לשם, במייל ובפוש.
//
// ⚠️ הודעות §472 ישנות נשארות ב-helpRequests ומוצגות במרכז הניהול כמו קודם ("כתבו לנו –
// אוהדים"). חדשות כבר לא נכתבות לשם.
//
// מודול משותף ולא מרקאפ בכל דף: גיליון "צור קשר" חי ב-home/profile/terms (ר' §377).
(function () {
  'use strict';

  function loggedIn() {
    try { return !!localStorage.getItem('hb_memberId'); } catch (e) { return false; }
  }

  function go() {
    // בפרופיל עצמו — בלי טעינה מחדש: סוגרים את הגיליון ופותחים שיחה חדשה במקום.
    if (typeof window.yzOpenNewConversation === 'function') {
      // §515 — לא closeContactSheet(): היא **פותחת מחדש את התפריט הצדדי** (חזרה לתפריט שממנו
      // הגיעו), והתפריט כיסה את השיחה החדשה — "לא פותח שיחה חדשה". סוגרים כאן את שניהם.
      try {
        var ov = document.getElementById('contactOverlay');
        if (ov) ov.classList.remove('open');
        if (typeof window.closeMenu === 'function') window.closeMenu();
        document.body.style.overflow = '';
      } catch (e) {}
      window.yzOpenNewConversation();
      return;
    }
    location.href = 'profile.html?new=1';
  }

  function build(list) {
    if (list.querySelector('.fanmsg-option')) return;
    var opt = document.createElement('div');
    opt.className = 'contact-option fanmsg-option';
    opt.setAttribute('role', 'button');
    opt.innerHTML =
      '<span class="contact-option-icon">💬</span>' +
      '<div class="contact-option-body">' +
        '<div class="contact-option-title">כתבו לנו</div>' +
        '<div class="contact-option-sub">הודעה ישירה לצוות – נחזור אליכם באפליקציה ובמייל</div>' +
      '</div>';
    // ראשונה ברשימה — זו הדרך היחידה כאן שלא מוציאה את האוהד מהאפליקציה.
    list.insertBefore(opt, list.firstChild);
    opt.addEventListener('click', go);
  }

  function init() {
    if (!loggedIn()) return; // אורח לא רואה את האפשרות — שיחה דורשת סשן של חבר
    // §501 — גם ברשימה של בעלי העסקים: תיבה אחת לכולם (§473טז).
    ['contactOptionsFan', 'contactOptionsBiz'].forEach(function (id) {
      var list = document.getElementById(id);
      if (list) build(list);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
