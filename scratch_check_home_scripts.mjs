// בדיקת-תחביר לכל בלוקי ה-<script> ב-home.html. מודולים נבדקים כמודול (top-level await),
// סקריפטים קלאסיים כסקריפט. ר' feedback_test_harness_anchor_by_content: העיגון הוא התוכן.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const html = fs.readFileSync('home.html', 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-syntax-'));
const rx = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m, i = 0, bad = 0, checked = 0;

while ((m = rx.exec(html)) !== null) {
  const attrs = m[1] || '';
  const body = m[2] || '';
  if (/\bsrc=/.test(attrs)) continue;          // קובץ חיצוני, אין מה לבדוק כאן
  if (!body.trim()) continue;
  const isModule = /type\s*=\s*["']module["']/.test(attrs);
  const line = html.slice(0, m.index).split('\n').length;
  const f = path.join(dir, `block${i++}.${isModule ? 'mjs' : 'js'}`);
  fs.writeFileSync(f, body);
  checked++;
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log(`✓ שורה ${line} (${isModule ? 'module' : 'classic'}, ${body.split('\n').length} שורות)`);
  } catch (e) {
    bad++;
    console.error(`✗ שורה ${line} (${isModule ? 'module' : 'classic'}):\n${e.stderr?.toString() || e.message}`);
  }
}
console.log(`\nנבדקו ${checked} בלוקים, נכשלו ${bad}`);
process.exit(bad ? 1 : 0);
