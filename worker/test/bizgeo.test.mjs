// §762ב — בדיקת bizgeo.js: כללי הכתובת + תכנון יבש מול הנתונים האמיתיים (bizPublic, קריאה ציבורית) והזרע המקומי.
// הרצה: node test/bizgeo.test.mjs   (בלי כתיבה ובלי Geocoding)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanAddress, cleanCity, geocodeQuery, isPlaced, planOne, sameGeo } from '../src/bizgeo.js';

// כללי הכתובת
assert.equal(cleanAddress('הנחשול'), 'הנחשול 1');                       // רחוב בלי מספר → 1
assert.equal(cleanAddress('הנחשול 22'), 'הנחשול 22');
assert.equal(cleanAddress('אורט 18 (תחנת דלק דור אלון)'), 'אורט 18');     // סוגריים יורדים
assert.equal(cleanAddress('דיזינגוף סנטר'), 'דיזינגוף סנטר 1');
assert.equal(cleanAddress(''), '');
assert.equal(cleanCity('סניף אשדוד'), 'אשדוד');
assert.equal(geocodeQuery('', 'ראש העין'), 'ראש העין, ישראל');          // אין כתובת → מרכז העיר
assert.equal(geocodeQuery('ז׳בוטינסקי', 'רמת גן'), 'ז׳בוטינסקי 1, רמת גן, ישראל');
assert.equal(isPlaced({ bizTypes: ['physical'] }), true);
assert.equal(isPlaced({ bizTypes: ['pro'], serviceModes: ['toClient'] }), false);
assert.equal(isPlaced({ bizTypes: ['pro'], serviceModes: ['atMine', 'toClient'] }), true);

// planOne: קיים נשמר, זרע ממלא, חסר מסומן
const f = { branches: [{ city: 'יבנה', address: 'הנחשול' }, { city: 'חדש', address: 'רחוב 5' }], branchGeo: [] };
const p = planOne('X', f, { X: [{ c: 'יבנה', a: 'הנחשול', lat: 31.863128, lng: 34.739399 }] });
assert.deepEqual(p.out[0], { c: 'יבנה', a: 'הנחשול', lat: 31.863128, lng: 34.739399 });
assert.deepEqual(p.missing, [1]);
assert.equal(sameGeo([{ c: 'a', a: 'b', lat: 1, lng: 2 }], [{ c: 'a', a: 'b', lat: 1, lng: 2 }]), true);
assert.equal(sameGeo([{ c: 'a', a: 'b', lat: 1, lng: 2 }], [{ c: 'a', a: 'b', lat: 1, lng: 3 }]), false);
console.log('✓ כללי הכתובת ו-planOne');

// תכנון יבש מול הנתונים האמיתיים
const seed = JSON.parse(fs.readFileSync(new URL('../../biz-geo.json', import.meta.url), 'utf8'));
const from = (v) => !v ? null : 'stringValue' in v ? v.stringValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(from)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, from(x)])) : 'doubleValue' in v ? v.doubleValue : null;
let docs = [], tok = '';
do {
  const r = await fetch('https://firestore.googleapis.com/v1/projects/habayit-hatsahov/databases/(default)/documents/bizPublic?pageSize=300' + (tok ? '&pageToken=' + tok : ''));
  const j = await r.json(); docs = docs.concat(j.documents || []); tok = j.nextPageToken || '';
} while (tok);
let placed = 0, branches = 0, missing = [];
for (const d of docs) {
  const id = d.name.split('/').pop();
  const fl = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, from(v)]));
  if (fl.status !== 'approved' || !isPlaced(fl)) continue;
  placed++;
  const pl = planOne(id, fl, seed);
  branches += pl.want.length;
  pl.missing.forEach((i) => missing.push(fl.name + ' | ' + geocodeQuery(pl.want[i].a, pl.want[i].c)));
}
console.log(`bizPublic: ${docs.length} · עם נקודה: ${placed} עסקים / ${branches} סניפים · חסרים (ייגזרו ב-Geocoding): ${missing.length}`);
missing.forEach((m) => console.log('  →', m));
