// ══ §508 — "האזור שלי" שלב 3ד: "השבוע אצלך" — 4 הנתונים לבעל העסק (§473יא/טז) ═══════════════════
// הנתונים מהוורקר (/biz-weekly-stats): לכל שבוע (ראשון–שבת) — חשיפות, פתיחות, לחיצות לחיוג/וואטסאפ,
// לבבות חדשים. דפדוף "שבוע קודם / שבוע הבא" בלי בקשה נוספת, וחץ מול השבוע שלפני הנבחר (§473טז).
// הנוסח — מהדמו (§473יא/טז). מנהלים ובעל העסק בכרטיס של עצמו לא נספרים (0+ב) — כתוב בהערה בתחתית.
// סקריפט קלאסי (כמו biz-guides.js). load() — מה שהדשבורד מעביר: מחזיר Promise של תשובת הוורקר.
(function () {
  'use strict';
  var ROWS = [['imp', 'פעמים אוהדים ראו את העסק שלך'], ['open', 'פתחו את הכרטיס שלך'],
    ['contact', 'לחצו להתקשר או לשלוח וואטסאפ'], ['hearts', 'אוהדים חדשים סימנו לב לעסק שלך']];

  function injectStyle() {
    if (document.getElementById('bsStyle')) return;
    var s = document.createElement('style');
    s.id = 'bsStyle';
    s.textContent =
      '.bs-sum{display:block;font-size:12.5px;font-weight:700;color:var(--text-sm,#6B7A9B);margin-top:2px}' +
      '.bs-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 6px}' +
      '.bs-nav button{border:1px solid var(--border-md,#E4E4DC);background:#fff;border-radius:20px;padding:6px 11px;font:inherit;font-size:12.5px;font-weight:700;color:var(--text,#0A2A66);cursor:pointer}' +
      '.bs-nav button:disabled{opacity:.35;cursor:default}' +
      '.bs-wt{text-align:center;font-weight:900;font-size:15px;line-height:1.3}.bs-wt small{display:block;font-size:12px;font-weight:600;color:var(--text-sm,#6B7A9B)}' +
      '.bs-row{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border,#E7E7E0);flex-wrap:wrap}' +
      '.bs-row:last-of-type{border-bottom:none}' +
      '.bs-n{font-size:22px;font-weight:900;min-width:44px}' +
      '.bs-l{font-size:14px;font-weight:600;flex:1;min-width:140px;line-height:1.4}' +
      '.bs-d{font-size:12px;font-weight:900;border-radius:20px;padding:3px 9px;white-space:nowrap}' +
      '.bs-d.up{background:#E6F4EA;color:#1e6b34}.bs-d.down{background:#FFF1E0;color:#d97706}.bs-d.same{background:#F2F2EC;color:#6B7A9B}' +
      '.bs-note{font-size:12.5px;color:var(--text-sm,#6B7A9B);line-height:1.6;margin-top:8px}';
    document.head.appendChild(s);
  }
  var dm = function (d) { return d.getUTCDate() + '.' + (d.getUTCMonth() + 1); };

  function render(host, opts) {
    if (!host) return;
    injectStyle();
    var state = { weeks: null, err: false, off: 0 };
    host.innerHTML = '<details class="bg-card" id="bsBox"><summary><span>📊 השבוע אצלך<small class="bs-sum" id="bsSum">טוען…</small></span></summary>' +
      '<div class="bg-body" id="bsBody"></div></details>';
    var sum = host.querySelector('#bsSum'), body = host.querySelector('#bsBody');

    function draw() {
      if (state.err) { sum.textContent = 'לא הצלחנו לטעון את הנתונים'; body.innerHTML = '<div class="bs-note">נסו לרענן את הדף.</div>'; return; }
      var W = state.weeks;
      if (!W || !W.length) { sum.textContent = 'עדיין אין נתונים'; body.innerHTML = '<div class="bs-note">הנתונים יופיעו כאן כשאוהדים יתחילו לראות את העסק שלך.</div>'; return; }
      var cur = W[state.off], prev = W[state.off + 1];
      // שורת הסיכום — גלויה גם כשהקופסה סגורה, תמיד על השבוע הנוכחי
      sum.textContent = 'השבוע: ' + W[0].imp + ' חשיפות · ' + W[0].open + ' פתיחות · ' + W[0].contact + ' פניות · ' + W[0].hearts + ' לבבות';
      var s = new Date(cur.start + 'T12:00:00Z'), e = new Date(s); e.setUTCDate(s.getUTCDate() + 6);
      var title = state.off === 0 ? 'השבוע' : state.off === 1 ? 'שבוע שעבר' : 'לפני ' + state.off + ' שבועות';
      var delta = function (a, b) {
        if (b == null) return '';
        return a > b ? '<span class="bs-d up">▲ ' + (a - b) + '</span>' : a < b ? '<span class="bs-d down">▼ ' + (b - a) + '</span>' : '<span class="bs-d same">ללא שינוי</span>';
      };
      body.innerHTML =
        '<div class="bs-nav"><button type="button" data-bs="-1"' + (state.off >= W.length - 1 ? ' disabled' : '') + '>› שבוע קודם</button>' +
        '<div class="bs-wt">' + title + '<small>' + dm(s) + '–' + dm(e) + '.' + e.getUTCFullYear() + '</small></div>' +
        '<button type="button" data-bs="1"' + (state.off === 0 ? ' disabled' : '') + '>שבוע הבא ‹</button></div>' +
        ROWS.map(function (r) {
          return '<div class="bs-row"><span class="bs-n">' + cur[r[0]] + '</span><span class="bs-l">' + r[1] + '</span>' + delta(cur[r[0]], prev && prev[r[0]]) + '</div>';
        }).join('') +
        '<div class="bs-note">' + (prev ? 'החצים משווים לשבוע שלפניו. ' : 'אין נתונים לשבוע שלפניו להשוואה. ') +
        'כניסות שלך לכרטיס של עצמך, ושל צוות Yellow Zone, לא נספרות. "פניות" = לחיצה על חיוג או וואטסאפ בכרטיס.</div>';
    }
    body.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-bs]');
      if (!b || b.disabled) return;
      state.off = Math.max(0, state.off - Number(b.getAttribute('data-bs')));
      draw();
    });
    Promise.resolve().then(opts.load).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'failed');
      state.weeks = r.weeks || []; draw();
    }).catch(function (e) { console.error('weekly stats failed:', e); state.err = true; draw(); });
  }

  window.YZBizStats = { render: render };
})();
