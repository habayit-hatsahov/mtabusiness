// ══ §472 — "כתבו לנו" לאוהדים, מתוך גיליון "צור קשר" ══════════════════════════════════════
// בקשת רמי: לצד המייל והאינסטגרם — אפשרות לכתוב לנו הודעה ישירות, שמגיעה למרכז הניהול
// ("תקלות ופניות" ← "כתבו לנו — אוהדים"). ה"כתבו לנו" של העסקים נשאר ב"בקשות מבעלי עסקים".
//
// מודול משותף ולא מרקאפ בכל דף: גיליון "צור קשר" חי ב-home/profile/terms, ושלושה עותקים
// הם בדיוק המקום שבו תיקון נכנס לשניים ונשכח בשלישי (ר' §377). הסקריפט מזריק את האפשרות
// לתוך #contactOptionsFan הקיים — דף בלי הגיליון פשוט לא מקבל כלום.
//
// נכתב ל-helpRequests (האוסף של §303) עם source:'fanMessage', כך שכל מנגנון ה"טיפלתי"
// במרכז הניהול כבר קיים. ⚠️ firestore.rules דורש memberId == ה-uid המחובר עבור הסוג הזה —
// ולכן ההודעה נשלחת רק עם סשן חי, וזהות השולח אמיתית ולא מה שהלקוח טוען.
(function () {
  'use strict';
  // ⚠️ חייב להיות **אותה גרסה בדיוק** כמו ב-firebase-config.js — גרסה אחרת היא SDK נפרד,
  // ו-addDoc שלו לא מכיר את ה-db שמגיע משם ("Expected first argument to collection()...").
  var FS_URL = 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
  var MAX = 1000;
  var SEND_TIMEOUT_MS = 20000;

  function loggedIn() {
    try { return !!localStorage.getItem('hb_memberId'); } catch (e) { return false; }
  }

  function injectStyle() {
    if (document.getElementById('fanmsgStyle')) return;
    var s = document.createElement('style');
    s.id = 'fanmsgStyle';
    s.textContent =
      '.fanmsg-panel{display:none;flex-direction:column;gap:8px;margin-top:-2px}' +
      '.fanmsg-panel.open{display:flex}' +
      // 16px — פחות מזה ספארי באייפון מגדיל את הדף כשנכנסים לשדה.
      '.fanmsg-text{width:100%;box-sizing:border-box;min-height:110px;resize:vertical;font:inherit;font-size:16px;' +
        'padding:10px 12px;border-radius:12px;border:1px solid var(--border-md,#d6d9e0);' +
        'background:var(--card-bg,#fff);color:var(--text,#0B1F4D);line-height:1.5}' +
      '.fanmsg-row{display:flex;align-items:center;gap:10px}' +
      '.fanmsg-count{font-size:11px;color:var(--text-sm,#6b7280);margin-inline-start:auto}' +
      '.fanmsg-send{border:none;border-radius:12px;padding:10px 18px;font:inherit;font-size:14px;font-weight:800;' +
        'background:#FFDE00;color:#0B1F4D;cursor:pointer}' +
      '.fanmsg-send:disabled{opacity:.6;cursor:default}' +
      '.fanmsg-err{display:none;font-size:12px;color:#d93025}' +
      '.fanmsg-err.show{display:block}' +
      '.fanmsg-done{display:none;font-size:13px;font-weight:700;padding:12px 14px;border-radius:12px;' +
        'background:rgba(30,160,90,.1);color:var(--text,#0B1F4D)}' +
      '.fanmsg-done.show{display:block}';
    document.head.appendChild(s);
  }

  function build(list) {
    if (document.getElementById('fanmsgOption')) return;
    injectStyle();
    var opt = document.createElement('div');
    opt.className = 'contact-option';
    opt.id = 'fanmsgOption';
    opt.innerHTML =
      '<span class="contact-option-icon">💬</span>' +
      '<div class="contact-option-body">' +
        '<div class="contact-option-title">כתבו לנו</div>' +
        '<div class="contact-option-sub">הודעה ישירה לצוות — נחזור אליכם</div>' +
      '</div>';
    var panel = document.createElement('div');
    panel.className = 'fanmsg-panel';
    panel.id = 'fanmsgPanel';
    panel.innerHTML =
      '<textarea class="fanmsg-text" id="fanmsgText" maxlength="' + MAX + '" ' +
        'placeholder="מה תרצו לספר לנו? שאלה, הצעה, עסק שחסר לכם..."></textarea>' +
      '<div class="fanmsg-err" id="fanmsgErr"></div>' +
      '<div class="fanmsg-row">' +
        '<button type="button" class="fanmsg-send" id="fanmsgSend">שליחה</button>' +
        '<span class="fanmsg-count" id="fanmsgCount">0/' + MAX + '</span>' +
      '</div>' +
      '<div class="fanmsg-done" id="fanmsgDone">✓ ההודעה נשלחה. תודה! נחזור אליכם למייל או לטלפון שרשומים אצלנו.</div>';
    // ראשונה ברשימה — זו הדרך היחידה כאן שלא מוציאה את האוהד מהאפליקציה.
    list.insertBefore(panel, list.firstChild);
    list.insertBefore(opt, panel);

    opt.addEventListener('click', function () {
      var open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      if (open) { reset(false); document.getElementById('fanmsgText').focus(); }
    });
    var ta = document.getElementById('fanmsgText');
    ta.addEventListener('input', function () {
      document.getElementById('fanmsgCount').textContent = ta.value.length + '/' + MAX;
      document.getElementById('fanmsgErr').classList.remove('show');
    });
    document.getElementById('fanmsgSend').addEventListener('click', send);

    // פתיחה מחדש של הגיליון מתחילה נקי (אחרי שליחה, "נשלחה" לא נשאר תקוע שם לנצח).
    var overlay = document.getElementById('contactOverlay');
    // ⚠️ רק במעבר סגור→פתוח, ולפי מצב שנשמר — ה-MutationObserver נקרא באיחור (microtask),
    // ובדיקה של "פתוח עכשיו" הייתה סוגרת גם פאנל שנפתח אחרי הפתיחה, וכל שינוי class אחר
    // על הגיליון היה מוחק טקסט באמצע הקלדה. (נתפס בבדיקה בדפדפן.)
    if (overlay && window.MutationObserver) {
      var wasOpen = overlay.classList.contains('open');
      new MutationObserver(function () {
        var isOpen = overlay.classList.contains('open');
        if (isOpen && !wasOpen) { panel.classList.remove('open'); reset(false); }
        wasOpen = isOpen;
      }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // keepText=true — אחרי כשל משאירים את מה שהאוהד כתב. הודעה שנמחקה כי הרשת נפלה
  // היא הודעה שלא תיכתב שוב.
  function reset(keepText) {
    var ta = document.getElementById('fanmsgText');
    if (!keepText) ta.value = '';
    ta.style.display = '';
    document.getElementById('fanmsgCount').textContent = ta.value.length + '/' + MAX;
    document.getElementById('fanmsgErr').classList.remove('show');
    document.getElementById('fanmsgDone').classList.remove('show');
    var btn = document.getElementById('fanmsgSend');
    btn.disabled = false; btn.textContent = 'שליחה'; btn.parentNode.style.display = '';
  }

  function showErr(text) {
    var el = document.getElementById('fanmsgErr');
    el.textContent = text;
    el.classList.add('show');
  }

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error('fanmsg-timeout')); }, ms);
    })]);
  }

  function profileFor(uid) {
    try {
      var c = JSON.parse(localStorage.getItem('hb_profile_cache') || 'null');
      return c && c.uid === uid ? c : null;
    } catch (e) { return null; }
  }

  async function send() {
    var ta = document.getElementById('fanmsgText');
    var text = ta.value.trim();
    if (!text) { showErr('כתבו לנו משהו קודם 🙂'); ta.focus(); return; }
    var btn = document.getElementById('fanmsgSend');
    btn.disabled = true; btn.textContent = 'שולח…';
    try {
      var mods = await withTimeout(Promise.all([import('./firebase-config.js'), import(FS_URL)]), SEND_TIMEOUT_MS);
      var cfg = mods[0], fs = mods[1];
      // ב-terms.html ה-auth נטען עצלנית — מחכים שהסשן השמור ישוחזר לפני שקובעים "לא מחובר".
      if (cfg.auth.authStateReady) await withTimeout(cfg.auth.authStateReady(), 8000);
      var uid = cfg.auth.currentUser && cfg.auth.currentUser.uid;
      if (!uid) throw new Error('fanmsg-no-auth');
      var p = profileFor(uid) || {};
      var name = ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
      await withTimeout(fs.addDoc(fs.collection(cfg.db, 'helpRequests'), {
        name: name.slice(0, 80) || null,
        // contact חובה ב-rules. הפרטים המלאים נשלפים ממילא ברשומת החבר (memberId) במרכז
        // הניהול — זה רק מה שידוע כאן בלי קריאה נוספת.
        contact: (p.email || p.phone || 'חבר רשום').slice(0, 120),
        message: text.slice(0, MAX),
        source: 'fanMessage',
        device: window.innerWidth <= 700 ? 'mobile' : 'desktop',
        path: location.pathname.slice(0, 200),
        memberId: uid,
        status: 'new',
        createdAt: fs.serverTimestamp(),
      }), SEND_TIMEOUT_MS);
      ta.value = '';
      ta.style.display = 'none';
      btn.parentNode.style.display = 'none';
      document.getElementById('fanmsgDone').classList.add('show');
    } catch (e) {
      console.error('fan message failed:', e && (e.code || e.message));
      btn.disabled = false; btn.textContent = 'שליחה';
      showErr(e && e.message === 'fanmsg-no-auth'
        ? 'צריך להיות מחוברים כדי לשלוח הודעה. אפשר לכתוב לנו גם במייל yellowzonemta@gmail.com'
        : 'ההודעה לא נשלחה — נסו שוב, או כתבו לנו במייל yellowzonemta@gmail.com');
    }
  }

  function init() {
    if (!loggedIn()) return; // אורח לא רואה את האפשרות — הכתיבה דורשת סשן של חבר
    var list = document.getElementById('contactOptionsFan');
    if (list) build(list);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
