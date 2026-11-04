// Builds the slide sequence from computed stats. Each slide: { theme, render(), cta? }.
// Visual language: one flat colour per slide, system type, one idea per screen.
import { h, svg, fmt } from './ui.js';
import { CONFIG } from './config.js';

const R = (attrs = {}) => ({ 'data-reveal': '', ...attrs });

// ---------- chart builders ----------
function monthChart(monthly, highlight) {
  const W = 600, H = 150, pad = 8, bw = (W - pad * 11) / 12;
  const max = Math.max(1, ...monthly.map((m) => m.value));
  const now = new Date();
  const s = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H + 26}`, 'aria-hidden': 'true' });
  monthly.forEach((m, i) => {
    const x = i * (bw + pad);
    const hgt = (m.value / max) * H;
    const future = new Date(m.year, i, 1) > now;
    const cls = future ? 'ghost' : m.month === highlight ? '' : 'dim';
    s.append(
      svg('rect', { class: `bar-rect ${cls}`, x, y: H - (future ? 4 : Math.max(4, hgt)), width: bw, height: future ? 4 : Math.max(4, hgt), rx: 5, style: `--i:${i}; transform-origin: ${x + bw / 2}px ${H}px` }),
      svg('text', { x: x + bw / 2, y: H + 19, 'text-anchor': 'middle', class: m.month === highlight ? 'hl' : '' }, m.short[0]),
    );
  });
  return s;
}

function weekStrip(weekly, worst) {
  const W = 600, H = 110, gap = 3;
  const n = Math.max(1, weekly.length);
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...weekly.map((w) => w.hours));
  const s = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  weekly.forEach((w, i) => {
    const x = i * (bw + gap);
    const hgt = Math.max(3, (w.hours / max) * H);
    const isWorst = worst && new Date(w.start).getTime() === new Date(worst.start).getTime();
    s.append(svg('rect', { class: `bar-rect ${isWorst ? '' : 'dim'}`, x, y: H - hgt, width: bw, height: hgt, rx: 2, style: `--i:${Math.min(i, 12)}; transform-origin: ${x}px ${H}px` }));
  });
  return s;
}

function heatStrip(byHour) {
  const max = Math.max(1, ...byHour.map((x) => x.count));
  return h('div', {},
    h('div', { class: 'heatstrip', 'aria-hidden': 'true' }, byHour.map((x, i) => h('i', { style: `--v:${x.count / max}; --i:${i}` }))),
    h('div', { class: 'heat-labels' }, h('span', {}, '00'), h('span', {}, '06'), h('span', {}, '12'), h('span', {}, '18'), h('span', {}, '24')),
  );
}

function ring(pct) {
  const r = 88, c = 2 * Math.PI * r;
  const s = svg('svg', { class: 'ring', viewBox: '0 0 200 200', 'aria-hidden': 'true' },
    svg('circle', { class: 'track', cx: 100, cy: 100, r }),
    svg('circle', { class: 'fill', cx: 100, cy: 100, r, style: `--c:${c}; --p:${Math.min(1, pct / 100)}` }),
  );
  return h('div', { class: 'ring-wrap', ...R() }, s, h('div', { class: 'ring-num' }, h('span', { 'data-count': pct, 'data-suffix': '%' }, '0%')));
}

const tile = (value, label, title, { decimals = 0, suffix = '' } = {}) => h('div', { class: 'tile', ...R() },
  h('div', { class: 'tv' }, h('span', { 'data-count': value, 'data-decimals': decimals }, '0'), suffix ? h('small', {}, suffix) : null),
  h('div', { class: 'tl' }, label), title ? h('div', { class: 'tt' }, title) : null,
);
const textTile = (value, label, title) => h('div', { class: 'tile', ...R() }, h('div', { class: 'tv' }, value), h('div', { class: 'tl' }, label), title ? h('div', { class: 'tt' }, title) : null);

const rows = (items, valueFn, nameFn = (it) => it.key || it.name || it.title || it.label) => h('ol', { class: 'rows', ...R() }, items.map((it, i) => h('li', {}, h('span', { class: 'rank' }, `${i + 1}`), h('span', { class: 'name' }, nameFn(it)), h('span', { class: 'val' }, valueFn(it)))));

const big = (value, { suffix = '', decimals = 0, prefix = '' } = {}) => h('p', { class: 'big', ...R() }, h('span', { 'data-count': value, 'data-decimals': decimals, 'data-prefix': prefix, 'data-suffix': prefix || decimals ? '' : '' }, '0'), suffix ? h('small', {}, suffix) : null);
const cap = (t) => h('p', { class: 'cap', ...R() }, t);
const line = (t, lg = false) => h('h2', { class: `line${lg ? ' lg' : ''}`, ...R() }, t);
const note = (...c) => h('p', { class: 'note', ...R() }, ...c);

const intro = (year, what, sub) => ({
  theme: 'c-black',
  render: () => h('div', {}, cap(CONFIG.brand.name), h('h1', { class: 'line lg', ...R() }, `Your ${year},`, h('br'), what), note(sub)),
});

// ---------- work ----------
function workSlides(s) {
  const out = [];
  const soFar = s.isPartialYear ? ' so far' : '';
  out.push(intro(s.year, 'in meetings.', `${fmt.int(s.totalEventsInRange)} calendar entries, read on your device. Nothing uploaded. Tap to begin.`));

  out.push({ theme: 'c-blue', render: () => h('div', {}, cap('The headline'), big(s.meetings), line(`meetings this year${soFar}.`), note(`About `, h('b', {}, fmt.num(s.avgPerWorkingDay)), ` a working day, averaging `, h('b', {}, `${s.avgLengthMin} minutes`), ` each.`)) });

  out.push({ theme: 'c-indigo', render: () => h('div', {}, cap('Time spent'), big(Math.round(s.totalHours), { suffix: 'hrs' }), line('in a room, or on a call, with other people.'), note(`Roughly `, h('b', {}, `${fmt.num(s.workingWeeksEquivalent)} full working weeks`), ` of talking.`)) });

  const shareLine = s.shareOfWork >= 50 ? 'Most of your job is meetings now. Somebody should put that in the job description.'
    : s.shareOfWork >= 35 ? 'A third of your week, gone before you open a document. Respectable. Dangerous.'
    : s.shareOfWork >= 20 ? 'Enough to stay in the loop. Not quite enough to drown.'
    : 'Rare and precious. You actually get to do the work. Guard it.';
  out.push({ theme: 'c-white', render: () => h('div', {}, cap('Your working time'), ring(s.shareOfWork), line('of your working hours were meetings.'), note(shareLine)) });

  if (s.worstWeek) {
    out.push({ theme: 'c-pink', render: () => h('div', {}, cap('The worst week'), h('h2', { class: 'line lg', ...R() }, fmt.weekRange(s.worstWeek.start)), big(Math.round(s.worstWeek.hours), { suffix: 'hrs' }), note(h('b', {}, `${s.worstWeek.count} meetings`), ` in five days. Every other week, for scale:`), h('div', R(), weekStrip(s.weekly, s.worstWeek))) });
  }

  out.push({ theme: 'c-orange', render: () => h('div', {}, cap('No breathing room'), big(s.backToBack), line('times you went straight into the next one.'), h('div', { class: 'duo' }, tile(s.longestChain.length, 'longest chain', s.longestChain.date ? fmt.dateLong(s.longestChain.date) : ''), tile(s.backToBackDays, 'wall-to-wall days', 'three or more in a row'))) });

  if (s.topTitles.length) {
    const t = s.topTitles[0];
    const quip = /sync|catch ?up|check ?in|touch ?base/i.test(t.key) ? 'Of course it was.' : /stand ?up|daily/i.test(t.key) ? 'Every. Single. Day.' : /1:1|1-1|one.to.one/i.test(t.key) ? 'At least it was personal.' : 'A classic.';
    out.push({ theme: 'c-graphite', render: () => h('div', {}, cap('Most common title'), h('h2', { class: 'line lg', ...R() }, `“${t.key}”`), note(`${quip} `, h('b', {}, `${fmt.int(t.count)} times`), '.'), rows(s.topTitles.slice(0, 5), (x) => `${fmt.int(x.count)}×`)) });
  }

  if (s.collaborators.length) {
    const top = s.collaborators[0];
    out.push({ theme: 'c-green', render: () => h('div', {}, cap('Most seen'), h('h2', { class: 'line lg', ...R() }, top.name), note(h('b', {}, `${fmt.int(top.count)} meetings`), ` together, ${fmt.hours(top.hours)} hours. More than most people see their family.`), rows(s.collaborators.slice(0, 5), (p) => `${fmt.int(p.count)}`)) });
  }

  if (s.recurringCount) {
    const r = s.recurringSeries[0];
    out.push({ theme: 'c-teal', render: () => h('div', {}, cap('Same time next week?'), big(s.recurringShare, { suffix: '%' }), line('of your meeting time was on repeat.'), note(`${s.recurringCount} recurring series. The heaviest: `, h('b', {}, `“${r.title}”`), `, ${fmt.hours(r.hours)} hours across ${r.count} sittings.`)) });
  }

  if (s.earliest && s.latest) {
    out.push({ theme: 'c-black', render: () => h('div', {}, cap('When you meet'), line('Your day, hour by hour.'), h('div', R(), heatStrip(s.byHour)), h('div', { class: 'duo' }, textTile(fmt.time(s.earliest.start), 'earliest start', s.earliest.title), textTile(fmt.time(s.latest.end), 'latest finish', s.latest.title))) });
  }

  if (s.busiestMonth) {
    out.push({ theme: 'c-blue', render: () => h('div', {}, cap('Month by month'), line(`${s.busiestMonth.month} was the big one.`), note(h('b', {}, `${fmt.hours(s.busiestMonth.value)} hours`), ` of meetings.${s.quietestMonth && s.quietestMonth.month !== s.busiestMonth.month ? ` ${s.quietestMonth.month} was the quietest, at ${fmt.hours(s.quietestMonth.value)}.` : ''}`), h('div', R(), monthChart(s.monthly, s.busiestMonth.month))) });
  }

  if (s.travel.found) {
    const t = s.travel;
    out.push({ theme: 'c-purple', render: () => h('div', {}, cap('On the move'), line(t.trips ? `${fmt.plural(t.trips, 'trip')} this year.` : 'Time away.', true), h('div', { class: 'duo' }, t.flights ? tile(t.flights, 'flights') : tile(t.trains, 'train journeys'), t.hotelNights ? tile(t.hotelNights, 'nights in hotels') : tile(t.daysOff, 'days off')), t.places.length ? h('div', { class: 'chips', ...R() }, t.places.slice(0, 6).map((p) => h('span', {}, p.key))) : null, t.daysOff && t.hotelNights ? note(`Plus `, h('b', {}, fmt.plural(t.daysOff, 'day')), ` of actual time off. Keep those.`) : null) });
  }

  const free = s.longestFreeStreak.length;
  out.push({ theme: 'c-yellow', render: () => h('div', {}, cap('Streaks'),
    free > 0
      ? [big(free, { suffix: free === 1 ? 'day' : 'days' }), line('in a row without a single meeting.'), note(`${fmt.date(s.longestFreeStreak.start)} to ${fmt.date(s.longestFreeStreak.end)}. Remember how that felt?`)]
      : [line('Not one meeting-free day.', true), note(`Every working day${soFar} had at least one meeting in it. The longest run: `, h('b', {}, `${s.longestBusyStreak.length} days`), '.')],
  ) });

  out.push({ theme: 'c-graphite', render: () => h('div', {}, cap('Put another way'), line(`${fmt.hours(s.totalHours)} hours is roughly…`), h('ul', { class: 'equiv', ...R() }, s.equivalents.map((e) => h('li', {}, h('b', { 'data-count': e.value, 'data-decimals': Number.isInteger(e.value) ? 0 : 1 }, '0'), h('span', {}, e.label))))) });

  out.push({ theme: 'c-pink', render: () => h('div', {}, h('div', { class: 'persona-emoji', ...R() }, s.persona.emoji), cap('Your calendar persona'), line(s.persona.name, true), note(s.persona.blurb)) });

  const rec = s.reclaim;
  out.push({ theme: 'c-green', render: () => h('div', {}, cap('Next year'), big(Math.round(rec.totalHours), { suffix: 'hrs' }), line('you could realistically get back.'), note(rec.totalHours > 0 ? [`That's `, h('b', {}, `${fmt.num(rec.workingDays)} working days`), ` from ${rec.suggestions.length} specific changes, drawn from your own calendar.`] : 'Your calendar is already in good shape. The details are on your summary.')), cta: ({ finish }) => h('button', { class: 'btn btn-lg', onClick: finish }, 'See my card') });

  return out;
}

// ---------- personal ----------
function personalSlides(s) {
  const out = [];
  out.push(intro(s.year, 'in plans.', `${fmt.int(s.totalEventsInRange)} calendar entries, read on your device. Nothing uploaded. Tap to begin.`));

  out.push({ theme: 'c-blue', render: () => h('div', {}, cap('The headline'), big(s.events), line(`things in the diary${s.isPartialYear ? ', so far' : ''}.`), note(h('b', {}, `${fmt.hours(s.totalHours)} hours`), ` of planned life. Dinners, dentists and the rest.`)) });

  if (s.categories.length) {
    const max = Math.max(1, ...s.categories.map((c) => c.count));
    out.push({ theme: 'c-orange', render: () => h('div', {}, cap('Where the time went'), line(`${s.categories[0].label}, mostly.`), h('div', { style: 'display:grid; gap:14px; margin-top:28px', ...R() }, s.categories.slice(0, 5).map((c, i) => h('div', { style: 'display:grid; gap:8px' }, h('div', { style: 'display:flex; justify-content:space-between; font-size:16px' }, h('b', {}, c.label), h('span', { style: 'color:var(--smute)' }, fmt.int(c.count))), h('div', { class: 'bar' }, h('i', { style: `--v:${c.count / max}; --i:${i}` })))))) });
  }

  if (s.people.length) {
    const top = s.people[0];
    out.push({ theme: 'c-green', render: () => h('div', {}, cap('Your people'), h('h2', { class: 'line lg', ...R() }, top.name), note(h('b', {}, `${fmt.int(top.count)} plans`), ` together this year. ${s.uniquePeople} people made it into the calendar at all.`), rows(s.people.slice(0, 5), (p) => fmt.int(p.count))) });
  }

  if (s.busiestMonth) {
    out.push({ theme: 'c-indigo', render: () => h('div', {}, cap('Month by month'), line(`${s.busiestMonth.month} was the busy one.`), note(h('b', {}, `${fmt.int(s.busiestMonth.count)} things`), ` in one month.${s.busiestWeekday ? ` ${s.busiestWeekday.day}s were your busiest day of the week.` : ''}`), h('div', R(), monthChart(s.monthly, s.busiestMonth.month))) });
  }

  out.push({ theme: 'c-teal', render: () => h('div', {}, cap('Weekends'), big(s.freeWeekends), line(`${s.freeWeekends === 1 ? 'weekend' : 'weekends'} with nothing planned.`), note(`Out of ${s.totalWeekends}. ${s.freeWeekends / Math.max(1, s.totalWeekends) > 0.5 ? 'Spontaneous or sofa-bound, your call.' : 'Your weekends work harder than most people\'s weeks.'}`), h('div', { class: 'duo' }, tile(s.weekendEvents, 'weekend plans'), tile(s.eveningEvents, 'weeknight plans'))) });

  if (s.earliest && s.latest) {
    out.push({ theme: 'c-black', render: () => h('div', {}, cap('Early and late'), line('Your day, hour by hour.'), h('div', R(), heatStrip(s.byHour)), h('div', { class: 'duo' }, textTile(fmt.time(s.earliest.start), 'earliest start', s.earliest.title), textTile(fmt.time(s.latest.end), 'latest finish', s.latest.title))) });
  }

  if (s.travel.found) {
    const t = s.travel;
    out.push({ theme: 'c-purple', render: () => h('div', {}, cap('Away'), line(t.trips ? `${fmt.plural(t.trips, 'trip')} this year.` : 'Time away.', true), h('div', { class: 'duo' }, t.flights ? tile(t.flights, 'flights') : tile(t.trains, 'train journeys'), t.hotelNights ? tile(t.hotelNights, 'nights away') : tile(t.daysOff, 'days off')), t.places.length ? h('div', { class: 'chips', ...R() }, t.places.slice(0, 6).map((p) => h('span', {}, p.key))) : null) });
  }

  const rec = s.recurringSeries[0];
  out.push({ theme: 'c-yellow', render: () => h('div', {}, cap('Little things'), h('div', { class: 'duo', style: 'margin-top:0; border-top:0' }, tile(s.birthdays, 'birthdays remembered'), tile(s.longestBusyStreak.length, 'days in a row with plans')), rec ? note(`Your most faithful habit: `, h('b', {}, `“${rec.title}”`), `, ${rec.count} times.`) : null, s.longestFreeStreak.length >= 3 ? note(`Longest stretch of nothing at all: ${s.longestFreeStreak.length} days from ${fmt.date(s.longestFreeStreak.start)}.`) : null) });

  out.push({ theme: 'c-pink', render: () => h('div', {}, h('div', { class: 'persona-emoji', ...R() }, s.persona.emoji), cap('Your calendar persona'), line(s.persona.name, true), note(s.persona.blurb)) });

  out.push({ theme: 'c-green', render: () => h('div', {}, cap('Next year'), line('A few gentle nudges.', true), note(`${s.reclaim.suggestions.length} small ideas drawn from your own year, waiting on your summary. No guilt, just patterns.`)), cta: ({ finish }) => h('button', { class: 'btn btn-lg', onClick: finish }, 'See my card') });

  return out;
}

export function buildSlides(stats) {
  return stats.mode === 'work' ? workSlides(stats) : personalSlides(stats);
}

export const charts = { monthChart, weekStrip, heatStrip };
