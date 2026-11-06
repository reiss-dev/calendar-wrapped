// Full report view (unlocked). Long-form, printable to PDF via the browser.
import { h, fmt } from './ui.js';
import { t, monthName, weekdayName } from './i18n.js';
import { charts } from './slides.js';
import { CONFIG } from './config.js';
import { categoryLabel } from './copy.js';
import { yoyChange } from './stats.js';
import { reclaimList } from './reclaim-ui.js';
import { breakRows, birthdayRows, holidayLabel } from './timeoff-ui.js';
import { persona as personaOf } from './copy.js';
import { typeLabel, mixBar } from './mix-ui.js';
import { awardCopy, hasAwards } from './awards-ui.js';
import { hasWhere, whereLabel } from './where-ui.js';
import { hasHealth, healthPanel } from './health-ui.js';

const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));
const sec = (title, intro, ...body) => h('section', { class: 'report-sec' }, h('h2', {}, title), intro ? h('p', { class: 'intro' }, intro) : null, ...body);
const table = (head, rows) => h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
  h('thead', {}, h('tr', {}, head.map(([label, num]) => h('th', { class: num ? 'num' : '' }, label)))),
  h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: head[i][1] ? 'num' : '' }, c)))))));
const idx = (s, m) => (m ? m.i ?? s.monthly.findIndex((x) => x.month === m.month) : -1);

function reclaimPanel(s, ctx) {
  const rec = s.reclaim;
  const work = s.mode === 'work';
  return h('div', { class: 'panel' },
    h('div', { class: 'reclaim-head' },
      h('div', {}, h('h3', {}, work ? t('Your reclaim plan') : t('Gentle nudges')), h('p', { class: 'intro', style: 'margin:4px 0 0' }, work ? t('Ranked by hours returned. Each one comes from your own calendar, with a one-tap way to act on it.') : t('Drawn from your own patterns. Take what’s useful, ignore the rest.'))),
      rec.totalHours > 0 ? h('div', { class: 'reclaim-total' }, h('b', {}, t('{h} hrs', { h: fmt.int(rec.totalHours) })), h('span', {}, t('about {d} working days a year', { d: fmt.num(rec.workingDays) }))) : null,
    ),
    reclaimList(s, { ctx }),
  );
}

function weekdayChart(byWeekday) {
  const max = Math.max(1, ...byWeekday.map((d) => d.value));
  return h('div', { style: 'display:grid; gap:8px' }, [1, 2, 3, 4, 5, 6, 0].map((i) => {
    const d = byWeekday[i];
    return h('div', { style: 'display:grid; grid-template-columns: 44px 1fr 70px; gap:12px; align-items:center; font-size:13px' },
      h('span', { style: 'color:var(--ink-2)' }, weekdayName(i, 'short')), h('div', { class: 'bar' }, h('i', { style: `--v:${d.value / max}; animation:none` })), h('span', { style: 'text-align:right; color:var(--ink-2); font-variant-numeric:tabular-nums' }, t('{h} h', { h: fmt.hours(d.value) })));
  }));
}

export function renderReport(host, s, { onBack, unlocked, ctx = {} }) {
  host.innerHTML = '';
  const isWork = s.mode === 'work';
  const period = s.isPartialYear ? t('1 January to {date}', { date: fmt.date(s.range.end) }) : t('The whole year');
  const head = h('div', { class: 'report-head' },
    h('div', {},
      h('p', { class: 'caption' }, t('{brand}, full report', { brand: CONFIG.brand.name })),
      h('h1', {}, isWork ? t('Your {year}, in full.', { year: s.year }) : t('Your {year}, in detail.', { year: s.year })),
      h('p', { class: 'lede' }, `${period}. `, isWork ? t('{m} meetings, {h} hours.', { m: fmt.int(s.meetings), h: fmt.hours(s.totalHours) }) : t('{e} plans, {h} hours.', { e: fmt.int(s.events), h: fmt.hours(s.totalHours) }), ' ', t('Generated on your device.'))),
    h('div', { class: 'no-print', style: 'display:flex; gap:10px; flex-wrap:wrap' }, h('button', { class: 'btn btn-secondary', onClick: onBack }, t('Back to summary')), h('button', { class: 'btn', onClick: () => window.print() }, t('Save as PDF'))),
  );
  const foot = h('p', { class: 'caption', style: 'margin-top:56px' },
    t('Meetings are timed events with at least one other attendee that you didn’t decline. Working time assumes a {n}-hour week. Travel and time off are detected from titles, so treat them as a best guess.', { n: fmt.num(s.workHoursPerWeek || 40) }),
    unlocked?.preview ? ` ${t('Preview unlock: payments aren’t configured on this host.')}` : '');
  host.append(h('div', { class: `report ${isWork ? 'report-work' : 'report-personal'}` }, cover(s, period), head, ...(isWork ? workBody(s, ctx) : personalBody(s, ctx)), foot));
}

/** The printed cover: a full page in the card's two tones. Only shows on paper. */
function cover(s, period) {
  const work = s.mode === 'work';
  const P = personaOf(s.persona);
  const big = (v, l) => h('div', { class: 'cover-stat' }, h('b', {}, v), h('span', {}, l));
  return h('section', { class: 'report-cover', 'aria-hidden': 'true' },
    h('p', { class: 'cover-brand' }, CONFIG.brand.name, h('span', {}, String(s.year))),
    h('h1', {}, t('Your {year},', { year: s.year }), h('br'), work ? t('in meetings.') : t('in plans.')),
    h('div', { class: 'cover-persona' }, h('span', { class: 'cover-emoji' }, P.emoji), h('div', {}, h('small', {}, t('Your calendar persona')), h('b', {}, P.name))),
    h('div', { class: 'cover-stats' }, work
      ? [big(fmt.int(s.meetings), t('meetings')), big(fmt.int(s.totalHours), t('hours in meetings')), big(`${s.shareOfWork}%`, t('of working time')), big(fmt.int(s.reclaim?.totalHours || 0), t('hours to win back next year'))]
      : [big(fmt.int(s.events), t('plans in the diary')), big(fmt.int(s.totalHours), t('hours of planned life')), big(fmt.int(s.travel?.trips || 0), t('trips away')), big(fmt.int(s.birthdays || 0), t('birthdays remembered'))]),
    h('p', { class: 'cover-foot' }, `${period}. ${t('Generated on your device.')} ${fmt.date(new Date())}`));
}

function mixSection(s) {
  const mix = s.mix;
  if (!mix || mix.types.length < 2) return null;
  return sec(t('Who you met with'), t('Customers are anyone from outside {domain}. Internal means only colleagues.', { domain: mix.home }),
    h('div', { class: 'viz-light' }, mixBar(mix.types)),
    h('div', { class: 'two', style: 'margin-top:20px' },
      table([[t('Kind')], [t('Meetings'), 1], [t('Hours'), 1], ['%', 1]], mix.types.map((x) => [typeLabel(x), fmt.int(x.count), fmt.hours(x.hours), `${x.pct}%`])),
      mix.customers.length ? table([[t('Customer')], [t('Meetings'), 1], [t('Hours'), 1]], mix.customers.slice(0, 10).map((c) => [c.name, fmt.int(c.count), fmt.hours(c.hours)])) : null));
}
function whereSection(s) {
  if (!hasWhere(s)) return null;
  const w = s.where;
  return sec(t('Where you met'), t('{p}% of your meeting time was in person, with {d} days on site ({c} with customers).', { p: w.inPersonShare, d: fmt.int(w.onsite.days), c: fmt.int(w.customer.days) }),
    h('div', { class: 'viz-light' }, mixBar(w.types.map((x) => ({ ...x, name: whereLabel(x.key) })))),
    w.places.length ? h('div', { style: 'margin-top:20px' }, table([[t('Place')], [t('Meetings'), 1], [t('Hours'), 1]], w.places.map((p) => [p.name, fmt.int(p.count), fmt.hours(p.hours)]))) : null);
}
function awardsSection(s) {
  if (!hasAwards(s)) return null;
  return sec(t('Awards'), null, h('ol', { class: 'awards awards-light' }, s.awards.map((a) => {
    const [title, line] = awardCopy(a);
    return h('li', { class: 'award' }, h('span', { class: 'award-medal', 'aria-hidden': 'true' }, a.emoji), h('span', { class: 'award-text' }, h('b', {}, title), h('span', {}, line)));
  })));
}

function yoyStats(s) {
  const c = yoyChange(s);
  if (!c) return [];
  const sign = c.pct > 0 ? '+' : c.pct < 0 ? '−' : '';
  return [stat(`${sign}${Math.abs(c.pct)}%`, t('compared with {year}, at this pace', { year: s.yoy.year }))];
}

function workBody(s, ctx) {
  const bi = idx(s, s.busiestMonth), qi = idx(s, s.quietestMonth);
  return [
    sec(t('At a glance'), null, h('div', { class: 'stat-grid' },
      stat(fmt.int(s.meetings), t('meetings')), stat(t('{h} hrs', { h: fmt.hours(s.totalHours) }), t('in meetings')), stat(`${s.shareOfWork}%`, t('of working time')),
      stat(fmt.num(s.avgPerWorkingDay), t('per working day')), stat(t('{n} min', { n: fmt.int(s.avgLengthMin) }), t('average length')), stat(fmt.int(s.uniquePeople), t('different people')),
      stat(fmt.int(s.organized), t('you organised')), stat(fmt.int(s.declined), t('you declined')), stat(fmt.int(s.unanswered), t('never answered')),
      ...yoyStats(s))),
    hasHealth(s) ? h('section', { class: 'report-sec' }, healthPanel(s)) : null,
    awardsSection(s),
    sec(t('Reclaim'), null, reclaimPanel(s, ctx)),
    mixSection(s),
    whereSection(s),
    sec(t('Through the year'), bi >= 0 ? (qi >= 0 ? t('{a} was the heaviest month, {b} the lightest.', { a: monthName(bi), b: monthName(qi) }) : t('{a} was the heaviest month.', { a: monthName(bi) })) : null,
      charts.monthChart(s.monthly, bi),
      h('div', { class: 'two', style: 'margin-top:20px' },
        h('div', { class: 'panel' }, h('h3', {}, t('Hours by weekday')), weekdayChart(s.byWeekday)),
        h('div', { class: 'panel' }, h('h3', {}, t('Meetings by hour of day')), charts.heatStrip(s.byHour), h('p', { class: 'intro', style: 'margin:14px 0 0; font-size:13px' },
          t('Earliest start {a}, latest finish {b}. {e} before 8am, {l} past 6pm, {f} on Friday afternoons.', { a: s.earliest ? fmt.time(s.earliest.start) : '—', b: s.latest ? fmt.time(s.latest.end) : '—', e: fmt.int(s.earlyMeetings), l: fmt.int(s.lateMeetings), f: fmt.int(s.fridayPm) }))),
      )),
    sec(t('Worst weeks'), t('Hours in meetings per week. The highlighted bar is the worst.'), charts.weekStrip(s.weekly, s.worstWeek),
      h('div', { style: 'margin-top:20px' }, table([[t('Week')], [t('Meetings'), 1], [t('Hours'), 1]], [...s.weekly].sort((a, b) => b.hours - a.hours).slice(0, 5).map((w) => [fmt.weekRange(w.start), fmt.int(w.count), fmt.hours(w.hours)])))),
    sec(t('Recurring meetings'), t('{n} series made up {p}% of your meeting time. This is where the hours hide.', { n: fmt.int(s.recurringCount), p: s.recurringShare }),
      table([[t('Series')], [t('Times'), 1], [t('Length'), 1], [t('People'), 1], [t('Hours'), 1]], s.recurringSeries.map((r) => [h('span', {}, r.title, r.organizedBySelf ? h('span', { class: 'muted' }, ` · ${t('yours')}`) : null), fmt.int(r.count), t('{n} min', { n: r.durationMin }), fmt.int(r.attendees), fmt.hours(r.hours)]))),
    sec(t('People'), t('{n} different people in meetings of 25 or fewer, {o} one-to-ones ({h} hours), {l} meetings with eight or more people.', { n: fmt.int(s.uniquePeople), o: fmt.int(s.oneToOnes), h: fmt.hours(s.oneToOneHours), l: fmt.int(s.largeMeetings) }),
      table([[t('Person')], [t('Meetings'), 1], [t('Hours'), 1], [t('Last seen'), 1]], s.collaborators.map((p) => [p.name, fmt.int(p.count), fmt.hours(p.hours), h('span', { class: 'muted' }, fmt.date(p.lastSeen))]))),
    sec(t('Titles'), t('What you called it.'), table([[t('Title')], [t('Times'), 1]], s.topTitles.map((x) => [x.key, `${fmt.int(x.count)}×`]))),
    s.travel.found ? sec(t('Travel and time off'), t('Detected from flight, train, hotel and leave entries.'), h('div', { class: 'stat-grid' }, stat(fmt.int(s.travel.trips), t('trips')), stat(fmt.int(s.travel.flights), t('flights')), stat(fmt.int(s.travel.trains), t('train journeys')), stat(fmt.int(s.travel.hotelNights), t('hotel nights')), stat(fmt.int(s.travel.daysOff), t('days off'))), s.travel.places.length ? h('div', { class: 'chips-light' }, s.travel.places.map((p) => h('span', {}, `${p.key} · ${p.count}`))) : null) : null,
    s.timeOff?.breaks.length ? sec(t('Every break'), t('{n} days of leave taken, {b} booked, {s} sick.', { n: fmt.int(s.timeOff.taken), b: fmt.int(s.timeOff.booked), s: fmt.int(s.timeOff.sick) }),
      table([[t('Where')], [t('When')], [t('Leave'), 1], [t('Days off'), 1]], breakRows(s))) : null,
    s.timeOff?.plan.length ? sec(t('Your smartest days off in {year}', { year: s.timeOff.planYear }), null,
      table([[t('Holiday')], [t('Book')], [t('Days off'), 1]], s.timeOff.plan.map((p) => [holidayLabel(p.group), `${fmt.date(new Date(`${p.leave[0]}T12:00:00`))} – ${fmt.date(new Date(`${p.leave[p.leave.length - 1]}T12:00:00`))}`, `${p.off} (${t('{n} of leave', { n: p.take })})`]))) : null,
    s.birthdayInfo?.count ? sec(t('Birthdays'), null, table([[t('Who')], [t('Date')], [t('Age'), 1]], birthdayRows(s))) : null,
    sec(t('Streaks and habits'), null, h('div', { class: 'stat-grid' }, stat(fmt.int(s.longestFreeStreak.length), t('longest run of meeting-free workdays')), stat(fmt.int(s.longestBusyStreak.length), t('longest run of workdays with meetings')), stat(fmt.int(s.backToBack), t('back-to-back transitions')), stat(fmt.int(s.fragmentedDays), t('days with no 2-hour gap')), stat(fmt.int(s.noAgenda), t('group meetings with no agenda')), stat(fmt.int(s.weekendMeetings), t('weekend meetings')))),
  ];
}

function personalBody(s, ctx) {
  const max = Math.max(1, ...s.categories.map((c) => c.count));
  const bi = idx(s, s.busiestMonth);
  return [
    sec(t('At a glance'), null, h('div', { class: 'stat-grid' }, stat(fmt.int(s.events), t('plans')), stat(t('{h} hrs', { h: fmt.hours(s.totalHours) }), t('planned time')), stat(fmt.int(s.uniquePeople), t('people')), stat(t('{a} of {b}', { a: s.freeWeekends, b: s.totalWeekends }), t('free weekends')), stat(fmt.int(s.eveningEvents), t('weeknight plans')), stat(fmt.int(s.birthdays), t('birthdays')), ...yoyStats(s))),
    hasHealth(s) ? h('section', { class: 'report-sec' }, healthPanel(s)) : null,
    awardsSection(s),
    sec(t('Nudges'), null, reclaimPanel(s, ctx)),
    sec(t('Where the time went'), null, h('div', { class: 'panel' }, h('div', { style: 'display:grid; gap:10px' }, s.categories.map((c) => h('div', { style: 'display:grid; grid-template-columns: 170px 1fr 110px; gap:12px; align-items:center; font-size:14px' }, h('span', {}, categoryLabel(c.key)), h('div', { class: 'bar' }, h('i', { style: `--v:${c.count / max}; animation:none` })), h('span', { style: 'text-align:right; color:var(--ink-2)' }, t('{n}, {h} hrs', { n: fmt.int(c.count), h: fmt.hours(c.hours) }))))))),
    sec(t('Through the year'), bi >= 0 ? t('{a} was the busiest month.', { a: monthName(bi) }) : null, charts.monthChart(s.monthly, bi), h('div', { class: 'two', style: 'margin-top:20px' }, h('div', { class: 'panel' }, h('h3', {}, t('Hours by weekday')), weekdayChart(s.byWeekday)), h('div', { class: 'panel' }, h('h3', {}, t('Plans by hour of day')), charts.heatStrip(s.byHour)))),
    sec(t('People'), null, table([[t('Person')], [t('Plans'), 1], [t('Hours'), 1], [t('Last seen'), 1]], s.people.map((p) => [p.name, fmt.int(p.count), fmt.hours(p.hours), h('span', { class: 'muted' }, fmt.date(p.lastSeen))]))),
    sec(t('Habits'), null, table([[t('Recurring')], [t('Times'), 1], [t('Hours'), 1]], s.recurringSeries.map((r) => [r.title, fmt.int(r.count), fmt.hours(r.hours)]))),
    s.travel.found ? sec(t('Away'), null, h('div', { class: 'stat-grid' }, stat(fmt.int(s.travel.trips), t('trips')), stat(fmt.int(s.travel.flights), t('flights')), stat(fmt.int(s.travel.hotelNights), t('nights away')), stat(fmt.int(s.travel.daysOff), t('days off'))), s.travel.places.length ? h('div', { class: 'chips-light' }, s.travel.places.map((p) => h('span', {}, p.key))) : null) : null,
    s.timeOff?.breaks.length ? sec(t('Every break'), t('{n} days of leave taken, {b} booked, {s} sick.', { n: fmt.int(s.timeOff.taken), b: fmt.int(s.timeOff.booked), s: fmt.int(s.timeOff.sick) }),
      table([[t('Where')], [t('When')], [t('Leave'), 1], [t('Days off'), 1]], breakRows(s))) : null,
    s.timeOff?.plan.length ? sec(t('Your smartest days off in {year}', { year: s.timeOff.planYear }), null,
      table([[t('Holiday')], [t('Book')], [t('Days off'), 1]], s.timeOff.plan.map((p) => [holidayLabel(p.group), `${fmt.date(new Date(`${p.leave[0]}T12:00:00`))} – ${fmt.date(new Date(`${p.leave[p.leave.length - 1]}T12:00:00`))}`, `${p.off} (${t('{n} of leave', { n: p.take })})`]))) : null,
    s.birthdayInfo?.count ? sec(t('Birthdays'), null, table([[t('Who')], [t('Date')], [t('Age'), 1]], birthdayRows(s))) : null,
  ];
}
