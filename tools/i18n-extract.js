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

/**
 * Keys for static markup, exactly as translateDom() sees them at runtime: the trimmed
 * innerHTML of each element with a bare data-i18n attribute, serialised the way browsers
 * do it (so <br /> becomes <br>), plus the original value of each data-i18n-attr attribute.
 */
export function htmlKeys(src) {
  const out = [];
  const open = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let m;
  while ((m = open.exec(src))) {
    const [, tag, attrs] = m;
    if (/\sdata-i18n(?=[\s>=]|$)(?!=)/.test(` ${attrs}`) && !/\sdata-i18n-attr/.test(` ${attrs}`.replace(/\sdata-i18n(?=[\s>]|$)/, ''))) {
      // find the matching close tag, allowing nested elements of the same name
      let depth = 1, i = open.lastIndex;
      const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
      re.lastIndex = i;
      let t;
      while (depth && (t = re.exec(src))) { depth += t[1] ? -1 : 1; if (!depth) { out.push(src.slice(i, t.index).trim().replace(/<br\s*\/>/g, '<br>')); } }
    }
    const a = /\sdata-i18n-attr="([^"]+)"/.exec(attrs);
    if (a) for (const name of a[1].split(',')) { const v = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs); if (v) out.push(v[1]); }
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
    for (const k of htmlKeys(src)) add(k, html);
  }
  return [...keys.keys()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = extract();
  console.log(JSON.stringify(keys, null, 1));
  console.error(`${keys.length} strings`);
}
