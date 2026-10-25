// ══ §507 — "האזור שלי" שלב 3ג: המדריכים לבעל העסק ═════════════════════════════════════════════
// שני מדריכים מהדמו (§473יב/יז/יח, §473יט–כה), בתוך הדשבורד (ומשם גם ב"העסק שלי" באפליקציה):
//   1. "איך העסק שלך מקבל יותר חשיפה" + קריאה לשתף.
//   2. "איך מאשרים הטבה לאוהד" — שלוש הדרכים (הפעילות קודם, "אצלכם"), דוגמה חיה עם שעון רץ,
//      ו"הורדה והדפסה" → redemption-guide.html.
// ⚠️ **הנוסח מהדמו, מילה במילה, ובכוונה**: כל טענה שם נבדקה מול home.html (§473יב) ונכתבה עם רמי.
// שינוי בטקסט = לבדוק שוב מול הקוד — לא להבטיח מה שאין.
// שתי קופסאות <details> סגורות כברירת מחדל (§473יג: "נפתח נקי... שבעל העסק יצטרך ללחוץ").
// סקריפט קלאסי שנחשף על window (כמו hours.js / social-links.js) — הדשבורד קורא לו כשהעסק נטען.
(function () {
  'use strict';
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function injectStyle() {
    if (document.getElementById('bgStyle')) return;
    var s = document.createElement('style');
    s.id = 'bgStyle';
    s.textContent =
      '.bg-card{background:var(--card-bg,#fff);border:1.5px solid var(--border,#E7E7E0);border-radius:16px;margin:0 0 12px;overflow:hidden}' +
      '.bg-card>summary{list-style:none;cursor:pointer;padding:15px 16px;display:flex;align-items:center;gap:10px;font-size:15.5px;font-weight:900;color:var(--text,#0A2A66)}' +
      '.bg-card>summary::-webkit-details-marker{display:none}' +
      '.bg-card>summary::after{content:"+";margin-inline-start:auto;font-size:22px;font-weight:900;color:var(--text-sm,#6B7A9B)}' +
      '.bg-card[open]>summary::after{content:"−"}' +
      '.bg-card>summary small{display:block;font-size:12.5px;font-weight:600;color:var(--text-sm,#6B7A9B);margin-top:2px}' +
      '.bg-body{padding:0 16px 16px;color:var(--text,#0A2A66)}' +
      '.bg-p{font-size:14.5px;line-height:1.65;margin:0 0 10px}' +
      '.bg-step{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--border,#E7E7E0);font-size:14.5px;line-height:1.6}' +
      '.bg-step:last-child{border-bottom:none}' +
      '.bg-n{width:28px;height:28px;border-radius:50%;background:var(--yellow,#FFD400);font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
      '.bg-note{margin-top:12px;background:#FFF7DB;border:1px solid #FFE9A3;border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.6}' +
      '.bg-ok{margin-top:8px;background:#E6F4EA;color:#1e6b34;border-radius:10px;padding:9px 12px;font-size:14px;font-weight:800}' +
      '.bg-cta{margin-top:14px;background:var(--text,#0A2A66);color:#fff;border-radius:16px;padding:16px;text-align:center}' +
      '.bg-cta-t{font-size:17px;font-weight:900}' +
      '.bg-cta-x{font-size:14px;line-height:1.6;margin-top:4px;color:rgba(255,255,255,.85)}' +
      '.bg-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;border:none;border-radius:12px;padding:14px;font:inherit;font-size:15.5px;font-weight:900;background:var(--yellow,#FFD400);color:#0A2A66;cursor:pointer;text-decoration:none}' +
      '.bg-h{font-size:15px;font-weight:900;margin:16px 0 2px;padding-top:12px;border-top:1px solid var(--border,#E7E7E0)}' +
      '.bg-m{border:1.5px solid var(--border-md,#E4E4DC);border-radius:14px;padding:12px 14px;margin-top:12px}' +
      '.bg-m.mine{border:2px solid var(--text,#0A2A66)}' +
      '.bg-mh{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:16.5px;font-weight:900}' +
      '.bg-tag{font-size:11.5px;font-weight:900;background:var(--yellow,#FFD400);border-radius:20px;padding:3px 10px}' +
      '.bg-ms{font-size:12.5px;color:var(--text-sm,#6B7A9B);margin:2px 0 4px}' +
      '.bg-card .yz-card{max-width:380px;margin:8px auto 0;border-radius:16px;position:relative;overflow:hidden;background:var(--yellow,#FFD400);box-shadow:0 12px 30px rgba(10,42,102,.2)}' +
      '.bg-card .yz-card-wm{position:absolute;top:-28px;left:-32px;width:180px;opacity:.13;mix-blend-mode:multiply;pointer-events:none}' +
      '.bg-card .yz-card-in{position:relative;padding:18px 20px 20px}' +
      '.bg-card .yz-card-mid{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}' +
      '.bg-card .yz-card-label{color:rgba(10,42,102,.62);font-size:11.5px;font-weight:700;letter-spacing:.14em}' +
      '.bg-card .yz-card-name{font-size:24px;font-weight:800}' +
      '.bg-card .yz-card-logo{height:21px}' +
      '.bg-card .yz-card-fields{margin-top:34px;display:flex;gap:20px}' +
      '.bg-card .yz-card-fl{color:rgba(10,42,102,.62);font-size:11px;font-weight:600;margin-bottom:3px}' +
      '.bg-card .yz-card-fv{font-size:16px;font-weight:800;direction:ltr;unicode-bidi:isolate}' +
      '.bg-card .yz-strip{max-width:380px;margin:10px auto 0;background:linear-gradient(140deg,#0A2A66 0%,#123A82 100%);border-radius:14px;padding:13px 15px 11px}' +
      '.bg-card .yz-strip-head{display:flex;justify-content:space-between;align-items:center;gap:10px}' +
      '.bg-card .yz-strip-row1{display:flex;align-items:center;gap:7px}' +
      '.bg-card .yz-dot{width:8px;height:8px;border-radius:50%;background:#22C55E}' +
      '.bg-card .yz-strip-cap,.bg-card .yz-strip-mark{font-size:11.5px;font-weight:700;color:var(--yellow,#FFD400)}' +
      '.bg-card .yz-strip-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12)}' +
      '.bg-card .yz-strip-biz{font-size:19px;font-weight:800;color:#fff}' +
      '.bg-card .yz-clock{font-size:11.5px;font-weight:700;color:#C9D8F5;background:rgba(255,255,255,.08);border-radius:8px;padding:4px 9px;white-space:nowrap;direction:ltr}' +
      '.bg-co{max-width:380px;margin:8px auto 0;display:flex;flex-direction:column;gap:4px}' +
      '.bg-co div{display:flex;flex-direction:column;padding:5px 0;border-bottom:1px solid var(--border,#E7E7E0)}' +
      '.bg-co div:last-child{border-bottom:none}' +
      '.bg-co b{font-size:13.5px}.bg-co span{font-size:12.5px;color:var(--text-sm,#6B7A9B)}';
    document.head.appendChild(s);
  }

  // §473כא — במוצר מ-discountTypes: physical→store, sale→service, online→online
  var TYPE_TO_M = { physical: 'store', sale: 'service', online: 'online' };
  // §604 (25.10) — הנוסח המאוחד: אותו נוסח כמו "איך מממשים?" בכרטיס העסק ובקרוסלה; שמות הדרכים כמו
  // בטופס (בחנות / במעמד המכירה / השירות / באתר); בלי וידאו; תעודה מזהה – ההחלטה של העסק.
  var METHOD = {
    store: { t: 'בחנות', sub: 'בודקים 4 דברים', body:
      '<div class="bg-step"><span class="bg-n">1</span><div><b>שם העסק</b> בפס הכחול – שלכם.</div></div>' +
      '<div class="bg-step"><span class="bg-n">2</span><div><b>השעון רץ</b> – השניות מתחלפות. זה מסך חי, לא צילום מסך.</div></div>' +
      '<div class="bg-step"><span class="bg-n">3</span><div><b>תעודת חבר</b> עם שם ומספר חבר.</div></div>' +
      '<div class="bg-step"><span class="bg-n">4</span><div><b>תעודה מזהה</b> – אפשר לבקש, ההחלטה שלכם. השם בתעודת החבר תואם לתעודה המזהה של האוהד.</div></div>' +
      '<div class="bg-ok">✓ הכל תקין? נותנים את ההטבה.</div>' },
    service: { t: 'במעמד המכירה / השירות', sub: 'בפגישה, בטלפון או בוואטסאפ', body:
      '<div class="bg-step"><span class="bg-n">•</span><div><b>בפגישה</b> – האוהד מראה את המסך עצמו, ובודקים כמו בחנות.</div></div>' +
      '<div class="bg-step"><span class="bg-n">•</span><div><b>בטלפון או בוואטסאפ</b> – מבקשים שישלח בוואטסאפ <b>צילום מסך</b>, מתי שנוח לכם. רואים בו את תעודת החבר ואת הפס הכחול: שם העסק שלכם, תאריך ושעה.</div></div>' +
      '<div class="bg-step"><span class="bg-n">•</span><div><b>תעודה מזהה</b> – אפשר לבקש, בכל דרך שנוחה לכם. ההחלטה שלכם.</div></div>' },
    online: { t: 'באתר', sub: 'קוד קופון', body:
      '<div class="bg-step"><span class="bg-n">1</span><div>צרו במערכת האתר <b>קוד קופון ייחודי לחברי Yellow Zone</b> – לא קוד שמפורסם במקום אחר.</div></div>' +
      '<div class="bg-step"><span class="bg-n">2</span><div>הזינו אותו ב"עריכת פרטים" ← "ההטבה".</div></div>' +
      '<div class="bg-step"><span class="bg-n">3</span><div>האוהד מעתיק את הקוד מהכרטיס שלכם ומזין בהזמנה. הקוד מוצג רק לחברים.</div></div>' },
  };
  var SHARE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>';
  var DL_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';

  function exampleHtml(bizName) {
    return '<div class="yz-card"><img class="yz-card-wm" src="images/yellowzone-watermark.png" alt=""/><div class="yz-card-in">' +
      '<div class="yz-card-mid"><div><div class="yz-card-label">תעודת חבר</div><div class="yz-card-name">ישראל ישראלי</div></div>' +
      '<img class="yz-card-logo" src="images/yellowzone-logo-horizontal.png" alt="Yellow Zone"/></div>' +
      '<div class="yz-card-fields"><div><div class="yz-card-fl">מספר חבר</div><div class="yz-card-fv">#00042</div></div>' +
      '<div><div class="yz-card-fl">הצטרפות</div><div class="yz-card-fv">07/26</div></div></div></div></div>' +
      '<div class="yz-strip"><div class="yz-strip-head"><div class="yz-strip-row1"><span class="yz-dot"></span><span class="yz-strip-cap">אימות בתוקף עבור ההטבה</span></div>' +
      '<span class="yz-strip-mark">YELLOW ZONE</span></div>' +
      '<div class="yz-strip-foot"><span class="yz-strip-biz">' + esc(bizName) + '</span><span class="yz-clock" data-bg-clock></span></div></div>' +
      '<div class="bg-co"><div><b>שם העסק</b><span>שלכם</span></div><div><b>השעון</b><span>השניות רצות – מסך חי. בוואטסאפ: צילום מסך</span></div>' +
      '<div><b>תעודת חבר</b><span>שם ומספר חבר</span></div><div><b>תעודה מזהה</b><span>אפשר לבקש – אותו שם כמו בתעודת החבר</span></div></div>';
  }

  var clockTimer = null;
  function tick() {
    var n = new Date();
    var t = n.toLocaleDateString('he-IL') + ' · ' + n.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var els = document.querySelectorAll('[data-bg-clock]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t;
  }

  // host — האלמנט. opts: { name, benefit, discountTypes, onShare }
  function render(host, opts) {
    if (!host) return;
    injectStyle();
    opts = opts || {};
    var name = opts.name || 'העסק שלכם';
    var mine = (opts.discountTypes || []).map(function (t) { return TYPE_TO_M[t]; }).filter(Boolean);
    var all = ['store', 'service', 'online'];
    // §473כב/כג — שלוש הדרכים תמיד; הפעילות קודם, עם "אצלכם"
    var ordered = all.filter(function (m) { return mine.indexOf(m) >= 0; })
      .concat(all.filter(function (m) { return mine.indexOf(m) < 0; }));
    var methods = ordered.map(function (m) {
      var isMine = mine.indexOf(m) >= 0;
      return '<div class="bg-m' + (isMine ? ' mine' : '') + '"><div class="bg-mh"><span>' + METHOD[m].t + '</span>' +
        (isMine ? '<span class="bg-tag">אצלכם</span>' : '') + '</div><div class="bg-ms">' + METHOD[m].sub + '</div>' + METHOD[m].body + '</div>';
    }).join('');
    var q = new URLSearchParams({ name: name, benefit: opts.benefit || '', m: (mine.length ? mine : ['store']).join(',') });

    host.innerHTML =
      '<details class="bg-card"><summary><span>📈 איך העסק שלך מקבל יותר חשיפה<small>מדריך קצר – מה מקדם אתכם בדף הבית</small></span></summary><div class="bg-body">' +
        '<p class="bg-p">חלק מדף הבית מסודר לפי מה שאוהדים עושים – <b>ושם אתם משפיעים</b>:</p>' +
        '<div class="bg-step"><span class="bg-n">1</span><div><b>"הכי אהובים"</b> – לפי לבבות. יותר לבבות = מקום גבוה יותר. בקשו מחברים מהיציע לסמן לב.</div></div>' +
        '<div class="bg-step"><span class="bg-n">2</span><div><b>"הכי פופולריים"</b> – לפי כניסות לכרטיס. כל פתיחה נספרת. בקשו מחברים להיכנס לעסק שלכם.</div></div>' +
        '<div class="bg-step"><span class="bg-n">3</span><div><b>שתפו</b> – "שתפו את העסק שלכם" שולח קישור לכרטיס: וואטסאפ, קבוצות, סטורי.</div></div>' +
        '<div class="bg-step"><span class="bg-n">4</span><div><b>כרטיס מלא</b> – תמונה, תיאור והטבה ברורה מביאים יותר כניסות. ר\' "מה חסר" כאן בדשבורד.</div></div>' +
        '<div class="bg-step"><span class="bg-n">5</span><div><b>עסק השבוע / הטבת השבוע</b> – שבוע בראש דף הבית. נרשמים בקובייה שלהם.</div></div>' +
        '<div class="bg-note">💡 רק <b>אוהדים רשומים</b> יכולים לסמן לב. בקטגוריות וב"כל העסקים" הסדר מתחלף בכל ביקור – כל עסק מגיע לראש בתורו.</div>' +
        '<div class="bg-cta"><div class="bg-cta-t">רוצים לעלות למעלה? שתפו עכשיו.</div>' +
          '<div class="bg-cta-x">שלחו את העסק לחברים מהיציע ולקבוצות האוהדים. כל כניסה וכל לב מקדמים אתכם.</div>' +
          '<button type="button" class="bg-btn" data-bg-share="1">' + SHARE_SVG + ' שתפו את העסק שלכם</button></div>' +
      '</div></details>' +
      '<details class="bg-card"><summary><span>🧾 איך מאשרים הטבה לאוהד<small>מה בודקים בחנות, במעמד המכירה / השירות ובאתר – וקובץ להדפסה</small></span></summary><div class="bg-body">' +
        '<p class="bg-p">האוהד מציג את ההטבה <b>מתוך הכרטיס של העסק שלכם</b> באפליקציה: תעודת חבר, ומתחתיה פס כחול עם <b>שם העסק ושעון חי</b>.</p>' +
        methods +
        '<div class="bg-h">ככה זה נראה אצל האוהד</div>' + exampleHtml(name) +
        '<div class="bg-note">אוהד בלי תעודה? מזמינים אותו להצטרף: <b>yellowzone.co.il</b></div>' +
        '<a class="bg-btn" href="redemption-guide.html?' + esc(q.toString()) + '" target="_top">' + DL_SVG + ' הורדה והדפסה של המדריך</a>' +
        '<div style="font-size:12.5px;color:var(--text-sm,#6B7A9B);margin-top:6px;text-align:center">קובץ מעוצב עם שם העסק וההטבה שלכם – לשמור בטלפון או לתלות ליד הקופה</div>' +
      '</div></details>';

    var share = host.querySelector('[data-bg-share]');
    if (share && typeof opts.onShare === 'function') share.addEventListener('click', opts.onShare);
    tick();
    if (!clockTimer) clockTimer = setInterval(tick, 1000);
  }

  window.YZBizGuides = { render: render };
})();
