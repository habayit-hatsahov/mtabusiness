// כתובת-מענה לכל המיילים היוצאים (לא רק לבעלי-עסקים יותר) — המשתמש ביקש במפורש (2026-08-05) שגם
// אוהדים יוכלו להשיב למייל שלהם, כדי לאפשר שיתופי-פעולה שמתחילים מתגובה חופשית.
const REPLY_TO = 'yellowzonemta@gmail.com';
const LOGO_URL = 'https://yellowzone.co.il/images/yellowzone-mark-square.png';
const LOGO_HORIZONTAL_URL = 'https://yellowzone.co.il/images/yellowzone-logo-horizontal.png';

// הרשתות החברתיות של Yellow Zone — מוצגות בפוטר של *כל* מייל יוצא (ר' footerHtml), ולא בגוף
// תבנית מסוימת, כדי שתבנית חדשה לא תישכח בלי הקריאה לעקוב. ערך ריק = הקישור לא מוצג כלל
// (עדיף חסר על קישור שבור).
const INSTAGRAM_URL = 'https://instagram.com/Yellowzone.mta';
const FACEBOOK_URL = 'https://www.facebook.com/share/1C5yYf44z6/?mibextid=wwXIfr';

// ריבוע צהוב עם קוד הכניסה. אין ולא יכול להיות "כפתור העתקה" במייל — Gmail/Outlook מסירים
// JavaScript לפני שהמייל מוצג, ולכן אייקון-העתקה כמו זה שבפאנל המנהל/בקופון היה נראה זהה אבל
// לא עושה כלום. הקוד עצמו הוא הממשק: גופן גדול ומרווח, בלי שום דבר שמתחרה בו.
// אין קישור בתוך התיבה: הכניסה היא תמיד כפתור נפרד מתחתיה (codeBlockHtml), כי שורת-כיתוב
// מודגשת לא נקראת ככפתור ולא נלחצת. התיבה עושה דבר אחד — מציגה את הקוד.
function codeBoxHtml(code) {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:20px auto">
      <tr><td style="width:260px;background:#FFDE00;border-radius:20px;padding:22px 20px;text-align:center">
        <div style="font-size:38px;font-weight:900;letter-spacing:8px;color:#0A2A66;line-height:1.15;direction:ltr;unicode-bidi:isolate">${code}</div>
      </td></tr>
    </table>`;
}

// כפתור-הכניסה מציג את *כתובת האתר* ולא "כניסה לאתר" — כדי שהאוהד יזכור אותה ויוכל להקליד
// אותה בעצמו בפעם הבאה. ה-href הוא הדומיין החשוף (index.html מפנה ל-welcome.html), כך שגם
// תצוגת-הקישור של לקוח המייל מראה בדיוק את הכתובת שאנחנו מלמדים.
const SITE_URL = 'https://yellowzone.co.il';
function loginButtonHtml() {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:16px auto">
      <tr><td style="background:#FFDE00;border-radius:14px">
        <a href="${SITE_URL}" style="display:inline-block;color:#16130a;text-decoration:none;padding:11px 28px;text-align:center;line-height:1.35">
          <span style="font-size:12px;font-weight:700">לכניסה לחצו</span><br>
          <span style="font-size:18px;font-weight:900;direction:ltr;unicode-bidi:isolate">yellowzone.co.il</span>
        </a>
      </td></tr>
    </table>`;
}

// כל מקום שמציג קוד מקבל גם את כפתור-הכניסה מתחתיו. אם התבנית כבר כוללת {login_link} משלה,
// היא מקבלת false ומציבה את הכפתור בעצמה במקום שבחרה — כדי שלא יופיעו שני כפתורים זהים.
function codeBlockHtml(code, withButton = true) {
  return codeBoxHtml(code) + (withButton ? loginButtonHtml() : '');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// הדגשה בסגנון וואטסאפ — *מילה* הופך ל-<b>מילה</b>. רץ אחרי escapeHtml בכוונה (הכוכביות עצמן לא
// מושפעות מ-escape, אז זה בטוח להפוך אותן ל-HTML אחרי, בלי לפתוח פרצת-XSS על שאר הטקסט).
function applyBold(escapedText) {
  return escapedText.replace(/\*(.+?)\*/g, '<b>$1</b>');
}

function applyVars(text, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v ?? ''), text);
}

// הופך כתובות-אתר בתוך טקסט חופשי לקישורים לחיצים — תומך גם ב-URL מלא (https://...) וגם בדומיין
// חשוף בלי פרוטוקול (למשל instagram.com/user), כי כותבים תוכן-מייל בטקסט רגיל בלי להקליד https://
// בכל פעם. רץ אחרי escapeHtml+applyBold בכוונה (הטקסט כבר-HTML-בטוח, אין סיכון XSS מהקישור עצמו
// כי המקור זהה לטקסט שכבר עבר escape).
function linkifyUrls(text) {
  return text.replace(/(https?:\/\/[^\s<]+|(?:www\.)?[a-zA-Z0-9-]+\.(?:com|co\.il|net|org|io)(?:\/[^\s<]*)?)/g, (match) => {
    const href = match.startsWith('http') ? match : `https://${match}`;
    return `<a href="${href}" style="color:#16130a;font-weight:700;text-decoration:underline">${match}</a>`;
  });
}

// כפתור צהוב ממותג — משמש כש-{link} יושב על שורה נפרדת (פסקה משלו) בתבנית מותאמת-אישית
function linkButtonHtml(link, label) {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:16px auto">
      <tr><td style="background:#FFDE00;border-radius:14px">
        <a href="${link}" style="display:inline-block;color:#16130a;font-weight:900;text-decoration:none;padding:12px 28px;font-size:15px">${label}</a>
      </td></tr>
    </table>`;
}

// לוגו הרוחבי של האתר (לא הריבועי-של-תיבת-הקוד) בפינה — לא באמצע, כדי לא לכפול את הלוגו שכבר
// מופיע בתוך תיבת-הקוד (codeBoxHtml). בכוונה בצד שמאל, מול כיוון-הקריאה RTL של שאר הגוף.
function brandHeaderHtml() {
  return `<div style="text-align:left;margin:0 0 18px 0"><img src="${LOGO_HORIZONTAL_URL}" height="26" alt="Yellow Zone" /></div>`;
}

// עוטף את הגוף בעמודה ברוחב קבוע (לא נמתח על פני כל רוחב המסך/חלון-דוא"ל) — כדי שאורך השורות
// יהיה עקבי במקום שורה ארוכה מאוד ואחריה שורה קצרה מאוד. תיבת-הקוד/כפתורים נשארים ממורכזים בתוכה.
function boundedColumnHtml(innerHtml) {
  return `<div style="max-width:480px;margin:0 auto;text-align:right">${innerHtml}</div>`;
}

// תבנית מותאמת-אישית -> HTML: כל פסקה (שורה ריקה מפרידה, כמו textToHtml) הופכת ל-<p>, חוץ מפסקה
// שהיא בדיוק "{code}"/"{link}"/"{login_link}" בשורה משלה — זו מקבלת את העיצוב הממותג (תיבת-קוד/
// כפתור) במקום טקסט רגיל. {login_link} הוא כפתור קבוע לכתובת הכניסה הכללית (welcome.html, זהה
// לכולם — לא per-נמען כמו {link}), לשימוש כשרוצים להדגיש רק את דרך-הכניסה הרגילה בלי טוקן-דשבורד.
// שימוש רגיל של המשתנים האלה בתוך משפט (לא בשורה נפרדת) ממשיך להתחלף לטקסט פשוט כרגיל.
function richBodyHtml(bodyTemplate, vars, linkLabel) {
  // האם התבנית מציגה כפתור-כניסה משלה? אם כן, תיבת-הקוד לא תחזור על כתובת האתר בתוכה.
  const paras = bodyTemplate.split('\n\n');
  const hasLoginButton = paras.some((p) => p.trim() === '{login_link}');
  return paras.map((para) => {
    const trimmed = para.trim();
    if (trimmed === '{code}' && vars.code) return codeBlockHtml(vars.code, !hasLoginButton);
    if (trimmed === '{link}' && vars.link) return linkButtonHtml(vars.link, linkLabel || 'כניסה');
    if (trimmed === '{login_link}') return loginButtonHtml();
    return `<p style="margin:0 0 16px 0">${linkifyUrls(applyBold(escapeHtml(applyVars(para, vars)))).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

// כתובת-פיזית קטנה בתחתית כל מייל אוטומטי — לא לשם יצירת-קשר בפועל (הפרויקט קהילתי, בלי משרד
// רשום), רק כי Gmail/פילטרי-ספאם מצפים לראות כתובת-דואר-כלשהי בפוטר מייל שיווקי/אוטומטי; חסרה = סמן-ספאם.
// שורת "לא ספאם" — עידוד לנמען לשפר את המוניטין של הדומיין (Gmail/ספאם-פילטרים לומדים ממי שמסמן ידנית).
// שורת "עקבו אחרינו" — בפוטר ולא בגוף תבנית מסוימת, כדי שכל מייל יוצא (קוד כניסה, אישור עסק,
// שידור המוני) יישא אותה בלי שצריך לזכור להוסיף ידנית. קישור ריק פשוט לא מוצג.
function socialRowHtml() {
  const links = [
    INSTAGRAM_URL && `<a href="${INSTAGRAM_URL}" style="color:#0A2A66;font-weight:700;text-decoration:underline">אינסטגרם</a>`,
    FACEBOOK_URL && `<a href="${FACEBOOK_URL}" style="color:#0A2A66;font-weight:700;text-decoration:underline">פייסבוק</a>`,
  ].filter(Boolean);
  if (!links.length) return '';
  return `<div style="text-align:center;margin-top:26px;padding-top:18px;border-top:1px solid #eee">
    <div style="font-size:13px;color:#555;margin-bottom:10px">תרשמו למעקב אחרינו</div>
    <div style="font-size:15px">${links.join(' <span style="color:#ccc">·</span> ')}</div>
  </div>`;
}

function footerHtml() {
  return socialRowHtml() + `<div style="text-align:center;color:#999;font-size:11px;margin-top:20px;line-height:1.6">
    אם המייל הזה נחת בתיקיית הספאם/קידומים, נשמח שתסמנו אותו כ"לא ספאם" — כך מיילים עתידיים יגיעו ישר לתיבה הראשית.<br>
    Yellow Zone · תל אביב, ישראל
  </div>`;
}

async function sendBrevoEmail(env, { sender, to, replyTo, subject, htmlContent }) {
  // כל מייל יוצא (גם תבניות-מנהל וגם ברירת-המחדל הקבועה) מקבל את אותו פוטר וגרסת-טקסט-חלופית —
  // ריכוזי כאן ולא בכל קורא-קריאה, כדי שלא יישכח פעם אחת מתוך 4 (ר' "מסירות מייל ל-Gmail" בתיעוד).
  const finalHtml = htmlContent + footerHtml();
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
    .replace(/&nbsp;/g, ' ')
    // ההזחה של ה-HTML הפכה לרווחים מובילים בכל שורה, ושורות ריקות התרבו בין הטבלאות.
    .split('\n').map((line) => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// tpl אופציונלי — override מ-settings/messageTemplates (Firestore), נערך ב-admin-messages.html.
// כשקיים, מחליף גם את הנושא וגם את גוף ההודעה — טקסט חופשי דרך richBodyHtml, כולל תיבת-קוד/כפתור
// ממותגים אם {code}/{link} יושבים על שורה נפרדת משלהם בתבנית.
export async function sendLoginCodeEmail(env, { toEmail, toName, code, tpl, kind = 'welcome' }) {
  // בניגוד לבעלי-עסקים, לאוהד אין accessToken אישי (הכניסה היא תמיד טלפון+קוד) — אז {link} כאן
  // הוא כתובת האתר הכללית, זהה לכל אוהד, לא קישור-קסם מותאם-אישית.
  const vars = { name: toName || '', code, link: 'https://yellowzone.co.il/welcome.html' };
  const isResend = kind === 'resend';
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : (isResend ? 'קוד הכניסה שלכם ל-Yellow Zone' : 'אתם בפנים — קוד הכניסה שלכם ל-Yellow Zone');
  const htmlContent = tpl?.body
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px">${boundedColumnHtml(brandHeaderHtml() + richBodyHtml(tpl.body, vars, 'כניסה לאתר'))}</div>`
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
  });
}

// מייל שני, נפרד מקוד הכניסה — נשלח כשעסק (לא רק החברות של הבעלים) מאושר לאינדקס
export async function sendBusinessApprovedEmail(env, { toEmail, ownerName, businessName, dashboardLink, tpl }) {
  const vars = { name: ownerName || '', business: businessName, link: dashboardLink };
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : 'העסק שלך אושר לאינדקס Yellow Zone';
  const htmlContent = tpl?.body
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px">${boundedColumnHtml(brandHeaderHtml() + richBodyHtml(tpl.body, vars, 'כניסה לאזור העסק שלי'))}</div>`
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
  });
}

// שידור חד-פעמי לקהל (מרכז הודעות, admin-dashboard.html) — subject/body מגיעים מהמנהל
// (טיוטה ב-settings/broadcastDraft), עם placeholders {name}/{business}/{link} שמוחלפים לכל נמען בנפרד.
export async function sendBroadcastEmail(env, { toEmail, toName, subject, body, vars }) {
  const finalSubject = applyVars(subject, vars);
  const htmlContent = `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px;line-height:1.7">${boundedColumnHtml(brandHeaderHtml() + richBodyHtml(body, vars, vars.code ? 'כניסה לאתר' : 'כניסה לאזור העסק שלי'))}</div>`;
  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject: finalSubject,
    htmlContent,
  });
}

// מייל מאוחד — כשבעל עסק מאושר גם כאוהד וגם כבעל עסק באותה פעולה
export async function sendCombinedWelcomeEmail(env, { toEmail, toName, code, businessName, dashboardLink, tpl }) {
  const vars = { name: toName || '', code, business: businessName, link: dashboardLink };
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : 'ברוכים הבאים ל-Yellow Zone';
  const htmlContent = tpl?.body
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px">${boundedColumnHtml(brandHeaderHtml() + richBodyHtml(tpl.body, vars, 'כניסה לאזור העסק שלי'))}</div>`
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
  });
}
