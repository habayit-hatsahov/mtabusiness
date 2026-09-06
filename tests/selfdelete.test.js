// בדיקת selfDeleteList בהרצה אמיתית — נחתכת מ-admin-dashboard.html ומורצת. נכתבה ב-§420ז.
// חיתוך לפי תוכן ולא לפי מספרי-שורה (הלקח של §361).
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'admin-dashboard.html'), 'utf8');

function cut(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  if (a < 0) throw new Error(`עוגן ההתחלה לא נמצא: ${startMarker}`);
  const b = SRC.indexOf(endMarker, a);
  if (b < 0) throw new Error(`עוגן הסיום לא נמצא: ${endMarker}`);
  return SRC.slice(a, b);
}

const BLOCK = cut('// ── §420ז — אוהד שמחק את עצמו', 'const ISSUE_KINDS = [');
const build = (entries, handled) => new Function(
  'deletionLogEntries', 'handledRegIssues', 'toJsDate',
  BLOCK + '\n; return { selfDeleteList, selfDeleteOpenList };',
)(entries, handled || {}, (v) => (v instanceof Date ? v : (v ? new Date(v) : null)));

let pass = 0, fail = 0;
function is(name, got, want) {
  if (got === want) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      קיבלתי:  ' + JSON.stringify(got) + '\n      ציפיתי:  ' + JSON.stringify(want)); }
}

const ENTRY = (o) => ({
  id: 'log1', collectionName: 'members', docId: 'm1', source: 'self-delete',
  label: 'דני כהן', actorEmail: 'd@e.f', selfReason: '', deletedAt: new Date('2026-09-06T10:00:00Z'), ...o,
});

console.log('\n— מה נכנס לרשימה —');
{
  const { selfDeleteList } = build([ENTRY({ selfReason: 'לא מצאתי הטבות מעניינות' })]);
  const r = selfDeleteList();
  is('מחיקה עצמית נכנסת', r.length, 1);
  is('השם', r[0].name, 'דני כהן');
  is('המייל', r[0].email, 'd@e.f');
  is('🔑 הסיבה שהוא כתב נשמרת', r[0].reason, 'לא מצאתי הטבות מעניינות');
  is('מפתח יציב לסימון "טיפלתי"', r[0].key, 'selfdel|log1');
}
{
  // ⚠️ ההגנה המרכזית: מחיקה שהמנהל ביצע היא הרוב המוחלט של היומן ואינה תקלה.
  const { selfDeleteList } = build([
    ENTRY({ id: 'a', source: 'admin' }),
    ENTRY({ id: 'b', source: undefined }),
    ENTRY({ id: 'c', source: 'self-delete' }),
  ]);
  is('רק self-delete — מחיקות מנהל אינן תקלה', selfDeleteList().map(x => x.key).join(','), 'selfdel|c');
}
{
  const { selfDeleteList } = build([]);
  is('יומן ריק אינו קורס', selfDeleteList().length, 0);
}

console.log('\n— כשלא נכתבה סיבה —');
{
  const { selfDeleteList } = build([ENTRY({ selfReason: '' })]);
  is('סיבה ריקה נשארת ריקה (המסך אומר "לא ציין סיבה")', selfDeleteList()[0].reason, '');
}
{
  const { selfDeleteList } = build([ENTRY({ selfReason: '   ' })]);
  is('רווחים בלבד נחשבים כלא-ציין', selfDeleteList()[0].reason, '');
}
{
  const { selfDeleteList } = build([ENTRY({ label: '', actorName: 'שם גיבוי', actorEmail: '' })]);
  is('בלי label — נפילה-לאחור ל-actorName', selfDeleteList()[0].name, 'שם גיבוי');
}
{
  const { selfDeleteList } = build([ENTRY({ label: '', actorName: '' })]);
  is('בלי שום שם — לא ריק', selfDeleteList()[0].name, '(ללא שם)');
}

console.log('\n— סדר וסימון "טיפלתי" —');
{
  const { selfDeleteList } = build([
    ENTRY({ id: 'old', deletedAt: new Date('2026-09-01T10:00:00Z') }),
    ENTRY({ id: 'new', deletedAt: new Date('2026-09-06T10:00:00Z') }),
  ]);
  is('החדש קודם', selfDeleteList().map(x => x.key).join(','), 'selfdel|new,selfdel|old');
}
{
  const entries = [ENTRY({ id: 'x' }), ENTRY({ id: 'y' })];
  const handled = { 'selfdel|x': { at: '2026-09-06', note: 'התקשרתי אליו' } };
  const { selfDeleteList, selfDeleteOpenList } = build(entries, handled);
  is('הרשימה המלאה מחזיקה את שתיהן', selfDeleteList().length, 2);
  is('הפתוחות מסננות את מה שטופל', selfDeleteOpenList().map(x => x.key).join(','), 'selfdel|y');
  is('וההערה נשמרת', selfDeleteList().find(x => x.key === 'selfdel|x').handled.note, 'התקשרתי אליו');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
