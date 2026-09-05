// ══ §415 — בדיקה שמריצה את הקוד עצמו (לא מחקה אותו) ═══════════════════════════════════════
// שלושה דברים נבדקים כאן, וכולם דרך הפונקציות האמיתיות של worker/src:
//   1. בלוק ההזמנה לגוגל מופיע למי שאין לו חשבון מקושר — ולא מופיע כשיש, ולא בשידור.
//   2. כל מייל יוצא נושא את התג הנכון (login / bizApproved / combined / broadcast).
//   3. eventTags יודע לקרוא את שלוש הצורות ש-Brevo מחזיר בהן תגים.
// ⚠️ הריצה **לא** נוגעת ב-Brevo ולא ב-Firestore: fetch מוחלף בתופס-בקשות מקומי.
import {
  sendLoginCodeEmail, sendBusinessApprovedEmail, sendCombinedWelcomeEmail, sendBroadcastEmail,
} from './worker/src/brevo.js';
import { eventTags } from './worker/src/brevo-webhook.js';

let captured = null;
globalThis.fetch = async (url, opts) => {
  captured = { url, body: JSON.parse(opts.body) };
  return { ok: true, text: async () => '' };
};
const env = { BREVO_API_KEY: 'x', SENDER_EMAIL: 'a@b.c' };

let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + name + (cond ? '' : '  ← ' + (extra || '')));
  if (!cond) fails++;
}
const INVITE = 'הכניסה הקלה: פעם אחת עם Google';
const LINKED = 'אפשר גם בלי הקוד';

console.log('\n── 1. בלוק הגוגל: למי הוא מופיע ──────────────────────────────');

await sendLoginCodeEmail(env, { toEmail: 'a@a.com', toName: 'דנה', code: '123456', googleInvite: true });
check('מייל קוד-כניסה למי שאין לו גוגל — מכיל את ההזמנה', captured.body.htmlContent.includes(INVITE));
check('...ולא מכיל את הנוסח של המקושרים', !captured.body.htmlContent.includes(LINKED));
check('...והתג הוא login', JSON.stringify(captured.body.tags) === '["login"]', JSON.stringify(captured.body.tags));

await sendLoginCodeEmail(env, { toEmail: 'a@a.com', toName: 'דנה', code: '123456', googleEmail: 'd@gmail.com', googleInvite: true });
check('מי שכבר מקושר — מקבל את התזכורת ולא את ההזמנה',
      captured.body.htmlContent.includes(LINKED) && !captured.body.htmlContent.includes(INVITE));
check('...והמייל שלו מופיע בגוף', captured.body.htmlContent.includes('d@gmail.com'));

await sendLoginCodeEmail(env, { toEmail: 'a@a.com', toName: 'דנה', code: '123456' });
check('בלי דגל ובלי חשבון — אין שום בלוק גוגל',
      !captured.body.htmlContent.includes(INVITE) && !captured.body.htmlContent.includes(LINKED));

await sendBusinessApprovedEmail(env, { toEmail: 'b@b.com', ownerName: 'רן', businessName: 'עסק', dashboardLink: 'https://x/y', googleInvite: true });
check('מכתב אישור-עסק — ההזמנה מופיעה', captured.body.htmlContent.includes(INVITE));
check('...והתג הוא bizApproved', JSON.stringify(captured.body.tags) === '["bizApproved"]', JSON.stringify(captured.body.tags));

await sendCombinedWelcomeEmail(env, { toEmail: 'c@c.com', toName: 'רן', code: '111111', businessName: 'עסק', dashboardLink: 'https://x/y', googleInvite: true });
check('המכתב המאוחד — ההזמנה מופיעה', captured.body.htmlContent.includes(INVITE));
check('...והתג הוא combined', JSON.stringify(captured.body.tags) === '["combined"]', JSON.stringify(captured.body.tags));

console.log('\n── 2. השידור ההמוני: תג משלו, ולעולם בלי בלוק גוגל ───────────');
await sendBroadcastEmail(env, { toEmail: 'd@d.com', toName: 'דנה', subject: 'נושא', body: 'שלום {name}', vars: { name: 'דנה' } });
check('תג broadcast', JSON.stringify(captured.body.tags) === '["broadcast"]', JSON.stringify(captured.body.tags));
check('אין בלוק גוגל בשידור (לא הזמנה ולא תזכורת)',
      !captured.body.htmlContent.includes(INVITE) && !captured.body.htmlContent.includes(LINKED));
check('המשתנים הוחלפו בפועל', captured.body.htmlContent.includes('שלום דנה'));

console.log('\n── 3. eventTags — שלוש הצורות של Brevo ───────────────────────');
check('מערך tags', eventTags({ tags: ['broadcast'] }).includes('broadcast'));
check('מחרוזת tag', eventTags({ tag: 'broadcast' }).includes('broadcast'));
check('tag כ-JSON מקודד', eventTags({ tag: '["broadcast"]' }).includes('broadcast'));
check('בלי תגים — מערך ריק (=התנהגות ישנה)', eventTags({}).length === 0);
check('תג אחר אינו broadcast', !eventTags({ tag: 'login' }).includes('broadcast'));

console.log(fails ? `\n❌ ${fails} בדיקות נכשלו\n` : '\n✅ הכל עבר\n');
process.exit(fails ? 1 : 0);
