import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ICAL from '../vendor/ical.js';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats } from '../js/stats.js';
import { actionsFor, blockIcs, nextWeekday } from '../js/actions.js';
import { graphToEvents } from '../js/microsoft.js';
import { createCore } from '../js/engine-core.js';

const Y = 2026;
const range = { rangeStart: new Date(Y, 0, 1), rangeEnd: new Date(Y + 1, 0, 1) };
const NOW = new Date(Y, 10, 4, 12);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const workStats = () => { const { events, meta } = parseICS(read('sample/work.ics'), range); return computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta), now: NOW }); };

test('focus block ICS imports cleanly and repeats weekly', () => {
  const from = new Date(Y, 10, 4); // a Wednesday
  const ics = blockIcs({ title: 'Focus time: no meetings', days: [3], startHour: 9, minutes: 180, from, uid: 'test@x' });
  const ev = new ICAL.Event(new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent'));
  assert.equal(ev.summary, 'Focus time: no meetings');
  assert.ok(ev.isRecurring());
  const start = ev.startDate.toJSDate();
  assert.equal(start.getDay(), 3);
  assert.equal(start.getHours(), 9);
  assert.ok(start > from, 'starts after today');
  assert.equal((ev.endDate.toJSDate() - start) / 60000, 180);
  assert.equal(nextWeekday(5, new Date(Y, 10, 4)).getDate(), 6);
});

test('suggestions get one-tap actions', () => {
  const s = workStats();
  const cadence = s.reclaim.suggestions.find((x) => x.kind === 'cadence');
  const [msg] = actionsFor(cadence, { senderName: 'Alex' });
  assert.equal(msg.type, 'message');
  assert.equal(msg.to, cadence.series.organizer.email);
  assert.match(msg.subject, /fortnightly/);
  assert.match(msg.body, new RegExp(cadence.series.title));
  assert.ok(msg.body.endsWith('Alex'));
  assert.ok(msg.mailto.startsWith('mailto:'));
  const own = actionsFor({ ...cadence, series: { ...cadence.series, organizedBySelf: true } });
  assert.equal(own[0].type, 'howto', 'your own meeting gets steps, not a message to yourself');
  const focus = s.reclaim.suggestions.find((x) => x.kind === 'focus');
  if (focus) assert.equal(actionsFor(focus)[0].type, 'ics');
  assert.equal(actionsFor({ kind: 'buffers' }, { calendar: 'outlook' })[0].steps.length, 2);
  assert.equal(actionsFor({ kind: 'reconnect', person: { name: 'Jess K' } })[0].body.startsWith('Hey Jess!'), true);
});

test('Microsoft Graph events convert to the internal shape', () => {
  const data = JSON.parse(read('tests/fixtures/graph-events.json'));
  const { events, meta } = graphToEvents({ me: data.me, items: data.value }, range);
  assert.equal(meta.source, 'outlook');
  assert.equal(meta.calendarEmail, 'sam.patel@contoso.com');
  const weekly = events.filter((e) => e.title === 'Weekly Sync');
  assert.equal(weekly.length, 8);
  assert.ok(weekly.every((e) => e.isRecurring && e.uid === 'master-weekly'));
  assert.equal(weekly[0].start.toISOString(), `${Y}-01-06T14:00:00.000Z`);
  assert.ok(weekly[0].attendees.some((a) => a.email === 'sam.patel@contoso.com'), 'self added from responseStatus');
  const oof = events.find((e) => e.title === 'Out of office');
  assert.ok(oof.allDay && oof.start.getDate() === 16 && oof.start.getHours() === 0);
  const s = computeStats(events, { ...range, selfEmail: meta.calendarEmail, mode: 'work', now: NOW });
  assert.equal(s.meetings, 9, 'weekly x8 + own hiring panel; declined, cancelled and focus excluded');
  assert.equal(s.declined, 1);
  assert.equal(s.organized, 1);
  assert.equal(s.travel.daysOff, 5);
  assert.equal(s.collaborators[0].name, 'Ingrid Olsen');
});

test('engine core loads, computes with year over year, and builds teams', async () => {
  const core = createCore();
  const sum = await core.loadText({ text: read('sample/work.ics') });
  assert.ok(sum.count > 1000 && sum.perYear[Y] > 500 && sum.perYear[Y - 1] > 100);
  assert.equal(sum.selfEmail, 'alex.morgan@northwindlabs.com');
  const s = await core.compute({ year: Y, selfEmail: sum.selfEmail });
  assert.equal(s.mode, 'work');
  assert.ok(s.yoy && s.yoy.year === Y - 1);
  const a = core.addMember({ text: read('sample/team/alex.ics'), label: 'alex' });
  const b = core.addMember({ text: read('sample/team/priya.ics'), label: 'priya' });
  assert.equal(core.addMember({ text: read('sample/team/priya.ics') }).error, 'duplicate');
  assert.equal(b.name, 'Priya Shah');
  assert.equal(core.team().size, 2);
  core.removeMember({ id: a.id });
  assert.equal(core.team().size, 1);
});

test('anonymiser strips everything personal but keeps what the engine needs', async () => {
  const { anonymiseIcs, diagnosticReport } = await import('../js/anonymise.js');
  const range2 = { rangeStart: new Date(Y, 0, 1), rangeEnd: new Date(Y + 1, 0, 1) };
  for (const file of ['sample/work.ics', 'sample/outlook-desktop.ics', 'sample/outlook-web.ics']) {
    const original = read(file);
    const anon = anonymiseIcs(original);
    assert.ok(!/Priya|Ingrid|northwindlabs|contoso|Weekly Sync|Stockholm|Daily standup/.test(anon), `${file} leaks`);
    const a = parseICS(original, range2), b = parseICS(anon, range2);
    assert.equal(b.events.length, a.events.length, `${file}: same occurrences`);
    const sa = computeStats(a.events, { ...range2, selfEmail: guessSelfEmail(a.events, a.meta), now: NOW });
    const sb = computeStats(b.events, { ...range2, selfEmail: guessSelfEmail(b.events, b.meta), now: NOW });
    assert.equal(sb.mode, sa.mode);
    if (sa.mode === 'work') { assert.equal(sb.meetings, sa.meetings, `${file}: same meetings`); assert.equal(sb.travel.daysOff, sa.travel.daysOff); }
  }
  const report = diagnosticReport(read('sample/outlook-desktop.ics'), { parseICS, guessSelfEmail, computeStats, now: NOW });
  assert.match(report, /Detected source: outlook/);
  assert.ok(!/Ingrid|contoso|Weekly Sync|sam\.patel/.test(report));
  assert.match(diagnosticReport('not a calendar', { parseICS, guessSelfEmail, computeStats, now: NOW }), /^Error: /m);
});

test('t() fills zero values instead of leaving the placeholder', async () => {
  const { t, useDictionary } = await import('../js/i18n.js');
  useDictionary('nl', { '{a} of {b}': '{a} van {b}' });
  try { assert.equal(t('{a} of {b}', { a: 0, b: 44 }), '0 van 44'); } finally { useDictionary('en', {}); }
  assert.equal(t('{n} trips', { n: 0 }), '0 trips');
  assert.equal(t('{n} trips', {}), '{n} trips');
});

test('flights become routes: codes, five languages, chained legs, home', async () => {
  const geo = await import('../js/geo.js');
  await geo.loadGeo();
  const d = (x) => new Date(`2026-${x}T10:00:00Z`);
  const r = geo.flightLegs([
    { title: '✈ Flight to Stockholm (BA778)', location: 'London Heathrow (LHR)', start: d('02-10') },
    { title: '✈ Flight to London (BA779)', location: 'Stockholm Airport', start: d('02-12') },
    { title: 'LHR → JFK', location: '', start: d('05-01') },
    { title: 'Vlucht naar Kopenhagen', location: '', start: d('06-01') },
    { title: 'Flyg till Göteborg', location: '', start: d('06-03') },
    { title: 'Fly til Tromsø', location: '', start: d('06-20') },
    { title: 'Flight from Oslo to Bergen', location: '', start: d('07-01') },
    { title: 'Eurostar to Paris', location: 'London St Pancras', start: d('08-01') },
    { title: 'Flight to Atlantis', location: '', start: d('09-01') },
  ], { timezone: 'Europe/London' });
  assert.equal(r.home.name, 'London');
  assert.deepEqual(r.legs.map((l) => `${l.from.name}>${l.to.name}`), ['London>Stockholm', 'Stockholm>London', 'London>New York', 'London>Copenhagen', 'Copenhagen>Göteborg', 'Göteborg>Tromso', 'Oslo>Bergen']);
  assert.ok(Math.abs(r.legs[2].km - 5540) < 60, `LHR-JFK ${r.legs[2].km}`);
  assert.equal(r.longest.to.name, 'New York');
  const { s } = { s: (await import('../js/stats.js')).computeStats };
  void s;
});

test('the work sample has a globe’s worth of routes', async () => {
  const core = createCore();
  const sum = await core.loadText({ text: read('sample/work.ics') });
  const s = await core.compute({ year: Y, selfEmail: sum.selfEmail });
  const r = s.travel.routes;
  assert.equal(r.home.name, 'London');
  assert.ok(r.legs.length >= 14 && r.km > 20000, `${r.legs.length} legs, ${r.km} km`);
  assert.ok(r.legs.every((l) => Number.isFinite(l.from.lat) && Number.isFinite(l.to.lon)));
});
