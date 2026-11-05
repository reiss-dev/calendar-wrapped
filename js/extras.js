// "Anything your calendar missed?": time off, trips and big moments someone adds by hand on the
// prep screen. Kept on this device per year, fed to the engine as calendar entries (time off and
// trips) or straight into the story (moments). Also builds the year's highlights.
import { h, fmt, toast, storage, store } from './ui.js';
import { t, monthName } from './i18n.js';
import { loadGeo, searchPlaces, resolvePlace } from './geo.js';
import { track } from './analytics.js';

const KEY = 'cw:extras';
export const EMOJI = ['🎉', '💼', '🏠', '💍', '👶', '🎓', '🏃', '🐶', '✈️', '❤️', '🏆', '🌱'];
const empty = () => ({ off: [], trips: [], moments: [] });

export function loadExtras(year) {
  const all = storage(KEY, {}) || {};
  const x = all[year] || {};
  return { off: Array.isArray(x.off) ? x.off : [], trips: Array.isArray(x.trips) ? x.trips : [], moments: Array.isArray(x.moments) ? x.moments : [] };
}
export function saveExtras(year, x) {
  const all = storage(KEY, {}) || {};
  all[year] = x;
  store(KEY, all);
}
export const hasExtras = (x) => !!x && (x.off.length + x.trips.length + x.moments.length > 0);

const d = (k) => new Date(`${k}T12:00:00`);
export function dateSpan(a, b) {
  const A = d(a), B = d(b);
  if (a === b) return fmt.date(A);
  return A.getMonth() === B.getMonth() ? `${A.getDate()}–${fmt.date(B)}` : `${fmt.date(A)} – ${fmt.date(B)}`;
}

// ---------------------------------------------------------------- sheets
function sheet(title, fields, onSave, { saveLabel = t('Add') } = {}) {
  const root = h('div', { class: 'modal-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'extra-title' });
  const opener = document.activeElement;
  const close = () => { root.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => { root.remove(); opener?.focus?.(); }, 300); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const error = h('p', { class: 'field-error', 'aria-live': 'polite' });
  const form = h('form', { class: 'extra-form', novalidate: true, onSubmit: (e) => {
    e.preventDefault();
    const problem = onSave();
    if (problem) { error.textContent = problem; return; }
    close();
  }, onInput: () => { error.textContent = ''; } }, ...fields, error,
  h('button', { class: 'btn btn-lg btn-block', type: 'submit' }, saveLabel),
  h('button', { class: 'btn btn-secondary btn-block', type: 'button', style: 'margin-top:10px', onClick: close }, t('Cancel')));
  root.append(h('div', { class: 'modal modal-extra' }, h('h3', { id: 'extra-title' }, title), form));
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  requestAnimationFrame(() => { root.classList.add('in'); form.querySelector('input, select')?.focus(); });
}
const field = (label, input, hint) => h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
function dates(year, start = '', end = '') {
  const min = `${year}-01-01`, max = `${year}-12-31`;
  const a = h('input', { type: 'date', id: 'extra-from', min, max, value: start, required: true });
  const b = h('input', { type: 'date', id: 'extra-to', min, max, value: end, required: true });
  a.addEventListener('change', () => { if (!b.value || b.value < a.value) b.value = a.value; b.min = a.value || min; });
  return { a, b, row: h('div', { class: 'field-row' }, field(t('From'), a), field(t('To'), b)),
    check: () => (!a.value || !b.value ? t('Pick both dates.') : b.value < a.value ? t('The end date is before the start.') : a.value < min || b.value > max ? t('Keep it within {year}.', { year }) : null) };
}

export function addTimeOff(year, x, done) {
  const dt = dates(year);
  const label = h('input', { type: 'text', id: 'extra-label', maxlength: 24, placeholder: t('Half term, Lake District…'), autocomplete: 'off' });
  sheet(t('Add time off'), [dt.row, field(t('What or where'), label, t('Optional'))], () => {
    const problem = dt.check();
    if (problem) return problem;
    x.off.push({ start: dt.a.value, end: dt.b.value, label: label.value.trim().slice(0, 24) || null });
    track('extra_added');
    done();
    return null;
  });
}

export function addTrip(year, x, done, { holiday = true } = {}) {
  const dt = dates(year);
  const city = h('input', { type: 'text', id: 'extra-city', placeholder: t('City or airport code'), autocomplete: 'off', spellcheck: 'false', 'aria-autocomplete': 'list', 'aria-controls': 'extra-suggest' });
  const list = h('div', { class: 'suggest', id: 'extra-suggest', role: 'listbox' });
  const hol = h('input', { type: 'checkbox', id: 'extra-holiday', checked: holiday });
  let ready = false;
  loadGeo().then(() => { ready = true; });
  city.addEventListener('input', async () => {
    if (!ready) await loadGeo();
    list.replaceChildren(...searchPlaces(city.value, 5).map((p) => h('button', { type: 'button', role: 'option', onClick: () => { city.value = p.name; list.replaceChildren(); dt.a.focus(); } }, p.name, p.code ? h('span', {}, p.code) : null)));
  });
  sheet(t('Add a trip'), [field(t('Where to'), h('div', { class: 'suggest-wrap' }, city, list)), dt.row,
    h('label', { class: 'check' }, hol, h('span', {}, t('It was a holiday (count it as time off)')))], () => {
    const place = ready && resolvePlace(city.value.trim());
    if (!city.value.trim()) return t('Where did you go?');
    if (!place) return t('We don’t know that place. Try the nearest city with an airport.');
    const problem = dt.check();
    if (problem) return problem;
    x.trips.push({ to: place.name, start: dt.a.value, end: dt.b.value, holiday: hol.checked });
    track('extra_added');
    done();
    return null;
  });
}

export function addMoment(year, x, done) {
  let emoji = EMOJI[0];
  const picks = h('div', { class: 'emoji-pick', role: 'radiogroup', 'aria-label': t('Pick an emoji') }, EMOJI.map((e, i) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(i === 0), onClick: (ev) => {
    emoji = e;
    picks.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === ev.currentTarget)));
  } }, e)));
  const title = h('input', { type: 'text', id: 'extra-moment', maxlength: 40, placeholder: t('New job, moved house, ran a marathon…'), autocomplete: 'off' });
  const now = new Date();
  const month = h('select', { id: 'extra-month' }, Array.from({ length: 12 }, (_, m) => h('option', { value: m, selected: m === (now.getFullYear() === year ? now.getMonth() : 0) }, monthName(m))));
  sheet(t('Add a moment'), [field(t('Pick an emoji'), picks), field(t('What happened'), title), field(t('When'), h('div', { class: 'select-box' }, month))], () => {
    const text = title.value.trim().slice(0, 40);
    if (!text) return t('Give it a few words.');
    x.moments.push({ emoji, title: text, m: Number(month.value) });
    track('extra_added');
    done();
    return null;
  });
}

// ---------------------------------------------------------------- prep screen block
/** The optional step on the prep screen. Returns { el, setYear }. */
export function extrasBlock({ year, mode }) {
  let y = year, x = loadExtras(y);
  const list = h('ul', { class: 'extras-list' });
  const save = () => { saveExtras(y, x); render(); };
  const remove = (kind, i) => { x[kind].splice(i, 1); save(); };
  const row = (icon, text, sub, kind, i) => h('li', {}, h('span', { class: 'ex-icon', 'aria-hidden': 'true' }, icon), h('span', { class: 'ex-text' }, h('b', {}, text), sub ? h('span', {}, sub) : null),
    h('button', { class: 'ex-remove', type: 'button', 'aria-label': t('Remove {item}', { item: text }), onClick: () => remove(kind, i) }, '×'));
  function render() {
    list.replaceChildren(
      ...x.off.map((o, i) => row('🌴', o.label || t('Time off'), dateSpan(o.start, o.end), 'off', i)),
      ...x.trips.map((tr, i) => row('✈️', tr.to, dateSpan(tr.start, tr.end) + (tr.holiday ? ` · ${t('holiday')}` : ''), 'trips', i)),
      ...x.moments.map((m, i) => row(m.emoji, m.title, monthName(m.m), 'moments', i)));
    list.hidden = !hasExtras(x);
  }
  const chip = (label, fn) => h('button', { class: 'chip-add', type: 'button', onClick: fn }, h('span', { 'aria-hidden': 'true' }, '+'), label);
  const el = h('div', { class: 'extras', 'data-reveal': '' },
    h('div', { class: 'extras-head' }, h('b', {}, t('Anything your calendar missed?')), h('span', {}, t('Optional. Holidays, trips and big moments. They stay on this device.'))),
    h('div', { class: 'extras-chips' },
      chip(t('Time off'), () => addTimeOff(y, x, save)),
      chip(t('Trip'), () => addTrip(y, x, save, { holiday: mode() !== 'work' })),
      chip(t('Moment'), () => addMoment(y, x, save))),
    list);
  render();
  return { el, setYear: (next) => { y = next; x = loadExtras(y); render(); }, get: () => loadExtras(y) };
}

// ---------------------------------------------------------------- highlights
/** The year's big moments: what someone added, plus a few the calendar makes obvious. */
export function highlights(s) {
  const manual = (s.moments || []).map((m) => ({ ...m, manual: true }));
  const auto = [];
  const o = s.timeOff;
  if (o?.longest && o.longest.span >= 5) {
    const L = o.longest;
    auto.push({ emoji: '🌴', m: d(L.start).getMonth(), title: L.label ? t('{n} days in {place}', { n: L.span, place: L.label }) : t('{n} days off in a row', { n: L.span }) });
  }
  const now = s.range?.end ? new Date(s.range.end) : new Date();
  for (const b of (s.birthdayInfo?.milestones || []).slice(0, 2)) {
    const past = new Date(s.year, b.m, b.d) < now;
    auto.push({ emoji: '🎂', m: b.m, title: past ? t('{name} turned {age}', { name: b.name, age: b.age }) : t('{name} turns {age}', { name: b.name, age: b.age }) });
  }
  const far = s.travel?.routes?.longest;
  if (far && far.km >= 1500) auto.push({ emoji: '✈️', m: new Date(far.date).getMonth(), title: t('Furthest trip: {place}', { place: far.to.name === s.travel.routes.home?.name ? far.from.name : far.to.name }) });
  const items = [...manual, ...auto.slice(0, Math.max(0, 7 - manual.length))];
  return items.sort((a, b) => a.m - b.m || Number(b.manual || 0) - Number(a.manual || 0)).slice(0, 7);
}
export const showHighlights = (s) => (s.moments || []).length >= 1 || highlights(s).length >= 3;

export function timeline(items, { removable = null, story = false } = {}) {
  return h('ol', { class: 'timeline' }, items.map((x, i) => h('li', story ? { 'data-reveal': '' } : { class: 'tl-pop', style: `--k:${i}` },
    h('span', { class: 'tl-month' }, monthName(x.m, 'short')),
    h('span', { class: 'tl-dot', 'aria-hidden': 'true' }, x.emoji),
    h('span', { class: 'tl-title' }, x.title),
    removable && x.manual ? h('button', { class: 'ex-remove', type: 'button', 'aria-label': t('Remove {item}', { item: x.title }), onClick: () => removable(x) }, '×') : null)));
}

export function highlightsSlide(s) {
  const items = highlights(s);
  return {
    theme: 'c-orange',
    render: () => h('div', {},
      h('p', { class: 'cap', 'data-reveal': '' }, t('Highlights')),
      h('h2', { class: 'line', 'data-reveal': '' }, t('The bits that mattered.')),
      timeline(items, { story: true })),
  };
}

/** Summary panel. Moments can be added and removed here without re-reading the calendar. */
export function highlightsPanel(s, { onChange }) {
  const x = loadExtras(s.year);
  const panel = h('div', { class: 'panel highlights-panel', 'data-reveal': '' });
  const changed = () => { saveExtras(s.year, x); s.moments = x.moments; onChange(); render(); };
  function render() {
    const items = highlights(s);
    panel.replaceChildren(
      h('h3', {}, t('Highlights')),
      h('p', { class: 'sub' }, t('The big moments, from your calendar and from you.')),
      items.length ? h('div', { class: 'timeline-light' }, timeline(items, { removable: (it) => { const i = x.moments.findIndex((m) => m.title === it.title && m.m === it.m); if (i >= 0) { x.moments.splice(i, 1); changed(); } } })) : h('p', { class: 'caption', style: 'margin-top:12px' }, t('Nothing yet. Add the moments your calendar can’t know about.')),
      h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn btn-secondary', onClick: () => addMoment(s.year, x, () => { changed(); toast(t('Added to your highlights.')); }) }, t('Add a moment'))));
  }
  render();
  return panel;
}
