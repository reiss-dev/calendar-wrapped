// Calendar health: one number out of 100, made of a few parts anyone can check against their own
// calendar. Each part scores 0–100 between a "fine" and a "bad" mark; the parts are weighted.
// Pure: the engine stores numbers, health-ui.js words them.
const clamp = (x) => Math.max(0, Math.min(1, x));
/** 1 at or better than `good`, 0 at or worse than `bad`, linear between. Works both ways round. */
const between = (v, good, bad) => clamp((v - bad) / (good - bad));

export const BANDS = [85, 70, 55, 40]; // excellent, healthy, stretched, overloaded, underwater

export function computeHealth(s) {
  const year = clamp((s.daysCovered || 365) / 365) || 1;
  const parts = [];
  const add = (key, weight, score, value) => parts.push({ key, weight, score: Math.round(score * 100), value });
  const off = s.timeOff;
  const leave = off ? off.taken : 0;
  // Leave expected by now, at the country's usual allowance.
  const expected = off ? Math.max(1, (off.typical || 25) * year) : 0;

  if (s.mode === 'work') {
    if (!s.meetings || !s.workingDays) return null;
    const wd = Math.max(1, s.workingDays);
    add('load', 30, between(s.shareOfWork, 20, 60), s.shareOfWork);
    add('breathing', 15, between(s.backToBackDays / wd, 0.05, 0.45), s.backToBackDays);
    add('focus', 20, between(s.fragmentedDays / wd, 0.05, 0.5), s.fragmentedDays);
    const outside = s.earlyMeetings + s.lateMeetings + s.weekendMeetings;
    add('boundaries', 15, between(outside / Math.max(1, s.meetings), 0.03, 0.2), outside);
    add('rest', 10, off && leave ? between(leave / expected, 0.8, 0.2) : 0.6, leave);
    const groups = Math.max(1, s.meetings - s.oneToOnes);
    add('hygiene', 10, between(s.noAgenda / groups, 0.15, 0.6), s.noAgenda);
  } else {
    if (!s.events) return null;
    const weeks = Math.max(1, s.totalWeekends || 1);
    add('weekends', 30, between(s.freeWeekends / weeks, 0.3, 0.02), s.freeWeekends);
    add('streak', 20, between(s.longestBusyStreak?.length || 0, 7, 40), s.longestBusyStreak?.length || 0);
    add('evenings', 20, between((s.eveningEvents || 0) / weeks, 2, 4.5), s.eveningEvents || 0);
    add('rest', 15, off && leave ? between(leave / expected, 0.8, 0.2) : 0.6, leave);
    add('variety', 15, between((s.categories || []).length, 5, 1), (s.categories || []).length);
  }
  const total = parts.reduce((n, p) => n + p.weight, 0);
  const score = Math.round(parts.reduce((n, p) => n + p.score * p.weight, 0) / total);
  const band = BANDS.findIndex((b) => score >= b);
  return {
    score,
    band: band < 0 ? BANDS.length : band,
    parts,
    // What costs the most points, worst first: the place to start.
    drags: [...parts].filter((p) => p.score < 70).sort((a, b) => (100 - b.score) * b.weight - (100 - a.score) * a.weight).map((p) => p.key),
  };
}
