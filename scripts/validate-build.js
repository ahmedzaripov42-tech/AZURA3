#!/usr/bin/env node
/* AZURA build validator
   Verifies the project is internally consistent and ready for both
   local serve and Cloudflare deploy.
*/
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const REQUIRED = [
  'index.html', 'sw.js', '_worker.js', '_headers', '_redirects',
  'wrangler.toml', 'package.json', 'server.js',
  'js/00-diagnostic.js', 'js/azura-adapter-v9.js',
  'js/azura-local-unified-v9.js', 'js/azura-mobile-performance-v10.js',
  'azura.css', 'azura-mobile-performance-v10.css',
  'docs/d1/migrations/001_base.sql',
  'docs/d1/migrations/002_indexes.sql',
  'docs/d1/migrations/003_full_schema.sql',
  'docs/d1/migrations/004_full_indexes.sql',
  'docs/api/contract.v2.json',
  'docs/architecture/ADAPTER_BOUNDARY_UZ.md',
  'scripts/generate-d1-seed.js',
  'scripts/migrate-d1.sh',
  'scripts/upload-r2.sh'
];

let problems = 0;
const fail = m => { console.error('  ✗', m); problems++; };
const ok = m => console.log('  ✓', m);

console.log('==> Required files');
let missCount = 0;
for (const f of REQUIRED) {
  if (!fs.existsSync(path.join(root, f))) { fail(`missing: ${f}`); missCount++; }
}
if (!missCount) ok(`all ${REQUIRED.length} required files present`);

console.log('\n==> Empty (zero-byte) files');
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      out.push(...walk(p));
    } else out.push(p);
  }
  return out;
}
const empty = walk(root).filter(f => fs.statSync(f).size === 0);
if (empty.length) empty.forEach(f => fail(`empty: ${path.relative(root, f)}`));
else ok('no empty files');

console.log('\n==> Package cleanliness');
const junkPatterns = [
  /\.git$/, /node_modules$/, /\.DS_Store$/, /Thumbs\.db$/i,
  /^\._/, /\.swp$/, /\.swo$/, /~$/, /\.idea$/, /\.vscode$/,
  /\.log$/, /npm-debug\.log/, /\.cache$/
];
const junk = [];
function scanJunk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (junkPatterns.some(rx => rx.test(e.name))) { junk.push(p); continue; }
    if (e.isDirectory()) scanJunk(p);
  }
}
try { scanJunk(root); } catch(_){}
if (junk.length) {
  junk.forEach(j => fail(`junk in tree: ${path.relative(root, j)}`));
} else ok('no junk files (.git, node_modules, OS junk, editor cache)');

console.log('\n==> MANHWA_DATA coverage');
const core = fs.readFileSync(path.join(root, 'js/01-core.js'), 'utf8');
const m = core.match(/const MANHWA_DATA\s*=\s*(\[[\s\S]*?\])\s*;/);
if (!m) fail('MANHWA_DATA not parseable');
else {
  const data = eval(m[1]);
  const missing = data.filter(x => x.cover && !fs.existsSync(path.join(root, x.cover)));
  if (missing.length) missing.forEach(x => fail(`cover missing for ${x.id}: ${x.cover}`));
  else ok(`all ${data.length} catalog covers exist`);
}

console.log('\n==> Index.html versioned references resolve');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"]+\?v=\d+)"/g)].map(x => x[1]);
let bad = 0;
for (const r of refs) {
  const f = r.split('?')[0];
  if (f.startsWith('http')) continue;
  if (!fs.existsSync(path.join(root, f))) { fail(`broken ref: ${f}`); bad++; }
}
if (!bad) ok(`all ${refs.length} versioned refs resolve`);

console.log('\n==> Worker ↔ adapter contract');
const worker = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'js/azura-adapter-v9.js'), 'utf8');
const endpoints = ['/catalog', '/users', '/auth', '/library', '/progress', '/chapters', '/media'];
let mismatch = 0;
for (const e of endpoints) {
  if (!worker.includes('/api' + e)) { fail(`worker missing /api${e}`); mismatch++; }
  if (!adapter.includes(e)) { fail(`adapter missing ${e}`); mismatch++; }
}
if (!mismatch) ok('all endpoint pairs match');

console.log('\n==> Cache rules sane');
const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
if (!/\/index\.html\s+[\s\S]*?Cache-Control: public, max-age=0/i.test(headers)) {
  fail('_headers: index.html cache rule looks wrong');
} else ok('_headers index.html rule OK');
if (!/\/api\/\*\s+[\s\S]*?Cache-Control: no-store/i.test(headers)) {
  fail('_headers: /api/* cache rule looks wrong');
} else ok('_headers /api/* rule OK');

console.log(`\n${problems ? '✗ FAILED' : '✓ PASSED'} (${problems} issue${problems === 1 ? '' : 's'})`);
process.exit(problems ? 1 : 0);
