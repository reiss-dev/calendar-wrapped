import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats, computeTeamStats } from '../js/stats.js';
import { googleToEvents } from '../js/google.js';
import { cardModel, sanitizeModel } from '../js/card.js';
import { encodeModel, decodeModel, readSharedFromHash } from '../js/share.js';
import { planText } from '../js/plan.js';

const Y = 2026;
const range = { rangeStart: new Date(Y, 0, 1), rangeEnd: new Date(Y + 1, 0, 1) };
const NOW = new Date(Y, 10, 4, 12);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stats = (file, opts = {}) => {
  const { events, meta } = parseICS(read(file), range);
  return { events, meta, s: computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta), now: NOW, ...opts }) };
};

// ---------------------------------------------------------------- Outlook
test('Outlook web publish: no attendees, Windows timezone, cancelled prefix, busy status', () => {
  const { events, meta, s } = stats('sample/outlook-web.ics', { mode: 'work' });
  assert.equal(meta.source, 'outlook');
  assert.equal(s.attendeeInfoAvailable, false);
  const sync = events.filter((e) => e.title === 'Weekly Sync');
  const july = sync.find((e) => e.start.getMonth() === 6);
  assert.equal(july.start.getUTCHours(), 13, 'GMT Standard Time resolves to BST in July');
  assert.ok(!sync.some((e) => e.start.getMonth() === 3 && e.start.getDate() === 7), 'EXDATE removed');
  assert.ok(events.some((e) => e.status === 'CANCELLED' && !/^Cancel/i.test(e.title)), 'Canceled: prefix becomes status');
  assert.ok(events.filter((e) => e.title === 'Lunch').every((e) => e.transparent), 'BUSYSTATUS FREE is transparent');
  assert.ok(events.some((e) => e.title === 'Annual leave' && e.allDay), 'ALLDAYEVENT flag honoured');
  assert.equal(s.travel.daysOff, 5);
  assert.ok(s.meetings > 100);
});

test('Outlook desktop export: attendees, quoted CNs, owner detection', () => {
  const { s } = stats('sample/outlook-desktop.ics');
  assert.equal(s.mode, 'work');
  assert.equal(s.attendeeInfoAvailable, true);
  assert.equal(s.collaborators[0].name, 'Ingrid Olsen');
  assert.ok(s.collaborators.every((c) => !c.email.startsWith('sam.patel')));
});

// ---------------------------------------------------------------- Edge cases
test('edge cases: conference, room hold, broadcast, duplicates, EXDATE, working location, cancelled', () => {
  const { events, s } = stats('tests/fixtures/edge.ics', { mode: 'work', selfEmail: 'me@example.com' });
  assert.equal(events.filter((e) => e.uid === 'dup').length, 1, 'duplicate occurrence dropped');
  assert.equal(events.filter((e) => e.uid === 'exd').length, 4, 'EXDATEs applied');
  const titles = new Map(s.topTitles.map((t) => [t.key, t.count]));
  assert.ok(!titles.has('Industry conference'), 'multi-day timed event is not a meeting');
  assert.ok(!titles.has('Room hold'), 'room-only booking is not a meeting');
  assert.ok(!titles.has('Board prep'), 'cancelled meeting excluded');
  assert.equal(titles.get('All hands'), 4, 'broadcasts still count as meetings');
  assert.equal(s.collaborators[0].name, 'Bob Stone', 'broadcast attendees do not swamp collaborators');
  assert.equal(s.uniquePeople, 1);
  const personal = computeStats(events, { ...range, mode: 'personal', selfEmail: 'me@example.com', now: NOW });
  assert.ok(!personal.topTitles.some((t) => t.key === 'Home' || t.key === 'Office'), 'working location ignored');
});

// ---------------------------------------------------------------- Featured suggestion
test('the free suggestion names a specific meeting', () => {
  const { s } = stats('sample/work.ics');
  const f = s.reclaim.suggestions[s.reclaim.featured];
  assert.ok(['cadence', 'async', 'focus', 'shorten'].includes(f.kind), `featured was ${f.kind}`);
  assert.match(f.title, /“|"/);
  const p = stats('sample/personal.ics').s;
  assert.ok(p.reclaim.featured >= 0);
});

// ---------------------------------------------------------------- Team
test('team stats find shared series and the biggest lever', () => {
  const members = ['alex', 'priya', 'tom', 'maja'].map((n) => {
    const { events, meta } = parseICS(read(`sample/team/${n}.ics`), range);
    return { events, selfEmail: guessSelfEmail(events, meta), label: n };
  });
  const t = computeTeamStats(members, { ...range, now: NOW });
  assert.equal(t.size, 4);
  assert.deepEqual(t.members.map((m) => m.name).sort(), ['Alex Morgan', 'Maja Lindqvist', 'Priya Shah', 'Tom Hendricks']);
  const standup = t.sharedSeries.find((x) => x.title === 'Daily standup');
  assert.equal(standup.members.length, 4);
  const planning = t.sharedSeries.find((x) => x.title === 'Sprint planning');
  assert.equal(planning.members.length, 3);
  assert.ok(!t.sharedSeries.some((x) => /1:1/.test(x.title) && x.members.length < 2));
  assert.ok(t.lever && t.lever.savedPerYear > 0);
  assert.equal(t.lever.title, t.sharedSeries[0].title);
  assert.ok(t.sharedShare > 0 && t.sharedShare <= 100);
  assert.equal(t.monthly.length, 12);
  assert.ok(t.mostLoaded.share >= t.leastLoaded.share);
});

// ---------------------------------------------------------------- Google
test('Google Calendar API events convert to the internal shape', () => {
  const data = JSON.parse(read('tests/fixtures/google-events.json'));
  const { events, meta } = googleToEvents(data, range);
  assert.equal(meta.source, 'google');
  assert.equal(meta.calendarEmail, 'alex.morgan@northwindlabs.com');
  assert.ok(!events.some((e) => e.title === 'Home'), 'working location skipped');
  const weekly = events.filter((e) => e.title === 'Weekly Sync');
  assert.equal(weekly.length, 10);
  assert.ok(weekly.every((e) => e.isRecurring && e.uid === 'weekly'));
  assert.ok(weekly[0].attendees.some((a) => a.isResource));
  const ooo = events.find((e) => e.title === 'Out of office');
  assert.ok(ooo.allDay);
  const s = computeStats(events, { ...range, selfEmail: meta.calendarEmail, mode: 'work', now: NOW });
  assert.equal(s.meetings, 10, 'declined, focus time and cancelled are not meetings');
  assert.equal(s.declined, 1);
  assert.equal(s.travel.daysOff, 5);
  assert.equal(s.collaborators[0].name, 'Priya Shah');
});

// ---------------------------------------------------------------- Share links
test('card model hides names by default and round-trips through a link', () => {
  const { s } = stats('sample/work.ics');
  const hidden = cardModel(s);
  const flat = JSON.stringify(hidden);
  assert.ok(!flat.includes('Priya') && !flat.includes('standup'), 'no names or titles when hidden');
  const shown = cardModel(s, { hideNames: false });
  assert.ok(JSON.stringify(shown).includes('Priya'));
  const token = encodeModel(hidden);
  assert.ok(token.length < 700, `link token is ${token.length} chars`);
  assert.deepEqual(decodeModel(token), hidden);
  assert.deepEqual(readSharedFromHash(`#c=${token}`), hidden);
  assert.equal(readSharedFromHash('#summary'), null);
});

test('decoded models are validated and clipped', () => {
  assert.equal(decodeModel('not-base64!!'), null);
  assert.equal(sanitizeModel({ v: 2 }), null);
  const evil = { v: 1, m: 'w', y: 2026, e: '🔥🔥🔥🔥', n: 'x'.repeat(500), t: Array(6).fill(['<img src=x onerror=alert(1)>'.repeat(5), 'y']), mo: Array(12).fill(999), hi: 40 };
  const s = sanitizeModel(evil);
  assert.equal(s.n.length, 40);
  assert.ok(s.t.every(([a]) => a.length <= 28));
  assert.ok(s.mo.every((v) => v === 100));
  assert.equal(s.hi, 11);
  assert.equal([...s.e].length, 2);
});

test('plan text lists every suggestion', () => {
  const { s } = stats('sample/work.ics');
  const text = planText(s);
  assert.ok(text.includes(`${s.reclaim.suggestions.length}. `));
  assert.match(text, /hours a year back/);
});

test('mode detection without attendee data', () => {
  const work = parseICS(read('sample/outlook-web.ics'), range);
  assert.equal(computeStats(work.events, { ...range, now: NOW }).mode, 'work', 'Outlook web publish is a work calendar');
  const stripped = read('sample/personal.ics').split('\r\n').filter((l) => !/^(ATTENDEE|ORGANIZER)/.test(l)).join('\r\n');
  const personal = parseICS(stripped, range);
  assert.equal(computeStats(personal.events, { ...range, now: NOW }).mode, 'personal', 'personal calendar without attendees stays personal');
});
