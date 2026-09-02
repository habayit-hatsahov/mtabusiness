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

// ══ §389 — "אפשר גם בלי הקוד" למי שחיבר חשבון Google ═════════════════════════════════════
// 🔑 **למה זה חייב להיות בקוד ולא בתבנית שהמנהל עורך:** המשפט נכון רק לחלק מהנמענים, ותבנית
// סטטית אינה יודעת להתנות. יתרה מזו — `tpl.body` **דורס את גוף המכתב במלואו**, ולכן משפט
// שהיה נכתב בתבנית ברירת-המחדל שבקוד לא היה מופיע לעולם אצל מי שיש לו תבנית מותאמת (וזה
// המצב בפועל). בקשת המשתמש הייתה מפורשת: *"חשוב שאני עורך שאני לא אגע בזה"*.
//
// ⚠️ **בלי אימוג'ים** — §306: סימן אחד (☰) נקרא כאימוג'י אצל נמען ושבר משפט שלם.
// ⚠️ **בלי כפתור** — §306 שוב: אין כפתור-פעולה במכתב מלבד מה שכבר קיים בתבנית.
function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function googleNoteHtml(googleEmail) {
  if (!googleEmail) return '';
  return `
    <div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#555;
                          background:#F6F6F2;border:1px solid #E7E7E0;border-radius:12px;
                          padding:14px 16px;margin:20px auto 0;max-width:520px;text-align:right">
      <b style="color:#0A2A66">אפשר גם בלי הקוד</b><br>
      בעמוד הכניסה יש כפתור "להמשיך עם Google". החשבון ${esc(googleEmail)} כבר מקושר לחשבון שלכם,
      ולכן אפשר להיכנס איתו בלחיצה אחת — מכל מכשיר, בלי להקליד קוד.
    </div>`;
}

async function sendBrevoEmail(env, { sender, to, replyTo, subject, htmlContent, googleEmail }) {
  // כל מייל יוצא (גם תבניות-מנהל וגם ברירת-המחדל הקבועה) מקבל את אותו פוטר וגרסת-טקסט-חלופית —
  // ריכוזי כאן ולא בכל קורא-קריאה, כדי שלא יישכח פעם אחת מתוך 4 (ר' "מסירות מייל ל-Gmail" בתיעוד).
  // §389 — הערת-הגוגל נוספת כאן **מאותו נימוק בדיוק**: מיקום אחד, ולא ארבעה שאפשר לשכוח אחד מהם.
  // היא נכנסת **לפני** הפוטר ואחרי גוף המכתב, ו-`footerHtml` ממשיך לקבל את הגוף המקורי בלבד.
  const finalHtml = htmlContent + googleNoteHtml(googleEmail) + footerHtml(htmlContent);
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
      htmlContent: finalHtml,
      textContent: stripHtml(finalHtml),
    }),
  });
  if (!resp.ok) throw new Error('brevo_send_failed: ' + (await resp.text()));
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
export async function sendLoginCodeEmail(env, { toEmail, toName, code, tpl, kind = 'welcome', googleEmail = '' }) {
  // בניגוד לבעלי-עסקים, לאוהד אין accessToken אישי (הכניסה היא תמיד טלפון+קוד) — אז {link} כאן
  // הוא כתובת האתר הכללית, זהה לכל אוהד, לא קישור-קסם מותאם-אישית.
  const vars = { name: toName || '', code, link: 'https://yellowzone.co.il/welcome.html' };
  const isResend = kind === 'resend';
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : (isResend ? 'קוד הכניסה שלכם ל-Yellow Zone' : 'אתם בפנים — קוד הכניסה שלכם ל-Yellow Zone');
  const htmlContent = tpl?.body
    ? renderMailHtml(tpl.body, vars, { linkLabel: 'כניסה לאתר' })
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
    googleEmail,
  });
}

// מייל שני, נפרד מקוד הכניסה — נשלח כשעסק (לא רק החברות של הבעלים) מאושר לאינדקס
export async function sendBusinessApprovedEmail(env, { toEmail, ownerName, businessName, dashboardLink, tpl, googleEmail = '' }) {
  const vars = { name: ownerName || '', business: businessName, link: dashboardLink };
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : 'העסק שלך אושר לאינדקס Yellow Zone';
  const htmlContent = tpl?.body
    ? renderMailHtml(tpl.body, vars, { linkLabel: 'כניסה לאזור העסק שלי' })
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>שמחים לבשר — "${businessName}" אושר!</h2>
          <p style="color:#555">העסק שלך עכשיו חלק מהאינדקס הבלעדי שלנו.</p>
          <p><a href="${dashboardLink}" style="display:inline-block;background:#FFDE00;color:#16130a;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:14px;margin-top:8px">לניהול העסק שלך</a></p>
          <p style="color:#888;font-size:13px">עריכת פרטים, תמונות ועוד — הקישור אישי ולא ניתן להעברה</p>
        </div>`;

  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: ownerName || '' }],
    replyTo: { email: REPLY_TO },
    subject,
    htmlContent,
    // §391 — נוסף בבקשת המשתמש. ⚠️ §389 השאיר את המכתב הזה בחוץ בנימוק שהוא מפנה
    // לדשבורד העסק (טוקן נפרד, §244) ולא לכניסת החבר — והנימוק עדיין נכון, אבל **הקורא
    // הוא אותו אדם**, ואם יש לו חשבון גוגל מקושר ומאושר, אין סיבה להסתיר ממנו את הדלת
    // הקלה. הגדר-האמת נמצא בצד הקורא (index.js): הערך מועבר רק כשהוא **באמת** יכול
    // להיכנס איתו — אחרת המכתב היה מבטיח כניסה למי שעוד ממתין לאישור.
    googleEmail,
  });
}

// שידור חד-פעמי לקהל (מרכז הודעות, admin-dashboard.html) — subject/body מגיעים מהמנהל
// (טיוטה ב-settings/broadcastDraft), עם placeholders {name}/{business}/{link} שמוחלפים לכל נמען בנפרד.
export async function sendBroadcastEmail(env, { toEmail, toName, subject, body, vars }) {
  const finalSubject = applyVars(subject, vars);
  const htmlContent = renderMailHtml(body, vars, {
    linkLabel: vars.code ? 'כניסה לאתר' : 'כניסה לאזור העסק שלי',
    lineHeight: '1.7',
  });
  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject: finalSubject,
    htmlContent,
  });
}

// מייל מאוחד — כשבעל עסק מאושר גם כאוהד וגם כבעל עסק באותה פעולה
export async function sendCombinedWelcomeEmail(env, { toEmail, toName, code, businessName, dashboardLink, tpl, googleEmail = '' }) {
  const vars = { name: toName || '', code, business: businessName, link: dashboardLink };
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
          <p style="color:#555">בנוסף — העסק "${businessName}" שלך אושר לאינדקס!</p>
          <p><a href="${dashboardLink}" style="display:inline-block;background:#FFDE00;color:#16130a;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:14px;margin-top:8px">לניהול העסק שלך</a></p>
        </div>`;

  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject,
    htmlContent,
    googleEmail,
  });
}
