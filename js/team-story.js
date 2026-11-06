// The team's year as a story and a LinkedIn carousel, for a manager to post. Deliberately holds no
// names and no meeting titles: only the team's numbers, its mix of personas and its one big lever.
import { h, fmt } from './ui.js';
import { t, monthName } from './i18n.js';
import { CONFIG } from './config.js';
import { persona as personaOf } from './copy.js';
import { charts } from './slides.js';
import { weeksBar } from './viz.js';
import { mixBar } from './mix-ui.js';
import { gauge, bandLabel } from './health-ui.js';
import { BANDS } from './health.js';
import { font, text, big, bars, ring, W, PAD } from './carousel.js';
import { hexA } from './card.js';

const R = { 'data-reveal': '' };
const cap = (s) => h('p', { class: 'cap', ...R }, s);
const line = (s, lg = false) => h('h2', { class: `line${lg ? ' lg' : ''}`, ...R }, s);
const note = (s) => (s ? h('p', { class: 'note', ...R }, s) : null);
const bigNum = (v, suffix = '') => h('p', { class: 'big', ...R }, h('span', { 'data-count': v, ...(suffix === '%' ? { 'data-suffix': '%' } : {}) }, '0'), suffix && suffix !== '%' ? h('small', {}, suffix) : null);

/** Everything the story and carousel say, worked out once. */
export function teamFacts(team) {
  const week = team.workHoursPerWeek || 40;
  const scores = team.members.map((m) => m.health).filter((x) => Number.isFinite(x));
  const health = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const tally = new Map();
  for (const m of team.members) { const id = m.persona?.id || 'balanced'; const cur = tally.get(id) || { persona: m.persona, n: 0 }; cur.n++; tally.set(id, cur); }
  const shares = team.members.map((m) => m.share);
  const L = team.lever;
  const action = !L ? null : L.action === 'Make it async twice a week' ? t('Make it async twice a week') : L.action === 'Move it to every other week' ? t('Move it to every other week') : t('Cut it to half the length');
  const bi = team.busiestMonth ? team.busiestMonth.i ?? team.monthly.findIndex((m) => m.month === team.busiestMonth.month) : -1;
  return {
    size: team.size, year: team.year, totalHours: team.totalHours,
    weeksEach: team.size ? Math.round((team.totalHours / team.size / week) * 10) / 10 : 0,
    avgShare: team.avgShare, lo: Math.min(...shares), hi: Math.max(...shares),
    sharedShare: team.sharedShare, sharedHours: team.sharedHours,
    health, band: health == null ? null : (() => { const b = BANDS.findIndex((x) => health >= x); return b < 0 ? BANDS.length : b; })(),
    personas: [...tally.values()].sort((a, b) => b.n - a.n).slice(0, 5).map((x) => ({ ...personaOf(x.persona), n: x.n })),
    lever: L ? { saved: L.savedPerYear, days: L.workingDays, members: L.members, action } : null,
    bi, monthly: team.monthly,
  };
}

export function buildTeamSlides(team) {
  const f = teamFacts(team);
  const out = [];
  out.push({ theme: 'c-black', render: () => h('div', {}, cap(CONFIG.brand.name), h('h1', { class: 'line lg', ...R }, t('Our {year},', { year: f.year }), h('br'), t('in meetings.')), note(t('{n} people, read on this device. No names in it, no meeting titles.', { n: f.size }))) });
  out.push({ theme: 'c-blue', render: () => h('div', {}, cap(t('Together')), bigNum(Math.round(f.totalHours), t('hrs')), line(t('in meetings, between us.')), note(t('About {w} full working weeks each.', { w: fmt.num(f.weeksEach) })), h('div', { class: 'viz-wrap', ...R }, weeksBar(Math.min(52, f.weeksEach)))) });
  out.push({ theme: 'c-white', render: () => h('div', {}, cap(t('Our working time')), charts.ring(f.avgShare), line(t('of the average working week went on meetings.')), note(f.hi > f.lo ? t('From {lo}% to {hi}% across the team.', { lo: f.lo, hi: f.hi }) : null)) });
  if (f.sharedHours > 0) {
    out.push({ theme: 'c-teal', render: () => h('div', {}, cap(t('Meetings we share')), bigNum(f.sharedShare, '%'), line(t('of our meeting time is in recurring meetings two or more of us attend.')),
      h('div', { class: 'viz-wrap', ...R }, mixBar([{ key: 'shared', name: t('Shared'), hours: f.sharedHours, pct: f.sharedShare }, { key: 'own', name: t('Everything else'), hours: Math.max(0, f.totalHours - f.sharedHours), pct: 100 - f.sharedShare }]))) });
  }
  if (f.health != null) out.push({ theme: 'c-green', render: () => h('div', {}, cap(t('Team health')), h('div', { class: 'viz-wrap', ...R }, gauge(f.health)), line(bandLabel(f.band, 'work')), note(t('The average of everyone’s calendar health.'))) });
  if (f.bi >= 0) out.push({ theme: 'c-indigo', render: () => h('div', {}, cap(t('Month by month')), line(t('{month} was the big one.', { month: monthName(f.bi) })), h('div', R, charts.monthChart(f.monthly, f.bi))) });
  if (f.personas.length) {
    out.push({ theme: 'c-purple', render: () => h('div', {}, cap(t('The team, by persona')), line(t('{n} of us. Here’s who we are.', { n: f.size })),
      h('ol', { class: 'awards' }, f.personas.map((p, i) => h('li', { class: 'award', ...R, style: `--k:${i}` }, h('span', { class: 'award-medal', 'aria-hidden': 'true' }, p.emoji), h('span', { class: 'award-text' }, h('b', {}, p.name), h('span', {}, t('{n} of us', { n: p.n }))))))) });
  }
  if (f.lever) {
    out.push({ theme: 'c-orange', render: () => h('div', {}, cap(t('One change')), bigNum(Math.round(f.lever.saved), t('hrs')), line(t('a year, back to the team, from one shared meeting.')), note(t('{action}. {m} of us sit in it; that’s about {d} working days.', { action: f.lever.action, m: f.lever.members, d: fmt.num(f.lever.days) }))) });
  }
  out.push({ theme: 'c-pink', render: () => h('div', {}, cap(CONFIG.brand.name), line(t('Your turn.'), true), note(t('Make yours, or your team’s, at {domain}. Nothing is uploaded.', { domain: CONFIG.brand.domain }))), cta: ({ finish }) => h('button', { class: 'btn btn-lg', onClick: finish }, t('Back to the team report')) });
  return out;
}

/** The same story as carousel pages (1080 × 1350), for LinkedIn. */
export function teamCarouselPages(team) {
  const f = teamFacts(team);
  const pages = [];
  const page = (theme, draw) => pages.push({ theme, draw });
  page('c-black', (ctx, c) => {
    font(ctx, 800, 170, true, 'condensed'); ctx.fillStyle = c.ink;
    ctx.fillText(t('Our {year},', { year: f.year }), PAD - 6, 440); ctx.fillText(t('in meetings.'), PAD - 6, 600);
    text(ctx, t('{n} people, read on this device. No names in it, no meeting titles.', { n: f.size }), 680, { size: 40, colour: c.mute });
    text(ctx, t('Swipe for the year →'), 1100, { size: 40, weight: 600, colour: c.ink });
  });
  page('c-blue', (ctx, c) => {
    let y = text(ctx, t('Together'), 220, { size: 34, weight: 650, colour: c.mute });
    y = big(ctx, fmt.int(f.totalHours), y + 10, c.ink, { unit: t('hrs') });
    y = text(ctx, t('in meetings, between us.'), y, { size: 76, weight: 750, display: true, colour: c.ink });
    text(ctx, t('About {w} full working weeks each.', { w: fmt.num(f.weeksEach) }), y + 20, { size: 40, colour: c.mute });
  });
  page('c-white', (ctx, c) => {
    const y = text(ctx, t('Our working time'), 220, { size: 34, weight: 650, colour: c.mute });
    ring(ctx, f.avgShare, W / 2, y + 260, 210, c.ink, c.base);
    font(ctx, 800, 150, true, 'condensed'); ctx.fillStyle = c.ink; ctx.textAlign = 'center'; ctx.fillText(`${f.avgShare}%`, W / 2, y + 310); ctx.textAlign = 'left';
    const y2 = text(ctx, t('of the average working week went on meetings.'), y + 540, { size: 66, weight: 750, display: true, colour: c.ink, lh: 1.02 });
    if (f.hi > f.lo) text(ctx, t('From {lo}% to {hi}% across the team.', { lo: f.lo, hi: f.hi }), y2 + 10, { size: 38, colour: c.mute });
  });
  if (f.sharedHours > 0) page('c-teal', (ctx, c) => {
    let y = text(ctx, t('Meetings we share'), 220, { size: 34, weight: 650, colour: c.mute });
    y = big(ctx, `${f.sharedShare}%`, y + 10, c.ink);
    y = text(ctx, t('of our meeting time is in recurring meetings two or more of us attend.'), y, { size: 66, weight: 750, display: true, colour: c.ink, lh: 1.02 });
    const w = W - PAD * 2;
    ctx.fillStyle = c.ink; ctx.beginPath(); ctx.roundRect(PAD, y + 40, Math.max(20, (w * f.sharedShare) / 100), 60, 14); ctx.fill();
    ctx.fillStyle = hexA(c.ink, 0.25); ctx.beginPath(); ctx.roundRect(PAD + Math.max(20, (w * f.sharedShare) / 100) + 6, y + 40, Math.max(20, w - (w * f.sharedShare) / 100 - 6), 60, 14); ctx.fill();
  });
  if (f.health != null) page('c-green', (ctx, c) => {
    text(ctx, t('Team health'), 220, { size: 34, weight: 650, colour: c.mute });
    const cx = W / 2, cy = 700, r = 320;
    ctx.lineCap = 'round'; ctx.lineWidth = 56;
    ctx.strokeStyle = c.base; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = c.ink; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * (f.health / 100)); ctx.stroke();
    font(ctx, 800, 260, true, 'condensed'); ctx.fillStyle = c.ink; ctx.textAlign = 'center'; ctx.fillText(String(f.health), cx, cy - 10);
    font(ctx, 800, 90, true, 'semi-condensed'); ctx.fillText(bandLabel(f.band, 'work'), cx, cy + 120); ctx.textAlign = 'left';
    text(ctx, t('The average of everyone’s calendar health.'), cy + 180, { size: 38, colour: c.mute });
  });
  if (f.bi >= 0) page('c-indigo', (ctx, c) => {
    const y = text(ctx, t('Month by month'), 220, { size: 34, weight: 650, colour: c.mute });
    text(ctx, t('{month} was the big one.', { month: monthName(f.bi) }), y + 10, { size: 96, weight: 800, display: true, colour: c.ink, lh: 1, stretch: 'condensed' });
    bars(ctx, f.monthly.map((m) => m.value), { y: 1350 - 640, h: 400, colour: c.ink, base: c.base, hi: f.bi, labels: f.monthly.map((_, i) => monthName(i, 'narrow')), mute: c.mute });
  });
  if (f.personas.length) page('c-purple', (ctx, c) => {
    let y = text(ctx, t('The team, by persona'), 220, { size: 34, weight: 650, colour: c.mute });
    y = text(ctx, t('{n} of us. Here’s who we are.', { n: f.size }), y + 10, { size: 76, weight: 800, display: true, colour: c.ink, lh: 1 }) + 30;
    for (const p of f.personas) {
      ctx.fillStyle = c.base; ctx.beginPath(); ctx.arc(PAD + 52, y + 56, 52, 0, Math.PI * 2); ctx.fill();
      ctx.font = '56px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = c.ink; ctx.fillText(p.emoji, PAD + 52, y + 76); ctx.textAlign = 'left';
      const yy = text(ctx, p.name, y, { size: 46, weight: 800, display: true, colour: c.ink, x: PAD + 136, max: 1 });
      text(ctx, t('{n} of us', { n: p.n }), yy - 12, { size: 32, colour: c.mute, x: PAD + 136 });
      y += 150;
    }
  });
  if (f.lever) page('c-orange', (ctx, c) => {
    let y = text(ctx, t('One change'), 220, { size: 34, weight: 650, colour: c.mute });
    y = big(ctx, fmt.int(f.lever.saved), y + 10, c.ink, { unit: t('hrs') });
    y = text(ctx, t('a year, back to the team, from one shared meeting.'), y, { size: 70, weight: 750, display: true, colour: c.ink, lh: 1.02 });
    text(ctx, t('{action}. {m} of us sit in it; that’s about {d} working days.', { action: f.lever.action, m: f.lever.members, d: fmt.num(f.lever.days) }), y + 20, { size: 40, colour: c.mute });
  });
  page('c-black', (ctx, c) => {
    let y = text(ctx, CONFIG.brand.name, 300, { size: 40, weight: 650, colour: c.mute });
    y = text(ctx, t('Your turn.'), y + 20, { size: 170, weight: 800, display: true, colour: c.ink, stretch: 'condensed', lh: 0.95 });
    y = text(ctx, CONFIG.brand.domain, y + 20, { size: 60, weight: 700, colour: c.ink });
    text(ctx, t('Your calendar is read on your own device. Nothing is uploaded.'), y + 40, { size: 40, colour: c.mute });
  });
  return pages;
}
