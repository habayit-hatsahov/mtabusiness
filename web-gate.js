// ── §497 — סגירת השימוש באתר לאוהדים (§484: "אני רוצה שלא יהיה אתר, השימוש רק דרך האפליקציה") ──
// נטען בדפים הפנימיים של אוהדים: home.html, profile.html, fan-register.html.
// בדפדפן (לא באפליקציה):
//   • לא מחובר (אין hb_memberId)          → landing.html מיד.
//   • מחובר: נקראת רשומת החבר (מותר לקרוא את עצמך) —
//       מנהל (isAdmin)                         → נשאר (פטור, §484.6);
//       בעל עסק מאושר                          → business-dashboard.html של העסק שלו (§497ב — לא האינדקס);
//       אוהד / בעל עסק שעדיין לא אושר          → landing.html (שם: באנר "הכול עבר לאפליקציה").
// באפליקציה — שום דבר: האפליקציה טוענת את אותו אתר, וזה המקום שבו אוהדים כן משתמשים בו.
//
// ⚠️ ההסתרה עצמה (html.yz-gate) נקבעת בסקריפט inline קטן ב-<head> של כל דף, לפני שמשהו מצויר —
//    מודול רץ מאוחר מדי ואוהד היה רואה הבהוב של האינדקס. הקובץ הזה רק מכריע ומסיר.
// ⚠️ fail-open: כשל או חוסר-תשובה תוך 6 שנ' → הדף נפתח. מנהל שננעל בחוץ בגלל רשת איטית גרוע
//    מאוהד שרואה את האינדקס בדפדפן פעם אחת.
// ⚠️ בתוך iframe (מודאל ההרשמה ב-welcome.html) — לא מפנים: הפניית ה-iframe בלבד הייתה מכניסה דף
//    נחיתה שלם לתוך חלון קטן.
import { db, auth } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';

const root = document.documentElement;
const open = () => root.classList.remove('yz-gate');
const toLanding = () => location.replace('landing.html');

(async () => {
  if (!root.classList.contains('yz-gate')) return;   // הסקריפט ב-head החליט שאין מה לבדוק (אפליקציה / iframe)
  let mid = '';
  try { mid = localStorage.getItem('hb_memberId') || ''; } catch (e) {}
  if (!mid) return toLanding();

  const failsafe = setTimeout(open, 6000);
  try {
    const user = await new Promise((res) => {
      const off = onAuthStateChanged(auth, (u) => { off(); res(u); });
      setTimeout(() => res(undefined), 5000);
    });
    if (user === undefined) { clearTimeout(failsafe); return open(); }   // auth לא ענה — fail-open
    if (!user || user.uid !== mid) { clearTimeout(failsafe); return toLanding(); }
    const snap = await getDoc(doc(db, 'members', mid));
    const m = snap.exists() ? snap.data() : null;
    clearTimeout(failsafe);
    if (m && m.isAdmin === true) return open();
    // §497ב — רמי: "בעל עסק לא צריך להישאר באינדקס, יש לו קישור לאזור של העסק שלו וזהו".
    // אותה דרך בדיוק כמו "העסק שלי" ב-home.html (initBizNavItem): עסק מאושר → הטוקן מ-bizTokens
    // → דשבורד העסק. עסק שלא אושר / בלי טוקן / כשל בקריאה → כמו אוהד (דף הנחיתה).
    if (m && m.isBusinessOwner === true && m.linkedBusinessId) {
      try {
        const biz = await getDoc(doc(db, 'businesses', m.linkedBusinessId));
        if (biz.exists() && biz.data().status === 'approved') {
          const tok = await getDoc(doc(db, 'bizTokens', m.linkedBusinessId));
          const token = tok.exists() ? (tok.data().accessToken || '') : '';
          if (token) return location.replace('business-dashboard.html?token=' + encodeURIComponent(token));
        }
      } catch (e) { console.warn('web-gate: business lookup failed', e); }
      return toLanding();
    }
    return toLanding();
  } catch (e) {
    // fail-open רק כאן — כשלא ידוע אם זה מנהל. מנהל שננעל בחוץ גרוע מאוהד שרואה את האינדקס פעם אחת.
    console.warn('web-gate: check failed — opening (fail-open)', e);
    clearTimeout(failsafe);
    open();
  }
})();
