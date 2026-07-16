const REPLY_TO_BUSINESS = 'yellowzonemta@gmail.com';
const LOGO_URL = 'https://habayit-hatsahov.github.io/mtabusiness/Maccabi.svg';

// ריבוע צהוב עם לוגו מכבי ת"א — תצוגת קוד הכניסה במיילים האוטומטיים
function codeBoxHtml(code) {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:20px auto">
      <tr><td style="width:170px;background:#FFDE00;border-radius:20px;padding:52px 10px;text-align:center">
        <img src="${LOGO_URL}" width="34" alt="Yellow Zone" style="display:block;margin:0 auto 12px auto" />
        <div style="font-size:34px;font-weight:900;letter-spacing:4px;color:#16130a;line-height:1">${code}</div>
      </td></tr>
    </table>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyVars(text, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v ?? ''), text);
}

// טקסט חופשי (כמו שנערך ב-admin-messages.html) -> HTML פשוט: שורה ריקה = פסקה חדשה
function textToHtml(text) {
  return escapeHtml(text)
    .split('\n\n')
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

async function sendBrevoEmail(env, { sender, to, replyTo, subject, htmlContent }) {
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
      htmlContent,
    }),
  });
  if (!resp.ok) throw new Error('brevo_send_failed: ' + (await resp.text()));
}

// tpl אופציונלי — override מ-settings/messageTemplates (Firestore), נערך ב-admin-messages.html.
// כשקיים, מחליף גם את הנושא וגם את גוף ההודעה (כטקסט פשוט, לא ה-HTML המעוצב של הדיפולט).
export async function sendLoginCodeEmail(env, { toEmail, toName, code, tpl }) {
  const vars = { name: toName || '', code };
  const subject = tpl?.subject
    ? applyVars(tpl.subject, vars)
    : 'ברוכים הבאים ל-Yellow Zone — קוד הכניסה שלך';
  const htmlContent = tpl?.body
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">${textToHtml(applyVars(tpl.body, vars))}</div>`
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>ברוכים הבאים ל-Yellow Zone 💛</h2>
          <p style="color:#555">הנה קוד הכניסה שלך לאינדקס:</p>
          ${codeBoxHtml(code)}
          <p>הזינו אותו במסך הכניסה יחד עם מספר הטלפון שלכם.</p>
        </div>`;

  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: toName || '' }],
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
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">${textToHtml(applyVars(tpl.body, vars))}</div>`
    : `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>שמחים לבשר — "${businessName}" אושר! 💛</h2>
          <p style="color:#555">העסק שלך עכשיו חלק מהאינדקס הבלעדי שלנו.</p>
          <p><a href="${dashboardLink}" style="display:inline-block;background:#FFDE00;color:#16130a;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:14px;margin-top:8px">לניהול העסק שלך</a></p>
          <p style="color:#888;font-size:13px">עריכת פרטים, תמונות ועוד — הקישור אישי ולא ניתן להעברה</p>
        </div>`;

  await sendBrevoEmail(env, {
    to: [{ email: toEmail, name: ownerName || '' }],
    replyTo: { email: REPLY_TO_BUSINESS },
    subject,
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
    ? `<div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">${textToHtml(applyVars(tpl.body, vars))}</div>`
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
    replyTo: { email: REPLY_TO_BUSINESS },
    subject,
    htmlContent,
  });
}
