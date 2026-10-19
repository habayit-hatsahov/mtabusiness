// ══ §556 — "הורדות לפי מקור": משיכה יומית מהחנויות ל-Firestore (storeDownloads/{YYYY-MM-DD}) ══════════
//
// המקור בקישור (?src=) עובר לחנות (§553): אפל ct=<src>, גוגל referrer=utm_source=<src>. כאן אוספים חזרה
// כמה **הורדות** הגיעו מכל מקור, לכל יום ולכל חנות. לא הרשמות – החנויות לא מוסרות מי הוריד (§553).
//
// 🍏 אפל – Analytics Reports API (§554): בקשת דוח ONGOING כבר קיימת (ASC_REPORT_REQUEST_ID). הדוח
//    "App Downloads Detailed": מופעים יומיים → קטעים (TSV מכווץ) → שורות עם Date / Download Type / Campaign / Counts.
//    נספרות רק "First-time download". Campaign ריק = בלי קישור שלנו (חיפוש / דפדוף / ישיר).
//    המפתח: Sales and Reports, סוד ASC_API_KEY_P8. JWT ES256, עד 20 דקות.
// 🤖 גוגל – הקובץ החודשי store_performance_<pkg>_<YYYYMM>_traffic_source.csv בדלי pubsite_prod_<dev>
//    (UTF-16). עמודות (אומתו בקובץ האמיתי, §554): Date, Package name, Traffic source, Search term, UTM source,
//    UTM campaign, Store listing acquisitions, Store listing visitors, Store listing conversion rate.
//    ⚠️ "Store listing acquisitions" = התקנות דרך דף החנות, לא כל ההתקנות. חשבון השירות של הוורקר מוזמן
//    ב-Play Console לקריאת דוחות בלבד.
//
// 🔑 המפתחות במפה: src נקי ([\w-], עד 40). "direct" = בלי קישור שלנו; "hidden" = החנות הסתירה (גוגל:
//    UTM "Other" בהפניה חיצונית – מעט מדי לפרטיות). כל חנות כותבת רק את השדה שלה (ios / android),
//    כך שכשל באחת לא מוחק את השנייה. מצב אחרון לכל חנות: storeDownloads/_status.

import { getGoogleAccessToken } from './jwt.js';
import { firestorePatch } from './firestore.js';

const ASC = 'https://api.appstoreconnect.apple.com';
const DAYS_BACK = 40;   // כמה ימים אחורה מעדכנים בכל ריצה (החנויות מתקנות נתונים של ימים קודמים)

const ymd = (d) => d.toISOString().slice(0, 10);
const cleanSrc = (s) => { const v = String(s || '').trim().toLowerCase().replace(/[^\w-]/g, '').slice(0, 40); return v || 'direct'; };
function bump(byDate, date, src, n) {
  if (!date || !(n > 0)) return;
  const m = byDate[date] || (byDate[date] = {});
  m[src] = (m[src] || 0) + n;
}

// ── אפל ───────────────────────────────────────────────────────────────────────────────
function pemToDer(pem) {
  const b = atob(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out.buffer;
}
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlStr = (s) => b64url(new TextEncoder().encode(s));
async function ascJwt(env) {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.ASC_API_KEY_P8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const u = b64urlStr(JSON.stringify({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' })) + '.' +
    b64urlStr(JSON.stringify({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(u));   // r||s – בדיוק מה ש-JWT צריך
  return u + '.' + b64url(sig);
}
async function ascGet(jwt, pathOrUrl) {
  const r = await fetch(pathOrUrl.startsWith('http') ? pathOrUrl : ASC + pathOrUrl, { headers: { Authorization: 'Bearer ' + jwt } });
  if (!r.ok) throw new Error('asc ' + r.status + ' ' + pathOrUrl.slice(0, 90) + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function gunzipText(resp) {
  const ds = resp.body.pipeThrough(new DecompressionStream('gzip'));
  return await new Response(ds).text();
}
export async function fetchAppleByDate(env) {
  if (!env.ASC_API_KEY_P8 || !env.ASC_KEY_ID || !env.ASC_ISSUER_ID || !env.ASC_REPORT_REQUEST_ID) throw new Error('asc_not_configured');
  const jwt = await ascJwt(env);
  const reports = await ascGet(jwt, `/v1/analyticsReportRequests/${env.ASC_REPORT_REQUEST_ID}/reports?limit=200`);
  const rep = (reports.data || []).find((r) => r.attributes && r.attributes.name === 'App Downloads Detailed');
  if (!rep) return { byDate: {}, note: 'report_not_ready', reports: (reports.data || []).length };
  const since = ymd(new Date(Date.now() - DAYS_BACK * 864e5));
  const inst = await ascGet(jwt, `/v1/analyticsReports/${rep.id}/instances?filter[granularity]=DAILY&limit=200`);
  const todo = (inst.data || []).filter((i) => (i.attributes.processingDate || '') >= since);
  const byDate = {};
  let rows = 0, through = '';
  for (const i of todo) {
    const segs = await ascGet(jwt, `/v1/analyticsReportInstances/${i.id}/segments?limit=200`);
    for (const s of segs.data || []) {
      const resp = await fetch(s.attributes.url);
      if (!resp.ok) throw new Error('asc_segment ' + resp.status);
      const lines = (await gunzipText(resp)).split(/\r?\n/).filter(Boolean);
      const h = lines.shift().split('\t');
      const col = (n) => h.indexOf(n);
      const [cD, cT, cC, cN] = [col('Date'), col('Download Type'), col('Campaign'), col('Counts')];
      if (cD < 0 || cT < 0 || cC < 0 || cN < 0) throw new Error('asc_columns_changed: ' + h.join('|').slice(0, 200));
      for (const l of lines) {
        const f = l.split('\t');
        if (!/first/i.test(f[cT] || '')) continue;
        bump(byDate, f[cD], cleanSrc(f[cC]), parseInt(f[cN], 10) || 0);
        rows++;
        if (f[cD] > through) through = f[cD];
      }
    }
  }
  return { byDate, rows, instances: todo.length, through };
}

// ── גוגל ──────────────────────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
export async function fetchGoogleByDate(env, accessToken) {
  const bucket = env.PLAY_REPORTS_BUCKET, pkg = env.PLAY_PACKAGE;
  if (!bucket || !pkg) throw new Error('play_not_configured');
  const months = [0, 1].map((k) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 7).replace('-', ''); });
  const byDate = {};
  let rows = 0, files = 0, through = '';
  for (const m of months) {
    const obj = encodeURIComponent(`stats/store_performance/store_performance_${pkg}_${m}_traffic_source.csv`);
    const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${obj}?alt=media`, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error('play ' + r.status + ': ' + (await r.text()).slice(0, 200));
    files++;
    const b = new Uint8Array(await r.arrayBuffer());
    const txt = (b[0] === 0xff && b[1] === 0xfe) ? new TextDecoder('utf-16le').decode(b.subarray(2)) : new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const h = parseCsvLine(lines.shift());
    const col = (n) => h.indexOf(n);
    const [cD, cS, cU, cA] = [col('Date'), col('Traffic source'), col('UTM source'), col('Store listing acquisitions')];
    if (cD < 0 || cS < 0 || cU < 0 || cA < 0) throw new Error('play_columns_changed: ' + h.join('|').slice(0, 200));
    for (const l of lines) {
      const f = parseCsvLine(l);
      const utm = (f[cU] || '').trim();
      const tagged = utm && !/^(other|\(not set\))$/i.test(utm);
      const src = tagged ? cleanSrc(utm) : (/third.?party/i.test(f[cS] || '') ? 'hidden' : 'direct');
      bump(byDate, f[cD], src, parseInt(f[cA], 10) || 0);
      rows++;
      if (f[cD] > through) through = f[cD];
    }
  }
  return { byDate, rows, files, through };
}

// ── הריצה ─────────────────────────────────────────────────────────────────────────────
async function writeStore(env, accessToken, field, byDate) {
  for (const [date, m] of Object.entries(byDate)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    await firestorePatch(env, accessToken, `storeDownloads/${date}`, { date, [field]: m });
  }
}
export async function runStoreDownloadsSync(env) {
  const accessToken = await getGoogleAccessToken(env);
  const status = {};
  for (const [store, field, fn] of [['apple', 'ios', () => fetchAppleByDate(env)], ['google', 'android', () => fetchGoogleByDate(env, accessToken)]]) {
    const at = new Date();
    try {
      const r = await fn();
      await writeStore(env, accessToken, field, r.byDate);
      status[store] = { ok: true, at, days: Object.keys(r.byDate).length, through: r.through || '', note: r.note || '' };
    } catch (e) {
      console.error('storeDownloads ' + store, String(e));
      status[store] = { ok: false, at, error: String(e && e.message || e).slice(0, 300) };
    }
  }
  // כל חנות בשדה משלה – כשל באחת לא דורס את "עודכן לאחרונה" של השנייה
  await firestorePatch(env, accessToken, 'storeDownloads/_status', status);
  return status;
}
