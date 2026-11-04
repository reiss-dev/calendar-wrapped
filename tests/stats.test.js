import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats, detectMode, _internal } from '../js/stats.js';

const Y = 2026;
const range = { rangeStart: new Date(Y, 0, 1), rangeEnd: new Date(Y + 1, 0, 1) };
const NOW = new Date(Y, 10, 4, 12); // 4 Nov 2026
const load = (name) => parseICS(readFileSync(new URL(`../sample/${name}.ics`, import.meta.url), 'utf8'), range);

test('parses and expands a Google-style export with recurrence and timezones', () => {
  const { events, meta } = load('work');
  assert.equal(meta.source, 'google');
  assert.equal(meta.calendarEmail, 'alex.morgan@northwindlabs.com');
  assert.ok(events.length > 900, `expected many expanded occurrences, got ${events.length}`);
  const standups = events.filter((e) => e.title === 'Daily standup');
  assert.ok(standups.length > 240 && standups.length < 265, `standups ${standups.length}`);
  assert.ok(standups.every((e) => e.isRecurring));
  // BST handling: a 09:30 London standup in July is 08:30 UTC
  const july = standups.find((e) => e.start.getMonth() === 6);
  assert.equal(july.start.getUTCHours(), 8);
  const jan = standups.find((e) => e.start.getMonth() === 0);
  assert.equal(jan.start.getUTCHours(), 9);
  assert.ok(events.some((e) => e.allDay && /Annual leave/.test(e.title)));
});

test('guesses the calendar owner', () => {
  const { events, meta } = load('work');
  assert.equal(guessSelfEmail(events, { ...meta, calendarEmail: null }), 'alex.morgan@northwindlabs.com');
});

test('work mode stats are sane and capped at today', () => {
  const { events } = load('work');
  const s = computeStats(events, { ...range, selfEmail: 'alex.morgan@northwindlabs.com', now: NOW });
  assert.equal(s.mode, 'work');
  assert.equal(s.detectedMode, 'work');
  assert.ok(s.isPartialYear);
  assert.ok(s.meetings > 400 && s.meetings < 800, `meetings ${s.meetings}`);
  assert.ok(s.shareOfWork > 10 && s.shareOfWork < 60);
  assert.ok(s.worstWeek.hours >= 10);
  assert.equal(s.topTitles[0].key, 'Daily standup');
  assert.ok(s.collaborators[0].count > 100);
  assert.ok(s.collaborators.every((c) => c.email !== 'alex.morgan@northwindlabs.com'));
  assert.ok(s.collaborators.every((c) => c.lastSeen < new Date(Y, 10, 5)), "nothing after today");
  assert.equal(s.travel.daysOff, 14, 'leave taken so far; the bank holiday entry is not leave');
  assert.ok(s.travel.flights >= 10);
  assert.ok(!s.travel.places.some((p) => p.key === 'London'), 'home city should be dropped');
  assert.ok(s.reclaim.suggestions.length >= 4);
  assert.ok(s.reclaim.totalHours > 50);
  assert.ok(s.persona.name);
  assert.equal(s.monthly.length, 12);
  assert.ok(s.monthly[11].value === 0, 'December is in the future');
});

test('declined and cancelled events are excluded from meetings', () => {
  const { events } = load('work');
  const declined = events.filter((e) => e.attendees.some((a) => a.email === 'alex.morgan@northwindlabs.com' && a.status === 'DECLINED'));
  assert.ok(declined.length > 0);
  const s = computeStats(events, { ...range, selfEmail: 'alex.morgan@northwindlabs.com', now: NOW });
  assert.equal(s.declined, declined.filter((e) => e.start < NOW).length);
});

test('personal mode stats', () => {
  const { events } = load('personal');
  const s = computeStats(events, { ...range, now: NOW });
  assert.equal(s.mode, 'personal');
  assert.ok(s.categories.find((c) => c.key === 'fitness').count > 100);
  assert.equal(s.birthdays, 11, 'the whole year, one per person');
  assert.ok(s.travel.trips >= 4);
  assert.ok(s.people.length >= 5);
  assert.ok(s.reclaim.suggestions.length >= 1);
  assert.ok(!s.reclaim.suggestions.some((x) => /Gym|Parkrun/.test(x.title)), 'never tell people to quit exercising');
});

test('mode override and detection', () => {
  const { events } = load('personal');
  assert.equal(detectMode(events).mode, 'personal');
  const forced = computeStats(events, { ...range, mode: 'work', now: NOW });
  assert.equal(forced.mode, 'work');
  assert.equal(forced.detectedMode, 'personal');
});

test('calendar without attendee data falls back gracefully', () => {
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple Inc.//macOS 14.0//EN\r\n` +
    Array.from({ length: 30 }, (_, i) => `BEGIN:VEVENT\r\nUID:e${i}\r\nSUMMARY:Planning ${i}\r\nDTSTART:2026${String(1 + (i % 9)).padStart(2, '0')}${String(2 + (i % 20)).padStart(2, '0')}T100000Z\r\nDTEND:2026${String(1 + (i % 9)).padStart(2, '0')}${String(2 + (i % 20)).padStart(2, '0')}T110000Z\r\nEND:VEVENT\r\n`).join('') +
    `END:VCALENDAR\r\n`;
  const { events, meta } = parseICS(ics, range);
  assert.equal(meta.source, 'apple');
  const s = computeStats(events, { ...range, mode: 'work', now: NOW });
  assert.equal(s.attendeeInfoAvailable, false);
  assert.equal(s.meetings, 30);
});

test('title normalisation', () => {
  const { normTitle } = _internal;
  assert.equal(normTitle('Re: Weekly Sync - weekly'), 'Weekly Sync');
  assert.equal(normTitle('Invitation: Deal review @ Thu 10am'), 'Deal review');
});
