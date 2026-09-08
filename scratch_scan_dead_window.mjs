// ── §431ב — סריקת "החלון המת" בכל הדפים החיים ────────────────────────────────────────────
// מחפש את התבנית שהפילה את הלב: פונקציה שמוגדרת בתוך <script type="module"> (שרץ אחרי
// הורדת-רשת, ולעיתים מתחת ל-await ברמת-מודול), ונקראת מקוד שנצבע **קודם** — onclick ב-HTML
// או סקריפט קלאסי. בחלון שבין השניים הקריאה זורקת TypeError בשקט.
//
// ⚠️ **הכלל שהפך את הסריקה הראשונה לאזעקת-שווא:** ב-welcome.html מוגדרת `window.heroLogin`
// **פעמיים** — גרסה מוקדמת בסקריפט קלאסי (שמכניסה לתור, `heroQueueUntilReady`), והמודול
// דורס אותה בגרסה האמיתית. ה-onclick נקשר לגרסה המוקדמת, ולכן אין שם שום חלון מת.
// לכן: הגדרה מוקדמת בסקריפט קלאסי (`window.X =` או `function X`) = **מוגן**.
// ר' feedback_loose_detector_false_alarm — גלאי רופף מייצר יותר רעש מערך.
import fs from 'node:fs';

const PAGES = process.argv.slice(2);
const VERBOSE = process.env.VERBOSE === '1';

function blocks(html) {
  const out = [];
  const rx = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = rx.exec(html)) !== null) {
    out.push({
      attrs: m[1] || '', body: m[2] || '', start: m.index, end: m.index + m[0].length,
      bodyStart: m.index + m[0].indexOf('>') + 1,
      isModule: /type\s*=\s*["']module["']/.test(m[1] || ''),
      isExternal: /\bsrc=/.test(m[1] || ''),
      line: html.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}
const lineOf = (html, off) => html.slice(0, off).split('\n').length;

const summary = [];

for (const page of PAGES) {
  let html;
  try { html = fs.readFileSync(page, 'utf8'); } catch (e) { continue; }
  const bs = blocks(html);
  const mods = bs.filter(b => b.isModule && !b.isExternal);
  const classics = bs.filter(b => !b.isModule && !b.isExternal);
  if (!mods.length) continue;

  // ── מה מוגדר מוקדם (סקריפט קלאסי) = זמין לפני המודול ─────────────────────────────────
  const early = new Set();
  for (const b of classics) {
    let m;
    const r1 = /^\s*window\.(\w+)\s*=/gm;      while ((m = r1.exec(b.body)) !== null) early.add(m[1]);
    const r2 = /^\s*(?:async\s+)?function\s+(\w+)\s*\(/gm; while ((m = r2.exec(b.body)) !== null) early.add(m[1]);
    // §431ג — שמות שנרשמו לתור מוגנים בדיוק כמו הגדרה מוקדמת: ה-getter מחזיר stub
    // שמכניס לתור, וה-setter משחרר אותו כשהמודול מגדיר את האמיתית.
    const r3 = /hbQueueUntilDefined\(\s*\[([^\]]*)\]/g;
    while ((m = r3.exec(b.body)) !== null) {
      for (const q of m[1].matchAll(/['"](\w+)['"]/g)) early.add(q[1]);
    }
  }

  // ── מה מוגדר במודול, ומתי ────────────────────────────────────────────────────────────
  const defs = new Map();
  for (const b of mods) {
    const awaits = [];
    b.body.split('\n').forEach((ln, i) => {
      if (/^(await\s|(const|let|var)\s+[\w{}[\],\s]+=\s*await\s)/.test(ln)) awaits.push(i + 1);
    });
    const rx = /^\s*window\.(\w+)\s*=/gm;
    let m;
    while ((m = rx.exec(b.body)) !== null) {
      const defLine = b.body.slice(0, m.index).split('\n').length;
      const aw = awaits.filter(a => a < defLine)[0];
      defs.set(m[1], { line: lineOf(html, b.bodyStart) + defLine - 1, afterAwait: aw !== undefined,
                       awaitLine: aw ? lineOf(html, b.bodyStart) + aw - 1 : null });
    }
  }
  if (!defs.size) continue;

  const inModule = (off) => mods.some(b => off >= b.bodyStart && off < b.end);
  const findings = [], protectedByEarly = new Set();

  for (const [name, def] of defs) {
    const rx = new RegExp(`(?:window\\.)?${name}\\s*\\(`, 'g');
    let m;
    while ((m = rx.exec(html)) !== null) {
      if (inModule(m.index)) continue;
      if (early.has(name)) { protectedByEarly.add(name); continue; }   // ← התיקון
      const before = html.slice(Math.max(0, m.index - 90), m.index);
      const guarded =
        new RegExp(`window\\.${name}\\s*&&\\s*$`).test(before) ||
        new RegExp(`typeof\\s+window\\.${name}\\s*===?\\s*['"]function['"]`).test(before) ||
        /\?\.\s*$/.test(html.slice(Math.max(0, m.index - 3), m.index)) ||
        // `if (window.X) X()` — גארד באותה שורה
        new RegExp(`if\\s*\\(\\s*!?window\\.${name}[\\s)]`).test(before) ||
        // גארד שיושב בפונקציה שמעל, למשל `if (typeof window.X !== 'function') { ...תור... return; }`
        new RegExp(`typeof\\s+window\\.${name}\\s*!==?\\s*['"]function['"]`)
          .test(html.slice(Math.max(0, m.index - 900), m.index));
      if (guarded) continue;
      const ln = lineOf(html, m.index);
      const raw = (html.split('\n')[ln - 1] || '').trim();
      findings.push({ name, ln, ctx: raw.slice(0, 110), def, isOnclick: /on(click|change|input|keydown)\s*=/.test(raw) });
    }
  }

  const byName = new Map();
  for (const f of findings) {
    if (!byName.has(f.name)) byName.set(f.name, { ...f, count: 0, lines: [] });
    const e = byName.get(f.name); e.count++; e.lines.push(f.ln);
  }
  // ⚠️ הפרדה קריטית לדיוק הדיווח: קריאה מתוך תגית `onclick=` **אי-אפשר** להגן עליה במקום —
  // אין שם מקום לגארד, ולכן היא ודאית. קריאה מתוך JS עשויה להיות מוגנת בצורה שהגלאי לא מזהה
  // (נמצאו בפועל: `if (a && b && window.X)`, ולולאת `tick` עם `typeof === 'function'`).
  const onclickHits = findings.filter(f => f.isOnclick);
  const jsHits = findings.filter(f => !f.isOnclick);
  const register = [...new Set(onclickHits.map(f => f.name))];
  // ⚠️ שם שקוד אחר בודק את **קיומו** — רישום לתור הופך את הבדיקה לאמיתית תמיד.
  const conflicts = register.filter(name =>
    new RegExp(`window\\.${name}\\s*&&|if\\s*\\(\\s*!?window\\.${name}[\\s)]|typeof\\s+window\\.${name}\\s*[!=]==?`).test(html));
  summary.push({ page, count: byName.size, hits: findings.length, onclick: onclickHits.length,
                 js: jsHits.length, protectedByEarly: protectedByEarly.size, register, conflicts });

  if (process.env.JSON === '1') continue;   // מצב-JSON: רק הפלט המובנה בסוף, בלי דוח קריא
  if (!byName.size) { console.log(`\n■ ${page} — נקי (${protectedByEarly.size} שמות מוגנים בהגדרה מוקדמת)`); continue; }
  console.log(`\n${'═'.repeat(76)}\n■ ${page}  —  ${byName.size} פונקציות חשופות, ${findings.length} מוקדי-קריאה` +
    (protectedByEarly.size ? `  (ועוד ${protectedByEarly.size} מוגנות בהגדרה מוקדמת ✔)` : ''));
  for (const f of byName.values()) {
    console.log(`  ✗ ${f.name}  ←  מוגדר בשורה ${f.def.line}` +
      (f.def.afterAwait ? ` **מתחת ל-await (שורה ${f.def.awaitLine})**` : '') +
      `  ·  נקרא בשורות ${f.lines.slice(0, 6).join(', ')}${f.lines.length > 6 ? '…' : ''}`);
    if (VERBOSE) console.log(`      ${f.ctx}`);
  }
}

// ── JSON=1 — פלט לצריכת סקריפט התיקון ────────────────────────────────────────────────────
// `register`: שמות עם מוקד onclick ודאי (אלה שצריך לרשום לתור).
// `conflicts`: מתוכם, שמות שקוד אחר **בודק את קיומם** (`window.X &&` / `if (window.X)` /
//   `typeof window.X`). ⚠️ רישום כזה הופך את הבדיקה לאמיתית תמיד — ה-stub הוא פונקציה —
//   כלומר משנה התנהגות קיימת. חייב הכרעה ידנית, לא רישום עיוור.
if (process.env.JSON === '1') {
  console.log(JSON.stringify(summary.map(s => ({ page: s.page, register: s.register, conflicts: s.conflicts })), null, 1));
  process.exit(0);
}

console.log(`\n${'═'.repeat(76)}\nסיכום`);
for (const s of summary) console.log(`  ${s.page.padEnd(26)} onclick ודאי: ${String(s.onclick).padStart(3)}  ·  קריאות JS (לבדיקה): ${String(s.js).padStart(3)}  ·  מוגנות מוקדם: ${s.protectedByEarly}`);
