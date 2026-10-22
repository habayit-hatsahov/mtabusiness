/* weekly-render.js – §539 דמו: הקרוסלה בדף הבית (הטבה בלעדית · האוהד שמאחורי העסק · מי אנחנו ·
   איך מממשים · לבעלי עסקים · הזמינו חברים).
   מקור אחד לעיצוב ולתוכן: דמו דף הבית (weekly-demo.html) מרנדר מכאן, ודמו הניהול
   (weekly-admin-demo.html) מרנדר מכאן את התצוגה המקדימה – כדי שמה שעורכים שם ייראה בול כמו כאן.
   בדמו התוכן נשמר במכשיר בלבד (localStorage, wkDemoData); בבנייה – אוסף ציבורי נפרד (דפוס bizPublic). */
(function () {
  'use strict';
  var KEY = 'wkDemoData';
  var STORAGE = 'https://firebasestorage.googleapis.com/v0/b/habayit-hatsahov.firebasestorage.app/o/';
  var IMG = {
    patrix: STORAGE + 'businesses%2FPSp6yTsBMgJv2u6H6u7f%2FcoverPhoto_1788329641575?alt=media&token=c4e8f62c-8bfc-4130-9f8e-e3384478950c',
    chompy: STORAGE + 'businesses%2Fa1QIIkYOZBGdWKpLTkKe%2Flogo_1787466418285_thumb?alt=media&token=869d67b7-fe6d-44c8-b299-8faf901f796f',
    casual: STORAGE + 'businesses%2F20rLIqD5Pym3Tt3h3kXZ%2FlogoThumb_1791410240041.webp?alt=media&token=9cfff386-e684-496e-a476-f569c3166177'
  };
  // עסקים שמוכרים לדמו (שם → מזהה/תמונה), כדי שבחירה בשם בדמו הניהול תפתח את הכרטיס האמיתי
  var KNOWN = {
    'פטריקס פארק רחובות': { id: 'PSp6yTsBMgJv2u6H6u7f', cover: IMG.patrix },
    "צ'ומפי": { id: 'a1QIIkYOZBGdWKpLTkKe', logo: IMG.chompy, area: 'ירושלים · רחובות' },
    'Casual tattoo': { id: '20rLIqD5Pym3Tt3h3kXZ', logo: IMG.casual, area: 'רחובות' }
  };

  // ── שלושה כיווני נוסח ל"מי אנחנו" (§539 סבב 6) ──────────────────────────────────────────
  var US_DIRS = {
    a: { slideLine: 'הבית של האוהדים, גם מחוץ למגרש', heroTag: 'אוהדים ועסקים, קהילה צהובה אחת', sections: [
      { h: 'מה זה', p: 'Yellow Zone היא הבית של אוהדי מכבי גם מחוץ למגרש. כאן מוצאים עסקים של אוהדים – מקעקעים, מסעדות, עורכי דין, די-ג\'יים ועוד – וכל אחד מהם נותן הטבה לחברי הקהילה.' },
      { h: 'למה זה חשוב', p: 'כשאתם קונים אצל אוהד, הכסף נשאר בבית. אתם מקבלים הטבה, והוא מקבל לקוח שמדבר את השפה שלו.' },
      { h: 'מה עוד יש כאן', p: 'פעמיים בחודש – ב-1 וב-16 – הטבה בלעדית חדשה לזמן מוגבל, והיכרות עם אוהד שמאחורי עסק: 2 עסקים בכל חודש.' },
      { h: 'יש לכם עסק?', p: 'אתם אוהדים ויש לכם עסק? הצטרפו, תנו הטבה לקהילה – ותכירו לקוחות שכבר אוהבים אתכם.' }
    ] },
    b: { slideLine: 'מה שמחבר ביציע – ממשיך גם אחרי השריקה', heroTag: 'מה שמחבר אותנו ביציע – ממשיך גם אחרי השריקה', quote: 'ביציע אנחנו עומדים כתף אל כתף. למה שזה ייגמר בשריקת הסיום?', sections: [
      { h: 'הרעיון', p: 'בין האוהדים יש בעלי מסעדות, מקעקעים, עורכי דין, מאמנים ודי-ג\'יים. Yellow Zone מחברת ביניהם לבין שאר האוהדים – כדי שכשמישהו מאיתנו צריך שירות, הוא יגיע קודם לאחד משלנו.' },
      { h: 'מה אתם מרוויחים', p: 'הטבה אמיתית אצל כל עסק, ועסק שמבין מה זה מכבי. ופעמיים בחודש – הטבה בלעדית חדשה והסיפור של אוהד אחד שמאחורי העסק שלו.' },
      { h: 'יש לכם עסק?', p: 'גם אתם אוהדים עם עסק? זה המקום שלכם. רושמים את העסק, בוחרים הטבה, והקהילה מגיעה.' }
    ] },
    c: { slideLine: 'הטבות אצל עסקים של אוהדי מכבי', heroTag: 'הטבות אצל עסקים של אוהדי מכבי', sections: [
      { h: 'מה זה', p: 'אפליקציה של הטבות אצל עסקים של אוהדי מכבי. כל עסק עובר אישור של הצוות לפני שהוא מופיע כאן.' },
      { h: 'פעמיים בחודש', p: 'ב-1 וב-16 בכל חודש: הטבה בלעדית חדשה לזמן מוגבל, ועסק חדש בפינת "האוהד שמאחורי העסק" – 2 עסקים בחודש.' },
      { h: 'יש לכם עסק?', p: 'רישום העסק לוקח כמה דקות. אחרי אישור הצוות הוא מופיע כאן עם ההטבה שלכם.' }
    ] }
  };

  function DEFAULTS() {
    return {
      ben: {
        badge: 'מבצע השקה',
        slideTitle: 'קעקוע של מכבי במחיר מוזל',
        title: 'קעקוע של מכבי',
        intro: 'קעקוע של מכבי במחיר מיוחד לחברי Yellow Zone – לזמן מוגבל.',
        prices: [{ size: '6 ס"מ', price: '400 ₪', was: '' }, { size: '12 ס"מ', price: '800 ₪', was: '' }],
        after: 'רוצים להוסיף כיתוב, דמות או סקיצה? 20% הנחה על התוספת.',
        whereTitle: 'איפה מממשים', bizNoun: 'מקעקעים',
        howTo: 'בוחרים את הקרוב אליכם, נכנסים לכרטיס שלו ומתאמים מולו.',
        biz: [
          { name: "צ'ומפי", area: 'ירושלים · רחובות' },
          { name: 'Casual tattoo', area: 'רחובות' },
          { name: '', area: '' }, { name: '', area: '' }, { name: '', area: '' }
        ]
      },
      fan: {
        biz: 'פטריקס פארק רחובות', owner: 'דורון', fanTag: 'מנוי מכבי ת"א בכדורגל', showFan: true,
        cadence: '2 עסקים בחודש',
        title: 'מהיציע אל הבר',
        slideLine: 'מהיציע אל הבר – פאב-מסעדה עם ליין אחר בכל ערב',
        text: 'דורון, מנוי של מכבי בכדורגל, מחזיק ברחובות פאב-מסעדה עם ליין אחר בכל ערב.',
        chips: 'פאב · מסעדה, רחובות, א–ה מ-18:00 · ש מ-20:30',
        hasStory: true, quote: '', stand: '', how: '', why: '',
        cadenceNote: 'כל חודש אנחנו מכירים 2 אוהדים שיש להם עסק – אחד ב-1 ואחד ב-16. הבא מתחלף ב-{next}.'
      },
      usDir: 'a',
      pages: {
        us: pageFromDir('a'),
        redeem: {
          theme: 'soft', badge: 'למשתמשים', slideTitle: 'איך מממשים הטבה?', slideLine: 'שלושה צעדים פשוטים, בכל עסק',
          heroWho: 'מדריך קצר', heroTitle: 'איך מממשים הטבה', heroTag: 'בחנות, מול נותן שירות או באתר', steps: true,
          sections: [
            { h: 'נכנסים לכרטיס העסק', p: 'בוחרים עסק – לפי קטגוריה, חיפוש או מה שקרוב אליכם – ורואים את ההטבה שלו.' },
            { h: 'בחנות או מול נותן שירות', p: 'בכרטיס העסק, ב"מימוש ההטבה", נפתחת תעודת החבר שלכם עם שם העסק ושעון חי. מציגים אותה בקופה או לנותן השירות – ולפעמים יבקשו גם תעודה מזהה.' },
            { h: 'באתר או אונליין', p: 'בעסקים עם קוד קופון – מעתיקים את הקוד מהכרטיס ומזינים בהזמנה. הקוד מוצג רק לחברים.' },
            { h: 'משהו לא עבד?', p: 'כתבו לנו ב"האזור שלי" ← "הודעות", ונטפל.' }
          ],
          cta: { label: '', act: '' }
        },
        forbiz: {
          theme: 'navy', badge: 'לבעלי עסקים', slideTitle: 'יש לכם עסק?', slideLine: 'הצטרפו לעסקים של האוהדים',
          heroWho: 'לבעלי עסקים', heroTitle: 'העסק שלכם ב-Yellow Zone', heroTag: 'אוהדים קונים מאוהדים',
          sections: [
            { h: 'למה להצטרף', p: 'הקהילה של אוהדי מכבי מחפשת עסקים של אוהדים. העסק שלכם מופיע באפליקציה עם תמונות, פרטים והטבה לחברים.' },
            { h: 'איך מצטרפים', p: 'ממלאים טופס קצר עם פרטי העסק וההטבה. הצוות עובר ומאשר, ואז העסק עולה לאוויר.' },
            { h: 'להופיע בראש דף הבית', p: 'פעמיים בחודש אנחנו מציגים בראש דף הבית הטבה בלעדית ועסק של אוהד עם הסיפור שלו. רוצים להשתתף? מסמנים עניין בטופס או ב"האזור שלי".' }
          ],
          cta: { label: 'לרישום העסק', act: 'bizSignup' }
        },
        invite: {
          theme: 'yellow', badge: 'שתפו', slideTitle: 'הזמינו חברים', slideLine: 'אוהדים ובעלי עסקים – כמה שיותר, יותר טוב',
          heroWho: 'הזמינו ושתפו', heroTitle: 'מביאים עוד אוהדים', heroTag: 'כל מי שמצטרף מחזק את כולנו',
          sections: [
            { h: 'חבר אוהד', p: 'כל אוהד שמצטרף מחזק את העסקים של כולנו – ומקבל הטבות אצלם.' },
            { h: 'מכירים אוהד עם עסק?', p: 'שלחו לו – כל עסק חדש זה עוד הטבה לקהילה.' }
          ],
          cta: { label: 'שיתוף לחבר אוהד', act: 'shareFan' },
          cta2: { label: 'שיתוף לבעל עסק', act: 'shareBiz' },
          fanText: 'אוהדי מכבי קונים כחול־צהוב 💛\nכל העסקים של אוהדי מכבי תל אביב במקום אחד – עם הטבות בלעדיות לחברים. מורידים ונרשמים:',
          bizText: 'יש לך עסק ואתה אוהד מכבי? 💛\nב-Yellow Zone העסקים של האוהדים מגיעים לאוהדים, עם הטבה לחברי הקהילה. נרשמים בכמה דקות:'
        }
      },
      future: {}
    };
  }
  function pageFromDir(d) {
    var v = US_DIRS[d];
    return { theme: 'navy', badge: '', logo: true, slideTitle: 'מי אנחנו? ', slideAccent: 'Yellow Zone', slideLine: v.slideLine,
      heroWho: 'מי אנחנו', heroTitle: 'Yellow Zone', heroTag: v.heroTag, quote: v.quote || '',
      sections: v.sections.map(function (s) { return { h: s.h, p: s.p }; }),
      cta: { label: 'לרישום העסק', act: 'bizSignup' } };
  }

  // ── שמירה (דמו: במכשיר בלבד) ──────────────────────────────────────────────────────────
  function load() {
    var d = DEFAULTS();
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        ['ben', 'fan'].forEach(function (k) { if (s[k]) d[k] = Object.assign(d[k], s[k]); });
        if (s.pages) Object.keys(d.pages).forEach(function (k) { if (s.pages[k]) d.pages[k] = Object.assign(d.pages[k], s.pages[k]); });
        if (s.future) d.future = s.future;
        if (s.usDir) d.usDir = s.usDir;
      }
    } catch (e) {}
    return d;
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // ── תקופה = חצי חודש: 1–15 / 16–סוף החודש ──────────────────────────────────────────────
  function period(dt) {
    var y = dt.getFullYear(), m = dt.getMonth(), first = dt.getDate() <= 15;
    var start = new Date(y, m, first ? 1 : 16), next = first ? new Date(y, m, 16) : new Date(y, m + 1, 1);
    return { start: start, next: next, last: new Date(next - 1) };
  }
  function dm(x) { return x.getDate() + '.' + (x.getMonth() + 1); }
  function timing(now) {
    var p = period(now), left = Math.ceil((p.next - now) / 86400000);
    return { p: p, left: left, pct: Math.min(100, Math.max(0, (now - p.start) / (p.next - p.start) * 100)), end: dm(p.last), next: dm(p.next) };
  }

  // ── עזרי רינדור ────────────────────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fill(s, ph) { return s ? esc(s) : '<span class="wk-fill">' + esc(ph) + '</span>'; }
  var GO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="m14 6-6 6 6 6"/></svg>';
  var X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  function act(ctx, js) { return ctx.preview ? '' : ' onclick="' + js + '"'; }
  function bizInfo(b) { var k = KNOWN[b.name] || {}; return { id: k.id || '', logo: k.logo || '', area: b.area || k.area || '' }; }
  function leftHtml(t) { return t.left === 1 ? '<b>היום אחרון!</b>' : 'נשארו <b>' + t.left + '</b> ימים'; }
  var ORDER = ['ben', 'fan', 'us', 'redeem', 'forbiz', 'invite'];

  function slideHtml(kind, d, ctx) {
    var t = ctx.t, o = act(ctx, "WK.open('" + kind + "')");
    if (kind === 'ben') {
      var b = d.ben, filled = b.biz.filter(function (x) { return x.name; });
      var logos = b.biz.slice(0, 6).map(function (x, i) {
        var inf = bizInfo(x);
        return inf.logo ? '<img src="' + esc(inf.logo) + '" alt="">' : '<span>' + esc(x.name ? x.name.charAt(0) : (i + 1)) + '</span>';
      }).join('');
      return '<div class="wk-slide wk-s-ben' + (t.left <= 3 ? ' urgent' : '') + '"' + o + '>' +
        '<div><span class="wk-badge">' + esc(b.badge) + '</span><div class="t">' + esc(b.slideTitle) + '</div>' +
        '<div class="wk-logos">' + logos + '<em>' + b.biz.length + ' ' + esc(b.bizNoun || 'עסקים') + '</em></div></div>' +
        '<div class="timer"><span class="left">' + leftHtml(t) + '</span><span class="bar"><i style="width:' + t.pct.toFixed(1) + '%"></i></span></div>' +
        '<span class="wk-go">' + GO + '</span></div>';
    }
    if (kind === 'fan') {
      var f = d.fan, cover = (KNOWN[f.biz] || {}).cover || '';
      return '<div class="wk-slide wk-s-fan"' + o + (cover ? ' style="background-image:url(\'' + esc(cover) + '\')"' : '') + '>' +
        '<div class="wk-fan-top"><span class="wk-badge">האוהד שמאחורי העסק</span>' + (f.cadence ? '<span class="wk-cad">' + esc(f.cadence) + '</span>' : '') + '</div>' +
        (f.owner ? '<div class="who">' + esc(f.owner) + (f.showFan && f.fanTag ? ' · ' + esc(f.fanTag) : '') + '</div>' : '') +
        '<div class="t">' + esc(f.biz || 'בחרו עסק') + '</div>' +
        (f.slideLine ? '<div class="s">' + esc(f.slideLine) + '</div>' : '') +
        '<span class="wk-go">' + GO + '</span></div>';
    }
    var p = d.pages[kind];
    return '<div class="wk-slide wk-s-page wk-th-' + esc(p.theme || 'navy') + '"' + o + '>' +
      (p.logo ? '<img class="logo" src="images/yellowzone-mark-square.png" alt="">' : (p.badge ? '<span class="wk-badge">' + esc(p.badge) + '</span>' : '<span></span>')) +
      '<div><div class="t">' + esc(p.slideTitle) + (p.slideAccent ? '<span>' + esc(p.slideAccent) + '</span>' : '') + '</div>' +
      (p.slideLine ? '<div class="s">' + esc(p.slideLine) + '</div>' : '') + '</div>' +
      '<span class="wk-go">' + GO + '</span></div>';
  }

  function closeBtn(kind, ctx) { return ctx.preview ? '' : '<button type="button" class="wk-close" onclick="WK.close(\'' + kind + '\')" aria-label="סגירה">' + X + '</button>'; }

  function sheetInner(kind, d, ctx) {
    var t = ctx.t;
    if (kind === 'ben') {
      var b = d.ben;
      var maxN = 0; b.prices.forEach(function (p) { var n = parseFloat(p.size) || 0; if (n > maxN) maxN = n; });
      var prices = b.prices.map(function (p) {
        var n = parseFloat(p.size) || 0, dia = maxN ? Math.round(22 + 34 * n / maxN) : 40;
        return '<div class="wk-pc"><div class="ring"><i style="width:' + dia + 'px;height:' + dia + 'px"></i></div><b>' + esc(p.size) + '</b>' +
          (p.was ? '<s>' + esc(p.was) + '</s>' : '') + '<span>' + esc(p.price) + '</span></div>';
      }).join('');
      var rows = b.biz.map(function (x, i) {
        var inf = bizInfo(x);
        if (!x.name) return '<div class="wk-row wk-row-tbd"><div class="wk-logo"></div><div class="wk-row-main"><div class="wk-row-name">מקום שמור ' + (i + 1) + '</div><div class="wk-row-sub">ייקבע בקרוב</div></div></div>';
        return '<div class="wk-row"' + (inf.id ? act(ctx, "WK.biz('" + inf.id + "')") : '') + '>' +
          (inf.logo ? '<img class="wk-logo" src="' + esc(inf.logo) + '" alt="">' : '<div class="wk-logo wk-logo-l">' + esc(x.name.charAt(0)) + '</div>') +
          '<div class="wk-row-main"><div class="wk-row-name">' + esc(x.name) + '</div>' + (inf.area ? '<div class="wk-row-sub">' + esc(inf.area) + '</div>' : '') + '</div>' + GO + '</div>';
      }).join('');
      return '<div class="wk-hero ben">' + closeBtn(kind, ctx) + '<span class="wk-badge">' + esc(b.badge) + ' · הטבה בלעדית לזמן מוגבל</span><div class="t">' + esc(b.title) + '</div></div>' +
        '<div class="wk-in">' +
        '<div class="wk-timer"><div class="row"><span>' + leftHtml(t) + '</span><span>עד ' + t.end + '</span></div><div class="bar"><i style="width:' + t.pct.toFixed(1) + '%"></i></div></div>' +
        (b.intro ? '<p class="wk-p">' + esc(b.intro) + '</p>' : '') +
        '<div class="wk-price">' + prices + '</div>' +
        (b.after ? '<p class="wk-p">' + esc(b.after) + '</p>' : '') +
        '<div class="wk-sec"><h3>' + esc(b.whereTitle) + ' · ' + b.biz.length + ' ' + esc(b.bizNoun || 'עסקים') + '</h3><div class="wk-rows">' + rows + '</div>' +
        (b.howTo ? '<div class="wk-small" style="margin-top:8px">' + esc(b.howTo) + '</div>' : '') + '</div>' +
        '<div class="wk-small">כל חצי חודש – ב-1 וב-16 – הטבה בלעדית חדשה. הבאה מתחילה ב-' + t.next + '.</div>' +
        '</div>';
    }
    if (kind === 'fan') {
      var f = d.fan, cover = (KNOWN[f.biz] || {}).cover || '', story = f.hasStory;
      var chips = String(f.chips || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var bizId = (KNOWN[f.biz] || {}).id || '';
      return '<div class="wk-hero"' + (cover ? ' style="background-image:url(\'' + esc(cover) + '\')"' : '') + '>' + closeBtn(kind, ctx) +
        '<span class="wk-badge">האוהד שמאחורי העסק</span><div class="who">עד ' + t.end + (f.cadence ? ' · ' + esc(f.cadence) : '') + '</div><div class="t">' + esc(f.biz || 'בחרו עסק') + '</div></div>' +
        '<div class="wk-in">' +
        (f.owner ? '<div class="wk-owner"><div class="wk-avatar">' + esc(f.owner.charAt(0)) + '</div><div><div class="wk-owner-name">' + esc(f.owner) + '</div>' +
          '<div class="wk-owner-role">בעל העסק' + (f.showFan && f.fanTag ? ' <span class="wk-fan">✓ ' + esc(f.fanTag) + '</span>' : '') + '</div></div></div>' : '') +
        '<div class="wk-lead">' + (f.title ? '<b>' + esc(f.title) + '</b>' : '') + fill(f.text, 'טקסט על האוהד ועל העסק') + '</div>' +
        (chips.length ? '<div class="wk-chips">' + chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
        (story ? '<div class="wk-quote">"' + fill(f.quote, 'משפט אחד שלו – מה מכבי בשבילו') + '"</div>' +
          '<div class="wk-sec"><h3>ביציע</h3><p>' + fill(f.stand, 'ממתי במגרש, איפה יושב, עם מי, רגע שלא יישכח – ימולא אחרי השיחה') + '</p></div>' +
          '<div class="wk-sec"><h3>איך הגיע לעסק</h3><p>' + fill(f.how, 'איך נפתח העסק ומה הקשר ליציע – ימולא אחרי השיחה') + '</p></div>' +
          '<div class="wk-sec"><h3>למה Yellow Zone</h3><p>' + fill(f.why, 'במילים שלו: למה חשוב שאוהדים יקנו מאוהדים') + '</p></div>' : '') +
        (f.cadenceNote ? '<div class="wk-small">' + esc(f.cadenceNote.split('{next}').join(t.next)) + '</div>' : '') +
        '</div>' +
        '<div class="wk-bar-btn"><button type="button"' + (bizId ? act(ctx, "WK.biz('" + bizId + "')") : '') + '>לכרטיס העסק וההטבה</button></div>';
    }
    var p = d.pages[kind];
    var secs = p.steps
      ? '<ol class="wk-steps">' + p.sections.map(function (s, i) { return '<li><i>' + (i + 1) + '</i><div><b>' + esc(s.h) + '</b>' + esc(s.p) + '</div></li>'; }).join('') + '</ol>'
      : p.sections.map(function (s) { return '<div class="wk-sec">' + (s.h ? '<h3>' + esc(s.h) + '</h3>' : '') + '<p>' + esc(s.p) + '</p></div>'; }).join('');
    var cta = function (c) { return c && c.label ? '<button type="button" class="wk-cta"' + act(ctx, "WK.act('" + esc(c.act) + "')") + '>' + esc(c.label) + '</button>' : ''; };
    return '<div class="wk-hero page wk-th-' + esc(p.theme || 'navy') + '">' + closeBtn(kind, ctx) +
      (p.heroWho ? '<div class="who">' + esc(p.heroWho) + '</div>' : '') + '<div class="t">' + esc(p.heroTitle) + '</div>' +
      (p.heroTag ? '<div class="tag">' + esc(p.heroTag) + '</div>' : '') + '</div>' +
      '<div class="wk-in">' + (p.quote ? '<div class="wk-quote">' + esc(p.quote) + '</div>' : '') + secs +
      (cta(p.cta) || cta(p.cta2) ? '<div class="wk-ctas">' + cta(p.cta) + cta(p.cta2) + '</div>' : '') + '</div>';
  }

  // ── עיצוב (משותף לשני הדמואים) ─────────────────────────────────────────────────────────
  var CSS = [
    '.wk{padding:16px 0 4px}',
    '.wk-track{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:2px 16px 4px;scroll-padding:0 16px;scrollbar-width:none}',
    '.wk-track::-webkit-scrollbar{display:none}',
    '.wk-slide{position:relative;flex:0 0 86%;height:196px;border-radius:20px;overflow:hidden;scroll-snap-align:start;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;padding:14px 16px;color:#fff;-webkit-tap-highlight-color:transparent;box-shadow:0 1px 2px rgba(10,42,102,.08);box-sizing:border-box;font-family:Rubik,sans-serif}',
    '.wk-slide:active{transform:scale(.985)}',
    '.wk-dots{display:flex;justify-content:center;gap:5px;margin-top:10px}',
    '.wk-dots i{width:6px;height:6px;border-radius:999px;background:#D5D9E2;transition:width .2s,background .2s}',
    '.wk-dots i.on{width:18px;background:#0A2A66}',
    '.wk-badge{display:inline-block;align-self:flex-start;padding:4px 10px;border-radius:999px;background:#FFD400;color:#0A2A66;font-size:11px;font-weight:800;letter-spacing:.02em}',
    '.wk-fill{background:#FFF0B3;color:#6B5200;border-radius:4px;padding:0 4px;font-weight:700}',
    '.wk-go{position:absolute;left:14px;bottom:14px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center}',
    // 1 – הטבה
    '.wk-s-ben{background:#FFD400;color:#0A2A66;justify-content:space-between}',
    '.wk-s-ben .wk-badge{background:#0A2A66;color:#FFD400}',
    '.wk-s-ben .t{font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.12;margin-top:7px}',
    '.wk-logos{display:flex;align-items:center;margin-top:8px}',
    '.wk-logos img,.wk-logos span{width:30px;height:30px;border-radius:50%;border:2px solid #FFD400;background:#fff;object-fit:contain;margin-inline-start:-7px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#0A2A66}',
    '.wk-logos > :first-child{margin-inline-start:0}',
    '.wk-logos span{background:#FFF7DB}',
    '.wk-logos em{font-style:normal;font-size:12.5px;font-weight:800;margin-inline-start:8px}',
    '.wk-s-ben .timer{display:flex;align-items:center;gap:8px;margin-inline-end:46px}',
    '.wk-s-ben .left{font-size:14px;font-weight:800;white-space:nowrap}',
    '.wk-s-ben .left b{font-size:20px}',
    '.wk-s-ben .bar{flex:1;height:6px;background:rgba(10,42,102,.18);border-radius:999px;overflow:hidden}',
    '.wk-s-ben .bar i{display:block;height:100%;background:#0A2A66;border-radius:999px}',
    '.wk-s-ben.urgent .left{color:#B42318}.wk-s-ben.urgent .bar i{background:#D92D20}',
    '.wk-s-ben .wk-go{background:#0A2A66;color:#FFD400}',
    // 2 – האוהד שמאחורי העסק
    '.wk-s-fan{background:#0A2A66 center/cover no-repeat}',
    '.wk-s-fan::before{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(6,22,56,.94) 0%,rgba(6,22,56,.45) 55%,rgba(6,22,56,.1) 100%)}',
    '.wk-s-fan > *{position:relative}',
    '.wk-fan-top{position:absolute!important;top:14px;right:16px;left:16px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.wk-cad{font-size:11px;font-weight:800;color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:3px 9px;backdrop-filter:blur(4px)}',
    '.wk-s-fan .who{font-size:12px;font-weight:700;color:#FFD400;margin-bottom:3px}',
    '.wk-s-fan .t{font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.1}',
    '.wk-s-fan .s{font-size:13px;opacity:.88;margin-top:4px;margin-inline-end:44px;line-height:1.4}',
    '.wk-s-fan > .wk-go{position:absolute;background:#FFD400;color:#0A2A66}',
    // 3–6 – עמודים קבועים
    '.wk-s-page{justify-content:space-between}',
    '.wk-s-page::after{content:"";position:absolute;left:-40px;top:-40px;width:170px;height:170px;border-radius:50%;background:rgba(255,212,0,.12)}',
    '.wk-s-page > *{position:relative;z-index:1}',
    '.wk-s-page .logo{width:46px;height:46px;border-radius:12px;background:#fff;padding:6px;box-sizing:border-box}',
    '.wk-s-page .t{font-size:22px;font-weight:800;line-height:1.15}',
    '.wk-s-page .t span{color:#FFD400}',
    '.wk-s-page .s{font-size:13px;opacity:.85;margin-top:4px;margin-inline-end:44px;line-height:1.4}',
    '.wk-s-page .wk-go{position:absolute;background:#FFD400;color:#0A2A66}',
    '.wk-th-navy{background:#0A2A66;color:#fff}',
    '.wk-th-soft{background:#FFF7DB;color:#0A2A66;border:1px solid #FFE9A3}',
    '.wk-th-soft .wk-badge{background:#0A2A66;color:#FFD400}',
    '.wk-s-page.wk-th-soft .t span{color:#0A2A66}.wk-s-page.wk-th-soft::after{background:rgba(255,212,0,.35)}',
    '.wk-s-page.wk-th-soft .wk-go,.wk-s-page.wk-th-yellow .wk-go{background:#0A2A66;color:#FFD400}',
    '.wk-th-yellow{background:#FFD400;color:#0A2A66}',
    '.wk-th-yellow .wk-badge{background:#0A2A66;color:#FFD400}',
    '.wk-s-page.wk-th-yellow::after{background:rgba(10,42,102,.08)}',
    '@media (min-width:761px){.wk{width:100%;max-width:1410px;margin-inline:auto;padding:22px 0 4px}.wk-track{padding:2px 20px 4px;scroll-padding:0 20px}.wk-slide{flex-basis:calc((100% - 20px) / 2.6);height:220px}}',
    // גיליונות
    '.wk-sheet{position:fixed;inset:0;z-index:9999;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch;transform:translateY(100%);transition:transform .28s ease;font-family:Rubik,sans-serif;color:#3A4C7A}',
    '.wk-sheet.open{transform:none}',
    '.wk-sheet.wk-inline{position:relative;inset:auto;transform:none;transition:none;overflow:visible;z-index:auto}',
    '.wk-close{position:absolute;top:14px;left:14px;z-index:3;width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#0A2A66;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.15)}',
    '.wk-hero{position:relative;min-height:260px;background:#0A2A66 center/cover;color:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding:18px;box-sizing:border-box}',
    '.wk-hero::before{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(6,22,56,.92),rgba(6,22,56,.2) 60%,rgba(6,22,56,.35))}',
    '.wk-hero > *{position:relative}',
    '.wk-hero > .wk-badge{position:absolute;top:18px;right:18px}',
    '.wk-hero > .wk-close{position:absolute}',
    '.wk-hero .who{font-size:12.5px;font-weight:700;color:#FFD400;margin-bottom:4px}',
    '.wk-hero .t{font-size:28px;font-weight:800;line-height:1.1}',
    '.wk-hero .tag{font-size:15px;opacity:.9;margin-top:6px}',
    '.wk-hero.ben{background:#FFD400;color:#0A2A66;min-height:0;padding-top:70px}',
    '.wk-hero.ben::before,.wk-hero.page::before{display:none}',
    '.wk-hero.ben > .wk-badge{background:#0A2A66;color:#FFD400}',
    '.wk-hero.page{min-height:0;padding-top:70px}',
    '.wk-hero.page.wk-th-soft .who,.wk-hero.page.wk-th-yellow .who{color:#6B5200}',
    '.wk-in{padding:18px 18px 120px;max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:18px;color:#3A4C7A}',
    '.wk-inline .wk-in{padding-bottom:24px}',
    '.wk-p{font-size:15.5px;line-height:1.65;margin:0;white-space:pre-line}',
    '.wk-owner{display:flex;align-items:center;gap:10px}',
    '.wk-avatar{width:46px;height:46px;flex:none;border-radius:50%;background:#FFD400;color:#0A2A66;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;border:2px solid #0A2A66}',
    '.wk-owner-name{font-size:16px;font-weight:800;color:#0A2A66}',
    '.wk-owner-role{font-size:12.5px;color:#6B7A9B;margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.wk-fan{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:#0A2A66;background:#FFF7DB;border:1px solid #FFE9A3;border-radius:999px;padding:2px 8px}',
    '.wk-lead{font-size:16px;line-height:1.65;white-space:pre-line}',
    '.wk-lead b{display:block;font-size:19px;color:#0A2A66;margin-bottom:4px}',
    '.wk-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.wk-chips span{font-size:12px;font-weight:700;color:#0A2A66;background:#F2F2EC;border-radius:999px;padding:4px 10px}',
    '.wk-quote{font-size:20px;font-weight:800;line-height:1.4;color:#0A2A66;padding-right:14px;border-right:4px solid #FFD400}',
    '.wk-sec h3{font-size:13px;font-weight:800;letter-spacing:.04em;color:#6B7A9B;margin:0 0 6px}',
    '.wk-sec p{font-size:15.5px;line-height:1.7;margin:0;white-space:pre-line}',
    '.wk-timer{background:#fff;border:1px solid #FFE9A3;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}',
    '.wk-timer .row{display:flex;justify-content:space-between;font-weight:800;color:#0A2A66}',
    '.wk-timer .row span:last-child{font-size:12px;color:#6B7A9B}',
    '.wk-timer .bar{height:6px;background:#EFE7C4;border-radius:999px;overflow:hidden}',
    '.wk-timer .bar i{display:block;height:100%;background:#0A2A66}',
    '.wk-price{display:flex;gap:8px}',
    '.wk-pc{flex:1;background:#FFF7DB;border:1px solid #FFE9A3;border-radius:14px;padding:12px 8px;text-align:center;display:flex;flex-direction:column;align-items:center}',
    '.wk-pc .ring{height:58px;display:flex;align-items:center;justify-content:center}',
    '.wk-pc .ring i{display:block;border-radius:50%;border:2.5px dashed #0A2A66;background:#fff}',
    '.wk-pc b{font-size:15px;color:#6B7A9B;font-weight:800;margin-top:6px}',
    '.wk-pc s{font-size:13px;color:#98A2B3;margin-top:2px}',
    '.wk-pc span{font-size:28px;font-weight:800;color:#0A2A66;line-height:1.1}',
    '.wk-rows{display:flex;flex-direction:column;gap:8px}',
    '.wk-row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E7E7E0;border-radius:13px;padding:9px 11px;cursor:pointer;color:#0A2A66}',
    '.wk-logo{width:42px;height:42px;flex:none;border-radius:12px;border:1px solid #E7E7E0;background:#fff;object-fit:contain;padding:3px;box-sizing:border-box}',
    '.wk-logo-l{display:flex;align-items:center;justify-content:center;font-weight:800;background:#FFF7DB}',
    '.wk-row-main{flex:1;min-width:0}',
    '.wk-row-name{font-size:15px;font-weight:800;color:#0A2A66}',
    '.wk-row-sub{font-size:12px;color:#6B7A9B}',
    '.wk-row-tbd{border-style:dashed;cursor:default}',
    '.wk-row-tbd .wk-logo{background:#F2F2EC;border-style:dashed}',
    '.wk-row-tbd .wk-row-name{color:#6B7A9B}',
    '.wk-small{font-size:12.5px;color:#6B7A9B;line-height:1.5}',
    '.wk-steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:14px}',
    '.wk-steps li{display:flex;gap:12px;align-items:flex-start;font-size:15.5px;line-height:1.6}',
    '.wk-steps li i{flex:none;width:28px;height:28px;border-radius:50%;background:#FFD400;color:#0A2A66;font:800 14px Rubik,sans-serif;display:flex;align-items:center;justify-content:center;font-style:normal}',
    '.wk-steps li b{display:block;color:#0A2A66;font-size:16px}',
    '.wk-ctas{display:flex;flex-direction:column;gap:8px}',
    '.wk-cta{display:block;width:100%;height:48px;border-radius:12px;border:0;background:#0A2A66;color:#fff;font:800 16px Rubik,sans-serif;cursor:pointer}',
    '.wk-ctas .wk-cta + .wk-cta{background:#FFD400;color:#0A2A66}',
    '.wk-bar-btn{position:fixed;bottom:0;left:0;right:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(to top,#fff 70%,rgba(255,255,255,0));z-index:3}',
    '.wk-inline .wk-bar-btn{position:sticky}',
    '.wk-bar-btn button{width:100%;max-width:640px;display:block;margin:0 auto;height:50px;border:0;border-radius:13px;background:#FFD400;color:#0A2A66;font:800 16px Rubik,sans-serif}'
  ].join('\n');
  function injectCss() {
    if (document.getElementById('wk-style')) return;
    var s = document.createElement('style'); s.id = 'wk-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ── הרכבה בדף הבית ──────────────────────────────────────────────────────────────────
  var state = { d: null, open: null };
  function mount(root) {
    injectCss();
    var d = state.d = load(), ctx = { t: timing(new Date()) };
    root.innerHTML = '<section class="wk" aria-label="הטבה בלעדית, האוהד שמאחורי העסק, Yellow Zone"><div class="wk-track" id="wkTrack">' +
      ORDER.map(function (k) { return slideHtml(k, d, ctx); }).join('') + '</div><div class="wk-dots" id="wkDots">' +
      ORDER.map(function (k, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</div></section>';
    ORDER.forEach(function (k) {
      var old = document.getElementById('wkSheet-' + k); if (old) old.remove();
      var el = document.createElement('div'); el.className = 'wk-sheet'; el.id = 'wkSheet-' + k; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = sheetInner(k, d, ctx); document.body.appendChild(el);
    });
    var tr = document.getElementById('wkTrack'), dots = document.getElementById('wkDots').children;
    tr.addEventListener('scroll', function () {
      var s = tr.children, best = 0, bd = 1e9, r = tr.getBoundingClientRect();
      for (var i = 0; i < s.length; i++) { var b = s[i].getBoundingClientRect(), dd = Math.abs(b.right - r.right); if (dd < bd) { bd = dd; best = i; } }
      for (var j = 0; j < dots.length; j++) dots[j].classList.toggle('on', j === best);
    }, { passive: true });
  }
  function open(k) {
    var el = document.getElementById('wkSheet-' + k); if (!el) return;
    state.open = k; el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); el.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
  }
  function close(k) {
    var el = document.getElementById('wkSheet-' + k); if (!el) return;
    el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); state.open = null;
    document.documentElement.style.overflow = '';
    ['bizOverlay', 'shareOverlay'].forEach(function (oid) { var o = document.getElementById(oid); if (o) o.style.zIndex = ''; });
  }
  // כרטיס העסק נפתח **מעל** הגיליון (לא סוגרים אותו), כך שסגירת הכרטיס מחזירה בדיוק לאותו מקום ברשימה
  function biz(id) {
    if (typeof window.openBiz !== 'function') return;
    ['bizOverlay', 'shareOverlay'].forEach(function (oid, i) { var o = document.getElementById(oid); if (o) o.style.zIndex = state.open ? String(10050 + i * 10) : ''; });
    window.openBiz(id);
  }
  function share(text) {
    var url = 'https://yellowzone.co.il/download?src=share';
    if (navigator.share) { navigator.share({ title: 'Yellow Zone', text: text, url: url }).catch(function () {}); return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n' + url), '_blank');
  }
  function doAct(a) {
    var inv = state.d && state.d.pages.invite;
    if (a === 'bizSignup') location.href = 'business.html';
    else if (a === 'shareFan') share(inv.fanText);
    else if (a === 'shareBiz') share(inv.bizText);
  }

  window.WK = {
    KEY: KEY, KNOWN: KNOWN, US_DIRS: US_DIRS, ORDER: ORDER,
    DEFAULTS: DEFAULTS, pageFromDir: pageFromDir, load: load, save: save, reset: reset,
    period: period, dm: dm, timing: timing, esc: esc,
    slideHtml: slideHtml, sheetInner: sheetInner, injectCss: injectCss,
    mount: mount, open: open, close: close, biz: biz, act: doAct
  };
})();
