import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats, computeTeamStats, yearOverYear, yoyChange, benchmarkBuckets, percentileFrom, _internal } from '../js/stats.js';
import { useDictionary } from '../js/i18n.js';
import { persona as renderPersona, suggestion as renderSuggestion } from '../js/copy.js';
import { googleToEvents } from '../js/google.js';
import { cardModel, sanitizeModel, cardTiles, comparison, modelPersona } from '../js/model.js';
import { encodeModel, decodeModel, readShared, shareUrl, compareUrl } from '../js/share.js';
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
  assert.equal(s.travel.daysOff, 4, '6–10 April, less Easter Monday');
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
  assert.equal(s.travel.daysOff, 4, '6–10 April, less Easter Monday');
  assert.equal(s.collaborators[0].name, 'Priya Shah');
});

// ---------------------------------------------------------------- Share links
test('card model hides names by default and round-trips through a link', () => {
  const { s } = stats('sample/work.ics');
  const hidden = cardModel(s);
  const flat = JSON.stringify(hidden);
  assert.ok(!flat.includes('Priya') && !flat.includes('standup'), 'no names or titles when hidden');
  const shown = cardModel(s, { hideNames: false, who: 'Alex' });
  assert.ok(JSON.stringify(shown).includes('Priya') && shown.w === 'Alex');
  const token = encodeModel(hidden);
  assert.ok(token.length < 500, `link token is ${token.length} chars`);
  assert.deepEqual(decodeModel(token), hidden);
  const loc = (href) => new URL(href);
  assert.deepEqual(readShared(loc(`https://x.app/c/${token}`)).model, hidden);
  assert.deepEqual(readShared(loc(`https://x.app/#c=${token}`)).model, hidden);
  assert.equal(readShared(loc('https://x.app/#summary')), null);
  assert.equal(shareUrl(hidden, 'https://x.app/'), `https://x.app/c/${token}`);
  const cmp = readShared(loc(compareUrl(hidden, shown, 'https://x.app/')));
  assert.equal(cmp.type, 'compare');
  const tiles = cardTiles(hidden);
  assert.equal(tiles.length, 6);
  assert.match(tiles[0][1], /calendar health/);
  assert.match(tiles[1][1], /hours in meetings/);
  assert.equal(modelPersona(hidden).name, s.persona.name);
});

test('decoded models are validated and clipped', () => {
  assert.equal(decodeModel('not-base64!!'), null);
  assert.equal(sanitizeModel({ v: 1 }), null);
  const evil = { v: 2, m: 'w', y: 2026, l: 'xx', p: '<script>', pp: { n: 'x', zzzz: 3 }, w: 'y'.repeat(99), n: { h: -5, s: 900, pn: '<img src=x onerror=alert(1)>'.repeat(3), ws: 'nope', tt: 'a'.repeat(99) }, mo: Array(12).fill(999), hi: 40 };
  const s = sanitizeModel(evil);
  assert.equal(s.l, 'en');
  assert.equal(s.p, 'balanced');
  assert.deepEqual(s.pp, { n: 0 });
  assert.equal(s.w.length, 20);
  assert.equal(s.n.h, 0);
  assert.equal(s.n.s, 100);
  assert.equal(s.n.pn.length, 24);
  assert.equal(s.n.tt.length, 26);
  assert.ok(!('ws' in s.n));
  assert.ok(s.mo.every((v) => v === 100));
  assert.equal(s.hi, 11);
});

test('two cards compare side by side', () => {
  const a = cardModel(stats('sample/work.ics').s);
  const b = { ...a, n: { ...a.n, h: a.n.h / 2, c: a.n.c + 10 } };
  const c = comparison(a, b);
  assert.equal(c.rows.length, 4);
  assert.equal(c.more, 'me');
  assert.equal(c.ratio, 2);
  assert.equal(c.rows[1].more, 'them');
  assert.equal(comparison(a, { ...a, m: 'p' }), null, 'work and personal cards are not compared');
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

test('year over year compares this year’s pace with last year', () => {
  const twoYears = { rangeStart: new Date(Y - 1, 0, 1), rangeEnd: new Date(Y + 1, 0, 1) };
  const { events, meta } = parseICS(read('sample/work.ics'), twoYears);
  const selfEmail = guessSelfEmail(events, meta);
  const s = computeStats(events, { ...range, selfEmail, now: NOW });
  s.yoy = yearOverYear(events, { year: Y, selfEmail, mode: 'work' });
  assert.ok(s.yoy && s.yoy.year === Y - 1);
  assert.ok(s.yoy.meetings > 50 && s.yoy.meetings < s.meetings);
  const c = yoyChange(s);
  assert.equal(c.metric, 'totalHours');
  assert.ok(c.pct > 0, `expected growth, got ${c.pct}%`);
  assert.equal(yearOverYear(events, { year: Y - 1, selfEmail, mode: 'work' }), null, 'no data two years back');
});

test('benchmark buckets are coarse and percentiles read from histograms', () => {
  const { s } = stats('sample/work.ics');
  const b = benchmarkBuckets(s);
  assert.deepEqual(Object.keys(b).sort(), ['b2b', 'm', 'perDay', 'share', 'y']);
  assert.equal(b.share % 5, 0);
  assert.equal(percentileFrom({ 10: 50, 20: 30, 30: 20 }, 20), 65);
  assert.equal(percentileFrom({}, 20), null);
});

test('calendar keywords work in Dutch, Swedish, Norwegian and Danish', () => {
  const { PERSONAL_CATEGORIES: C, OOO_TITLE, NON_MEETING_TITLE } = _internal;
  const cat = (title) => C.filter((c) => c.re.test(title)).map((c) => c.key);
  assert.deepEqual(cat('Fika med Anna'), ['food']);
  assert.deepEqual(cat('Tandläkare'), ['health']);
  assert.deepEqual(cat('Løbetur i parken'), ['fitness']);
  assert.deepEqual(cat('Verjaardag oma'), ['birthday', 'family']);
  assert.deepEqual(cat('Hente i barnehage'), ['family']);
  assert.ok(OOO_TITLE.test('Vakantie') && OOO_TITLE.test('Semester') && OOO_TITLE.test('Ferie') && OOO_TITLE.test('Sykemeldt'));
  assert.ok(!OOO_TITLE.test('Fri standup'), 'no false positive on Fri');
  assert.ok(NON_MEETING_TITLE.test('Focustijd') && NON_MEETING_TITLE.test('Lunsj'));
  const out = parseICS('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:Geannuleerd: Overleg\r\nDTSTART:20260310T100000Z\r\nDTEND:20260310T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n', range);
  assert.equal(out.events[0].status, 'CANCELLED');
  assert.equal(out.events[0].title, 'Overleg');
});

test('personas and suggestions re-render in another language', () => {
  const { s } = stats('sample/work.ics');
  assert.ok(s.persona.id && s.persona.params);
  useDictionary('nl', { 'The Road Warrior': 'De Wegstrijder', 'Move “{title}” to every other week': 'Zet “{title}” op eens per twee weken' });
  try {
    assert.equal(renderPersona(s.persona).name, s.persona.id === 'roadwarrior' ? 'De Wegstrijder' : renderPersona(s.persona).name);
    const cadence = s.reclaim.suggestions.find((x) => x.kind === 'cadence');
    assert.match(renderSuggestion(cadence).title, /^Zet “.+” op eens per twee weken$/);
  } finally { useDictionary('en', {}); }
});

test('suggestions carry the series details that actions need', () => {
  const { s } = stats('sample/work.ics');
  const cadence = s.reclaim.suggestions.find((x) => x.kind === 'cadence');
  assert.ok(cadence.series.uid && cadence.series.organizer?.email && Number.isInteger(cadence.series.weekday));
  const focus = s.reclaim.suggestions.find((x) => x.kind === 'focus');
  if (focus) assert.ok(focus.quietestWeekday >= 1 && focus.quietestWeekday <= 5);
});

test('team stats split person-hours by quarter', () => {
  const members = ['alex', 'priya'].map((n) => { const { events, meta } = parseICS(read(`sample/team/${n}.ics`), range); return { events, selfEmail: guessSelfEmail(events, meta) }; });
  const t = computeTeamStats(members, { ...range, now: NOW });
  assert.equal(t.quarters.length, 4);
  assert.ok(t.quarters[0].hours > 0);
  assert.equal(t.quarters[3].future, false);
});
