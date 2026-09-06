// ══ §424 — Apple בטופס ההרשמה, מודול משותף ═════════════════════════════════════════════
//
// מקביל מדויק ל-`google-signup.js` (§386), עם אותו ממשק בדיוק, כדי ששני הטפסים יוכלו
// להחזיק את השניים זה לצד זה בלי שני דפוסים שונים. שני דברים ותו לא:
//   1. מצייר את כפתור Apple וממלא ממנו שם פרטי / שם משפחה / מייל.
//   2. אחרי שהרשומה כבר נכתבה — קורא ל-/apple-attach וקושר את חשבון האפל אליה.
//
// 🔑 **זו דרישת אישור של אפל ולא פיצ'ר.** אפל מחייבת "התחברות עם Apple" בכל אפליקציה
// שמציעה התחברות של צד שלישי — ואצלנו יש Google.
//
// ── מה הדף צריך לספק ────────────────────────────────────────────────────────────────────
//   1. תגית script לספרייה של אפל (async defer)
//   2. תגית script לקובץ הזה — **סקריפט קלאסי, לא מודול** (ר' האזהרה מיד אחרי)
//   3. div ריק עם מזהה, במקום שבו הכפתור אמור לשבת
//   4. window.hbAppleSignup.init({ hostId, fields: { first, last, email }, warnId, onFilled })
//   5. בשליחה, אחרי שהרשומה נוצרה: await window.hbAppleSignup.attach(apiFetch, memberId)
//
// ══ 🔴 הקובץ הזה אינו מיועד למודאל ההתחברות של welcome.html ═══════════════════════════
//
// **זהו מודול הרשמה**: הוא ממלא שדות בטופס וקורא ל-`/apple-attach` על רשומה שזה עתה
// נוצרה. מסך ההתחברות עושה משהו אחר לגמרי — `/apple-login` ואז `signInWithCustomToken`,
// בלי שום שדה למלא. **שימוש בקובץ הזה שם ייתן כפתור שנראה נכון ואינו מכניס איש.**
//
// 🔗 **וכשייבנה שם כפתור אפל — הוא חייב לרכוב על הדפוס של §425, לא להמציא אותו מחדש:**
//   • הרנדרר יושב ב**סקריפט הקלאסי** בראש `welcome.html`, לצד `hbRenderGoogleLoginBtn`.
//     §425 מדד שרנדרר שיושב ב-`<script type="module">` אינו קיים בשניות הראשונות —
//     מאחורי הורדות gstatic ומאחורי `await` של שער-ה-auth — ו-`openLoginModal` דילגה
//     עליו **בשקט, בלי לנסות שוב אף פעם**. במובייל החלון הזה הוא שנייה עד ארבע, ולכן
//     זה נראה כמו "תמיד בפעם הראשונה" ולא כמו מרוץ.
//   • ה-callback שמסיים את הכניסה **כן** שייך למודול (הוא נוגע ב-firebase), ולכן הוא
//     נקשר באיחור — `window.heroAppleLogin`, במקביל מדויק ל-`window.heroGoogleLogin` —
//     **עם תור** ללחיצה מוקדמת ופסק-זמן, כמו `hbGoogleLoginCallback`. בלי התור הכפתור
//     נצבע ולא עושה כלום, כלומר אותו כשל שכבה אחת פנימה.
//
// ⚠️ **והסיכון שכן נוגע לקובץ הזה:** הוא עצמו סקריפט קלאסי ונחשף ל-`window` מיד, אבל
// `init()` נקרא מהדף. קריאה ל-`init` מתוך `<script type="module">` שחוסם על await
// מחזירה את אותה השהיה — נסבל בדף מלא כמו `fan-register.html`, **קטלני במודאל**.
//
// ══ 🔴 §426 — בתוך האפליקציה הזרימה הזאת אינה מספיקה ═══════════════════════════════════
//
// `AppleID.auth.signIn()` הוא זרימת-web, ו**מ-iOS 17.1 היא נשברה בתוך WKWebView**:
// במקום גיליון-האימות הנייטיב של אפל (Face ID) מוצג טופס HTML רגיל של שם-משתמש וסיסמה.
// כלומר בתוך האפליקציה — בדיוק המקום שבגללו אפל דורשת את הפיצ'ר — החוויה היא הגרועה
// ביותר, וזו גם חשיפה לדחייה: אפל מצפה לגיליון הנייטיב.
//
// **הפתרון הוא מסלול שני, לא תיקון של המסלול הזה** — תוסף Capacitor נייטיב
// (`@capawesome/capacitor-apple-sign-in` או `@changenode/capacitor-sign-in-with-apple`),
// שמשתמש ב-AuthenticationServices ומחזיר `identityToken`. ⚠️ **הטוקן שהוא מחזיר נבדק
// ע"י אותו `worker/src/apple.js` בדיוק** — ה-`aud` שלו הוא ה-Bundle ID, ולכן
// `APPLE_CLIENT_IDS` הוא רשימה מלכתחילה (§423).
//
// 🔑 **ותשתית הבחירה כבר קיימת ואין להמציא אותה מחדש:** `native-push.js` מזהה גשר לפי
// `Capacitor.nativePromise` + `addListener` ומגיע לתוסף נייטיב **בלי לארוז ולו בייט
// אחד של Capacitor באתר** (§420ג, אומת על מכשיר ב-§420ט). הדפוס הנכון כאן זהה
// ל-`enablePushAny()`: פונקציה אחת שבוחרת בין שני השולחים לפי הגשר, ולא שני מסכים.
//
// 🔲 **חסום על המק:** התוסף מותקן בפרויקט ה-iOS, ואין עדיין `app/ios`.

(function () {
  'use strict';

  // ── 🔲 טרם מוגדר, ובכוונה ────────────────────────────────────────────────────────────
  // ה-Services ID נוצר בחשבון המפתחים של אפל, שטרם אושר. **כל עוד הוא ריק הבלוק אינו
  // מוצג כלל** — כפתור "התחברות עם Apple" שנשבר בלחיצה גרוע בהרבה מכפתור שאינו קיים,
  // והוא גם היה סיבת דחייה בפני עצמו.
  // ⚠️ אינו סוד — משובץ גלוי בקוד הלקוח, כמו ה-Client ID של גוגל.
  // ⚠️ **חייב להיות זהה ל-Services ID שברשימת `APPLE_CLIENT_IDS` בוורקר.** פער בין השניים
  // מפיל כל כניסה על `google_token_wrong_audience` המקביל, בלי שום רמז לסיבה.
  var SERVICES_ID = '';

  // כתובת החזרה שרשומה אצל אפל. חייבת להיות HTTPS ורשומה בדיוק — אפל דוחה כל השמטה.
  // ⚠️ ולכן, כמו אצל גוגל: **בלוקאלהוסט זה לא יעבוד**, וזה צפוי ולא באג.
  var REDIRECT_URI = 'https://yellowzone.co.il/fan-register.html';

  // ⏱️ אותו סף בדיוק של google-signup: הקריאה רצה **בתוך** זמן-ההמתנה של הנרשם, כי מסך
  // הצלחה עם עבודה שרצה מאחוריו אינו מסך הצלחה (§292).
  var ATTACH_TIMEOUT_MS = 8000;

  var cfg = null;
  var token = null;        // ה-id_token הגולמי שאפל החזירה

  function el(id) { return id ? document.getElementById(id) : null; }

  // ── 🐛 חלקי-הבלוק מאותרים לפי מחלקה **בתוך המכל**, ולא לפי id גלובלי ─────────────────
  // נתפס בדמו: `google-signup.js` מזהה את חלקיו ב-`getElementById`, וזה תקין שם כי יש
  // מופע אחד בדף. הדמו מציג שלוש פריסות זו לצד זו — ואז שלושה `id` זהים בדף, כלומר
  // `getElementById` מחזיר תמיד את הראשון: שתי העמודות האחרות נשארו ריקות **בלי שום
  // שגיאה**. איתור לפי מכל מסיר את הבעיה מהשורש במקום לעקוף אותה בדמו.
  function part(sel) {
    var h = el(cfg && cfg.hostId);
    return h ? h.querySelector(sel) : null;
  }

  // ── פענוח לתצוגה בלבד ────────────────────────────────────────────────────────────────
  // ⚠️ **אסור להסתמך על זה לשום דבר שהוא הרשאה או זהות.** מה שנחשב הוא אך ורק האימות
  // בצד השרת (worker/src/apple.js): חתימה מול ה-JWKS של אפל, issuer, aud ותפוגה.
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

  // 🔴 אותה בדיקה בדיוק כמו בשרת (`apple.js`), ומאותו נימוק — שני מקורות ולא אחד:
  // `is_private_email` הוא ההצהרה הרשמית ואינו מופיע בכל גרסאות הטוקן; סיומת הדומיין
  // היא הגיבוי, והיא נכונה תמיד.
  function isPrivateRelay(p) {
    if (!p) return false;
    var v = p.is_private_email;
    if (v === true || v === 'true') return true;
    return /@privaterelay\.appleid\.com$/i.test(String(p.email || ''));
  }

  // ── הכפתור ────────────────────────────────────────────────────────────────────────────
  // ⚠️ **כפתור משלנו ולא זה של ה-SDK של אפל, בכוונה.** ה-SDK מגיש כפתור לפי locale
  // מהכתובת שממנה נטען, ואין לו גרסה עברית — כלומר היינו מקבלים "Sign in with Apple"
  // באנגלית לצד כפתור גוגל בעברית. אפל מתירה כפתור מותאם בתנאי שהוא שומר על הלוגו,
  // על נוסח מאושר ועל הפרופורציות; זה מה שמיושם כאן.
  var APPLE_LOGO =
    '<svg viewBox="0 0 17 20" width="15" height="18" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M14.06 10.6c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.29-.88-2.31-3.5zM11.87 3.9c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.56 1.31-.56.65-1.06 1.7-.93 2.7.97.08 1.97-.5 2.59-1.23z"/></svg>';

  function injectStyle() {
    if (el('hbAsStyle')) return;
    var s = document.createElement('style');
    s.id = 'hbAsStyle';
    s.textContent =
      '.hb-as-wrap{margin:2px 0 8px}' +
      // גובה 44 ורדיוס 8 — המינימום שאפל מגדירה בהנחיות הכפתור.
      '.hb-as-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;' +
        'min-height:44px;padding:0 16px;border:0;border-radius:8px;background:#000;color:#fff;' +
        'font:inherit;font-size:15px;font-weight:600;cursor:pointer;line-height:1}' +
      '.hb-as-btn:hover{background:#1a1a1a}' +
      '.hb-as-btn:disabled{opacity:.6;cursor:default}' +
      '.hb-as-btn svg{flex:0 0 auto;margin-bottom:2px}' +
      '.hb-as-cap{font-size:12.5px;line-height:1.6;color:var(--text-muted,#6B7A9B);text-align:center;margin:0 0 4px}' +
      '.hb-as-cap b{color:var(--text,#0A2A66)}' +
      '.hb-as-undo{background:none;border:0;padding:0;margin-top:4px;font:inherit;font-size:12px;' +
        'color:var(--text-muted,#6B7A9B);text-decoration:underline;cursor:pointer}' +
      // אותו ירוק של google-signup — "מאומת", לא "מושבת".
      '.hb-as-verified{background:#E8F6EE !important;border-color:#BFE5CE !important}';
    document.head.appendChild(s);
  }

  // ⚠️ הכיתוב **מעל** הכפתור, בדיוק כמו §411 בגוגל: מי שסורק טופס רואה כפתור בלי סיבה
  // ומדלג, וסדר ה-DOM הוא גם סדר הקריאה בקורא-מסך.
  function buildBlock(host) {
    if (host.querySelector('.hb-as-btn')) return;   // כבר נבנה במכל הזה
    host.innerHTML =
      '<div class="hb-as-wrap">' +
        '<div class="hb-as-cap"></div>' +
        '<button type="button" class="hb-as-btn">' +
          APPLE_LOGO + '<span>הרשמה עם Apple</span>' +
        '</button>' +
      '</div>';
  }

  // מדידה מוזרקת מהדף ולא נקראת ישירות — אותו נימוק של google-signup: לכל טופס
  // `logEvent` משלו עם `blockId` משלו, וניחוש כאן היה מייחס הרשמות לטופס הלא-נכון.
  function track(channel) {
    if (cfg && typeof cfg.log === 'function') {
      try { cfg.log(channel); } catch (e) { console.error('apple-signup: log נכשל', e); }
    }
  }

  function setCap(html) {
    var c = part('.hb-as-cap');
    if (c) c.innerHTML = html;
  }

  function defaultCap() {
    return 'הרשמה מהירה עם Apple —<br><b>ובלי לזכור קוד, אף פעם.</b>';
  }

  function setField(id, value, force) {
    var f = el(id);
    if (!f || !value) return;
    if (!force && String(f.value).trim()) return;
    f.value = value;
    f.classList.remove('error');
    var err = el('err-' + id);
    if (err) err.style.display = 'none';
    // הטפסים שומרים טיוטה ומנקים שגיאות על אירועי input — השמה ישירה ל-value אינה
    // מפעילה אותם מעצמה, ובלי זה המילוי "לא נספר".
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 🔑 המייל נדרס ואז ננעל — ההגדר של /apple-attach הוא שהמייל על הרשומה זהה למייל
  // שאפל אימתה, כלומר עריכה ידנית אחרי הלחיצה הייתה שוברת את הקישור בשקט.
  function lockEmail(on) {
    var e = el(cfg && cfg.fields && cfg.fields.email);
    if (!e) return;
    e.readOnly = !!on;              // readOnly ולא disabled — ערך מושבת אינו נקרא בשליחה
    e.classList.toggle('hb-as-verified', !!on);
  }

  function clearEmailWarn() {
    var w = el(cfg && cfg.warnId);
    if (w) w.classList.remove('show');
  }

  // ביטול — השדות **נשארים מלאים** (הם נכונים), רק הקישור יורד והמייל נפתח לעריכה.
  function clearToken() {
    token = null;
    lockEmail(false);
    clearEmailWarn();
    setCap(defaultCap());
    var e = el(cfg && cfg.fields && cfg.fields.email);
    if (e) e.focus();
  }

  // ── 🔴 "הסתר את המייל שלי" ──────────────────────────────────────────────────────────
  // אפל מציעה למשתמש כתובת-ממסר במקום המייל האמיתי, והיא **לעולם לא תהיה זהה** למייל
  // שעל רשומת החבר — כלומר `/apple-attach` דוחה אותה תמיד. השרת מחזיר קוד-שגיאה נפרד
  // בדיוק כדי שאפשר יהיה לומר כאן את הדבר הנכון: לא "משהו השתבש", אלא מה לעשות.
  // ⚠️ **הטוקן לא נשמר** — טוקן שידוע מראש שהקישור שלו ייכשל הוא בדיוק המקום שבו
  // "נראה שהצליח" הופך לתקלה שמתגלה רק ביום שינסה להיכנס.
  function showPrivateRelayHelp() {
    token = null;
    lockEmail(false);
    setCap('⚠️ בחרתם <b>להסתיר את המייל</b> מ-Apple.<br>' +
           'כדי שנוכל לזהות אתכם בכניסה, צריך לבחור <b>"שתף את המייל שלי"</b>. ' +
           'אפשר לנסות שוב, או פשוט למלא את הטופס ידנית.');
    track('asPrivateEmail');
  }

  // ── התשובה מאפל ───────────────────────────────────────────────────────────────────────
  // ⚠️ 🔑 **אפל מוסרת שם רק בהרשאה הראשונה בחיים.** מהפעם השנייה `res.user` אינו קיים
  // כלל, ומגיע `sub` בלבד. מודול שהיה מניח שהשם תמיד מגיע "היה עובד" פעם אחת ואז מפסיק
  // בשקט — ולכן הכיתוב כאן נגזר ממה שהתקבל בפועל ולא מהנחה.
  function onAuthorized(res) {
    var raw = res && res.authorization && res.authorization.id_token;
    var p = raw ? decodeForDisplay(raw) : null;
    if (!p || !p.email) {
      setCap('⚠️ משהו השתבש מול Apple. אפשר פשוט למלא את הטופס ידנית.');
      return;
    }

    if (isPrivateRelay(p)) { showPrivateRelayHelp(); return; }

    token = raw;
    // 🐛 **מונמך לאותיות קטנות, ובכוונה — כאן ולא רק בשרת.** הערך הזה נכתב לשדה, ומשם
    // לתוך `members.email`. השרת אמנם משווה שני הצדדים ב-toLowerCase ולכן הקישור עצמו
    // היה עובד — אבל הכתובת הייתה **נשמרת** עם אות גדולה, וזה כבר קרה כאן: כתובת עם
    // אות גדולה שברה את מעקב המיילים לחלוטין, עד כדי כתיבת `scratch_fix_email_casing.js`
    // כדי לנקות אחריה. ר' [[project_split_welcome_email_race]].
    // ⚠️ `google-signup.js` **אינו** מנמיך (שורת ה-setField שלו), כלומר אותו פער עדיין
    // פתוח שם. לא נגעתי בו מכאן — הוא מודול משותף גם לטופס העסקים.
    var email = String(p.email).trim().toLowerCase();

    // `res.user.name` — קיים רק בפעם הראשונה. אין לו תחליף: אפל אינה שולחת שם בטוקן.
    var nm = res && res.user && res.user.name;
    var gotName = !!(nm && (nm.firstName || nm.lastName));
    if (gotName) {
      setField(cfg.fields.first, nm.firstName || '');
      setField(cfg.fields.last, nm.lastName || '');
    }

    setField(cfg.fields.email, email, true);
    lockEmail(true);
    clearEmailWarn();

    setCap('✅ <b>' + escapeHtml(email) + '</b> — המייל אומת ע"י Apple.<br>' +
           (gotName ? '' : 'אפל אינה שולחת שם בכניסות חוזרות — נשמח שתמלאו אותו.<br>') +
           'אחרי שנאשר אתכם תיכנסו בלחיצה אחת, בלי קוד.' +
           '<button type="button" class="hb-as-undo">זה לא החשבון שלי</button>');
    var undo = part('.hb-as-undo');
    if (undo) undo.addEventListener('click', clearToken);

    // נרשם רק אחרי שהשדות מולאו בפועל, לא בלחיצה: לחיצה שנגמרה בביטול אצל אפל אינה
    // "שימוש", וספירה שלה הייתה מנפחת מונה שאמור למדוד הצלחה.
    track('asUsed');
    if (typeof cfg.onFilled === 'function') {
      try { cfg.onFilled(p); } catch (e) { console.error('apple-signup: onFilled נכשל', e); }
    }
  }

  async function onClick() {
    var btn = part('.hb-as-btn');
    if (btn) btn.disabled = true;
    try {
      var res = await window.AppleID.auth.signIn();
      onAuthorized(res);
    } catch (e) {
      // ⚠️ ביטול ע"י המשתמש אינו תקלה ואינו מקבל הודעה. אפל מחזירה
      // `popup_closed_by_user` על סגירת החלון — הצגת "משהו השתבש" שם הייתה שולחת
      // אותו לחפש בעיה שהוא עצמו יצר. ר' §420ה, אותו לקח בדיוק בהרשאת הפוש.
      var code = (e && (e.error || e.message)) || '';
      if (String(code).indexOf('popup_closed') === -1 && String(code) !== 'user_cancelled_authorize') {
        console.error('apple-signup: signIn נכשל', e);
        setCap('⚠️ משהו השתבש מול Apple. אפשר פשוט למלא את הטופס ידנית.');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ⚠️ הספרייה של אפל נטענת async, ולכן ההמתנה. אם היא לא הגיעה — **הבלוק כולו נשאר
  // מוסתר**, בדיוק כמו אצל גוגל: כפתור שבור גרוע מאין-כפתור. אבל כן נרשמת אזהרה
  // בקונסול — כישלון שקט לגמרי הוא בדיוק מה שהסתיר את §357.
  function render(tries) {
    tries = tries || 0;
    if (!cfg) return;
    var host = el(cfg.hostId);
    if (!host) return;

    // 🔲 בלי Services ID אין מה לצייר, וזה המצב עד שחשבון המפתחים יאושר.
    // ⚠️ `cfg.clientId` קיים כדי שהדמו (ובהמשך, אם נרצה, דף מסוים) יוכל להזין מזהה
    // בלי לערוך את המודול. **הקבוע נשאר מקור-האמת** — ברגע שיהיה Services ID אמיתי
    // הוא נכתב כאן, ולא מפוזר על פני הדפים.
    var clientId = cfg.clientId || SERVICES_ID;
    if (!clientId) {
      console.warn('apple-signup: SERVICES_ID ריק — הבלוק לא יוצג (חשבון אפל טרם הוגדר)');
      return;
    }

    if (window.AppleID && window.AppleID.auth) {
      try {
        window.AppleID.auth.init({
          clientId: clientId,
          scope: 'name email',
          redirectURI: cfg.redirectUri || REDIRECT_URI,
          usePopup: true,
        });
      } catch (e) {
        console.warn('apple-signup: AppleID.auth.init נכשל — הבלוק לא יוצג', e);
        track('asBlocked');
        return;
      }
      var btn = part('.hb-as-btn');
      if (btn && !btn._hbBound) { btn.addEventListener('click', onClick); btn._hbBound = true; }
      setCap(defaultCap());
      host.style.display = '';
      track('asShown');
      return;
    }
    if (tries > 40) {          // ~6 שניות, אותו סף של google-signup
      console.warn('apple-signup: ספריית Apple לא נטענה — הבלוק לא יוצג');
      track('asBlocked');
      return;
    }
    setTimeout(function () { render(tries + 1); }, 150);
  }

  // ── הקישור עצמו, אחרי שהרשומה כבר קיימת ──────────────────────────────────────────────
  // 🔑 **כשל כאן לעולם אינו כשל-הרשמה.** הרשומה כבר נכתבה; מה שנופל הוא רק קיצור-הדרך
  // לכניסה. לכן הפונקציה לא זורקת אף פעם, והתשובה אינה מוצגת לנרשם — הוא באמצע מסך
  // הצלחה, והודעה על "החשבון לא חובר" שם היא רעש שאי-אפשר לעשות איתו כלום.
  async function attach(apiFetch, memberId) {
    if (!token) return { skipped: 'no_token' };
    if (!memberId) return { skipped: 'no_member' };
    if (typeof apiFetch !== 'function') {
      console.warn('apple-signup: attach נקרא בלי apiFetch — הקישור לא נעשה');
      return { skipped: 'no_fetch' };
    }
    try {
      var resp = await apiFetch('/apple-attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token, memberId: memberId }),
        signal: AbortSignal.timeout(ATTACH_TIMEOUT_MS),
      });
      var out = await resp.json();
      if (out && out.ok) return out;
      console.error('apple-signup: /apple-attach לא השלים —', (out && out.error) || 'unknown');
      return out || { error: 'unknown' };
    } catch (e) {
      console.error('apple-signup: /apple-attach נכשל (רשת/פסק-זמן)', e);
      return { error: 'network' };
    }
  }

  function init(opts) {
    opts = opts || {};
    var f = opts.fields || {};
    if (!opts.hostId || !f.first || !f.last || !f.email) {
      console.warn('apple-signup: init נקרא בלי hostId/fields — הבלוק לא יוצג');
      return;
    }
    var host = el(opts.hostId);
    if (!host) {
      console.warn('apple-signup: לא נמצא מכל בשם ' + opts.hostId);
      return;
    }
    cfg = opts;
    injectStyle();
    host.style.display = 'none';     // מוצג רק כשהכפתור באמת מוכן
    buildBlock(host);
    if (opts.autoRender !== false) render(0);
  }

  // ⚠️ החשיפה מיידית ובראש הקובץ-הנטען ולא בתוך callback — ר' §310/§312.
  window.hbAppleSignup = {
    init: init,
    render: function () { render(0); },
    attach: attach,
    token: function () { return token; },
    clear: clearToken,
    // נחשף לבדיקות ולדמו בלבד — מאפשר להריץ את נתיב-התשובה האמיתי בלי חשבון אפל.
    _onAuthorized: onAuthorized,
    _isPrivateRelay: isPrivateRelay,
    _configured: function () { return !!SERVICES_ID; },
  };
})();
