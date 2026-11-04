import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { easter, bankHolidays, bestBreaks, countryFor, guessCountry, COUNTRIES } from '../js/holidays.js';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats, _internal } from '../js/stats.js';

const keys = (c, y) => bankHolidays(c, y).map((h) => h.key);

test('Easter dates', () => {
  assert.deepEqual([2024, 2025, 2026, 2027, 2028].map((y) => easter(y).toDateString()),
    ['Sun Mar 31 2024', 'Sun Apr 20 2025', 'Sun Apr 05 2026', 'Sun Mar 28 2027', 'Sun Apr 16 2028']);
});

test('public holidays per country, with weekend substitutes in England', () => {
  assert.deepEqual(keys('GB', 2026), ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28']);
  assert.deepEqual(keys('GB', 2027).slice(-2), ['2027-12-27', '2027-12-28'], 'Christmas on a Saturday moves to Monday and Tuesday');
  assert.ok(keys('GB', 2022).includes('2022-01-03'), 'New Year on a Saturday moves to Monday');
  assert.ok(keys('NL', 2026).includes('2026-04-27') && keys('NL', 2026).includes('2026-05-14'), 'Koningsdag and Hemelvaart');
  assert.ok(keys('NL', 2025).includes('2025-04-26'), 'Koningsdag on a Sunday moves to Saturday');
  assert.ok(keys('NL', 2025).includes('2025-05-05') && !keys('NL', 2026).includes('2026-05-05'), 'Bevrijdingsdag in lustrum years');
  assert.ok(keys('SE', 2026).includes('2026-06-19'), 'Midsommarafton is the Friday between 19 and 25 June');
  assert.ok(keys('NO', 2026).includes('2026-05-17') && keys('NO', 2026).includes('2026-04-02'), 'Grunnlovsdag and Skjærtorsdag');
  assert.ok(keys('DK', 2023).includes('2023-05-05') && !keys('DK', 2024).some((k) => k === '2024-04-26'), 'Store bededag ends after 2023');
  assert.equal(countryFor('nb'), 'NO');
  assert.equal(countryFor('xx'), 'GB');
});

test('Scotland, Northern Ireland, Ireland, Belgium, Luxembourg and Finland', () => {
  assert.deepEqual(keys('GB-SCT', 2026), ['2026-01-01', '2026-01-02', '2026-04-03', '2026-05-04', '2026-05-25', '2026-08-03', '2026-11-30', '2026-12-25', '2026-12-28']);
  assert.ok(keys('GB-NIR', 2026).includes('2026-03-17') && keys('GB-NIR', 2026).includes('2026-07-13'), 'St Patrick’s Day, and the Boyne moves off a Sunday');
  assert.ok(keys('IE', 2026).includes('2026-02-02') && keys('IE', 2026).includes('2026-10-26'), 'St Brigid’s Day and the October bank holiday');
  assert.ok(keys('IE', 2027).includes('2027-02-01'), 'St Brigid’s Day on a Monday');
  assert.ok(keys('BE', 2026).includes('2026-07-21') && keys('BE', 2026).includes('2026-11-11'));
  assert.ok(keys('LU', 2026).includes('2026-05-09') && keys('LU', 2026).includes('2026-06-23'));
  assert.ok(keys('FI', 2026).includes('2026-12-06') && keys('FI', 2026).includes('2026-06-19'));
  for (const c of COUNTRIES) assert.ok(bestBreaks(c, 2027).length >= 2, `${c} has a plan`);
});

test('country guess: calendar time zone, then browser, then language', () => {
  assert.equal(guessCountry({ calendarTz: 'Europe/Amsterdam', locale: 'en' }), 'NL');
  assert.equal(guessCountry({ calendarTz: 'GMT Standard Time', locale: 'nl' }), 'GB', 'Outlook’s Windows name');
  assert.equal(guessCountry({ calendarTz: 'W. Europe Standard Time', browserTz: 'Europe/Oslo', locale: 'en' }), 'NO', 'ambiguous Windows names fall through');
  assert.equal(guessCountry({ calendarTz: 'UTC', browserTz: 'America/New_York', locale: 'da' }), 'DK');
});

test('best days off: few days of leave, long breaks, inside the year, no overlaps', () => {
  for (const c of ['GB', 'NL', 'SE', 'NO', 'DK']) {
    const plan = bestBreaks(c, 2027, { max: 5 });
    assert.ok(plan.length >= 3, `${c} has a plan`);
    for (const p of plan) {
      assert.ok(p.take >= 1 && p.take <= 5, `${c} ${p.start} takes ${p.take}`);
      assert.ok(p.off >= p.take * 2, `${c} ${p.start} doubles up`);
      assert.ok(p.start >= '2027-01-01', `${c} starts in the year`);
      assert.equal(p.leave.length, p.take);
    }
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].start > plan[i - 1].end, `${c} windows don’t overlap`);
  }
  const easterGB = bestBreaks('GB', 2027).find((p) => p.group === 'easter');
  assert.deepEqual([easterGB.take, easterGB.off], [4, 10], 'take 4, get 10 at Easter 2027');
  assert.ok(bestBreaks('GB', 2027, { from: new Date(2027, 5, 1) }).every((p) => p.start >= '2027-06-01'));
});

test('time off from a work calendar: leave days, breaks, booked, longest gap, plan', () => {
  const range = { rangeStart: new Date(2026, 0, 1), rangeEnd: new Date(2027, 0, 1) };
  const { events, meta } = parseICS(readFileSync(new URL('../sample/work.ics', import.meta.url), 'utf8'), range);
  const s = computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta), now: new Date(2026, 10, 4, 12) });
  const o = s.timeOff;
  assert.equal(o.taken, 14);
  assert.equal(o.booked, 6, 'Christmas leave is already booked');
  assert.equal(o.breaks.length, 3);
  assert.deepEqual([o.breaks[0].start, o.breaks[0].end], ['2026-04-03', '2026-04-12'], 'Easter break includes the bank holidays and weekends around it');
  assert.equal(o.longest.span, 16);
  assert.equal(o.longestGap.weeks, 13);
  assert.equal(o.left, 5, '25 less 20 taken or booked');
  assert.equal(o.days['2026-05-25'], 'h');
  assert.equal(o.days['2026-08-12'], 'l');
  assert.equal(o.days['2026-12-23'], 'b');
  assert.equal(o.planYear, 2027);
  assert.ok(o.plan.length >= 3);
  // Same calendar read as Dutch: different holidays, different plan.
  const nl = computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta), now: new Date(2026, 10, 4, 12), country: 'NL' });
  assert.notDeepEqual(nl.timeOff.plan.map((p) => p.group), o.plan.map((p) => p.group));
});

test('sick days are counted apart, and out-of-office status counts without a keyword', () => {
  const ev = (title, m, d, n, extra = {}) => ({ uid: title + d, title, start: new Date(2026, m, d), end: new Date(2026, m, d + n), allDay: true, status: 'CONFIRMED', attendees: [], organizer: null, isRecurring: false, transparent: false, ...extra });
  const timed = { uid: 'x', title: 'Standup', start: new Date(2026, 1, 2, 9), end: new Date(2026, 1, 2, 9, 30), allDay: false, status: 'CONFIRMED', attendees: [{ email: 'a@x.com', status: 'ACCEPTED' }], organizer: { email: 'a@x.com' }, isRecurring: false };
  const events = [timed, ev('Sick', 1, 9, 2), ev('Away', 2, 2, 3, { oof: true }), ev('Bank holiday', 4, 4, 1), ev('Ziek', 5, 1, 1)];
  const s = computeStats(events, { rangeStart: new Date(2026, 0, 1), rangeEnd: new Date(2027, 0, 1), selfEmail: 'me@x.com', mode: 'work', now: new Date(2026, 10, 1) });
  assert.equal(s.timeOff.taken, 3);
  assert.equal(s.timeOff.sick, 3);
});

test('birthdays: names, ages and dedupe across five languages', () => {
  const b = _internal.birthdayOf;
  assert.deepEqual(b('Mo’s 30th birthday 🎂'), { name: 'Mo', age: 30 });
  assert.deepEqual(b('Grandma turns 90'), { name: 'Grandma', age: 90 });
  assert.deepEqual(b('Verjaardag oma'), { name: 'Oma', age: null });
  assert.deepEqual(b('Annas födelsedag'), { name: 'Anna', age: null });
  assert.deepEqual(b('Lars fyller 40'), { name: 'Lars', age: 40 });
  assert.deepEqual(b('Fødselsdag: Mette (35)'), { name: 'Mette', age: 35 });
  assert.equal(b('Team birthday lunch').name, null);
  const range = { rangeStart: new Date(2026, 0, 1), rangeEnd: new Date(2027, 0, 1) };
  const { events } = parseICS(readFileSync(new URL('../sample/personal.ics', import.meta.url), 'utf8'), range);
  const s = computeStats(events, { ...range, now: new Date(2026, 10, 4, 12) });
  const info = s.birthdayInfo;
  assert.equal(info.count, 11, 'Sam’s drinks don’t count twice');
  assert.deepEqual(info.busiestMonth, { i: 9, n: 3 });
  assert.equal(info.upcoming[0].name, 'Chloe');
  assert.equal(info.upcoming[0].inDays, 26);
  assert.deepEqual(info.milestones.map((x) => x.name), ['Grandma', 'Mo']);
});
