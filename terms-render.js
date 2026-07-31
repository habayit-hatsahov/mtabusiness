// מודול משותף — עיבוד טקסט התקנון (markdown פשוט: "## " לכותרת מקטע, "!" בתחילת שורה
// לתיבת-הדגשה) לתוך DOM עם באדג' ממוספר, בשימוש גם ב-terms.html וגם ב-business-dashboard.html
// (view-terms) כדי ששתי התצוגות ייראו זהה. ר' Yellow Zone Terms.dc.html למקור העיצוב.
export function renderTermsSections(raw, container) {
  container.innerHTML = '';
  let sectionIndex = 0;
  let sec = null;

  (raw || '').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('## ')) {
      sectionIndex++;
      if (sec) {
        const sep = document.createElement('div');
        sep.className = 'terms-sep';
        container.appendChild(sep);
      }
      sec = document.createElement('section');
      sec.className = 'terms-sec';

      const head = document.createElement('div');
      head.className = 'terms-sec-head';
      const badge = document.createElement('div');
      badge.className = 'terms-badge';
      badge.textContent = sectionIndex;
      const h2 = document.createElement('h2');
      h2.textContent = trimmed.slice(3).replace(/^\d+\.\s*/, '');
      head.appendChild(badge);
      head.appendChild(h2);
      sec.appendChild(head);
      container.appendChild(sec);
      return;
    }

    if (!sec) return; // טקסט לפני כותרת ראשונה — מתעלמים, לא אמור לקרות בתוכן תקין

    const isCallout = trimmed.startsWith('!');
    const text = isCallout ? trimmed.slice(1).trim() : trimmed;
    const m = text.match(/^([^:]{2,40}):\s*(.*)$/);

    const el = document.createElement(isCallout ? 'div' : 'p');
    el.className = isCallout ? 'terms-callout' : 'terms-p';
    if (m) {
      const strong = document.createElement('strong');
      strong.textContent = m[1] + ': ';
      el.appendChild(strong);
      el.appendChild(document.createTextNode(m[2]));
    } else {
      el.textContent = text;
    }
    sec.appendChild(el);
  });
}
