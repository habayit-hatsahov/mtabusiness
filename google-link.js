// ══ §377 — חיבור חשבון Google, מודול משותף ═════════════════════════════════════════════
//
// נולד מ-§372, שנכתב inline ב-home.html בלבד. ההפצה לשאר הדפים שנושאים את התפריט הצדדי
// (profile / business-dashboard / terms) הייתה מייצרת שלושה עותקים של אותו היגיון —
// ובדיוק זה הדפוס ש-§353 תיקן: שתי רשימות עצמאיות לאותה הבחנה, שכבר הספיקו להיפרד.
// לכן קובץ אחד, באותו דפוס של hours.js / social-links.js / categories.js.
//
// ── מה הדף צריך לספק ────────────────────────────────────────────────────────────────────
//   1. <script src="https://accounts.google.com/gsi/client" async defer>
//   2. <script src="google-link.js">
//   3. פריט תפריט עם id="menuGoogleItem" (מוסתר), שקורא ל-window.openGoogleLinkSheet()
//   4. קריאה אחת: window.hbGoogleLink.init({ apiFetch, getIdToken, googleEmail })
//
// ⚠️ **הגיליון נבנה כאן ולא ב-HTML של כל דף.** מרקאפ משוכפל בארבעה קבצים הוא בדיוק
// המקום שבו תיקון-נוסח נכנס לשלושה מהם ונשכח ברביעי.
//
// ⚠️ **הקובץ אינו יודע לאחזר טוקנים בעצמו.** `apiFetch` ו-`getIdToken` מוזרקים ע"י הדף,
// כי לכל דף יש אובייקט auth משלו (ב-profile.html הוא מוחלף ל-app מבודד במסלול bizToken)
// וניחוש כאן היה קושר את חשבון הגוגל לרשומה הלא-נכונה.

(function () {
  'use strict';

  // ⚠️ אינו סוד — משובץ גלוי בקוד הלקוח של כל אתר שמשתמש בגוגל (ר' §370).
  var CLIENT_ID = '459607487972-esu70diuu360tg1ji15o1n1tikf3npnb.apps.googleusercontent.com';

  var cfg = null;   // { apiFetch, getIdToken }
  var built = false;

  // ── הודעות שגיאה: מה לעשות, לא קוד באנגלית ──────────────────────────────────────────
  var MSGS = {
    google_already_linked: 'חשבון ה-Google הזה כבר מקושר לאוהד אחר. אם זו טעות — כתבו לנו.',
    invalid_google_token:  'האימות מול Google לא הצליח. נסו שוב.',
    not_signed_in:         'נראה שהחיבור שלכם פג. רעננו את הדף ונסו שוב.',
    member_not_found:      'לא מצאנו את הרשומה שלכם. כתבו לנו ונטפל בזה.',
  };

  function el(id) { return document.getElementById(id); }

  // ── בניית הגיליון ──────────────────────────────────────────────────────────────────
  // מאמץ את .contact-overlay/.contact-sheet שכבר קיימים בארבעת הדפים, כדי לא לייצר
  // שפת-עיצוב שנייה לאותו תפקיד. ⚠️ אם המחלקות האלה ישתנו אי-פעם, זה המקום לעדכן.
  function buildSheet() {
    if (built || el('googleOverlay')) { built = true; return; }
    var wrap = document.createElement('div');
    wrap.className = 'contact-overlay';
    wrap.id = 'googleOverlay';
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeSheet(); });
    wrap.innerHTML =
      '<div class="contact-sheet">' +
        '<div class="sheet-handle"></div>' +
        '<button class="sheet-close" type="button" data-hb-google-close>✕</button>' +
        '<div class="contact-sheet-title">🔗 כניסה בלי קוד</div>' +
        '<div class="contact-sheet-sub">חברו את חשבון Google שלכם — פעם אחת, וזהו.</div>' +
        '<div style="font-size:13.5px;line-height:1.7;margin:14px 0 4px;color:var(--ink-2,#3A4C7A)">' +
          'מהרגע הזה תיכנסו בלחיצה אחת <b>מכל דפדפן ומכל מכשיר</b>, בלי לחפש קוד ובלי לזכור אותו.<br>' +
          'קוד הכניסה שלכם ממשיך לעבוד כרגיל — זו רק דרך נוספת.' +
        '</div>' +
        '<div id="googleBtnHost" style="display:flex;justify-content:center;margin:16px 0 6px"></div>' +
        '<div id="googleLinkMsg" style="display:none;font-size:13px;line-height:1.6;border-radius:12px;padding:10px 12px;margin-bottom:6px"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    // ⚠️ addEventListener ולא onclick במחרוזת: הכפתור נוצר ב-JS, ו-onclick היה דורש
    // חשיפה גלובלית נוספת — עוד נקודת-כשל מהסוג של §310/§312, בלי שום תמורה.
    wrap.querySelector('[data-hb-google-close]').addEventListener('click', closeSheet);
    built = true;
  }

  function msg(text, kind) {
    var m = el('googleLinkMsg');
    if (!m) return;
    m.style.display = 'block';
    m.innerHTML = text;
    m.style.background = kind === 'ok' ? '#E8F6EE' : '#FEF3C7';
    m.style.border = '1px solid ' + (kind === 'ok' ? '#BFE5CE' : '#FCD98B');
  }

  function openSheet() {
    buildSheet();
    var o = el('googleOverlay');
    if (o) o.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderButton(0);
  }
  function closeSheet() {
    var o = el('googleOverlay');
    if (o) o.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ⚠️ ספריית גוגל נטענת async. בלי ההמתנה הכפתור פשוט לא מצויר, וזה נראה למשתמש
  // כמו "הפיצ'ר לא עובד" ולא כמו תזמון. אחרי ~6 שניות אומרים את זה במפורש.
  function renderButton(tries) {
    tries = tries || 0;
    var host = el('googleBtnHost');
    if (!host || host.childElementCount) return;
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID, callback: onCredential, auto_select: false,
      });
      window.google.accounts.id.renderButton(host, {
        theme: 'filled_blue', size: 'large', shape: 'pill',
        text: 'continue_with', locale: 'he', width: 260,
      });
      return;
    }
    if (tries > 40) {
      msg('⚠️ לא הצלחנו לטעון את הכניסה של Google. בדקו את החיבור ונסו שוב.', 'warn');
      return;
    }
    setTimeout(function () { renderButton(tries + 1); }, 150);
  }

  async function onCredential(res) {
    msg('מחבר…', 'ok');
    try {
      if (!cfg) { msg('⚠️ משהו השתבש. רעננו את הדף ונסו שוב.', 'warn'); return; }
      // ⚠️ הטוקן שלנו נלקח **עכשיו** ולא נשמר מראש: הוא קצר-מועד, ועמוד שפתוח שעה היה
      // שולח טוקן שפג ומקבל "לא מחובר" בלי שום סיבה נראית למשתמש.
      var memberIdToken = await cfg.getIdToken();
      if (!memberIdToken) { msg('נראה שהחיבור שלכם פג. רעננו את הדף ונסו שוב.', 'warn'); return; }

      var resp = await cfg.apiFetch('/google-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: res.credential, memberIdToken: memberIdToken }),
      });
      var out = await resp.json();

      if (out.ok) {
        msg('✅ מעולה — החשבון חובר. בפעם הבאה פשוט לחצו "המשך עם Google".', 'ok');
        var item = el('menuGoogleItem');
        if (item) item.style.display = 'none';
        var host = el('googleBtnHost');
        if (host) host.innerHTML = '';
        return;
      }
      msg('⚠️ ' + (MSGS[out.error] || 'משהו השתבש. נסו שוב בעוד רגע.'), 'warn');
    } catch (e) {
      console.error('google link failed:', e);
      msg('⚠️ החיבור לא הושלם. בדקו את החיבור לאינטרנט ונסו שוב.', 'warn');
    }
  }

  // ── ההפעלה מהדף ────────────────────────────────────────────────────────────────────
  // מוצג **רק למי שחסר** (בקשת המשתמש). מי שכבר חיבר לא רואה את הפריט בכלל.
  function init(opts) {
    opts = opts || {};
    if (typeof opts.apiFetch !== 'function' || typeof opts.getIdToken !== 'function') {
      // ⚠️ שקט ולא זריקה: דף שלא סיפק את התלויות פשוט לא מציג את הפריט, במקום להפיל
      // את המודול שמתחתיו. אבל כן נאמר בקונסול — כישלון שקט לגמרי הוא מה שהסתיר את §357.
      console.warn('google-link: init נקרא בלי apiFetch/getIdToken — הפריט לא יוצג');
      return;
    }
    cfg = opts;
    if (opts.googleEmail) return;          // כבר מחובר — אין מה להציע
    var item = el('menuGoogleItem');
    if (item) item.style.display = 'flex';
  }

  // ⚠️ החשיפה מיידית ובראש הקובץ-הנטען, לא בתוך callback: פריט התפריט קורא ל-onclick,
  // ו-window.openGoogleLinkSheet חייב להתקיים לפני שהוא נראה. ר' §310/§312.
  window.openGoogleLinkSheet  = openSheet;
  window.closeGoogleLinkSheet = closeSheet;
  window.hbGoogleLink = { init: init, open: openSheet, close: closeSheet };
})();
