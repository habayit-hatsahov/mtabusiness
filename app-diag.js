// ══ §466 — אבחון: דף הבית נתקע אחרי כניסה, באפליקציה בלבד (iOS 27) ══════════════════════
// נמדד 5.10: באפליקציה על iOS 27, אחרי כניסה מחלון הכניסה, דף הבית לא קיבל שום נתון מ-Firestore
// ולא שלח אף אירוע (2 מתוך 2). פתיחה מחדש של האפליקציה שחררה. ב-Safari באותו אייפון — תקין.
// לא ידוע **מה** נתקע: ההתחברות (onAuthStateChanged / getIdToken) או Firestore עצמו (רשת / IndexedDB /
// תיאום-הלשוניות של persistentMultipleTabManager). הקובץ הזה עונה על זה, ותו לא.
//
// 🔑 **הדוח יוצא דרך הוורקר ב-fetch, לא דרך Firestore** — Firestore הוא החשוד, ודוח שנשלח דרכו
// היה נתקע בדיוק במקרה שאנחנו מחפשים.
// 🔑 **סקריפט קלאסי שנטען לפני המודול** — אם המודול של home.html חסום (await ברמת-המודול, §322),
// הסימונים ממנו פשוט לא יופיעו, וזה עצמו מידע. הדוח לא תלוי בו.
// ⚠️ רץ **רק באפליקציה** (YellowZoneApp ב-user-agent). זמני — להסיר אחרי שהשורש נמצא.
(function () {
  'use strict';
  var IN_APP = /YellowZoneApp/i.test(navigator.userAgent || '');
  var t0 = Date.now();
  var marks = {};
  // הסימון הראשון בלבד נשמר לכל שם (חוץ מאלה שמסתיימים ב-'+' — הם נצברים), עם זמן יחסי לטעינה.
  window.hbDiagMark = function (name, val) {
    try {
      var entry = { t: Date.now() - t0 };
      if (val !== undefined) entry.v = val;
      if (/\+$/.test(name)) { (marks[name] = marks[name] || []).push(entry); return; }
      if (!(name in marks)) marks[name] = entry;
    } catch (_) {}
  };
  if (!IN_APP) return;

  var HOSTS = [
    'https://api.yellowzone.co.il',
    'https://habayit-hatsahov.web.app/api',
    'https://habayit-hatsahov-worker.yellowzone.workers.dev',
  ];
  function withTimeout(p, ms, label) {
    return Promise.race([p, new Promise(function (r) { setTimeout(function () { r({ timeout: label || true }); }, ms); })]);
  }
  function post(body) {
    var i = 0;
    function next() {
      if (i >= HOSTS.length) return Promise.resolve();
      var host = HOSTS[i++];
      return withTimeout(fetch(host + '/app-diag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true,
      }).then(function (r) { return r.ok ? 'ok' : 'http' + r.status; }), 4000, 'post')
        .then(function (res) { if (res !== 'ok') return next(); }, next);
    }
    return next();
  }

  // ── בדיקות עצמאיות, שאינן תלויות ב-SDK ──
  // IndexedDB: פתיחת מסד נפרד וכתיבה אחת. אם זה נתקע — הבעיה ב-WebKit, לא ב-Firebase.
  function probeIdb() {
    return withTimeout(new Promise(function (resolve) {
      try {
        var req = indexedDB.open('hb_diag_probe', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('s'); };
        req.onerror = function () { resolve('openErr:' + (req.error && req.error.name)); };
        req.onblocked = function () { resolve('blocked'); };
        req.onsuccess = function () {
          try {
            var db = req.result, tx = db.transaction('s', 'readwrite');
            tx.objectStore('s').put(Date.now(), 'k');
            tx.oncomplete = function () { db.close(); resolve('ok'); };
            tx.onerror = function () { resolve('txErr'); };
          } catch (e) { resolve('txThrow:' + e.name); }
        };
      } catch (e) { resolve('throw:' + e.name); }
    }), 3000, 'idb');
  }
  // רשת אל Firestore בלי ה-SDK: שאילתה פומבית אחת ב-REST. אם זה עובר והSDK תקוע — הבעיה ב-SDK.
  function probeRest() {
    var url = 'https://firestore.googleapis.com/v1/projects/habayit-hatsahov/databases/(default)/documents:runQuery?key=AIzaSyBfG7AU4BzSAbBpwPyKfA_NzUpy2pxzFu8';
    var q = { structuredQuery: { from: [{ collectionId: 'businesses' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } }, limit: 1 } };
    var s = Date.now();
    return withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) })
      .then(function (r) { return 'http' + r.status + ':' + (Date.now() - s) + 'ms'; }, function (e) { return 'err:' + (e && e.name); }), 5000, 'rest');
  }
  // מצב תיאום-הלשוניות של Firestore נשמר ב-localStorage (firestore_*): מי ה-primary, אילו לקוחות.
  function firestoreLs() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^firestore/i.test(k)) out[k.slice(0, 90)] = String(localStorage.getItem(k) || '').slice(0, 160);
      }
    } catch (e) { out.err = String(e && e.name); }
    return out;
  }

  var pendingLogin = false;
  try { pendingLogin = !!sessionStorage.getItem('hb_pending_loginOk'); } catch (_) {}
  var ref = '';
  try { ref = document.referrer ? new URL(document.referrer).pathname : ''; } catch (_) {}
  var navType = '';
  try { navType = (performance.getEntriesByType('navigation')[0] || {}).type || ''; } catch (_) {}

  function snapshot(kind) {
    return Promise.all([probeIdb(), probeRest()]).then(function (p) {
      var auth = window._auth;
      return post({
        sid: (function () { try { return sessionStorage.getItem('hb_session_id') || ''; } catch (_) { return ''; } })(),
        kind: kind,
        payload: {
          path: location.pathname, ref: ref, navType: navType, pendingLogin: pendingLogin,
          t: Date.now() - t0, onLine: navigator.onLine, vis: document.visibilityState,
          authCurrent: auth ? !!auth.currentUser : 'noAuthObj',
          memberIdLs: (function () { try { return !!localStorage.getItem('hb_memberId'); } catch (_) { return 'err'; } })(),
          waitingData: !!window._hbWaitingData,
          canReveal: (function () { try { return window._hbCanReveal ? window._hbCanReveal() : 'na'; } catch (_) { return 'err'; } })(),
          splash: (function () { var el = document.getElementById('hbSplash'); return el ? el.className : 'gone'; })(),
          marks: marks, idb: p[0], rest: p[1], fsLs: firestoreLs(),
        },
      });
    });
  }

  // דוח אחד אחרי 8 שניות בכל טעינה באפליקציה (גם תקינה — להשוואה), ודוח נוסף אחרי 25 שנ'
  // רק אם הדף עדיין מחכה לנתונים.
  setTimeout(function () { snapshot('t8'); }, 8000);
  setTimeout(function () {
    var ready = false;
    try { ready = window._hbCanReveal ? window._hbCanReveal() : false; } catch (_) {}
    if (!ready || window._hbWaitingData) snapshot('t25');
  }, 25000);
})();
