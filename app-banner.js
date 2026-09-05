// ── §417 — באנר "הורידו את האפליקציה" ────────────────────────────────────────
// מודול משותף לשלושה משטחים: home.html (אוהד), business-dashboard.html (בעל עסק),
// welcome.html (דף הנחיתה, לפני ההרשמה). אותו דפוס בדיוק כמו sections-policy.js /
// hours.js / social-links.js — <script src> רגיל שנחשף על window, לא module, כדי
// שגם קוד שאינו module יוכל לקרוא לו.
//
// 🔑 **שלושה מנעולים, וכולם חייבים להיפתח כדי שהבאנר יופיע:**
//   (1) הדגל של הקהל הספציפי דלוק ב-settings/appLaunch
//   (2) יש כתובת-חנות למערכת ההפעלה של המבקר בפועל
//   (3) המבקר אינו כבר בתוך האפליקציה
// המסמך settings/appLaunch **אינו קיים היום**, ומסמך חסר = הכול כבוי. זו התנהגות
// מכוונת ולא מקרית: המערכת חיה, יש בה משתמשים עכשיו, ואסור שמישהו יראה "הורידו את
// האפליקציה" לפני שיש מה להוריד. ביום ההשקה המנהל יוצר את המסמך ומדליק.
//
// ⚠️ **מנעול (2) אינו כפילות של (1)**: דגל דלוק בטעות בלי כתובת עדיין לא מצייר כלום.
// ביום שמדליקים בו הרבה מתגים בבת אחת, מנעול יחיד תמיד נפתח מוקדם מדי.

(function () {
  'use strict';

  const DISMISS_PREFIX = 'yz_appbanner_dismissed_';

  // הבאנר מוסתר בתוך האפליקציה עצמה — שם אין מה להוריד. שתי דרכי זיהוי, כי כל אחת
  // לבדה מפספסת: window.Capacitor נטען רק אחרי שהגשר מוזרק (יש חלון שבו הוא עוד לא
  // קיים והדף כבר מצייר), ו-appendUserAgent קיים מהבקשה הראשונה אך תלוי בהגדרה
  // שנשארת נכונה בבנייה. שתיהן יחד מכסות זו את זו.
  function inApp() {
    if (typeof window === 'undefined') return false;
    if (window.Capacitor) return true;
    return /YellowZoneApp/i.test(navigator.userAgent || '');
  }

  function platform() {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    // iPad מודרני מדווח על עצמו כ-Macintosh; מסך-מגע הוא מה שמבדיל אותו ממק אמיתי.
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
    return 'other';
  }

  const TEXTS = {
    fan: {
      title: 'האפליקציה של Yellow Zone',
      body: 'התקינו, ותדעו ראשונים על הטבות חדשות',
      cta: 'להורדה',
    },
    biz: {
      title: 'האפליקציה של Yellow Zone',
      body: 'כאן נעדכן אתכם ישירות — בלי לחפש במיילים',
      cta: 'להורדה',
    },
    landing: {
      title: 'אפשר גם מהאפליקציה',
      body: 'להוריד, ולהמשיך את ההרשמה משם',
      cta: 'להורדה',
    },
  };

  const FLAG_BY_AUDIENCE = { fan: 'bannerFans', biz: 'bannerBiz', landing: 'bannerLanding' };

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const el = document.createElement('style');
    // צבעים עם fallback מפורש: המודול נטען בשלושה דפים עם ערכות שונות, ומשתנה חסר
    // בדף אחד היה נותן טקסט בצבע ברירת-המחדל של הדפדפן על רקע כהה — כלומר בלתי-קריא.
    el.textContent = [
      '.yz-appbanner{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:12px 0;',
      'border:1px solid var(--border-md,rgba(255,255,255,.14));border-radius:14px;',
      'background:var(--card-bg,#161d2e);direction:rtl;text-align:right}',
      '.yz-appbanner-icon{width:44px;height:44px;border-radius:11px;flex:0 0 auto;',
      'background:#FFDE00;display:flex;align-items:center;justify-content:center;font-size:22px}',
      '.yz-appbanner-txt{flex:1;min-width:0}',
      '.yz-appbanner-title{font-size:14px;font-weight:700;color:var(--text,#fff);margin:0 0 2px}',
      '.yz-appbanner-body{font-size:12.5px;line-height:1.45;color:var(--text-sm,#b9c2d6);margin:0}',
      '.yz-appbanner-cta{flex:0 0 auto;font:inherit;font-size:13px;font-weight:700;cursor:pointer;',
      'text-decoration:none;background:#FFDE00;color:#0f1524;border:0;border-radius:10px;padding:9px 16px}',
      '.yz-appbanner-x{flex:0 0 auto;background:none;border:0;cursor:pointer;font-size:18px;line-height:1;',
      'padding:4px 2px;color:var(--text-sm,#b9c2d6);opacity:.7}',
      '@media(max-width:400px){.yz-appbanner{gap:9px;padding:11px}.yz-appbanner-cta{padding:9px 12px}}',
    ].join('');
    document.head.appendChild(el);
  }

  // mount — אלמנט קיים שאליו הבאנר נכנס (prepend). audience — fan/biz/landing.
  // cfg — מסמך settings/appLaunch כפי שנקרא בדף, או null אם אין/נכשלה הקריאה.
  // מחזיר מחרוזת-סיבה, כדי שאפשר יהיה לאבחן "למה לא הופיע" בלי לנחש.
  function render(mount, audience, cfg) {
    if (!mount) return 'no-mount';
    if (inApp()) return 'in-app';
    if (!cfg) return 'no-config';

    const flag = FLAG_BY_AUDIENCE[audience];
    if (!flag || cfg[flag] !== true) return 'flag-off';

    const os = platform();
    const url = os === 'android' ? cfg.androidUrl : (os === 'ios' ? cfg.iosUrl : '');
    if (!url) return 'no-url';

    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_PREFIX + audience) === '1'; } catch (e) {}
    if (dismissed) return 'dismissed';

    if (mount.querySelector('.yz-appbanner')) return 'already';

    injectStyles();
    const t = TEXTS[audience] || TEXTS.fan;
    const wrap = document.createElement('div');
    wrap.className = 'yz-appbanner';
    wrap.innerHTML =
      '<div class="yz-appbanner-icon">📱</div>' +
      '<div class="yz-appbanner-txt">' +
        '<p class="yz-appbanner-title"></p>' +
        '<p class="yz-appbanner-body"></p>' +
      '</div>' +
      '<a class="yz-appbanner-cta" target="_blank" rel="noopener"></a>' +
      '<button class="yz-appbanner-x" type="button" aria-label="סגירה">×</button>';
    // textContent ולא innerHTML לטקסטים: הנוסח מגיע ממסמך שהמנהל עורך, ואסור
    // שיוכל להזריק תגיות לתוך הדף.
    wrap.querySelector('.yz-appbanner-title').textContent = cfg.bannerTitle || t.title;
    wrap.querySelector('.yz-appbanner-body').textContent = cfg.bannerBody || t.body;
    const cta = wrap.querySelector('.yz-appbanner-cta');
    cta.textContent = t.cta;
    cta.href = url;
    cta.addEventListener('click', () => {
      if (window.logEvent) window.logEvent('appBannerClick', { channel: audience, blockId: os });
    });
    wrap.querySelector('.yz-appbanner-x').addEventListener('click', () => {
      try { localStorage.setItem(DISMISS_PREFIX + audience, '1'); } catch (e) {}
      wrap.remove();
    });

    mount.prepend(wrap);
    if (window.logEvent) window.logEvent('appBannerShown', { channel: audience, blockId: os });
    return 'shown';
  }

  window.YZAppBanner = { render: render, inApp: inApp, platform: platform };
})();
