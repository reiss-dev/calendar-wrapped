// Full report view (unlocked). Long-form, printable to PDF via the browser.
import { h, fmt } from './ui.js';
import { charts } from './slides.js';
import { CONFIG } from './config.js';

const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));
const sec = (title, intro, ...body) => h('section', { class: 'report-sec' }, h('h2', {}, title), intro ? h('p', { class: 'intro' }, intro) : null, ...body);

function reclaimList(rec, mode) {
  return h('div', { class: 'panel' },
    h('div', { class: 'reclaim-head' },
      h('div', {}, h('h3', {}, mode === 'work' ? 'Your reclaim plan' : 'Gentle nudges'), h('p', { class: 'intro', style: 'margin:4px 0 0' }, mode === 'work' ? 'Ranked by hours returned. Each one is based on your own calendar, not generic advice.' : 'Drawn from your own patterns. Take what\'s useful, ignore the rest.')),
      rec.totalHours > 0 ? h('div', { class: 'reclaim-total' }, h('b', {}, `${fmt.int(rec.totalHours)} hrs`), h('span', {}, `about ${fmt.num(rec.workingDays)} working days a year`)) : null,
    ),
    h('ol', { class: 'reclaim-list' }, rec.suggestions.map((x) => h('li', {}, h('h4', {}, x.title), h('p', {}, x.detail), x.hoursPerYear > 0 ? h('div', { class: 'hrs' }, `${fmt.int(x.hoursPerYear)} hrs`, h('small', {}, 'per year')) : h('div', { class: 'hrs' }, '')))),
  );
}

function weekdayChart(byWeekday) {
  const max = Math.max(1, ...byWeekday.map((d) => d.value));
  const order = [1, 2, 3, 4, 5, 6, 0];
  return h('div', { style: 'display:grid; gap:8px' }, order.map((i) => { const d = byWeekday[i]; return h('div', { style: 'display:grid; grid-template-columns: 44px 1fr 70px; gap:12px; align-items:center; font-size:13px' }, h('span', { style: 'color:var(--ink-2)' }, d.short), h('div', { class: 'bar' }, h('i', { style: `--v:${d.value / max}; animation:none` })), h('span', { style: 'text-align:right; color:var(--ink-2); font-variant-numeric:tabular-nums' }, `${fmt.hours(d.value)} h`)); }));
}

export function renderReport(host, s, { onBack, unlocked }) {
  host.innerHTML = '';
  const isWork = s.mode === 'work';
  const head = h('div', { class: 'report-head' },
    h('div', {}, h('p', { class: 'caption' }, `${CONFIG.brand.name}, full report`), h('h1', {}, `Your ${s.year}, ${isWork ? 'in full.' : 'in detail.'}`), h('p', { class: 'lede' }, `${s.isPartialYear ? `1 January to ${fmt.date(s.range.end)}` : 'The whole year'}. ${isWork ? `${fmt.int(s.meetings)} meetings, ${fmt.hours(s.totalHours)} hours.` : `${fmt.int(s.events)} plans, ${fmt.hours(s.totalHours)} hours.`} Generated on your device.`)),
    h('div', { style: 'display:flex; gap:10px; flex-wrap:wrap' }, h('button', { class: 'btn btn-secondary', onClick: onBack }, 'Back to summary'), h('button', { class: 'btn', onClick: () => window.print() }, 'Save as PDF')),
  );
  host.append(h('div', { class: 'report' }, head, ...(isWork ? workBody(s) : personalBody(s)), h('p', { class: 'caption', style: 'margin-top:56px' }, `Meetings are timed events with at least one other attendee that you did not decline. Working time assumes a ${CONFIG.workHoursPerWeek}-hour week. Travel and time off are detected from titles, so treat them as a best guess.${unlocked?.preview ? ' Preview unlock: payments are not configured on this host.' : ''}`)));
}

function workBody(s) {
  return [
    sec('At a glance', null, h('div', { class: 'stat-grid' },
      stat(fmt.int(s.meetings), 'meetings'), stat(`${fmt.hours(s.totalHours)} hrs`, 'in meetings'), stat(`${s.shareOfWork}%`, 'of working time'),
      stat(fmt.num(s.avgPerWorkingDay), 'per working day'), stat(`${s.avgLengthMin} min`, 'average length'), stat(fmt.int(s.uniquePeople), 'different people'),
      stat(fmt.int(s.organized), 'you organised'), stat(fmt.int(s.declined), 'you declined'), stat(fmt.int(s.unanswered), 'never answered'),
    )),
    sec('Reclaim', null, reclaimList(s.reclaim, 'work')),
    sec('Through the year', `${s.busiestMonth?.month || '—'} was the heaviest month${s.quietestMonth ? `, ${s.quietestMonth.month} the lightest` : ''}.`,
      charts.monthChart(s.monthly, s.busiestMonth?.month),
      h('div', { class: 'two', style: 'margin-top:20px' },
        h('div', { class: 'panel' }, h('h3', {}, 'Hours by weekday'), weekdayChart(s.byWeekday)),
        h('div', { class: 'panel' }, h('h3', {}, 'Meetings by hour of day'), charts.heatStrip(s.byHour), h('p', { class: 'intro', style: 'margin:14px 0 0; font-size:13px' }, `Earliest start ${s.earliest ? fmt.time(s.earliest.start) : '—'}, latest finish ${s.latest ? fmt.time(s.latest.end) : '—'}. ${s.earlyMeetings} before 8am, ${s.lateMeetings} past 6pm, ${s.fridayPm} on Friday afternoons.`)),
      ),
    ),
    sec('Worst weeks', 'Hours in meetings per ISO week. The highlighted bar is the worst.', charts.weekStrip(s.weekly, s.worstWeek),
      h('div', { class: 'table-wrap', style: 'margin-top:20px' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Week'), h('th', { class: 'num' }, 'Meetings'), h('th', { class: 'num' }, 'Hours'))),
        h('tbody', {}, [...s.weekly].sort((a, b) => b.hours - a.hours).slice(0, 5).map((w) => h('tr', {}, h('td', {}, fmt.weekRange(w.start)), h('td', { class: 'num' }, fmt.int(w.count)), h('td', { class: 'num' }, fmt.hours(w.hours)))))))),
    sec('Recurring meetings', `${s.recurringCount} series made up ${s.recurringShare}% of your meeting time. This is where the hours hide.`,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Series'), h('th', { class: 'num' }, 'Times'), h('th', { class: 'num' }, 'Length'), h('th', { class: 'num' }, 'People'), h('th', { class: 'num' }, 'Hours'))),
        h('tbody', {}, s.recurringSeries.map((r) => h('tr', {}, h('td', {}, r.title, r.organizedBySelf ? h('span', { class: 'muted' }, ' · yours') : null), h('td', { class: 'num' }, fmt.int(r.count)), h('td', { class: 'num' }, `${r.durationMin} min`), h('td', { class: 'num' }, fmt.int(r.attendees)), h('td', { class: 'num' }, fmt.hours(r.hours)))))))),
    sec('People', `${s.uniquePeople} different people in meetings of 25 or fewer, ${s.oneToOnes} one-to-ones (${fmt.hours(s.oneToOneHours)}h), ${s.largeMeetings} meetings with eight or more people.`,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Person'), h('th', { class: 'num' }, 'Meetings'), h('th', { class: 'num' }, 'Hours'), h('th', { class: 'num' }, 'Last seen'))),
        h('tbody', {}, s.collaborators.map((p) => h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, fmt.int(p.count)), h('td', { class: 'num' }, fmt.hours(p.hours)), h('td', { class: 'num muted' }, fmt.date(p.lastSeen)))))))),
    sec('Titles', 'What you called it.', h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('tbody', {}, s.topTitles.map((t) => h('tr', {}, h('td', {}, t.key), h('td', { class: 'num' }, `${fmt.int(t.count)}×`))))))),
    s.travel.found ? sec('Travel and time off', 'Detected from flight, train, hotel and leave entries.', h('div', { class: 'stat-grid' }, stat(fmt.int(s.travel.trips), 'trips'), stat(fmt.int(s.travel.flights), 'flights'), stat(fmt.int(s.travel.trains), 'train journeys'), stat(fmt.int(s.travel.hotelNights), 'hotel nights'), stat(fmt.int(s.travel.daysOff), 'days off')), s.travel.places.length ? h('div', { class: 'chips-light' }, s.travel.places.map((p) => h('span', {}, `${p.key} · ${p.count}`))) : null) : null,
    sec('Streaks and habits', null, h('div', { class: 'stat-grid' }, stat(fmt.int(s.longestFreeStreak.length), 'longest run of meeting-free workdays'), stat(fmt.int(s.longestBusyStreak.length), 'longest run of workdays with meetings'), stat(fmt.int(s.backToBack), 'back-to-back transitions'), stat(fmt.int(s.fragmentedDays), 'days with no 2-hour gap'), stat(fmt.int(s.noAgenda), 'group meetings with no agenda'), stat(fmt.int(s.weekendMeetings), 'weekend meetings'))),
  ];
}

function personalBody(s) {
  const max = Math.max(1, ...s.categories.map((c) => c.count));
  return [
    sec('At a glance', null, h('div', { class: 'stat-grid' }, stat(fmt.int(s.events), 'plans'), stat(`${fmt.hours(s.totalHours)} hrs`, 'planned time'), stat(fmt.int(s.uniquePeople), 'people'), stat(`${s.freeWeekends}/${s.totalWeekends}`, 'free weekends'), stat(fmt.int(s.eveningEvents), 'weeknight plans'), stat(fmt.int(s.birthdays), 'birthdays'))),
    sec('Nudges', null, reclaimList(s.reclaim, 'personal')),
    sec('Where the time went', null, h('div', { class: 'panel' }, h('div', { style: 'display:grid; gap:10px' }, s.categories.map((c) => h('div', { style: 'display:grid; grid-template-columns: 160px 1fr 90px; gap:12px; align-items:center; font-size:14px' }, h('span', {}, c.label), h('div', { class: 'bar' }, h('i', { style: `--v:${c.count / max}; animation:none` })), h('span', { style: 'text-align:right; color:var(--ink-2)' }, `${fmt.int(c.count)}, ${fmt.hours(c.hours)} hrs`)))))),
    sec('Through the year', `${s.busiestMonth?.month || '—'} was the busiest month.`, charts.monthChart(s.monthly, s.busiestMonth?.month), h('div', { class: 'two', style: 'margin-top:20px' }, h('div', { class: 'panel' }, h('h3', {}, 'Hours by weekday'), weekdayChart(s.byWeekday)), h('div', { class: 'panel' }, h('h3', {}, 'Plans by hour of day'), charts.heatStrip(s.byHour)))),
    sec('People', null, h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Person'), h('th', { class: 'num' }, 'Plans'), h('th', { class: 'num' }, 'Hours'), h('th', { class: 'num' }, 'Last seen'))), h('tbody', {}, s.people.map((p) => h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, fmt.int(p.count)), h('td', { class: 'num' }, fmt.hours(p.hours)), h('td', { class: 'num muted' }, fmt.date(p.lastSeen)))))))),
    sec('Habits', null, h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Recurring'), h('th', { class: 'num' }, 'Times'), h('th', { class: 'num' }, 'Hours'))), h('tbody', {}, s.recurringSeries.map((r) => h('tr', {}, h('td', {}, r.title), h('td', { class: 'num' }, fmt.int(r.count)), h('td', { class: 'num' }, fmt.hours(r.hours)))))))),
    s.travel.found ? sec('Away', null, h('div', { class: 'stat-grid' }, stat(fmt.int(s.travel.trips), 'trips'), stat(fmt.int(s.travel.flights), 'flights'), stat(fmt.int(s.travel.hotelNights), 'nights away'), stat(fmt.int(s.travel.daysOff), 'days off')), s.travel.places.length ? h('div', { class: 'chips-light' }, s.travel.places.map((p) => h('span', {}, p.key))) : null) : null,
  ];
}
