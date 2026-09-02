// ══ §386 — גוגל בטופס ההרשמה, מודול משותף ══════════════════════════════════════════════
//
// ממשיך את §369 (הדמו שאושר) ואת §370 (צד השרת). המודול עושה שני דברים ותו לא:
//   1. מצייר את כפתור גוגל בראש הטופס וממלא ממנו שם פרטי / שם משפחה / מייל.
//   2. אחרי שהרשומה כבר נכתבה — קורא ל-/google-attach וקושר את חשבון הגוגל אליה.
//
// 🔑 **גוגל היא הוכחת-זהות בלבד, ולא מסלול הרשמה נפרד.** הטופס, הוולידציה, האישור הידני
// ואימות-האוהדות נשארים בדיוק כמו שהם. מי שאין לו גוגל ממלא הכל ידנית כמו היום.
//
// ⚠️ **אין התאמה אוטומטית לפי מייל** (החלטת §368, אושרה שוב 2026-09-02): בפרויקט הזה
// בני-משפחה נרשמים אחד בשם השני, ולכן "מצאנו רשומה עם אותו מייל" אינו מספיק כדי להכניס
// אדם פנימה. הנתיב היחיד שנפתח כאן הוא קישור לרשומה ש**הנרשם עצמו יצר עכשיו**.
//
// ── מה הדף צריך לספק ────────────────────────────────────────────────────────────────────
//   1. תגית script לספרייה: https://accounts.google.com/gsi/client (async defer)
//   2. תגית script לקובץ הזה
//   3. div ריק עם מזהה, במקום שבו הכפתור אמור לשבת
//   4. window.hbGoogleSignup.init({ hostId, fields: { first, last, email }, warnId, onFilled })
//   5. בשליחה, אחרי שהרשומה נוצרה: await window.hbGoogleSignup.attach(apiFetch, memberId)
//
// ⚠️ **המרקאפ נבנה כאן ולא ב-HTML של כל טופס** — אותו נימוק של §377: מרקאפ משוכפל בשני
// קבצים הוא המקום שבו תיקון-נוסח נכנס לאחד ונשכח בשני.

(function () {
  'use strict';

  // ⚠️ אינו סוד — משובץ גלוי בקוד הלקוח של כל אתר שמשתמש בגוגל (ר' §370).
  var CLIENT_ID = '459607487972-esu70diuu360tg1ji15o1n1tikf3npnb.apps.googleusercontent.com';

  // ⏱️ גבול-זמן ל-/google-attach. הקריאה הזאת רצה **בתוך** זמן-ההמתנה של הנרשם, כי מסך
  // הצלחה עם עבודה שרצה מאחוריו אינו מסך הצלחה (§292). 8 שניות — אותו סף בדיוק כמו
  // בדיקת-הכפילות, ומאותו נימוק: הקישור הוא תוספת, וההרשמה עצמה כבר הצליחה בלעדיו.
  // ⚠️ התקציב משותף לשלוש הכתובות של hbApiFetch, כי AbortError אינו מקדם לכתובת הבאה.
  var ATTACH_TIMEOUT_MS = 8000;

  var cfg = null;
  var token = null;        // הטוקן הגולמי שגוגל החזירה
  var built = false;

  function el(id) { return id ? document.getElementById(id) : null; }

  // ── פענוח לתצוגה בלבד ────────────────────────────────────────────────────────────────
  // ⚠️ **אסור להסתמך על זה לשום דבר שהוא הרשאה או זהות.** כל אחד יכול לשלוח JWT מומצא.
  // מה שנחשב הוא אך ורק האימות בצד השרת (worker/src/google.js): חתימה, תפוגה, ו-aud.
  // כאן זה משמש רק כדי למלא שדות על המסך — והשרת בודק הכל שוב מאפס.
  function decodeForDisplay(jwt) {
    try {
      var b = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(atob(b).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')));
    } catch (e) { return null; }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function injectStyle() {
    if (el('hbGsStyle')) return;
    var s = document.createElement('style');
    s.id = 'hbGsStyle';
    s.textContent =
      '.hb-gs-btn{display:flex;justify-content:center;margin:2px 0 8px}' +
      '.hb-gs-cap{font-size:12.5px;line-height:1.6;color:var(--text-muted,#6B7A9B);text-align:center;margin:0 0 4px}' +
      '.hb-gs-cap b{color:var(--text,#0A2A66)}' +
      '.hb-gs-undo{background:none;border:0;padding:0;margin-top:4px;font:inherit;font-size:12px;' +
        'color:var(--text-muted,#6B7A9B);text-decoration:underline;cursor:pointer}' +
      '.hb-gs-or{display:flex;align-items:center;gap:10px;margin:14px 0 2px;' +
        'color:var(--text-muted,#6B7A9B);font-size:12.5px}' +
      '.hb-gs-or::before,.hb-gs-or::after{content:"";flex:1;height:1px;background:var(--card-border,#ECEAE2)}' +
      // המייל ננעל אחרי מילוי מגוגל (ר' lockEmail) — הרקע הירוק אומר "מאומת", לא "מושבת".
      '.hb-gs-verified{background:#E8F6EE !important;border-color:#BFE5CE !important}';
    document.head.appendChild(s);
  }

  function buildBlock(host) {
    if (built) return;
    host.innerHTML =
      '<div class="hb-gs-btn" id="hbGsBtnHost"></div>' +
      '<div class="hb-gs-cap" id="hbGsCap"></div>' +
      '<div class="hb-gs-or"><span>או למלא ידנית</span></div>';
    built = true;
  }

  function setCap(html) {
    var c = el('hbGsCap');
    if (c) c.innerHTML = html;
  }

  function defaultCap() {
    return 'לחיצה אחת — השם והמייל יתמלאו לבד, והמייל יאומת.<br>' +
           '<b>ואחרי האישור — כניסה בלי קוד.</b>';
  }

  // ⚠️ **לא דורסים ערך שכבר הוקלד** (למעט המייל, ר' מטה). מי שהתחיל למלא ואז לחץ על גוגל
  // לא אמור לראות את מה שכתב נמחק מתחת לידיים שלו.
  function setField(id, value, force) {
    var f = el(id);
    if (!f || !value) return;
    if (!force && String(f.value).trim()) return;
    f.value = value;
    f.classList.remove('error');
    var err = el('err-' + id);
    if (err) err.style.display = 'none';
    // הטפסים שומרים טיוטה, מחממים בדיקת-כפילות ומנקים שגיאות על אירועי input —
    // השמה ישירה ל-value אינה מפעילה אותם מעצמה, ובלי זה המילוי "לא נספר".
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 🔑 **המייל הוא המפתח של כל הזרימה, ולכן הוא נדרס ואז ננעל.** ההגדר של /google-attach
  // הוא שהמייל על הרשומה זהה למייל שגוגל אימתה (§370) — כלומר עריכה ידנית שלו אחרי
  // הלחיצה הייתה שוברת את הקישור בשקט, והנרשם היה מגלה את זה רק ביום שינסה להיכנס.
  // מי שרוצה מייל אחר מבטל את החיבור לגוגל, וזה מה שהכפתור "זה לא החשבון שלי" עושה.
  function lockEmail(on) {
    var e = el(cfg && cfg.fields && cfg.fields.email);
    if (!e) return;
    e.readOnly = !!on;                       // readOnly ולא disabled — ערך מושבת אינו נקרא בשליחה
    e.classList.toggle('hb-gs-verified', !!on);
  }

  function clearEmailWarn() {
    var w = el(cfg && cfg.warnId);
    if (w) w.classList.remove('show');
  }

  // ביטול — השדות **נשארים מלאים** (הם נכונים), רק הקישור לגוגל יורד והמייל נפתח לעריכה.
  function clearToken() {
    token = null;
    lockEmail(false);
    clearEmailWarn();
    setCap(defaultCap());
    var e = el(cfg && cfg.fields && cfg.fields.email);
    if (e) e.focus();
  }

  function onCredential(res) {
    var raw = res && res.credential;
    var p = raw ? decodeForDisplay(raw) : null;
    if (!p || !p.email) {
      setCap('⚠️ משהו השתבש מול Google. אפשר פשוט למלא את הטופס ידנית.');
      return;
    }
    token = raw;
    var full = String(p.name || '').trim().split(/\s+/);
    setField(cfg.fields.first, p.given_name || full[0] || '');
    setField(cfg.fields.last, p.family_name || full.slice(1).join(' ') || '');
    setField(cfg.fields.email, String(p.email).trim(), true);
    lockEmail(true);
    clearEmailWarn();
    setCap('✅ <b>' + escapeHtml(p.email) + '</b> — המייל אומת ע"י Google.<br>' +
           'אחרי שנאשר אתכם תיכנסו בלחיצה אחת, בלי קוד.' +
           '<button type="button" class="hb-gs-undo" id="hbGsUndo">זה לא החשבון שלי</button>');
    var undo = el('hbGsUndo');
    if (undo) undo.addEventListener('click', clearToken);
    if (typeof cfg.onFilled === 'function') {
      try { cfg.onFilled(p); } catch (e) { console.error('google-signup: onFilled נכשל', e); }
    }
  }

  // ⚠️ הספרייה של גוגל נטענת async, ולכן ההמתנה. אם היא לא הגיעה — **הבלוק כולו נשאר
  // מוסתר**: קו-מפריד עם "או למלא ידנית" בלי כפתור מעליו נראה כמו טופס שבור, וגרוע
  // מלא-להציע-גוגל-בכלל. אבל כן נרשמת אזהרה בקונסול — כישלון שקט לגמרי הוא בדיוק מה
  // שהסתיר את §357.
  function render(tries) {
    tries = tries || 0;
    if (!cfg) return;
    var host = el(cfg.hostId);
    var btnHost = el('hbGsBtnHost');
    if (!host || !btnHost) return;
    if (btnHost.childElementCount) { host.style.display = ''; return; }   // כבר צויר
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID, callback: onCredential, auto_select: false,
      });
      // הרוחב נגזר מהמכל בפועל: בתוך המודאל של welcome.html הטופס יושב ב-iframe של 343px,
      // וכפתור ברוחב קבוע היה חורג ממנו. 0 = המכל עדיין מוסתר (שלב 5 בטופס העסק) → 300.
      var w = Math.max(200, Math.min(400, host.clientWidth || 300));
      window.google.accounts.id.renderButton(btnHost, {
        theme: 'filled_blue', size: 'large', shape: 'rectangular',
        text: 'signup_with', locale: 'he', width: w,
      });
      setCap(defaultCap());
      host.style.display = '';
      // ⚠️ renderButton אינו מדווח על כשל. כשה-origin אינו מאושר אצל גוגל (למשל localhost)
      // הוא פשוט אינו מצייר כלום, ואז נשאר על המסך קו-מפריד לבדו. לכן בדיקה בדיעבד.
      // childElementCount ולא גובה — המכל עשוי להיות מוסתר לגמרי (שלב שעוד לא נפתח).
      setTimeout(function () {
        if (!btnHost.childElementCount) {
          host.style.display = 'none';
          console.warn('google-signup: כפתור Google לא צויר (origin לא מאושר?) — הבלוק הוסתר');
        }
      }, 1500);
      return;
    }
    if (tries > 40) {          // ~6 שניות
      console.warn('google-signup: ספריית Google לא נטענה — הבלוק לא יוצג');
      return;
    }
    setTimeout(function () { render(tries + 1); }, 150);
  }

  // ── הקישור עצמו, אחרי שהרשומה כבר קיימת ──────────────────────────────────────────────
  // 🔑 **כשל כאן לעולם אינו כשל-הרשמה.** הרשומה כבר נכתבה; מה שנופל הוא רק הקיצור-דרך
  // לכניסה, ומי שלא נקשר יקבל קוד כרגיל וגם יוכל לחבר גוגל מהתפריט אחר-כך (§377).
  // לכן הפונקציה לא זורקת אף פעם, והקורא אינו צריך try סביבה.
  //
  // ⚠️ **התשובה אינה מוצגת לנרשם.** הוא נמצא באמצע מסך-הצלחה של הרשמה, והודעה על
  // "חשבון Google לא חובר" שם היא רעש שהוא לא יכול לעשות איתו כלום.
  async function attach(apiFetch, memberId) {
    if (!token) return { skipped: 'no_token' };
    if (!memberId) return { skipped: 'no_member' };
    if (typeof apiFetch !== 'function') {
      console.warn('google-signup: attach נקרא בלי apiFetch — הקישור לא נעשה');
      return { skipped: 'no_fetch' };
    }
    try {
      var resp = await apiFetch('/google-attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token, memberId: memberId }),
        signal: AbortSignal.timeout(ATTACH_TIMEOUT_MS),
      });
      var out = await resp.json();
      if (out && out.ok) return out;
      // ⚠️ google_already_linked כאן = אותו חשבון גוגל כבר יושב על רשומה אחרת, כלומר
      // אותו אדם נרשם כבר פעם קודמת. זו אינה תקלה טכנית אלא כפילות — והיא כבר מסומנת
      // בנפרד ע"י בדיקת-הכפילות של הטופס (אותו מייל), שרצה לפני הכתיבה.
      console.error('google-signup: /google-attach לא השלים —', (out && out.error) || 'unknown');
      return out || { error: 'unknown' };
    } catch (e) {
      console.error('google-signup: /google-attach נכשל (רשת/פסק-זמן)', e);
      return { error: 'network' };
    }
  }

  function init(opts) {
    opts = opts || {};
    var f = opts.fields || {};
    if (!opts.hostId || !f.first || !f.last || !f.email) {
      console.warn('google-signup: init נקרא בלי hostId/fields — הבלוק לא יוצג');
      return;
    }
    var host = el(opts.hostId);
    if (!host) {
      console.warn('google-signup: לא נמצא מכל בשם ' + opts.hostId);
      return;
    }
    cfg = opts;
    injectStyle();
    host.style.display = 'none';     // מוצג רק כשהכפתור באמת צויר
    buildBlock(host);
    if (opts.autoRender !== false) render(0);
  }

  // ⚠️ החשיפה מיידית ובראש הקובץ-הנטען ולא בתוך callback — ר' §310/§312.
  window.hbGoogleSignup = {
    init: init,
    render: function () { render(0); },
    attach: attach,
    token: function () { return token; },
    clear: clearToken,
  };
})();
