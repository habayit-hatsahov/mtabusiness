// ── §403 — מריץ את מסלול הכניסה-עם-Google **מתוך welcome.html** ─────────────────────────
// הענף שנבדק: תשובת `google_not_linked` שנושאת `linkable` → הצעת חיבור-בלחיצה → הלחיצה
// עצמה → כניסה. ⚠️ נשלף לפי תוכן, ומאומת שהוא נושא את הענף החדש.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('welcome.html', 'utf8');
const a = src.indexOf('let heroGoogleBusy = false;');
const endMark = '\nfunction heroEsc(v) {';
const b = src.indexOf(endMark, a);
if (a < 0 || b < 0) throw new Error('לא נמצא הבלוק');
const code = src.slice(a, b);
for (const must of ['heroGoogleLinkAndEnter', "data.linkable", 'google:canLink'])
  if (!code.includes(must)) throw new Error('הבלוק שנשלף חסר: ' + must);

function build(apiResponses) {
  const calls = [], msgs = [], events = [], entered = [];
  const box = {
    console, setTimeout, clearTimeout, AbortController, Promise, JSON, Date, String,
    window: {}, document: { getElementById: () => null },
    HERO_TIMEOUT_MS: 8000, HERO_HARD_ABORT_MS: 35000,
    // §405 — מוגדר מעל הבלוק שנשלף (ליד heroProgress), ולכן חייב להגיע כאן כ-stub.
    // ⚠️ בלעדיו הענף "יש טוקן" זורק ReferenceError — וזה בדיוק מה שההרנס תפס.
    HERO_AUTH_PROGRESS: 'הקוד אושר — נכנסים…',
    HERO_G_MSGS: {},
    heroGMsg: (h, w) => msgs.push((w ? '[warn] ' : '') + String(h).replace(/<[^>]+>/g, '')),
    heroHideErr: () => {},
    heroEsc: (v) => String(v == null ? '' : v),
    heroEnvTagAt: () => 'web|idb-ok|0.1s',
    heroIsTimeout: (e) => !!e && (e.name === 'AbortError' || e.message === 'hb_timeout'),
    heroWithTimeout: (p) => p,
    heroProgress: () => () => {},
    heroRunAuth: (tok, fin) => ({ settled: Promise.resolve('uid-' + tok), done: (u) => fin(u), giveUp: () => {} }),
    heroFinishLogin: (uid) => entered.push(uid),
    hbApiFetch: (path, opts) => {
      calls.push({ path, body: JSON.parse(opts.body) });
      return Promise.resolve({ json: () => Promise.resolve(apiResponses[path]) });
    },
  };
  box.window.logEvent = (t, e) => events.push(t + ':' + e.channel);
  box.window.hbBumpNetFail = () => 1;
  vm.createContext(box);
  vm.runInContext(code + '\n; globalThis.__login = heroGoogleLogin; globalThis.__pending = () => heroPendingLink;', box);
  return { box, calls, msgs, events, entered };
}
(async () => {
  const chk = (t, c) => { console.log((c ? '✅' : '❌') + ' ' + t); if (!c) process.exitCode = 1; };

  // ── 1. יש רשומה תואמת → הצעה, ואז לחיצה שמכניסה ──────────────────────────────────────
  let t = build({
    '/google-login':  { error: 'google_not_linked', email: 'dan@gmail.com',
                        linkable: { memberId: 'M123', name: "דן כ'" } },
    '/google-attach': { ok: true, customToken: 'TOK' },
  });
  await t.box.__login({ credential: 'IDT' });
  console.log('הודעה שהוצגה: ' + t.msgs.join(' | '));
  chk('ההצעה מזכירה את השם שנמצא', t.msgs.some(m => m.includes("דן כ'")));
  chk('ומזכירה את כתובת המייל', t.msgs.some(m => m.includes('dan@gmail.com')));
  chk("נותנת מוצא למי שזה לא הוא", t.msgs.some(m => m.includes('לא אתם')));
  chk("נרשם ערוץ 'canLink' ולא 'notLinked'", t.events.includes('loginFail:google:canLink'));
  chk('הטוקן והרשומה נשמרו ללחיצה', !!t.box.__pending() && t.box.__pending().memberId === 'M123');

  await t.box.window.heroGoogleLinkAndEnter();
  const attach = t.calls.find(c => c.path === '/google-attach');
  chk('הלחיצה פונה ל-/google-attach', !!attach);
  chk('ושולחת את שני השדות שהשער דורש', attach && attach.body.memberId === 'M123' && attach.body.idToken === 'IDT');
  chk('🔑 והאדם נכנס — בקריאה אחת, בלי /google-login שני', t.entered.length === 1 && t.calls.length === 2);
  chk('לחיצה חוזרת לא שולחת בקשה נוספת', (await t.box.window.heroGoogleLinkAndEnter(), t.calls.length === 2));

  // ── 2. אין רשומה תואמת → ההודעה הישנה של §399, בלי שינוי ─────────────────────────────
  t = build({ '/google-login': { error: 'google_not_linked', email: 'x@gmail.com' } });
  await t.box.__login({ credential: 'IDT' });
  chk("בלי linkable — נשארת הודעת §399", t.msgs.some(m => m.includes('עדיין לא חיברתם')));
  chk("והערוץ נשאר 'notLinked'", t.events.includes('loginFail:google:notLinked'));
  chk('ולא נשמר שום קישור ממתין', !t.box.__pending());

  // ── 3. ⚠️ הוורקר פסל את הקישור אחרי שאישר אותו — סתירה, ולא טעות של האדם ─────────────
  t = build({
    '/google-login':  { error: 'google_not_linked', email: 'dan@gmail.com',
                        linkable: { memberId: 'M123', name: "דן כ'" } },
    '/google-attach': { error: 'email_mismatch' },
  });
  await t.box.__login({ credential: 'IDT' });
  await t.box.window.heroGoogleLinkAndEnter();
  chk('כשל-קישור נרשם בערוץ נפרד', t.events.includes('loginFail:google:link:email_mismatch'));
  chk('והאדם מופנה למסלול שבטוח עובד', t.msgs.some(m => m.includes('הטלפון והקוד')));
  chk('ולא נכנס', t.entered.length === 0);

  // ── 4. מקושר כבר → כניסה רגילה, בלי לגעת בכלום ───────────────────────────────────────
  t = build({ '/google-login': { customToken: 'TOK2' } });
  await t.box.__login({ credential: 'IDT' });
  chk('חשבון מקושר — נכנס כרגיל', t.entered.length === 1 && t.calls.length === 1);
})();
