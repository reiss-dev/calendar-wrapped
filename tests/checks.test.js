import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseICS } from '../js/ics.js';
import { computeStats, applyExclusions } from '../js/stats.js';
import { oddCalendar, ODD_SELF } from './fixtures/odd.mjs';

const range = { rangeStart: new Date(2026, 0, 1), rangeEnd: new Date(2027, 0, 1) };
const NOW = new Date(2026, 10, 4, 12);
const stats = (exclude) => {
  const { events } = parseICS(oddCalendar(2026), range);
  return computeStats(exclude ? applyExclusions(events, exclude, ODD_SELF) : events, { ...range, selfEmail: ODD_SELF, mode: 'work', now: NOW });
};

test('does this look right: too much leave, and meetings you were never invited to', () => {
  const s = stats();
  const ids = s.checks.map((c) => c.id);
  assert.ok(ids.includes('leave'), JSON.stringify(s.checks));
  assert.ok(ids.includes('notmine'));
  const leave = s.checks.find((c) => c.id === 'leave');
  assert.equal(leave.items[0].title, 'OOO conference season', 'the biggest source first');
  assert.ok(leave.items.some((x) => x.title === 'Annual leave'));
  assert.ok(s.checks.find((c) => c.id === 'notmine').n >= 30);
  assert.ok(!('_check' in s), 'working data is not kept');
});

test('one tap fixes: leaving out a title and meetings you weren’t on clears the checks', () => {
  const before = stats();
  const after = stats({ titles: ['OOO conference season'], notMine: true });
  assert.deepEqual(after.checks, []);
  assert.ok(after.timeOff.taken < before.timeOff.taken);
  assert.ok(after.meetings < before.meetings);
  assert.ok(!after.topTitles.some((x) => x.key === 'Ops review'));
});
