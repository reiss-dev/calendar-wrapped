// App controller: landing → prep → story → summary → report, plus team and shared-card views.
import { CONFIG } from './config.js';
import { parseICS, guessSelfEmail } from './ics.js';
import { computeStats } from './stats.js';
import { buildSlides } from './slides.js';
import { createStory } from './story.js';
import { renderCard, cardModel, canvasToBlob, FORMATS } from './card.js';
import { shareUrl, readSharedFromHash } from './share.js';
import { renderReport } from './report.js';
import { planText } from './plan.js';
import { sound } from './sound.js';
import { track } from './analytics.js';
import { googleEnabled, connectGoogle } from './google.js';
import { addFiles, renderTeamSetup, renderTeamReport, savedTeam, clearTeam } from './team.js';
import { isUnlocked, getUnlock, openUnlockModal, handleReturnFromCheckout } from './pay.js';
import { h, fmt, toast, wait, stagger, storage, store } from './ui.js';

const STATS_KEY = 'cw:stats';
const PREFS_KEY = 'cw:card';
const state = {
  events: null, meta: null, stats: null, years: [], story: null, demoToggle: false, team: null,
  options: { year: null, mode: 'auto', selfEmail: null },
  card: { format: 'portrait', hideNames: CONFIG.share.hideNamesByDefault, ...storage(PREFS_KEY, {}) },
};
const views = {};
for (const id of ['landing', 'prep', 'story', 'summary', 'report', 'team', 'shared']) views[id] = document.getElementById(`view-${id}`);

function show(id, { push = true, hash } = {}) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('is-active', k === id));
  if (id !== 'story') window.scrollTo({ top: 0 });
  const target = hash ?? (id === 'landing' ? '' : `#${id}`);
  if (push && location.hash !== target) history.pushState({ view: id }, '', target || location.pathname + location.search);
}

// ---------- persistence ----------
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const revive = (k, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v);
function saveStats(stats) { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* quota */ } }
function loadStats() { try { const raw = localStorage.getItem(STATS_KEY); return raw ? JSON.parse(raw, revive) : null; } catch { return null; } }

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
    else if (e.dataTransfer?.files?.length) toast('That isn’t an .ics calendar file.');
  });

  document.querySelectorAll('[data-action="demo"]').forEach((b) => b.addEventListener('click', () => { sound.prime(); loadDemo(); }));
  document.querySelectorAll('[data-action="team"]').forEach((b) => b.addEventListener('click', () => openTeam()));
  document.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
    document.querySelectorAll('.tabpanel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === t.dataset.tab));
  }));

  const g = document.getElementById('google-connect');
  if (g && googleEnabled()) { g.hidden = false; g.addEventListener('click', () => { sound.prime(); loadGoogle(); }); }

  const device = document.querySelector('.device-wrap');
  if (device && 'IntersectionObserver' in window) {
    device.style.animationPlayState = 'paused';
    new IntersectionObserver((entries, io) => { if (entries[0].isIntersecting) { device.style.animationPlayState = 'running'; io.disconnect(); } }, { threshold: 0.15 }).observe(device);
  }
}

function handleFiles(files) {
  if (files.length > 1) { openTeam(files); return; }
  const file = files[0];
  if (!file) return;
  if (file.size > 60 * 1024 * 1024) { toast('That file is unusually large. Try exporting a single calendar.'); return; }
  track('file_loaded');
  runPrep(file.name, async () => parseICS(await file.text(), prepRange()));
}

async function loadDemo() {
  const forced = new URLSearchParams(location.search).get('demo');
  const which = ['personal', 'work'].includes(forced) ? forced : state.demoToggle ? 'personal' : 'work';
  state.demoToggle = which === 'work';
  track('demo_loaded');
  runPrep(`Sample ${which} calendar`, async () => {
    const res = await fetch(`sample/${which}.ics`);
    if (!res.ok) throw new Error('Demo file not found.');
    return parseICS(await res.text(), prepRange());
  });
}

function loadGoogle() {
  runPrep('Google Calendar', async (say) => {
    const { rangeStart, rangeEnd } = prepRange();
    const out = await connectGoogle({ timeMin: rangeStart, timeMax: rangeEnd, onProgress: (n) => say(`Read <b>${fmt.int(n)}</b> events`, 0, true) });
    track('google_connected');
    return out;
  });
}

function prepRange() {
  const now = new Date();
  return { rangeStart: new Date(now.getFullYear() - 2, 0, 1), rangeEnd: new Date(now.getFullYear() + 1, 0, 1) };
}

// ---------- prep ----------
async function runPrep(label, loader) {
  show('prep');
  const log = h('div', { class: 'prep-log' });
  const inner = h('div', { class: 'prep-inner' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('h2', {}, 'Reading your year'), log);
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
  await say(`Opening <b>${escapeHtml(label)}</b>`, 350);

  let parsed;
  try { parsed = await loader(say); } catch (err) {
    console.error(err);
    return prepError(/google|sign-in|cancel/i.test(err.message) ? escapeHtml(err.message) : 'That doesn’t look like a calendar file. It needs to be the <code>.ics</code> export, not the zip and not a CSV.');
  }
  state.events = parsed.events; state.meta = parsed.meta;
  if (!parsed.events.length) return prepError('No events found in the last couple of years. Check you exported the right calendar and try again.');

  const now = new Date();
  const perYear = new Map();
  for (const e of parsed.events) perYear.set(e.start.getFullYear(), (perYear.get(e.start.getFullYear()) || 0) + 1);
  state.years = [...perYear.entries()].filter(([y, c]) => c >= 15 && y <= now.getFullYear()).map(([y]) => y).sort((a, b) => b - a).slice(0, 3);
  if (!state.years.length) state.years = [[...perYear.entries()].sort((a, b) => b[1] - a[1])[0][0]];
  state.options.year = state.years.includes(now.getFullYear()) ? now.getFullYear() : state.years[0];
  state.options.selfEmail = guessSelfEmail(parsed.events, parsed.meta);

  lastLine = null;
  await say(`Found <b>${fmt.int(parsed.events.length)} entries</b> across ${perYear.size} year${perYear.size === 1 ? '' : 's'}`);
  const probe = compute({ mode: 'auto' });
  state.options.mode = probe.detectedMode;
  await say(probe.mode === 'work' ? `Spotted <b>${fmt.int(probe.meetings)} meetings</b>. Looks like a work calendar` : `Looks like a <b>personal calendar</b>, ${fmt.int(probe.events)} plans in ${state.options.year}`);
  await say('Counting the hours', 300);
  const remaining = CONFIG.introMs - (Date.now() - started);
  if (remaining > 0) await wait(remaining);
  renderPrepOptions(inner, probe);
}

function prepError(msg) {
  views.prep.querySelector('.spinner')?.remove();
  views.prep.querySelector('.prep-inner').append(
    h('div', { class: 'prep-error' }, h('p', { html: msg }), h('div', { style: 'display:flex; gap:10px; flex-wrap:wrap' }, h('button', { class: 'btn', onClick: () => show('landing') }, 'Try again'), h('a', { class: 'btn btn-secondary', href: '#export', onClick: () => show('landing', { push: false }) }, 'How to export'))),
  );
}

function compute(overrides = {}) {
  const o = { ...state.options, ...overrides };
  const rangeStart = new Date(o.year, 0, 1), rangeEnd = new Date(o.year + 1, 0, 1);
  return computeStats(state.events, { rangeStart, rangeEnd, selfEmail: o.selfEmail, mode: o.mode, workHoursPerWeek: CONFIG.workHoursPerWeek });
}

function seg(values, current, onPick, labelFn = (v) => v, attrs = {}) {
  return h('div', { class: 'seg', role: 'group', ...attrs }, values.map((v) => h('button', { 'aria-pressed': String(v === current), onClick: (e) => { [...e.currentTarget.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); onPick(v); } }, labelFn(v))));
}

function renderPrepOptions(inner, probe) {
  inner.querySelector('.spinner').remove();
  inner.querySelector('h2').textContent = 'Ready when you are';
  inner.querySelector('.prep-log').remove();
  const emailRow = h('div', { class: 'row', style: state.options.mode === 'work' ? '' : 'display:none' }, h('label', { class: 'lbl', for: 'self-email' }, 'You are'), h('input', { type: 'email', id: 'self-email', value: state.options.selfEmail || '', placeholder: 'your@email.com', onInput: (e) => { state.options.selfEmail = e.target.value.trim().toLowerCase() || null; } }));
  const group = h('div', { class: 'group', 'data-reveal': '' },
    h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Year'), seg(state.years, state.options.year, (y) => { state.options.year = y; })),
    h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Calendar type'), seg(['work', 'personal'], state.options.mode, (m) => { state.options.mode = m; emailRow.style.display = m === 'work' ? '' : 'none'; }, (m) => (m === 'work' ? 'Work' : 'Personal'))),
    emailRow,
  );
  const warn = !probe.attendeeInfoAvailable ? h('p', { class: 'prep-warn', 'data-reveal': '' }, 'This export has no attendee details, so every timed event is treated as a meeting. Outlook’s published calendars often leave them out.') : null;
  const play = h('button', { class: 'btn btn-lg', 'data-reveal': '', onClick: () => { sound.prime(); startStory(); } }, 'Play my Wrapped');
  const privacy = h('p', { class: 'caption', 'data-reveal': '' }, 'Still nothing has left your browser.');
  inner.append(...[group, warn, play, privacy].filter(Boolean));
  stagger(inner);
  play.focus({ preventScroll: true });
}

// ---------- story ----------
function startStory() {
  state.stats = compute();
  saveStats(state.stats);
  track('story_started');
  playStory();
}
function playStory() {
  show('story');
  state.story = createStory(views.story, buildSlides(state.stats), { year: state.stats.year, onFinish: () => showSummary(), onExit: () => showSummary() });
}

// ---------- summary ----------
function saveCardPrefs() { store(PREFS_KEY, { format: state.card.format, hideNames: state.card.hideNames }); }

async function showSummary({ push = true } = {}) {
  const s = state.stats;
  if (!s) { show('landing'); return; }
  show('summary', { push });
  const unlocked = isUnlocked('personal');
  const host = views.summary;
  host.innerHTML = '';
  const isWork = s.mode === 'work';
  const canvas = h('canvas', { 'aria-label': 'Your share card' });
  const draw = () => {
    const fmtKey = state.card.format;
    renderCard(canvas, cardModel(s, { hideNames: state.card.hideNames }), { format: fmtKey, watermark: !unlocked });
    canvas.parentElement?.style.setProperty('--ar', `${FORMATS[fmtKey].W} / ${FORMATS[fmtKey].H}`);
  };

  const formatPicker = seg(Object.keys(FORMATS), state.card.format, (f) => { state.card.format = f; saveCardPrefs(); draw(); }, (f) => FORMATS[f].label, { 'aria-label': 'Card format' });
  const namesToggle = h('label', { class: 'switch' },
    h('input', { type: 'checkbox', role: 'switch', checked: !state.card.hideNames, onChange: (e) => { state.card.hideNames = !e.target.checked; saveCardPrefs(); draw(); } }),
    h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', {}, isWork ? 'Show names and titles' : 'Show names'));

  const actions = h('div', { class: 'card-actions' },
    h('button', { class: 'btn', onClick: () => download(canvas, `calendar-wrapped-${s.year}-${state.card.format}.png`) }, 'Save image'),
    navigator.share ? h('button', { class: 'btn btn-secondary', onClick: () => shareCard(canvas, s) }, 'Share') : null,
    h('button', { class: 'btn btn-secondary', onClick: () => copyLink(s) }, 'Copy link'),
  );

  const tiles = isWork ? [
    [fmt.int(s.meetings), 'meetings'], [`${fmt.hours(s.totalHours)} hrs`, 'in meetings'], [`${s.shareOfWork}%`, 'of working time'],
    [s.worstWeek ? fmt.weekRange(s.worstWeek.start) : '—', 'worst week'], [s.collaborators[0]?.name.split(' ')[0] || '—', 'most seen'], [fmt.int(s.backToBack), 'back-to-back'],
  ] : [
    [fmt.int(s.events), 'plans'], [`${fmt.hours(s.totalHours)} hrs`, 'planned time'], [s.categories[0]?.label || '—', 'top category'],
    [s.people[0]?.name || '—', 'most seen'], [`${s.freeWeekends} of ${s.totalWeekends}`, 'free weekends'], [fmt.int(s.travel.trips), 'trips'],
  ];

  // Featured suggestion first; when locked, the rest are blurred.
  const rec = s.reclaim;
  const featured = rec.featured ?? 0;
  const ordered = rec.suggestions.map((x, i) => ({ ...x, i })).sort((a, b) => (a.i === featured ? -1 : b.i === featured ? 1 : a.i - b.i));
  const shown = unlocked ? ordered : ordered.slice(0, 5);
  const reclaimItems = shown.map((x, k) => h('li', { class: !unlocked && k > 0 ? 'locked' : '' },
    h('h4', {}, x.title), h('p', {}, x.detail),
    x.hoursPerYear > 0 ? h('div', { class: 'hrs' }, `${fmt.int(x.hoursPerYear)} hrs`, h('small', {}, 'per year')) : h('div', { class: 'hrs' }, '')));

  const unlockBtn = h('button', { class: 'btn', onClick: () => openUnlockModal({ beforeRedirect: () => saveStats(s), onUnlocked: () => showSummary({ push: false }) }) }, `Unlock for ${CONFIG.pricing.symbol}${CONFIG.pricing.amount}`);
  const reportBtn = h('button', { class: 'btn', onClick: () => showReport() }, 'Open full report');

  host.append(h('div', { class: 'summary' },
    h('div', { class: 'summary-head' },
      h('div', { class: 'emoji', 'data-reveal': '' }, s.persona.emoji),
      h('h2', { 'data-reveal': '' }, s.persona.name),
      h('p', { 'data-reveal': '' }, s.persona.blurb),
    ),
    h('div', { class: 'summary-grid' },
      h('div', { class: 'card-preview', 'data-reveal': '' },
        h('div', { class: 'card-controls' }, formatPicker),
        h('div', { class: 'canvas-frame' }, canvas),
        h('div', { class: 'card-meta' }, namesToggle),
        actions,
        h('p', { class: 'caption', style: 'margin-top:12px; text-align:center' }, unlocked ? 'Clean card, no watermark.' : 'The free card carries a small watermark. Links never include your calendar, only the numbers on the card.')),
      h('div', { class: 'stack' },
        h('div', { class: 'panel', 'data-reveal': '' }, h('h3', {}, `${s.year} at a glance`), h('p', { class: 'sub' }, `${isWork ? 'Work' : 'Personal'} calendar, ${s.isPartialYear ? `1 January to ${fmt.date(s.range.end)}` : 'the whole year'}.`), h('div', { class: 'stat-grid', style: 'margin-top:14px' }, tiles.map(([v, l]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l))))),
        h('div', { class: 'panel', 'data-reveal': '' },
          h('div', { class: 'reclaim-head' },
            h('div', {}, h('h3', {}, isWork ? 'Where next year’s hours come from' : 'A few gentle nudges'), h('p', { class: 'sub' }, isWork ? 'Specific changes, from your own calendar. Start with the first one.' : 'Patterns from your own year. No guilt attached.')),
            rec.totalHours > 0 ? h('div', { class: 'reclaim-total' }, h('b', {}, `${fmt.int(rec.totalHours)} hrs`), h('span', {}, isWork ? `about ${fmt.num(rec.workingDays)} working days a year` : 'a year, roughly')) : null,
          ),
          rec.suggestions.length ? h('ol', { class: 'reclaim-list' }, reclaimItems) : h('p', { class: 'sub', style: 'margin-top:12px' }, 'Nothing to fix. Genuinely. Your calendar is in good shape.'),
          h('div', { class: 'unlock-row' }, unlocked ? [h('p', {}, 'Every week, every series, every person. Save it as a PDF.'), reportBtn] : [h('p', {}, `${rec.suggestions.length > 1 ? `${rec.suggestions.length - 1} more ${rec.suggestions.length === 2 ? 'suggestion' : 'suggestions'}, ` : ''}the full report, clean cards and a PDF.`), unlockBtn]),
        ),
        rec.suggestions.length ? emailPanel(s, unlocked) : null,
      ),
    ),
    h('div', { class: 'summary-foot' },
      h('button', { class: 'link', onClick: playStory }, 'Replay the story'),
      unlocked ? null : h('button', { class: 'link', onClick: () => showReport() }, 'Preview the full report'),
      h('button', { class: 'link', onClick: () => openTeam() }, 'Do this for your team'),
      h('button', { class: 'link', onClick: startOver }, 'Start over'),
    ),
  ));
  stagger(host);
  draw();
}

function emailPanel(s, unlocked) {
  const email = h('input', { type: 'email', placeholder: 'you@example.com', 'aria-label': 'Email address', autocomplete: 'email', required: true });
  const optIn = h('input', { type: 'checkbox', id: 'optin', checked: true });
  const send = h('button', { class: 'btn', type: 'submit' }, 'Email it to me');
  const form = h('form', { class: 'email-form', onSubmit: async (e) => {
    e.preventDefault();
    const addr = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { toast('That email doesn’t look right.'); email.focus(); return; }
    send.disabled = true; send.textContent = 'Sending…';
    const plan = planText(unlocked ? s : { ...s, reclaim: { ...s.reclaim, suggestions: [s.reclaim.suggestions[s.reclaim.featured ?? 0]] } });
    try {
      const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: addr, subscribe: optIn.checked, plan, year: s.year }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.emailed) throw new Error('unavailable');
      track('plan_emailed');
      toast('Sent. Check your inbox.');
      send.textContent = 'Sent';
    } catch {
      // No email service configured: hand the plan to the visitor's own mail app instead.
      location.href = `mailto:${encodeURIComponent(addr)}?subject=${encodeURIComponent(`Your ${s.year} reclaim plan`)}&body=${encodeURIComponent(plan)}`;
      toast('Opening your email app with the plan.');
      send.disabled = false; send.textContent = 'Email it to me';
    }
  } }, email, send);
  return h('div', { class: 'panel', 'data-reveal': '' },
    h('h3', {}, 'Keep the plan'),
    h('p', { class: 'sub' }, 'January is when habits actually change. Send yourself the plan so it’s there when you need it.'),
    form,
    h('label', { class: 'check' }, optIn, h('span', {}, 'Also send me one check-in in January. No other emails.')),
    h('p', { class: 'caption', style: 'margin-top:10px' }, unlocked ? 'This sends the plan text, which includes meeting titles, so we can email it. Nothing else leaves your device.' : 'This sends the free suggestion so we can email it. Nothing else leaves your device.'),
    h('div', { style: 'margin-top:12px' }, h('button', { class: 'link', type: 'button', onClick: () => copyPlan(s, unlocked) }, 'Copy as text instead')),
  );
}

async function copyPlan(s, unlocked) {
  const plan = planText(unlocked ? s : { ...s, reclaim: { ...s.reclaim, suggestions: [s.reclaim.suggestions[s.reclaim.featured ?? 0]] } });
  try { await navigator.clipboard.writeText(plan); toast('Plan copied.'); } catch { toast('Copy isn’t available here.'); }
}

async function download(canvas, name) {
  const blob = await canvasToBlob(canvas);
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  track('card_saved');
  toast('Saved.');
}
async function shareCard(canvas, s) {
  try {
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], `calendar-wrapped-${s.year}.png`, { type: 'image/png' });
    const url = shareUrl(cardModel(s, { hideNames: state.card.hideNames }));
    const data = { files: [file], title: `My ${s.year} in ${s.mode === 'work' ? 'meetings' : 'plans'}`, text: `${s.persona.emoji} ${s.persona.name}. Make yours: ${url}` };
    track('card_shared');
    if (navigator.canShare?.(data)) await navigator.share(data); else await navigator.share({ title: data.title, text: data.text, url });
  } catch { /* cancelled */ }
}
async function copyLink(s) {
  const url = shareUrl(cardModel(s, { hideNames: state.card.hideNames }));
  try { await navigator.clipboard.writeText(url); toast(state.card.hideNames ? 'Link copied. Names and titles are left out.' : 'Link copied.'); }
  catch { prompt('Copy this link', url); }
  track('link_copied');
}

// ---------- shared card (someone else's link) ----------
function showShared(model) {
  show('shared', { push: false });
  track('shared_link_opened', { once: true });
  const host = views.shared;
  host.innerHTML = '';
  const canvas = h('canvas', { 'aria-label': `${model.n}, ${model.y}` });
  host.append(h('div', { class: 'shared' },
    h('a', { class: 'brand', href: location.pathname, onClick: (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname); show('landing', { push: false }); } }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), CONFIG.brand.name),
    h('div', { class: 'shared-grid' },
      h('div', { class: 'canvas-frame', 'data-reveal': '', style: '--ar: 1080 / 1350' }, canvas),
      h('div', { class: 'shared-copy' },
        h('p', { class: 'caption', 'data-reveal': '' }, 'Someone shared their year'),
        h('h1', { 'data-reveal': '' }, `${model.e} ${model.n}`),
        h('p', { class: 'sub', 'data-reveal': '' }, `That’s their ${model.y}, ${model.m === 'w' ? 'in meetings' : 'in plans'}. Yours takes thirty seconds, and your calendar never leaves your device.`),
        h('div', { class: 'hero-actions', style: 'align-items:flex-start', 'data-reveal': '' },
          h('button', { class: 'btn btn-lg', onClick: () => { track('shared_cta'); history.replaceState(null, '', location.pathname); show('landing', { push: false }); document.getElementById('dropzone').focus(); } }, 'Make yours'),
          h('p', { class: 'caption' }, 'This card lives entirely in the link. Nothing about them, or you, is stored anywhere.')),
      ),
    ),
  ));
  stagger(host);
  renderCard(canvas, model, { format: 'portrait', watermark: true });
}

// ---------- report ----------
function showReport({ push = true } = {}) {
  if (!state.stats) { show('landing'); return; }
  if (!isUnlocked('personal')) { openUnlockModal({ beforeRedirect: () => saveStats(state.stats), onUnlocked: () => showReport() }); return; }
  show('report', { push });
  renderReport(views.report, state.stats, { onBack: () => showSummary(), unlocked: getUnlock() });
}

// ---------- team ----------
async function openTeam(files) {
  track('team_started', { once: true });
  if (files?.length) await addFiles(files);
  show('team', { hash: '#team' });
  renderTeamSetup(views.team, { onBuilt: (t) => { state.team = t; showTeamReport(); }, onBack: () => (state.stats ? showSummary() : show('landing')) });
}
function showTeamReport({ push = true } = {}) {
  if (!state.team) { openTeam(); return; }
  show('team', { push, hash: '#team-report' });
  renderTeamReport(views.team, state.team, { onBack: () => openTeam(), onChanged: () => showTeamReport({ push: false }) });
}

function startOver() {
  state.events = null; state.stats = null; state.team = null;
  clearTeam();
  try { localStorage.removeItem(STATS_KEY); } catch { /* ignore */ }
  show('landing');
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- boot ----------
function route({ push = false } = {}) {
  const shared = readSharedFromHash();
  if (shared) { showShared(shared); return; }
  const v = location.hash.replace('#', '') || 'landing';
  if (state.story && v !== 'story') { state.story.destroy(); state.story = null; }
  if (v === 'summary' && state.stats) showSummary({ push });
  else if (v === 'report' && state.stats && isUnlocked('personal')) showReport({ push });
  else if (v === 'team-report' && state.team) showTeamReport({ push });
  else if (v === 'team') openTeam();
  else show('landing', { push: false });
}

async function boot() {
  initLanding();
  state.stats = loadStats();
  state.team = savedTeam();
  const unlocked = await handleReturnFromCheckout();
  if (unlocked === 'team' && state.team) { showTeamReport({ push: false }); }
  else if (unlocked === 'personal' && state.stats) { showSummary({ push: false }); }
  else {
    if (/^#(story|prep)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    route();
  }
  window.addEventListener('popstate', () => route());
  window.addEventListener('hashchange', () => { if (readSharedFromHash()) route(); });
}

boot();
