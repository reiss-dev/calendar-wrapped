// Team mode: several exports in, one team report out. Parsing runs in the engine (worker).
import { CONFIG } from './config.js';
import { t, monthName } from './i18n.js';
import { charts } from './slides.js';
import { h, fmt, toast, stagger } from './ui.js';
import { isUnlocked, openUnlockModal, priceLabel, checkTeamEntitlement, hasBilling, openBillingPortal } from './pay.js';
import { persona as personaOf } from './copy.js';
import { bubbles, treemap } from './viz.js';
import { track } from './analytics.js';
import { keep, recall, forget } from './vault.js';

const KEY = 'cw:team';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const members = []; // { id, name, count }

export function savedTeam() {
  try { const raw = recall(KEY); return raw ? JSON.parse(raw, (k, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v)) : null; } catch { return null; }
}
function saveTeam(team) { try { keep(KEY, JSON.stringify(team)); } catch { /* quota */ } }
export async function clearTeam(engine) { members.length = 0; forget(KEY); await engine?.clearMembers(); }

export async function addFiles(engine, files) {
  for (const f of files) {
    try {
      const res = await engine.addMember(await f.text(), f.name.replace(/\.ics$/i, ''));
      if (res.error === 'empty') toast(t('{file}: no events this year.', { file: f.name }));
      else if (res.error === 'duplicate') toast(t('{file} is already in the team.', { file: f.name }));
      else members.push(res);
    } catch { toast(t('{file} isn’t a calendar file.', { file: f.name })); }
  }
}

async function loadSampleTeam(engine) {
  const files = await Promise.all(['alex', 'priya', 'tom', 'maja'].map(async (n) => new File([await (await fetch(`sample/team/${n}.ics`)).text()], `${n}.ics`, { type: 'text/calendar' })));
  await addFiles(engine, files);
}

// ---------------------------------------------------------------- setup
export function renderTeamSetup(host, { engine, onBuilt, onBack }) {
  host.innerHTML = '';
  const input = h('input', { type: 'file', accept: '.ics,text/calendar', multiple: true, hidden: true });
  const list = h('div', { class: 'group' });
  const build = h('button', { class: 'btn btn-lg', disabled: true }, t('Build team report'));
  const count = h('p', { class: 'caption' });
  const refresh = () => {
    list.innerHTML = '';
    if (!members.length) list.append(h('div', { class: 'row' }, h('span', { class: 'lbl', style: 'color:var(--ink-3)' }, t('No calendars yet.'))));
    for (const m of members) {
      list.append(h('div', { class: 'row' },
        h('div', { class: 'member' }, h('b', {}, m.name), h('span', {}, t('{n} entries', { n: fmt.int(m.count) }))),
        h('button', { class: 'btn btn-quiet btn-sm', 'aria-label': t('Remove {name}', { name: m.name }), onClick: async () => { await engine.removeMember(m.id); members.splice(members.indexOf(m), 1); refresh(); } }, t('Remove'))));
    }
    build.disabled = members.length < 2;
    count.textContent = members.length < 2 ? t('Add at least two people.') : t('{n} people ready.', { n: members.length });
  };
  input.addEventListener('change', async () => { await addFiles(engine, [...input.files]); input.value = ''; refresh(); });
  build.addEventListener('click', async () => {
    build.disabled = true; build.textContent = t('Working it out…');
    const team = await engine.team({ workHoursPerWeek: host.dataset.week ? Number(host.dataset.week) : undefined });
    saveTeam(team);
    track('team_built');
    onBuilt(team);
  });
  host.append(h('div', { class: 'team-setup' },
    h('button', { class: 'link link-back', onClick: onBack }, t('Back')),
    h('h1', { 'data-reveal': '' }, t('Team report')),
    h('p', { class: 'sub', 'data-reveal': '' }, t('Add one calendar export per person. You’ll see everyone’s load side by side, the meetings you all share, and the one change that gives the most time back.')),
    h('div', { class: 'notice', 'data-reveal': '' }, h('b', {}, t('Ask first.')), ' ', t('These are your colleagues’ calendars. They’re read in this browser and never uploaded, but people should know you’re looking.')),
    h('div', { class: 'team-add', 'data-reveal': '' }, input, h('button', { class: 'btn btn-secondary', onClick: () => input.click() }, t('Add calendar files')), h('button', { class: 'link', onClick: async () => { await loadSampleTeam(engine); refresh(); } }, t('Or use a sample team'))),
    h('div', { 'data-reveal': '' }, list),
    h('div', { class: 'team-go', 'data-reveal': '' }, build, count),
  ));
  refresh();
  stagger(host);
}

// ---------------------------------------------------------------- report
const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));

function quarterChart(quarters) {
  const max = Math.max(1, ...quarters.map((q) => q.hours));
  return h('div', { class: 'quarters' }, quarters.map((q, i) => h('div', { class: `q${q.future ? ' future' : ''}` },
    h('div', { class: 'q-bar', style: `--v:${(q.hours / max).toFixed(3)}; --i:${i}` }),
    h('b', {}, q.future ? '—' : t('{h} hrs', { h: fmt.int(q.hours) })), h('span', {}, `Q${q.q}`))));
}

export async function renderTeamReport(host, team, { onBack, onChanged, onStory, onCarousel }) {
  host.innerHTML = '';
  const unlocked = isUnlocked('team') && await checkTeamEntitlement();
  const L = team.lever;
  const lever = L ? h('div', { class: 'panel lever', 'data-reveal': '' },
    h('p', { class: 'caption' }, t('The biggest lever')),
    h('h3', {}, `${L.action === 'Make it async twice a week' ? t('Make it async twice a week') : L.action === 'Move it to every other week' ? t('Move it to every other week') : t('Cut it to half the length')}: “${L.title}”`),
    h('p', { class: 'sub' }, t('{m} people sit in it, {ph} person-hours a year. This one change gives back about {saved} hours, or {d} working days, across the team.', { m: L.members, ph: fmt.int(L.personHoursPerYear), saved: fmt.int(L.savedPerYear), d: fmt.num(L.workingDays) })),
  ) : h('div', { class: 'panel', 'data-reveal': '' }, h('h3', {}, t('No shared meetings found')), h('p', { class: 'sub' }, t('These calendars don’t share any recurring meetings, so there’s no single lever. The per-person view still shows who’s overloaded.')));

  const people = h('div', { class: 'panel', 'data-reveal': '' },
    h('h3', {}, t('Everyone’s load')),
    h('p', { class: 'sub' }, t('{a} carries the most, at {x}% of their working time. {b} the least, at {y}%.', { a: team.mostLoaded?.name, x: team.mostLoaded?.share, b: team.leastLoaded?.name, y: team.leastLoaded?.share })),
    h('div', { class: 'viz-light', style: 'margin:10px auto 0; max-width:520px' }, bubbles(team.members.map((m) => ({ label: m.name, value: m.hours, sub: t('{h} hrs', { h: fmt.int(m.hours) }) })), { maxR: 80 })),
    h('div', { class: 'table-wrap', style: 'margin-top:14px' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, t('Person')), h('th', { class: 'num' }, t('Meetings')), h('th', { class: 'num' }, t('Hours')), h('th', { class: 'num' }, t('Share')), h('th', { class: 'num' }, t('Could reclaim')), h('th', {}, t('Persona')))),
      h('tbody', {}, team.members.map((m) => { const p = personaOf(m.persona); return h('tr', {}, h('td', {}, m.name), h('td', { class: 'num' }, fmt.int(m.meetings)), h('td', { class: 'num' }, fmt.hours(m.hours)), h('td', { class: 'num' }, h('span', { class: 'meter', style: `--v:${m.share / 100}` }), ` ${m.share}%`), h('td', { class: 'num' }, t('{h} hrs a year', { h: fmt.int(m.reclaimHours) })), h('td', {}, `${p.emoji} ${p.name}`)); })))),
  );
  const shared = h('div', { class: 'panel', 'data-reveal': '' },
    h('h3', {}, t('Meetings you share')),
    h('p', { class: 'sub' }, t('{h} hours, {p}% of all the team’s meeting time, sits in recurring meetings two or more of you attend.', { h: fmt.hours(team.sharedHours), p: team.sharedShare })),
    h('div', { class: 'viz-light', style: 'margin-top:14px' }, treemap(team.sharedSeries.map((x) => ({ label: x.title, value: x.personHoursPerYear, sub: t('{h} person-hours a year', { h: fmt.int(x.personHoursPerYear) }) })), { H: 260 })),
    h('div', { class: 'table-wrap', style: 'margin-top:14px' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, t('Series')), h('th', { class: 'num' }, t('People')), h('th', { class: 'num' }, t('Length')), h('th', { class: 'num' }, t('Person-hours a year')))),
      h('tbody', {}, team.sharedSeries.map((x) => h('tr', {}, h('td', {}, x.title), h('td', { class: 'num' }, t('{a} of {b}', { a: x.members.length, b: team.size })), h('td', { class: 'num' }, t('{n} min', { n: x.durationMin })), h('td', { class: 'num' }, fmt.int(x.personHoursPerYear))))))),
  );
  const bi = team.busiestMonth ? team.busiestMonth.i ?? team.monthly.findIndex((m) => m.month === team.busiestMonth.month) : -1;
  const time = h('div', { class: 'two' },
    h('div', { class: 'panel report-chart', 'data-reveal': '' }, h('h3', {}, t('Team hours by month')), h('p', { class: 'sub' }, bi >= 0 ? t('{m} was the heaviest.', { m: monthName(bi) }) : ''), charts.monthChart(team.monthly, bi)),
    h('div', { class: 'panel', 'data-reveal': '' }, h('h3', {}, t('Quarter by quarter')), h('p', { class: 'sub' }, t('Run it again each quarter to see whether changes stuck.')), quarterChart(team.quarters || [])));

  const locked = h('div', { class: unlocked ? 'stack' : 'stack locked-block' }, people, shared, time);
  const unlockBar = unlocked ? null : h('div', { class: 'panel unlock-panel', 'data-reveal': '' },
    h('div', {}, h('h3', {}, t('See the whole team')), h('p', { class: 'sub' }, t('Everyone’s load, every shared meeting with its cost, the quarter-by-quarter picture, a PDF for your next team meeting, and a nudge each quarter to run it again.'))),
    h('button', { class: 'btn', onClick: () => openUnlockModal({ product: 'team', beforeRedirect: () => saveTeam(team), onUnlocked: () => onChanged?.() }) }, t('Start for {price}', { price: priceLabel('team') })));

  host.append(h('div', { class: 'report team-report' },
    h('div', { class: 'report-head' },
      h('div', {}, h('p', { class: 'caption' }, t('{brand}, team report', { brand: CONFIG.brand.name })), h('h1', {}, t('Your team’s {year}, in meetings.', { year: team.year })), h('p', { class: 'lede' }, t('{n} people, {period}. Read in this browser, nothing uploaded.', { n: team.size, period: team.isPartialYear ? t('1 January to {date}', { date: fmt.date(team.range.end) }) : t('the whole year') }))),
      h('div', { class: 'no-print', style: 'display:flex; gap:10px; flex-wrap:wrap' },
        h('button', { class: 'btn btn-secondary', onClick: onBack }, t('Edit team')),
        onStory ? h('button', { class: 'btn', id: 'team-story', onClick: onStory }, t('Play the team story')) : null,
        onCarousel ? h('button', { class: 'btn btn-secondary', id: 'team-carousel', onClick: onCarousel }, t('LinkedIn carousel')) : null,
        unlocked ? h('button', { class: 'btn', onClick: () => window.print() }, t('Save as PDF')) : null,
        unlocked && hasBilling() ? h('button', { class: 'btn btn-quiet', onClick: openBillingPortal }, t('Manage plan')) : null),
    ),
    h('div', { class: 'stack' },
      h('div', { class: 'panel', 'data-reveal': '' }, h('div', { class: 'stat-grid' },
        stat(fmt.int(team.size), t('people')), stat(t('{h} hrs', { h: fmt.int(team.totalHours) }), t('in meetings, combined')), stat(`${team.avgShare}%`, t('average share of working time')),
        stat(fmt.int(team.totalMeetings), t('meetings attended')), stat(t('{h} hrs', { h: fmt.int(team.sharedHours) }), t('in shared recurring meetings')), stat(`${team.sharedShare}%`, t('of all meeting time is shared')))),
      lever, unlockBar, locked,
    ),
  ));
  stagger(host);
}

export { members as teamMembers };
