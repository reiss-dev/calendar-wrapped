import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extract } from '../tools/i18n-extract.js';

const keys = extract();
const sig = (s) => [
  [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(','),
  [...String(s).matchAll(/<\/?([a-z]+)[^>]*>/g)].map((m) => m[0].replace(/\s+[^>]*/, '')).sort().join(''),
  (String(s).match(/\*\*/g) || []).length,
  (String(s).match(/\n/g) || []).length,
].join('|');

for (const code of ['nl', 'sv', 'nb', 'da']) {
  test(`${code}: every string translated with placeholders, tags and markers intact`, async () => {
    const dict = (await import(`../js/i18n/${code}.js`)).default;
    const missing = keys.filter((k) => !(k in dict));
    assert.equal(missing.length, 0, `${missing.length} missing, e.g. ${JSON.stringify(missing.slice(0, 3))}`);
    const broken = keys.filter((k) => sig(k) !== sig(dict[k]) || !String(dict[k]).trim());
    assert.equal(broken.length, 0, `${broken.length} broken, e.g. ${JSON.stringify(broken.slice(0, 3))}`);
  });
}

test('the saved key list matches the code (run: node tools/i18n-extract.js > tools/i18n-keys.json)', () => {
  const saved = JSON.parse(readFileSync(new URL('../tools/i18n-keys.json', import.meta.url), 'utf8'));
  assert.deepEqual([...keys].sort(), [...saved].sort());
});
