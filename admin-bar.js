// ── §601 — סרגל מנהל בדפדפן: כל דפי הבדיקה בלחיצה, בלי להתנתק ────────────────────────────────
// רמי (23.10): "אני רוצה לבצע הרשמות לבדיקה ולהיות בדף הנחיתה, ואני לא רוצה להחזיק מיליון קישורים".
// התנתקות מנתקת את כל הלשוניות (§600ב), ולכן כל מעבר "כאורח" נעשה בדפים שלא דורשים התנתקות:
//   • דף הנחיתה ?guest=1 (§310 – לא מעביר מחובר לאינדקס), &src=test – לא נספר בסטטיסטיקה (§483)
//   • fan-register.html / business.html – ההרשמה כותבת רשומה חדשה ולא מבצעת signIn (§310)
// מי רואה: רק מי שמרכז הניהול (או "האזור שלי") זיהה כמנהל – הדגל yz_admin_web ב-localStorage.
// הדגל לא מעניק שום הרשאה – רק מציג קישורים; כל דף בודק מנהל בעצמו. נמחק בהתנתקות מלאה.
// לא באפליקציה ולא בתוך iframe (הדשבורד המשובץ ב"האזור שלי", מודאל ההרשמה).
(function () {
  'use strict';
  try {
    if (window.top !== window) return;
    if (window.Capacitor || /YellowZoneApp/i.test(navigator.userAgent || '')) return;
    if (localStorage.getItem('yz_admin_web') !== '1') return;
  } catch (e) { return; }

  var LINKS = [
    ['admin-dashboard.html', 'מרכז הניהול'],
    ['landing.html?guest=1&src=test', 'דף הנחיתה (כמו אורח)'],
    ['fan-register.html', 'הרשמת אוהד לבדיקה'],
    ['business.html', 'הרשמת עסק לבדיקה'],
    ['home.html', 'האינדקס'],
    ['profile.html', 'האזור שלי'],
  ];

  function build() {
    if (document.getElementById('yzAdminBar')) return;
    var here = location.pathname.split('/').pop() || 'index.html';
    var css = document.createElement('style');
    css.textContent =
      '#yzAdminBar{position:fixed;left:12px;bottom:12px;z-index:2147483000;font-family:Rubik,system-ui,Arial,sans-serif;direction:rtl}' +
      '#yzAdminBar .yzab-btn{background:#0A2A66;color:#fff;border:0;border-radius:999px;padding:9px 14px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}' +
      '#yzAdminBar .yzab-menu{display:none;position:absolute;left:0;bottom:46px;background:#fff;border:1px solid #D0D5DD;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:6px;min-width:230px}' +
      '#yzAdminBar.open .yzab-menu{display:block}' +
      '#yzAdminBar a{display:block;padding:9px 12px;border-radius:9px;color:#0A2A66;text-decoration:none;font-size:14px;font-weight:700}' +
      '#yzAdminBar a:hover{background:#FFF8D6}' +
      '#yzAdminBar a.here{background:#FFD400}' +
      '#yzAdminBar .yzab-note{font-size:11.5px;color:#667085;padding:8px 12px 4px;line-height:1.5;border-top:1px solid #EAECF0;margin-top:4px}';
    document.head.appendChild(css);
    var bar = document.createElement('div');
    bar.id = 'yzAdminBar';
    var html = '<div class="yzab-menu">';
    for (var i = 0; i < LINKS.length; i++) {
      var page = LINKS[i][0].split('?')[0];
      html += '<a href="' + LINKS[i][0] + '"' + (page === here ? ' class="here"' : '') + '>' + LINKS[i][1] + '</a>';
    }
    html += '<div class="yzab-note">נשארים מחוברים כמנהל בכל הדפים. בדיקת <b>כניסה</b> של משתמש אחר – רק בחלון פרטי (Ctrl+Shift+N).</div></div>';
    html += '<button type="button" class="yzab-btn">🛠 מנהל</button>';
    bar.innerHTML = html;
    bar.querySelector('.yzab-btn').addEventListener('click', function () { bar.classList.toggle('open'); });
    document.addEventListener('click', function (e) { if (!bar.contains(e.target)) bar.classList.remove('open'); });
    document.body.appendChild(bar);
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
