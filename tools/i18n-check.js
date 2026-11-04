#!/usr/bin/env node
// Checks a locale file against every string in the code.
//   node tools/i18n-check.js nl      (exit 1 on problems)
import { extract } from './i18n-extract.js';

const code = process.argv[2];
if (!code) { console.error('Usage: node tools/i18n-check.js <nl|sv|nb|da>'); process.exit(1); }
const dict = (await import(`../js/i18n/${code}.js?${Date.now()}`)).default;
const keys = extract();
const sig = (s) => ({
  ph: [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(','),
  tags: [...String(s).matchAll(/<\/?([a-z]+)[^>]*>/g)].map((m) => m[0].replace(/\s+[^>]*/, '')).sort().join(''),
  bold: (String(s).match(/\*\*/g) || []).length,
  nl: (String(s).match(/\n/g) || []).length,
});
const problems = [];
for (const k of keys) {
  if (!(k in dict)) { problems.push(`missing: ${JSON.stringify(k).slice(0, 90)}`); continue; }
  const a = sig(k), b = sig(dict[k]);
  if (a.ph !== b.ph) problems.push(`placeholders differ: ${JSON.stringify(k).slice(0, 70)} → {${b.ph}} vs {${a.ph}}`);
  if (a.tags !== b.tags) problems.push(`HTML differs: ${JSON.stringify(k).slice(0, 70)}`);
  if (a.bold !== b.bold) problems.push(`** markers differ: ${JSON.stringify(k).slice(0, 70)}`);
  if (a.nl !== b.nl) problems.push(`line breaks differ: ${JSON.stringify(k).slice(0, 70)}`);
  if (!String(dict[k]).trim()) problems.push(`empty: ${JSON.stringify(k).slice(0, 70)}`);
}
const extra = Object.keys(dict).filter((k) => !keys.includes(k));
console.log(`${code}: ${keys.length - problems.filter((p) => p.startsWith('missing')).length}/${keys.length} translated, ${problems.length} problems, ${extra.length} unused`);
for (const p of problems.slice(0, 40)) console.log(`  ${p}`);
if (problems.length > 40) console.log(`  …and ${problems.length - 40} more`);
process.exit(problems.length ? 1 : 0);
