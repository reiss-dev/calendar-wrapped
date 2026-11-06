import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats } from '../js/stats.js';
import { whereOf, placeName, whereStats } from '../js/where.js';
import { maskStats } from '../js/privacy.js';
import { cardModel, cardTiles } from '../js/model.js';

const range = { rangeStart: new Date(2026, 0, 1), rangeEnd: new Date(2027, 0, 1) };
const ev = (location, extra = {}) => ({ location, description: '', attendees: [], ...extra });

test('where a meeting was: online, in the office or on site, in five languages', () => {
  const cases = [
    ['Microsoft Teams Meeting', 'online'], ['https://zoom.us/j/123', 'online'], ['Google Meet', 'online'], ['Microsoft Teams-vergadering', 'online'],
    ['Room 4.12 - Fjord (8)', 'office'], ['Vergaderruimte De Dam', 'office'], ['Mötesrum Kebnekaise', 'office'], ['Møterom Galdhøpiggen', 'office'],
    ['Conference Room A; Microsoft Teams Meeting', 'office'], ['Northwind HQ - Atrium', 'office'],
    ['Acme Customer, Kungsgatan 12, 111 43 Stockholm', 'onsite'], ['The Ned, 27 Poultry, London', 'onsite'],
    ['TBC', null], ['', null],
  ];
  for (const [loc, want] of cases) assert.equal(whereOf(ev(loc)), want, loc);
  assert.equal(whereOf(ev('', { description: 'Join: https://meet.google.com/abc' })), 'online', 'a link in the notes');
  assert.equal(whereOf(ev('Acme office, London'), { external: true }), 'onsite', 'their office, with them there');
  assert.equal(whereOf(ev('Acme office, London'), { external: false }), 'office');
  assert.equal(whereOf(ev('', { attendees: [{ isResource: true, email: 'room@x.com' }] })), 'office', 'a booked room');
  assert.equal(placeName('Acme Customer, Kungsgatan 12, 111 43 Stockholm'), 'Acme Customer');
  assert.equal(placeName('Microsoft Teams Meeting; 1 Spinningfields, M3 3AP Manchester'), 'Manchester');
});

test('the sample year: days on site, customers there, places hidden when shared', () => {
  const { events, meta } = parseICS(readFileSync(new URL('../sample/work.ics', import.meta.url), 'utf8'), range);
  const s = computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta), now: new Date(2026, 10, 4) });
  const w = s.where;
  assert.ok(w, 'computed');
  assert.deepEqual(w.types.map((x) => x.key).sort(), ['office', 'online', 'onsite']);
  assert.ok(w.onsite.days >= 10 && w.customer.days >= 5 && w.customer.days <= w.onsite.days, JSON.stringify(w.onsite));
  assert.ok(w.inPersonShare > 20 && w.inPersonShare < 80);
  assert.ok(w.places.some((p) => /Acme/.test(p.name) && p.customer));
  assert.ok(s.awards.some((a) => a.id === 'boots'));
  const hidden = maskStats(s, 'colleagues');
  assert.ok(hidden.where.places.every((p) => !p.customer));
  assert.ok(!/Acme|Contoso/.test(JSON.stringify(hidden.where)));
  assert.deepEqual(maskStats(s, 'none').where.places, []);
  const card = cardModel(s, { tiles: ['os', 'ip'] });
  assert.equal(card.n.os, w.onsite.days);
  assert.match(cardTiles(card)[0][1], /days on site/);
});

test('too little location data says nothing', () => {
  const m = (loc) => ({ location: loc, description: '', attendees: [], others: [], durationH: 1, start: new Date(2026, 1, 2) });
  assert.equal(whereStats([...Array(20)].map(() => m('')).concat([m('Room 1')])), null);
});
