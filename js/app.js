// App controller: landing → prep → story → summary → report, plus team, shared-card and compare views.
import { CONFIG } from './config.js';
import { t, tn, setLocale, pickLocale, translateDom, LOCALES, locale, localeInfo } from './i18n.js';
import { createEngine } from './engine.js';
import { buildSlides } from './slides.js';
import { createStory } from './story.js';
import { renderCard, canvasToBlob, FORMATS } from './card.js';
import { cardModel, modelPersona, comparison } from './model.js';
import { shareUrl, compareUrl, readShared, siteRoot } from './share.js';
import { renderReport } from './report.js';
import { planText } from './plan.js';
import { sound } from './sound.js';
import { track, initMonitoring } from './analytics.js';
import { googleEnabled, connectGoogle, preloadGoogle } from './google.js';
import { microsoftEnabled, connectMicrosoft } from './microsoft.js';
import { addFiles, renderTeamSetup, renderTeamReport, savedTeam, clearTeam } from './team.js';
import { isUnlocked, getUnlock, openUnlockModal, handleReturnFromCheckout, price } from './pay.js';
import { persona as personaOf } from './copy.js';
import { reclaimList } from './reclaim-ui.js';
import { yearHeatmap, heatLegend, weekGridViz, readingGrid } from './viz.js';
import { compareWithOthers, alreadyShared, MIN_SAMPLE } from './bench.js';
import { yoyChange } from './stats.js';
import { h, fmt, toast, wait, stagger, storage, store } from './ui.js';
import { renderShowcase } from './showcase.js';

const STATS_KEY = 'cw:stats';
const PREFS_KEY = 'cw:card';
const FRIEND_KEY = 'cw:friend';
const engine = createEngine();
const state = {
  summary: null, stats: null, years: [], story: null, demoToggle: false, team: null, view: 'landing',
  options: { year: null, mode: 'auto', selfEmail: null, week: null },
  card: { format: 'portrait', hideNames: CONFIG.share.hideNamesByDefault, who: '', ...storage(PREFS_KEY, {}) },
};
const views = {};
for (const id of ['landing', 'prep', 'story', 'summary', 'report', 'team', 'shared']) views[id] = document.getElementById(`view-${id}`);

function show(id, { push = true, hash } = {}) {
  state.view = id;
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('is-active', k === id));
  if (id !== 'story') window.scrollTo({ top: 0 });
  const target = hash ?? (id === 'landing' ? '' : `#${id}`);
  const base = siteRoot().replace(location.origin, '');
  if (push && location.hash !== target) history.pushState({ view: id }, '', target ? `${location.pathname.startsWith(`${base}c/`) ? base : location.pathname}${target}` : base);
}

// ---------- persistence ----------
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const revive = (k, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v);
function saveStats(stats) { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* quota */ } }
function loadStats() { try { const raw = localStorage.getItem(STATS_KEY); return raw ? JSON.parse(raw, revive) : null; } catch { return null; } }
const readFriend = () => { try { return JSON.parse(sessionStorage.getItem(FRIEND_KEY)); } catch { return null; } };
const saveFriend = (m) => { try { sessionStorage.setItem(FRIEND_KEY, JSON.stringify(m)); } catch { /* private mode */ } };

// ---------- language ----------
function initLanguagePicker() {
  const sel = document.getElementById('lang');
  if (!sel) return;
  sel.innerHTML = '';
  for (const [code, info] of Object.entries(LOCALES)) sel.append(h('option', { value: code, selected: code === locale() }, info.name));
  sel.onchange = async () => {
    await setLocale(sel.value);
    store('cw:lang', sel.value);
    state.options.week = null;
    track('lang_changed');
    translateDom();
    renderShowcase();
    rerender();
  };
}
function rerender() {
  document.title = CONFIG.brand.name;
  if (state.view === 'summary') showSummary({ push: false });
  else if (state.view === 'report') showReport({ push: false });
  else if (state.view === 'team') (location.hash === '#team-report' && state.team ? showTeamReport({ push: false }) : openTeam());
  else if (state.view === 'shared') route();
}

// ---------- landing ----------
function initLanding() {
  document.querySelectorAll('[data-brand-name]').forEach((n) => { n.textContent = CONFIG.brand.name; });
  document.title = CONFIG.brand.name;
  const input = document.getElementById('file-input');
  document.getElementById('dropzone').addEventListener('click', () => { sound.prime(); input.click(); });
  input.addEventListener('change', () => { handleFiles([...input.files]); input.value = ''; });

  const overlay = document.getElementById('drop-overlay');
  let depth = 0;
  window.addEventListener('dragenter', (e) => { if (!e.dataTransfer?.types?.includes('Files')) return; depth++; overlay.classList.add('is-active'); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (depth === 0) overlay.classList.remove('is-active'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; overlay.classList.remove('is-active');
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /\.ics$/i.test(f.name) || f.type === 'text/calendar');
    if (files.length) handleFiles(files);
    else if (e.dataTransfer?.files?.length) toast(t('That isn’t an .ics calendar file.'));
  });

  document.querySelectorAll('[data-action="demo"]').forEach((b) => b.addEventListener('click', () => { sound.prime(); loadDemo(); }));
  document.querySelectorAll('[data-action="team"]').forEach((b) => b.addEventListener('click', () => openTeam()));
  document.querySelectorAll('[data-tab]').forEach((tb) => tb.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === tb)));
    document.querySelectorAll('.tabpanel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === tb.dataset.tab));
  }));

  const g = document.getElementById('google-connect');
  if (g && googleEnabled()) { g.hidden = false; preloadGoogle(); g.addEventListener('click', () => { sound.prime(); loadGoogle(); }); }
  const m = document.getElementById('microsoft-connect');
  if (m && microsoftEnabled()) { m.hidden = false; m.addEventListener('click', () => { sound.prime(); loadMicrosoft(); }); }

  renderShowcase();
  const device = document.querySelector('.device-wrap');
  if (device && 'IntersectionObserver' in window) {
    device.style.animationPlayState = 'paused';
    new IntersectionObserver((entries, io) => { if (entries[0].isIntersecting) { device.style.animationPlayState = 'running'; io.disconnect(); } }, { threshold: 0.15 }).observe(device);
    setTimeout(() => { device.style.animationPlayState = 'running'; }, 2500); // never leave it hidden
  }
}

function handleFiles(files) {
  if (files.length > 1) { openTeam(files); return; }
  const file = files[0];
  if (!file) return;
  if (file.size > 80 * 1024 * 1024) { toast(t('That file is unusually large. Try exporting a single calendar.')); return; }
  track('file_loaded');
  runPrep(file.name, async () => engine.loadText(await file.text()));
}

function loadDemo() {
  const forced = new URLSearchParams(location.search).get('demo');
  const which = ['personal', 'work'].includes(forced) ? forced : state.demoToggle ? 'personal' : 'work';
  state.demoToggle = which === 'work';
  track('demo_loaded');
  runPrep(which === 'work' ? t('Sample work calendar') : t('Sample personal calendar'), async () => {
    const res = await fetch(`sample/${which}.ics`);
    if (!res.ok) throw new Error('Demo file not found.');
    return engine.loadText(await res.text());
  });
}

function connectRange() {
  const now = new Date();
  return { timeMin: new Date(now.getFullYear() - 1, 0, 1), timeMax: new Date(now.getFullYear() + 1, 0, 1) };
}
// Both sign-ins start inside the click so the popup isn't blocked; the prep screen follows.
function loadGoogle() {
  let progress = () => {};
  const pending = connectGoogle({ ...connectRange(), onProgress: (n) => progress(n) });
  runPrep('Google Calendar', async (say) => {
    progress = (n) => say(t('Read <b>{n}</b> events', { n: fmt.int(n) }), 0, true);
    const r = await pending;
    track('google_connected');
    return engine.loadEvents(r.events, r.meta);
  });
}
function loadMicrosoft() {
  let progress = () => {};
  const pending = connectMicrosoft({ ...connectRange(), onProgress: (n) => progress(n) });
  runPrep('Microsoft 365', async (say) => {
    progress = (n) => say(t('Read <b>{n}</b> events', { n: fmt.int(n) }), 0, true);
    const r = await pending;
    track('microsoft_connected');
    return engine.loadEvents(r.events, r.meta);
  });
}

// ---------- prep ----------
async function runPrep(label, loader) {
  show('prep');
  const log = h('div', { class: 'prep-log' });
  const inner = h('div', { class: 'prep-inner' }, h('div', { class: 'spinner reading-wrap', 'aria-hidden': 'true' }, readingGrid()), h('h2', {}, t('Reading your year')), log);
  views.prep.className = 'view is-active prep';
  views.prep.innerHTML = '';
  views.prep.append(inner);
  let lastLine = null;
  const say = async (msg, delay = 420, replace = false) => {
    if (replace && lastLine) lastLine.innerHTML = msg;
    else { lastLine = h('div', { html: msg }); log.append(lastLine); }
    if (delay) await wait(delay);
  };
  const started = Date.now();
  await say(t('Opening <b>{name}</b>', { name: escapeHtml(label) }), 350);

  let summary;
  try { summary = await loader(say); } catch (err) {
    console.error(err);
    const friendly = /google|microsoft|sign-in|cancel|organisation|blocked|refused/i.test(err.message || '');
    return prepError(friendly ? escapeHtml(err.message) : t('That doesn’t look like a calendar file. It needs to be the <code>.ics</code> export, not the zip and not a CSV.'));
  }
  state.summary = summary;
  if (!summary.count) return prepError(t('No events found in the last couple of years. Check you exported the right calendar and try again.'));

  const now = new Date();
  const perYear = Object.entries(summary.perYear).map(([y, c]) => [Number(y), c]);
  state.years = perYear.filter(([y, c]) => c >= 15 && y <= now.getFullYear()).map(([y]) => y).sort((a, b) => b - a).slice(0, 3);
  if (!state.years.length) state.years = [perYear.sort((a, b) => b[1] - a[1])[0][0]];
  state.options.year = state.years.includes(now.getFullYear()) ? now.getFullYear() : state.years[0];
  state.options.selfEmail = summary.selfEmail;
  state.options.week = state.options.week || localeInfo().week;

  lastLine = null;
  await say(t('Found <b>{n} entries</b> across {y}', { n: fmt.int(summary.count), y: tn('{n} year', '{n} years', perYear.length) }));
  const probe = await engine.compute({ year: state.options.year, mode: 'auto', selfEmail: state.options.selfEmail, workHoursPerWeek: state.options.week });
  state.options.mode = probe.detectedMode;
  await say(probe.mode === 'work' ? t('Spotted <b>{n} meetings</b>. Looks like a work calendar', { n: fmt.int(probe.meetings) }) : t('Looks like a <b>personal calendar</b>, {n} plans in {y}', { n: fmt.int(probe.events), y: state.options.year }));
  await say(t('Counting the hours'), 300);
  const remaining = CONFIG.introMs - (Date.now() - started);
  if (remaining > 0) await wait(remaining);
  renderPrepOptions(inner, probe);
}

function prepError(msg) {
  views.prep.querySelector('.spinner')?.remove();
  views.prep.querySelector('.prep-inner').append(
    h('div', { class: 'prep-error' }, h('p', { html: msg }), h('div', { style: 'display:flex; gap:10px; flex-wrap:wrap' }, h('button', { class: 'btn', onClick: () => show('landing') }, t('Try again')), h('a', { class: 'btn btn-secondary', href: '#export', onClick: () => show('landing', { push: false }) }, t('How to export')))),
  );
}

function seg(values, current, onPick, labelFn = (v) => v, attrs = {}) {
  return h('div', { class: 'seg', role: 'group', ...attrs }, values.map((v) => h('button', { 'aria-pressed': String(v === current), onClick: (e) => { [...e.currentTarget.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); onPick(v); } }, labelFn(v))));
}

function renderPrepOptions(inner, probe) {
  inner.querySelector('.spinner').remove();
  inner.querySelector('h2').textContent = t('Ready when you are');
  inner.querySelector('.prep-log').remove();
  const workOnly = (el) => { el.dataset.workOnly = '1'; if (state.options.mode !== 'work') el.style.display = 'none'; return el; };
  const emailRow = workOnly(h('div', { class: 'row' }, h('label', { class: 'lbl', for: 'self-email' }, t('You are')), h('input', { type: 'email', id: 'self-email', value: state.options.selfEmail || '', placeholder: t('your@email.com'), onInput: (e) => { state.options.selfEmail = e.target.value.trim().toLowerCase() || null; } })));
  const weeks = [35, 37.5, 40];
  if (!weeks.includes(state.options.week)) weeks.push(state.options.week);
  const weekRow = workOnly(h('div', { class: 'row' }, h('span', { class: 'lbl' }, t('Working week')), seg(weeks.sort((a, b) => a - b), state.options.week, (w) => { state.options.week = w; }, (w) => t('{n} hrs', { n: fmt.num(w) }))));
  const group = h('div', { class: 'group', 'data-reveal': '' },
    h('div', { class: 'row' }, h('span', { class: 'lbl' }, t('Year')), seg(state.years, state.options.year, (y) => { state.options.year = y; })),
    h('div', { class: 'row' }, h('span', { class: 'lbl' }, t('Calendar type')), seg(['work', 'personal'], state.options.mode, (m) => { state.options.mode = m; group.querySelectorAll('[data-work-only]').forEach((r) => { r.style.display = m === 'work' ? '' : 'none'; }); }, (m) => (m === 'work' ? t('Work') : t('Personal')))),
    emailRow, weekRow,
  );
  const warn = !probe.attendeeInfoAvailable ? h('p', { class: 'prep-warn', 'data-reveal': '' }, t('This export has no attendee details, so every timed event is treated as a meeting. Outlook’s published calendars often leave them out.')) : null;
  const play = h('button', { class: 'btn btn-lg', 'data-reveal': '', onClick: () => { sound.prime(); startStory(); } }, t('Play my Wrapped'));
  const privacy = h('p', { class: 'caption', 'data-reveal': '' }, t('Still nothing has left your browser.'));
  inner.append(...[group, warn, play, privacy].filter(Boolean));
  stagger(inner);
  play.focus({ preventScroll: true });
}

// ---------- story ----------
async function startStory() {
  const o = state.options;
  state.stats = await engine.compute({ year: o.year, mode: o.mode, selfEmail: o.selfEmail, workHoursPerWeek: o.week });
  state.stats.source = state.summary?.meta?.source || 'unknown';
  state.stats.selfEmail = o.selfEmail;
  saveStats(state.stats);
  track('story_started');
  playStory();
}
function playStory() {
  show('story');
  state.story = createStory(views.story, buildSlides(state.stats), { year: state.stats.year, onFinish: () => showSummary(), onExit: () => showSummary() });
}

// ---------- summary ----------
const saveCardPrefs = () => store(PREFS_KEY, { format: state.card.format, hideNames: state.card.hideNames, who: state.card.who });
const myModel = (s = state.stats) => cardModel(s, { hideNames: state.card.hideNames, who: state.card.who, locale: locale() });
const ctxOf = (s) => ({ selfEmail: s.selfEmail, source: s.source });

async function showSummary({ push = true } = {}) {
  const s = state.stats;
  if (!s) { show('landing'); return; }
  show('summary', { push });
  const unlocked = isUnlocked('personal');
  const host = views.summary;
  host.innerHTML = '';
  const isWork = s.mode === 'work';
  const P = personaOf(s.persona);
  const canvas = h('canvas', { 'aria-label': t('Your share card') });
  const frame = h('div', { class: 'canvas-frame' }, canvas);
  const draw = () => {
    renderCard(canvas, myModel(), { format: state.card.format, watermark: !unlocked });
    frame.style.setProperty('--ar', `${FORMATS[state.card.format].W} / ${FORMATS[state.card.format].H}`);
  };

  const formatPicker = seg(Object.keys(FORMATS), state.card.format, (f) => { state.card.format = f; saveCardPrefs(); draw(); }, (f) => FORMATS[f].label(), { 'aria-label': t('Card format') });
  const namesToggle = h('label', { class: 'switch' },
    h('input', { type: 'checkbox', role: 'switch', checked: !state.card.hideNames, onChange: (e) => { state.card.hideNames = !e.target.checked; saveCardPrefs(); draw(); } }),
    h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', {}, isWork ? t('Show names and titles') : t('Show names')));
  const whoInput = h('input', { class: 'who', type: 'text', maxlength: 20, value: state.card.who, placeholder: t('Your first name (optional)'), 'aria-label': t('Name shown when someone opens your link'), onInput: (e) => { state.card.who = e.target.value.trim(); saveCardPrefs(); } });

  const actions = h('div', { class: 'card-actions' },
    h('button', { class: 'btn', onClick: () => download(canvas, `calendar-wrapped-${s.year}-${state.card.format}.png`) }, t('Save image')),
    navigator.share ? h('button', { class: 'btn btn-secondary', onClick: () => shareCard(canvas, s) }, t('Share')) : null,
    h('button', { class: 'btn btn-secondary', onClick: () => copyLink(s) }, t('Copy link')),
  );

  const c = yoyChange(s);
  const tiles = isWork ? [
    [fmt.int(s.meetings), t('meetings')], [t('{h} hrs', { h: fmt.hours(s.totalHours) }), t('in meetings')], [`${s.shareOfWork}%`, t('of working time')],
    [s.worstWeek ? fmt.weekRange(s.worstWeek.start) : '—', t('worst week')], [s.collaborators[0]?.name.split(' ')[0] || '—', t('most seen')],
    c ? [`${c.pct > 0 ? '+' : c.pct < 0 ? '−' : ''}${Math.abs(c.pct)}%`, t('compared with {year}', { year: s.yoy.year })] : [fmt.int(s.backToBack), t('back-to-back')],
  ] : [
    [fmt.int(s.events), t('plans')], [t('{h} hrs', { h: fmt.hours(s.totalHours) }), t('planned time')], [s.people[0]?.name || '—', t('most seen')],
    [t('{a} of {b}', { a: s.freeWeekends, b: s.totalWeekends }), t('free weekends')], [fmt.int(s.travel.trips), t('trips')],
    c ? [`${c.pct > 0 ? '+' : c.pct < 0 ? '−' : ''}${Math.abs(c.pct)}%`, t('compared with {year}', { year: s.yoy.year })] : [fmt.int(s.birthdays), t('birthdays')],
  ];

  const rec = s.reclaim;
  const unlockBtn = h('button', { class: 'btn', onClick: () => openUnlockModal({ beforeRedirect: () => saveStats(s), onUnlocked: () => showSummary({ push: false }) }) }, t('Unlock for {price}', { price: price('personal') }));
  const peak = Object.entries(s.daily || {}).sort((a, b) => b[1] - a[1])[0];

  host.append(h('div', { class: 'summary' },
    h('div', { class: 'summary-head' },
      h('div', { class: 'emoji', 'data-reveal': '' }, P.emoji),
      h('h2', { 'data-reveal': '' }, P.name),
      h('p', { 'data-reveal': '' }, P.blurb),
    ),
    h('div', { class: 'summary-grid' },
      h('div', { class: 'card-preview', 'data-reveal': '' },
        h('div', { class: 'card-controls' }, formatPicker),
        frame,
        h('div', { class: 'card-meta' }, namesToggle, whoInput),
        actions,
        h('p', { class: 'caption', style: 'margin-top:12px; text-align:center' }, unlocked ? t('Clean card, no watermark.') : t('The free card carries a small watermark. Links carry only the numbers on the card, never your calendar.'))),
      h('div', { class: 'stack' },
        h('div', { class: 'panel', 'data-reveal': '' }, h('h3', {}, t('{year} at a glance', { year: s.year })), h('p', { class: 'sub' }, isWork ? t('Work calendar, {period}.', { period: s.isPartialYear ? t('1 January to {date}', { date: fmt.date(s.range.end) }) : t('the whole year') }) : t('Personal calendar, {period}.', { period: s.isPartialYear ? t('1 January to {date}', { date: fmt.date(s.range.end) }) : t('the whole year') })), h('div', { class: 'stat-grid', style: 'margin-top:14px' }, tiles.map(([v, l]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l))))),
        h('div', { class: 'panel', 'data-reveal': '' },
          h('h3', {}, t('Your year, day by day')),
          h('p', { class: 'sub' }, peak ? (isWork ? t('Each square is a day. The darkest is {date}, with {h} hours of meetings.', { date: fmt.date(new Date(`${peak[0]}T12:00:00`)), h: fmt.num(peak[1]) }) : t('Each square is a day. The darkest is {date}, with {n} things on.', { date: fmt.date(new Date(`${peak[0]}T12:00:00`)), n: fmt.int(peak[1]) })) : ''),
          h('div', { class: 'viz-light viz-scroll' }, yearHeatmap(s.daily || {}, s.year, { unit: isWork ? 'h' : 'n', peak: peak?.[0] })),
          heatLegend(),
          s.grid ? h('div', { class: 'week-grid-block' }, h('h4', {}, t('Your week')), h('div', { class: 'viz-light' }, weekGridViz(s.grid))) : null),
        h('div', { class: 'panel', 'data-reveal': '' },
          h('div', { class: 'reclaim-head' },
            h('div', {}, h('h3', {}, isWork ? t('Where next year’s hours come from') : t('A few gentle nudges')), h('p', { class: 'sub' }, isWork ? t('Specific changes from your own calendar, each with a one-tap way to act on it.') : t('Patterns from your own year. No guilt attached.'))),
            rec.totalHours > 0 ? h('div', { class: 'reclaim-total' }, h('b', {}, t('{h} hrs', { h: fmt.int(rec.totalHours) })), h('span', {}, isWork ? t('about {d} working days a year', { d: fmt.num(rec.workingDays) }) : t('a year, roughly'))) : null,
          ),
          rec.suggestions.length ? reclaimList(s, { locked: !unlocked, limit: unlocked ? Infinity : 5, ctx: ctxOf(s) }) : h('p', { class: 'sub', style: 'margin-top:12px' }, t('Nothing to fix. Genuinely. Your calendar is in good shape.')),
          h('div', { class: 'unlock-row' }, unlocked
            ? [h('p', {}, t('Every week, every series, every person. Save it as a PDF.')), h('button', { class: 'btn', onClick: () => showReport() }, t('Open full report'))]
            : [h('p', {}, rec.suggestions.length > 1 ? tn('{n} more suggestion, the full report, clean cards and a PDF.', '{n} more suggestions, the full report, clean cards and a PDF.', rec.suggestions.length - 1) : t('The full report, clean cards and a PDF.')), unlockBtn]),
        ),
        comparePanel(s),
        rec.suggestions.length ? emailPanel(s, unlocked) : null,
      ),
    ),
    h('div', { class: 'summary-foot' },
      h('button', { class: 'link', onClick: playStory }, t('Replay the story')),
      unlocked ? null : h('button', { class: 'link', onClick: () => showReport() }, t('Preview the full report')),
      h('button', { class: 'link', onClick: () => openTeam() }, t('Do this for your team')),
      h('button', { class: 'link', onClick: startOver }, t('Start over')),
    ),
  ));
  stagger(host);
  draw();
}

function comparisonTable(cmp, { meLabel, themLabel }) {
  return h('div', { class: 'compare-rows' }, cmp.rows.map((r) => {
    const max = Math.max(1, r.a, r.b);
    return h('div', { class: 'cmp-row' },
      h('span', { class: 'cmp-label' }, r.label),
      h('div', { class: 'cmp-bars' },
        h('div', { class: `cmp-bar me${r.more === 'me' ? ' more' : ''}` }, h('i', { style: `--v:${(r.a / max).toFixed(3)}` }), h('b', {}, r.mine), h('span', {}, meLabel)),
        h('div', { class: `cmp-bar them${r.more === 'them' ? ' more' : ''}` }, h('i', { style: `--v:${(r.b / max).toFixed(3)}` }), h('b', {}, r.theirs), h('span', {}, themLabel))));
  }));
}

function comparePanel(s) {
  const friend = readFriend();
  const mine = myModel(s);
  const cmp = friend ? comparison(mine, friend) : null;
  if (cmp) {
    const them = friend.w || t('them');
    const verdict = cmp.more === 'tie' ? t('Dead level. Spooky.') : cmp.more === 'me'
      ? (cmp.ratio >= 1.2 ? t('You spent {x}× as long in meetings as {name}.', { x: fmt.num(cmp.ratio), name: them }) : t('You edged it.'))
      : t('{name} out-met you. Respect.', { name: them });
    return h('div', { class: 'panel', 'data-reveal': '' },
      h('h3', {}, t('You and {name}', { name: them })),
      h('p', { class: 'sub' }, s.mode === 'work' ? verdict : t('Side by side, from the link you opened.')),
      comparisonTable(cmp, { meLabel: t('You'), themLabel: them }),
      h('div', { class: 'unlock-row' }, h('p', {}, t('Send it back so they can see it too.')), h('button', { class: 'btn', onClick: async () => { await copyText(compareUrl(mine, friend), t('Comparison link copied.')); track('compare_opened'); } }, t('Copy comparison link'))));
  }
  const panel = h('div', { class: 'panel', 'data-reveal': '' });
  const body = h('div', {});
  const join = h('button', { class: 'btn', onClick: async () => {
    join.disabled = true; join.textContent = t('Comparing…');
    try {
      const r = await compareWithOthers(s);
      track('bench_joined');
      body.innerHTML = '';
      if (!r.ready) { body.append(h('p', { class: 'sub' }, t('You’re one of {n} people so far. Results appear once {min} have joined, so check back soon.', { n: fmt.int(r.n), min: MIN_SAMPLE }))); join.remove(); return; }
      const labels = s.mode === 'work'
        ? { share: (p) => t('More time in meetings than {p}% of people', { p }), perDay: (p) => t('More meetings a day than {p}% of people', { p }), b2b: (p) => t('More wall-to-wall days than {p}% of people', { p }) }
        : { events: (p) => t('Busier than {p}% of people', { p }), freeWeekendShare: (p) => t('More free weekends than {p}% of people', { p }) };
      body.append(h('div', { class: 'percentiles' }, Object.entries(r.metrics).filter(([k, p]) => p != null && labels[k]).map(([k, p]) => h('div', { class: 'pct' }, h('div', { class: 'pct-ring', style: `--p:${p}` }, h('b', {}, `${p}%`)), h('span', {}, labels[k](p))))),
        h('p', { class: 'caption' }, t('From {n} people who chose to compare.', { n: fmt.int(r.n) })));
      join.remove();
    } catch { join.disabled = false; join.textContent = t('Compare with others'); toast(t('Comparisons aren’t available here yet.')); }
  } }, t('Compare with others'));
  panel.append(
    h('h3', {}, t('How do you compare?')),
    h('p', { class: 'sub' }, t('See where you sit against everyone else who’s tried it. This adds a few rounded numbers to an anonymous pool: your share of time in meetings, meetings a day, and wall-to-wall days. Nothing else.')),
    body,
    h('div', { class: 'unlock-row' }, alreadyShared(s) ? h('p', {}, t('You’re already in the pool.')) : h('p', {}, t('Or send your link to a friend. When they make theirs, you’ll both see a side-by-side.')), join));
  return panel;
}

function emailPanel(s, unlocked) {
  const email = h('input', { type: 'email', placeholder: t('you@example.com'), 'aria-label': t('Email address'), autocomplete: 'email', required: true });
  const optIn = h('input', { type: 'checkbox', id: 'optin', checked: true });
  const send = h('button', { class: 'btn', type: 'submit' }, t('Email it to me'));
  const featuredOnly = () => [s.reclaim.suggestions[s.reclaim.featured ?? 0]].filter(Boolean);
  const form = h('form', { class: 'email-form', onSubmit: async (e) => {
    e.preventDefault();
    const addr = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { toast(t('That email doesn’t look right.')); email.focus(); return; }
    send.disabled = true; send.textContent = t('Sending…');
    const plan = planText(s, unlocked ? s.reclaim.suggestions : featuredOnly());
    try {
      const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: addr, subscribe: optIn.checked, plan, year: s.year, locale: locale() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.emailed) throw new Error('unavailable');
      track('plan_emailed');
      toast(t('Sent. Check your inbox.'));
      send.textContent = t('Sent');
    } catch {
      location.href = `mailto:${encodeURIComponent(addr)}?subject=${encodeURIComponent(t('Your {year} reclaim plan', { year: s.year }))}&body=${encodeURIComponent(plan)}`;
      toast(t('Opening your email app with the plan.'));
      send.disabled = false; send.textContent = t('Email it to me');
    }
  } }, email, send);
  return h('div', { class: 'panel', 'data-reveal': '' },
    h('h3', {}, t('Keep the plan')),
    h('p', { class: 'sub' }, t('Habits change when you come back to them. Send yourself the plan, and we’ll nudge you each quarter to see how it’s going.')),
    form,
    h('label', { class: 'check' }, optIn, h('span', {}, t('Send me a check-in each quarter. Four emails a year, one click to stop.'))),
    h('p', { class: 'caption', style: 'margin-top:10px' }, unlocked ? t('This sends the plan text, which includes meeting titles, so we can email it. Nothing else leaves your device.') : t('This sends the free suggestion so we can email it. Nothing else leaves your device.')),
    h('div', { style: 'margin-top:12px' }, h('button', { class: 'link', type: 'button', onClick: () => copyText(planText(s, unlocked ? s.reclaim.suggestions : featuredOnly()), t('Plan copied.')) }, t('Copy as text instead'))),
  );
}

async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { prompt(t('Copy this text'), text); }
}
async function download(canvas, name) {
  const blob = await canvasToBlob(canvas);
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  track('card_saved');
  toast(t('Saved.'));
}
async function shareCard(canvas, s) {
  try {
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], `calendar-wrapped-${s.year}.png`, { type: 'image/png' });
    const url = shareUrl(myModel(s));
    const P = personaOf(s.persona);
    const data = { files: [file], title: s.mode === 'work' ? t('My {year} in meetings', { year: s.year }) : t('My {year} in plans', { year: s.year }), text: t('{emoji} {name}. Make yours: {url}', { emoji: P.emoji, name: P.name, url }) };
    track('card_shared');
    if (navigator.canShare?.(data)) await navigator.share(data); else await navigator.share({ title: data.title, text: data.text, url });
  } catch { /* cancelled */ }
}
async function copyLink(s) {
  await copyText(shareUrl(myModel(s)), state.card.hideNames ? t('Link copied. Names and titles are left out.') : t('Link copied.'));
  track('link_copied');
}

// ---------- someone else's card, and comparisons ----------
function showShared(model) {
  show('shared', { push: false });
  track('shared_link_opened', { once: true });
  const host = views.shared;
  host.innerHTML = '';
  const P = modelPersona(model);
  const canvas = h('canvas', { 'aria-label': `${P.name}, ${model.y}` });
  const mine = state.stats && (state.stats.mode === 'work' ? 'w' : 'p') === model.m ? myModel() : null;
  const goHome = () => { history.replaceState(null, '', siteRoot()); show('landing', { push: false }); };
  host.append(h('div', { class: 'shared' },
    h('a', { class: 'brand', href: siteRoot(), onClick: (e) => { e.preventDefault(); goHome(); } }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), CONFIG.brand.name),
    h('div', { class: 'shared-grid' },
      h('div', { class: 'canvas-frame', 'data-reveal': '', style: '--ar: 1080 / 1350' }, canvas),
      h('div', { class: 'shared-copy' },
        h('p', { class: 'caption', 'data-reveal': '' }, model.w ? t('{name} shared their year', { name: model.w }) : t('Someone shared their year')),
        h('h1', { 'data-reveal': '' }, `${P.emoji} ${P.name}`),
        h('p', { class: 'sub', 'data-reveal': '' }, model.m === 'w' ? t('That’s their {year}, in meetings. Yours takes thirty seconds, and your calendar never leaves your device.', { year: model.y }) : t('That’s their {year}, in plans. Yours takes thirty seconds, and your calendar never leaves your device.', { year: model.y })),
        h('div', { class: 'hero-actions', style: 'align-items:flex-start', 'data-reveal': '' },
          mine
            ? h('button', { class: 'btn btn-lg', onClick: () => { saveFriend(model); track('compare_opened'); history.replaceState(null, '', compareUrl(mine, model)); route(); } }, t('Compare with mine'))
            : h('button', { class: 'btn btn-lg', onClick: () => { saveFriend(model); track('shared_cta'); goHome(); document.getElementById('dropzone').focus(); } }, model.w ? t('Make yours and compare with {name}', { name: model.w }) : t('Make yours and compare')),
          h('p', { class: 'caption' }, t('This card lives entirely in the link. Nothing about them, or you, is stored anywhere.'))),
      ),
    ),
  ));
  stagger(host);
  renderCard(canvas, model, { format: 'portrait', watermark: true });
}

function showCompare(a, b) {
  show('shared', { push: false });
  const host = views.shared;
  host.innerHTML = '';
  const cmp = comparison(a, b);
  const nameA = a.w || t('A friend'), nameB = b.w || t('Their friend');
  const cA = h('canvas', {}), cB = h('canvas', {});
  host.append(h('div', { class: 'shared compare' },
    h('a', { class: 'brand', href: siteRoot(), onClick: (e) => { e.preventDefault(); history.replaceState(null, '', siteRoot()); show('landing', { push: false }); } }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), CONFIG.brand.name),
    h('h1', { class: 'compare-title', 'data-reveal': '' }, t('{a} vs {b}', { a: nameA, b: nameB })),
    cmp ? h('p', { class: 'sub compare-sub', 'data-reveal': '' }, cmp.more === 'tie' ? t('Dead level. Spooky.') : t('{name} spent more time in meetings.', { name: cmp.more === 'me' ? nameA : nameB })) : null,
    h('div', { class: 'compare-cards', 'data-reveal': '' }, h('div', { class: 'canvas-frame', style: '--ar: 1080 / 1350' }, cA), h('div', { class: 'canvas-frame', style: '--ar: 1080 / 1350' }, cB)),
    cmp ? h('div', { class: 'panel', 'data-reveal': '', style: 'max-width:720px; margin:28px auto 0' }, comparisonTable(cmp, { meLabel: nameA, themLabel: nameB })) : null,
    h('div', { class: 'hero-actions', 'data-reveal': '' }, h('button', { class: 'btn btn-lg', onClick: () => { history.replaceState(null, '', siteRoot()); show('landing', { push: false }); } }, t('Make yours'))),
  ));
  stagger(host);
  renderCard(cA, a, { format: 'portrait', watermark: true });
  renderCard(cB, b, { format: 'portrait', watermark: true });
}

// ---------- report ----------
function showReport({ push = true } = {}) {
  if (!state.stats) { show('landing'); return; }
  if (!isUnlocked('personal')) { openUnlockModal({ beforeRedirect: () => saveStats(state.stats), onUnlocked: () => showReport() }); return; }
  show('report', { push });
  renderReport(views.report, state.stats, { onBack: () => showSummary(), unlocked: getUnlock(), ctx: ctxOf(state.stats) });
}

// ---------- team ----------
async function openTeam(files) {
  track('team_started', { once: true });
  if (files?.length) await addFiles(engine, files);
  show('team', { hash: '#team' });
  renderTeamSetup(views.team, { engine, onBuilt: (team) => { state.team = team; showTeamReport(); }, onBack: () => (state.stats ? showSummary() : show('landing')) });
}
function showTeamReport({ push = true } = {}) {
  if (!state.team) { openTeam(); return; }
  show('team', { push, hash: '#team-report' });
  renderTeamReport(views.team, state.team, { onBack: () => openTeam(), onChanged: () => showTeamReport({ push: false }) });
}

async function startOver() {
  state.stats = null; state.team = null; state.summary = null;
  await clearTeam(engine);
  try { localStorage.removeItem(STATS_KEY); } catch { /* ignore */ }
  show('landing');
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- boot ----------
function route({ push = false } = {}) {
  const shared = readShared();
  if (shared?.type === 'card') { showShared(shared.model); return; }
  if (shared?.type === 'compare') { showCompare(shared.a, shared.b); return; }
  const v = location.hash.replace('#', '') || 'landing';
  if (state.story && v !== 'story') { state.story.destroy(); state.story = null; }
  if (v === 'summary' && state.stats) showSummary({ push });
  else if (v === 'report' && state.stats && isUnlocked('personal')) showReport({ push });
  else if (v === 'team-report' && state.team) showTeamReport({ push });
  else if (v === 'team') openTeam();
  else show('landing', { push: false });
}

async function boot() {
  const params = new URLSearchParams(location.search);
  await setLocale(pickLocale({ query: params.get('lang'), stored: storage('cw:lang'), languages: navigator.languages || [navigator.language] }));
  translateDom();
  initLanguagePicker();
  initMonitoring();
  initLanding();
  state.stats = loadStats();
  state.team = savedTeam();
  const unlocked = await handleReturnFromCheckout();
  if (unlocked === 'team' && state.team) showTeamReport({ push: false });
  else if (unlocked === 'personal' && state.stats) showSummary({ push: false });
  else {
    if (/^#(story|prep)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    route();
  }
  window.addEventListener('popstate', () => route());
  window.addEventListener('hashchange', () => { if (readShared()) route(); });
}

boot();
