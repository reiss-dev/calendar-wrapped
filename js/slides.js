// Builds the slide sequence from computed stats. Each slide: { theme, render(), cta? }.
// Visual language: one flat colour per slide, system type, one idea per screen.
import { h, svg, fmt } from './ui.js';
import { CONFIG } from './config.js';
import { t, tn, monthName, weekdayName } from './i18n.js';
import { persona as personaOf, categoryLabel, equivalentLabel } from './copy.js';
import { yoyChange, dayCoverage } from './stats.js';
import { createGlobe } from './globe.js';
import { timeOffSlide, planSlide, birthdaySlide, hasTimeOff, hasBirthdays } from './timeoff-ui.js';
import { highlightsSlide, showHighlights } from './extras.js';
import { balanceSlide } from './calendars-ui.js';
import { monthGrid, heatLegend, radialClock, bubbles, treemap, pictogram, travelArcs, confetti, dotMatrix, weeksBar, chain, barRace, hourBlocks, personaStamp } from './viz.js';
import { sound } from './sound.js';

const R = (attrs = {}) => ({ 'data-reveal': '', ...attrs });
const narrow = (i) => monthName(i, 'narrow');

// ---------- chart builders ----------
function monthChart(monthly, highlightIndex) {
  const W = 600, H = 150, pad = 8, bw = (W - pad * 11) / 12;
  const max = Math.max(1, ...monthly.map((m) => m.value));
  const now = new Date();
  const s = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H + 26}`, 'aria-hidden': 'true' });
  monthly.forEach((m, i) => {
    const x = i * (bw + pad);
    const hgt = (m.value / max) * H;
    const future = new Date(m.year, i, 1) > now;
    const cls = future ? 'ghost' : i === highlightIndex ? '' : 'dim';
    s.append(
      svg('rect', { class: `bar-rect ${cls}`, x, y: H - (future ? 4 : Math.max(4, hgt)), width: bw, height: future ? 4 : Math.max(4, hgt), rx: 5, style: `--i:${i}; transform-origin: ${x + bw / 2}px ${H}px` }),
      svg('text', { x: x + bw / 2, y: H + 19, 'text-anchor': 'middle', class: i === highlightIndex ? 'hl' : '' }, narrow(i)),
    );
  });
  return s;
}

function weekStrip(weekly, worst) {
  const W = 600, H = 110, gap = 3;
  const n = Math.max(1, weekly.length);
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...weekly.map((w) => w.hours));
  const s = svg('svg', { class: 'chart chart-weeks', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  weekly.forEach((w, i) => {
    const x = i * (bw + gap);
    const hgt = Math.max(3, (w.hours / max) * H);
    const isWorst = worst && new Date(w.start).getTime() === new Date(worst.start).getTime();
    s.append(svg('rect', { class: `bar-rect ${isWorst ? 'worst' : 'dim'}`, x, y: H - hgt, width: bw, height: hgt, rx: 2, style: `--i:${Math.min(i, 12)}; transform-origin: ${x}px ${H}px` }));
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
const big = (value, { suffix = '' } = {}) => h('p', { class: 'big', ...R() }, h('span', { 'data-count': value }, '0'), suffix ? h('small', {}, suffix) : null);
const bigPct = (value) => h('p', { class: 'big', ...R() }, h('span', { 'data-count': value, 'data-suffix': '%' }, '0%'));
const cap = (s) => h('p', { class: 'cap', ...R() }, s);
const line = (s, lg = false) => h('h2', { class: `line${lg ? ' lg' : ''}`, ...R() }, s);
const note = (...c) => h('p', { class: 'note', ...R() }, ...c);
/** A translated sentence with **bold** parts, e.g. t('About **{n}** a day') */
const rich = (str) => str.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? h('b', {}, part) : part));
const hrs = () => t('hrs');

const dayKey = (d) => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** The day-by-day headline: how few days escaped. */
export function coverageLine(s) {
  const c = dayCoverage(s);
  if (c.of && c.n >= c.of) return c.work ? t('A meeting on every single working day.') : t('Something on every single day.');
  return c.work ? t('Meetings on {n} of your {d} working days.', { n: fmt.int(c.n), d: fmt.int(c.of) }) : t('Something on {n} of {d} days.', { n: fmt.int(c.n), d: fmt.int(c.of) });
}
function heatSlide(s) {
  const work = s.mode === 'work';
  const peakEntry = Object.entries(s.daily || {}).sort((a, b) => b[1] - a[1])[0];
  return {
    theme: 'c-black',
    render: () => h('div', { class: 'wide' },
      cap(t('Day by day')),
      line(coverageLine(s)),
      h('div', { class: 'viz-wrap fill', ...R() }, monthGrid(s.daily || {}, s.year, { unit: work ? 'h' : 'n', peak: peakEntry?.[0] })),
      h('div', R(), heatLegend()),
      peakEntry ? note(...rich(work
        ? t('Your heaviest day: **{date}**, with {h} hours of meetings.', { date: fmt.dateLong(new Date(`${peakEntry[0]}T12:00:00`)), h: fmt.num(peakEntry[1]) })
        : t('Your busiest day: **{date}**, with {n} things on.', { date: fmt.dateLong(new Date(`${peakEntry[0]}T12:00:00`)), n: fmt.int(peakEntry[1]) }))) : null,
    ),
  };
}


function globeSlide(s, capText) {
  const r = s.travel.routes;
  const around = r.aroundEarth >= 1
    ? t('That’s {x} times around the world.', { x: fmt.num(r.aroundEarth) })
    : t('That’s {p}% of the way around the world.', { p: fmt.int(Math.max(1, Math.round(r.aroundEarth * 100))) });
  let globe = null;
  return {
    theme: 'c-indigo',
    onEnter: (el) => { globe?.destroy(); const c = el.querySelector('canvas.globe'); if (c) createGlobe(c, r).then((g) => { globe = g; }); },
    onLeave: () => { globe?.destroy(); globe = null; },
    render: () => h('div', {},
      cap(capText),
      line(t('{km} km in the air.', { km: fmt.int(r.km) })),
      note(around, ' ', r.longest ? t('Longest flight: {from} to {to}, {km} km.', { from: r.longest.from.name, to: r.longest.to.name, km: fmt.int(r.longest.km) }) : ''),
      h('div', { class: 'globe-wrap', 'data-noadvance': '', ...R() }, h('canvas', { class: 'globe', 'aria-label': t('Your year in the air') })),
      h('div', { class: 'duo' }, tile(r.legs.length, t('flights')), tile(r.cities, t('cities'))),
    ),
  };
}

// A thud: the page jolts and the phone taps when something lands.
function thudAt(el, ms) {
  clearTimeout(el._thud);
  el._thud = setTimeout(() => { el.classList.remove('thud'); void el.offsetWidth; el.classList.add('thud'); sound.thud(); }, ms);
}
const personaSlide = (s, P) => ({
  theme: 'c-pink',
  onEnter: (el) => { thudAt(el, 760); clearTimeout(el._conf); el._conf = setTimeout(() => confetti(el), 820); },
  render: () => h('div', {},
    h('div', { class: 'viz-wrap fill stamp-wrap', ...R() }, personaStamp(P.emoji, `${CONFIG.brand.name} · ${s.year} · ${P.name} · `.toLocaleUpperCase())),
    cap(t('Your calendar persona')), line(P.name, true), note(P.blurb)),
});

const intro = (year, what, sub) => ({
  theme: 'c-black',
  render: () => h('div', {}, cap(CONFIG.brand.name), h('h1', { class: 'line lg', ...R() }, t('Your {year},', { year }), h('br'), what), note(sub)),
});

function yoySlide(s) {
  const c = yoyChange(s);
  if (!c || Math.abs(c.pct) < 3) return null;
  const up = c.pct > 0;
  return {
    theme: up ? 'c-orange' : 'c-teal',
    render: () => h('div', {},
      cap(t('Compared with {year}', { year: s.yoy.year })),
      h('p', { class: 'big', ...R() }, h('span', {}, up ? '+' : '−'), h('span', { 'data-count': Math.abs(c.pct), 'data-suffix': '%' }, '0%')),
      line(s.mode === 'work' ? (up ? t('more time in meetings than last year.') : t('less time in meetings than last year.')) : (up ? t('more plans than last year.') : t('fewer plans than last year.'))),
      note(...rich(s.mode === 'work'
        ? t('**{before} hours** last year. At this pace, about **{now}** this year.', { before: fmt.int(c.before), now: fmt.int(c.projected) })
        : t('**{before} plans** last year. At this pace, about **{now}** this year.', { before: fmt.int(c.before), now: fmt.int(c.projected) }))),
    ),
  };
}

// ---------- work ----------
function workSlides(s) {
  const out = [];
  const P = personaOf(s.persona);
  out.push(intro(s.year, t('in meetings.'), t('{n} calendar entries, read on your device. Nothing uploaded. Tap to begin.', { n: fmt.int(s.totalEventsInRange) })));

  out.push({ theme: 'c-blue', render: () => h('div', {}, cap(t('The headline')), big(s.meetings), line(s.isPartialYear ? t('meetings this year, so far.') : t('meetings this year.')), note(...rich(t('About **{n}** a working day, averaging **{m} minutes** each.', { n: fmt.num(s.avgPerWorkingDay), m: fmt.int(s.avgLengthMin) }))), h('div', { class: 'viz-wrap', ...R() }, dotMatrix(s.meetings))) });

  out.push(heatSlide(s));

  out.push({ theme: 'c-indigo', render: () => h('div', {}, cap(t('Time spent')), big(Math.round(s.totalHours), { suffix: hrs() }), line(t('in a room, or on a call, with other people.')), note(...rich(t('Roughly **{n} full working weeks** of talking.', { n: fmt.num(s.workingWeeksEquivalent) }))), h('div', { class: 'viz-wrap', ...R() }, weeksBar(s.workingWeeksEquivalent))) });

  const yoy = yoySlide(s);
  if (yoy) out.push(yoy);

  const shareLine = s.shareOfWork >= 50 ? t('Most of your job is meetings now. Somebody should put that in the job description.')
    : s.shareOfWork >= 35 ? t('A third of your week, gone before you open a document. Respectable. Dangerous.')
    : s.shareOfWork >= 20 ? t('Enough to stay in the loop. Not quite enough to drown.')
    : t('Rare and precious. You actually get to do the work. Guard it.');
  out.push({ theme: 'c-white', render: () => h('div', {}, cap(t('Your working time')), ring(s.shareOfWork), line(t('of your working hours were meetings.')), note(shareLine, ' ', t('Based on a {n}-hour week.', { n: fmt.num(s.workHoursPerWeek || 40) }))) });

  if (s.worstWeek) {
    out.push({ theme: 'c-pink', onEnter: (el) => thudAt(el, 1180), render: () => h('div', {}, cap(t('The worst week')), h('h2', { class: 'line lg', ...R() }, fmt.weekRange(s.worstWeek.start)), big(Math.round(s.worstWeek.hours), { suffix: hrs() }), note(...rich(t('**{n} meetings** in five days. Every other week, for scale:', { n: fmt.int(s.worstWeek.count) }))), h('div', { class: 'viz-wrap fill weeks-wrap', ...R() }, weekStrip(s.weekly, s.worstWeek))) });
  }

  out.push({ theme: 'c-orange', render: () => h('div', {}, cap(t('No breathing room')), big(s.backToBack), line(t('times you went straight into the next one.')), s.longestChain.length > 1 ? h('div', { class: 'viz-wrap', ...R() }, chain(s.longestChain.length)) : null, h('div', { class: 'duo' }, tile(s.longestChain.length, t('longest chain'), s.longestChain.date ? fmt.dateLong(s.longestChain.date) : ''), tile(s.backToBackDays, t('wall-to-wall days'), t('three or more in a row')))) });

  if (s.topTitles.length) {
    const top = s.topTitles[0];
    const quip = /sync|catch ?up|check ?in|touch ?base|overleg|afstemming|avstämning|møte|møde/i.test(top.key) ? t('Of course it was.') : /stand ?up|daily/i.test(top.key) ? t('Every. Single. Day.') : /1:1|1-1|one.to.one/i.test(top.key) ? t('At least it was personal.') : t('A classic.');
    out.push({ theme: 'c-graphite', render: () => h('div', {}, cap(t('Most common title')), h('h2', { class: 'line lg', ...R() }, `“${top.key}”`), note(quip, ' ', ...rich(t('**{n} times**.', { n: fmt.int(top.count) }))), h('div', R(), barRace(s.topTitles.map((x) => ({ label: x.key, value: x.count, sub: `${fmt.int(x.count)}×` }))))) });
  }

  if (s.collaborators.length) {
    const top = s.collaborators[0];
    out.push({ theme: 'c-green', render: () => h('div', {}, cap(t('Most seen')), h('h2', { class: 'line lg', ...R() }, top.name), note(...rich(t('**{n} meetings** together, {h} hours. More than most people see their family.', { n: fmt.int(top.count), h: fmt.hours(top.hours) }))), h('div', { class: 'viz-wrap fill bubbles-wrap', ...R() }, bubbles(s.collaborators.map((p) => ({ label: p.name, value: p.count, sub: fmt.int(p.count) })), { max: 9 }))) });
  }

  if (s.recurringCount) {
    const r = s.recurringSeries[0];
    out.push({ theme: 'c-teal', render: () => h('div', {}, cap(t('Same time next week?')), bigPct(s.recurringShare), line(t('of your meeting time was on repeat.')), note(...rich(t('{n} recurring series. The heaviest: **“{title}”**, {h} hours across {c} sittings.', { n: fmt.int(s.recurringCount), title: r.title, h: fmt.hours(r.hours), c: fmt.int(r.count) }))), h('div', { class: 'viz-wrap fill', ...R() }, treemap(s.recurringSeries.map((x) => ({ label: x.title, value: x.hours, sub: t('{h} hrs', { h: fmt.hours(x.hours) }) })), { H: 300 }))) });
  }

  if (s.earliest && s.latest) {
    out.push({ theme: 'c-black', render: () => h('div', {}, cap(t('When you meet')), line(t('Your day, hour by hour.')), h('div', { class: 'viz-wrap fill clock-wrap', ...R() }, radialClock(s.byHour)), h('div', { class: 'duo' }, textTile(fmt.time(s.earliest.start), t('earliest start'), s.earliest.title), textTile(fmt.time(s.latest.end), t('latest finish'), s.latest.title))) });
  }

  if (s.busiestMonth) {
    const bi = s.busiestMonth.i ?? s.monthly.findIndex((m) => m.month === s.busiestMonth.month);
    const qi = s.quietestMonth ? (s.quietestMonth.i ?? s.monthly.findIndex((m) => m.month === s.quietestMonth.month)) : -1;
    out.push({ theme: 'c-blue', render: () => h('div', {}, cap(t('Month by month')), line(t('{month} was the big one.', { month: monthName(bi) })), note(...rich(t('**{n} hours** of meetings.', { n: fmt.hours(s.busiestMonth.value) }))), qi >= 0 && qi !== bi ? note(t('{month} was the quietest, at {n}.', { month: monthName(qi), n: fmt.hours(s.quietestMonth.value) })) : null, h('div', R(), monthChart(s.monthly, bi))) });
  }

  if (s.travel.routes) out.push(globeSlide(s, t('On the move')));
  else if (s.travel.found) {
    const tr = s.travel;
    out.push({ theme: 'c-purple', render: () => h('div', {}, cap(t('On the move')), line(tr.trips ? tn('{n} trip this year.', '{n} trips this year.', tr.trips) : t('Time away.'), true), h('div', { class: 'duo' }, tr.flights ? tile(tr.flights, t('flights')) : tile(tr.trains, t('train journeys')), tr.hotelNights ? tile(tr.hotelNights, t('nights in hotels')) : tile(tr.daysOff, t('days off'))), tr.places.length >= 2 ? h('div', { class: 'viz-wrap', ...R() }, travelArcs(tr.places)) : tr.places.length ? h('div', { class: 'chips', ...R() }, tr.places.map((p) => h('span', {}, p.key))) : null, tr.daysOff && tr.hotelNights && !hasTimeOff(s) ? note(...rich(t('Plus **{n}** of actual time off. Keep those.', { n: tn('{n} day', '{n} days', tr.daysOff) }))) : null) });
  }
  if (hasTimeOff(s)) out.push(timeOffSlide(s));
  if (s.balance) out.push(balanceSlide(s));
  if (hasBirthdays(s)) out.push(birthdaySlide(s));

  const free = s.longestFreeStreak.length;
  out.push({ theme: 'c-yellow', render: () => h('div', {}, cap(t('Streaks')),
    free > 0
      ? [big(free, { suffix: free === 1 ? t('day') : t('days') }), line(t('in a row without a single meeting.')), note(t('{from} to {to}. Remember how that felt?', { from: fmt.date(s.longestFreeStreak.start), to: fmt.date(s.longestFreeStreak.end) }))]
      : [line(t('Not one meeting-free day.'), true), note(...rich(s.isPartialYear ? t('Every working day so far had at least one meeting. The longest run: **{n} days**.', { n: fmt.int(s.longestBusyStreak.length) }) : t('Every working day had at least one meeting. The longest run: **{n} days**.', { n: fmt.int(s.longestBusyStreak.length) })))],
  ) });

  out.push({ theme: 'c-graphite', render: () => h('div', {}, cap(t('Put another way')), line(t('{n} hours is roughly…', { n: fmt.hours(s.totalHours) })), h('ul', { class: 'equiv', ...R() }, s.equivalents.map((e) => h('li', {}, h('div', { class: 'eq-head' }, h('b', { 'data-count': e.value, 'data-decimals': Number.isInteger(e.value) ? 0 : 1 }, '0'), h('span', {}, equivalentLabel(e.key || e.label))), e.key ? pictogram(e.key, e.value, { cap: 22 }) : null)))) });

  if (showHighlights(s)) out.push(highlightsSlide(s));
  const plan = s.timeOff && planSlide(s);
  if (plan) out.push(plan);

  out.push(personaSlide(s, P));

  const rec = s.reclaim;
  out.push({ theme: 'c-green', render: () => h('div', {}, cap(t('Next year')), big(Math.round(rec.totalHours), { suffix: hrs() }), line(t('you could realistically get back.')), note(...(rec.totalHours > 0 ? rich(t('That’s **{d} working days** from {n} specific changes, drawn from your own calendar.', { d: fmt.num(rec.workingDays), n: fmt.int(rec.suggestions.length) })) : [t('Your calendar is already in good shape. The details are on your summary.')])), rec.totalHours > 0 ? h('div', { class: 'viz-wrap', ...R() }, hourBlocks(s.totalHours * (s.daysCovered ? 365 / Math.max(30, s.daysCovered) : 1), rec.totalHours)) : null), cta: ({ finish }) => h('button', { class: 'btn btn-lg', onClick: finish }, t('See my card')) });

  return out;
}

// ---------- personal ----------
function personalSlides(s) {
  const out = [];
  const P = personaOf(s.persona);
  out.push(intro(s.year, t('in plans.'), t('{n} calendar entries, read on your device. Nothing uploaded. Tap to begin.', { n: fmt.int(s.totalEventsInRange) })));

  out.push({ theme: 'c-blue', render: () => h('div', {}, cap(t('The headline')), big(s.events), line(s.isPartialYear ? t('things in the diary, so far.') : t('things in the diary.')), note(...rich(t('**{n} hours** of planned life. Dinners, dentists and the rest.', { n: fmt.hours(s.totalHours) })))) });

  out.push(heatSlide(s));

  const yoy = yoySlide(s);
  if (yoy) out.push(yoy);

  if (s.categories.length) {
    out.push({ theme: 'c-orange', render: () => h('div', {}, cap(t('Where the time went')), line(t('{category}, mostly.', { category: categoryLabel(s.categories[0].key) })), h('div', { class: 'viz-wrap fill', ...R() }, treemap(s.categories.map((c) => ({ label: categoryLabel(c.key), value: c.count, sub: fmt.int(c.count) })), { H: 300 }))) });
  }

  if (s.people.length) {
    const top = s.people[0];
    out.push({ theme: 'c-green', render: () => h('div', {}, cap(t('Your people')), h('h2', { class: 'line lg', ...R() }, top.name), note(...rich(t('**{n} plans** together this year. {p} people made it into the calendar at all.', { n: fmt.int(top.count), p: fmt.int(s.uniquePeople) }))), h('div', { class: 'viz-wrap fill bubbles-wrap', ...R() }, bubbles(s.people.map((p) => ({ label: p.name, value: p.count, sub: fmt.int(p.count) })), { max: 9 }))) });
  }
  if (hasBirthdays(s)) out.push(birthdaySlide(s));

  if (s.busiestMonth) {
    const bi = s.busiestMonth.i ?? s.monthly.findIndex((m) => m.month === s.busiestMonth.month);
    out.push({ theme: 'c-indigo', render: () => h('div', {}, cap(t('Month by month')), line(t('{month} was the busy one.', { month: monthName(bi) })), note(...rich(t('**{n} things** in one month.', { n: fmt.int(s.busiestMonth.count) }))), s.busiestWeekday ? note(t('{day}s were your busiest day of the week.', { day: weekdayName(s.busiestWeekday.i ?? 0) })) : null, h('div', R(), monthChart(s.monthly, bi))) });
  }

  out.push({ theme: 'c-teal', render: () => h('div', {}, cap(t('Weekends')), big(s.freeWeekends), line(s.freeWeekends === 1 ? t('weekend with nothing planned.') : t('weekends with nothing planned.')), note(t('Out of {n}.', { n: fmt.int(s.totalWeekends) }), ' ', s.freeWeekends / Math.max(1, s.totalWeekends) > 0.5 ? t('Spontaneous or sofa-bound, your call.') : t('Your weekends work harder than most people’s weeks.')), h('div', { class: 'duo' }, tile(s.weekendEvents, t('weekend plans')), tile(s.eveningEvents, t('weeknight plans')))) });

  if (s.earliest && s.latest) {
    out.push({ theme: 'c-black', render: () => h('div', {}, cap(t('Early and late')), line(t('Your day, hour by hour.')), h('div', { class: 'viz-wrap fill clock-wrap', ...R() }, radialClock(s.byHour)), h('div', { class: 'duo' }, textTile(fmt.time(s.earliest.start), t('earliest start'), s.earliest.title), textTile(fmt.time(s.latest.end), t('latest finish'), s.latest.title))) });
  }

  if (s.travel.routes) out.push(globeSlide(s, t('Away')));
  else if (s.travel.found) {
    const tr = s.travel;
    out.push({ theme: 'c-purple', render: () => h('div', {}, cap(t('Away')), line(tr.trips ? tn('{n} trip this year.', '{n} trips this year.', tr.trips) : t('Time away.'), true), h('div', { class: 'duo' }, tr.flights ? tile(tr.flights, t('flights')) : tile(tr.trains, t('train journeys')), tr.hotelNights ? tile(tr.hotelNights, t('nights away')) : tile(tr.daysOff, t('days off'))), tr.places.length >= 2 ? h('div', { class: 'viz-wrap', ...R() }, travelArcs(tr.places)) : tr.places.length ? h('div', { class: 'chips', ...R() }, tr.places.map((p) => h('span', {}, p.key))) : null) });
  }
  if (hasTimeOff(s)) out.push(timeOffSlide(s));
  if (s.balance) out.push(balanceSlide(s));

  const rec = s.recurringSeries[0];
  out.push({ theme: 'c-yellow', render: () => h('div', {}, cap(t('Little things')), h('div', { class: 'duo', style: 'margin-top:0; border-top:0' }, hasBirthdays(s) ? tile(s.uniquePeople, t('people')) : tile(s.birthdays, t('birthdays remembered')), tile(s.longestBusyStreak.length, t('days in a row with plans'))), rec ? note(...rich(t('Your most faithful habit: **“{title}”**, {n} times.', { title: rec.title, n: fmt.int(rec.count) }))) : null, s.longestFreeStreak.length >= 3 ? note(t('Longest stretch of nothing at all: {n} days from {from}.', { n: fmt.int(s.longestFreeStreak.length), from: fmt.date(s.longestFreeStreak.start) })) : null) });

  if (showHighlights(s)) out.push(highlightsSlide(s));
  const plan = s.timeOff && planSlide(s);
  if (plan) out.push(plan);

  out.push(personaSlide(s, P));

  out.push({ theme: 'c-green', render: () => h('div', {}, cap(t('Next year')), line(t('A few gentle nudges.'), true), note(tn('{n} small idea drawn from your own year, waiting on your summary. No guilt, just patterns.', '{n} small ideas drawn from your own year, waiting on your summary. No guilt, just patterns.', s.reclaim.suggestions.length))), cta: ({ finish }) => h('button', { class: 'btn btn-lg', onClick: finish }, t('See my card')) });

  return out;
}

export function buildSlides(stats) {
  return stats.mode === 'work' ? workSlides(stats) : personalSlides(stats);
}

export const charts = { monthChart, weekStrip, heatStrip };
