export async function sendLoginCodeEmail(env, { toEmail, toName, code }) {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Yellow Zone', email: env.SENDER_EMAIL },
      to: [{ email: toEmail, name: toName || '' }],
      subject: 'ברוכים הבאים ל-Yellow Zone — קוד הכניסה שלך',
      htmlContent: `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>ברוכים הבאים ל-Yellow Zone 💛</h2>
          <p style="color:#555">הנה קוד הכניסה שלך לאינדקס:</p>
          <p style="font-size:32px;font-weight:900;letter-spacing:6px">${code}</p>
          <p>הזינו אותו במסך הכניסה יחד עם מספר הטלפון שלכם.</p>
        </div>`,
    }),
  });
  if (!resp.ok) throw new Error('brevo_send_failed: ' + (await resp.text()));
}

// מייל שני, נפרד מקוד הכניסה — נשלח כשעסק (לא רק החברות של הבעלים) מאושר לאינדקס
export async function sendBusinessApprovedEmail(env, { toEmail, ownerName, businessName, dashboardLink }) {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Yellow Zone', email: env.SENDER_EMAIL },
      to: [{ email: toEmail, name: ownerName || '' }],
      subject: 'העסק שלך אושר לאינדקס Yellow Zone 💛',
      htmlContent: `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>שמחים לבשר — "${businessName}" אושר! 💛</h2>
          <p style="color:#555">העסק שלך עכשיו חלק מהאינדקס הבלעדי שלנו.</p>
          <p><a href="${dashboardLink}" style="display:inline-block;background:#FFDE00;color:#16130a;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:14px;margin-top:8px">לניהול העסק שלך</a></p>
          <p style="color:#888;font-size:13px">עריכת פרטים, תמונות ועוד — הקישור אישי ולא ניתן להעברה</p>
        </div>`,
    }),
  });
  if (!resp.ok) throw new Error('brevo_send_failed: ' + (await resp.text()));
}

// מייל מאוחד — כשבעל עסק מאושר גם כאוהד וגם כבעל עסק באותה פעולה (התוכן המדויק ייקבע בהמשך)
export async function sendCombinedWelcomeEmail(env, { toEmail, toName, code, businessName, dashboardLink }) {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Yellow Zone', email: env.SENDER_EMAIL },
      to: [{ email: toEmail, name: toName || '' }],
      subject: 'ברוכים הבאים ל-Yellow Zone 💛',
      htmlContent: `
        <div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
          <h2>ברוכים הבאים ל-Yellow Zone 💛</h2>
          <p style="color:#555">הנה קוד הכניסה שלך לאינדקס (כאוהד):</p>
          <p style="font-size:32px;font-weight:900;letter-spacing:6px">${code}</p>
          <p>הזינו אותו במסך הכניסה יחד עם מספר הטלפון שלכם.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#555">בנוסף — העסק "${businessName}" שלך אושר לאינדקס! 💛</p>
          <p><a href="${dashboardLink}" style="display:inline-block;background:#FFDE00;color:#16130a;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:14px;margin-top:8px">לניהול העסק שלך</a></p>
        </div>`,
    }),
  });
  if (!resp.ok) throw new Error('brevo_send_failed: ' + (await resp.text()));
}
