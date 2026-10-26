// ══ §502 — בקשת הרשאת התראות בסוף ההרשמה ═══════════════════════════════════════════════════
// רמי (12.10): "צריך לשאול על ההתראות גם בתחילת ההרשמה, פשוט שיאשרו את זה".
// כרטיס עם כפתור אחד במסך ההצלחה של ההרשמה (fan-register / business). **לחיצה של המשתמש**
// מפעילה את בקשת המערכת — לא קופץ מעצמו (ר' native-push.js: בקשה בלי הקשר = "לא").
//
// 🔑 בזמן ההרשמה אין עדיין זהות (החשבון ממתין לאישור), ולכן registerAndStash: הטוקן נשמר
// במכשיר, ו-home.html (flushPushStash, §420ו) כותב אותו לרשומה בכניסה הראשונה.
//
// מוצג רק כשיש מה לבקש: באפליקציה, עם גשר פוש (אנדרואיד; באייפון available()=false עד §457),
// והרשאה שעוד לא נשאלה. מי שכבר אישר או סירב — לא רואה כלום.
// ⚠️ לא מבטיחים מה שאין: אין היום פוש על אישור החשבון — הוא מגיע במייל. הנוסח מדבר על
// תשובות מהצוות ועדכונים, ששניהם קיימים (§501).
// 🍏 כשייפתח פוש באייפון: שם בקשת המערכת היא ירייה אחת — הכרטיס הזה **הוא** מסך-הביניים
// שלנו (רק מי שלוחץ "כן" מקבל את חלון אפל), ולכן הוא מתאים כמו שהוא.
(function () {
  'use strict';

  async function shouldAsk() {
    try {
      const np = window.YZNativePush;
      if (!np || !np.available()) return false;
      const st = await np.permissionState();
      return st === 'prompt' || st === 'prompt-with-rationale';
    } catch (e) { return false; }
  }

  async function mount(host) {
    if (!host || host.querySelector('.yz-pushask')) return;
    if (!(await shouldAsk())) return;
    const box = document.createElement('div');
    box.className = 'yz-pushask';
    box.style.cssText = 'margin:18px auto 0;max-width:360px;background:#E8EEFB;border:1px solid #cdd8f2;border-radius:14px;' +
      'padding:14px;text-align:center;color:#0A2A66;line-height:1.55;font-size:14px';
    box.innerHTML =
      '<div style="font-weight:800;font-size:15px">רוצים שנעדכן אתכם?</div>' +
      '<div style="margin-top:4px">נשלח לכם התראה כשהצוות עונה לכם, ועל עדכונים חשובים.</div>' +
      '<button type="button" class="yz-pushask-yes" style="margin-top:10px;border:none;border-radius:12px;padding:11px 20px;' +
        'font:inherit;font-size:14px;font-weight:900;background:#FFD400;color:#0A2A66;cursor:pointer">כן, להפעיל התראות</button>' +
      '<div class="yz-pushask-msg" style="margin-top:8px;font-size:13px;display:none"></div>';
    host.appendChild(box);
    const btn = box.querySelector('.yz-pushask-yes');
    const msg = box.querySelector('.yz-pushask-msg');
    btn.addEventListener('click', async function () {
      btn.disabled = true; btn.textContent = 'רגע…';
      let text;
      try {
        const r = await window.YZNativePush.registerAndStash();
        text = r.ok ? '✓ התראות הופעלו.'
          : (r.reason === 'denied' || r.reason === 'declined')
            ? 'בסדר, בלי התראות. אפשר להפעיל אותן בכל זמן מהתפריט.'
            : 'לא הצלחנו להפעיל התראות עכשיו. אפשר לנסות שוב מהתפריט, אחרי הכניסה.';
      } catch (e) {
        console.error('push ask failed:', e);
        text = 'לא הצלחנו להפעיל התראות עכשיו. אפשר לנסות שוב מהתפריט, אחרי הכניסה.';
      }
      btn.style.display = 'none';
      msg.textContent = text; msg.style.display = 'block';
    });
  }

  // ══ §570 — אוהדים: תיבת-סימון מסומנת מראש מעל כפתור השליחה ═════════════════════════════
  // רמי (20.10): *"לעבור בהרשמה לצ'קבוקס מסומן מראש… אוהד שלא רוצה פשוט לא מסמן ויקבל את זה
  // בדף הבית"*. התיבה **לא** נותנת הרשאה – רק חלון המערכת נותן. מסומנת → אחרי שהשליחה הצליחה
  // נפתח חלון המערכת (afterSubmit). הוסר הסימון → לא שואלים בכלל, וההרשאה נשארת 'prompt',
  // כך שכרטיס דף-הבית (§569) יופיע אחרי האישור.
  // אותם תנאים כמו mount: אפליקציה + גשר + עוד לא נשאל. אחרת התיבה לא מוצגת.
  // רמי: "גם לאוהד וגם לבעל העסק" – fan-register.html ו-business.html. mount נשאר לשימוש עתידי.
  // §572 — התיבה מוצגת גם כשההרשאה **כבר 'granted'**. רמי (20.10, אנדרואיד): "לא רואה את
  // תיבת הסימון". באנדרואיד 12 ומטה ההרשאה ניתנת אוטומטית בהתקנה, וגם מכשיר שכבר אישר נשאר
  // 'granted' – ושם 'prompt' לא מתקיים אף פעם. כלומר אף אחד מהם לא נרשם להתראות. כש-granted,
  // registerAndStash לא פותח שום חלון (ensurePermission חוזר מיד) – רק מוציא טוקן.
  // 'denied' – לא מוצגת: אין מה לעשות מכאן.
  async function canOptIn() {
    try {
      const np = window.YZNativePush;
      if (!np || !np.available()) return false;
      const st = await np.permissionState();
      return st === 'prompt' || st === 'prompt-with-rationale' || st === 'granted';
    } catch (e) { return false; }
  }

  // §619 — opts.biz: בעל עסק מקבל כיתוב משלו שמסביר למה כדאי להשאיר מסומן (רמי, 26.10).
  async function mountCheckbox(beforeEl, opts) {
    if (!beforeEl || document.getElementById('yzPushOpt')) return;
    if (!(await canOptIn())) return;
    const row = document.createElement('label');
    row.className = 'yz-pushopt';
    row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin:4px 0 14px;font-size:14px;' +
      'line-height:1.5;color:#0A2A66;cursor:pointer';
    // ⚠️ תיבה **מצוירת**, לא הפקד של הדפדפן: ב-business.html עיצוב ה-input הכללי של הדף
    // מוחק את הפקד, והתיבה הופיעה ריקה ואפורה למרות שסומנה (נתפס בצילום, 20.10). אותה שיטה
    // של "קראתי ואני מסכים" שם: input שקוף מעל ריבוע שאנחנו צובעים.
    row.innerHTML =
      '<span style="position:relative;width:22px;height:22px;flex:0 0 auto;margin-top:1px">' +
        '<input type="checkbox" id="yzPushOpt" checked style="position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;z-index:2;cursor:pointer">' +
        '<span class="yz-pushopt-box" style="position:absolute;inset:0;border:2px solid #0A2A66;border-radius:6px;display:flex;' +
          'align-items:center;justify-content:center;font-size:15px;font-weight:900;line-height:1;pointer-events:none"></span>' +
      '</span>' +
      (opts && opts.biz
        ? '<span><b>לקבל התראות</b> – ככה תדעו מיד על עדכונים לעסק, תשובות מהצוות והזמנה לערב ההשקה. מומלץ להשאיר מסומן.</span>'
        : '<span>לקבל התראות כשהצוות עונה לי ועל עדכונים חשובים</span>');
    beforeEl.parentNode.insertBefore(row, beforeEl);
    const cb = row.querySelector('#yzPushOpt'), box = row.querySelector('.yz-pushopt-box');
    const paint = () => { box.textContent = cb.checked ? '✓' : ''; box.style.background = cb.checked ? '#0A2A66' : 'transparent'; box.style.color = '#fff'; };
    cb.addEventListener('change', paint);
    paint();
  }

  // אחרי שהבקשה נקלטה. רק אם התיבה הוצגה **ומסומנת**. הטוקן נשמר במכשיר (אין עדיין זהות),
  // ו-home.html כותב אותו לרשומה בכניסה הראשונה (flushPushStash).
  async function afterSubmit(host) {
    const cb = document.getElementById('yzPushOpt');
    if (!cb || !cb.checked || !host) return;
    let text;
    try {
      const r = await window.YZNativePush.registerAndStash();
      text = r.ok ? '✓ התראות הופעלו.'
        : (r.reason === 'denied' || r.reason === 'declined')
          ? 'בסדר, בלי התראות.'
          : 'לא הצלחנו להפעיל התראות עכשיו. אפשר להפעיל אחרי הכניסה, מהתפריט.';
    } catch (e) {
      console.error('push opt-in failed:', e);
      text = 'לא הצלחנו להפעיל התראות עכשיו. אפשר להפעיל אחרי הכניסה, מהתפריט.';
    }
    const msg = document.createElement('div');
    msg.style.cssText = 'margin:14px auto 0;max-width:360px;text-align:center;font-size:13.5px;color:#0A2A66';
    msg.textContent = text;
    host.appendChild(msg);
  }

  window.YZPushAsk = { mount: mount, mountCheckbox: mountCheckbox, afterSubmit: afterSubmit };
})();
