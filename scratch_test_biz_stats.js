// §534 — biz-stats.js: כשהשבוע הנוכחי ריק, הסיכום והקופסה על שבוע שעבר.
// מריץ את הקובץ החי בתוך jsdom. הרצה: node scratch_test_biz_stats.js
const path = require('path');
const fs = require('fs');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));
const SRC = fs.readFileSync(path.join(__dirname, 'biz-stats.js'), 'utf8');

const wk = (start, imp, open, contact, hearts) => ({ start, imp, open, contact, hearts });
async function run(weeks) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="h"></div></body></html>', { runScripts: 'outside-only' });
  dom.window.eval(SRC);
  dom.window.YZBizStats.render(dom.window.document.getElementById('h'), { load: () => ({ ok: true, weeks }) });
  await new Promise((r) => setTimeout(r, 20));
  const d = dom.window.document;
  return { sum: d.getElementById('bsSum').textContent, title: (d.querySelector('.bs-wt') || {}).textContent || '', nums: [...d.querySelectorAll('.bs-n')].map((e) => e.textContent).join(',') };
}

let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name + '  →  ' + JSON.stringify(info)); } };

(async () => {
  // 1. השבוע ריק, שבוע שעבר עם נתונים → סיכום על שבוע שעבר, הקופסה עליו
  let r = await run([wk('2026-10-11', 0, 0, 0, 0), wk('2026-10-04', 3, 5, 1, 2), wk('2026-09-27', 1, 1, 0, 0)]);
  ok(r.sum === 'השבוע עוד אין פעילות · שבוע שעבר: 3 חשיפות · 5 פתיחות · 1 פניות · 2 לבבות', 'השבוע ריק → סיכום שבוע שעבר', r);
  ok(r.title.startsWith('שבוע שעבר') && r.nums === '3,5,1,2', 'השבוע ריק → הקופסה נפתחת על שבוע שעבר', r);

  // 2. יש נתונים השבוע → כמו קודם
  r = await run([wk('2026-10-11', 2, 1, 0, 0), wk('2026-10-04', 3, 5, 1, 2)]);
  ok(r.sum === 'השבוע: 2 חשיפות · 1 פתיחות · 0 פניות · 0 לבבות', 'יש פעילות השבוע → סיכום השבוע', r);
  ok(r.title.startsWith('השבוע') && r.nums === '2,1,0,0', 'יש פעילות השבוע → הקופסה על השבוע', r);

  // 3. גם שבוע שעבר ריק → נשאר על השבוע (אפסים)
  r = await run([wk('2026-10-11', 0, 0, 0, 0), wk('2026-10-04', 0, 0, 0, 0), wk('2026-09-27', 4, 0, 0, 0)]);
  ok(r.sum.startsWith('השבוע: 0 חשיפות') && r.title.startsWith('השבוע'), 'שני השבועות ריקים → נשאר על השבוע', r);

  // 4. שבוע אחד בלבד וריק → נשאר על השבוע
  r = await run([wk('2026-10-11', 0, 0, 0, 0)]);
  ok(r.sum.startsWith('השבוע: 0 חשיפות'), 'שבוע יחיד ריק → השבוע', r);

  // 5. אין שבועות → "עדיין אין נתונים"
  r = await run([]);
  ok(r.sum === 'עדיין אין נתונים', 'אין שבועות → עדיין אין נתונים', r);

  console.log(`\n${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
