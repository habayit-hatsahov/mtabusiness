// כל בניית ה-HTML של גוף המייל (עיצוב, סימוני-טקסט, בלוקים ממותגים, פוטר) עברה ל-mail-format.js
// בשורש הפרויקט — מקור-אמת אחד שגם admin-dashboard.html מייבא, כדי שהתצוגה המקדימה במרכז ההודעות
// תהיה בדיוק מה שנשלח בפועל. כאן נשארה רק שכבת-השליחה עצמה (Brevo) והתבניות הקבועות של המערכת.
import {
  applyVars,
  codeBlockHtml,
  footerHtml,
  renderMailHtml,
} from '../../mail-format.js';

// כתובת-מענה לכל המיילים היוצאים (לא רק לבעלי-עסקים יותר) — המשתמש ביקש במפורש (2026-08-05) שגם
// אוהדים יוכלו להשיב למייל שלהם, כדי לאפשר שיתופי-פעולה שמתחילים מתגובה חופשית.
const REPLY_TO = 'yellowzonemta@gmail.com';


// ══ §444 — בלוקי ה-Google שמעל/מתחת לגוף המכתב הוסרו ═══════════════════════════════════
// §389 (תזכורת למקושרים, בתחתית) ו-§415 (הזמנה ללא-מקושרים, קופסה צהובה בראש) הוחלפו בבלוק
// אחד, `{login}`, שהמנהל ממקם בעצמו בתבנית (mail-format.js → loginBlockHtml). בקשת המשתמש:
// *"הוא מרגיש לי עמוס"* + "הקוד משני, שאנשים ייכנסו עם גוגל".
// 🔑 המצב (Google/קוד) עדיין נקבע כאן בקוד ולא בתבנית — אותו נימוק של §389: תבנית סטטית
// אינה יודעת להתנות. היא רק אומרת **איפה**; הוורקר אומר **מה**.
// ⚠️ תבנית שאין בה `{login}` נשלחת כמו לפני §389 — בלי שום אזכור של Google.
function loginVars(login) {
  return { login_mode: (login && login.mode) || '', login_account: (login && login.account) || '' };
}

async function sendBrevoEmail(env, { sender, to, replyTo, subject, htmlContent, tag }) {
  // כל מייל יוצא (גם תבניות-מנהל וגם ברירת-המחדל הקבועה) מקבל את אותו פוטר וגרסת-טקסט-חלופית —
  // ריכוזי כאן ולא בכל קורא-קריאה, כדי שלא יישכח פעם אחת מתוך 4 (ר' "מסירות מייל ל-Gmail" בתיעוד).
  const finalHtml = htmlContent + footerHtml(htmlContent);
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: sender || { name: 'Yellow Zone', email: env.SENDER_EMAIL },
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      // ── §415 — תג על כל מייל יוצא, וזה תיקון-אמת ולא נוחות ─────────────────────────
      // 🔑 **הבאג שזה סוגר:** webhook המסירה (brevo-webhook.js) מתאים אירועים **לפי כתובת
      // מייל בלבד**, וכותב אותם תמיד לשדות של מייל-הקוד (`loginCodeEmailDelivery`/
      // `loginCodeEmailOpenedAt`). כלומר השידור ההמוני הראשון היה **דורס** את נתוני מייל-
      // הקוד של כל 108 הנמענים — ואיתם את ארבעת הדליים ב"אושרו ולא נכנסו" (§390/§394),
      // שכל ההחלטה "למי לשלוח וואטסאפ" נשענת עליהם. הדריסה הייתה שקטה לחלוטין.
      // התג הוא מה שמאפשר ל-webhook לדעת על **איזה מכתב** מדובר, ולכתוב לשדות הנכונים.
      ...(tag ? { tags: Array.isArray(tag) ? tag : [tag] } : {}),   // §524 — גם כמה תגים (broadcast + msg_<id>)
      htmlContent: finalHtml,
      textContent: stripHtml(finalHtml),
    }),
  });
  if (!resp.ok) throw new Error('brevo_send_failed: ' + (await resp.text()));
  // §522 — { messageId } של Brevo. מרכז ההודעות שומר אותו לכל נמען, כדי שהמסירה/הפתיחה יותאמו
  // **להודעה** ולא רק לכתובת (שלב 4). הקוראים האחרים מתעלמים מהערך – לא משנה להם דבר.
  return resp.json().catch(() => ({}));
}

// html->text גס, לגרסת הטקסט-החלופי שנשלחת לצד ה-HTML (textContent). מספיק ל-alt-text, לא
// מטרתו לשמר מבנה עשיר.
// §306 — קישורים מומרים ל-"טקסט (כתובת)" *לפני* הסרת התגיות. קודם ה-href נמחק יחד עם התגית,
// ולכן "אינסטגרם"/"פייסבוק" הופיעו שם כמילים מתות בלי שום דרך להגיע אליהן. כשהטקסט של
// הקישור הוא כבר הכתובת עצמה (כפתור הכניסה מציג "yellowzone.co.il") לא כופלים אותה.
function stripHtml(html) {
  const withLinks = html.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const label = text.replace(/<[^>]+>/g, '').trim();
    const bare = href.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return !label || label === bare || label === href ? href : `${label} (${href})`;
  });
  return withLinks
    .replace(/<br\s*\/?>/gi, '\n')
    // סוגרי-בלוק -> שורה. בלעדיהם תיבת-הקוד והכפתור (טבלאות) נדבקו לפסקה שאחריהם.
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|tr|table|td)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // פענוח ישויות — escapeHtml מברִיח & " < > , ובלי הפענוח כאן הן היו מופיעות בגרסת-הטקסט
    // כמחרוזות מילוליות (&quot; אחרי כל גרשיים בעברית: דוא"ל, ד"ר). &amp; אחרון בכוונה.
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    // ההזחה של ה-HTML הפכה לרווחים מובילים בכל שורה, ושורות ריקות התרבו בין הטבלאות.
    .split('\n').map((line) => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// tpl אופציונלי — override מ-settings/messageTemplates (Firestore), נערך במרכז ההודעות.
// כשקיים, מחליף גם את הנושא וגם את גוף ההודעה — טקסט חופשי דרך renderMailHtml, כולל תיבת-קוד/
// כפתור ממותגים אם {code}/{link} יושבים על שורה נפרדת משלהם, וכל סימוני-העיצוב של סרגל הכתיבה.
export async function sendLoginCodeEmail(env, { toEmail, toName, code, tpl, kind = 'welcome', login = null }) {
  // בניגוד לבעלי-עסקים, לאוהד אין accessToken אישי — אז {link} כאן זהה לכל אוהד.
  // §494 — פותח את האפליקציה (דרך /download), לא את האתר: אוהדים משתמשים רק באפליקציה (§484).
  const vars = { name: toName || '', code, link: 'https://yellowzone.co.il/download?src=mail', ...loginVars(login) };
  const isResend = kind === 'resend';
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : (isResend ? 'קוד הכניסה שלכם ל-Yellow Zone' : 'אתם בפנים – קוד הכניסה שלכם ל-Yellow Zone');
  const htmlContent = tpl?.body
    ? renderMailHtml(tpl.body, vars, { linkLabel: 'לפתיחת האפליקציה' })
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>${isResend ? 'קוד הכניסה שלכם' : 'אתם בפנים'}</h2>
          <p style="color:#555">${isResend ? 'ביקשתם את הקוד שלכם. הנה הוא:' : 'זה קוד הכניסה האישי שלכם:'}</p>
          ${codeBlockHtml(code)}
          <p>נכנסים איתו יחד עם מספר הטלפון שאיתו נרשמתם.</p>
        </div>`;

  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject,
    htmlContent,
    tag: 'login',
  });
}

// מייל שני, נפרד מקוד הכניסה — נשלח כשעסק (לא רק החברות של הבעלים) מאושר לאינדקס
export async function sendBusinessApprovedEmail(env, { toEmail, ownerName, businessName, dashboardLink, tpl, login = null }) {
  const vars = { name: ownerName || '', business: businessName, link: dashboardLink, ...loginVars(login) };
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : 'העסק שלך אושר לאינדקס Yellow Zone';
  const htmlContent = tpl?.body
    ? renderMailHtml(tpl.body, vars, { linkLabel: 'כניסה לאזור העסק שלי' })
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>שמחים לבשר – "${businessName}" אושר!</h2>
          <p style="color:#555">העסק שלך עכשיו חלק מהאינדקס הבלעדי שלנו.</p>
          <p><a href="${dashboardLink}" style="display:inline-block;background:#FFDE00;color:#16130a;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:14px;margin-top:8px">לניהול העסק שלך</a></p>
          <p style="color:#888;font-size:13px">עריכת פרטים, תמונות ועוד – הקישור אישי ולא ניתן להעברה</p>
        </div>`;

  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: ownerName || '' }],
    replyTo: { email: REPLY_TO },
    subject,
    htmlContent,
    tag: 'bizApproved',
  });
}

// שידור חד-פעמי לקהל (מרכז הודעות, admin-dashboard.html) — subject/body מגיעים מהמנהל
// (טיוטה ב-settings/broadcastDraft), עם placeholders {name}/{business}/{link} שמוחלפים לכל נמען בנפרד.
export async function sendBroadcastEmail(env, { toEmail, toName, subject, body, vars, msgTag = '' }) {
  const finalSubject = applyVars(subject, vars);
  const htmlContent = renderMailHtml(body, vars, {
    linkLabel: vars.code ? 'לפתיחת האפליקציה' : 'כניסה לאזור העסק שלי',   // §499 — כמו מייל הקוד (§494)
    lineHeight: '1.7',
  });
  return sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject: finalSubject,
    htmlContent,
    // §415 — ⚠️ **התג הזה הוא כל ההפרדה.** בלעדיו אירועי המסירה של השידור נוחתים על שדות
    // מייל-הקוד ומוחקים את התמונה שלפיה מחליטים למי לשלוח וואטסאפ. ר' ההערה ב-sendBrevoEmail.
    // §524 — msg_<messageId>: ה-webhook כותב את המסירה/הפתיחה גם לשורת הנמען של ההודעה הזאת
    tag: msgTag ? ['broadcast', msgTag] : 'broadcast',
  });
}

// ── §501 — "הצוות ענה לך" — תשובה בשיחה ("האזור שלי", §473 שלב 1) ─────────────────────
// 🔑 **התשובה המלאה בגוף המייל**, ולא רק "יש לך הודעה": בעל עסק שמנהל מהמחשב, ומי שאין לו
// עדיין גרסה שפותחת את השיחה מהקישור, קוראים אותה כאן בלי לחפש.
// הטקסט נכנס לתבנית ישירות (ולא כ-{var}) כדי שהפסקאות וירידות השורה שלו יישמרו — paragraphHtml
// מבריח אותו כמו כל טקסט בתבנית.
// ⚠️ התג 'convReply' חובה — בלעדיו אירועי המסירה נוחתים על שדות מייל-הקוד (§415, ר' sendBrevoEmail),
// ו-brevo-webhook.js מדלג עליו במפורש.
export async function sendConversationReplyEmail(env, { toEmail, toName, replyText, link }) {
  const body = [
    'היי {name},',
    'הצוות של Yellow Zone ענה לך:',
    String(replyText || '').trim(),
    '{link}',
    'אפשר להמשיך את השיחה באפליקציה, ב"האזור שלי" ← "הודעות". אפשר גם פשוט להשיב למייל הזה.',
  ].join('\n\n');
  const vars = { name: toName || '', link };
  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject: 'הצוות של Yellow Zone ענה לך',
    htmlContent: renderMailHtml(body, vars, { linkLabel: 'לפתיחת השיחה באפליקציה', lineHeight: '1.7' }),
    tag: 'convReply',
  });
}

// ── §505 — "מעדיפים לנהל מהמחשב?" — הקישור הישיר לניהול העסק, לבעלים עצמו ───────────────
// נשלח מ"העסק שלי" באפליקציה (§473כו/§491ב). הקישור פותח את כל האזור של העסק בדפדפן, בלי כניסה.
// ⚠️ הקישור הוא מפתח: מי שמחזיק אותו עורך את העסק — ולכן המייל אומר את זה במפורש.
// תג 'dashLink' — brevo-webhook.js מדלג עליו (אחרת דורס את שדות מייל-הקוד, §415).
export async function sendDashboardLinkEmail(env, { toEmail, toName, businessName, link }) {
  const body = [
    'היי {name},',
    'ביקשת את הקישור לניהול "{business}" מהמחשב. פותחים אותו בדפדפן בכל מחשב, בלי כניסה ובלי סיסמה – והכול מחכה לך שם: עריכה, נתונים והודעות.',
    '{link}',
    'הקישור אישי: מי שמחזיק בו יכול לערוך את העסק. שלחו אותו רק למי שמנהל איתכם את העסק, ואל תפרסמו אותו.',
  ].join('\n\n');
  const vars = { name: toName || '', business: businessName || 'העסק שלך', link };
  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject: 'הקישור לניהול העסק מהמחשב',
    htmlContent: renderMailHtml(body, vars, { linkLabel: 'לניהול העסק', lineHeight: '1.7' }),
    tag: 'dashLink',
  });
}

// מייל מאוחד — כשבעל עסק מאושר גם כאוהד וגם כבעל עסק באותה פעולה
export async function sendCombinedWelcomeEmail(env, { toEmail, toName, code, businessName, dashboardLink, tpl, login = null }) {
  const vars = { name: toName || '', code, business: businessName, link: dashboardLink, ...loginVars(login) };
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : 'ברוכים הבאים ל-Yellow Zone';
  const htmlContent = tpl?.body
    ? renderMailHtml(tpl.body, vars, { linkLabel: 'כניסה לאזור העסק שלי' })
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>ברוכים הבאים ל-Yellow Zone</h2>
          <p style="color:#555">הנה קוד הכניסה שלך לאינדקס (כאוהד):</p>
          ${codeBlockHtml(code)}
          <p>נכנסים איתו יחד עם מספר הטלפון שאיתו נרשמתם.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#555">בנוסף – העסק "${businessName}" שלך אושר לאינדקס!</p>
          <p><a href="${dashboardLink}" style="display:inline-block;background:#FFDE00;color:#16130a;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:14px;margin-top:8px">לניהול העסק שלך</a></p>
        </div>`;

  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject,
    htmlContent,
    tag: 'combined',
  });
}
