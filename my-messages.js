// ══ §523 — "הודעות" ב"האזור שלי": לשונית אחת במקום "עדכונים" + "הודעות" (§504ה, הדמו my-area-messages-demo.html) ══
// רמי (13.10): "קצת מבלבל – עדכון מ-Yellow Zone, הודעות, הודעות לכולם... יהיה נכון לאחד הכל. חשוב שהתווית
// תופיע והוא גם יוכל לסנן... להפריד בין ההודעות של אוהד והודעות של עסק".
//
// רשימה אחת לפי זמן: כל מה שנשלח אליו (members/{id}/inbox – הוורקר כותב, §503/§522) + השיחות שלו עם
// הצוות (conversations, §501). על כל פריט – תווית למי זה נשלח, ופס צבע בצד: כחול = העסק, צהוב = כאוהד,
// תכלת = שיחה. הודעה שלא נקראה צבועה **עד שלוחצים עליה** (§522ג) – צפייה לא מסמנת.
// השיחה עצמה (השרשור והכתיבה) – conversations.js במצב embedded, באותו מקום.
//
// פוש = ה"צלצול" של פריט כאן (§504ו): /profile.html?tab=msgs&item=<id> פותח ומסמן אותו.
// ⚠️ חייב אותה גרסת SDK כמו firebase-config.js (ר' conversations.js).
import {
  collection, doc, query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { mountConversations, isUnread as convUnread } from './conversations.js';

const TS_ESTIMATE = { serverTimestamps: 'estimate' };   // ר' conversations.js
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : (t instanceof Date ? t.getTime() : (t ? new Date(t).getTime() : Date.now()));
function ago(t) {
  const d = Date.now() - t;
  if (d < 60e3) return 'עכשיו';
  if (d < 3600e3) return 'לפני ' + Math.round(d / 60e3) + ' דק׳';
  if (d < 86400e3) return 'לפני ' + Math.round(d / 3600e3) + ' שע׳';
  if (d < 2 * 86400e3) return 'אתמול';
  return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}
const dayGroup = (t) => { const d = (Date.now() - t) / 86400e3; return d < 1 ? 'היום' : d < 7 ? 'השבוע' : 'קודם'; };
const safeLink = (l) => (typeof l === 'string' && l.charAt(0) === '/' && l.charAt(1) !== '/') ? l : '';

function injectStyle() {
  if (document.getElementById('mmStyle')) return;
  const s = document.createElement('style');
  s.id = 'mmStyle';
  s.textContent = `
  .mm-head{display:flex;align-items:center;gap:8px;margin:0 0 10px}
  .mm-head h2{margin:0;font-size:18px;font-weight:900;color:var(--text)}
  .mm-write{border:none;border-radius:12px;padding:9px 14px;font:inherit;font-size:13.5px;font-weight:900;cursor:pointer;background:var(--yellow);color:var(--text);margin-inline-start:auto}
  .mm-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
  .mm-chip{border:1.5px solid var(--border-md);background:#fff;border-radius:20px;padding:6px 11px;font:inherit;font-size:12.5px;font-weight:800;color:var(--text-sm);cursor:pointer;display:inline-flex;gap:5px;align-items:center}
  .mm-chip.on{background:var(--text);border-color:var(--text);color:#fff}
  .mm-chip .n{background:var(--yellow);color:var(--text);border-radius:9px;font-size:10.5px;padding:0 6px}
  .mm-day{font-size:12px;font-weight:800;color:var(--text-muted);margin:14px 2px 6px}
  .mm-it{display:block;width:100%;box-sizing:border-box;text-align:right;background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:12px 14px 12px 12px;margin-bottom:8px;cursor:pointer;color:var(--text);font:inherit;border-inline-start:5px solid var(--border)}
  .mm-it.biz{border-inline-start-color:var(--text)}
  .mm-it.fan{border-inline-start-color:var(--yellow)}
  .mm-it.conv{border-inline-start-color:#9DB3E6}
  .mm-it.unread{background:#FFFCEB;border-top-color:#F3DC7A;border-bottom-color:#F3DC7A;border-left-color:#F3DC7A}
  .mm-top{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:5px}
  .mm-lbl{font-size:11px;font-weight:900;border-radius:7px;padding:2px 8px;white-space:nowrap}
  .mm-lbl.biz{background:var(--text);color:#fff}
  .mm-lbl.biz2{background:#E8EEFB;color:var(--text)}
  .mm-lbl.fan{background:#FFF6CC;color:#7A5B00}
  .mm-lbl.conv{background:#E8EEFB;color:var(--text)}
  .mm-new{font-size:11px;font-weight:900;background:var(--yellow);color:var(--text);border-radius:6px;padding:2px 7px}
  .mm-time{font-size:11px;color:var(--text-muted);margin-inline-start:auto}
  .mm-tt{font-size:15px;font-weight:800;line-height:1.4;word-break:break-word}
  .mm-it:not(.unread) .mm-tt{font-weight:600}
  .mm-tx{font-size:13.5px;color:var(--text-sm);line-height:1.55;margin-top:3px;white-space:pre-line;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .mm-it.open .mm-tx{-webkit-line-clamp:unset;display:block}
  .mm-go{display:inline-block;margin-top:8px;font-size:12.5px;font-weight:800;border:1px solid var(--border-md);border-radius:10px;padding:6px 10px;background:#fff;color:var(--text)}
  .mm-st{display:inline-block;margin-top:6px;font-size:11.5px;font-weight:900;border-radius:20px;padding:2px 9px;background:var(--card-bg2);color:var(--text-sm)}
  .mm-readall{display:block;margin:6px auto 0;border:none;background:none;font:inherit;font-size:12.5px;font-weight:700;color:var(--text-sm);cursor:pointer;text-decoration:underline}
  .mm-empty{text-align:center;color:var(--text-sm);font-size:13px;padding:28px 10px;line-height:1.6}
  .mm-about{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:13px;margin:4px 0 10px}
  .mm-about button{border:1.5px solid var(--border-md);background:#fff;border-radius:20px;padding:6px 12px;font:inherit;font-size:13px;font-weight:800;color:var(--text-sm);cursor:pointer}
  .mm-about button.on{border-color:var(--text);background:var(--text);color:#fff}
  [data-mm-hidden]{display:none!important}
  `;
  document.head.appendChild(s);
}

//  db, memberId — תיבת החבר (בדשבורד העסק: ownerMemberId בזהות העסק – החוקים מכירים בה).
//  isOwner/bizName/ownerBizId — בעל עסק: תוויות "העסק", סינון, ו"כתבו לנו" על העסק.
//  onUnread(n) — מונה אחד (הודעות שלא נקראו + שיחות עם תשובה חדשה) ללשונית ולפעמון.
//  openItem / openConv / compose — מהכתובת (?item= / ?conv= / ?new=1).
export function mountMessages({ db, memberId, root, isOwner = false, bizName = '', ownerBizId = null, onUnread, savePushToken, source = 'app', bizId = null, openItem = '', openConv = '', compose = false }) {
  injectStyle();
  const state = { items: [], convs: [], inLoaded: false, cvLoaded: false, inErr: false, cvErr: false, f: 'all', expanded: {}, mode: 'feed', about: 'biz', pendingItem: openItem || '' };
  root.innerHTML = `
    <div data-mm="feed"></div>
    <div data-mm="convWrap" data-mm-hidden>
      <div class="mm-about" data-mm="about" data-mm-hidden></div>
      <div data-mm="convRoot"></div>
    </div>`;
  const $ = (k) => root.querySelector('[data-mm="' + k + '"]');
  const show = (k, on) => { const el = $(k); if (on) el.removeAttribute('data-mm-hidden'); else el.setAttribute('data-mm-hidden', ''); };

  const conv = mountConversations({
    db, memberId, root: $('convRoot'), source, bizId, savePushToken, embedded: true,
    onBack: () => setMode('feed'),
  });

  // ── מה כל פריט ──
  const SIDE_BIZ = { myBiz: 1, allBiz: 1 };
  function rows() {
    const inbox = state.items.map((it) => ({
      t: 'in', id: it.id, block: it.block || 'members', title: it.title || '', text: it.text || '', link: safeLink(it.link),
      bizName: it.bizName || '', at: ms(it.sentAt), unread: !it.readAt, side: SIDE_BIZ[it.block] ? 'biz' : 'fan',
    }));
    const convs = state.convs.map((c) => ({
      t: 'cv', id: c.id, title: c.subject || '', status: c.status, lastFrom: c.lastFrom, at: ms(c.lastAt), unread: convUnread(c),
      side: (c.source === 'bizDashboard' || c.bizId) ? 'biz' : 'fan',
    }));
    return inbox.concat(convs).sort((a, b) => b.at - a.at);
  }
  // §523ב (רמי, 14.10): בלי לבבות; "אליך" לא היה מובן → "הודעה אישית"; והודעות לכולם בסינון משלהן
  // ("מ-Yellow Zone" ערבב לכולם + אישיות). push ישן – תמיד שודר לקבוצה, ולכן עם "לכל האוהדים".
  const isPersonal = (r) => r.t === 'in' && r.block === 'personal';
  const isFanMass = (r) => r.t === 'in' && r.side === 'fan' && r.block !== 'personal';
  const FILTERS = () => isOwner
    ? [['all', 'הכל', () => true], ['biz', '🏪 העסק שלי', (r) => r.t === 'in' && r.side === 'biz'], ['mass', 'לכל האוהדים', isFanMass], ['personal', 'אישיות', isPersonal], ['cv', '💬 שיחות', (r) => r.t === 'cv']]
    : [['all', 'הכל', () => true], ['mass', 'לכל האוהדים', isFanMass], ['personal', 'אישיות', isPersonal], ['cv', '💬 השיחות שלי', (r) => r.t === 'cv']];
  function label(r) {
    if (r.t === 'cv') return `<span class="mm-lbl conv">💬 שיחה עם הצוות${isOwner ? (r.side === 'biz' ? ' · על העסק' : ' · כאוהד') : ''}</span>`;
    if (r.block === 'myBiz') return `<span class="mm-lbl biz">🏪 לעסק שלך${(r.bizName || bizName) ? ' · ' + esc(r.bizName || bizName) : ''}</span>`;
    if (r.block === 'allBiz') return '<span class="mm-lbl biz2">🏪 לכל בעלי העסקים</span>';
    if (r.block === 'personal') return '<span class="mm-lbl fan">הודעה אישית</span>';
    if (r.block === 'push') return '<span class="mm-lbl fan">📲 התראה לכל האוהדים</span>';
    return '<span class="mm-lbl fan">לכל האוהדים</span>';
  }
  function itemHtml(r) {
    if (r.t === 'cv') {
      const st = r.status === 'closed' ? 'סגורה' : r.lastFrom === 'member' ? 'ממתינה לתשובה' : '';
      return `<button type="button" class="mm-it conv${r.unread ? ' unread' : ''}" data-mmcv="${esc(r.id)}">
        <div class="mm-top">${r.unread ? '<span class="mm-new">תשובה חדשה</span>' : ''}${label(r)}<span class="mm-time">${ago(r.at)}</span></div>
        <div class="mm-tt">${esc(r.title)}</div>${st ? `<span class="mm-st">${st}</span>` : ''}</button>`;
    }
    const open = !!state.expanded[r.id];
    return `<button type="button" class="mm-it ${r.side}${r.unread ? ' unread' : ''}${open ? ' open' : ''}" data-in="${esc(r.id)}">
      <div class="mm-top">${r.unread ? '<span class="mm-new">חדש</span>' : ''}${label(r)}<span class="mm-time">${ago(r.at)}</span></div>
      <div class="mm-tt">${esc(r.title)}</div>${r.text ? `<div class="mm-tx">${esc(r.text)}</div>` : ''}
      ${r.link && open ? `<span class="mm-go" data-go="${esc(r.link)}">לפרטים ›</span>` : ''}</button>`;
  }
  function renderFeed() {
    const all = rows();
    const F = FILTERS(); if (!F.some((f) => f[0] === state.f)) state.f = 'all';
    const fn = F.find((f) => f[0] === state.f)[2];
    const list = all.filter(fn);
    let body = '';
    if ((state.inErr && state.cvErr)) body = '<div class="mm-empty">לא הצלחנו לטעון את ההודעות. בדקו את החיבור ונסו לרענן.<br>אפשר תמיד לכתוב לנו במייל yellowzonemta@gmail.com</div>';
    else if (!state.inLoaded && !state.cvLoaded) body = '<div class="mm-empty">טוען…</div>';
    else if (!list.length) body = `<div class="mm-empty">${state.f === 'cv' ? 'אין עדיין שיחות. יש שאלה? לחצו "כתבו לנו".' : 'אין כאן עדיין הודעות.'}</div>`;
    else { let last = ''; list.forEach((r) => { const g = dayGroup(r.at); if (g !== last) { body += `<div class="mm-day">${g}</div>`; last = g; } body += itemHtml(r); }); }
    const unreadIn = list.filter((r) => r.t === 'in' && r.unread).length;
    $('feed').innerHTML = `<div class="mm-head"><h2>הודעות</h2><button type="button" class="mm-write" data-write="1">✍️ כתבו לנו</button></div>
      <div class="mm-chips">${F.map(([k, l, f]) => { const u = all.filter(f).filter((r) => r.unread).length; return `<button type="button" class="mm-chip${state.f === k ? ' on' : ''}" data-f="${k}">${l}${u ? `<span class="n">${u}</span>` : ''}</button>`; }).join('')}</div>
      ${state.inErr && !state.cvErr ? '<div class="mm-empty" style="padding:8px">חלק מההודעות לא נטענו. נסו לרענן.</div>' : ''}
      ${body}${unreadIn > 1 ? '<button type="button" class="mm-readall" data-readall="1">סימון הכל כנקרא</button>' : ''}`;
    if (onUnread) onUnread(all.filter((r) => r.unread).length);
    // ?item=<id> (מהפוש): פותח ומסמן כשהפריט הגיע
    if (state.pendingItem && state.items.some((x) => x.id === state.pendingItem)) {
      const id = state.pendingItem; state.pendingItem = '';
      state.f = 'all'; state.expanded[id] = true; markRead([id]); renderFeed();
      const el = root.querySelector('[data-in="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (el) el.scrollIntoView({ block: 'center' });
    }
  }
  function setMode(m) {
    state.mode = m;
    show('feed', m === 'feed'); show('convWrap', m !== 'feed');
    show('about', m === 'compose' && isOwner && !!ownerBizId);
    if (m === 'feed') renderFeed();
  }
  function renderAbout() {
    $('about').innerHTML = '<span style="color:var(--text-sm)">בנושא:</span>' + [['biz', '🏪 העסק שלי'], ['fan', 'משהו אחר']]
      .map(([k, l]) => `<button type="button" class="${state.about === k ? 'on' : ''}" data-about="${k}">${l}</button>`).join('');
  }
  function startCompose() {
    state.about = 'biz'; renderAbout();
    setMode('compose');
    conv.startNew(isOwner && ownerBizId ? { source: 'bizDashboard', bizId: ownerBizId } : null);
  }

  function markRead(ids) {
    const un = ids.map((id) => state.items.find((x) => x.id === id)).filter((it) => it && !it.readAt);
    if (!un.length) return;
    const b = writeBatch(db);
    un.forEach((it) => b.update(doc(db, 'members', memberId, 'inbox', it.id), { readAt: serverTimestamp() }));
    b.commit().catch((e) => console.warn('inbox mark-read failed:', e && (e.code || e.message)));
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-in],[data-mmcv],[data-f],[data-write],[data-readall],[data-about]');
    // ⚠️ data-mmcv ולא data-cv: conversations.js (בתוך אותו root) משתמש ב-data-cv לכפתורים שלו –
    // שם משותף גרם ל"חזרה"/"שליחה" שלו להיתפס כאן כ"פתיחת שיחה" (נתפס בהרנס).
    if (!t || !root.contains(t) || t.closest('[data-mm="convRoot"]')) return;
    if (t.dataset.go) { e.stopPropagation(); const l = safeLink(t.dataset.go); if (l && location.pathname + location.search !== l) location.href = l; return; }
    if (t.dataset.f) { state.f = t.dataset.f; renderFeed(); return; }
    if (t.dataset.write) { startCompose(); return; }
    if (t.dataset.readall) { const fn = FILTERS().find((f) => f[0] === state.f)[2]; markRead(rows().filter(fn).filter((r) => r.t === 'in' && r.unread).map((r) => r.id)); return; }
    if (t.dataset.about) {
      state.about = t.dataset.about; renderAbout();
      conv.startNew(state.about === 'biz' ? { source: 'bizDashboard', bizId: ownerBizId } : { source: 'app', bizId: null });
      return;
    }
    if (t.dataset.mmcv) { setMode('conv'); conv.openConv(t.dataset.mmcv); return; }
    if (t.dataset.in) {
      const id = t.dataset.in;
      state.expanded[id] = !state.expanded[id];
      markRead([id]);   // הצבע יורד רק כאן – בלחיצה (§522ג)
      renderFeed();
    }
  });

  onSnapshot(query(collection(db, 'members', memberId, 'inbox'), orderBy('sentAt', 'desc'), limit(150)),
    (snap) => { state.inLoaded = true; state.inErr = false; state.items = snap.docs.map((d) => ({ id: d.id, ...d.data(TS_ESTIMATE) })); if (state.mode === 'feed') renderFeed(); else if (onUnread) onUnread(rows().filter((r) => r.unread).length); },
    (e) => { console.error('inbox load failed:', e && (e.code || e.message)); state.inErr = true; state.inLoaded = true; renderFeed(); });
  // where(memberId) בלבד – כמו conversations.js (בלי אינדקס מורכב)
  onSnapshot(query(collection(db, 'conversations'), where('memberId', '==', memberId)),
    (snap) => { state.cvLoaded = true; state.cvErr = false; state.convs = snap.docs.map((d) => ({ id: d.id, ...d.data(TS_ESTIMATE) })); if (state.mode === 'feed') renderFeed(); else if (onUnread) onUnread(rows().filter((r) => r.unread).length); },
    (e) => { console.error('conversations load failed:', e && (e.code || e.message)); state.cvErr = true; state.cvLoaded = true; renderFeed(); });

  setMode('feed');
  if (openConv) { setMode('conv'); conv.openConv(openConv); }
  else if (compose) startCompose();
  return {
    compose: startCompose,
    openConv: (id) => { setMode('conv'); conv.openConv(id); },
    openItem: (id) => { state.pendingItem = id; conv.closeView(); setMode('feed'); },
  };
}
