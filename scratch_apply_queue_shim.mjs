// ── §431ד — הזרקת hbQueueUntilDefined לתשעת הדפים הנותרים ────────────────────────────────
// מריצים: node scratch_apply_queue_shim.mjs            (בדיקה יבשה, לא כותב)
//         node scratch_apply_queue_shim.mjs --write    (כותב)
//
// ⚠️ **פעולות שאסור לשחזר** — ר' EXCLUDE למטה. תור משחזר פעולה **אחרי** שהמשתמש כבר הסיק
// שלא קרה כלום; על פעולה הפיכה זה בדיוק הרצוי, על פעולה בלתי-הפיכה זה מסוכן יותר מהבאג.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const WRITE = process.argv.includes('--write');

// 🔴 לא נרשמים לתור — שחזור מושהה שלהם גרוע מהתקלה עצמה.
// כולם ממילא **אינם נגישים** בחלון המת: כל אחד מהם יושב מאחורי מודאל/טבלה/מצב-בחירה
// שמצוירים על ידי המודול עצמו, כלומר אי-אפשר להגיע אליהם לפני שהוא נטען.
const EXCLUDE = {
  'profile.html':           ['confirmDeleteAccount'],                      // מחיקת חשבון — בלתי הפיכה
  'business-dashboard.html':['discardAllChanges'],                          // מוחק את עריכות העסק
  'admin-businesses.html':  ['bulkApprove', 'bulkReject'],                  // ר' feedback_never_auto_decide_membership
  'admin-members.html':     ['bulkApprove', 'bulkReject',
                             'migrateMemberNumbers', 'migrateLoginCodes'],  // + מיגרציות חד-פעמיות
};

const HELPER = `
  // ── §431ג — תור לפונקציות שמוגדרות במודול ונקראות מ-onclick שנצבע קודם ──────────────────
  // ר' §431/§431ג ב-docs/PROJECT_CONTEXT.md, ואת ההסבר המלא ב-home.html. בקצרה: המסך נצבע
  // לפני שהמודול נטען, ולכן onclick שקורא לפונקציה שמוגדרת **בתוכו** זורק TypeError בשקט
  // בחלון שבין השניים. getter מחזיר stub-שמכניס-לתור, setter משחרר אותו כשהמודול מגדיר.
  // ⚠️ פעולה אחת בתור לכל שם — לחיצה שנייה מחליפה, לא מצטברת (אחרת טוגל מבטל את עצמו).
  // ⚠️ \`this\` והארגומנטים נשמרים. חייב לרוץ בסקריפט **קלאסי**: מודול רץ אחרי כל אלה.
  window.hbQueueUntilDefined = function (names, opts) {
    const capMs  = (opts && opts.capMs) || 12000;
    const onDrop = opts && opts.onDrop;
    names.forEach(function (name) {
      let real = null, pending = null, timer = null;
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () {
          if (real) return real;
          return function () {
            pending = { args: Array.prototype.slice.call(arguments), ctx: this };
            clearTimeout(timer);
            timer = setTimeout(function () {
              if (!pending) return;
              pending = null;
              if (onDrop) onDrop(name);
              else console.warn('hbQueueUntilDefined: המודול לא נטען בזמן, הפעולה בוטלה —', name);
            }, capMs);
          };
        },
        set: function (fn) {
          real = fn;
          clearTimeout(timer);
          const p = pending; pending = null;
          if (!p) return;
          try { fn.apply(p.ctx, p.args); }
          catch (e) { console.error('hbQueueUntilDefined: שחזור נכשל', name, e); }
        },
      });
    });
  };
`;

const json = execFileSync(process.execPath, ['scratch_scan_dead_window.mjs',
  'profile.html', 'business-dashboard.html', 'fan-register.html', 'terms.html', 'business.html',
  'admin.html', 'admin-dashboard.html', 'admin-businesses.html', 'admin-members.html'],
  { env: { ...process.env, JSON: '1' }, encoding: 'utf8' });
const pages = JSON.parse(json);

for (const p of pages) {
  const html = fs.readFileSync(p.page, 'utf8');
  if (html.includes('hbQueueUntilDefined')) { console.log(`⏭  ${p.page} — כבר מוגן`); continue; }
  if (p.conflicts.length) { console.log(`🛑 ${p.page} — התנגשות (${p.conflicts.join(', ')}), דורש הכרעה ידנית`); continue; }

  const skip = EXCLUDE[p.page] || [];
  const names = p.register.filter(n => !skip.includes(n));

  // הסקריפט הקלאסי הראשון שאינו חיצוני. כל סקריפט קלאסי רץ בזמן הפענוח, כלומר **לפני**
  // כל מודול (שנדחה לסוף) — ולכן כל מיקום כזה מספיק, ועדיף הראשון.
  const rx = /<script([^>]*)>/g;
  let m, at = -1, attrs = '';
  while ((m = rx.exec(html)) !== null) {
    const a = m[1] || '';
    if (/\bsrc=/.test(a) || /type\s*=\s*["']module["']/.test(a)) continue;
    at = m.index + m[0].length; attrs = a; break;
  }
  const reg = `\n  window.hbQueueUntilDefined([\n    ${names.map(n => `'${n}'`).join(', ').replace(/(.{86}), /g, '$1,\n    ')}\n  ]);\n`;

  let out, line, how;
  if (at >= 0) {
    out = html.slice(0, at) + '\n' + HELPER + reg + html.slice(at);
    line = html.slice(0, at).split('\n').length;
    how = 'לסקריפט הקלאסי הקיים';
  } else {
    // אין סקריפט קלאסי בדף — פותחים אחד **מיד לפני** המודול הראשון. סקריפט קלאסי רץ בזמן
    // הפענוח ומודול נדחה לאחריו, ולכן הסדר הזה מבטיח שהמעטפת קיימת לפני שהמודול מגדיר.
    const mm = /<script[^>]*type\s*=\s*["']module["'][^>]*>/.exec(html);
    if (!mm) { console.log(`🛑 ${p.page} — אין גם מודול, דילוג`); continue; }
    out = html.slice(0, mm.index) + '<script>' + HELPER + reg + '</scr' + 'ipt>\n' + html.slice(mm.index);
    line = html.slice(0, mm.index).split('\n').length;
    how = 'בבלוק קלאסי חדש לפני המודול';
  }

  console.log(`✅ ${p.page} — ${names.length} שמות, ${how} (שורה ${line})` +
    (skip.length ? `  · 🔴 לא נרשמו: ${skip.join(', ')}` : ''));
  if (WRITE) fs.writeFileSync(p.page, out);
}
console.log(WRITE ? '\nנכתב.' : '\n(בדיקה יבשה — הרץ עם --write כדי לכתוב)');
