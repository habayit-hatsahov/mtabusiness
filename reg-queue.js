// ══ §760 — הרשמה שנשמרת בטלפון ונשלחת כשחוזרת קליטה ═══════════════════════════════════════
// רמי (9.11): במשחקים פונים לאוהדים שיירשמו – ובאצטדיון אין קליטה. עד היום שליחה שלא עברה
// נגמרה ב"נסו שוב", ומי שסגר את האפליקציה איבד את ההרשמה (והתמונה – קבצים לא נשמרים בטיוטה).
// עכשיו fan-register.html שומר כאן את ההרשמה המוכנה (כולל תמונת האימות הדחוסה), ומכל דף שטוען
// את הקובץ הזה (fan-register / welcome / landing) היא נשלחת לבד ברגע שיש רשת.
//
// 🔑 **אין כפילות:** המזהה (memberId) נוצר בטופס ונשמר עם ההרשמה. /submit-member בוורקר יוצר
// רק-אם-לא-קיים (שליחה כפולה → created:false, ok), ובודק בעצמו טלפון/מייל של רשומה פעילה
// (already_registered). לכן גם שני דפים ששולחים בבת אחת, או setDoc ישן של Firestore שהסתנכרן
// באיחור, לא יוצרים רשומה שנייה.
// 🔑 **רק דרך הוורקר**: ה-SDK של Firestore מחזיק כתיבה שלא אושרה בזיכרון בלבד – היא נעלמת
// כשסוגרים את האפליקציה. כאן הכול fetch רגיל, שנכשל מהר ומנסים שוב.
// ⚠️ התמונה נשמרת כ-ArrayBuffer ולא כ-Blob: Blob בתוך IndexedDB היה שבור בגרסאות WebKit ישנות.
// ⚠️ 7 ימים (רמי, 9.11). אחרי זה ההרשמה השמורה נמחקת ולא נשלחת; הטיוטה של הטופס נשארת,
// ו"ההרשמה שלכם מחכה" (§639) מזמין להשלים.
(function () {
  if (window.YZRegQueue) return;
  var DB = 'yz-reg-queue', STORE = 'pending', KEY = 'fan';
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  var LOCK_KEY = 'yz_rq_lock', LOCK_MS = 60000;
  var HOSTS = [
    'https://api.yellowzone.co.il',
    'https://habayit-hatsahov.web.app/api',
    'https://habayit-hatsahov-worker.yellowzone.workers.dev',
  ];

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out;
        var r = fn(st);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { db.close(); resolve(out); };
        t.onerror = t.onabort = function () { db.close(); reject(t.error); };
      });
    });
  }
  function get() { return tx('readonly', function (st) { return st.get(KEY); }).catch(function () { return null; }); }
  function put(rec) { return tx('readwrite', function (st) { return st.put(rec, KEY); }); }
  function clear() { return tx('readwrite', function (st) { return st.delete(KEY); }).catch(function () {}); }

  // fetch עם גבול-זמן לכל כתובת, אותו סדר כתובות כמו בטופס. רק כשל-רשת מקדם לכתובת הבאה.
  function apiFetch(path, makeOpts, perHostMs) {
    var i = 0;
    function next() {
      var ac = new AbortController();
      var t = setTimeout(function () { ac.abort(); }, perHostMs);
      var opts = makeOpts(); opts.signal = ac.signal;
      return fetch(HOSTS[i] + path, opts).then(function (r) { clearTimeout(t); return r; }, function (e) {
        clearTimeout(t);
        if (++i >= HOSTS.length) throw e;
        return next();
      });
    }
    return next();
  }

  function takeLock() {
    try {
      var v = +localStorage.getItem(LOCK_KEY) || 0;
      if (Date.now() - v < LOCK_MS) return false;
      localStorage.setItem(LOCK_KEY, String(Date.now()));
    } catch (e) {}
    return true;
  }
  function dropLock() { try { localStorage.removeItem(LOCK_KEY); } catch (e) {} }

  var busy = false;
  // flush({ log }) → { status: 'none' | 'busy' | 'sent' | 'dup' | 'network' | 'failed' | 'expired', rec }
  // log(type, extra) – אירוע מדידה של הדף (logEvent), רשות.
  function flush(opts) {
    opts = opts || {};
    var log = typeof opts.log === 'function' ? opts.log : function () {};
    if (busy) return Promise.resolve({ status: 'busy' });
    busy = true;
    return get().then(function (rec) {
      if (!rec || !rec.memberId || !rec.data) return { status: 'none' };
      if (Date.now() - (rec.queuedAt || 0) > MAX_AGE_MS) {
        log('formStep', { blockId: 'fanRegister', channel: 'queueExpired', memberId: rec.memberId });
        return clear().then(function () { return { status: 'expired', rec: rec }; });
      }
      if (!takeLock()) return { status: 'busy' };
      var mins = Math.round((Date.now() - rec.queuedAt) / 60000);
      // 1) התמונה, אם עוד לא עלתה. כתובת שחזרה נשמרת מיד – ניסיון הבא לא מעלה שוב.
      var step = Promise.resolve();
      if (rec.proof && !rec.data.photoProofUrl) {
        step = apiFetch('/upload-member-proof', function () {
          var fd = new FormData();
          fd.append('memberId', rec.memberId);
          fd.append('file', new Blob([rec.proof], { type: rec.proofType || 'image/jpeg' }), 'proof');
          return { method: 'POST', body: fd };
        }, 25000).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
          if (j && j.ok && j.url) {
            rec.data.photoProofUrl = j.url; rec.proof = null;
            return put(rec).catch(function () {});
          }
          // תמונה שהוורקר דחה (לא תמונה / גדולה מדי) – ההרשמה עדיין שווה יותר מהתמונה (§292)
          if (j && j.error && j.error !== 'too_many_attempts' && j.error !== 'upload_failed') {
            log('formError', { blockId: 'fanRegister', channel: ('queueProof:' + j.error).slice(0, 50), memberId: rec.memberId });
            rec.proof = null;
            return;
          }
          throw Object.assign(new Error('proof ' + ((j && j.error) || 'failed')), { net: true });
        });
      }
      // 2) הרשומה עצמה
      return step.then(function () {
        return apiFetch('/submit-member', function () {
          return { method: 'POST', headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ memberId: rec.memberId, data: rec.data }) };
        }, 12000);
      }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
        if (j && j.ok) {
          try {
            if (rec.ticket) localStorage.setItem('yz_reg', JSON.stringify({ memberId: rec.memberId, ticket: rec.ticket, name: (rec.name || '').slice(0, 40), t: Date.now() }));
            localStorage.removeItem('_hb_regDraft');
          } catch (e) {}
          log('formSubmit', { blockId: 'fanRegister', memberId: rec.memberId });
          log('formStep', { blockId: 'fanRegister', channel: ('queueSent:' + mins + 'm' + (rec.data.photoProofUrl ? '' : ':noPhoto')).slice(0, 50), memberId: rec.memberId });
          return clear().then(function () { return { status: 'sent', rec: rec }; });
        }
        if (j && j.error === 'already_registered') {
          log('formError', { blockId: 'fanRegister', channel: 'queueDup', memberId: rec.memberId });
          return clear().then(function () { return { status: 'dup', rec: rec }; });
        }
        if (j && j.error && j.error !== 'too_many_attempts') {
          // דחייה אמיתית (שדה פסול וכו') – ניסיון חוזר לא יעזור. הטיוטה נשארת, אפשר לשלוח מהטופס.
          log('formError', { blockId: 'fanRegister', channel: ('queueFail:' + j.error).slice(0, 50), memberId: rec.memberId });
          return clear().then(function () { return { status: 'failed', rec: rec, error: j.error }; });
        }
        return { status: 'network', rec: rec };
      });
    }).catch(function () {
      return { status: 'network' };
    }).then(function (res) {
      if (res.status !== 'busy') dropLock();
      busy = false;
      return res;
    });
  }

  window.YZRegQueue = {
    save: function (rec) { rec.queuedAt = rec.queuedAt || Date.now(); return put(rec); },
    get: get,
    clear: clear,
    flush: flush,
    // הרצה אוטומטית בדף: עכשיו, כשהרשת חוזרת, וכשחוזרים לאפליקציה. onDone(res) רק כשמשהו קרה.
    auto: function (opts) {
      opts = opts || {};
      function run() {
        flush(opts).then(function (res) {
          if (res.status !== 'none' && res.status !== 'busy' && res.status !== 'network' && opts.onDone) opts.onDone(res);
        });
      }
      run();
      window.addEventListener('online', run);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') run(); });
      return run;
    },
  };
})();
