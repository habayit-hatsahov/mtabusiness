// ── Firebase Configuration — Yellow Zone ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBfG7AU4BzSAbBpwPyKfA_NzUpy2pxzFu8",
  authDomain:        "habayit-hatsahov.firebaseapp.com",
  projectId:         "habayit-hatsahov",
  storageBucket:     "habayit-hatsahov.firebasestorage.app",
  messagingSenderId: "459607487972",
  appId:             "1:459607487972:web:36ebe479e7a4e3a7bd43f1"
};

const app = initializeApp(firebaseConfig);

// מטמון מקומי מתמיד (IndexedDB) — ביקור חוזר באפליקציה מקבל onSnapshot ראשוני מיידי מתוך
// המכשיר עצמו (בלי לחכות לרשת) ומתעדכן ברקע ברגע שהנתונים האמיתיים חוזרים משרת. משפיע בעיקר
// על מסך-הפתיחה (splash/skeleton) בפתיחות חוזרות של האפליקציה המותקנת — לא על ההתקנה הראשונה
// (אין עדיין כלום במטמון). נופל בבטחה ל-getFirestore הרגיל אם האתחול נכשל (למשל דפדפן ישן/
// פרטי בלי IndexedDB) כדי שלא יישבר שום דבר.
//
// ══ §466 — 🔴 באפליקציה (אנדרואיד + iOS): מטמון בזיכרון בלבד ═══════════════════════════════
// נמדד 5.10 על iOS 27 (app-diag.js): אחרי כניסה, דף הבית קיבל Firestore **תקוע לגמרי** —
// `getDocFromServer` התחיל ולא חזר, ו-onSnapshot של העסקים לא ירה **אפילו מהמטמון**. באותו רגע
// ההתחברות תקינה (0.4 שנ'), שאילתת REST ישירה ל-Firestore חזרה 200 תוך 0.6 שנ', ו-IndexedDB נפרד
// עבד. ב-localStorage: חלון הכניסה נשאר רשום `firestore_zombie_…`, ולדף הבית לא נרשם לקוח
// בכלל — כלומר ה-SDK נתקע באתחול המטמון המתמיד, אחרי הניווט מדף שזה עתה התחבר. 2 מתוך 2 כניסות;
// פתיחה מחדש של האפליקציה שחררה. ב-Safari באותו אייפון — תקין.
// 🔑 **לכן באפליקציה מוותרים על המנגנון כולו ולא עוקפים אותו:** יש בה תמיד דף אחד, כך שתיאום-
// הלשוניות ממילא לא נחוץ, והפתיחה המהירה נשענת בפועל על המטמונים ב-localStorage של כל דף
// (hb_businesses_cache, hb_greeting_cache וכו'), לא על המטמון של Firestore.
// ⚠️ **בדפדפן — ללא שינוי** (שם זה עובד, ושם יש באמת כמה לשוניות). ⚠️ זהה לזיהוי ב-app-banner.js.
const HB_IN_APP = /YellowZoneApp/i.test((typeof navigator !== 'undefined' && navigator.userAgent) || '');
let db;
try {
  db = initializeFirestore(app, {
    localCache: HB_IN_APP
      ? memoryLocalCache()
      : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  console.error('Firestore persistent cache init failed, falling back to memory cache:', e);
  db = getFirestore(app);
}

const auth = getAuth(app);

// Storage נטען רק בדפים שבאמת מעלים קבצים (dynamic import) —
// כך home.html/terms.html וכו' לא מורידים 46KB מיותרים בכל טעינה
let _storage = null;
async function getStorageLazy() {
  if (!_storage) {
    const { getStorage } = await import("https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js");
    _storage = getStorage(app);
  }
  return _storage;
}

export { db, auth, getStorageLazy, firebaseConfig };
