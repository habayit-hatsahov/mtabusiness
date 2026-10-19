// §550 — נוסחי השיתוף (וואטסאפ / "שיתוף" של המכשיר) נערכים במרכז הניהול ← תבניות ← הודעות שיתוף,
// ונשמרים ב-settings/siteTexts (shareAppText / shareBizText; קריאה ציבורית, כמו מסכי ההצלחה).
// window.yzShareText('app') / yzShareText('biz' | 'mybiz', שם העסק) מחזיר את הנוסח השמור, או null –
// ואז הדף משתמש בנוסח שכתוב בו (ברירת המחדל). הקישור עצמו לא כאן: הדף מוסיף אותו בסוף, כדי שלא יישבר.
// ⚠️ סקריפט קלאסי (לא module) – נטען לפני הסקריפטים של הדף ולא נחסם אם Firestore איטי (§322/§431).
(function () {
  var T = {};
  // §551 — 'mybiz' = בעל העסק משתף את העסק שלו ("תעשו לי לייק"); 'biz' = אוהד משתף עסק אחר
  var KEY = { app: 'shareAppText', biz: 'shareBizText', mybiz: 'shareMyBizText' };
  window.yzShareText = function (kind, name) {
    var s = T[KEY[kind] || KEY.app];
    if (typeof s !== 'string' || !s.trim()) return null;
    return kind === 'app' ? s : s.split('{business}').join(name || '');
  };
  import('./firebase-config.js').then(function (m) {
    return import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js').then(function (fs) {
      return fs.getDoc(fs.doc(m.db, 'settings', 'siteTexts'));
    });
  }).then(function (snap) {
    if (!snap.exists()) return;
    var d = snap.data();
    T.shareAppText = d.shareAppText;
    T.shareBizText = d.shareBizText;
    T.shareMyBizText = d.shareMyBizText;
  }).catch(function (e) { console.warn('נוסחי השיתוף לא נטענו – משתמשים בברירת המחדל:', e && e.message); });
})();
