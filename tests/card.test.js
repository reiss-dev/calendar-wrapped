import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats } from '../js/stats.js';
import { cardModel, sanitizeModel, cardTiles, cardTileKeys, availableTiles, cardColours, CARD_THEMES } from '../js/model.js';
import { cardSvg } from '../functions/_lib/card-svg.js';

const range = { rangeStart: new Date(2026, 0, 1), rangeEnd: new Date(2027, 0, 1) };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const load = (f) => { const { events, meta } = parseICS(read(`sample/${f}.ics`), range); return computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta), now: new Date(2026, 10, 4) }); };
const work = load('work');

test('the card carries the tiles you pick, in your order, and falls back to the defaults', () => {
  const plain = cardModel(work, { hideNames: true });
  assert.equal(plain.k, undefined);
  assert.deepEqual(cardTileKeys(plain), ['h', 'c', 's', 'ws', 'b', 'r']);
  const picked = cardModel(work, { hideNames: true, tiles: ['cs', 'rc', 'nonsense', 'cs', 'to'] });
  assert.deepEqual(picked.k, ['cs', 'rc', 'to'], 'unknown and repeated keys dropped');
  assert.deepEqual(cardTileKeys(picked).slice(0, 3), ['cs', 'rc', 'to']);
  assert.equal(cardTiles(picked).length, 3, 'exactly what was picked');
  assert.match(cardTiles(picked)[0][1], /customers/);
  assert.ok(availableTiles(plain).includes('cs') && !availableTiles(plain).includes('pn'), 'names hidden: no most-seen tile');
});

test('colours and tiles survive a link, and junk does not', () => {
  const m = cardModel(work, { tiles: ['cs', 'co', 'fr'], theme: 'black' });
  const back = sanitizeModel(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(back.k, ['cs', 'co', 'fr']);
  assert.equal(back.th, 'black');
  assert.equal(back.n.cs, m.n.cs);
  assert.deepEqual(cardColours(back), CARD_THEMES.black);
  const bad = sanitizeModel({ ...m, k: ['<script>', 'h', 'e'], th: 'url(evil)', n: { ...m.n, cs: 900 } });
  assert.deepEqual(bad.k, ['h'], 'only this mode’s tiles');
  assert.equal(bad.th, undefined);
  assert.equal(bad.n.cs, 100, 'a share is capped');
  const svg = cardSvg(back, { brand: 'Calendar Wrapped', domain: 'x.app' });
  assert.ok(svg.includes(CARD_THEMES.black[0]), 'the link preview uses the chosen colour');
  assert.ok(svg.includes('of meeting time with customers'));
});

test('personal cards have their own tiles', () => {
  const p = cardModel(load('personal'), { tiles: ['to', 'h', 'cs'] });
  assert.deepEqual(p.k, ['to', 'h'], 'no customer tile on a personal card');
  assert.deepEqual(cardColours(p), CARD_THEMES.pink);
});
