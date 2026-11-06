// Who meetings were with: the story slide, the summary panel, and the groups people define.
import { h, fmt } from './ui.js';
import { t } from './i18n.js';
import { keep, recall } from './vault.js';
import { barRace } from './viz.js';
import { cleanGroups } from './meeting-mix.js';
import { track } from './analytics.js';

const GROUPS = 'cw:groups';
export function loadGroups() { try { return cleanGroups(JSON.parse(recall(GROUPS) || '[]')); } catch { return []; } }
export function saveGroups(list) { keep(GROUPS, JSON.stringify(cleanGroups(list))); }

export const hasMix = (s) => s.mode === 'work' && !!s.mix && s.mix.types.length >= 2;
const STRENGTH = [100, 62, 38, 22, 12, 7, 4];

export function typeLabel(x) {
  if (x.name) return x.name;
  return { customer: t('Customers'), internal: t('Internal'), one: t('1:1s'), other: t('Just you') }[x.key] || x.key;
}
function headline(x) {
  if (x.name) return t('of your meeting time went on “{name}”.', { name: x.name });
  return { customer: t('of your meeting time was with customers.'), internal: t('of your meeting time was with colleagues.'), one: t('of your meeting time was in 1:1s.') }[x.key] || t('of your meeting time.');
}

/** A single bar split by kind of meeting, with a legend. */
export function mixBar(types, { legend = true } = {}) {
  const list = types.filter((x) => x.pct > 0);
  return h('div', { class: 'mix' },
    h('div', { class: 'mixbar', 'aria-hidden': 'true' }, list.map((x, i) => h('i', { style: `--w:${x.hours.toFixed(1)}; --s:${STRENGTH[i] ?? 4}%; --i:${i}` }))),
    legend ? h('ul', { class: 'mix-legend' }, list.map((x, i) => h('li', { style: `--s:${STRENGTH[i] ?? 4}%` },
      h('i', { 'aria-hidden': 'true' }), h('span', {}, typeLabel(x)), h('b', {}, `${fmt.int(x.pct)}%`)))) : null);
}

const lead = (mix) => mix.types.find((x) => x.key === 'customer' && x.pct >= 10) || mix.types.find((x) => x.key !== 'other') || mix.types[0];

export function mixSlide(s) {
  const mix = s.mix;
  const top = lead(mix);
  const R = { 'data-reveal': '' };
  return {
    theme: 'c-teal',
    render: () => h('div', {},
      h('p', { class: 'cap', ...R }, t('Who you met with')),
      h('p', { class: 'big', ...R }, h('span', { 'data-count': top.pct, 'data-suffix': '%' }, '0%')),
      h('h2', { class: 'line', ...R }, headline(top)),
      h('div', { class: 'viz-wrap', ...R }, mixBar(mix.types)),
      mix.customers.length >= 2 ? h('div', { class: 'viz-wrap', ...R }, barRace(mix.customers.map((c) => ({ label: c.name, value: c.hours, sub: t('{h} hrs', { h: fmt.hours(c.hours) }) })), { max: 4 })) : null,
      mix.companies ? h('p', { class: 'note', ...R }, t('{n} companies, {p} people from outside.', { n: fmt.int(mix.companies), p: fmt.int(mix.externalPeople) })) : null),
  };
}

/** Summary panel: the mix, the top customers, and your own groups. */
export function mixPanel(s, { canApply, onApply }) {
  const mix = s.mix;
  if (!mix) return null;
  const groups = loadGroups();
  const panel = h('div', { class: 'panel mix-panel', 'data-reveal': '' });
  const name = h('input', { type: 'text', id: 'grp-name', maxlength: 24, placeholder: t('e.g. AE meetings'), autocomplete: 'off' });
  const match = h('input', { type: 'text', id: 'grp-match', placeholder: t('e.g. Sarah, tom@company.com, pipeline'), autocomplete: 'off', spellcheck: 'false' });
  const apply = async (list) => {
    saveGroups(list);
    track('groups_applied');
    await onApply();
  };
  const groupRows = groups.map((g) => h('div', { class: 'grp-row' },
    h('span', { class: 'grp-name' }, h('b', {}, g.name), h('span', {}, g.match.join(', '))),
    canApply ? h('button', { class: 'ex-remove', type: 'button', 'aria-label': t('Remove {item}', { item: g.name }), onClick: () => apply(groups.filter((x) => x !== g)) }, '×') : null));
  const add = h('button', { class: 'btn btn-secondary', id: 'grp-add', type: 'button', disabled: !canApply, onClick: async () => {
    const g = cleanGroups([{ name: name.value, match: match.value }])[0];
    if (!g) { (name.value.trim() ? match : name).focus(); return; }
    add.disabled = true; add.textContent = t('Updating…');
    await apply([...groups, { ...g, id: `g${Date.now().toString(36).slice(-6)}` }]);
  } }, t('Add group'));
  panel.append(
    h('h3', {}, t('Who you met with')),
    h('p', { class: 'sub' }, t('Customers are anyone from outside {domain}. Internal means only colleagues.', { domain: mix.home })),
    h('div', { class: 'viz-light', style: 'margin-top:16px' }, mixBar(mix.types)),
    h('table', { class: 'mix-table' }, h('tbody', {}, mix.types.map((x) => h('tr', {},
      h('th', {}, typeLabel(x)), h('td', {}, tnMeetings(x.count)), h('td', {}, t('{h} hrs', { h: fmt.hours(x.hours) })))))),
    mix.customers.length ? h('div', { style: 'margin-top:18px' },
      h('h4', {}, t('Top customers')),
      h('div', { class: 'viz-light' }, barRace(mix.customers.map((c) => ({ label: c.name, value: c.hours, sub: t('{h} hrs', { h: fmt.hours(c.hours) }) })), { max: 6 }))) : null,
    h('div', { class: 'grp' },
      h('h4', {}, t('Your own groups')),
      h('p', { class: 'caption' }, t('Name a kind of meeting and say how to spot it: people’s names or emails, or words in the title. A title match always counts; people only count in meetings without customers.')),
      groupRows.length ? h('div', { class: 'grp-list' }, groupRows) : null,
      h('div', { class: 'grp-form' },
        h('label', { class: 'field' }, h('span', {}, t('Group name')), name),
        h('label', { class: 'field' }, h('span', {}, t('People or words')), match)),
      h('div', { style: 'margin-top:12px; display:flex; gap:12px; align-items:center; flex-wrap:wrap' }, add,
        canApply ? null : h('span', { class: 'caption' }, t('Add your calendar again to change this.')))));
  return panel;
}
const tnMeetings = (n) => t('{n} meetings', { n: fmt.int(n) });
