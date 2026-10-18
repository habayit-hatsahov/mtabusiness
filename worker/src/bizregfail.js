// ══ §548 — תקלה בהרשמת עסק: התראה למנהל + שמירת הפרטים ══════════════════════════════════
// §547: הרשמת עסקים נדחתה 5 ימים ואיש לא ידע – התקלה נרשמה ביומן האירועים בלבד, ובעל העסק
// היחיד שנתקל בה איבד את כל מה שמילא. מעכשיו business.html מדווח לכאן על כל כשל:
//   kind='save'  – הרשומה לא נשמרה. נשמרים **כל פרטי הטופס** ב-bizRegFailures, כדי שאפשר יהיה
//                  ליצור את העסק בלי שבעל העסק ימלא שוב, ונשלח מייל עם פרטי הקשר.
//   kind='media' – הרשומה נשמרה, התמונות/ראיית האימות לא עלו. מייל עם שם העסק והמזהה.
// ובשני המקרים: פוש לאפליקציה של כל מנהל (isAdmin) שיש לו מכשיר רשום.
// ⚠️ נתיב ציבורי (אורח לא מחובר) – לכן מכסת IP, גבולות אורך, ושום דבר מהקלט לא נכתב כ-HTML בלי בריחה.
import { firestoreCreateDoc, firestoreRunQuery, firestorePatch } from './firestore.js';
import { sendFcmToMember } from './fcm.js';
import { sendAdminAlertEmail } from './brevo.js';

const ADMIN_EMAIL = 'yellowzonemta@gmail.com';
const s = (v, n = 200) => String(v == null ? '' : v).slice(0, n);

export async function handleBizRegFailed(input, env, accessToken) {
  const kind = input && input.kind === 'media' ? 'media' : 'save';
  const p = {
    code: s(input?.code, 60), bizId: s(input?.bizId, 60), device: s(input?.device, 20),
    name: s(input?.name, 120), ownerFirst: s(input?.ownerFirst, 60), ownerLast: s(input?.ownerLast, 60),
    ownerPhone: s(input?.ownerPhone, 30), ownerEmail: s(input?.ownerEmail, 120),
  };
  if (!p.name && !p.ownerPhone && !p.ownerEmail && !p.bizId) return { error: 'invalid_request' };
  // הטופס המלא – כטקסט JSON (לא מפוענח לשדות: זה גיבוי לשחזור, לא רשומה חיה)
  const formJson = kind === 'save' ? s(input?.formJson, 60000) : '';

  const out = { saved: false, email: 'skipped', push: 0 };
  let failId = '';
  try {
    failId = await firestoreCreateDoc(env, accessToken, 'bizRegFailures', {
      kind, ...p, formJson, createdAt: new Date(), handled: false,
    });
    out.saved = true;
  } catch (e) { console.error('bizRegFailures write failed', e); }

  const who = [p.ownerFirst, p.ownerLast].filter(Boolean).join(' ') || '(בלי שם)';
  const title = kind === 'save' ? '🔴 הרשמת עסק נכשלה' : '🟠 עסק נרשם בלי תמונות';
  const line = kind === 'save'
    ? `${p.name || 'עסק'} – ${who}, ${p.ownerPhone || p.ownerEmail}. הפרטים נשמרו.`
    : `${p.name || 'עסק'} – התמונות/האימות לא עלו (${p.code}).`;

  try {
    await sendAdminAlertEmail(env, {
      to: ADMIN_EMAIL, subject: `${title}: ${p.name || who}`,
      rows: [
        ['מה קרה', kind === 'save' ? 'הרשומה לא נשמרה – בעל העסק ראה מסך כשל' : 'הרשומה נשמרה, התמונות/ראיית האימות לא עלו'],
        ['שם העסק', p.name], ['בעל העסק', who], ['טלפון', p.ownerPhone], ['מייל', p.ownerEmail],
        ['קוד שגיאה', p.code], ['מכשיר', p.device], ['מזהה עסק', p.bizId],
        ['גיבוי הטופס', failId ? `bizRegFailures/${failId}` : (kind === 'save' ? 'לא נשמר!' : '')],
      ],
    });
    out.email = 'sent';
  } catch (e) { console.error('bizRegFailed email failed', e); out.email = 'failed'; }

  try {
    const admins = await firestoreRunQuery(env, accessToken, 'members', 'isAdmin', true, 10);
    for (const a of admins) {
      const tokens = a.fields.nativePushTokens || {};
      if (!Object.keys(tokens).length) continue;
      const r = await sendFcmToMember(env, accessToken, tokens, {
        title, body: line, data: { link: '/admin-dashboard.html' },
      });
      out.push += r.sent;
      if (r.deadKeys.length) {
        const remaining = Object.fromEntries(Object.entries(tokens).filter(([k]) => !r.deadKeys.includes(k)));
        try { await firestorePatch(env, accessToken, `members/${a.id}`, { nativePushTokens: remaining }); } catch (e) {}
      }
    }
  } catch (e) { console.error('bizRegFailed push failed', e); }

  return { ok: out.saved || out.email === 'sent', ...out };
}
