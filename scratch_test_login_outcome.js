// ── §402 — מריץ את פונקציות התוצאה **מתוך admin-dashboard.html עצמו** ────────────────────
// ⚠️ הבלוקים נשלפים לפי תוכן ולא לפי מספרי שורה (feedback_test_harness_anchor_by_content).
// הנתונים הם ששת הסשנים האמיתיים של 3.9, כפי שנשלפו מ-Firestore.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('admin-dashboard.html', 'utf8');
function slice(startMark, endMark, why) {
  const i = src.indexOf(startMark); if (i < 0) throw new Error('עוגן פתיחה לא נמצא: ' + why);
  const j = src.indexOf(endMark, i);  if (j < 0) throw new Error('עוגן סגירה לא נמצא: ' + why);
  return src.slice(i, j + endMark.length);
}
const labels  = slice('const LOGIN_FAIL_LABELS = {', "+ (p.late ? ' (תשובה מאוחרת)' : '');\n}", 'תוויות');
const outcome = slice('let _hbOutcomeIdx = null', '`<span class="miss-badge">🔴 לא נכנס — שווה לפנות אליו</span>`;\n}', 'תוצאה');
for (const [n, c] of [['labels', labels], ['outcome', outcome]])
  if (c.split('\n').length > 140) throw new Error(n + ' נשלף ארוך מדי — העוגן תפס יותר מדי');

const ev = (at, type, o) => ({ at: new Date(at), type, sessionId: o.s || null, memberId: o.m || null,
                               channel: o.ch || null, device: o.dev || 'mobile', phone: o.ph || null, blockId: o.env || '' });
// ששת הסשנים של 3.9 (UTC), אחד לאחד מהמדידה
const E = [
  ev('2026-09-03T09:40:55Z','loginFail',{s:'S1',ch:'google:notLinked',dev:'desktop'}),
  ev('2026-09-03T09:41:41Z','pageView',{s:'S1',m:'A2GYdyjKrj'}),
  ev('2026-09-03T09:59:22Z','loginFail',{s:'S2',ch:'error',ph:'0502042330'}),
  ev('2026-09-03T09:59:36Z','pageView',{s:'S2',m:'5y8yeGh7kS'}),
  ev('2026-09-03T10:00:27Z','loginFail',{s:'S3',ch:'authTimeout',ph:'0584439988'}),
  ev('2026-09-03T10:00:36Z','pageView',{s:'S3',m:'cRrLUiHuJl'}),
  ev('2026-09-03T11:36:02Z','loginFail',{s:'S4',ch:'google:notLinked'}),            // ❌ לא נכנס, ובלי טלפון
  ev('2026-09-03T11:45:17Z','loginFail',{s:'S5',ch:'fetchTimeout',ph:'0585835311'}),
  ev('2026-09-03T11:45:20Z','pageView',{s:'S5',m:'KPTCd2XmzH'}),
  ev('2026-09-02T07:31:37Z','loginFail',{s:'S6',ch:'fetchTimeout',ph:'0544254737'}),// ❌ שובל צרפתי — עם טלפון
  // מקרה-קצה: נכשל בסשן אחד ונכנס מסשן אחר (טאב חדש) — חייב לצאת 'mem' ולא 'לא נכנס'
  ev('2026-09-02T12:23:25Z','loginFail',{s:'S7',ch:'badCode',ph:'0523777766'}),
  ev('2026-09-02T12:29:00Z','pageView',{s:'S7b',m:'GvEdrgDJVH'}),
  // ערוץ google עם פסק-זמן — הוא **חייב** לצאת "תקלה אצלנו"
  ev('2026-09-02T20:19:44Z','loginFail',{s:'S8',ch:'google:fetchTimeout'}),
  // §403 — הצעת חיבור-בלחיצה, וכשל של פעולת-הקישור עצמה
  ev('2026-09-02T21:00:00Z','loginFail',{s:'S9',ch:'google:canLink'}),
  ev('2026-09-02T21:00:20Z','pageView',{s:'S9',m:'SICIYz7v5C'}),
  ev('2026-09-02T21:10:00Z','loginFail',{s:'SA',ch:'google:link:email_mismatch'}),
];
const FANS = [
  { id:'5y8yeGh7kS', name:'מאיר דהן',      phone:'0502042330', status:'approved' },
  { id:'cRrLUiHuJl', name:'ליאור ישראל',   phone:'0584439988', status:'approved' },
  { id:'KPTCd2XmzH', name:'eliezer bitton',phone:'0585835311', status:'approved' },
  { id:'tEyFUx9FRK', name:'שובל צרפתי',    phone:'0544254737', status:'approved' },
  { id:'GvEdrgDJVH', name:'נבדק סשן-אחר',  phone:'0523777766', status:'approved' },
];
const sandbox = { platformEvents: E, Date, Math, console, JSON };
vm.createContext(sandbox);
vm.runInContext(labels + '\n' + outcome + `
globalThis.__run = function(fans) {
  const key = p => String(p||'').replace(/[^0-9]/g,'').slice(-9);
  return platformEvents.filter(e => e.type === 'loginFail').map(e => {
    const fan = e.phone ? fans.find(f => key(f.phone) === key(e.phone)) || null : null;
    const x = { at: e.at, sessionId: e.sessionId, phone: e.phone, fan,
                label: hbLoginFailLabel(e.channel),
                ours: HB_LOGIN_FAIL_OURS.includes(hbLoginFailBase(e.channel)), ch: e.channel };
    x.outcome = hbLoginOutcome(x);
    x.badge = hbOutcomeBadge(x.outcome);
    return x;
  });
};`, sandbox);

const rows = sandbox.__run(FANS);
const strip = h => h.replace(/<[^>]+>/g, '');
console.log('ערוץ'.padEnd(22) + 'תווית'.padEnd(46) + 'סיווג'.padEnd(13) + 'תוצאה');
for (const r of rows)
  console.log(String(r.ch).padEnd(22) + r.label.padEnd(46) + (r.ours?'תקלה אצלנו':'לא תקלה').padEnd(13) + strip(r.badge));

console.log('\n══ מה חייב להיות נכון ══');
const get = ch => rows.find(r => r.ch === ch);
const chk = (t, c) => console.log((c ? '✅' : '❌') + ' ' + t);
chk('google:notLinked כבר לא "סיבה לא מוכרת"', !get('google:notLinked').label.includes('לא מוכרת'));
chk('google:notLinked נשאר "לא תקלה"', !get('google:notLinked').ours);
chk('🔴 google:fetchTimeout מסווג "תקלה אצלנו" (לפני §402: "לא תקלה")', get('google:fetchTimeout').ours);
chk('authTimeout — נכנס אחרי 9 שנ\'', get('authTimeout').outcome.kind === 'sess' && get('authTimeout').outcome.secs === 9);
chk('fetchTimeout של eliezer — נכנס אחרי 3 שנ\'', rows.filter(r=>r.ch==='fetchTimeout')[0].outcome.secs === 3);
chk('שובל צרפתי — "לא נכנס" חד-משמעי (יש טלפון)', (()=>{const o=rows.filter(r=>r.ch==='fetchTimeout')[1].outcome; return o.kind==='none' && !o.weak;})());
chk('notLinked בלי טלפון — "לא נמצאה כניסה", לא פסק-דין', get('google:notLinked') && rows.find(r=>r.sessionId==='S4').outcome.weak === true);
chk('כניסה מסשן אחר מזוהה כ-mem ולא כ"לא נכנס"', get('badCode').outcome.kind === 'mem');
chk('ותוצג במפורש כ"מסשן אחר"', strip(get('badCode').badge).includes('מסשן אחר'));
chk('§403 google:canLink מתויג ואינו "תקלה אצלנו"',
    !get('google:canLink').label.includes('לא מוכרת') && !get('google:canLink').ours);
chk('§403 כשל-קישור מתויג **ונספר כתקלה אצלנו**',
    !get('google:link:email_mismatch').label.includes('לא מוכרת') && get('google:link:email_mismatch').ours);
chk('§403 כשל-קישור בלי הזנב "· דרך Google"',
    !get('google:link:email_mismatch').label.includes('דרך Google'));
