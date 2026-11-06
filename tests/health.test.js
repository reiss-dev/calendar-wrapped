import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats, computeTeamStats } from '../js/stats.js';
import { computeHealth } from '../js/health.js';
import { maskStats } from '../js/privacy.js';
import { cardModel, cardTiles } from '../js/model.js';

const range = { rangeStart: new Date(2026, 0, 1), rangeEnd: new Date(2027, 0, 1) };
const NOW = new Date(2026, 10, 4, 12);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const load = (p) => { const { events, meta } = parseICS(read(p), range); return { events, selfEmail: guessSelfEmail(events, meta) }; };
const stats = (p) => { const { events, selfEmail } = load(p); return computeStats(events, { ...range, selfEmail, now: NOW }); };

test('calendar health: a score out of 100, its parts, and what costs most', () => {
  const s = stats('sample/work.ics');
  const H = s.health;
  assert.ok(H.score >= 0 && H.score <= 100);
  assert.deepEqual(H.parts.map((p) => p.key), ['load', 'breathing', 'focus', 'boundaries', 'rest', 'hygiene']);
  assert.equal(H.parts.reduce((n, p) => n + p.weight, 0), 100);
  assert.equal(H.score, Math.round(H.parts.reduce((n, p) => n + p.score * p.weight, 0) / 100), 'the parts add up to the score');
  for (const k of H.drags) assert.ok(H.parts.find((p) => p.key === k).score < 70);
  assert.ok(stats('sample/personal.ics').health.parts.some((p) => p.key === 'weekends'), 'personal calendars have their own parts');
});

test('health moves the right way: more meetings, less health', () => {
  const base = stats('sample/work.ics');
  const worse = computeHealth({ ...base, shareOfWork: 70, backToBackDays: base.workingDays * 0.5, fragmentedDays: base.workingDays * 0.6 });
  const better = computeHealth({ ...base, shareOfWork: 12, noAgenda: 0 });
  assert.ok(worse.score < base.health.score && base.health.score < better.score, `${worse.score} < ${base.health.score} < ${better.score}`);
  assert.ok(worse.band > better.band);
  assert.equal(computeHealth({ ...base, meetings: 0 }), null, 'no meetings, no score');
});

test('health leads the card, survives a link and sharing', () => {
  const s = stats('sample/work.ics');
  const m = cardModel(maskStats(s, 'none'));
  assert.equal(m.n.hs, s.health.score);
  assert.equal(cardTiles(m)[0][0], `${s.health.score}/100`);
});

test('the team story holds numbers and personas, never names or titles', async () => {
  globalThis.document = { createElement: () => ({ getContext: () => null }), documentElement: { lang: 'en' } };
  try {
    const { teamFacts } = await import('../js/team-story.js');
    const team = computeTeamStats(['alex', 'priya', 'tom', 'maja'].map((n) => load(`sample/team/${n}.ics`)), { ...range, now: NOW });
    const f = teamFacts(team);
    assert.equal(f.size, 4);
    assert.ok(f.health >= 0 && f.health <= 100);
    assert.ok(f.personas.reduce((n, p) => n + p.n, 0) === 4);
    assert.ok(f.lever && f.lever.saved > 0);
    const text = JSON.stringify(f);
    for (const m of team.members) for (const part of m.name.split(' ')) assert.ok(!text.includes(part), `${part} is in the team story`);
    for (const x of team.sharedSeries) assert.ok(!text.includes(x.title), `“${x.title}” is in the team story`);
  } finally { delete globalThis.document; }
});
