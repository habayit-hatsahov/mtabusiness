// בדיקת-תחביר לכל בלוקי ה-<script> בכל דף שנמסר. מודול כמודול, קלאסי כקלאסי.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-syn-'));
let bad = 0, checked = 0;

for (const page of process.argv.slice(2)) {
  const html = fs.readFileSync(page, 'utf8');
  const rx = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m, i = 0, pageBad = 0, pageN = 0;
  while ((m = rx.exec(html)) !== null) {
    const attrs = m[1] || '', body = m[2] || '';
    if (/\bsrc=/.test(attrs) || !body.trim()) continue;
    const isModule = /type\s*=\s*["']module["']/.test(attrs);
    const line = html.slice(0, m.index).split('\n').length;
    const f = path.join(dir, page.replace(/\W/g, '_') + (i++) + (isModule ? '.mjs' : '.js'));
    fs.writeFileSync(f, body);
    pageN++; checked++;
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { pageBad++; bad++; console.error(`✗ ${page} שורה ${line}:\n${e.stderr?.toString().slice(0, 500)}`); }
  }
  console.log(`${pageBad ? '✗' : '✓'} ${page.padEnd(26)} ${pageN} בלוקים`);
}
console.log(`\nנבדקו ${checked} בלוקים, נכשלו ${bad}`);
process.exit(bad ? 1 : 0);
