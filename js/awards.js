// Awards: a few superlatives the year earned. The engine picks them (ids and numbers only);
// awards-ui.js words them. Each carries a score so the rarest, most striking ones come first.
const minutesOfDay = (d) => { d = new Date(d); return d.getHours() * 60 + d.getMinutes(); };

export function computeAwards(s) {
  const out = [];
  const add = (id, emoji, score, params = {}) => out.push({ id, emoji, score, ...params });
  if (s.mode === 'work') {
    if (!s.meetings) return [];
    if (s.longest?.hours >= 2.5) add('marathon', '🏃', s.longest.hours * 10, { h: s.longest.hours, title: s.longest.title });
    if (s.earliest && minutesOfDay(s.earliest.start) < 8 * 60) add('earlybird', '🌅', (8 * 60 - minutesOfDay(s.earliest.start)) / 3 + 10, { min: minutesOfDay(s.earliest.start) });
    if (s.latest && minutesOfDay(s.latest.end) > 19 * 60) add('nightowl', '🦉', (minutesOfDay(s.latest.end) - 19 * 60) / 3 + 10, { min: minutesOfDay(s.latest.end) });
    if (s.longestChain?.length >= 5) add('stamina', '🔋', s.longestChain.length * 6, { n: s.longestChain.length });
    if (s.worstDay?.hours >= 6) add('wall', '🧱', s.worstDay.hours * 5, { h: s.worstDay.hours, date: s.worstDay.date });
    const top = s.collaborators?.[0];
    if (top && top.count >= 50) add('sidekick', '🤝', top.count / 4, { n: top.count, name: top.name.split(' ')[0] });
    if (s.longestFreeStreak?.length >= 5) add('escape', '🏝️', s.longestFreeStreak.length * 3, { n: s.longestFreeStreak.length });
    if (s.fridayPm >= 20) add('friday', '🍻', s.fridayPm, { n: s.fridayPm });
    if (s.travel?.trips >= 4) add('flyer', '✈️', s.travel.trips * 5, { n: s.travel.trips });
    if (s.mix?.customerShare >= 30) add('customer', '🏆', s.mix.customerShare, { p: s.mix.customerShare });
    if (s.organized >= 100) add('convener', '📣', s.organized / 5, { n: s.organized });
    if (s.meetings >= 200 && s.declined <= 3) add('yes', '👍', 35, { n: s.declined });
    if (s.unanswered >= 50) add('maybe', '🤷', s.unanswered / 3, { n: s.unanswered });
    if (s.lateMeetings + s.earlyMeetings >= 60) add('timezones', '🌍', (s.lateMeetings + s.earlyMeetings) / 3, { n: s.lateMeetings + s.earlyMeetings });
  } else {
    if (!s.events) return [];
    const cat = (k) => s.categories?.find((c) => c.key === k)?.count || 0;
    if (cat('fitness') >= 30) add('regular', '💪', cat('fitness') / 2, { n: cat('fitness') });
    if (cat('food') >= 25) add('foodie', '🍝', cat('food') / 2, { n: cat('food') });
    if (cat('culture') >= 10) add('culture', '🎭', cat('culture') * 2, { n: cat('culture') });
    if (s.totalWeekends && s.freeWeekends >= 20) add('protector', '🛋️', s.freeWeekends, { n: s.freeWeekends });
    if (s.travel?.trips >= 4) add('flyer', '✈️', s.travel.trips * 5, { n: s.travel.trips });
    if (s.birthdays >= 15) add('oracle', '🎂', s.birthdays, { n: s.birthdays });
    if (s.longestBusyStreak?.length >= 10) add('always', '⚡', s.longestBusyStreak.length * 2, { n: s.longestBusyStreak.length });
    const top = s.people?.[0];
    if (top && top.count >= 20) add('sidekick', '🤝', top.count, { n: top.count, name: top.name.split(' ')[0] });
  }
  if (s.timeOff?.longest?.span >= 10) add('getaway', '🌴', s.timeOff.longest.span * 3, { n: s.timeOff.longest.span });
  return out.sort((a, b) => b.score - a.score).slice(0, 6).map(({ score, ...a }) => a);
}
