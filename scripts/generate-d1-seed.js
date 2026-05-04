#!/usr/bin/env node
/* Extract MANHWA_DATA from js/01-core.js and write a SQL seed file
   suitable for `wrangler d1 execute --file=docs/d1/seed/manhwa.sql`.
*/
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/01-core.js'), 'utf8');
const m = src.match(/const MANHWA_DATA\s*=\s*(\[[\s\S]*?\])\s*;/);
if (!m) {
  console.error('MANHWA_DATA not found in 01-core.js');
  process.exit(1);
}
let data;
try { data = eval(m[1]); } catch (e) { console.error(e); process.exit(1); }
const now = Date.now();
const esc = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";

let sql = '-- Auto-generated from js/01-core.js MANHWA_DATA\n';
sql += '-- Safe to re-run: uses INSERT OR REPLACE\n\n';
sql += 'BEGIN TRANSACTION;\n';
for (const it of data) {
  sql += `INSERT OR REPLACE INTO manhwa (id,title,status,type,genres_json,rating,views,cover,description,is_adult,created_at,updated_at) VALUES (`;
  sql += [
    esc(it.id),
    esc(it.title),
    esc(it.status || 'ongoing'),
    esc(it.type || 'manhwa'),
    esc(JSON.stringify(it.genres || [])),
    Number(it.rating || 0),
    Number(it.views || 0),
    esc(it.cover || ''),
    esc(it.description || ''),
    it.isAdult ? 1 : 0,
    now,
    now
  ].join(',');
  sql += ');\n';
}
sql += 'COMMIT;\n';

const outDir = path.join(root, 'docs/d1/seed');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'manhwa.sql'), sql);
console.log(`Wrote ${data.length} manhwa rows to docs/d1/seed/manhwa.sql`);
