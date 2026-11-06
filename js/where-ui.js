// Where you met: the story page and the summary panel.
import { h, fmt } from './ui.js';
import { t, tn } from './i18n.js';
import { mixBar } from './mix-ui.js';

export const hasWhere = (s) => s.mode === 'work' && !!s.where && s.where.types.length >= 2;
export const whereLabel = (key) => ({ online: t('Online'), office: t('In the office'), onsite: t('On site') }[key] || key);
const named = (w) => w.types.map((x) => ({ ...x, name: whereLabel(x.key) }));
const R = { 'data-reveal': '' };

/** The headline: days on site when there were a few, otherwise the share in person. */
export function whereHeadline(w) {
  return w.onsite.days >= 3
    ? { value: w.onsite.days, suffix: w.onsite.days === 1 ? t('day') : t('days'), line: t('on site, face to face.'), note: w.customer.days ? t('{n} of them with customers. {p}% of all your meeting time was in person.', { n: fmt.int(w.customer.days), p: w.inPersonShare }) : t('{p}% of all your meeting time was in person.', { p: w.inPersonShare }) }
    : { value: w.inPersonShare, suffix: '%', line: t('of your meeting time was face to face.'), note: null };
}

export function whereSlide(s) {
  const w = s.where;
  const hd = whereHeadline(w);
  return {
    theme: 'c-orange',
    render: () => h('div', {},
      h('p', { class: 'cap', ...R }, t('Where you met')),
      hd.suffix === '%'
        ? h('p', { class: 'big', ...R }, h('span', { 'data-count': hd.value, 'data-suffix': '%' }, '0%'))
        : h('p', { class: 'big', ...R }, h('span', { 'data-count': hd.value }, '0'), h('small', {}, hd.suffix)),
      h('h2', { class: 'line', ...R }, hd.line),
      h('div', { class: 'viz-wrap', ...R }, mixBar(named(w))),
      hd.note ? h('p', { class: 'note', ...R }, hd.note) : null,
      w.places.length ? h('div', { class: 'chips', ...R }, w.places.slice(0, 5).map((p) => h('span', {}, p.name))) : null),
  };
}

export function wherePanel(s) {
  if (!hasWhere(s)) return null;
  const w = s.where;
  const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));
  return h('div', { class: 'panel where-panel', 'data-reveal': '' },
    h('h3', {}, t('Where you met')),
    h('p', { class: 'sub' }, t('From each meeting’s location: video links are online, meeting rooms are the office, anywhere else is on site.')),
    h('div', { class: 'viz-light', style: 'margin-top:16px' }, mixBar(named(w))),
    h('div', { class: 'stat-grid', style: 'margin-top:14px' },
      stat(`${w.inPersonShare}%`, t('in person')), stat(fmt.int(w.onsite.days), t('days on site')), stat(fmt.int(w.customer.days), t('with customers'))),
    w.places.length ? h('table', { class: 'mix-table' }, h('tbody', {}, w.places.map((p) => h('tr', {},
      h('th', {}, p.name), h('td', {}, tn('{n} meeting', '{n} meetings', p.count)), h('td', {}, t('{h} hrs', { h: fmt.hours(p.hours) })))))) : null);
}
