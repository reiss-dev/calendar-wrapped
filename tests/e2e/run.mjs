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
  // Service workers are off by default so route mocks see every request; the offline scenario turns them on.
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block', ...opts });
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
  const keys = new Set(JSON.parse(readFileSync(join(ROOT, 'tools/i18n-keys.json'), 'utf8')));
  const missing = (await page.evaluate(() => [...document.querySelectorAll('[data-i18n]')].map((e) => e.dataset.i18nSrc))).filter((k) => !keys.has(k));
  assert.deepEqual(missing, [], 'every translatable element has a key');
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
    for (const sel of ['.viz-heatmap', '.viz-clock', '.viz-bubbles', '.viz-treemap', '.viz-picto', 'canvas.globe']) if (await cur.locator(sel).count()) seen.add(sel);
    if (await cur.locator('canvas.globe').count()) {
      await page.waitForTimeout(1500);
      const inked = await cur.locator('canvas.globe').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let k = 3; k < d.length; k += 16) if (d[k] > 0) n++; return n; });
      if (inked > 500) seen.add('globe-drawn');
      const before = await page.locator('.story-progress i.done').count();
      const box = await cur.locator('canvas.globe').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
      if ((await page.locator('.story-progress i.done').count()) === before) seen.add('globe-drag');
      if (SHOTS) { await page.waitForTimeout(3500); await shot(page, '02-slide-globe', false); }
    }
    if (await cur.locator('.cap', { hasText: 'Compared with' }).count()) seen.add('yoy');
    if (await cur.locator('.persona-emoji').count()) { await page.waitForTimeout(1100); if (await cur.locator('canvas.confetti').count()) seen.add('confetti'); if (await cur.locator('.stamp').count()) seen.add('stamp'); }
    if (SHOTS && [0, 1, 3, 6, 7, 17].includes(i)) { await page.waitForTimeout(1300); await shot(page, `02-slide-${String(i + 1).padStart(2, '0')}`, false); }
  });
  for (const k of ['.viz-heatmap', '.viz-clock', '.viz-bubbles', '.viz-treemap', '.viz-picto', 'canvas.globe', 'globe-drawn', 'globe-drag', 'yoy', 'confetti', 'stamp']) assert.ok(seen.has(k), `story should include ${k}`);
  assert.ok(total >= 18, `slides: ${total}`);
  assert.ok(await page.locator('.summary .viz-heatmap').count() === 1);
  assert.ok(await page.locator('.summary .viz-grid').count() === 1);
  assert.ok(await page.locator('.travel-panel canvas.globe').count() === 1, 'summary has the flights globe');
  const first = page.locator('.reclaim-list li').first();
  assert.ok(!(await first.getAttribute('class'))?.includes('locked'));
  assert.ok(await first.locator('.actions a[href^="mailto:"]').count() === 1, 'featured suggestion has an email action');
  assert.ok(await page.locator('.reclaim-list li.locked .actions').count() === 0, 'no actions on locked items');
  for (const f of ['Square', 'Story', 'Wide', 'Portrait']) { await page.locator('.card-controls button', { hasText: f }).click(); await page.waitForTimeout(150); }
  await page.locator('.who').fill('Alex');
  await page.getByRole('button', { name: 'Copy link' }).click(); await page.waitForTimeout(200);
  sharedLink = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(sharedLink, /\/c\/[A-Za-z0-9_-]+(\?r=[a-z0-9]{10,24})?$/);
  await page.getByRole('button', { name: 'Compare with others' }).click();
  await page.waitForSelector('.panel >> text=people so far');
  await shot(page, '03-summary');
  // Unlock (preview) and check actions appear on every suggestion, and the report renders.
  await page.locator('.unlock-row .btn').first().click(); await page.locator('.modal .btn').first().click(); await page.waitForTimeout(500);
  assert.ok(await page.locator('.reclaim-list li.locked').count() === 0);
  await page.getByRole('button', { name: 'Open full report' }).click();
  await page.waitForSelector('.report .reclaim-list');
  await shot(page, '04-report');
  assert.ok(await page.locator('.report-cover').isHidden(), 'the cover is for paper only');
  await page.emulateMedia({ media: 'print' });
  assert.ok(await page.locator('.report-cover').isVisible(), 'printing starts with the cover');
  assert.ok(await page.locator('.report .awards .award').count() >= 3, 'awards in the report');
  assert.equal(await page.locator('.report .mix').count(), 2, 'who you met with, and where, in the report');
  await page.emulateMedia({ media: 'screen' });
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
  assert.notEqual(await page.locator('.hero h1').textContent(), 'Your year,in meetings.', 'landing is translated');
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
  // The team story: numbers and personas, never names.
  await page.click('#team-story');
  await page.waitForSelector('.slide.is-current');
  const teamCaps = [];
  const teamText = [];
  const n = await page.locator('.story-progress i').count();
  for (let i = 0; i < n - 1; i++) { await page.waitForTimeout(150); teamCaps.push(await page.locator('.slide.is-current .cap').first().textContent().catch(() => '')); teamText.push(await page.locator('.slide.is-current').textContent()); await page.mouse.click(1000, 430); }
  assert.ok(teamCaps.includes('Team health') && teamCaps.includes('The team, by persona'), teamCaps.join(' | '));
  assert.ok(!/Priya|Tom |Maja|Alex/.test(teamText.join(' ')), 'no names in the team story');
  await page.waitForTimeout(400);
  await page.locator('.slide.is-current .slide-cta .btn').click();
  await page.waitForSelector('.team-report .lever');
  await page.click('#team-carousel');
  await page.waitForSelector('#carousel-save', { timeout: 20000 });
  assert.ok(await page.locator('.carousel-page').count() >= 7);
  await page.keyboard.press('Escape');
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

await scenario('time off, next year’s planner and birthdays: slides, panels, calendar file', async () => {
  const { c, page } = await ctx('timeoff');
  await playDemo(page);
  const caps = [];
  await throughStory(page, async () => { caps.push(await page.locator('.slide.is-current .cap').first().textContent().catch(() => '')); });
  for (const cap of ['Time off', 'Birthdays', 'Your smartest days off in']) assert.ok(caps.some((x) => x.startsWith(cap)), `story has “${cap}”`);
  const panel = page.locator('.timeoff-panel');
  await panel.scrollIntoViewIfNeeded();
  assert.equal(await panel.locator('.viz-leave .lv.on').count(), 14, '14 days of leave drawn');
  assert.equal(await panel.locator('.viz-leave .lv.booked').count(), 6, '6 booked');
  assert.ok(await panel.locator('.plan-row').count() >= 3);
  const dl = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Add to calendar' }).first().click();
  const ics = readFileSync(await (await dl).path(), 'utf8');
  assert.match(ics, /DTSTART;VALUE=DATE:\d{8}/);
  assert.match(ics, /BUSYSTATUS:OOF/);
  assert.ok(await page.locator('.panel .viz-bday .bd').count() === 5, 'five team birthdays on the wheel');
  assert.match(await page.locator('.upcoming li').first().textContent(), /Daniel · 40/);
  await shot(page, '14-timeoff', true);
  await c.close();
});

await scenario('public holidays: country picker defaults from the calendar, changes the plan, is remembered', async () => {
  const { c, page } = await ctx('country');
  await page.goto(BASE);
  await page.locator('.hero [data-action="demo"]').click();
  await page.waitForSelector('.prep .group', { timeout: 20000 });
  assert.equal(await page.locator('#country').inputValue(), 'GB', 'demo calendar is Europe/London');
  assert.equal(await page.locator('#country option').count(), 11);
  await page.locator('#country').selectOption('GB-SCT');
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.timeoff-panel');
  assert.match(await page.locator('.timeoff-panel').textContent(), /public holidays in Scotland/);
  await page.goto(BASE);
  await page.locator('.hero [data-action="demo"]').click();
  await page.waitForSelector('.prep .group', { timeout: 20000 });
  assert.equal(await page.locator('#country').inputValue(), 'GB-SCT', 'the choice is remembered');
  await shot(page, '15-prep-country', false);
  await c.close();
});

await scenario('things the calendar missed: time off, a trip and a moment feed the story', async () => {
  const { c, page } = await ctx('extras');
  await page.goto(BASE);
  await page.locator('.hero [data-action="demo"]').click();
  await page.waitForSelector('.prep .extras', { timeout: 20000 });
  await page.locator('.chip-add', { hasText: 'Time off' }).click();
  await page.fill('#extra-from', '2026-02-16'); await page.fill('#extra-to', '2026-02-20'); await page.fill('#extra-label', 'Half term');
  await page.locator('.extra-form button[type=submit]').click();
  await page.locator('.chip-add', { hasText: 'Trip' }).click();
  await page.fill('#extra-city', 'Atlantis'); await page.fill('#extra-from', '2026-06-01'); await page.fill('#extra-to', '2026-06-05');
  await page.locator('.extra-form button[type=submit]').click();
  assert.match(await page.locator('.field-error').textContent(), /don’t know that place/);
  await page.fill('#extra-city', 'lisb');
  await page.locator('.suggest button', { hasText: 'Lisbon' }).click();
  await page.locator('.extra-form button[type=submit]').click();
  await page.locator('.chip-add', { hasText: 'Moment' }).click();
  await page.fill('#extra-moment', 'Promoted to team lead');
  await page.selectOption('#extra-month', '2');
  await page.locator('.extra-form button[type=submit]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.extras-list li').count(), 3);
  await shot(page, '16-extras', false);
  const caps = [];
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  await throughStory(page, async () => { caps.push(await page.locator('.slide.is-current .cap').first().textContent().catch(() => '')); });
  assert.ok(caps.includes('Highlights'), 'story has a highlights slide');
  const s = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('cw:stats')).v));
  assert.equal(s.timeOff.taken, 19, '14 from the calendar and 5 added');
  assert.ok(s.travel.routes.legs.some((l) => l.to.name === 'Lisbon'), 'Lisbon is on the globe');
  assert.equal(s.moments[0].title, 'Promoted to team lead');
  const panel = page.locator('.highlights-panel');
  await panel.scrollIntoViewIfNeeded();
  assert.match(await panel.textContent(), /Promoted to team lead/);
  await panel.getByRole('button', { name: 'Remove Promoted to team lead' }).click();
  assert.doesNotMatch(await panel.textContent(), /Promoted to team lead/);
  await c.close();
});

await scenario('security headers: the browser is told where it may connect', async () => {
  const { c, page } = await ctx('headers');
  const res = await page.goto(BASE);
  const csp = res.headers()['content-security-policy'] || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/www\.googleapis\.com/);
  assert.equal(res.headers()['referrer-policy'], 'no-referrer');
  assert.equal(res.headers()['x-frame-options'], 'DENY');
  // A script trying to send data elsewhere is stopped by the browser.
  const blocked = await page.evaluate(async () => { try { await fetch('https://example.com/collect', { method: 'POST', body: 'x' }); return false; } catch { return true; } });
  assert.ok(blocked, 'requests to other sites are refused');
  errors.splice(0, errors.length, ...errors.filter((e) => !/\[headers\]/.test(e))); // that refusal is logged on purpose
  await c.close();
});

await scenario('private mode: results live only in this tab, start over clears them', async () => {
  const { c, page } = await ctx('private');
  await page.goto(BASE);
  await page.locator('.hero [data-action="demo"]').click();
  await page.waitForSelector('.prep .group', { timeout: 20000 });
  await page.locator('.switch:has(#remember)').click();
  assert.equal(await page.locator('#remember').isChecked(), false);
  assert.match(await page.locator('.prep .keep-note').textContent(), /disappear when you close this tab/);
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.summary canvas');
  const where = await page.evaluate(() => ({ local: localStorage.getItem('cw:stats'), session: sessionStorage.getItem('cw:stats') }));
  assert.equal(where.local, null, 'nothing kept in the browser');
  assert.ok(where.session, 'kept for this tab');
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.waitForSelector('.hero');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('cw:stats') || localStorage.getItem('cw:stats')), null);
  await c.close();
});

await scenario('works offline after one visit: no network, full story from a file', async () => {
  const { c, page } = await ctx('offline', { serviceWorkers: 'allow' });
  await page.goto(BASE);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  // Let the worker finish caching every file, then cut the network.
  await page.waitForFunction(async () => { const keys = await caches.keys(); if (!keys.length) return false; const c = await caches.open(keys[0]); return (await c.keys()).length >= 50; }, null, { timeout: 30000 });
  await c.setOffline(true);
  const sent = [];
  page.on('requestfailed', (r) => sent.push(r.url()));
  await page.reload();
  await page.setInputFiles('#file-input', join(ROOT, 'sample/work.ics'));
  await page.waitForSelector('.prep .btn-lg', { timeout: 20000 });
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.summary canvas');
  assert.ok(await page.locator('.summary .travel-panel canvas.globe').count() === 1, 'even the flights globe works offline');
  await c.setOffline(false);
  errors.splice(0, errors.length, ...errors.filter((e) => !/\[offline\]/.test(e) || !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/.test(e)));
  await c.close();
});

await scenario('Google’s export zip, dropped as it comes: main calendar plus birthdays', async () => {
  const { c, page } = await ctx('zip');
  await page.goto(BASE);
  assert.match(await page.locator('#export [data-panel="google"] a.export-go').getAttribute('href'), /calendar\.google\.com\/calendar\/u\/0\/r\/settings\/export/);
  await page.setInputFiles('#file-input', join(ROOT, 'tests/fixtures/google-export.zip'));
  await page.waitForSelector('.prep .btn-lg', { timeout: 20000 });
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.summary canvas');
  const s = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('cw:stats')).v));
  assert.equal(s.mode, 'work');
  assert.ok(s.meetings > 400, 'the main calendar was read');
  assert.ok(s.birthdayInfo.list.some((b) => b.name === 'Freya Nilsson'), 'birthdays calendar was added');
  // Something that isn't a calendar gets a clear message, not a crash.
  await page.goto(BASE);
  await page.setInputFiles('#file-input', { name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not really a zip') });
  await page.waitForSelector('.prep-error');
  assert.match(await page.locator('.prep-error').textContent(), /Google’s export/);
  errors.splice(0, errors.length, ...errors.filter((e) => !(/\[zip\]/.test(e) && /not_a_zip/.test(e)))); // logged on purpose
  await c.close();
});

await scenario('on a phone: the guide leads with sending the link to a computer', async () => {
  const { c, page } = await ctx('phone', { ...pw.devices['iPhone 14'] });
  await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) }).catch(() => {});
  await page.goto(BASE);
  await page.waitForSelector('#handoff:not([hidden])');
  await shot(page, '17-phone-handoff', false);
  await page.locator('#handoff-send').click();
  await page.waitForTimeout(300);
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (copied) assert.equal(copied, BASE);
  await c.close();
  // Not on a computer.
  const desk = await ctx('desk');
  await desk.page.goto(BASE);
  assert.ok(await desk.page.locator('#handoff').isHidden());
  await desk.c.close();
});

await scenario('work and personal calendars together, then leaving things out', async () => {
  const { c, page } = await ctx('combine');
  await page.goto(BASE);
  await page.setInputFiles('#file-input', [join(ROOT, 'sample/work.ics'), join(ROOT, 'sample/personal.ics')]);
  await page.locator('#yt-mine').click();
  await page.waitForSelector('.prep .cals .cal-row >> nth=1', { timeout: 20000 });
  const roles = await page.locator('.cal-row .seg button[aria-pressed="true"]').allTextContents();
  assert.deepEqual(roles, ['Work', 'Personal']);
  await shot(page, '18-two-calendars', false);
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  const caps = [];
  await throughStory(page, async () => { caps.push(await page.locator('.slide.is-current .cap').first().textContent().catch(() => '')); });
  assert.ok(caps.includes('Work and life'), 'the work-and-life page appears');
  const before = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('cw:stats')).v));
  assert.ok(before.balance.lifeHours > 0 && before.travel.routes.legs.some((l) => l.to.name === 'Lisbon'));
  const panel = page.locator('.leave-out-panel');
  await panel.scrollIntoViewIfNeeded();
  await panel.locator('.lo-item', { hasText: 'Daily standup' }).locator('input').uncheck();
  await panel.getByRole('button', { name: 'Update my Wrapped' }).click();
  await page.waitForFunction((m) => JSON.parse(JSON.parse(localStorage.getItem('cw:stats')).v).meetings < m - 150, before.meetings);
  await page.waitForSelector('.leave-out-panel');
  assert.equal(await page.locator('.leave-out-panel .lo-item', { hasText: 'Daily standup' }).locator('input').isChecked(), false, 'stays left out');
  await c.close();
});

await scenario('meeting types and hiding customers: groups recalculate, shared things leave customers out', async () => {
  const { c, page } = await ctx('customers');
  await playDemo(page);
  const caps = [];
  await throughStory(page, async () => { caps.push(await page.locator('.slide.is-current .cap').first().textContent().catch(() => '')); });
  assert.ok(caps.includes('Who you met with'), 'the meeting-mix page appears');
  assert.ok(caps.includes('Awards'), 'the awards page appears');
  assert.ok(caps.includes('Where you met'), 'the where-you-met page appears');
  assert.ok(caps.includes('Calendar health'), 'the health page appears');
  assert.match(await page.locator('.health-panel h3').textContent(), /^Calendar health: /);
  assert.ok(await page.locator('.where-panel .mixbar i').count() === 3, 'online, office and on site on the summary');
  assert.ok(await page.locator('.awards-panel .award').count() >= 3, 'awards on the summary');
  const panel = page.locator('.mix-panel');
  await panel.scrollIntoViewIfNeeded();
  assert.ok(await panel.locator('.race-label', { hasText: 'Acme Customer' }).count() === 1, 'top customers listed');
  await page.fill('#grp-name', 'Deals'); await page.fill('#grp-match', 'deal review, pricing');
  await page.click('#grp-add');
  await page.waitForFunction(() => JSON.parse(JSON.parse(localStorage.getItem('cw:stats')).v).mix.types.some((x) => x.name === 'Deals'));
  await page.waitForSelector('.mix-panel .grp-row');
  await shot(page, '19-meeting-mix', false);
  const decode = (link) => JSON.parse(Buffer.from(link.split('/c/')[1].split('?')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  await page.getByRole('button', { name: 'Names and titles' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click(); await page.waitForTimeout(200);
  const all = decode(await page.evaluate(() => navigator.clipboard.readText()));
  assert.ok(all.n.pn && all.n.tt, 'names and titles when asked for');
  await page.getByRole('button', { name: 'Hide customers' }).click();
  await page.fill('#share-hide', 'Daily standup'); await page.locator('#share-hide').blur();
  await page.getByRole('button', { name: 'Copy link' }).click(); await page.waitForTimeout(200);
  const hidden = decode(await page.evaluate(() => navigator.clipboard.readText()));
  assert.ok(!/Acme|Contoso|Kate|Oliver|standup/i.test(JSON.stringify(hidden)), JSON.stringify(hidden.n));
  assert.ok(hidden.n.pn, 'a colleague is still named');
  await page.getByRole('button', { name: 'No names' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click(); await page.waitForTimeout(200);
  const none = decode(await page.evaluate(() => navigator.clipboard.readText()));
  assert.ok(!none.n.pn && !none.n.tt, 'no names at all');
  await page.locator('.card-custom summary').click();
  await page.locator('.swatch').nth(2).click();
  await page.locator('.tile-chip[data-tile="b"]').click();
  await page.locator('.tile-chip[data-tile="cs"]').click();
  await page.getByRole('button', { name: 'Copy link' }).click(); await page.waitForTimeout(200);
  const custom = decode(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(custom.th, 'black');
  assert.equal(custom.k?.[custom.k.length - 1], 'cs', 'the customer tile goes on the card, last');
  assert.ok(!custom.k.includes('b') && custom.k[0] === 'hs', 'health stays first');
  await c.close();
});

await scenario('does this look right: odd numbers flagged, fixed in one tap', async () => {
  const { oddCalendar } = await import('../fixtures/odd.mjs');
  const file = join(tmpdir(), `odd-${Date.now()}.ics`);
  writeFileSync(file, oddCalendar(new Date().getFullYear()));
  const { c, page } = await ctx('checks');
  await page.goto(BASE);
  await page.setInputFiles('#file-input', file);
  await page.waitForSelector('.prep .group', { timeout: 20000 });
  await page.locator('.prep .btn-lg').click();
  await page.waitForSelector('.slide.is-current');
  await throughStory(page);
  const panel = page.locator('.checks-panel');
  await panel.waitFor();
  assert.ok(await panel.locator('[data-check="leave"]').count() === 1);
  assert.ok(await panel.locator('[data-check="notmine"]').count() === 1);
  await shot(page, '20-checks', false);
  await panel.locator('.lo-item', { hasText: 'OOO conference season' }).locator('input').uncheck();
  await panel.locator('#ck-notmine').check();
  await panel.getByRole('button', { name: 'Update my Wrapped' }).click();
  await page.waitForFunction(() => JSON.parse(JSON.parse(localStorage.getItem('cw:stats')).v).checks.length === 0);
  await page.waitForSelector('.summary canvas');
  assert.equal(await page.locator('.checks-panel').count(), 0, 'nothing left to flag');
  await c.close();
});

await scenario('LinkedIn carousel: a PDF of the year, made on the device, names left out', async () => {
  const { c, page } = await ctx('carousel');
  await playDemo(page);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.summary canvas');
  await page.click('#carousel-open');
  await page.waitForSelector('#carousel-save', { timeout: 20000 });
  const pages = await page.locator('.carousel-page').count();
  assert.ok(pages >= 7, `pages: ${pages}`);
  const dl = page.waitForEvent('download');
  await page.click('#carousel-save');
  const file = join(tmpdir(), `carousel-${Date.now()}.pdf`);
  await (await dl).saveAs(file);
  const pdf = readFileSync(file, 'latin1');
  assert.ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'));
  assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, pages);
  await shot(page, '21-carousel', false);
  await c.close();
});

await scenario('story video: renders a 9:16 video on the device, then saves it', async () => {
  const { c, page } = await ctx('video');
  await playDemo(page);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.summary .btn-video');
  await page.locator('.summary .btn-video').click();
  await page.waitForSelector('.modal-video .video-meter');
  await page.waitForTimeout(1500);
  await shot(page, '11-video-making', false);
  await page.waitForSelector('.modal-root[data-ready]', { timeout: 120000 });
  const type = await page.locator('.modal-root').getAttribute('data-ready');
  const size = Number(await page.locator('.modal-root').getAttribute('data-size'));
  assert.match(type, /^video\/(mp4|webm)/);
  assert.ok(size > 500_000, `video is ${size} bytes`);
  assert.ok(await page.locator('.modal-video video').count() === 1);
  await page.waitForTimeout(600);
  await shot(page, '12-video-ready', false);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save video' }).click();
  const d = await dl;
  assert.match(d.suggestedFilename(), /^calendar-wrapped-\d{4}\.(mp4|webm)$/);
  const audio = await page.locator('.modal-root').getAttribute('data-audio');
  const can = await page.evaluate(async () => typeof AudioEncoder === 'function' && (await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported);
  if (can) assert.equal(audio, 'true', 'the video has music where the browser can encode audio');
  if (process.env.SHOTS) await d.saveAs(join(process.env.SHOTS, `video.${d.suggestedFilename().split('.').pop()}`));
  assert.ok(await page.locator('#video-music').count() === 1, 'music can be turned off');
  await c.close();
});

await scenario('unlock by sharing: three friends make theirs from the invite link', async () => {
  const { c, page } = await ctx('inviter');
  await playDemo(page);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#share-unlock:not([hidden])');
  assert.equal(await page.locator('.pips i.on').count(), 0);
  await page.locator('#share-unlock').getByRole('button', { name: 'Copy my invite link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(link, /\/c\/[A-Za-z0-9_-]+\?r=[a-z0-9]{10,24}$/, 'invite id rides on the card link');
  // Opening the unlock sheet offers the free route too.
  await page.locator('.unlock-row .btn').first().click();
  await page.getByRole('button', { name: 'Or unlock it free by sharing' }).click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 3; i++) {
    const f = await ctx(`friend${i}`);
    await f.page.goto(link);
    await f.page.waitForSelector('.shared canvas');
    assert.ok(!f.page.url().includes('?r='), 'the invite id is tidied out of the address bar');
    await f.page.goto(BASE);
    await f.page.setInputFiles('#file-input', join(ROOT, 'sample/work.ics'));
    await f.page.waitForSelector('.prep .btn-lg', { timeout: 20000 });
    await f.page.locator('.prep .btn-lg').click();
    await f.page.waitForSelector('.slide.is-current');
    await f.page.keyboard.press('Escape');
    await f.page.waitForSelector('.summary canvas');
    await f.page.waitForFunction(() => localStorage.getItem('cw:credited'));
    await f.c.close();
    if (i === 1) {
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForFunction(() => document.querySelectorAll('.pips i.on').length === 2);
      await page.locator('#share-unlock').scrollIntoViewIfNeeded();
      await shot(page, '13-share-unlock', false);
    }
  }
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('cw:unlock') || '{}').referral === true);
  await page.waitForSelector('.summary');
  assert.equal(await page.locator('#share-unlock').count(), 0, 'the free route disappears once earned');
  assert.ok(await page.getByRole('button', { name: 'Open full report' }).isVisible());
  // A demo never credits anyone.
  const d = await ctx('demo-friend');
  await d.page.goto(link);
  await d.page.waitForSelector('.shared canvas');
  await playDemo(d.page);
  await d.page.keyboard.press('Escape');
  await d.page.waitForSelector('.summary canvas');
  await d.page.waitForTimeout(400);
  assert.equal(await d.page.evaluate(() => localStorage.getItem('cw:credited')), null);
  await d.c.close();
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
