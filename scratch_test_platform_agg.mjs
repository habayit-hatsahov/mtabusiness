// §587 — platform-agg.js מול החישוב הישן של מרכז הניהול (computePlatformStats + funnelStats +
// regAbandonStats + googleSignupButtonStats + loginPathStats + googleLoginFailCount), על אירועי-אמת
// של יום אחד. חייבים לצאת זהים. הרצה: node scratch_test_platform_agg.mjs <events.json> <YYYY-MM-DD>
import fs from 'node:fs';
import { aggregatePlatformDay, ilDayRange, ilDayKey } from './platform-agg.js';

const [file, day] = process.argv.slice(2);
const { evs, members } = JSON.parse(fs.readFileSync(file, 'utf8'));
const V = v => v == null ? null : v.stringValue ?? v.integerValue ?? v.booleanValue ?? (v.timestampValue ? new Date(v.timestampValue) : null);
const all = evs.map(e => { const o = {}; for (const [k, v] of Object.entries(e.f)) o[k] = V(v); o.at = o.createdAt; o.path = String(o.path || '').toLowerCase(); return o; });
const [s, t] = ilDayRange(day);
const dayEvs = all.filter(e => e.at >= s && e.at < t);
const admins = ['__none__'];   // members.json כאן בלי isAdmin – הבדיקה על וריאנט "הכל"

// ── החישוב הישן, מועתק מהקובץ עצמו ולא נכתב מחדש ──
// ⚠️ מול הגרסה **שלפני** §587 (מ-git): הקובץ הנוכחי כבר קורא מהסיכום היומי עצמו.
const html = fs.readFileSync(process.env.OLD_ADMIN || 'admin-dashboard.html', 'utf8');
const cut = (a, b) => { const i = html.indexOf(a); const j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('cut ' + a); return html.slice(i, j); };
const old = new Function('platformEvents', 'MOCK_FANS', 'from0',
  cut('function adminMemberIds()', 'const platPct') +
  cut('const FAN_FUNNEL = {', '// ── §324 — מאיזה תאריך') +
  cut('function regAbandonStats()', '// ── §304 — משפך ההרשמה') +
  cut('function googleSignupButtonStats(block)', 'const BIZ_READY_REASONS') +
  `const RealDate = Date;
   return { a: computePlatformStats(1, true), fan: funnelStats(FAN_FUNNEL), biz: funnelStats(BIZ_FUNNEL),
            ab: regAbandonStats(), gs: googleSignupButtonStats('fanRegister'), lp: loginPathStats(), gf: googleLoginFailCount() };`);
// computePlatformStats(1) = "היום" לפי השעון; כאן היום הנבדק – ולכן מעבירים רק את אירועי היום,
// ומזיזים את Date.now לסוף אותו יום.
const realNow = Date.now; Date.now = () => t.getTime() - 1000;
const RD = Date; globalThis.Date = class extends RD { constructor(...a) { super(...(a.length ? a : [t.getTime() - 1000])); } static now() { return t.getTime() - 1000; } };
const o = old(dayEvs, [], null);
globalThis.Date = RD; Date.now = realNow;

const n = aggregatePlatformDay(dayEvs, admins);
const A = o.a;
const cmp = [];
const chk = (name, x, y) => cmp.push([(x === y ? '✅' : '❌'), name, x, y]);
for (const k of ['landing', 'home', 'fanOpen', 'fanSubmit', 'bizOpen', 'bizSubmit', 'loginOpen', 'direct', 'inRange'])
  chk(k, A[k], n.all[k]);
chk('landingSessions', A.landingSessions.size, n.all.landingSessions);
chk('homeSessions', A.homeSessions.size, n.all.homeSessions);
chk('device.mobile', A.device.mobile, n.all.device.mobile);
chk('device.desktop', A.device.desktop, n.all.device.desktop);
for (const k of ['regCard', 'preview', 'final']) chk('depth.' + k, A.depth[k].size, n.all.depth[k]);
chk('sources', JSON.stringify(Object.entries(A.sources).sort()), JSON.stringify(Object.entries(n.all.sources).sort()));
o.fan.forEach(r => chk('fan.' + r.key, r.n, n.funnel.fan[r.key]));
o.biz.forEach(r => chk('biz.' + r.key, r.n, n.funnel.biz[r.key]));
chk('abandon.opened', o.ab.opened, n.abandon.opened); chk('abandon.abandoned', o.ab.abandoned, n.abandon.abandoned);
chk('gs.shown', o.gs.shown, n.gsFan.shown); chk('gs.used', o.gs.used, n.gsFan.used); chk('gs.blocked', o.gs.blocked, n.gsFan.blocked);
chk('loginOk.google', o.lp.google, n.loginOk.google + n.loginOk.googleLink); chk('loginOk.code', o.lp.code, n.loginOk.code); chk('loginOk.total', o.lp.total, n.loginOk.total);
chk('googleFail', o.gf, n.googleFail);
console.log(`יום ${day} (${ilDayKey(s)}): ${dayEvs.length} אירועים, ${s.toISOString()} – ${t.toISOString()}`);
for (const c of cmp) console.log(c[0], c[1].padEnd(18), String(c[2]).slice(0, 60), String(c[3]).slice(0, 60));
if (cmp.some(c => c[0] === '❌')) process.exitCode = 1;
