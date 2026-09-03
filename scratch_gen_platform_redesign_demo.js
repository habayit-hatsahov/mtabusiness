// ── מחולל דמו: עיצוב מחדש לפאנל הפלטפורמה ─────────────────────────────────────────────────
// 🔑 **הכותרות ושמות-השורות נשאבים מ-admin-dashboard.html** ולא מומצאים כאן — אחרת הדמו
// מראה מסך שאינו קיים, וזו בדיוק המלכודת של §399ט.
// מייצר demo-platform-redesign.html עם "לפני" ו"אחרי" זה לצד זה.

const fs = require('fs');
const src = fs.readFileSync('admin-dashboard.html', 'utf8');

// ── חילוץ הסקשנים ושמות השורות שתחתיהם, לפי סדר ההופעה בקובץ ─────────────────────────────
const marks = [];
for (const m of src.matchAll(/class="plat-sect">([^<]+)</g)) marks.push({ i: m.index, kind: 'sect', text: m[1].trim() });
for (const m of src.matchAll(/platRow\(\s*'([^']+)'/g)) marks.push({ i: m.index, kind: 'row', text: m[1] });
for (const m of src.matchAll(/bRow\('(\w+)'/g)) marks.push({ i: m.index, kind: 'row', text: '(פילוח) ' + m[1] });
// ⚠️ **ארבעת הסקשנים האחרונים אינם משתמשים ב-platRow אלא בפסי-משפך** (`plat-bar-row`),
// והגרסה הראשונה של המחולל השמיטה אותם **בשקט** — 5 מתוך 9. סקשן ריק שנופל מהפילטר נראה
// בדיוק כמו סקשן שלא קיים, וזו אותה תקלה של לולאה שרצה אפס פעמים (§399ז).
for (const m of src.matchAll(/platBar\(\s*'([^']+)'/g)) marks.push({ i: m.index, kind: 'row', text: '▮ ' + m[1] });
for (const m of src.matchAll(/class="plat-bar-name">([^<]+)</g)) marks.push({ i: m.index, kind: 'row', text: '▮ ' + m[1].trim() });
marks.sort((a, b) => a.i - b.i);

const sections = [];
for (const mk of marks) {
  if (mk.kind === 'sect') sections.push({ title: mk.text, rows: [] });
  else if (sections.length) sections[sections.length - 1].rows.push(mk.text);
}
// 🔑 **לא מסננים סקשנים ריקים — אומרים עליהם.** דמו שמראה 5 מתוך 9 סקשנים מייצג מסך
// פחות צפוף ממה שקיים, כלומר בדיוק מטעה לגבי הבעיה שהוא אמור לפתור.
const empty = sections.filter(s => !s.rows.length);
if (empty.length) console.log(`⚠️ ${empty.length} סקשנים בלי שורות שזוהו: ${empty.map(s => s.title).join(' · ')}`);
const used = sections.map(s => s.rows.length ? s : { ...s, rows: ['(תוכן שלא זוהה ע"י המחולל)'] });
console.log(`נשאבו ${used.length} סקשנים, ${used.reduce((n, s) => n + s.rows.length, 0)} שורות`);
used.forEach(s => console.log(`   ${s.title} — ${s.rows.length} שורות`));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const N = ['128', '46', '21 / 46', '8', '75', '1,204', '312', '26 / 201', '13', '49'];
const num = (i) => N[i % N.length];

const before = used.map((s) => `
  <div class="b-sect">${esc(s.title)}</div>
  <div class="b-rows">${s.rows.map((r, j) => `
    <div class="b-row"><div class="b-name">${esc(r)}</div><div class="b-num">${num(j)}</div>
      <div class="b-help">שורת ההסבר שמלווה כל שורה — היא זו שמכפילה את הגובה פי שלושה.</div></div>`).join('')}
  </div>`).join('');

const after = used.map((s, i) => `
  <section class="a-card" id="sec-${i}">
    <h3 class="a-sect"><span class="a-dot"></span>${esc(s.title)}<span class="a-count">${s.rows.length}</span></h3>
    <div class="a-rows">${s.rows.map((r, j) => `
      <div class="a-row">
        <div class="a-main"><div class="a-name">${esc(r)}</div><div class="a-num">${num(j)}</div></div>
        <button class="a-why" type="button" onclick="this.closest('.a-row').classList.toggle('open')">מה זה סופר?</button>
        <div class="a-help">שורת ההסבר — קיימת במלואה, אבל נפתחת לפי דרישה במקום להיות תמיד על המסך.</div>
      </div>`).join('')}
    </div>
  </section>`).join('');

const nav = used.map((s, i) => `<a href="#sec-${i}">${esc(s.title)}</a>`).join('');

fs.writeFileSync('demo-platform-redesign.html', `<meta charset="utf-8"><title>מרכז נתונים — הצעת עיצוב</title>
<style>
 :root{--text:#14213d;--text-sm:#6b7a9b;--accent:#f5b800;--border-md:#e8eaf0;--card:#fff;--bg:#f4f5f8;--ink2:#3a4c7a}
 *{box-sizing:border-box}
 body{font-family:system-ui,'Segoe UI',Arial;background:var(--bg);margin:0;padding:20px;direction:rtl;color:var(--text)}
 h1{font-size:18px;margin:0 0 2px} .lede{font-size:12.5px;color:var(--text-sm);margin-bottom:16px;line-height:1.6}
 .wrap{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
 .col{flex:1;min-width:330px}
 .col>h2{font-size:13px;margin:0 0 8px;padding:6px 10px;border-radius:8px}
 .col.bad>h2{background:#fde8e8;color:#9b1c1c} .col.good>h2{background:#e6f6ec;color:#14663a}
 .pane{background:var(--card);border-radius:14px;padding:15px 18px;box-shadow:0 1px 3px rgba(16,24,40,.09);max-height:78vh;overflow:auto}

 /* ── לפני: העתק מדויק של הערכים מ-admin-dashboard.html ── */
 .b-sect{font-size:12px;font-weight:800;color:var(--text);margin:14px 0 6px}
 .b-rows{border-top:1px solid var(--border-md)}
 .b-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;padding:10px 2px 11px;border-bottom:1px solid var(--border-md)}
 .b-name{font-size:13px;font-weight:700;flex:1 1 150px} .b-num{font-size:19px;font-weight:800}
 .b-help{flex:1 1 100%;font-size:11px;color:var(--text-sm);line-height:1.6}

 /* ── אחרי ── */
 .a-nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;position:sticky;top:0;background:var(--card);padding:8px 0;z-index:2}
 .a-nav a{font-size:11.5px;font-weight:700;color:var(--ink2);background:var(--bg);border-radius:999px;padding:5px 11px;text-decoration:none}
 .a-nav a:hover{background:var(--accent);color:var(--text)}
 .a-card{background:var(--bg);border-radius:12px;padding:12px 14px;margin-bottom:14px}
 .a-sect{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;margin:0 0 8px}
 .a-dot{width:4px;height:17px;background:var(--accent);border-radius:2px;flex:none}
 .a-count{margin-inline-start:auto;font-size:11px;font-weight:700;color:var(--text-sm);background:var(--card);border-radius:999px;padding:2px 8px}
 .a-rows{background:var(--card);border-radius:9px}
 .a-row{padding:9px 11px;border-bottom:1px solid var(--border-md)} .a-row:last-child{border-bottom:0}
 .a-main{display:flex;align-items:baseline;gap:10px}
 .a-name{font-size:13px;font-weight:700;flex:1} .a-num{font-size:18px;font-weight:800}
 .a-why{background:none;border:0;padding:2px 0 0;font:inherit;font-size:11px;color:var(--text-sm);text-decoration:underline;cursor:pointer}
 .a-help{display:none;font-size:11.5px;color:var(--text-sm);line-height:1.6;margin-top:5px}
 .a-row.open .a-help{display:block} .a-row.open .a-why{color:var(--ink2);font-weight:700}
</style>
<h1>מרכז נתונים — הצעת עיצוב</h1>
<div class="lede">הכותרות ושמות השורות נשאבו מ-<b>admin-dashboard.html</b>. המספרים הם ממלאי-מקום.<br>
<b>השורש:</b> כותרת הסקשן היא 12px — קטנה משם-השורה (13px) וקטנה בהרבה מהמספר (19px). הכותרת היא הטקסט החלש ביותר בסקשן של עצמה.</div>
<div class="wrap">
  <div class="col bad"><h2>לפני — 9 סקשנים ברצף אחד</h2><div class="pane">${before}</div></div>
  <div class="col good"><h2>אחרי — כרטיס לכל סקשן, ניווט מהיר, הסבר לפי דרישה</h2>
    <div class="pane"><nav class="a-nav">${nav}</nav>${after}</div></div>
</div>`, 'utf8');
console.log('\n✅ נוצר demo-platform-redesign.html');
