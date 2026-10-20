// ══ §516 — מצב תצוגה (לינק אורח) ═════════════════════════════════════════════════════════
// נטען ב-<head> של home/profile/terms. פעיל רק כשהסשן הוא של אורח (hb_memberId=demo_…, נכתב
// ב-demo.html אחרי שהוורקר אימת את הלינק). מה הוא עושה:
//   1. פס "מצב תצוגה" קבוע מתחת לסרגל העליון, עם "להצטרפות".
//   2. נעילת המימוש: כפתורי "לקבלת ההטבה/קוד הקופון" → "זמין לחברים בלבד" + הסבר. הלחיצה נתפסת
//      בשלב ה-capture, לפני ה-onclick של הכפתור – כך הקוד/התעודה לא נפתחים בכלל.
//   3. הסתרת כל מה שכותב: לבבות, עריכת פרטים, מחיקת חשבון, התראות, "כתבו לנו", שליחת הודעות.
//   4. בדיקת תוקף בכל טעינת דף (/demo-session ping) – לינק שכובה/פג מנתק גם את מי שכבר בפנים.
// ⚠️ זו שכבת UX. האכיפה האמיתית: firestore.rules (isDemo) + הוורקר (ר' PROJECT_CONTEXT §516–§517).
(function () {
  'use strict';
  var mid = '', info = null;
  try {
    mid = localStorage.getItem('hb_memberId') || '';
    info = JSON.parse(localStorage.getItem('hb_demo') || 'null');
  } catch (e) {}
  if (!/^demo_/.test(mid)) return;
  var root = document.documentElement;
  root.classList.add('yz-demo');

  var JOIN_URL = 'landing.html?guest=1';
  var API_HOSTS = [
    'https://api.yellowzone.co.il',
    'https://habayit-hatsahov.web.app/api',
    'https://habayit-hatsahov-worker.yellowzone.workers.dev',
  ];
  var LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  var EYE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

  var css = document.createElement('style');
  css.textContent =
    '.yz-demo-strip{position:sticky;top:var(--yz-nav-h,0px);z-index:99;background:#0A2A66;color:#fff;padding:9px 14px;display:flex;align-items:center;gap:10px;font-family:Rubik,sans-serif;font-size:12.5px;line-height:1.45}' +
    '.yz-demo-strip .yz-eye{width:26px;height:26px;border-radius:8px;background:rgba(255,212,0,.18);color:#FFD400;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '.yz-demo-strip b{color:#FFD400;font-weight:800}' +
    '.yz-demo-strip a{margin-inline-start:auto;background:#FFD400;color:#0A2A66;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:900;text-decoration:none;white-space:nowrap}' +
    'html.yz-demo .redeem-toggle-btn.yz-locked{display:flex;align-items:center;justify-content:center;gap:8px;background:#F2F2EC;color:#3A4C7A;border:1px dashed #E4E4DC}' +
    // ⚠️ display:flex למעלה דורס את [hidden] (כמו §512) – בלי זה הכפתור נשאר מעל ההסבר
    'html.yz-demo .redeem-toggle-btn.yz-locked[hidden]{display:none}' +
    '.yz-lock-panel{margin-top:12px;background:#FFF7DB;border:1px solid #FFE9A3;border-radius:12px;padding:14px;font-size:13.5px;line-height:1.65;color:#0A2A66}' +
    '.yz-lock-panel b{display:block;font-size:15px;margin-bottom:4px}' +
    '.yz-lock-panel .yz-la{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
    '.yz-lock-panel a,.yz-lock-panel button{border-radius:12px;padding:10px 16px;font:inherit;font-size:14px;font-weight:900;cursor:pointer;text-decoration:none}' +
    '.yz-lock-panel a{background:#FFD400;color:#0A2A66;border:none}' +
    '.yz-lock-panel button{background:#fff;color:#3A4C7A;border:1px solid #E4E4DC;font-weight:700}' +
    // כל מה שכותב או מוביל לפעולה של חבר
    'html.yz-demo .biz-card-like,html.yz-demo .sheet-hero-like,html.yz-demo #glBanner,html.yz-demo #menuPushItem,html.yz-demo #pushCard,html.yz-demo #appleLinkCard,' +
    'html.yz-demo #detailsEditBtn,html.yz-demo #deleteAccountRow,html.yz-demo .fanmsg-option,html.yz-demo #menuShareBizItem,' +
    'html.yz-demo #convRoot [data-cv="newBtn"],html.yz-demo #convRoot [data-cv="new"],html.yz-demo #convRoot [data-cv="reply"],' +
    'html.yz-demo #convRoot [data-cv="closedNew"]{display:none!important}' +
    '.yz-demo-note{font-size:13px;color:#3A4C7A;background:#F2F2EC;border:1.5px dashed #E4E4DC;border-radius:12px;padding:12px;margin:0 0 12px;display:flex;gap:8px;align-items:center;font-family:Rubik,sans-serif}' +
    'html.yz-demo #memberCardEl{position:relative}' +
    '.yz-stamp{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5}' +
    '.yz-stamp span{transform:rotate(-14deg);border:3px solid #0A2A66;color:#0A2A66;font-size:26px;font-weight:900;padding:4px 18px;border-radius:10px;background:rgba(255,255,255,.75);letter-spacing:.04em;font-family:Rubik,sans-serif}';
  (document.head || root).appendChild(css);

  function lockPanelHtml(isCoupon) {
    return '<div class="yz-lock-panel"><b>ההטבה הזאת שמורה לחברי Yellow Zone</b>' +
      'אתם במצב תצוגה – אפשר לראות את כל העסקים וההטבות, אבל ' + (isCoupon ? 'קוד הקופון' : 'תעודת החבר') +
      ' נפתחים רק לחברים רשומים. ההצטרפות חינם ולוקחת דקה.' +
      '<div class="yz-la"><a href="' + JOIN_URL + '">להצטרפות</a><button type="button" data-yz-back>להמשיך לסייר</button></div></div>';
  }

  // ── נעילת המימוש: capture לפני ה-onclick של הכפתור ──
  document.addEventListener('click', function (ev) {
    var back = ev.target.closest && ev.target.closest('[data-yz-back]');
    if (back) {
      var p = back.closest('.yz-lock-panel');
      if (p) { if (p.previousElementSibling) p.previousElementSibling.hidden = false; p.remove(); }
      return;
    }
    var btn = ev.target.closest && ev.target.closest('.redeem-toggle-btn');
    if (!btn) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (btn.nextElementSibling && btn.nextElementSibling.classList.contains('yz-lock-panel')) return;
    var isCoupon = /קופון/.test(btn.getAttribute('data-cta') || btn.textContent) ||
      /sRevealCouponPanel/.test(btn.getAttribute('onclick') || '');
    btn.insertAdjacentHTML('afterend', lockPanelHtml(isCoupon));
    btn.hidden = true;
  }, true);

  function relabel(scope) {
    var list = (scope || document).querySelectorAll('.redeem-toggle-btn:not(.yz-locked)');
    for (var i = 0; i < list.length; i++) {
      list[i].classList.add('yz-locked');
      list[i].innerHTML = LOCK + ' זמין לחברים בלבד';
    }
  }

  function decorate() {
    // פס "מצב תצוגה" – מתחת לסרגל העליון (sticky, כמו הסרגל)
    var nav = document.querySelector('header.top-nav:not([style*="display: none"])') || document.querySelector('header.top-nav');
    if (!document.querySelector('.yz-demo-strip')) {
      var strip = document.createElement('div');
      strip.className = 'yz-demo-strip';
      strip.innerHTML = '<span class="yz-eye">' + EYE + '</span><div><b>מצב תצוגה</b> · ההטבות זמינות לחברי Yellow Zone בלבד</div>' +
        '<a href="' + JOIN_URL + '">להצטרפות</a>';
      if (nav && nav.parentNode) nav.parentNode.insertBefore(strip, nav.nextSibling);
      else document.body.insertBefore(strip, document.body.firstChild);
    }
    var setNavH = function () { if (nav) root.style.setProperty('--yz-nav-h', nav.offsetHeight + 'px'); };
    setNavH(); window.addEventListener('resize', setNavH);

    relabel();
    new MutationObserver(function () {
      relabel();
      var card = document.getElementById('memberCardEl');
      if (card && !card.querySelector('.yz-stamp')) card.insertAdjacentHTML('beforeend', '<div class="yz-stamp"><span>דוגמה</span></div>');
      var cv = document.getElementById('convRoot');
      if (cv && cv.querySelector('[data-cv="list"]') && !cv.querySelector('.yz-demo-note')) {
        var list = cv.querySelector('[data-cv="list"]');
        list.insertAdjacentHTML('afterbegin', '<div class="yz-demo-note">' + LOCK + ' שליחת הודעות לצוות זמינה לחברים בלבד</div>');
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate);
  else decorate();

  // ── תוקף: לינק שכובה/פג/נחסם → ניתוק. כשל רשת = ממשיכים (לא מנתקים אורח בגלל קליטה). ──
  function deviceId() { try { return localStorage.getItem('yz_demo_device') || ''; } catch (e) { return ''; } }
  if (!info || !info.t) { location.replace('demo.html?dead=1'); return; }
  var body = JSON.stringify({ t: info.t, deviceId: deviceId(), ping: true });
  (function tryHost(i) {
    if (i >= API_HOSTS.length) return;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    fetch(API_HOSTS[i] + '/demo-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r.json(); })
      .then(function (d) { if (d && d.error === 'invalid') location.replace('demo.html?dead=1'); })
      .catch(function () { clearTimeout(timer); tryHost(i + 1); });
  })(0);
})();
