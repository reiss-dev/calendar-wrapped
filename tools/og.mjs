#!/usr/bin/env node
// Regenerates og.png (1200×630) from the sample calendar using the real card renderer.
// Needs Playwright with Chromium: npm i -D playwright && npx playwright install chromium
// Usage: start the dev server (npm run dev), then: node tools/og.mjs [http://localhost:4173/]
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); }
const base = process.argv[2] || 'http://localhost:4173/';
const browser = await pw.chromium.launch();
const page = await browser.newPage();
await page.goto(base);
const data = await page.evaluate(async () => {
  const { parseICS, guessSelfEmail } = await import('./js/ics.js');
  const { computeStats } = await import('./js/stats.js');
  const { renderCard } = await import('./js/card.js');
  const { cardModel } = await import('./js/model.js');
  const text = await (await fetch('sample/work.ics')).text();
  const y = new Date().getFullYear();
  const range = { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y + 1, 0, 1) };
  const { events, meta } = parseICS(text, range);
  const s = computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta) });
  const c = document.createElement('canvas');
  renderCard(c, cardModel(s, { hideNames: true }), { format: 'wide', watermark: true });
  return c.toDataURL('image/png');
});
await browser.close();
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'og.png');
writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log(`Wrote ${out}`);
