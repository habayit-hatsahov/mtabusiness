// ══ §509 — "האזור שלי" שלב 4: סימון "יש חדש" בתפריט, על כפתור התפריט ובפעמון (§473ח) ═════════════
// מספר אחד = עדכונים שלא נקראו (members/{id}/inbox, readAt==null) + שיחות עם תשובה חדשה
// (conversations: lastFrom=='admin' ו-memberReadAt < lastAt). שלושה מקומות נגזרים ממנו — כדי שלא
// יסתרו זה את זה, וכשהכל נקרא שלושתם נעלמים יחד:
//   1. "N חדשים" לבן בפריט "האזור שלי" בתפריט הצד.
//   2. נקודה צהובה על כפתור התפריט (☰) — בלי זה מי שלא פותח את התפריט לא יודע שיש בו משהו.
//   3. פעמון בפס העליון עם המספר, שמוביל ל"עדכונים".
// סקריפט קלאסי (כמו fan-message.js): ה-SDK נטען דינמית, באותה גרסה בדיוק כמו firebase-config.js.
// בדף "האזור שלי" עצמו המודולים מעדכנים חי דרך YZAreaBadge.set(n) — כאן רק הטעינה הראשונה.
// ⚠️ שקט בכשל: סימון שלא נטען = בלי סימון, לא שגיאה למשתמש.
(function () {
  'use strict';
  var FS_URL = 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
  var BELL_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  function memberId() { try { return localStorage.getItem('hb_memberId') || ''; } catch (e) { return ''; } }

  function injectStyle() {
    if (document.getElementById('abStyle')) return;
    var s = document.createElement('style');
    s.id = 'abStyle';
    s.textContent =
      '.yz-menu-count{margin-inline-start:auto;min-width:24px;height:24px;padding:0 9px;border-radius:12px;background:#fff;color:#0A2A66;font-size:12.5px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;box-shadow:0 0 0 1.5px #0A2A66}' +
      '.yz-menu-count[hidden],.yz-hbg-dot[hidden],.yz-bell-n[hidden]{display:none}' +
      '#menuToggle{position:relative}' +
      '.yz-hbg-dot{position:absolute;top:4px;left:4px;width:10px;height:10px;border-radius:50%;background:#FFD400;box-shadow:0 0 0 2px #fff,0 0 0 3px #0A2A66;pointer-events:none}' +
      '.yz-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;color:var(--text,#0A2A66);text-decoration:none;margin-inline-start:4px}' +
      '.yz-bell-n{position:absolute;top:2px;left:2px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#FFD400;color:#0A2A66;font-size:11px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 1.5px #0A2A66}';
    document.head.appendChild(s);
  }

  // מוסיף את שלושת המקומות לדף (פעם אחת). פריט התפריט = הקישור ל-profile.html.
  function mount() {
    injectStyle();
    var links = document.querySelectorAll('a.menu-item[href^="profile.html"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].querySelector('.yz-menu-count')) continue;
      var c = document.createElement('span');
      c.className = 'yz-menu-count'; c.hidden = true;
      links[i].appendChild(c);
    }
    var tog = document.getElementById('menuToggle');
    if (tog && !tog.querySelector('.yz-hbg-dot')) {
      var d = document.createElement('span');
      d.className = 'yz-hbg-dot'; d.hidden = true;
      tog.appendChild(d);
      // הפעמון — ליד כפתור התפריט, רק לחבר מחובר
      var nav = tog.parentNode;
      if (nav && !document.getElementById('yzBell')) {
        var b = document.createElement('a');
        b.id = 'yzBell'; b.className = 'yz-bell'; b.href = 'profile.html?tab=msgs';
        b.setAttribute('aria-label', 'עדכונים'); b.title = 'עדכונים';
        b.innerHTML = BELL_SVG + '<span class="yz-bell-n" hidden></span>';
        nav.insertBefore(b, tog.nextSibling);
      }
    }
  }

  function set(n) {
    n = Math.max(0, n | 0);
    var cs = document.querySelectorAll('.yz-menu-count');
    for (var i = 0; i < cs.length; i++) { cs[i].hidden = !n; cs[i].textContent = n === 1 ? 'חדש אחד' : n + ' חדשים'; }
    var d = document.querySelector('.yz-hbg-dot'); if (d) d.hidden = !n;
    var b = document.querySelector('.yz-bell-n'); if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); }
    var bell = document.getElementById('yzBell');
    if (bell) bell.setAttribute('aria-label', n ? 'עדכונים – ' + n + ' חדשים' : 'עדכונים');
  }

  async function load() {
    try {
      var mods = await Promise.all([import('./firebase-config.js'), import(FS_URL)]);
      var cfg = mods[0], fs = mods[1];
      if (cfg.auth.authStateReady) await cfg.auth.authStateReady();
      var uid = cfg.auth.currentUser && cfg.auth.currentUser.uid;
      if (!uid || uid !== memberId()) return;
      var res = await Promise.all([
        fs.getCountFromServer(fs.query(fs.collection(cfg.db, 'members', uid, 'inbox'), fs.where('readAt', '==', null))),
        fs.getDocs(fs.query(fs.collection(cfg.db, 'conversations'), fs.where('memberId', '==', uid))),
      ]);
      var ms = function (t) { return t && t.toMillis ? t.toMillis() : 0; };
      var conv = 0;
      res[1].forEach(function (d) {
        var c = d.data();
        if (c.lastFrom === 'admin' && (!c.memberReadAt || ms(c.memberReadAt) < ms(c.lastAt))) conv++;
      });
      if (!window.YZAreaBadge._live) set(res[0].data().count + conv);
    } catch (e) {
      console.debug('area badge load failed', e && (e.code || e.message));
    }
  }

  window.YZAreaBadge = { set: function (n) { window.YZAreaBadge._live = true; set(n); }, _live: false };

  function init() {
    if (!memberId()) return;   // אורח — אין אזור, אין סימון
    mount();
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
