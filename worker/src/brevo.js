// כתובת-מענה לכל המיילים היוצאים (לא רק לבעלי-עסקים יותר) — המשתמש ביקש במפורש (2026-08-05) שגם
// אוהדים יוכלו להשיב למייל שלהם, כדי לאפשר שיתופי-פעולה שמתחילים מתגובה חופשית.
const REPLY_TO = 'yellowzonemta@gmail.com';
const LOGO_URL = 'https://yellowzone.co.il/images/yellowzone-mark-square.png';
const LOGO_HORIZONTAL_URL = 'https://yellowzone.co.il/images/yellowzone-logo-horizontal.png';

// ריבוע צהוב עם לוגו מכבי ת"א — תצוגת קוד הכניסה במיילים האוטומטיים. כתובת הכניסה מוצגת כשורת-
// כיתוב קטנה בתוך אותה תיבה (לא כפתור/פסקה נפרדת) — כדי שלא יהיה צורך ב-{login_link} נוסף אחרי
// הקוד בכל תבנית שרוצה גם להראות לאן נכנסים איתו.
function codeBoxHtml(code) {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:20px auto">
      <tr><td style="width:260px;background:#FFDE00;border-radius:20px;padding:22px 20px;text-align:center">
        <img src="${LOGO_URL}" width="26" alt="Yellow Zone" style="display:block;margin:0 auto 8px auto" />
        <div style="font-size:32px;font-weight:900;letter-spacing:4px;color:#16130a;line-height:1">${code}</div>
        <div style="margin-top:10px"><a href="https://yellowzone.co.il" style="font-size:14px;font-weight:700;color:#16130a;text-decoration:underline">yellowzone.co.il</a></div>
      </td></tr>
    </table>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyVars(text, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v ?? ''), text);
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
  return bodyTemplate.split('\n\n').map((para) => {
    const trimmed = para.trim();
    if (trimmed === '{code}' && vars.code) return codeBoxHtml(vars.code);
    if (trimmed === '{link}' && vars.link) return linkButtonHtml(vars.link, linkLabel || 'כניסה');
    if (trimmed === '{login_link}') return linkButtonHtml('https://yellowzone.co.il/welcome.html', 'כניסה לאתר');
    return `<p style="margin:0 0 16px 0">${escapeHtml(applyVars(para, vars)).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

// כתובת-פיזית קטנה בתחתית כל מייל אוטומטי — לא לשם יצירת-קשר בפועל (הפרויקט קהילתי, בלי משרד
// רשום), רק כי Gmail/פילטרי-ספאם מצפים לראות כתובת-דואר-כלשהי בפוטר מייל שיווקי/אוטומטי; חסרה = סמן-ספאם.
// שורת "לא ספאם" — עידוד לנמען לשפר את המוניטין של הדומיין (Gmail/ספאם-פילטרים לומדים ממי שמסמן ידנית).
function footerHtml() {
  return `<div style="text-align:center;color:#999;font-size:11px;margin-top:20px;line-height:1.6">
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

// html->text גס, רק להסרת תגיות עצמן (לא escape — הטקסט כבר-לא-מקודד, עובר ישירות ל-textContent
// שממילא לא מפרש HTML). מספיק ל-alt-text, לא מטרתו לשמר מבנה עשיר.
function stripHtml(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

// tpl אופציונלי — override מ-settings/messageTemplates (Firestore), נערך ב-admin-messages.html.
// כשקיים, מחליף גם את הנושא וגם את גוף ההודעה — טקסט חופשי דרך richBodyHtml, כולל תיבת-קוד/כפתור
// ממותגים אם {code}/{link} יושבים על שורה נפרדת משלהם בתבנית.
export async function sendLoginCodeEmail(env, { toEmail, toName, code, tpl }) {
  // בניגוד לבעלי-עסקים, לאוהד אין accessToken אישי (הכניסה היא תמיד טלפון+קוד) — אז {link} כאן
  // הוא כתובת האתר הכללית, זהה לכל אוהד, לא קישור-קסם מותאם-אישית.
  const vars = { name: toName || '', code, link: 'https://yellowzone.co.il/welcome.html' };
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : 'ברוכים הבאים ל-Yellow Zone — קוד הכניסה שלך';
  const htmlContent = tpl?.body
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px">${boundedColumnHtml(brandHeaderHtml() + richBodyHtml(tpl.body, vars, 'כניסה לאתר'))}</div>`
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>ברוכים הבאים ל-Yellow Zone 💛</h2>
          <p style="color:#555">הנה קוד הכניסה שלך לאינדקס:</p>
          ${codeBoxHtml(code)}
          <p>הזינו אותו במסך הכניסה יחד עם מספר הטלפון שלכם.</p>
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
    : 'העסק שלך אושר לאינדקס Yellow Zone 💛';
  const htmlContent = tpl?.body
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px">${boundedColumnHtml(brandHeaderHtml() + richBodyHtml(tpl.body, vars, 'כניסה לאזור העסק שלי'))}</div>`
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>שמחים לבשר — "${businessName}" אושר! 💛</h2>
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
    : 'ברוכים הבאים ל-Yellow Zone 💛';
  const htmlContent = tpl?.body
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px">${boundedColumnHtml(brandHeaderHtml() + richBodyHtml(tpl.body, vars, 'כניסה לאזור העסק שלי'))}</div>`
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>ברוכים הבאים ל-Yellow Zone 💛</h2>
          <p style="color:#555">הנה קוד הכניסה שלך לאינדקס (כאוהד):</p>
          ${codeBoxHtml(code)}
          <p>הזינו אותו במסך הכניסה יחד עם מספר הטלפון שלכם.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#555">בנוסף — העסק "${businessName}" שלך אושר לאינדקס! 💛</p>
          <p><a href="${dashboardLink}" style="display:inline-block;background:#FFDE00;color:#16130a;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:14px;margin-top:8px">לניהול העסק שלך</a></p>
        </div>`;

  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
    replyTo: { email: REPLY_TO },
    subject,
    htmlContent,
  });
}
