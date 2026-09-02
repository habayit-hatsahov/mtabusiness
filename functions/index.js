// ── §374 — הכתובת השלישית: מתווך דק אצל גוגל ────────────────────────────────────────────
//
// **למה זה קיים.** §364 העביר את ה-API מ-`*.workers.dev` ל-`api.yellowzone.co.il` והשאיר את
// הישנה כגיבוי. שתיהן על קלאודפלייר. שובל צרפתי (2.9, 10:31–10:32) נכשל בשתיהן באותה דקה —
// שלוש שורות `loginFail` שכולן נשאו `fb`, כלומר הגיבוי פעל **וגם הוא נפל**. באותן שניות
// בדיוק המכשיר שלו כתב את שורות-הכשל האלה ל-Firestore ונטען את האתר מ-GitHub Pages.
//
// 🔑 המסקנה: **גיבוי חייב להיות ברשת אחרת, לא בשם אחר על אותה רשת.** גוגל היא הרשת היחידה
// שיש עליה הוכחה מהמכשיר החסום עצמו, ולכן הכתובת השלישית יושבת כאן.
//
// ⚠️ **זהו מתווך, לא מימוש שני של לוגיקת-הכניסה.** אין כאן שום ידע על קודים, טלפונים,
// טוקנים או מגבלות — הכל נשאר בוורקר היחיד. שני עותקים של אותה לוגיקה נפרדים תמיד (§353,
// §357), ובנתיב-כניסה זה אומר שני מסלולי-אימות שמתנהגים שונה בלי שאיש שם לב.
//
// ⚠️ **גם CORS נשאר של הוורקר.** ה-OPTIONS מועבר אליו כמו שהוא, וכותרות ההרשאה שהוא מחזיר
// מועברות חזרה — כלומר `ALLOWED_ORIGIN` נשאר מקור-אמת אחד. רשימת-היתר שנייה כאן הייתה
// נסחפת מהראשונה ביום שבו מישהו יוסיף דומיין שם ולא כאן.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

// הסוד שמאפשר לוורקר להאמין לכתובת-הלקוח שאנחנו מעבירים (ר' clientIp ב-worker/src/index.js).
// הרצה: firebase functions:secrets:set PROXY_SECRET  — ואותו ערך בדיוק ב-wrangler secret put.
const PROXY_SECRET = defineSecret('PROXY_SECRET');

// שתי הכתובות של הוורקר, בסדר. מכאן (רשת גוגל) שתיהן נגישות — החסימה של האוהד היא על
// **הנתיב שלו**, לא על הוורקר. הישנה נשארת כאן כדי שהמתווך לא ייפול יחד עם ה-DNS של
// api.yellowzone.co.il: כתובת שלישית שתלויה בכתובת הראשונה אינה כתובת שלישית.
const TARGETS = [
  'https://api.yellowzone.co.il',
  'https://habayit-hatsahov-worker.yellowzone.workers.dev',
];

// רק כותרות שהדפדפן צריך כדי לקבל את התשובה. הכל מגיע מהוורקר, שום ערך לא נקבע כאן.
const PASS_THROUGH = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-max-age',
  'content-type',
  // §383 — בלי זה כל תמונה שעוברת דרך המתווך נמשכת מחדש בכל טעינה. `/view-image` מחזיר
  // `immutable` ארוך, והשמטתו כאן הפכה את נתיב-הגיבוי גם לאיטי וגם ליקר.
  'cache-control',
];

// ⚠️ **הכתובת האמיתית של האוהד — זה מה שמחזיק את מגבלת-הקצב.** בלעדיה הוורקר רואה את ה-IP
// של גוגל לכל מי שעובר כאן, וכולם חולקים מכסה אחת של 30 ניסיונות ל-15 דקות. ב-Google Cloud
// הערך הראשון ב-X-Forwarded-For הוא הלקוח והשאר הם מאזני-העומס.
function clientIp(req) {
  const xff = req.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || req.ip || '';
}

exports.yzApiProxy = onRequest(
  {
    region: 'europe-west1',
    invoker: 'public',
    secrets: [PROXY_SECRET],
    // 40 שנ' — מעל התקרה הקשיחה של הלקוח (35 שנ', HERO_HARD_ABORT_MS ב-welcome.html), כדי
    // שהמתווך לא יהיה הוא זה שחותך בקשה שהלקוח עדיין ממתין לה.
    timeoutSeconds: 40,
    memory: '256MiB',
    // תקרת-עלות: זהו נתיב-גיבוי, לא הנתיב הרגיל. אם הוא פתאום מקבל תנועה גדולה זו תקלה
    // שצריך לראות, לא עומס שצריך לשרת.
    maxInstances: 10,
  },
  async (req, res) => {
    // Firebase Hosting מעביר את הנתיב המלא כולל התחילית. '/api/mint-member-token' → '/mint-member-token'.
    //
    // ── 🐛 §383 — `req.path` בולע את ה-query string ────────────────────────────────────────
    // `req.path` הוא **הנתיב בלבד**: '/api/view-image?url=…' מגיע כאן כ-'/api/view-image',
    // וכל הפרמטרים נעלמים. הוורקר קיבל `/view-image` בלי `url` והחזיר 400
    // ("Invalid or disallowed url") — **בכל בקשת-תמונה, לכל אדם, מאז §374.**
    //
    // 🔑 למה זה שרד חודש בלי שאיש שם לב: כל שאר נתיבי-ה-API הם POST עם גוף JSON, ושם אין
    // query string בכלל. `/view-image` הוא ה-GET-עם-פרמטרים היחיד שעובר כאן — כלומר הבדיקה
    // ש-"המתווך עובד" הייתה נכונה, ופשוט לא נגעה בסוג-הבקשה היחיד ששבור.
    //
    // ⚠️ והמשמעות חמורה מ"תמונה אחת": זו כתובת-המילוט של §374, הרשת היחידה שאינה קלאודפלייר.
    // מי שקלאודפלייר חסום אצלו — בדיוק מי שהכתובת הזאת נועדה לו — **לא ראה שום תמונה באתר**.
    const rawUrl = req.originalUrl || req.url || '/';
    const path = rawUrl.replace(/^\/api(?=[/?]|$)/, '') || '/';

    const headers = {
      'X-YZ-Proxy-Secret': PROXY_SECRET.value(),
      'X-YZ-Client-IP': clientIp(req),
    };
    const ct = req.get('content-type');
    if (ct) headers['Content-Type'] = ct;
    // ה-Origin חייב לעבור: בלעדיו הוורקר לא יודע לאיזה דומיין להחזיר את הרשאת ה-CORS,
    // והדפדפן יחסום את התשובה גם כשהיא תקינה לחלוטין.
    const origin = req.get('origin');
    if (origin) headers['Origin'] = origin;

    let last = null;
    for (const base of TARGETS) {
      try {
        const upstream = await fetch(base + path, {
          method: req.method,
          headers,
          // OPTIONS/GET בלי גוף; POST מעביר את הגוף הגולמי בדיוק כמו שהתקבל, בלי פרסור
          // ובלי סריאליזציה מחדש — כדי שלא נשנה בטעות את מה שהוורקר חותם עליו.
          body: req.method === 'POST' ? (req.rawBody || '') : undefined,
        });

        for (const h of PASS_THROUGH) {
          const v = upstream.headers.get(h);
          if (v) res.set(h, v);
        }
        // ── 🐛 §383 (שני) — `text()` הורס כל תשובה בינארית ─────────────────────────────────
        // גם אחרי תיקון ה-query string, `/view-image` עדיין היה חוזר שבור: `upstream.text()`
        // מפענח את הבייטים כ-UTF-8, וכל בית שאינו רצף UTF-8 תקין מוחלף ב-U+FFFD. ב-JPEG/WEBP
        // זה רוב הקובץ. התוצאה היא תשובת-200 עם `content-type: image/jpeg` שאינה תמונה —
        // כלומר **כשל שקט שנראה כמו הצלחה**, וגרוע מה-400 שהחליף.
        // ⚠️ שני הבאגים חיו באותה פונקציה וחוסמים את אותו נתיב; תיקון אחד מהם לבדו לא היה
        // מחזיר ולו תמונה אחת. ר' §291 — "מנגנון נבדק אך ורק באותו נתיב שבו הוא ירוץ".
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.status(upstream.status).send(buf);
        return;
      } catch (e) {
        // כשל-רשת בלבד מגיע לכאן (סטטוס 4xx/5xx אינו זורק) — ואז מנסים את הכתובת הבאה.
        last = e;
      }
    }

    console.error('§374 proxy — כל כתובות הוורקר נכשלו', last);
    res.status(502).json({ error: 'upstream_unreachable' });
  }
);
