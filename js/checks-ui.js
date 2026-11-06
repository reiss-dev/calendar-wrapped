// "Does this look right?" Shown at the top of the summary when a number looks off, with what's behind
// it and a one-tap way to leave the wrong things out. Saying it's right hides it for good.
import { h, fmt } from './ui.js';
import { t } from './i18n.js';
import { loadFilters, saveFilters } from './calendars-ui.js';
import { track } from './analytics.js';

function copy(c) {
  switch (c.id) {
    case 'leave': return [t('{n} days off. That’s a lot more than the usual {typical}.', { n: fmt.int(c.n), typical: fmt.int(c.typical || 25) }), t('Colleagues’ leave can land in your calendar. Untick anything that isn’t yours.')];
    case 'share': return [t('Meetings took {p}% of your working time.', { p: fmt.int(c.n) }), t('That’s very high. Holds, travel and blocks with other people on them can count as meetings. Untick anything that isn’t one.')];
    case 'noattendees': return [t('Meetings took {p}% of your working time.', { p: fmt.int(c.n) }), t('This file has no attendee details, so every timed entry counts as a meeting. Untick anything that isn’t one.')];
    case 'long': return [t('{n} meetings ran four hours or more.', { n: fmt.int(c.n) }), t('Workshops are real. Office days, conferences and travel usually aren’t meetings.')];
    case 'notmine': return [t('{n} meetings you weren’t invited to.', { n: fmt.int(c.n) }), t('They have other people on them but not you, so they’re probably from a shared calendar.')];
    default: return ['', ''];
  }
}
const meta = (x) => (x.days ? t('{n} days', { n: fmt.int(x.days) }) : x.hours ? t('{h} hrs', { h: fmt.hours(x.hours) }) : `${fmt.int(x.count)}×`);

export function checksPanel(s, { canApply, onApply }) {
  const f = loadFilters();
  const list = (s.checks || []).filter((c) => !f.ok.includes(c.id));
  if (!list.length) return null;
  const off = new Set(f.titles.map((x) => x.toLowerCase()));
  const boxes = [];
  let notMine = null;
  const blocks = list.map((c, ci) => {
    const [head, sub] = copy(c);
    const rows = c.items.map((x, i) => {
      const box = h('input', { type: 'checkbox', id: `ck-${ci}-${i}`, checked: !off.has(x.title.toLowerCase()) });
      boxes.push({ title: x.title, box });
      return h('label', { class: 'lo-item', for: `ck-${ci}-${i}` }, box, h('span', { class: 'lo-title' }, x.title), h('span', { class: 'lo-meta' }, meta(x)));
    });
    if (c.id === 'notmine') {
      notMine = h('input', { type: 'checkbox', id: 'ck-notmine', checked: f.notMine });
      return h('div', { class: 'ck-block', 'data-check': c.id }, h('h4', {}, head), h('p', { class: 'sub' }, sub),
        h('label', { class: 'check', for: 'ck-notmine' }, notMine, h('span', {}, t('Leave out meetings I wasn’t invited to'))));
    }
    return h('div', { class: 'ck-block', 'data-check': c.id }, h('h4', {}, head), h('p', { class: 'sub' }, sub), rows.length ? h('div', { class: 'lo-list' }, rows) : null);
  });
  const update = h('button', { class: 'btn', disabled: !canApply, onClick: async () => {
    update.disabled = true; update.textContent = t('Updating…');
    const cur = loadFilters();
    const titles = new Set(cur.titles);
    for (const b of boxes) { if (b.box.checked) titles.delete(b.title); else titles.add(b.title); }
    saveFilters({ ...cur, titles: [...titles], notMine: notMine ? notMine.checked : cur.notMine });
    track('check_fixed');
    await onApply();
  } }, t('Update my Wrapped'));
  const right = h('button', { class: 'btn btn-secondary', onClick: () => {
    const cur = loadFilters();
    saveFilters({ ...cur, ok: [...new Set([...cur.ok, ...list.map((c) => c.id)])] });
    track('check_ok');
    panel.classList.add('gone');
    setTimeout(() => panel.remove(), 350);
  } }, t('It’s right'));
  const panel = h('div', { class: 'panel checks-panel', 'data-reveal': '', role: 'region', 'aria-label': t('Does this look right?') },
    h('p', { class: 'checks-kicker' }, t('Does this look right?')),
    blocks,
    h('div', { class: 'checks-actions' }, update, right, canApply ? null : h('span', { class: 'caption' }, t('Add your calendar again to change this.'))));
  return panel;
}
