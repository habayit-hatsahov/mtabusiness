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

  window.YZPushAsk = { mount: mount };
})();
