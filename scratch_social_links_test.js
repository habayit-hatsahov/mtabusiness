// ── בדיקות ל-social-links.js ──────────────────────────────────────────────────────────
// הרצה: node scratch_social_links_test.js
// כל המקרים כאן הם ערכים **אמיתיים** מתוך 53 מסמכי העסקים בפרודקשן (2026-08-20), חוץ
// ממקרי-הקצה המסומנים "סינתטי". ר' docs/PROJECT_CONTEXT.md §232.

const L = require('./social-links.js');

let pass = 0, fail = 0;
function t(name, kind, raw, expectOk, expectUrl) {
  const r = L.normalize(kind, raw);
  const okMatch = r.ok === expectOk;
  const urlMatch = expectUrl === undefined || r.url === expectUrl;
  if (okMatch && urlMatch) { pass++; return; }
  fail++;
  console.log(`❌ ${name}\n   kind=${kind} raw=${JSON.stringify(raw)}\n   ציפינו ok=${expectOk}${expectUrl !== undefined ? ' url=' + expectUrl : ''}\n   קיבלנו ok=${r.ok} url=${r.url} reason=${r.reason}`);
}

// ── ריק ──
t('ריק', 'facebook', '', false);
t('רווחים בלבד', 'facebook', '   ', false);
t('null', 'website', null, false);

// ── כתובת מלאה — נשארת כמו שהיא ──
t('URL פייסבוק מלא', 'facebook', 'https://www.facebook.com/LogisticDest', true, 'https://www.facebook.com/LogisticDest');
t('URL עם share/mibextid', 'facebook', 'https://www.facebook.com/share/18f1mMTUTZ/?mibextid=wwXIfr', true);
t('URL עם profile.php', 'facebook', 'https://www.facebook.com/profile.php?id=61578061780747', true);
t('URL אינסטגרם', 'instagram', 'https://www.instagram.com/djadidor/', true, 'https://www.instagram.com/djadidor/');
t('URL אינסטגרם של ריל (לא פרופיל, אבל קישור אמיתי)', 'instagram', 'https://www.instagram.com/reel/DZnimOKR5I6/', true);
t('URL אתר', 'website', 'https://braingroup.co.il/', true, 'https://braingroup.co.il/');

// ── דומיין בלי https — מושלם ──
t('דומיין בלי סכמה', 'website', 'www.melcake.co.il', true, 'https://www.melcake.co.il/');
t('דומיין באותיות גדולות', 'website', 'WWW.SHIGUR-YASHIR.CO.IL', true);
t('דומיין עם מקף', 'website', 'dr-optica.co.il', true, 'https://dr-optica.co.il/');
t('דומיין עם נקודות מרובות', 'website', 'Beny.delivery.com', true);

// ── שני קישורים באותה שורה — נלקח הראשון ──
t('שני אתרים ברווחים', 'website', 'z-zol.co.il     www.intex-pool.co.il', true, 'https://z-zol.co.il/');

// ── handle בלבד — נגזר לכתובת פרופיל ──
t('handle פייסבוק', 'facebook', 'galgaash', true, 'https://www.facebook.com/galgaash');
t('handle פייסבוק עם נקודה', 'facebook', 'Shawarma.Shemesh', true, 'https://www.facebook.com/Shawarma.Shemesh');
t('handle פייסבוק עם נקודה 2', 'facebook', 'mr.chumpytattoo', true, 'https://www.facebook.com/mr.chumpytattoo');
t('handle אינסטגרם', 'instagram', 'sportandpool', true, 'https://www.instagram.com/sportandpool');
t('handle אינסטגרם עם קו-תחתון', 'instagram', 'surfin_il', true, 'https://www.instagram.com/surfin_il');
t('@handle (סינתטי)', 'instagram', '@golda.party', true, 'https://www.instagram.com/golda.party');

// ── מה שנשאר שבור בכוונה ──
t('שם עמוד בעברית', 'facebook', 'ספורט אנד פול', false);
t('שם עמוד בעברית 2', 'facebook', 'איה מצברים', false);
t('אות בודדת', 'facebook', 'ד', false);
t('שם עם רווח', 'facebook', 'Ld cleaning', false);
t('שם עם רווח 2', 'facebook', 'Door migunim', false);
t('שם עם רווח ואמפרסנד', 'facebook', 'Mel cake&more', false);
t('שם אינסטגרם עם רווח', 'instagram', 'Casual tattoo', false);
t('שם אינסטגרם עם רווח ומספר', 'instagram', '96  LD Cleaning.', false);
t('קו-תחתון לא חוקי בפייסבוק', 'facebook', 'surfin_ISRAEL', false);
t('אתר בעברית', 'website', 'אלמוג פט בגוגל', false);
t('handle קצר מדי לפייסבוק (סינתטי)', 'facebook', 'abcd', false);
t('אינסטגרם — תו בודד (סינתטי)', 'instagram', 'x', false);
t('אינסטגרם — מסתיים בנקודה (סינתטי)', 'instagram', 'Cleaning.', false);
t('אינסטגרם — מתחיל בנקודה (סינתטי)', 'instagram', '.cleaning', false);
t('אינסטגרם — ספרות בלבד (סינתטי)', 'instagram', '96', false);
t('פייסבוק — מסתיים בנקודה (סינתטי)', 'facebook', 'pagename.', false);
t('אינסטגרם — שם בעברית (סינתטי)', 'instagram', 'ספורט אנד פול', false);
t('אינסטגרם — מילה עברית אחת (סינתטי)', 'instagram', 'מספרה', false);
t('handle לא רלוונטי לאתר (סינתטי)', 'website', 'galgaash', false);
t('סכמה לא נתמכת (סינתטי)', 'website', 'javascript:alert(1)', false);
t('http בלי דומיין (סינתטי)', 'website', 'http://localhost', false);

// ── confidence ──
(() => {
  const a = L.normalize('facebook', 'https://www.facebook.com/LogisticDest');
  const b = L.normalize('facebook', 'galgaash');
  if (a.confidence === 'exact' && b.confidence === 'guessed') pass++;
  else { fail++; console.log(`❌ confidence: קיבלנו ${a.confidence} / ${b.confidence}`); }
})();

// ── problemText ──
(() => {
  if (L.problemText('facebook', 'https://www.facebook.com/x.y') === null
      && L.problemText('facebook', '') === null
      && typeof L.problemText('facebook', 'ספורט אנד פול') === 'string') pass++;
  else { fail++; console.log('❌ problemText'); }
})();

// ── חשיפה ל-window (הדפים טוענים את הקובץ כ-script קלאסי, לא כ-module) ──
// טעינה מחדש של הקובץ בתוך הקשר עם `window` גלובלי, כדי לאמת ש-window.HB_LINKS באמת נוצר.
(() => {
  const fs = require('fs'), vm = require('vm');
  const src = fs.readFileSync(require.resolve('./social-links.js'), 'utf8');
  const sandbox = { window: {}, module: undefined, URL };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'social-links.js' }).runInContext(sandbox);
  const w = sandbox.window.HB_LINKS;
  if (w && typeof w.toUrl === 'function' && w.toUrl('facebook', 'galgaash') === 'https://www.facebook.com/galgaash') pass++;
  else { fail++; console.log('❌ window.HB_LINKS לא נחשף כראוי בטעינת script קלאסית'); }
})();

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
