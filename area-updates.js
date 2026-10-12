// ══ §503 — "האזור שלי" שלב 2: לשונית "עדכונים" ═══════════════════════════════════════════════
// מה שהצוות שולח "לאזור" (מרכז ההודעות ← "עדכון לאזור") וכל פוש שנשלח — מועתקים ע"י הוורקר
// לתיבה האישית members/{id}/inbox, וכאן הם מוצגים בבלוקים לפי §473ב/ג/ד/י:
//   אוהד:      "עדכונים מ-Yellow Zone" + "התראות שקיבלת לטלפון" — שניהם גלויים.
//   בעל עסק:   4 קוביות — "על העסק שלך" · "לכל בעלי העסקים" · "לאוהדים" · "התראות בטלפון";
//              מוצג רק הבלוק של הקובייה שנבחרה (§473י), ובכניסה — הראשונה שיש בה חדש.
// "חדש" במילה (לא רק נקודה); 3 אחרונים בכל בלוק ו"הצגת עוד N"; לחיצה על פריט = נקרא (כמו בדמו).
// ⚠️ חייב אותה גרסת SDK כמו firebase-config.js (ר' conversations.js).
import {
  collection, doc, query, orderBy, limit, onSnapshot, updateDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

const SHOW_N = 3;
// ר' conversations.js — timestamp ממתין הוא null בלי 'estimate'.
const TS_ESTIMATE = { serverTimestamps: 'estimate' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : (t ? new Date(t).getTime() : Date.now());
function ago(t) {
  const d = Date.now() - ms(t);
  if (d < 60e3) return 'עכשיו';
  if (d < 3600e3) return 'לפני ' + Math.round(d / 60e3) + ' דק׳';
  if (d < 86400e3) return 'לפני ' + Math.round(d / 3600e3) + ' שע׳';
  if (d < 2 * 86400e3) return 'אתמול';
  return new Date(ms(t)).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}
const countLabel = (n) => !n ? 'אין חדש' : n === 1 ? 'חדש אחד' : n + ' חדשים';
// קישור בפריט — נתיב יחסי בלבד (הוורקר כבר מסנן; כאן חגורה-ושלייקס, כמו native-push.js).
const safeLink = (l) => (typeof l === 'string' && l.charAt(0) === '/' && l.charAt(1) !== '/') ? l : '';

function injectStyle() {
  if (document.getElementById('auStyle')) return;
  const s = document.createElement('style');
  s.id = 'auStyle';
  s.textContent = `
  .au-wrap{display:flex;flex-direction:column;gap:12px}
  .au-intro{font-size:14px;line-height:1.65;color:var(--text);background:rgba(255,212,0,.14);border:1px solid rgba(255,212,0,.5);border-radius:14px;padding:12px 14px;margin:0}
  .au-strip{display:flex;align-items:center;gap:12px;width:100%;text-align:right;border:none;cursor:pointer;background:var(--yellow);color:var(--text);border-radius:16px;padding:14px 16px;font:inherit;font-size:15px;line-height:1.45}
  .au-strip-dot{width:12px;height:12px;border-radius:50%;background:var(--text);flex-shrink:0}
  .au-strip-arrow{margin-inline-start:auto;font-size:26px;font-weight:900}
  .au-jump{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .au-jb{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:right;cursor:pointer;background:#fff;border:1.5px solid var(--border-md);border-radius:14px;padding:12px 14px;color:var(--text);min-height:64px;font:inherit}
  .au-jb.biz{background:var(--text);border-color:var(--text);color:#fff}
  .au-jb.biz2{background:#E8EEFB;border-color:var(--text)}
  .au-jb.sel{outline:3px solid var(--yellow);outline-offset:2px;box-shadow:0 6px 16px rgba(10,42,102,.18)}
  .au-jb.sel::after{content:'מוצג למטה ▾';font-size:11.5px;font-weight:900;margin-top:2px}
  .au-jb:not(.sel){opacity:.82}
  .au-jt{font-size:14.5px;font-weight:900;line-height:1.3}
  .au-jc{font-size:12.5px;font-weight:700;color:var(--text-muted)}
  .au-jb.biz .au-jc{color:rgba(255,255,255,.7)}
  .au-jc.has{background:var(--yellow);color:var(--text)!important;border-radius:20px;padding:2px 9px;font-weight:900}
  .au-sec{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;overflow:hidden}
  .au-sec.biz{border:2px solid var(--text)}
  .au-sec.biz .au-head{background:var(--text);color:#fff}
  .au-sec.biz .au-sub{color:rgba(255,255,255,.75)}
  .au-sec.biz2{border:2px solid var(--text)}
  .au-sec.biz2 .au-head{background:#E8EEFB;border-bottom:1px solid #cdd8f2}
  .au-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border)}
  .au-title{font-size:16.5px;font-weight:900}
  .au-sub{font-size:13px;color:var(--text-sm);margin-top:2px}
  .au-count{margin-inline-start:auto;font-size:12.5px;font-weight:900;background:var(--yellow);color:var(--text);border-radius:20px;padding:4px 10px;white-space:nowrap}
  .au-feed{padding:0 16px}
  .au-item{display:block;width:100%;text-align:right;background:none;border:none;border-bottom:1px solid var(--border);padding:14px 2px;cursor:pointer;color:var(--text);font:inherit}
  .au-item:last-child{border-bottom:none}
  .au-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px}
  .au-new{font-size:11.5px;font-weight:900;background:var(--yellow);color:var(--text);border-radius:6px;padding:2px 8px}
  .au-kind{font-size:10.5px;font-weight:800;border-radius:6px;padding:2px 7px;background:#E8EEFB;color:var(--text)}
  .au-time{font-size:11px;color:var(--text-muted);margin-inline-start:auto}
  .au-it{font-size:15.5px;font-weight:800;line-height:1.4}
  .au-item.read .au-it{font-weight:600}
  .au-tx{font-size:14px;color:var(--text-sm);line-height:1.55;margin-top:3px;white-space:pre-line;word-break:break-word}
  .au-link{display:inline-block;margin-top:8px;font-size:12.5px;font-weight:800;color:var(--text);border:1px solid var(--border-md);border-radius:10px;padding:6px 10px;background:#fff}
  .au-empty{text-align:center;padding:22px 10px;color:var(--text-sm);font-size:13px}
  .au-more{display:block;width:100%;border:none;border-top:1px solid var(--border);background:none;padding:13px;font:inherit;font-size:14px;font-weight:800;color:var(--text);cursor:pointer}
  .au-readall{display:block;width:100%;border:none;border-top:1px solid var(--border);background:none;padding:11px;font:inherit;font-size:12.5px;font-weight:700;color:var(--text-sm);cursor:pointer}
  `;
  document.head.appendChild(s);
}

// db, memberId — של הדף. isOwner/bizName — בעל עסק (4 קוביות). onUnread(n) — מונה ללשונית.
// onOpenReplies() — הפס "יש לך תשובה חדשה מהצוות" מעביר ללשונית ההודעות.
export function mountUpdates({ db, memberId, root, isOwner = false, bizName = '', onUnread, onOpenReplies }) {
  injectStyle();
  const state = { items: [], loaded: false, err: false, sel: null, expanded: {}, replyUnread: 0 };

  const BLOCKS = isOwner
    ? [
        { k: 'myBiz', cls: 'biz', jcls: 'biz', jt: 'על העסק שלך', title: 'על העסק שלך' + (bizName ? ' – ' + bizName : ''),
          sub: 'הודעות שנשלחו במיוחד לעסק שלך', empty: 'אין עדיין הודעות על העסק שלך' },
        { k: 'allBiz', cls: 'biz2', jcls: 'biz2', jt: 'לכל בעלי העסקים', title: 'לבעלי העסקים',
          sub: 'הודעות חשובות מהצוות לכל העסקים באינדקס', empty: 'אין עדיין הודעות לבעלי העסקים' },
        { k: 'members', cls: '', jcls: '', jt: 'לאוהדים', title: 'עדכונים לאוהדים',
          sub: 'מה שנשלח לכל חברי Yellow Zone – גם אליך כאוהד', empty: 'אין עדיין עדכונים' },
        { k: 'push', cls: '', jcls: '', jt: 'התראות בטלפון', title: 'התראות שקיבלת לטלפון',
          sub: 'כל התראה שנשלחה אליך – גם אם מחקת אותה מהטלפון', empty: 'עדיין לא קיבלת התראות' },
      ]
    : [
        { k: 'members', cls: '', title: 'עדכונים מ-Yellow Zone', sub: 'חדשות, הטבות ועדכונים לכל החברים', empty: 'אין עדיין עדכונים' },
        { k: 'push', cls: '', title: 'התראות שקיבלת לטלפון', sub: 'כל התראה שנשלחה אליך – גם אם מחקת אותה מהטלפון', empty: 'עדיין לא קיבלת התראות' },
      ];
  // פריט שהגיע לבלוק שלא קיים אצל אוהד (לא אמור לקרות) — לא נעלם: נכנס ל"עדכונים".
  const blockOf = (it) => BLOCKS.some((b) => b.k === it.block) ? it.block : 'members';
  const inBlock = (k) => state.items.filter((it) => blockOf(it) === k);
  const unreadIn = (k) => inBlock(k).filter((it) => !it.readAt).length;

  function itemHtml(it) {
    const link = safeLink(it.link);
    return `<button type="button" class="au-item${it.readAt ? ' read' : ''}" data-id="${esc(it.id)}">
        <div class="au-top">
          ${it.readAt ? '' : '<span class="au-new">חדש</span>'}
          ${it.block === 'push' && it.bizName ? '<span class="au-kind">לעסק שלך</span>' : ''}
          <span class="au-time">${ago(it.sentAt)}</span>
        </div>
        <div class="au-it">${esc(it.title)}</div>
        ${it.text ? `<div class="au-tx">${esc(it.text)}</div>` : ''}
        ${link ? '<span class="au-link">לפרטים ›</span>' : ''}
      </button>`;
  }
  function secHtml(b) {
    const all = inBlock(b.k);
    const n = all.filter((it) => !it.readAt).length;
    const shown = state.expanded[b.k] ? all : all.slice(0, SHOW_N);
    const rest = all.length - shown.length;
    return `<div class="au-sec ${b.cls}">
        <div class="au-head">
          <div><div class="au-title">${esc(b.title)}</div><div class="au-sub">${esc(b.sub)}</div></div>
          ${n && b.cls ? `<span class="au-count">${countLabel(n)}</span>` : ''}
        </div>
        <div class="au-feed">${shown.length ? shown.map(itemHtml).join('') : `<div class="au-empty">${b.empty}</div>`}</div>
        ${rest > 0 ? `<button type="button" class="au-more" data-more="${b.k}">הצגת עוד ${rest}</button>` : ''}
        ${n > 1 ? `<button type="button" class="au-readall" data-readall="${b.k}">סימון הכל כנקרא</button>` : ''}
      </div>`;
  }

  function render() {
    const intro = isOwner
      ? '<b>כל העדכונים החשובים במקום אחד</b>: על העסק שלך, מהצוות לבעלי העסקים, לאוהדים, והתראות. לוחצים על קובייה לפתוח. לא נקרא = "חדש".'
      : '<b>כל העדכונים במקום אחד</b>: עסקים והטבות חדשות, חידושים באפליקציה והתראות שקיבלת. לא נקרא = "חדש".';
    let body;
    if (state.err) body = '<div class="au-sec"><div class="au-empty">לא הצלחנו לטעון את העדכונים. נסו לרענן.</div></div>';
    else if (!state.loaded) body = '<div class="au-sec"><div class="au-empty">טוען…</div></div>';
    else if (isOwner) {
      // §473י — ברירת המחדל נקבעת פעם אחת, בכניסה: הקובייה הראשונה שיש בה חדש.
      if (!state.sel) state.sel = (BLOCKS.find((b) => unreadIn(b.k)) || BLOCKS[0]).k;
      body = `<nav class="au-jump">${BLOCKS.map((b) => {
          const n = unreadIn(b.k);
          return `<button type="button" class="au-jb ${b.jcls}${state.sel === b.k ? ' sel' : ''}" data-sel="${b.k}">
            <span class="au-jt">${esc(b.jt)}</span><span class="au-jc${n ? ' has' : ''}">${countLabel(n)}</span></button>`;
        }).join('')}</nav>` + secHtml(BLOCKS.find((b) => b.k === state.sel));
    } else body = BLOCKS.map(secHtml).join('');
    root.innerHTML = `<div class="au-wrap">
        <p class="au-intro">${intro}</p>
        ${state.replyUnread ? `<button type="button" class="au-strip" data-strip="1"><span class="au-strip-dot"></span>
          <span><b>יש לך תשובה חדשה מהצוות</b><br/>לחצו כאן כדי לקרוא</span><span class="au-strip-arrow">‹</span></button>` : ''}
        ${body}</div>`;
    if (onUnread) onUnread(state.items.filter((it) => !it.readAt).length);
  }

  function markRead(ids) {
    const unread = ids.map((id) => state.items.find((x) => x.id === id)).filter((it) => it && !it.readAt);
    if (!unread.length) return;
    const b = writeBatch(db);
    unread.forEach((it) => b.update(doc(db, 'members', memberId, 'inbox', it.id), { readAt: serverTimestamp() }));
    b.commit().catch((e) => console.warn('inbox mark-read failed:', e && (e.code || e.message)));
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-id],[data-sel],[data-more],[data-readall],[data-strip]');
    if (!t) return;
    if (t.dataset.strip) { if (onOpenReplies) onOpenReplies(); return; }
    if (t.dataset.sel) { state.sel = t.dataset.sel; render(); return; }
    if (t.dataset.more) { state.expanded[t.dataset.more] = true; render(); return; }
    if (t.dataset.readall) { markRead(inBlock(t.dataset.readall).map((it) => it.id)); return; }
    const it = state.items.find((x) => x.id === t.dataset.id);
    if (!it) return;
    markRead([it.id]);
    const link = safeLink(it.link);
    if (link && location.pathname + location.search !== link) location.href = link;
  });

  onSnapshot(query(collection(db, 'members', memberId, 'inbox'), orderBy('sentAt', 'desc'), limit(150)),
    (snap) => {
      state.loaded = true; state.err = false;
      state.items = snap.docs.map((d) => ({ id: d.id, ...d.data(TS_ESTIMATE) }));
      render();
    },
    (e) => { console.error('inbox load failed:', e && (e.code || e.message)); state.err = true; render(); });

  render();
  return {
    setReplyUnread(n) { if (state.replyUnread !== n) { state.replyUnread = n; render(); } },
  };
}
