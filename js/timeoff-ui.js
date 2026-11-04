// Time off, the next-year planner and birthdays: story slides and summary panels.
import { h, fmt, toast } from './ui.js';
import { t, tn, monthName, localeTag } from './i18n.js';
import { CONFIG } from './config.js';
import { leaveYear, leaveLegend, breakStrip, breakLegend, birthdayWheel } from './viz.js';
import { leaveIcs } from './actions.js';
import { track } from './analytics.js';

const R = (attrs = {}) => ({ 'data-reveal': '', ...attrs });
const d = (k) => new Date(`${k}T12:00:00`);
const range = (a, b) => t('{from} to {to}', { from: fmt.date(d(a)), to: fmt.date(d(b)) });
const rich = (str) => str.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? h('b', {}, part) : part));

export function holidayLabel(group) {
  return {
    newyear: t('New Year'), easter: t('Easter'), earlymay: t('Early May'), latemay: t('Late May'), summer: t('August bank holiday'),
    christmas: t('Christmas'), kings: t('King’s Day'), liberation: t('Liberation Day'), ascension: t('Ascension'), whitsun: t('Whitsun'),
    epiphany: t('Epiphany'), mayday: t('May Day'), national: t('National Day'), midsummer: t('Midsummer'), allsaints: t('All Saints'),
    constitution: t('Constitution Day'), prayer: t('Great Prayer Day'),
  }[group] || group;
}
export function countryName(code) {
  try { return new Intl.DisplayNames([localeTag()], { type: 'region' }).of(code); } catch { return code; }
}
/** The best few windows by days gained, back in date order. */
export const topPlan = (plan, n = 3) => [...plan].sort((a, b) => (b.off - b.take) - (a.off - a.take) || (a.start < b.start ? -1 : 1)).slice(0, n).sort((a, b) => (a.start < b.start ? -1 : 1));
export const hasTimeOff = (s) => !!s.timeOff && s.timeOff.taken >= 2;
export const hasBirthdays = (s) => !!s.birthdayInfo && s.birthdayInfo.count >= 3;

function longestLine(o) {
  const L = o.longest;
  if (!L) return null;
  return L.label
    ? t('Longest break: **{n} days** in {place}, {range}.', { n: fmt.int(L.span), place: L.label, range: range(L.start, L.end) })
    : t('Longest break: **{n} days**, {range}.', { n: fmt.int(L.span), range: range(L.start, L.end) });
}
function gapLine(o) {
  const g = o.longestGap;
  if (!g) return null;
  return g.ongoing
    ? t('You’ve gone **{n} weeks** without a day off. Book something.', { n: fmt.int(g.weeks) })
    : t('Longest stretch without a day off: **{n} weeks**, {range}.', { n: fmt.int(g.weeks), range: range(g.from, g.to) });
}
function planRow(p, { actions = false } = {}) {
  const add = actions ? h('button', { class: 'link plan-add', onClick: () => {
    const ics = leaveIcs({ title: t('Holiday (pencilled in)'), start: p.leave[0], end: p.leave[p.leave.length - 1], description: t('Take {take}, get {off} days off', { take: p.take, off: p.off }) + ` · ${CONFIG.brand.name}` });
    const a = h('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: `holiday-${p.start}.ics` });
    document.body.append(a); a.click(); a.remove();
    track('action_used');
    toast(t('Open the file to add it to your calendar.'));
  } }, t('Add to calendar')) : null;
  return h('div', { class: 'plan-row', ...R() },
    h('div', { class: 'plan-head' }, h('b', {}, holidayLabel(p.group)), h('span', {}, t('Take {take}, get {off} days off', { take: p.take, off: p.off }))),
    breakStrip(p),
    h('div', { class: 'plan-foot' }, h('span', { class: 'plan-dates' }, range(p.start, p.end)), add));
}

// ---------------------------------------------------------------- slides
export function timeOffSlide(s) {
  const o = s.timeOff;
  const work = s.mode === 'work';
  return {
    theme: 'c-teal',
    render: () => h('div', {},
      h('p', { class: 'cap', ...R() }, t('Time off')),
      h('p', { class: 'big', ...R() }, h('span', { 'data-count': o.taken }, '0'), h('small', {}, work ? (o.taken === 1 ? t('day') : t('days')) : (o.taken === 1 ? t('weekday') : t('weekdays')))),
      h('h2', { class: 'line', ...R() }, work ? (s.isPartialYear ? t('of leave taken so far.') : t('of leave this year.')) : (s.isPartialYear ? t('away from it all, so far.') : t('away from it all this year.'))),
      h('div', { class: 'viz-wrap', ...R() }, leaveYear(o.days, s.year, { highlight: o.longest })),
      longestLine(o) ? h('p', { class: 'note', ...R() }, ...rich(longestLine(o))) : null,
      gapLine(o) ? h('p', { class: 'note', ...R() }, ...rich(gapLine(o))) : o.booked ? h('p', { class: 'note', ...R() }, tn('Plus {n} more day already booked.', 'Plus {n} more days already booked.', o.booked)) : null,
    ),
  };
}

export function planSlide(s) {
  const o = s.timeOff;
  const top = topPlan(o.plan, 3);
  if (!top.length) return null;
  const take = top.reduce((n, p) => n + p.take, 0), off = top.reduce((n, p) => n + p.off, 0);
  return {
    theme: 'c-white',
    render: () => h('div', {},
      h('p', { class: 'cap', ...R() }, t('Your smartest days off in {year}', { year: o.planYear })),
      h('h2', { class: 'line', ...R() }, t('{take} days of leave. {off} days off.', { take, off })),
      h('div', R(), breakLegend()),
      h('div', { class: 'plan-rows' }, top.map((p) => planRow(p))),
      h('p', { class: 'note', ...R() }, t('Built around the public holidays in {country}.', { country: countryName(o.country) })),
    ),
  };
}

export function birthdaySlide(s) {
  const b = s.birthdayInfo;
  const next = b.upcoming[0];
  const big = b.milestones.length ? t('Big ones: {list}.', { list: b.milestones.map((x) => `${x.name} (${x.age})`).join(', ') }) : null;
  return {
    theme: 'c-purple',
    render: () => h('div', {},
      h('p', { class: 'cap', ...R() }, t('Birthdays')),
      h('h2', { class: 'line', ...R() }, b.busiestMonth ? t('{month} is birthday season.', { month: monthName(b.busiestMonth.i) }) : tn('{n} birthday in the calendar.', '{n} birthdays in the calendar.', b.count)),
      h('div', { class: 'viz-wrap bday-wrap', ...R() }, birthdayWheel(b)),
      next ? h('p', { class: 'note', ...R() }, ...rich(t('Next up: **{name}**, {date}.', { name: next.name, date: fmt.date(d(next.next)) }))) : null,
      big ? h('p', { class: 'note', ...R() }, big) : null,
    ),
  };
}

// ---------------------------------------------------------------- summary panels
export function timeOffPanel(s) {
  const o = s.timeOff;
  if (!o) return null;
  const work = s.mode === 'work';
  const any = o.taken + o.booked > 0;
  const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));
  const notes = [longestLine(o), gapLine(o), o.left ? t('If you get {typical} days a year, about **{left}** are still to use.', { typical: o.typical, left: o.left }) : null].filter(Boolean);
  return h('div', { class: 'panel timeoff-panel', 'data-reveal': '' },
    h('h3', {}, t('Time off')),
    h('p', { class: 'sub' }, any
      ? (work ? t('Leave from your calendar, counted in working days. Weekends and public holidays inside a break don’t count against it.') : t('Days away from your calendar, counted in weekdays.'))
      : t('No leave in this calendar. If you keep it somewhere else, the planner below still works.')),
    any ? h('div', { class: 'viz-light', style: 'margin-top:14px' }, leaveYear(o.days, s.year, { highlight: o.longest })) : null,
    any ? leaveLegend({ booked: o.booked > 0 }) : null,
    any ? h('div', { class: 'stat-grid', style: 'margin-top:14px' },
      stat(fmt.int(o.taken), work ? t('days of leave') : t('weekdays away')),
      o.booked ? stat(fmt.int(o.booked), t('more booked')) : stat(fmt.int(o.breaks.length), t('breaks'))) : null,
    notes.length ? h('div', { style: 'margin-top:12px' }, notes.map((n) => h('p', { class: 'caption', style: 'margin-top:6px' }, ...rich(n)))) : null,
    o.plan.length ? h('div', { class: 'plan-block' },
      h('h4', {}, t('Your smartest days off in {year}', { year: o.planYear })),
      h('p', { class: 'sub' }, t('Built around the public holidays in {country}.', { country: countryName(o.country) })),
      breakLegend(),
      h('div', { class: 'plan-rows viz-light' }, o.plan.map((p) => planRow(p, { actions: true })))) : null,
  );
}

export function birthdayPanel(s) {
  const b = s.birthdayInfo;
  if (!b || b.count < 1) return null;
  return h('div', { class: 'panel', 'data-reveal': '' },
    h('h3', {}, t('Birthdays')),
    h('p', { class: 'sub' }, b.busiestMonth ? t('{month} is birthday season.', { month: monthName(b.busiestMonth.i) }) : tn('{n} birthday in the calendar.', '{n} birthdays in the calendar.', b.count)),
    h('div', { class: 'viz-light bday-wrap' }, birthdayWheel(b)),
    b.upcoming.length ? [h('h4', { style: 'margin-top:12px' }, t('Coming up')),
      h('ul', { class: 'upcoming' }, b.upcoming.map((x) => h('li', {}, h('span', {}, x.name, x.age ? ` · ${x.age + (x.inDays > 0 && d(x.next).getFullYear() > s.year ? 1 : 0)}` : ''), h('span', {}, x.inDays === 0 ? t('today') : `${fmt.date(d(x.next))} · ${tn('in {n} day', 'in {n} days', x.inDays)}`))))] : null,
  );
}

// ---------------------------------------------------------------- report rows
/** Every break, for the full report: [label, dates, days of leave, days in all]. */
export function breakRows(s) {
  return (s.timeOff?.breaks || []).map((b) => [
    h('span', {}, b.label || '—', b.booked ? h('span', { class: 'muted' }, ` · ${t('booked')}`) : ''),
    range(b.start, b.end), fmt.int(b.leave), fmt.int(b.span)]);
}
/** Every birthday, in date order: [name, date, age]. */
export function birthdayRows(s) {
  return (s.birthdayInfo?.list || []).map((b) => [b.name || t('Birthday'), fmt.date(new Date(2001, b.m, b.d)), b.age ? fmt.int(b.age) : '']);
}
