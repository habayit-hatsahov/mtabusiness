// ══ §501 — שיחות עם הצוות ("האזור שלי", §473 שלב 1) ═════════════════════════════════════════
// כל פנייה = שיחה נפרדת עם היסטוריה (§473טו). תיבה אחת לכל אדם — אוהד ובעל עסק אותו דבר
// (§473טז). הצוות עונה ממרכז הניהול, והתשובה מגיעה לכאן + מייל + פוש (באנדרואיד).
//
// מודול משותף (ES module) ולא מרקאפ בדף: היום הוא יושב בלשונית "הודעות" של profile.html,
// ובשלב 4 של §473 הפרופיל הופך ל"האזור שלי" — והלשונית עוברת כמו שהיא, בלי לגעת בקוד הזה.
//
// מבנה הנתונים (firestore.rules → match /conversations):
//   conversations/{id}: memberId · status 'open'|'closed' · subject · source · createdAt ·
//                       lastAt · lastFrom 'member'|'admin' · memberReadAt · adminReadAt · closedAt
//   conversations/{id}/messages/{id}: from 'member'|'admin' · text · createdAt
//
// 🔑 "תשובה חדשה" נגזרת מהמצב ולא מאירוע: lastFrom=='admin' ו-memberReadAt < lastAt.
// ר' [[feedback_state_not_event_detection]].
//
// ⚠️ חייב **אותה גרסה בדיוק** של ה-SDK כמו firebase-config.js — גרסה אחרת היא SDK נפרד שלא
// מכיר את ה-db שמגיע מהדף (ר' fan-message.js).
import {
  collection, doc, query, where, orderBy, onSnapshot, writeBatch, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

const MAX = 2000;
// 🔴 **'estimate' חובה, לא קישוט** (נתפס בבדיקה מול האמולטור): serverTimestamp שעוד לא חזר מהשרת
// הוא null בצילום המקומי, ו-isUnread קרא null כ"מעולם לא נקרא" — כלומר סימון "נקרא" שנכתב
// הרגע **הדליק** את התג במקום לכבות אותו, עד שהשרת אישר. 'estimate' נותן את השעה המקומית בינתיים.
const TS_ESTIMATE = { serverTimestamps: 'estimate' };
const SUBJECT_MAX = 80;
const SEND_TIMEOUT_MS = 20000;
const CONTACT_MAIL = 'yellowzonemta@gmail.com';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// serverTimestamp שעוד לא חזר מהשרת הוא null בצילום המקומי — "עכשיו" ולא "לפני 56 שנה".
const ms = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : (t instanceof Date ? t.getTime() : Date.now());
const fmtDate = (t) => new Date(ms(t)).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
const fmtTime = (t) => new Date(ms(t)).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
function ago(t) {
  const d = Date.now() - ms(t);
  if (d < 60e3) return 'עכשיו';
  if (d < 3600e3) return 'לפני ' + Math.round(d / 60e3) + ' דק׳';
  if (d < 86400e3) return 'לפני ' + Math.round(d / 3600e3) + ' שע׳';
  if (d < 2 * 86400e3) return 'אתמול';
  return fmtDate(t);
}
function withTimeout(p, msLimit) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('conv-timeout')), msLimit))]);
}
export function isUnread(c) {
  return c.lastFrom === 'admin' && (!c.memberReadAt || ms(c.memberReadAt) < ms(c.lastAt));
}
function subjectFrom(text) {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > SUBJECT_MAX ? s.slice(0, SUBJECT_MAX - 1) + '…' : s;
}

function injectStyle() {
  if (document.getElementById('cvStyle')) return;
  const s = document.createElement('style');
  s.id = 'cvStyle';
  s.textContent = `
  .cv-intro{font-size:14px;line-height:1.65;color:var(--text);background:rgba(255,212,0,.14);border:1px solid rgba(255,212,0,.5);border-radius:14px;padding:12px 14px;margin-bottom:12px}
  .cv-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}
  .cv-btn{border:none;border-radius:12px;padding:11px 18px;font:inherit;font-size:14px;font-weight:900;cursor:pointer;background:var(--yellow);color:var(--text)}
  .cv-btn:disabled{opacity:.6;cursor:default}
  .cv-chip{border:1px solid var(--border-md);background:#fff;border-radius:20px;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:700;color:var(--text-sm);cursor:pointer}
  .cv-row{display:block;width:100%;text-align:right;background:#fff;border:1px solid var(--border);border-radius:14px;padding:12px 14px;margin-top:8px;cursor:pointer;color:var(--text);font:inherit;font-size:14.5px}
  .cv-row.closed{background:var(--bg);opacity:.85}
  .cv-row.unread{border-color:var(--yellow);box-shadow:0 0 0 1px var(--yellow)}
  .cv-row-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:var(--text-muted);flex-wrap:wrap}
  .cv-tag{font-size:11.5px;font-weight:900;border-radius:20px;padding:2px 9px;white-space:nowrap}
  .cv-tag.new{background:var(--yellow);color:var(--text)}
  .cv-tag.wait{background:var(--card-bg2);color:var(--text-sm)}
  .cv-tag.open{background:#E8EEFB;color:var(--text)}
  .cv-tag.closed{background:var(--card-bg2);color:var(--text-sm)}
  .cv-sep{margin-top:16px;padding-top:12px;border-top:1px solid var(--border);font-size:12.5px;font-weight:800;color:var(--text-sm)}
  .cv-empty{text-align:center;padding:22px 10px;color:var(--text-sm);font-size:13px;line-height:1.6}
  .cv-view-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:12px 0}
  .cv-subject{font-size:16px;font-weight:900;line-height:1.4;word-break:break-word}
  .cv-status{font-size:12px;font-weight:900;border-radius:20px;padding:3px 10px;white-space:nowrap}
  .cv-status.open{background:#E8EEFB}
  .cv-status.closed{background:var(--card-bg2);color:var(--text-sm)}
  .cv-thread{display:flex;flex-direction:column;gap:10px}
  .cv-bw{display:flex;flex-direction:column}
  .cv-bw.member{align-items:flex-start}
  .cv-bw.admin{align-items:flex-end}
  .cv-bubble{max-width:84%;padding:10px 12px;border-radius:16px;font-size:14px;line-height:1.55;white-space:pre-line;word-break:break-word}
  .cv-bw.member .cv-bubble{background:var(--yellow);border-bottom-right-radius:4px}
  .cv-bw.admin .cv-bubble{background:var(--card-bg2);border:1px solid var(--border);border-bottom-left-radius:4px}
  .cv-meta{font-size:10.5px;color:var(--text-muted);margin-top:3px;padding:0 4px}
  .cv-composer{display:flex;flex-direction:column;gap:8px;margin-top:12px;border-top:1px solid var(--border);padding-top:12px}
  .cv-composer.first{border-top:none;padding-top:0}
  .cv-ta{width:100%;box-sizing:border-box;min-height:96px;resize:vertical;font:inherit;font-size:16px;line-height:1.5;color:var(--text);background:var(--bg);border:1.5px solid var(--border-md);border-radius:12px;padding:10px 12px}
  .cv-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .cv-count{font-size:11px;color:var(--text-sm);margin-inline-start:auto}
  .cv-muted{font-size:12.5px;color:var(--text-sm);line-height:1.6}
  .cv-err{font-size:12.5px;color:#d93025;line-height:1.6}
  .cv-closed-note{margin-top:14px;background:var(--card-bg2);border-radius:12px;padding:12px;font-size:13.5px;line-height:1.7}
  .cv-push{margin-top:12px;background:#E8EEFB;border:1px solid #cdd8f2;border-radius:12px;padding:12px;font-size:13.5px;line-height:1.6;display:flex;flex-direction:column;gap:8px}
  [data-cv-hidden]{display:none!important}
  `;
  document.head.appendChild(s);
}

// ── הרכבה ─────────────────────────────────────────────────────────────────────────────────
//  db, memberId — של הדף (ב-profile.html?bizToken= זה app מבודד בזהות העסק; החוקים מכירים בשתיהן).
//  root — האלמנט שבו מציירים. onUnread(n) — לסימון בלשונית/בתפריט.
//  savePushToken(res) — אופציונלי: כתיבת טוקן הפוש (הדף מחזיק את הזהות; המודול לא כותב לחבר).
//  §523 — embedded: בתוך "הודעות" המאוחד (my-messages.js). הרשימה שלנו לא מוצגת (השיחות מופיעות
//  ברשימה המאוחדת), נשארים רק השרשור והכתיבה; "חזרה" וביטול קוראים ל-onBack.
// §615 — readOnly: תצוגת מנהל (profile.html?previewMemberId=…). רואים את השיחות כמו החבר, אבל
// לא מסמנים "נקרא" בשמו ולא שולחים – בלי כפתורי כתיבה ובלי memberReadAt.
export function mountConversations({ db, memberId, root, onUnread, savePushToken, source = 'app', bizId = null, embedded = false, onBack = null, readOnly = false }) {
  injectStyle();
  const state = { convs: [], loaded: false, loadErr: false, openId: null, msgs: [], msgsErr: false, composing: false, pushOffer: false, newMeta: null };
  let unsubMsgs = null;

  root.innerHTML = `
    ${embedded ? '' : '<p class="cv-intro"><b>השיחות שלך עם הצוות.</b> כל פנייה היא שיחה נפרדת. נחזור אליך כאן ובמייל. שיחות שנסגרו נשמרות למטה, ואפשר לקרוא אותן.</p>'}
    <div class="card-section" data-cv="list">
      <div class="cv-head"${embedded ? ' data-cv-hidden' : ''}>
        <div class="section-title" style="margin:0">השיחות שלך</div>
        <button type="button" class="cv-btn" data-cv="newBtn">+ שיחה חדשה</button>
      </div>
      <div class="cv-composer first" data-cv="new" data-cv-hidden>
        <textarea class="cv-ta" data-cv="newText" maxlength="${MAX}" placeholder="כתבו לנו – שאלה, הצעה, משהו שלא עובד..."></textarea>
        <div class="cv-err" data-cv="newErr" data-cv-hidden></div>
        <div class="cv-actions">
          <button type="button" class="cv-btn" data-cv="newSend">שליחה</button>
          <button type="button" class="cv-chip" data-cv="newCancel">ביטול</button>
          <span class="cv-count" data-cv="newCount">0/${MAX}</span>
        </div>
        <div class="cv-muted">כשנענה, התשובה תופיע כאן, ונשלח לך גם מייל.</div>
      </div>
      <div data-cv="openList"></div>
      <div class="cv-sep" data-cv="closedHead" data-cv-hidden>שיחות שנסגרו</div>
      <div data-cv="closedList"></div>
    </div>
    <div class="card-section" data-cv="view" data-cv-hidden>
      <button type="button" class="cv-chip" data-cv="back">${embedded ? '› חזרה להודעות' : '› חזרה לכל השיחות'}</button>
      <div class="cv-view-head">
        <div class="cv-subject" data-cv="subject"></div>
        <span class="cv-status" data-cv="status"></span>
      </div>
      <div class="cv-thread" data-cv="thread"></div>
      <div class="cv-push" data-cv="push" data-cv-hidden>
        <div><b>רוצים לדעת מיד כשנענה?</b> נשלח לכם התראה לטלפון.</div>
        <div class="cv-actions">
          <button type="button" class="cv-btn" data-cv="pushYes">כן, להפעיל התראות</button>
          <button type="button" class="cv-chip" data-cv="pushNo">לא עכשיו</button>
        </div>
      </div>
      <div class="cv-composer" data-cv="reply">
        <textarea class="cv-ta" data-cv="replyText" maxlength="${MAX}" placeholder="להוסיף משהו לשיחה..."></textarea>
        <div class="cv-err" data-cv="replyErr" data-cv-hidden></div>
        <div class="cv-actions"><button type="button" class="cv-btn" data-cv="replySend">שליחה</button></div>
      </div>
      <div class="cv-closed-note" data-cv="closedNote" data-cv-hidden>השיחה הזאת נסגרה. יש שאלה חדשה?
        <button type="button" class="cv-chip" data-cv="closedNew">פתחו שיחה חדשה</button></div>
    </div>`;
  const $ = (k) => root.querySelector('[data-cv="' + k + '"]');
  const show = (k, on) => { const el = $(k); if (on) el.removeAttribute('data-cv-hidden'); else el.setAttribute('data-cv-hidden', ''); };

  function errText(e) {
    // ⚠️ כל סיבה בנוסח משלה; ותמיד עם דרך חלופית — הודעה שלא נשלחה היא אדם שמחכה לשווא.
    return e && e.message === 'conv-timeout'
      ? 'החיבור איטי והשליחה לא הושלמה. נסו שוב, או כתבו לנו במייל ' + CONTACT_MAIL
      : 'ההודעה לא נשלחה – נסו שוב, או כתבו לנו במייל ' + CONTACT_MAIL;
  }

  // ── רשימה ──
  function rowHtml(c) {
    const unread = isUnread(c);
    const tag = c.status === 'closed'
      ? `<span class="cv-tag closed">סגורה · ${fmtDate(c.closedAt || c.lastAt)}</span>`
      : unread ? '<span class="cv-tag new">תשובה חדשה</span>'
      : c.lastFrom === 'member' ? '<span class="cv-tag wait">ממתינה לתשובה</span>'
      : '<span class="cv-tag open">פתוחה</span>';
    return `<button type="button" class="cv-row ${c.status}${unread ? ' unread' : ''}" data-id="${esc(c.id)}">
        <b>${esc(c.subject)}</b>
        <div class="cv-row-meta">${tag}<span>${ago(c.lastAt)}</span></div>
      </button>`;
  }
  function renderList() {
    if (embedded) {   // §523 — הרשימה המאוחדת מציגה את השיחות; כאן רק הכתיבה, כשכותבים
      $('openList').innerHTML = ''; $('closedList').innerHTML = ''; show('closedHead', false);
      return;
    }
    if (state.loadErr) {
      $('openList').innerHTML = `<div class="cv-empty">לא הצלחנו לטעון את השיחות. בדקו את החיבור ונסו לרענן.<br/>אפשר תמיד לכתוב לנו במייל ${CONTACT_MAIL}</div>`;
      $('closedList').innerHTML = ''; show('closedHead', false);
      return;
    }
    if (!state.loaded) { $('openList').innerHTML = '<div class="cv-empty">טוען…</div>'; return; }
    const open = state.convs.filter((c) => c.status !== 'closed').sort((a, b) => ms(b.lastAt) - ms(a.lastAt));
    const closed = state.convs.filter((c) => c.status === 'closed').sort((a, b) => ms(b.closedAt || b.lastAt) - ms(a.closedAt || a.lastAt));
    $('openList').innerHTML = open.length ? open.map(rowHtml).join('')
      : (state.composing ? '' : '<div class="cv-empty">אין שיחות פתוחות. יש שאלה? לחצו "שיחה חדשה".</div>');
    show('closedHead', closed.length > 0);
    $('closedList').innerHTML = closed.map(rowHtml).join('');
  }

  // ── שיחה פתוחה ──
  function renderView() {
    const c = state.convs.find((x) => x.id === state.openId);
    show('list', !c && (!embedded || state.composing)); show('view', !!c);
    if (!c) return;
    $('subject').textContent = c.subject;
    const st = $('status');
    st.textContent = c.status === 'closed' ? 'סגורה · ' + fmtDate(c.closedAt || c.lastAt) : 'פתוחה';
    st.className = 'cv-status ' + (c.status === 'closed' ? 'closed' : 'open');
    $('thread').innerHTML = state.msgsErr
      ? '<div class="cv-empty">לא הצלחנו לטעון את ההודעות. נסו לרענן.</div>'
      : state.msgs.map((m) => `
        <div class="cv-bw ${m.from === 'admin' ? 'admin' : 'member'}">
          <div class="cv-bubble">${esc(m.text)}</div>
          <div class="cv-meta">${m.from === 'admin' ? 'צוות Yellow Zone' : 'את/ה'} · ${fmtDate(m.createdAt)} ${fmtTime(m.createdAt)}</div>
        </div>`).join('');
    show('reply', !readOnly && c.status !== 'closed');
    show('closedNote', !readOnly && c.status === 'closed');
    show('push', !readOnly && state.pushOffer && c.status !== 'closed');
  }
  function render() {
    renderList(); renderView();
    if (onUnread) onUnread(state.convs.filter(isUnread).length);
  }

  function markRead(c) {
    if (readOnly || !c || !isUnread(c)) return;
    updateDoc(doc(db, 'conversations', c.id), { memberReadAt: serverTimestamp() })
      .catch((e) => console.warn('conv mark-read failed:', e && (e.code || e.message)));
  }

  function openConv(id) {
    state.openId = id; state.msgs = []; state.msgsErr = false;
    if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
    unsubMsgs = onSnapshot(
      query(collection(db, 'conversations', id, 'messages'), orderBy('createdAt', 'asc')),
      (snap) => {
        state.msgs = snap.docs.map((d) => ({ id: d.id, ...d.data(TS_ESTIMATE) }));
        renderView();
        // תשובה שמגיעה בזמן שהשיחה פתוחה מול העיניים — כבר נקראה.
        markRead(state.convs.find((x) => x.id === state.openId));
      },
      (e) => { console.error('conv messages load failed:', e && (e.code || e.message)); state.msgsErr = true; renderView(); }
    );
    render();
    root.scrollIntoView({ block: 'start' });
  }
  function closeView() {
    if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
    state.openId = null; state.pushOffer = false;
    render();
  }
  function back() { closeView(); if (embedded && onBack) onBack(); }

  // §523 — meta: { source, bizId } לשיחה הזאת (בעל עסק בוחר "על העסק" / "משהו אחר" ב"הודעות" המאוחד)
  function startNew(meta) {
    closeView();
    state.newMeta = meta || null;
    state.composing = true;
    // §524ב — 🐛 ב-embedded closeView() הסתיר את כל אזור הרשימה (composing עוד היה false), והכתיבה
    // נפתחה בתוך אזור מוסתר – "כתבו לנו" נראה תקוע. מציגים אותו מחדש אחרי שהדגל הודלק.
    show('list', true);
    show('new', true);
    renderList();
    const ta = $('newText');
    ta.focus();
    root.scrollIntoView({ block: 'start' });
  }
  function cancelNew() {
    state.composing = false;
    show('new', false); show('newErr', false);
    renderList();
    if (embedded && onBack) { show('list', false); onBack(); }
  }

  async function sendNew() {
    const ta = $('newText');
    const text = ta.value.trim();
    if (!text) { $('newErr').textContent = 'כתבו לנו משהו קודם 🙂'; show('newErr', true); ta.focus(); return; }
    const btn = $('newSend');
    btn.disabled = true; btn.textContent = 'שולח…'; show('newErr', false);
    try {
      const ref = doc(collection(db, 'conversations'));
      const b = writeBatch(db);
      const nm = state.newMeta || {};
      const src = nm.source || source, bid = nm.bizId !== undefined ? nm.bizId : bizId;
      b.set(ref, {
        memberId, status: 'open', subject: subjectFrom(text), source: src,
        ...(bid ? { bizId: bid } : {}),
        createdAt: serverTimestamp(), lastAt: serverTimestamp(), lastFrom: 'member', memberReadAt: serverTimestamp(),
      });
      b.set(doc(collection(db, 'conversations', ref.id, 'messages')), { from: 'member', text: text.slice(0, MAX), createdAt: serverTimestamp() });
      await withTimeout(b.commit(), SEND_TIMEOUT_MS);
      ta.value = ''; $('newCount').textContent = '0/' + MAX;
      state.composing = false; show('new', false);
      state.pushOffer = await shouldOfferPush();
      openConv(ref.id);
    } catch (e) {
      // ⚠️ הטקסט נשאר — הודעה שנמחקה כי הרשת נפלה היא הודעה שלא תיכתב שוב.
      console.error('conv create failed:', e && (e.code || e.message));
      $('newErr').textContent = errText(e); show('newErr', true);
    } finally {
      btn.disabled = false; btn.textContent = 'שליחה';
    }
  }

  async function sendReply() {
    const c = state.convs.find((x) => x.id === state.openId);
    const ta = $('replyText');
    const text = ta.value.trim();
    if (!c || c.status === 'closed') return;
    if (!text) { $('replyErr').textContent = 'כתבו משהו קודם'; show('replyErr', true); ta.focus(); return; }
    const btn = $('replySend');
    btn.disabled = true; btn.textContent = 'שולח…'; show('replyErr', false);
    try {
      const b = writeBatch(db);
      b.set(doc(collection(db, 'conversations', c.id, 'messages')), { from: 'member', text: text.slice(0, MAX), createdAt: serverTimestamp() });
      b.update(doc(db, 'conversations', c.id), { lastAt: serverTimestamp(), lastFrom: 'member', memberReadAt: serverTimestamp() });
      await withTimeout(b.commit(), SEND_TIMEOUT_MS);
      ta.value = '';
    } catch (e) {
      console.error('conv reply failed:', e && (e.code || e.message));
      $('replyErr').textContent = errText(e); show('replyErr', true);
    } finally {
      btn.disabled = false; btn.textContent = 'שליחה';
    }
  }

  // ── "רוצים התראה כשנענה?" — הרגע שבו לבקשה יש ערך (ר' project_push_notifications_hidden) ──
  // רק באפליקציה, רק כשיש גשר פוש (iOS עדיין בלי — §457), ורק כשעוד לא נשאל.
  // ⚠️ "denied" לא נשאל שוב: הבקשה לא תוצג, והכפתור היה נראה מת.
  async function shouldOfferPush() {
    try {
      const np = window.YZNativePush;
      if (!savePushToken || !np || !np.available()) return false;
      const st = await np.permissionState();
      return st === 'prompt' || st === 'prompt-with-rationale';
    } catch (e) { return false; }
  }
  async function acceptPush() {
    const btn = $('pushYes');
    btn.disabled = true; btn.textContent = 'רגע…';
    let msg = '';
    try {
      const res = await window.YZNativePush.register();
      if (res.ok) { await savePushToken(res); msg = '✓ התראות הופעלו. נודיע לכם כשנענה.'; }
      else msg = res.reason === 'denied' || res.reason === 'declined'
        ? 'בסדר, בלי התראות. התשובה תחכה לכם כאן ובמייל.'
        : 'לא הצלחנו להפעיל התראות. התשובה תחכה לכם כאן ובמייל.';
    } catch (e) {
      console.error('push from conv failed:', e);
      msg = 'לא הצלחנו להפעיל התראות. התשובה תחכה לכם כאן ובמייל.';
    }
    $('push').innerHTML = '<div>' + esc(msg) + '</div>';
  }

  // ── אירועים ──
  root.addEventListener('click', (e) => {
    const row = e.target.closest('.cv-row');
    if (row) { openConv(row.getAttribute('data-id')); return; }
    const k = e.target.closest('[data-cv]') && e.target.closest('[data-cv]').getAttribute('data-cv');
    if (readOnly && k !== 'back') return;
    if (k === 'newBtn' || k === 'closedNew') startNew();
    else if (k === 'newCancel') cancelNew();
    else if (k === 'newSend') sendNew();
    else if (k === 'replySend') sendReply();
    else if (k === 'back') back();
    else if (k === 'pushYes') acceptPush();
    else if (k === 'pushNo') { state.pushOffer = false; renderView(); }
  });
  if (readOnly) show('newBtn', false);
  $('newText').addEventListener('input', () => {
    $('newCount').textContent = $('newText').value.length + '/' + MAX; show('newErr', false);
  });

  // ── טעינה חיה ── where(memberId) בלבד ובלי orderBy: אחרת נדרש אינדקס מורכב. המיון כאן.
  onSnapshot(query(collection(db, 'conversations'), where('memberId', '==', memberId)),
    (snap) => {
      state.loaded = true; state.loadErr = false;
      state.convs = snap.docs.map((d) => ({ id: d.id, ...d.data(TS_ESTIMATE) }));
      render();
      if (state.openId) markRead(state.convs.find((x) => x.id === state.openId));
    },
    (e) => { console.error('conversations load failed:', e && (e.code || e.message)); state.loadErr = true; render(); });

  render();
  return { startNew, openConv, closeView };
}
