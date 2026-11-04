// Team mode: several exports in, one team report out. All in this browser.
import { CONFIG } from './config.js';
import { parseICS, guessSelfEmail } from './ics.js';
import { computeTeamStats } from './stats.js';
import { charts } from './slides.js';
import { h, fmt, toast, stagger, storage, store } from './ui.js';
import { isUnlocked, openUnlockModal } from './pay.js';
import { track } from './analytics.js';

const KEY = 'cw:team';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const members = []; // { id, label, events, selfEmail, name, count }
let nextId = 1;

export function savedTeam() {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw, (k, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v)) : null; } catch { return null; }
}
function saveTeam(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* quota */ } }
export function clearTeam() { members.length = 0; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

const range = () => { const y = new Date().getFullYear(); return { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y + 1, 0, 1) }; };

function nameFor(events, selfEmail, label) {
  for (const e of events) {
    const a = e.attendees.find((x) => x.email === selfEmail && x.name && !/@/.test(x.name));
    if (a) return a.name.replace(/"/g, '');
  }
  return selfEmail || label;
}

export async function addFiles(files) {
  const added = [];
  for (const f of files) {
    try {
      const text = await f.text();
      const { events, meta } = parseICS(text, range());
      if (!events.length) { toast(`${f.name}: no events this year.`); continue; }
      const selfEmail = guessSelfEmail(events, meta);
      if (selfEmail && members.some((m) => m.selfEmail === selfEmail)) { toast(`${f.name} is already in the team.`); continue; }
      const m = { id: nextId++, label: f.name.replace(/\.ics$/i, ''), events, selfEmail, name: nameFor(events, selfEmail, f.name), count: events.length };
      members.push(m); added.push(m);
    } catch { toast(`${f.name} isn’t a calendar file.`); }
  }
  return added;
}

async function loadSampleTeam() {
  const names = ['alex', 'priya', 'tom', 'maja'];
  const files = await Promise.all(names.map(async (n) => {
    const res = await fetch(`sample/team/${n}.ics`);
    return new File([await res.text()], `${n}.ics`, { type: 'text/calendar' });
  }));
  await addFiles(files);
}

// ---------------------------------------------------------------- setup
export function renderTeamSetup(host, { onBuilt, onBack }) {
  host.innerHTML = '';
  const input = h('input', { type: 'file', accept: '.ics,text/calendar', multiple: true, hidden: true });
  const list = h('div', { class: 'group' });
  const build = h('button', { class: 'btn btn-lg', disabled: true }, 'Build team report');
  const count = h('p', { class: 'caption' });

  const refresh = () => {
    list.innerHTML = '';
    if (!members.length) list.append(h('div', { class: 'row' }, h('span', { class: 'lbl', style: 'color:var(--ink-3)' }, 'No calendars yet.')));
    for (const m of members) {
      list.append(h('div', { class: 'row' },
        h('div', { class: 'member' }, h('b', {}, m.name), h('span', {}, `${fmt.int(m.count)} entries`)),
        h('button', { class: 'btn btn-quiet btn-sm', 'aria-label': `Remove ${m.name}`, onClick: () => { members.splice(members.indexOf(m), 1); refresh(); } }, 'Remove')));
    }
    build.disabled = members.length < 2;
    count.textContent = members.length < 2 ? 'Add at least two people.' : `${members.length} people ready.`;
  };
  input.addEventListener('change', async () => { await addFiles([...input.files]); input.value = ''; refresh(); });
  build.addEventListener('click', () => {
    const { rangeStart, rangeEnd } = range();
    const t = computeTeamStats(members.map((m) => ({ events: m.events, selfEmail: m.selfEmail, label: m.name })), { rangeStart, rangeEnd, workHoursPerWeek: CONFIG.workHoursPerWeek });
    saveTeam(t);
    track('team_built');
    onBuilt(t);
  });

  host.append(h('div', { class: 'team-setup' },
    h('button', { class: 'link link-back', onClick: onBack }, 'Back'),
    h('h1', { 'data-reveal': '' }, 'Team report'),
    h('p', { class: 'sub', 'data-reveal': '' }, 'Add one calendar export per person. You’ll see everyone’s load side by side, the meetings you all share, and the one change that gives the most time back.'),
    h('div', { class: 'notice', 'data-reveal': '' }, h('b', {}, 'Ask first. '), 'These are your colleagues’ calendars. They’re read in this browser and never uploaded, but people should know you’re looking.'),
    h('div', { class: 'team-add', 'data-reveal': '' }, input, h('button', { class: 'btn btn-secondary', onClick: () => input.click() }, 'Add calendar files'), h('button', { class: 'link', onClick: async () => { await loadSampleTeam(); refresh(); } }, 'Or use a sample team')),
    h('div', { 'data-reveal': '' }, list),
    h('div', { class: 'team-go', 'data-reveal': '' }, build, count),
  ));
  refresh();
  stagger(host);
  return { refresh };
}

// ---------------------------------------------------------------- report
const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));

export function renderTeamReport(host, t, { onBack, onChanged }) {
  host.innerHTML = '';
  const unlocked = isUnlocked('team');
  const L = t.lever;
  const lever = L ? h('div', { class: 'panel lever', 'data-reveal': '' },
    h('p', { class: 'caption' }, 'The biggest lever'),
    h('h3', {}, `${L.action}: “${L.title}”`),
    h('p', { class: 'sub' }, `${L.members} people sit in it, ${fmt.int(L.personHoursPerYear)} person-hours a year. This one change gives back about `, h('b', {}, `${fmt.int(L.savedPerYear)} hours`), `, or ${fmt.num(L.workingDays)} working days, across the team.`),
  ) : h('div', { class: 'panel', 'data-reveal': '' }, h('h3', {}, 'No shared meetings found'), h('p', { class: 'sub' }, 'These calendars don’t share any recurring meetings, so there’s no single lever. The per-person view still shows who is overloaded.'));

  const people = h('div', { class: 'panel', 'data-reveal': '' },
    h('h3', {}, 'Everyone’s load'),
    h('p', { class: 'sub' }, `${t.mostLoaded?.name} carries the most, at ${t.mostLoaded?.share}% of their working time. ${t.leastLoaded?.name} the least, at ${t.leastLoaded?.share}%.`),
    h('div', { class: 'table-wrap', style: 'margin-top:14px' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Person'), h('th', { class: 'num' }, 'Meetings'), h('th', { class: 'num' }, 'Hours'), h('th', { class: 'num' }, 'Share'), h('th', { class: 'num' }, 'Could reclaim'), h('th', {}, 'Persona'))),
      h('tbody', {}, t.members.map((m) => h('tr', {}, h('td', {}, m.name), h('td', { class: 'num' }, fmt.int(m.meetings)), h('td', { class: 'num' }, fmt.hours(m.hours)), h('td', { class: 'num' }, h('span', { class: 'meter', style: `--v:${m.share / 100}` }), ` ${m.share}%`), h('td', { class: 'num' }, `${fmt.int(m.reclaimHours)} hrs a year`), h('td', {}, `${m.persona.emoji} ${m.persona.name.replace(/^The /, '')}`))))),
    ),
  );
  const shared = h('div', { class: 'panel', 'data-reveal': '' },
    h('h3', {}, 'Meetings you share'),
    h('p', { class: 'sub' }, `${fmt.hours(t.sharedHours)} hours, ${t.sharedShare}% of all the team’s meeting time, sits in recurring meetings two or more of you attend.`),
    h('div', { class: 'table-wrap', style: 'margin-top:14px' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Series'), h('th', { class: 'num' }, 'People'), h('th', { class: 'num' }, 'Length'), h('th', { class: 'num' }, 'Person-hours a year'))),
      h('tbody', {}, t.sharedSeries.map((s) => h('tr', {}, h('td', {}, s.title), h('td', { class: 'num' }, `${s.members.length} of ${t.size}`), h('td', { class: 'num' }, `${s.durationMin} min`), h('td', { class: 'num' }, fmt.int(s.personHoursPerYear))))),
    )),
  );
  const months = h('div', { class: 'panel report-chart', 'data-reveal': '' }, h('h3', {}, 'Team hours by month'), h('p', { class: 'sub' }, t.busiestMonth ? `${t.busiestMonth.month} was the heaviest.` : ''), charts.monthChart(t.monthly, t.busiestMonth?.month));

  const locked = h('div', { class: unlocked ? 'stack' : 'stack locked-block' }, people, shared, months);
  const unlockBar = unlocked ? null : h('div', { class: 'panel unlock-panel', 'data-reveal': '' },
    h('div', {}, h('h3', {}, 'See the whole team'), h('p', { class: 'sub' }, 'Per-person load, every shared meeting with its cost, the monthly picture, and a PDF to bring to your next team meeting.')),
    h('button', { class: 'btn', onClick: () => openUnlockModal({ product: 'team', beforeRedirect: () => saveTeam(t), onUnlocked: () => onChanged?.() }) }, `Unlock for ${CONFIG.pricing.symbol}${CONFIG.pricing.teamAmount}`));

  host.append(h('div', { class: 'report team-report' },
    h('div', { class: 'report-head' },
      h('div', {}, h('p', { class: 'caption' }, `${CONFIG.brand.name}, team report`), h('h1', {}, `Your team’s ${t.year}, in meetings.`), h('p', { class: 'lede' }, `${t.size} people, ${t.isPartialYear ? `1 January to ${fmt.date(t.range.end)}` : 'the whole year'}. Read in this browser, nothing uploaded.`)),
      h('div', { class: 'no-print', style: 'display:flex; gap:10px; flex-wrap:wrap' }, h('button', { class: 'btn btn-secondary', onClick: onBack }, 'Edit team'), unlocked ? h('button', { class: 'btn', onClick: () => window.print() }, 'Save as PDF') : null),
    ),
    h('div', { class: 'stack' },
      h('div', { class: 'panel', 'data-reveal': '' }, h('div', { class: 'stat-grid' },
        stat(fmt.int(t.size), 'people'), stat(`${fmt.int(t.totalHours)} hrs`, 'in meetings, combined'), stat(`${t.avgShare}%`, 'average share of working time'),
        stat(fmt.int(t.totalMeetings), 'meetings attended'), stat(`${fmt.int(t.sharedHours)} hrs`, 'in shared recurring meetings'), stat(`${t.sharedShare}%`, 'of all meeting time is shared'))),
      lever,
      unlockBar,
      locked,
    ),
  ));
  stagger(host);
}

export { members as teamMembers, loadSampleTeam };
