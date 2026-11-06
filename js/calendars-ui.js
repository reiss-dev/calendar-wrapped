// One person's calendars together (work and personal), and leaving things out.
import { h, fmt } from './ui.js';
import { t } from './i18n.js';
import { keep, recall } from './vault.js';
import { track } from './analytics.js';

// ---------------------------------------------------------------- what to leave out
const FILTERS = 'cw:filters';
export function loadFilters() {
  const arr = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string').slice(0, 60) : []);
  try { const f = JSON.parse(recall(FILTERS) || '{}'); return { words: arr(f.words), titles: arr(f.titles), notMine: f.notMine === true, ok: arr(f.ok) }; } catch { return { words: [], titles: [], notMine: false, ok: [] }; }
}
export function saveFilters(f) { keep(FILTERS, JSON.stringify({ words: f.words || [], titles: f.titles || [], notMine: !!f.notMine, ok: f.ok || [] })); }
export const hasFilters = (f) => !!f && (f.words.length + f.titles.length > 0 || f.notMine);
const parseWords = (text) => [...new Set(String(text).split(/[,;\n]/).map((w) => w.trim()).filter((w) => w.length >= 2))].slice(0, 30);

/** The prep-screen row: words to leave out. */
export function leaveOutRow() {
  const f = loadFilters();
  const input = h('input', { type: 'text', id: 'leave-out', value: f.words.join(', '), placeholder: t('e.g. Focus, Lunch, Gym'), autocomplete: 'off', spellcheck: 'false',
    onChange: (e) => { saveFilters({ ...loadFilters(), words: parseWords(e.target.value) }); } });
  return h('div', { class: 'row' }, h('label', { class: 'lbl', for: 'leave-out' }, t('Leave out')), input);
}

/** The summary panel: switch off the biggest titles, or add words, and recalculate. */
export function leaveOutPanel(s, { canApply, onApply }) {
  const f = loadFilters();
  const off = new Set(f.titles.map((x) => x.toLowerCase()));
  const items = [...(s.leaveOutCandidates || [])];
  for (const title of f.titles) if (!items.some((x) => x.title.toLowerCase() === title.toLowerCase())) items.push({ title, count: 0, hours: 0, gone: true });
  const boxes = items.map((x, i) => {
    const box = h('input', { type: 'checkbox', id: `lo-${i}`, checked: !off.has(x.title.toLowerCase()) });
    return { x, box, row: h('label', { class: 'lo-item', for: `lo-${i}` }, box, h('span', { class: 'lo-title' }, x.title),
      h('span', { class: 'lo-meta' }, x.gone ? t('left out') : x.hours ? t('{h} hrs', { h: fmt.hours(x.hours) }) : `${fmt.int(x.count)}×`)) };
  });
  const words = h('input', { type: 'text', id: 'lo-words', value: f.words.join(', '), placeholder: t('e.g. Focus, Lunch, Gym'), autocomplete: 'off', spellcheck: 'false' });
  const apply = h('button', { class: 'btn', disabled: !canApply, onClick: async () => {
    apply.disabled = true; apply.textContent = t('Updating…');
    const next = { ...loadFilters(), titles: boxes.filter((b) => !b.box.checked).map((b) => b.x.title), words: parseWords(words.value) };
    saveFilters(next);
    track('filters_applied');
    await onApply(next);
  } }, t('Update my Wrapped'));
  return h('div', { class: 'panel leave-out-panel', 'data-reveal': '' },
    h('h3', {}, t('Leave things out')),
    h('p', { class: 'sub' }, t('Something here that isn’t really yours, or doesn’t belong in your year? Untick it, or add words to leave out, and everything recalculates.')),
    h('div', { class: 'lo-list' }, boxes.map((b) => b.row)),
    h('label', { class: 'field', style: 'margin-top:14px' }, h('span', {}, t('Also leave out anything containing')), words),
    h('div', { style: 'margin-top:14px; display:flex; gap:12px; align-items:center; flex-wrap:wrap' }, apply,
      canApply ? null : h('span', { class: 'caption' }, t('Add your calendar again to change this.'))));
}

// ---------------------------------------------------------------- several calendars
/** Asks what a handful of files are: one person's calendars, or a team. Resolves 'mine', 'team' or null. */
export function askYoursOrTeam(n) {
  return new Promise((resolve) => {
    const root = h('div', { class: 'modal-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'yt-title' });
    const done = (v) => { root.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => root.remove(), 300); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    root.append(h('div', { class: 'modal' },
      h('h3', { id: 'yt-title' }, t('{n} calendars. Whose are they?', { n })),
      h('p', {}, t('Your own work and personal calendars make one story about your whole year. Several people’s calendars make a team report.')),
      h('button', { class: 'btn btn-lg btn-block', id: 'yt-mine', onClick: () => done('mine') }, t('They’re all mine: combine them')),
      h('button', { class: 'btn btn-secondary btn-lg btn-block', id: 'yt-team', style: 'margin-top:10px', onClick: () => done('team') }, t('Different people: make a team report')),
      h('button', { class: 'link', style: 'display:block;margin:14px auto 0', onClick: () => done(null) }, t('Cancel'))));
    root.addEventListener('click', (e) => { if (e.target === root) done(null); });
    document.addEventListener('keydown', onKey);
    document.body.append(root);
    requestAnimationFrame(() => { root.classList.add('in'); root.querySelector('#yt-mine').focus(); });
  });
}

/** The prep-screen list of calendars, with a work/personal tag on each and a way to add another. */
export function calendarsBlock({ calendars = [], onAdd, onRole, onRemove }) {
  const input = h('input', { type: 'file', accept: '.ics,.zip,text/calendar,application/zip', multiple: true, hidden: true, id: 'add-calendar-input',
    onChange: (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) onAdd(files); } });
  const several = calendars.length > 1;
  const rows = calendars.map((c) => h('div', { class: 'cal-row' },
    h('span', { class: 'cal-icon', 'aria-hidden': 'true' }, c.role === 'personal' ? '🏡' : '💼'),
    h('span', { class: 'cal-name' }, h('b', {}, c.label), h('span', {}, t('{n} entries', { n: fmt.int(c.count) }))),
    several ? h('div', { class: 'seg seg-sm', role: 'group', 'aria-label': t('Calendar type') }, ['work', 'personal'].map((r) => h('button', { type: 'button', 'aria-pressed': String(c.role === r), onClick: () => onRole(c.id, r) }, r === 'work' ? t('Work') : t('Personal')))) : null,
    several ? h('button', { class: 'ex-remove', type: 'button', 'aria-label': t('Remove {item}', { item: c.label }), onClick: () => onRemove(c.id) }, '×') : null));
  return h('div', { class: 'cals', 'data-reveal': '' },
    rows,
    h('button', { class: 'chip-add', type: 'button', id: 'add-calendar', onClick: () => input.click() }, h('span', { 'aria-hidden': 'true' }, '+'),
      calendars.length === 1 ? (calendars[0].role === 'work' ? t('Add your personal calendar') : t('Add your work calendar')) : t('Add another calendar')),
    several ? h('p', { class: 'caption' }, t('Meetings come only from work calendars. Trips, time off and birthdays come from all of them.')) : null,
    input);
}

// ---------------------------------------------------------------- work and life
const R = { 'data-reveal': '' };
function splitBar(b) {
  const total = Math.max(1, b.workHours + b.lifeHours);
  return h('div', { class: 'split', 'aria-hidden': 'true' },
    h('i', { class: 'split-work', style: `--w:${(b.workHours / total).toFixed(3)}` }),
    h('i', { class: 'split-life', style: `--w:${(b.lifeHours / total).toFixed(3)}` }));
}
const outOfHours = (b) => (b.evening && b.weekend ? t('{e} meetings in the evening and {w} at the weekend.', { e: fmt.int(b.evening), w: fmt.int(b.weekend) })
  : b.evening ? t('{e} meetings in the evening.', { e: fmt.int(b.evening) }) : t('{w} meetings at the weekend.', { w: fmt.int(b.weekend) }));
export function balanceSlide(s) {
  const b = s.balance;
  return {
    theme: 'c-yellow',
    render: () => h('div', {},
      h('p', { class: 'cap', ...R }, t('Work and life')),
      h('p', { class: 'big', ...R }, h('span', { 'data-count': b.lifeShare, 'data-suffix': '%' }, '0%')),
      h('h2', { class: 'line', ...R }, t('of your booked hours were your own.')),
      h('div', { class: 'viz-wrap', ...R }, splitBar(b),
        h('div', { class: 'split-labels' }, h('span', {}, t('Meetings: {h} hrs', { h: fmt.int(b.workHours) })), h('span', {}, t('Your plans: {h} hrs', { h: fmt.int(b.lifeHours) })))),
      b.clashes ? h('p', { class: 'note', ...R }, t('{n} times, work and life were booked for the same moment.', { n: fmt.int(b.clashes) })) : null,
      b.evening + b.weekend ? h('p', { class: 'note', ...R }, outOfHours(b)) : null),
  };
}
export function balancePanel(s) {
  const b = s.balance;
  if (!b) return null;
  const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));
  return h('div', { class: 'panel', 'data-reveal': '' },
    h('h3', {}, t('Work and life')),
    h('p', { class: 'sub' }, t('{p}% of your booked hours were your own, from your work and personal calendars together.', { p: b.lifeShare })),
    h('div', { class: 'viz-light', style: 'margin-top:14px' }, splitBar(b),
      h('div', { class: 'split-labels' }, h('span', {}, t('Meetings: {h} hrs', { h: fmt.int(b.workHours) })), h('span', {}, t('Your plans: {h} hrs', { h: fmt.int(b.lifeHours) })))),
    h('div', { class: 'stat-grid', style: 'margin-top:14px' },
      stat(fmt.int(b.clashes), t('double-booked')), stat(fmt.int(b.evening), t('evening meetings')), stat(fmt.int(b.weekend), t('weekend meetings'))));
}
