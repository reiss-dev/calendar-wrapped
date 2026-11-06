// Calendar health, worded: the gauge, the story page and the summary panel.
import { h, svg, fmt } from './ui.js';
import { t, tn } from './i18n.js';

export const hasHealth = (s) => !!s.health && Number.isFinite(s.health.score);

export function bandLabel(band, mode) {
  return mode === 'work'
    ? [t('Excellent'), t('Healthy'), t('Stretched'), t('Overloaded'), t('Underwater')][band]
    : [t('Beautifully balanced'), t('Balanced'), t('Busy'), t('Packed'), t('Non-stop')][band];
}

/** [name, what it measures, the value as a short phrase] for one part. */
export function partCopy(p) {
  switch (p.key) {
    case 'load': return [t('Meeting load'), t('Share of working time in meetings.'), `${fmt.int(p.value)}%`];
    case 'breathing': return [t('Breathing room'), t('Days with three or more meetings back to back.'), tn('{n} day', '{n} days', p.value)];
    case 'focus': return [t('Focus time'), t('Days with no two-hour gap for real work.'), tn('{n} day', '{n} days', p.value)];
    case 'boundaries': return [t('Boundaries'), t('Meetings before 8, after 6 or at the weekend.'), fmt.int(p.value)];
    case 'rest': return [t('Rest'), t('Days of leave taken, against a usual year so far.'), tn('{n} day', '{n} days', p.value)];
    case 'hygiene': return [t('Meeting hygiene'), t('Group meetings sent without an agenda.'), fmt.int(p.value)];
    case 'weekends': return [t('Free weekends'), t('Weekends with nothing planned.'), fmt.int(p.value)];
    case 'streak': return [t('Pauses'), t('The longest run of days with plans.'), tn('{n} day', '{n} days', p.value)];
    case 'evenings': return [t('Evenings'), t('Weeknights with something on.'), fmt.int(p.value)];
    case 'variety': return [t('Variety'), t('Kinds of things that filled the year.'), fmt.int(p.value)];
    default: return [p.key, '', ''];
  }
}

/** A semicircle gauge. `light` for panels, otherwise it takes the slide's two tones. */
export function gauge(score, { light = false } = {}) {
  const r = 90, len = Math.PI * r;
  return h('div', { class: `gauge${light ? ' gauge-light' : ''}`, 'aria-hidden': 'true' },
    svg('svg', { viewBox: '0 0 220 124' },
      svg('path', { class: 'g-track', d: `M 20 110 A ${r} ${r} 0 0 1 200 110` }),
      svg('path', { class: 'g-fill', d: `M 20 110 A ${r} ${r} 0 0 1 200 110`, style: `--len:${len.toFixed(1)}; --p:${(score / 100).toFixed(3)}` })),
    h('div', { class: 'g-num' }, h('span', { 'data-count': score }, light ? String(score) : '0'), h('small', {}, '/100')));
}

export function healthSlide(s) {
  const H = s.health;
  const worst = H.drags[0] ? H.parts.find((p) => p.key === H.drags[0]) : null;
  const best = [...H.parts].sort((a, b) => b.score - a.score)[0];
  const R = { 'data-reveal': '' };
  return {
    theme: 'c-white',
    render: () => h('div', {},
      h('p', { class: 'cap', ...R }, t('Calendar health')),
      h('div', { class: 'viz-wrap', ...R }, gauge(H.score)),
      h('h2', { class: 'line', ...R }, bandLabel(H.band, s.mode)),
      h('p', { class: 'note', ...R }, best.score >= 80 ? t('Strongest: {part}.', { part: partCopy(best)[0].toLowerCase() }) : '', ' ', worst ? t('Costing you most: {part}.', { part: partCopy(worst)[0].toLowerCase() }) : t('Nothing is dragging it down.'))),
  };
}

export function healthPanel(s) {
  if (!hasHealth(s)) return null;
  const H = s.health;
  return h('div', { class: 'panel health-panel', 'data-reveal': '' },
    h('div', { class: 'health-head' },
      gauge(H.score, { light: true }),
      h('div', {}, h('h3', {}, t('Calendar health: {band}', { band: bandLabel(H.band, s.mode) })),
        h('p', { class: 'sub' }, t('Out of 100, from a few things you can check in your own calendar. The reclaim plan below is how to move it.')))),
    h('ul', { class: 'health-parts' }, H.parts.map((p) => {
      const [name, what, value] = partCopy(p);
      return h('li', { class: p.score < 50 ? 'low' : '' },
        h('div', { class: 'hp-top' }, h('b', {}, name), h('span', {}, value)),
        h('div', { class: 'hp-bar' }, h('i', { style: `--v:${(p.score / 100).toFixed(2)}` })),
        h('small', {}, what));
    })));
}
