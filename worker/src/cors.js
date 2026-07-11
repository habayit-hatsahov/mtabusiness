// ALLOWED_ORIGIN יכול להכיל כמה דומיינים מופרדים בפסיק (למשל דומיין הפרודקשן + localhost לבדיקות מקומיות).
// מחזיר את הדומיין המבקש עצמו (Origin header) רק אם הוא ברשימת המותרים — אחרת את הראשון ברשימה (יגרום לדפדפן לחסום, כצפוי).
function resolveAllowedOrigin(env, request) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request?.headers.get('Origin') || '';
  return allowed.includes(origin) ? origin : (allowed[0] || '');
}

export function corsHeaders(env, request) {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(env, request),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export function handlePreflight(env, request) {
  return new Response(null, { status: 204, headers: corsHeaders(env, request) });
}

export function json(body, env, request, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(env, request) });
}
