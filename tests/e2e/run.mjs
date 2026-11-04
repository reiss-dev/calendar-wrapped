#!/usr/bin/env node
// End-to-end suite: drives the real app in headless Chromium.
//   npm run e2e                  run everything
//   SHOTS=/tmp/shots npm run e2e also save screenshots
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 4300 + Math.floor(Math.random() * 500);
// E2E_BASE runs the suite against another server, e.g. `wrangler pages dev` with the real functions.
const BASE = process.env.E2E_BASE ? process.env.E2E_BASE.replace(/\/?$/, '/') : `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = process.env.E2E_BASE ? null : spawn(process.execPath, [join(ROOT, 'tools/serve.js'), String(PORT)], { stdio: 'ignore' });
if (server) await new Promise((r) => setTimeout(r, 600));
const browser = await pw.chromium.launch();
const results = [];
const errors = [];

async function ctx(name, opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true, ...opts });
  await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
  const page = await c.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 50[03]|Failed to load resource/.test(m.text())) errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  return { c, page };
}
const shot = async (page, name, full = true) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full }); };
async function scenario(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push([name, 'ok', Date.now() - t0]); } catch (e) { results.push([name, 'FAIL', Date.now() - t0, e.message.split('\n')[0]]); }
}
async function playDemo(page, query = '') {
  await page.goto(`${BASE}${query}`);
  await page.locator('.hero [data-action="demo"]').click();
  await page.waitForSelector('.prep .group', { timeout: 20000 });
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
}
async function throughStory(page, onSlide) {
  const total = await page.locator('.story-progress i').count();
  for (let i = 0; i < total - 1; i++) { await page.waitForTimeout(160); if (onSlide) await onSlide(i); await page.mouse.click(1000, 430); }
  await page.waitForTimeout(500);
  await page.locator('.slide.is-current .slide-cta .btn').click();
  await page.waitForSelector('.summary canvas');
  return total;
}

// ---------------------------------------------------------------- scenarios
await scenario('landing renders, showcase draws, sign-in buttons hidden without client IDs', async () => {
  const { c, page } = await ctx('landing');
  await page.goto(BASE);
  await page.waitForSelector('#show-heatmap svg .cell');
  assert.ok(await page.locator('#show-clock .petal').count() === 24);
  assert.ok(await page.locator('#google-connect').isHidden());
  assert.ok(await page.locator('#microsoft-connect').isHidden());
  await page.locator('#showcase').scrollIntoViewIfNeeded(); await page.waitForTimeout(1400);
  await shot(page, '01-landing');
  await c.close();
});

let sharedLink = '';
await scenario('work demo: story with visuals, summary, actions, formats, link', async () => {
  const { c, page } = await ctx('work');
  await playDemo(page);
  assert.equal(await page.locator('.prep .seg button[aria-pressed="true"]', { hasText: '37.5' }).count(), 1, 'UK default working week');
  const seen = new Set();
  const total = await throughStory(page, async (i) => {
    const cur = page.locator('.slide.is-current');
    for (const sel of ['.viz-heatmap', '.viz-clock', '.viz-bubbles', '.viz-treemap', '.viz-picto', '.viz-arcs']) if (await cur.locator(sel).count()) seen.add(sel);
    if (await cur.locator('.cap', { hasText: 'Compared with' }).count()) seen.add('yoy');
    if (await cur.locator('.persona-emoji').count()) { await page.waitForTimeout(500); if (await cur.locator('canvas.confetti').count()) seen.add('confetti'); }
    if (SHOTS && [0, 1, 3, 6, 7, 17].includes(i)) { await page.waitForTimeout(1300); await shot(page, `02-slide-${String(i + 1).padStart(2, '0')}`, false); }
  });
  for (const k of ['.viz-heatmap', '.viz-clock', '.viz-bubbles', '.viz-treemap', '.viz-picto', '.viz-arcs', 'yoy', 'confetti']) assert.ok(seen.has(k), `story should include ${k}`);
  assert.ok(total >= 18, `slides: ${total}`);
  assert.ok(await page.locator('.summary .viz-heatmap').count() === 1);
  assert.ok(await page.locator('.summary .viz-grid').count() === 1);
  const first = page.locator('.reclaim-list li').first();
  assert.ok(!(await first.getAttribute('class'))?.includes('locked'));
  assert.ok(await first.locator('.actions a[href^="mailto:"]').count() === 1, 'featured suggestion has an email action');
  assert.ok(await page.locator('.reclaim-list li.locked .actions').count() === 0, 'no actions on locked items');
  for (const f of ['Square', 'Story', 'Wide', 'Portrait']) { await page.locator('.card-controls button', { hasText: f }).click(); await page.waitForTimeout(150); }
  await page.locator('.who').fill('Alex');
  await page.getByRole('button', { name: 'Copy link' }).click(); await page.waitForTimeout(200);
  sharedLink = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(sharedLink, /\/c\/[A-Za-z0-9_-]+$/);
  await page.getByRole('button', { name: 'Compare with others' }).click();
  await page.waitForSelector('.panel >> text=people so far');
  await shot(page, '03-summary');
  // Unlock (preview) and check actions appear on every suggestion, and the report renders.
  await page.locator('.unlock-row .btn').first().click(); await page.locator('.modal .btn').first().click(); await page.waitForTimeout(500);
  assert.ok(await page.locator('.reclaim-list li.locked').count() === 0);
  await page.getByRole('button', { name: 'Open full report' }).click();
  await page.waitForSelector('.report .reclaim-list');
  await shot(page, '04-report');
  await c.close();
});

await scenario('shared link opens the card, then compares after making yours', async () => {
  assert.ok(sharedLink, 'needs the link from the previous scenario');
  const { c, page } = await ctx('friend');
  await page.goto(sharedLink);
  await page.waitForSelector('.shared canvas');
  assert.match(await page.locator('.shared .caption').first().textContent(), /Alex shared their year/);
  await shot(page, '05-shared', false);
  await page.getByRole('button', { name: /Make yours and compare/ }).click();
  await page.locator('.hero [data-action="demo"]').click();
  await page.waitForSelector('.prep .group');
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  await throughStory(page);
  await page.waitForSelector('text=You and Alex');
  await page.getByRole('button', { name: 'Copy comparison link' }).click(); await page.waitForTimeout(200);
  const cmp = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(cmp); await page.waitForSelector('.compare-cards canvas');
  await page.waitForTimeout(600);
  await shot(page, '06-compare');
  await c.close();
});

await scenario('personal demo in Dutch: locale, currency, keywords and visuals', async () => {
  const { c, page } = await ctx('nl', { locale: 'nl-NL', colorScheme: 'dark', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}?demo=personal&lang=nl`);
  await page.waitForFunction(() => document.documentElement.lang === 'nl', null, { timeout: 5000 });
  await page.locator('.hero [data-action="demo"]').click();
  await page.waitForSelector('.prep .group');
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  const total = await page.locator('.story-progress i').count();
  for (let i = 0; i < total - 1; i++) { await page.waitForTimeout(150); if (SHOTS && i === 2) { await page.waitForTimeout(1200); await shot(page, '07-nl-slide', false); } await page.mouse.click(300, 420); }
  await page.waitForTimeout(400);
  await page.locator('.slide.is-current .slide-cta .btn').click();
  await page.waitForSelector('.summary canvas');
  const unlock = await page.locator('.unlock-row .btn').first().textContent();
  assert.match(unlock, /€\s?5/, `price in euros, got "${unlock}"`);
  await shot(page, '08-nl-summary');
  await c.close();
});

await scenario('team: build, unlock monthly plan, quarters, survives reload', async () => {
  const { c, page } = await ctx('team');
  await page.goto(BASE);
  await page.locator('[data-action="team"]').first().click();
  await page.getByRole('button', { name: 'Or use a sample team' }).click();
  await page.waitForSelector('.team-setup .member >> nth=3');
  await page.getByRole('button', { name: 'Build team report' }).click();
  await page.waitForSelector('.team-report .lever');
  assert.match(await page.locator('.unlock-panel .btn').textContent(), /a month/);
  await page.locator('.unlock-panel .btn').click(); await page.locator('.modal .btn').first().click(); await page.waitForTimeout(600);
  assert.equal(await page.locator('.quarters .q').count(), 4);
  assert.ok(await page.locator('.team-report .viz-bubbles').count() === 1);
  await shot(page, '09-team');
  await page.reload(); await page.waitForSelector('.team-report');
  await c.close();
});

await scenario('Google sign-in (mocked): token used, then revoked', async () => {
  const { c, page } = await ctx('google');
  await page.route('**/js/config.js', async (r) => r.fulfill({ contentType: 'text/javascript', body: readFileSync(join(ROOT, 'js/config.js'), 'utf8').replace("google: {\n    clientId: ''", "google: {\n    clientId: 'test.apps.googleusercontent.com'") }));
  let revoked = false;
  await page.exposeFunction('__revoked', () => { revoked = true; });
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.google={accounts:{oauth2:{initTokenClient:(o)=>({requestAccessToken:()=>setTimeout(()=>o.callback({access_token:"tok-g"}),30)}),revoke:(t,cb)=>{window.__revoked();cb&&cb()}}}};' }));
  let auth = '';
  await page.route('https://www.googleapis.com/calendar/v3/**', (r) => { auth = r.request().headers().authorization; r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(join(ROOT, 'tests/fixtures/google-events.json'), 'utf8') }); });
  await page.goto(BASE);
  await page.locator('#google-connect').click();
  await page.waitForSelector('.prep .group', { timeout: 15000 });
  assert.equal(auth, 'Bearer tok-g');
  assert.ok(revoked);
  await c.close();
});

await scenario('Microsoft sign-in (mocked): PKCE popup, Graph, work calendar', async () => {
  const { c, page } = await ctx('microsoft');
  await page.route('**/js/config.js', async (r) => r.fulfill({ contentType: 'text/javascript', body: readFileSync(join(ROOT, 'js/config.js'), 'utf8').replace("microsoft: {\n    clientId: ''", "microsoft: {\n    clientId: '00000000-test'") }));
  let verifierSent = false;
  await c.route('https://login.microsoftonline.com/**/authorize**', (r) => {
    const u = new URL(r.request().url());
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    r.fulfill({ status: 302, headers: { location: `${BASE}auth-callback.html?code=abc123&state=${u.searchParams.get('state')}` } });
  });
  await c.route('https://login.microsoftonline.com/**/token', (r) => { verifierSent = /code_verifier=/.test(r.request().postData() || ''); r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ access_token: 'tok-ms' }) }); });
  const graph = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/graph-events.json'), 'utf8'));
  await c.route('https://graph.microsoft.com/**', (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.request().url().includes('/me?') ? graph.me : { value: graph.value }) }));
  await page.goto(BASE);
  await page.locator('#microsoft-connect').click();
  await page.waitForSelector('.prep .group', { timeout: 20000 });
  assert.ok(verifierSent, 'PKCE verifier sent to the token endpoint');
  assert.equal(await page.locator('.prep .seg button[aria-pressed="true"]', { hasText: 'Work' }).count(), 1);
  await c.close();
});

await scenario('large calendar: 15,000 events parse off the main thread', async () => {
  const y = new Date().getFullYear();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Perf//EN', 'X-WR-CALNAME:perf@example.com'];
  for (let i = 0; i < 15000; i++) {
    const d = new Date(Date.UTC(y - 1, 0, 1 + Math.floor(i / 20), 8 + (i % 10)));
    const s = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const e = new Date(d.getTime() + 1800e3).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    lines.push('BEGIN:VEVENT', `UID:p${i}@x`, `SUMMARY:Meeting ${i % 40}`, `DTSTART:${s}`, `DTEND:${e}`, 'ORGANIZER:mailto:boss@example.com', 'ATTENDEE;PARTSTAT=ACCEPTED:mailto:perf@example.com', `ATTENDEE;PARTSTAT=ACCEPTED:mailto:p${i % 30}@example.com`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const file = join(tmpdir(), `cw-perf-${PORT}.ics`);
  writeFileSync(file, lines.join('\r\n'));
  const { c, page } = await ctx('perf');
  await page.goto(BASE);
  await page.evaluate(() => { window.__long = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: false }); });
  const t0 = Date.now();
  await page.setInputFiles('#file-input', file);
  await page.waitForSelector('.prep .group', { timeout: 60000 });
  const took = Date.now() - t0;
  const longest = Math.max(0, ...(await page.evaluate(() => window.__long)));
  results.push(['  ↳ load time', `${took} ms`, 0]);
  results.push(['  ↳ longest main-thread task', `${Math.round(longest)} ms`, 0]);
  assert.ok(longest < 250, `main thread blocked for ${Math.round(longest)} ms`);
  await c.close();
});

await scenario('diagnostics page: redacted report and anonymised file', async () => {
  const { c, page } = await ctx('diagnose');
  await page.goto(`${BASE}diagnose.html`);
  await page.setInputFiles('#diag-file', join(ROOT, 'sample/outlook-desktop.ics'));
  await page.waitForSelector('#diag-report');
  const report = await page.locator('#diag-report').textContent();
  assert.match(report, /outlook/i);
  assert.ok(!/Ingrid|contoso|Weekly Sync/.test(report), 'report must not leak names, domains or titles');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /anonymised/i }).click();
  const anon = readFileSync(await (await dl).path(), 'utf8');
  assert.ok(!/Ingrid|contoso|Weekly Sync|Customer call/.test(anon), 'anonymised file must not contain names, domains or titles');
  assert.match(anon, /BEGIN:VCALENDAR/);
  await shot(page, '10-diagnose');
  await c.close();
});

await browser.close();
server?.kill();
const width = Math.max(...results.map((r) => r[0].length));
for (const [name, status, ms, msg] of results) console.log(`${status === 'FAIL' ? '✗' : status === 'ok' ? '✓' : ' '} ${name.padEnd(width)}  ${status === 'ok' ? `${ms} ms` : status}${msg ? `\n    ${msg}` : ''}`);
if (errors.length) { console.log(`\nConsole errors (${errors.length}):`); for (const e of errors) console.log(`  ${e}`); }
const failed = results.filter((r) => r[1] === 'FAIL').length + (errors.length ? 1 : 0);
console.log(failed ? `\n${failed} problem(s)` : '\nAll e2e scenarios passed');
process.exit(failed ? 1 : 0);
