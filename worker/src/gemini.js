const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_TITLE_LEN = 35;

// כלל הדיוק: הכותרת חייבת להיות נאמנה ב-100% לעובדות שבטקסט המקורי (בעל העסק) — בלי להמציא/להוסיף
// פרטים (מספרים, אחוזים, מוצרים, תנאים). מותר ומומלץ רק לקצר/לנסח מחדש. ר' docs/PROJECT_CONTEXT.md.
const SYSTEM_PROMPT = `אתה עוזר שמקצר טקסטים של הטבות/הנחות לעסקים קטנים, לתצוגה בכרטיס קצר באינדקס עסקים.
כללים מחייבים:
- הפלט הוא אך ורק כותרת ההטבה המקוצרת עצמה — בלי מרכאות, בלי הסברים, בלי שום טקסט נוסף לפני/אחרי.
- אורך מקסימלי: ${MAX_TITLE_LEN} תווים (כולל רווחים וסימני פיסוק).
- חובה להישאר נאמן ב-100% לעובדות בטקסט המקורי — אסור להמציא, להוסיף או לשנות פרטים (מספרים, אחוזים, מוצרים, תנאים) שלא הופיעו בו במפורש.
- מותר ומומלץ לקצר ניסוח ולהוריד מילים מיותרות — אבל לא להוסיף מידע חדש.
- אם הטקסט המקורי כבר קצר מ-${MAX_TITLE_LEN} תווים, אפשר להחזיר אותו כמעט כפי שהוא (ניקוי קל בלבד).
- כתוב בעברית תקנית וברורה.`;

export async function shortenBenefitText(env, longText) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const resp = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': env.GEMINI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: longText }] }],
      generationConfig: {
        maxOutputTokens: 100,
        // מבטל את "חשיבה" המורחבת של Gemini 2.5 — בלי זה, ה-thinking הפנימי יכול לצרוך את כל
        // תקציב הטוקנים בלי לכתוב טקסט בפועל (בדיוק אותו סוג באג שתפסנו עם Claude Sonnet 5, ר' PROJECT_CONTEXT.md).
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!resp.ok) throw new Error('gemini_call_failed: ' + (await resp.text()));

  const data = await resp.json();
  const shortTitle = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  if (!shortTitle) throw new Error('gemini_empty_response');
  return shortTitle;
}
