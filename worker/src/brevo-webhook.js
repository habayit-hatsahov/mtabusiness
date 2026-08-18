// ── Webhook מסירה של Brevo ──────────────────────────────────────────────────────────────────
// למה זה קיים: `ownerEmailStatus:'sent'` אומר רק ש-Brevo *קיבל* מאיתנו את הבקשה — לא שהמייל הגיע
// לתיבה של מישהו. Brevo יודע את האמת תוך שניות (נמסר / חזר / נחסם), פשוט לא סיפר לנו. ה-endpoint
// הזה מקבל ממנו את האירועים וכותב אותם על מסמך העסק/החבר, כדי שבדשבורד יופיע "נמסר בפועל" או
// "חזר — הכתובת לא קיימת" במקום ניחוש. ר' docs/PROJECT_CONTEXT.md §205.
//
// ⚠️ מה זה *לא* פותר: דומיין typo-squatting כמו gamil.com מקבל את המייל ומחזיר "delivered" —
// הוא באמת נמסר, רק לא לנמען הנכון. בשביל זה יש את בדיקת-הדומיין (email-domain-check.js, §203).
//
// אימות: Brevo לא יודע לשלוח headers מותאמים ל-webhook, רק URL — לכן הסוד יושב ב-query string
// (?key=...), בדיוק כמו שהתיעוד שלהם ממליץ. זה לא סוד-משתמש ולא מידע אישי, רק מפתח-קריאה לשירות.
import { getGoogleAccessToken } from './jwt.js';
import { firestoreRunQuery, firestorePatch } from './firestore.js';

// מיפוי שמות-האירועים של Brevo למילון פנימי אחד. אירוע שלא ברשימה (request/unsubscribed וכו')
// לא מעניין אותנו כאן ופשוט מדולג — לא שגיאה.
const EVENT_STATUS = {
  delivered: 'delivered',
  hard_bounce: 'bounced',
  soft_bounce: 'bounced_soft',
  blocked: 'blocked',
  spam: 'spam',
  invalid_email: 'invalid',
  error: 'error',
};

// ── אירועי מגע (§206) ────────────────────────────────────────────────────────────────────────
// למה אלה נשמרים בשדות *נפרדים* ולא כערך נוסף ב-EVENT_STATUS: "נמסר" ו"נפתח" הן שתי עובדות שונות
// שיכולות להתקיים יחד, ואם 'opened' היה דורס את ownerEmailDelivery היינו מאבדים את סטטוס-המסירה
// (ובכיוון ההפוך, אירוע spam שמגיע אחרי פתיחה היה מוחק את הראיה שהמייל כן הגיע).
//
// זו ההוכחה החיובית היחידה שיש לנו שהמייל הגיע לבן-אדם ולא רק לשרת — ובדיוק היא שחסרה במקרה
// "יעדים לוגיסטיים" (2026-08-17), שבו delivered לבדו נראה כמו "הכול תקין".
// ⚠️ אי-פתיחה אינה ראיה הפוכה: המדידה היא פיקסל-תמונה, ו-Outlook/M365 חוסמים תמונות כברירת מחדל.
const EVENT_TOUCH_FIELD = {
  opened: 'Opened',
  unique_opened: 'Opened',
  click: 'Clicked',
};

// תקרת-אירועים להרצה בודדת — כל אירוע עולה עד ~4 קריאות-משנה (2 שאילתות + פאצ'ים), ותקרת
// ה-subrequests של Workers היא 50 בתוכנית החינמית. אותו שיקול בדיוק כמו MAX_SWEEP_RECIPIENTS
// ב-index.js. Brevo שולח אירוע-אחד-לבקשה בפועל, אז זה רק רשת-ביטחון מפני batch לא-צפוי.
const MAX_EVENTS_PER_REQUEST = 8;

// ── רישום ה-webhook אצל Brevo, בלי לגעת בממשק שלהם ────────────────────────────────────────
// למה: המסך של Brevo מתחלף מדי כמה חודשים, וההגדרה הזאת נעשית פעם אחת ואז נשכחת. במקום מדריך-
// לחיצות שמתיישן — endpoint חד-פעמי שמבצע את הרישום מול api.brevo.com עם ה-BREVO_API_KEY שכבר
// שמור אצלנו כ-secret. אידמפוטנטי: אם כבר קיים webhook שמצביע אלינו, הוא מתעדכן במקום להיווצר שוב.
// מוגן באותו BREVO_WEBHOOK_SECRET. ר' docs/PROJECT_CONTEXT.md §205.
//
// שמות-האירועים כאן הם ה-camelCase של ה-API ליצירה (hardBounce), בעוד שב-payload שמגיע בפועל
// הם snake_case (hard_bounce) — הבדל אמיתי בצד של Brevo, ר' EVENT_STATUS למעלה.
const WEBHOOK_EVENTS = ['delivered', 'hardBounce', 'softBounce', 'blocked', 'spam', 'invalid', 'opened', 'uniqueOpened', 'click'];
const WEBHOOK_DESC = 'Yellow Zone — delivery events';

export async function handleSetupBrevoWebhook(request, env) {
  const url = new URL(request.url);
  if (!env.BREVO_WEBHOOK_SECRET || url.searchParams.get('key') !== env.BREVO_WEBHOOK_SECRET) {
    return { error: 'unauthorized' };
  }
  if (!env.BREVO_API_KEY) return { error: 'missing_brevo_api_key' };

  const targetUrl = `${url.origin}/brevo-webhook?key=${env.BREVO_WEBHOOK_SECRET}`;
  const headers = { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' };
  const prefix = `${url.origin}/brevo-webhook`;

  const listResp = await fetch('https://api.brevo.com/v3/webhooks?type=transactional', { headers });
  const listJson = await listResp.json().catch(() => ({}));
  // ⚠️ כשאין אף webhook בחשבון, Brevo לא מחזיר רשימה ריקה אלא 404 עם
  // {"code":"document_not_found","message":"Webhook record does not exist"} — נתקלנו בזה בפועל
  // בהרצה הראשונה (2026-08-16). זה מצב תקין לחלוטין ומשמעותו "אין עדיין כלום, צור חדש".
  const noneYet = listResp.status === 404 || listJson.code === 'document_not_found';
  if (!listResp.ok && !noneYet) return { error: 'brevo_list_failed', detail: JSON.stringify(listJson).slice(0, 300) };

  const existing = noneYet ? null : (listJson.webhooks || []).find((w) => String(w.url || '').startsWith(prefix));

  if (existing) {
    const upd = await fetch(`https://api.brevo.com/v3/webhooks/${existing.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ url: targetUrl, events: WEBHOOK_EVENTS, description: WEBHOOK_DESC }),
    });
    if (!upd.ok) return { error: 'brevo_update_failed', detail: (await upd.text()).slice(0, 300) };
    return { ok: true, action: 'updated', id: existing.id, events: WEBHOOK_EVENTS };
  }

  const create = await fetch('https://api.brevo.com/v3/webhooks', {
    method: 'POST', headers,
    body: JSON.stringify({ url: targetUrl, events: WEBHOOK_EVENTS, type: 'transactional', description: WEBHOOK_DESC }),
  });
  const createJson = await create.json().catch(() => ({}));
  if (!create.ok) return { error: 'brevo_create_failed', detail: JSON.stringify(createJson).slice(0, 300) };
  return { ok: true, action: 'created', id: createJson.id, events: WEBHOOK_EVENTS };
}

function normalizeEvents(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.events)) return body.events;
  return body ? [body] : [];
}

export async function handleBrevoWebhook(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  if (!env.BREVO_WEBHOOK_SECRET || key !== env.BREVO_WEBHOOK_SECRET) {
    return { error: 'unauthorized' };
  }

  let body;
  try { body = await request.json(); } catch { return { error: 'bad_json' }; }

  const events = normalizeEvents(body).slice(0, MAX_EVENTS_PER_REQUEST);
  if (!events.length) return { ok: true, handled: 0 };

  const accessToken = await getGoogleAccessToken(env);
  let handled = 0, matched = 0;

  for (const ev of events) {
    const evName = String(ev.event || '').toLowerCase();
    const status = EVENT_STATUS[evName];
    const touch = EVENT_TOUCH_FIELD[evName];
    const email = String(ev.email || '').trim().toLowerCase();
    if ((!status && !touch) || !email) continue;
    handled++;

    // חותמת-הזמן של האירוע עצמו, לא של הרגע שקיבלנו אותו (Brevo יכול לאחר/לנסות שוב)
    const at = ev.ts ? new Date(Number(ev.ts) * 1000) : (ev.date ? new Date(ev.date) : new Date());
    const reason = String(ev.reason || ev['reason'] || '').slice(0, 300);

    // ההתאמה היא לפי כתובת — ולכן אירוע ישן על כתובת שכבר תוקנה פשוט לא מוצא כלום ונזרק,
    // וזה בדיוק ההתנהגות הרצויה (לא נדרוס סטטוס חדש בתוצאה של שליחה ישנה).
    // חגורה-ושלייקס: מאז 18.8 כל כתובת נשמרת באותיות קטנות (ר' §221), אבל אם Brevo מחזיר את
    // הכתובת בדיוק כפי שנשלחה — מחפשים גם בצורה הגולמית, כדי שרשומה ישנה שטרם נורמלה לא תישאר
    // בלי נתוני מסירה בשקט. שאילתה נוספת רק כשהצורות באמת שונות, כלומר כמעט אף פעם.
    const raw = String(ev.email || '').trim();
    const alsoRaw = raw && raw !== email;
    const [bizLower, memberLower, bizRaw, memberRaw] = await Promise.all([
      firestoreRunQuery(env, accessToken, 'businesses', 'ownerEmail', email, 3),
      firestoreRunQuery(env, accessToken, 'members', 'email', email, 3),
      alsoRaw ? firestoreRunQuery(env, accessToken, 'businesses', 'ownerEmail', raw, 3) : [],
      alsoRaw ? firestoreRunQuery(env, accessToken, 'members', 'email', raw, 3) : [],
    ]);
    const dedupe = (a, b) => { const seen = new Set(a.map(x => x.id)); return a.concat(b.filter(x => !seen.has(x.id))); };
    const bizList = dedupe(bizLower, bizRaw);
    const memberList = dedupe(memberLower, memberRaw);

    // אירוע-מסירה כותב את שדות המסירה; אירוע-מגע כותב *רק* את חותמת הפתיחה/הלחיצה. שני הענפים
    // אף פעם לא נוגעים באותם שדות, ולכן סדר-ההגעה בין delivered ל-opened לא משנה.
    const bizPatch = touch
      ? { [`ownerEmail${touch}At`]: at }
      : { ownerEmailDelivery: status, ownerEmailDeliveryAt: at, ownerEmailDeliveryReason: reason };
    const memberPatch = touch
      ? { [`loginCodeEmail${touch}At`]: at }
      : { loginCodeEmailDelivery: status, loginCodeEmailDeliveryAt: at, loginCodeEmailDeliveryReason: reason };

    for (const b of bizList) {
      await firestorePatch(env, accessToken, `businesses/${b.id}`, bizPatch);
      matched++;
    }
    for (const m of memberList) {
      await firestorePatch(env, accessToken, `members/${m.id}`, memberPatch);
      matched++;
    }
  }

  // תמיד 200 עם גוף תקין — תשובת-שגיאה גורמת ל-Brevo לנסות שוב את אותו אירוע שוב ושוב.
  return { ok: true, handled, matched };
}
