#!/usr/bin/env node
// Lists every translatable string: t('…') and tn('…', '…') in code, data-i18n markup in HTML.
// Used by the coverage test and by tools/i18n-build.js. Usage: node tools/i18n-extract.js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['js', 'functions', 'workers'];
const SKIP = /(^|\/)(i18n|_vendor|vendor)(\/|$)/;

const unescape = (s, q) => s.replace(/\\(n|t|\\|'|"|`)/g, (m, c) => ({ n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"', '`': '`' }[c]));
const STR = String.raw`(['"])((?:\\.|(?!\1)[^\\])*)\1`;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (SKIP.test(p.slice(root.length + 1))) continue;
    if (statSync(p).isDirectory()) walk(p, out); else if (extname(p) === '.js') out.push(p);
  }
  return out;
}

export function extract() {
  const keys = new Map(); // key -> first location
  const add = (k, where) => { if (k && !keys.has(k)) keys.set(k, where); };
  for (const dir of SCAN) {
    for (const file of walk(join(root, dir))) {
      const src = readFileSync(file, 'utf8');
      const rel = file.slice(root.length + 1);
      for (const m of src.matchAll(new RegExp(String.raw`\bt\(\s*${STR}`, 'g'))) add(unescape(m[2], m[1]), rel);
      for (const m of src.matchAll(new RegExp(String.raw`\btn\(\s*${STR}\s*,\s*${STR.replace('\\1', '\\3').replace('(?!\\1)', '(?!\\3)')}`, 'g'))) { add(unescape(m[2], m[1]), rel); add(unescape(m[4], m[3]), rel); }
    }
  }
  for (const html of ['index.html', 'diagnose.html']) {
    const src = readFileSync(join(root, html), 'utf8');
    for (const m of src.matchAll(/<([a-z0-9]+)([^>]*\sdata-i18n(?:\s|>|=")[^>]*)>([\s\S]*?)<\/\1>/g)) if (!/data-i18n-attr/.test(m[2]) || /\sdata-i18n[\s>]/.test(`${m[2]}>`)) add(m[3].trim(), html);
    for (const m of src.matchAll(/<[a-z0-9]+([^>]*)data-i18n-attr="([^"]+)"([^>]*)>/g)) {
      const attrs = m[1] + m[3];
      for (const a of m[2].split(',')) { const v = new RegExp(`${a}="([^"]*)"`).exec(attrs); if (v) add(v[1], html); }
    }
  }
  return [...keys.keys()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = extract();
  console.log(JSON.stringify(keys, null, 1));
  console.error(`${keys.length} strings`);
}
