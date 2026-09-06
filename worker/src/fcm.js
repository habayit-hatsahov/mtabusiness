// ══════════════════════════════════════════════════════════════════════════════════════════
//  fcm.js — שליחת פוש נייטיב דרך FCM HTTP v1  (§420ג)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  ⚠️ **קובץ נפרד מ-push.js בכוונה, ולא הרחבה שלו.** שניהם "שולחים התראה", ושם הדמיון
//  נגמר: `push.js` הוא Web Push (VAPID, הצפנה מקצה-לקצה, endpoint לכל דפדפן), וכאן זה
//  FCM (OAuth2 של service account, טוקן לכל התקנה). מיזוגם לפונקציה אחת עם דגל היה מייצר
//  בדיוק את המצב שבו תיקון בערוץ אחד שובר בשקט את השני.
//
//  🔑 **שני הערוצים חיים במקביל ואינם מחליפים זה את זה** — אותו אדם יכול להיות רשום גם
//  בדפדפן במחשב וגם באפליקציה בטלפון.
//
//  ⚠️ **ה-scope חייב לכלול `firebase.messaging`** (נוסף ב-jwt.js §420ג, יחד עם באמפ מפתח
//  המטמון). בלעדיו התשובה כאן היא 403 שאינו מזכיר scope במילה.
// ══════════════════════════════════════════════════════════════════════════════════════════

const FCM_ENDPOINT = (projectId) =>
  `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

// ── שליחה לטוקן בודד ──────────────────────────────────────────────────────────────────────
//  מחזיר { ok, dead, status, error }.
//
//  🔑 **`dead` הוא ההבחנה שכל הניקוי נשען עליה, והיא אינה "נכשל".** טוקן שאינו רשום עוד
//  (המשתמש הסיר את האפליקציה, ניקה נתונים, או שהטוקן הוחלף) מחזיר UNREGISTERED/404 —
//  ואותו **חייבים למחוק**, אחרת מפת הטוקנים מתמלאת מכשירים שאינם קיימים והשליחה הבאה
//  מבזבזת עליהם קריאה. לעומת זאת כשל רשת או 500 הם זמניים, ומחיקה עליהם הייתה מוחקת
//  מכשיר חי בגלל תקלה חולפת. ר' אותה הבחנה בדיוק ב-push.js (404/410).
export async function sendFcmToToken(env, accessToken, token, { title, body, data, link }) {
  const message = {
    message: {
      token,
      notification: { title, body },
      // ⚠️ ערכי data חייבים להיות **מחרוזות** ב-FCM. מספר או boolean מחזירים
      // INVALID_ARGUMENT, והשגיאה מצביעה על ההודעה כולה ולא על השדה.
      data: Object.fromEntries(
        Object.entries(data || {}).map(([k, v]) => [k, String(v == null ? '' : v)])
      ),
      android: {
        priority: 'high',
        notification: {
          // ⚠️ שם הערוץ חייב להיות זהה למה שהאפליקציה יוצרת, אחרת אנדרואיד 8+
          // מפיל את ההודעה בשקט. ברירת המחדל של תוסף Capacitor היא הערוץ הכללי,
          // ולכן לא נקבע כאן ערוץ מפורש עד שניצור אחד משלנו.
          sound: 'default',
          ...(link ? { click_action: link } : {}),
        },
      },
    },
  };

  let resp;
  try {
    resp = await fetch(FCM_ENDPOINT(env.FIREBASE_PROJECT_ID), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  } catch (e) {
    // כשל רשת — זמני מעצם טבעו. **לא** מסומן dead.
    return { ok: false, dead: false, status: 0, error: String((e && e.message) || e) };
  }

  if (resp.ok) return { ok: true, dead: false, status: resp.status };

  const text = await resp.text();
  // UNREGISTERED (404) ו-INVALID_ARGUMENT על השדה token (400) הם השניים שמצדיקים מחיקה.
  // 🔑 הבדיקה היא על גוף התשובה ולא על הקוד לבדו: 400 מוחזר גם על הודעה פגומה משלנו,
  // ומחיקת טוקן בגלל **הבאג שלנו** הייתה מוחקת מכשירים חיים בכל שליחה שגויה.
  const dead =
    resp.status === 404 ||
    /UNREGISTERED|NOT_FOUND/i.test(text) ||
    (resp.status === 400 && /"token"|registration token|INVALID_ARGUMENT.*token/i.test(text));

  return { ok: false, dead, status: resp.status, error: text.slice(0, 400) };
}

// ── שליחה לכל המכשירים של נמען אחד ────────────────────────────────────────────────────────
//  tokensMap — המפה כפי שהיא על מסמך החבר (`nativePushTokens`), ממופה לפי מזהה-התקנה.
//  מחזיר { sent, failed, deadKeys } — deadKeys הוא מה שהקורא צריך למחוק מהמפה.
//
//  ⚠️ **הפונקציה אינה כותבת ל-Firestore בעצמה.** הניקוי הוא כתיבה, וכתיבה מתוך פונקציית
//  שליחה פירושה שכל קורא עתידי יעשה אותה בלי לדעת. הקורא היחיד (index.js) מנקה במפורש.
export async function sendFcmToMember(env, accessToken, tokensMap, payload) {
  const entries = Object.entries(tokensMap || {});
  const deadKeys = [];
  let sent = 0, failed = 0;
  const results = [];

  for (const [key, entry] of entries) {
    const token = entry && (entry.token || entry.value);
    if (!token) { deadKeys.push(key); continue; }
    const r = await sendFcmToToken(env, accessToken, token, payload);
    if (r.ok) sent++;
    else {
      failed++;
      if (r.dead) deadKeys.push(key);
    }
    results.push({ key, ok: r.ok, dead: r.dead, status: r.status, error: r.error });
  }

  return { sent, failed, deadKeys, results };
}
