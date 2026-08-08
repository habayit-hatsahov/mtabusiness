// ── Firebase Configuration — Yellow Zone ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
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
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
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
