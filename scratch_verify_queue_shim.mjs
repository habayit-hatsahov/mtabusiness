// ── §431ד — אימות מבני של המעטפת בכל דף ─────────────────────────────────────────────────
// בודק את מה שאפשר לבדוק בוודאות מהקובץ עצמו, ולא מנחש:
//   1. `hbQueueUntilDefined` מוגדר **פעם אחת** בדיוק.
//   2. ההגדרה וגם הרישום יושבים בתוך <script> **קלאסי** (לא מודול, לא src).
//   3. שניהם מופיעים **לפני** ה-<script type="module"> הראשון בקובץ.
//   4. השמות שנרשמו הם בדיוק אלה שהסורק מצא כחשופים, פחות הרשימה השחורה.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const EXCLUDE = {
  'profile.html':            ['confirmDeleteAccount'],
  'business-dashboard.html': ['discardAllChanges'],
  'admin-businesses.html':   ['bulkApprove', 'bulkReject'],
  'admin-members.html':      ['bulkApprove', 'bulkReject', 'migrateMemberNumbers', 'migrateLoginCodes'],
  'home.html':               [],
  'welcome.html':            [],
};

const PAGES = process.argv.slice(2);
let fail = 0;

// מה הסורק מוצא **עכשיו** כחשוף (אחרי התיקון): צריך להיות רק הרשימה השחורה
const json = JSON.parse(execFileSync(process.execPath, ['scratch_scan_dead_window.mjs', ...PAGES],
  { env: { ...process.env, JSON: '1' }, encoding: 'utf8' }));
const stillExposed = new Map(json.map(p => [p.page, p.register]));

for (const page of PAGES) {
  const html = fs.readFileSync(page, 'utf8');
  const errs = [];

  const defs = [...html.matchAll(/window\.hbQueueUntilDefined\s*=/g)];
  if (defs.length !== 1) errs.push(`הוגדר ${defs.length} פעמים (צריך 1)`);

  const regs = [...html.matchAll(/window\.hbQueueUntilDefined\(\s*\[/g)];
  if (regs.length !== 1) errs.push(`נרשם ${regs.length} פעמים (צריך 1)`);

  // בתוך סקריפט קלאסי?
  const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({
    attrs: m[1] || '', start: m.index, end: m.index + m[0].length,
    isModule: /type\s*=\s*["']module["']/.test(m[1] || ''), isExt: /\bsrc=/.test(m[1] || ''),
  }));
  const holder = (off) => blocks.find(b => off >= b.start && off < b.end);
  for (const [label, list] of [['ההגדרה', defs], ['הרישום', regs]]) {
    for (const d of list) {
      const b = holder(d.index);
      if (!b) errs.push(`${label} לא בתוך <script>`);
      else if (b.isModule) errs.push(`${label} בתוך מודול — רץ מאוחר מדי`);
      else if (b.isExt) errs.push(`${label} בתוך סקריפט חיצוני`);
    }
  }

  // לפני המודול הראשון?
  const firstMod = blocks.find(b => b.isModule);
  if (firstMod && defs.length && defs[0].index > firstMod.start) errs.push('ההגדרה אחרי המודול הראשון');
  if (firstMod && regs.length && regs[0].index > firstMod.start) errs.push('הרישום אחרי המודול הראשון');

  // מה נרשם בפועל
  const listTxt = /window\.hbQueueUntilDefined\(\s*\[([^\]]*)\]/.exec(html);
  const registered = listTxt ? [...listTxt[1].matchAll(/['"](\w+)['"]/g)].map(m => m[1]) : [];

  // מה עדיין חשוף — חייב להיות בדיוק הרשימה השחורה
  const exposed = (stillExposed.get(page) || []).slice().sort();
  const expected = (EXCLUDE[page] || []).slice().sort();
  if (JSON.stringify(exposed) !== JSON.stringify(expected))
    errs.push(`עדיין חשוף [${exposed}] במקום הרשימה השחורה [${expected}]`);

  console.log(`${errs.length ? '❌' : '✅'} ${page.padEnd(26)} נרשמו ${String(registered.length).padStart(2)} · ` +
    `לא נרשמו במכוון ${expected.length}${errs.length ? '\n     ' + errs.join('\n     ') : ''}`);
  if (errs.length) fail++;
}
console.log(fail ? `\n${fail} דפים נכשלו` : '\nכל הדפים תקינים');
process.exit(fail ? 1 : 0);
