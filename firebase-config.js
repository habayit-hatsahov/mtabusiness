// ── Firebase Configuration — הבית הצהוב ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
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
const db  = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
