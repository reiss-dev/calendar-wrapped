// The story as a vertical video (1080×1920, 30 fps), drawn frame by frame on canvas and
// encoded in the browser. WebCodecs + mp4-muxer gives a real MP4 faster than real time;
// browsers without it fall back to MediaRecorder in real time. Nothing is uploaded.
import { CONFIG } from './config.js';
import { t, localeTag, monthName } from './i18n.js';
import { fmt } from './ui.js';
import { persona as personaOf, categoryLabel } from './copy.js';
import { THEME_COLOURS } from './card.js';
import { yoyChange } from './stats.js';
import { coverageLine } from './slides.js';
import { createGlobe } from './globe.js';
import { hasTimeOff, hasBirthdays } from './timeoff-ui.js';
import { highlights, showHighlights } from './extras.js';
import { hasAwards, awardCopy } from './awards-ui.js';
import { hasHealth, bandLabel, partCopy } from './health-ui.js';
import { renderSoundtrack, audioChunks, pickAudioCodec, SAMPLE_RATE } from './soundtrack.js';

export const W = 1080, H = 1920, FPS = 30;
const PAD = 96;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Inter", Helvetica, Arial, sans-serif';
const DISPLAY = '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const stretch = (ctx, v) => { if ('fontStretch' in ctx) ctx.fontStretch = v; };
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const clamp = (x) => Math.max(0, Math.min(1, x));
const easeOut = (x) => 1 - (1 - clamp(x)) ** 4;
const enter = (p, start, len = 0.16) => easeOut((p - start) / len);
const plain = (s) => String(s).replace(/\*\*/g, '');
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const tt = line ? `${line} ${w}` : w; if (ctx.measureText(tt).width > maxW && line) { lines.push(line); line = w; } else line = tt; }
  if (line) lines.push(line);
  return lines;
}
/** Text that rises and fades in. Returns the y below it. */
function say(ctx, str, y, { size, weight = 700, colour, a = 1, rise = 0, maxW = W - PAD * 2, lh = 1.1, x = PAD, max = 4, track = null }) {
  if (!str) return y;
  const display = weight >= 700;
  ctx.font = `${display ? Math.max(weight, 750) : weight} ${size}px ${display ? DISPLAY : FONT}`; ctx.letterSpacing = track != null ? `${track}px` : `${(-size * (display ? 0.018 : 0.012)).toFixed(1)}px`;
  stretch(ctx, display ? 'semi-condensed' : 'normal');
  const lines = wrap(ctx, str, maxW).slice(0, max);
  ctx.globalAlpha = a; ctx.fillStyle = colour;
  lines.forEach((l, i) => ctx.fillText(l, x, y + size + i * size * lh + (1 - a) * rise));
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
  return y + size + (lines.length - 1) * size * lh + size * 0.35;
}
/** A count-up number with an optional unit beside it. */
function bigNumber(ctx, value, y, p, colour, mute, { unit = '', decimals = 0, prefix = '', suffix = '' } = {}) {
  const k = easeOut(p / 0.42);
  const v = value * k;
  const str = `${prefix}${Number(v).toLocaleString(document.documentElement.lang || 'en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  let size = 330;
  let size2 = size * 1.15; size = size2;
  ctx.font = `800 ${size}px ${DISPLAY}`; ctx.letterSpacing = `${-size * 0.03}px`; stretch(ctx, 'condensed');
  const maxW = W - PAD * 2 - (unit ? 170 : 0);
  const full = `${prefix}${Number(value).toLocaleString(document.documentElement.lang || 'en', { maximumFractionDigits: decimals })}${suffix}`;
  while (size > 150 && ctx.measureText(full).width > maxW) { size -= 10; ctx.font = `800 ${size}px ${DISPLAY}`; ctx.letterSpacing = `${-size * 0.03}px`; }
  ctx.globalAlpha = enter(p, 0, 0.1); ctx.fillStyle = colour;
  ctx.fillText(str, PAD - 8, y + size * 0.86);
  if (unit) { const w = ctx.measureText(str).width; stretch(ctx, 'normal'); ctx.font = `600 ${Math.round(size * 0.2)}px ${FONT}`; ctx.letterSpacing = '-1px'; ctx.fillStyle = mute; ctx.fillText(unit, PAD + w + 10, y + size * 0.86); }
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px'; stretch(ctx, 'normal');
  return y + size * 0.95;
}

// ---------------------------------------------------------------- visuals
function dots(ctx, n, p, y, ink) {
  const per = Math.max(1, Math.ceil(n / 600)), count = Math.ceil(n / per), cols = 30, step = (W - PAD * 2) / cols;
  const shown = Math.floor(count * easeOut((p - 0.15) / 0.55));
  ctx.fillStyle = ink;
  for (let i = 0; i < shown; i++) { ctx.beginPath(); ctx.arc(PAD + (i % cols) * step + step / 2, y + Math.floor(i / cols) * step + step / 2, step * 0.33, 0, Math.PI * 2); ctx.fill(); }
  return y + Math.ceil(count / cols) * step;
}
function weeksBar(ctx, weeks, p, y, ink, base) {
  const w = (W - PAD * 2) / 52, k = easeOut((p - 0.2) / 0.5) * weeks;
  for (let i = 0; i < 52; i++) {
    ctx.fillStyle = base; ctx.fillRect(PAD + i * w + 2, y, w - 4, 110);
    const f = clamp(k - i); if (f > 0) { ctx.fillStyle = ink; ctx.fillRect(PAD + i * w + 2, y, (w - 4) * f, 110); }
  }
  return y + 130;
}
function ring(ctx, pct, p, cx, cy, r, ink, base) {
  ctx.lineWidth = 34; ctx.lineCap = 'round';
  ctx.strokeStyle = base; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const k = easeOut((p - 0.06) / 0.45) * pct / 100;
  ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  ctx.fillStyle = ink; ctx.font = `800 170px ${DISPLAY}`; stretch(ctx, 'condensed'); ctx.letterSpacing = '-3px'; ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(k * 100)}%`, cx, cy + 58); ctx.textAlign = 'left'; ctx.letterSpacing = '0px'; stretch(ctx, 'normal');
}
function heatmap(ctx, daily, year, p, y, ink, base) {
  // Twelve small month calendars, 3 across, so the year fills a portrait frame.
  const gap = 34, mw = (W - PAD * 2 - gap * 2) / 3, cell = mw / 7, mh = cell * 6 + 52;
  const vals = Object.values(daily).filter((v) => v > 0).sort((a, b) => a - b);
  const cap = vals.length ? vals[Math.floor(vals.length * 0.95)] : 1;
  const month = new Intl.DateTimeFormat(localeTag(), { month: 'short' });
  for (let m = 0; m < 12; m++) {
    const k0 = easeOut((p - 0.08 - m * 0.035) / 0.3);
    if (k0 <= 0) continue;
    const x0 = PAD + (m % 3) * (mw + gap), y0 = y + Math.floor(m / 3) * (mh + 22) + (1 - k0) * 30;
    ctx.globalAlpha = k0;
    ctx.fillStyle = rgba(ink, 0.72); ctx.font = `600 30px ${FONT}`;
    ctx.fillText(month.format(new Date(year, m, 1)).replace('.', ''), x0 + 3, y0 + 30);
    const first = (new Date(year, m, 1).getDay() + 6) % 7, n = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= n; d++) {
      const idx = first + d - 1, col = idx % 7, row = Math.floor(idx / 7);
      const key = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const v = daily[key] || 0;
      ctx.fillStyle = v ? rgba(ink, Math.max(0.28, Math.min(1, v / cap))) : base;
      roundRect(ctx, x0 + col * cell + 3, y0 + 46 + row * cell + 3, cell - 6, cell - 6, 7);
    }
  }
  ctx.globalAlpha = 1;
  return y + 4 * (mh + 22);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); }
function bars(ctx, items, p, y, ink, base, colourOn) {
  const top = Math.max(1, ...items.map((x) => x.value));
  items.slice(0, 5).forEach((x, i) => {
    const k = easeOut((p - 0.15 - i * 0.06) / 0.4), h = 96, yy = y + i * (h + 16);
    ctx.fillStyle = base; ctx.fillRect(PAD, yy, W - PAD * 2, h);
    ctx.fillStyle = i ? rgba(ink, 0.45) : ink; ctx.fillRect(PAD, yy, (W - PAD * 2) * (x.value / top) * k, h);
    ctx.font = `600 40px ${FONT}`; ctx.fillStyle = i ? ink : colourOn; ctx.globalAlpha = k;
    ctx.fillText(x.label.length > 28 ? `${x.label.slice(0, 27)}…` : x.label, PAD + 24, yy + 62);
    ctx.textAlign = 'right'; ctx.fillText(x.sub, W - PAD - 24, yy + 62); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  });
  return y + Math.min(5, items.length) * 112;
}
function blocks(ctx, total, back, p, y, ink, base) {
  const per = Math.max(1, Math.ceil(total / 160 / 5) * 5), n = Math.max(1, Math.round(total / per)), k = Math.min(n, Math.round(back / per));
  const cols = 16, step = (W - PAD * 2) / cols, shown = Math.floor(n * easeOut((p - 0.15) / 0.4));
  for (let i = 0; i < shown; i++) {
    const lit = i < k && p > 0.5;
    ctx.fillStyle = lit ? ink : base;
    ctx.fillRect(PAD + (i % cols) * step + 4, y + Math.floor(i / cols) * step + 4, step - 8, step - 8);
  }
  return y + Math.ceil(n / cols) * step;
}

function leaveRows(ctx, days, year, p, y, c) {
  const left = PAD + 90, step = (W - PAD - left) / 31, r = step * 0.32;
  for (let m = 0; m < 12; m++) {
    const yy = y + m * 66;
    const k0 = easeOut((p - 0.1 - m * 0.025) / 0.25);
    if (k0 <= 0) continue;
    ctx.globalAlpha = k0;
    ctx.fillStyle = c.mute; ctx.font = `600 30px ${FONT}`; ctx.fillText(monthName(m, 'short').replace('.', ''), PAD, yy + 10);
    const n = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= n; d++) {
      const date = new Date(year, m, d);
      const k = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const kind = days[k], we = date.getDay() === 0 || date.getDay() === 6;
      const x = left + (d - 1) * step + step / 2;
      ctx.beginPath();
      if (kind === 'b') { ctx.lineWidth = 4; ctx.strokeStyle = c.ink; ctx.arc(x, yy, r, 0, Math.PI * 2); ctx.stroke(); continue; }
      ctx.fillStyle = kind === 'l' ? c.ink : kind === 'h' ? rgba(c.ink, 0.5) : c.base;
      ctx.arc(x, yy, kind ? r : we ? r * 0.5 : r * 0.72, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return y + 12 * 66;
}
function wheel(ctx, info, p, cx, cy, R, c) {
  for (let m = 0; m < 12; m++) {
    const k = easeOut((p - 0.05 - m * 0.02) / 0.2);
    if (k <= 0) continue;
    const a0 = (m / 12) * Math.PI * 2 - Math.PI / 2 + 0.035, a1 = a0 + ((1 / 12) * Math.PI * 2 - 0.07) * k;
    ctx.beginPath(); ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.strokeStyle = info.busiestMonth?.i === m ? c.ink : c.base; ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
    ctx.fillStyle = info.busiestMonth?.i === m ? c.ink : c.mute; ctx.font = `700 34px ${FONT}`; ctx.textAlign = 'center';
    const am = ((m + 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(monthName(m, 'narrow'), cx + (R + 62) * Math.cos(am), cy + (R + 62) * Math.sin(am) + 12); ctx.textAlign = 'left';
  }
  const used = new Map();
  info.list.forEach((b, i) => {
    const k = easeOut((p - 0.3 - i * 0.025) / 0.15);
    const slot = `${b.m}-${Math.floor(b.d / 4)}`; const n = used.get(slot) || 0; used.set(slot, n + 1);
    if (k <= 0) return;
    const a = ((b.m + (b.d - 0.5) / new Date(2001, b.m + 1, 0).getDate()) / 12) * Math.PI * 2 - Math.PI / 2;
    const rr = R - 56 - n * 44;
    ctx.beginPath(); ctx.fillStyle = c.ink; ctx.arc(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 17 * k, 0, Math.PI * 2); ctx.fill();
  });
  ctx.textAlign = 'center'; ctx.fillStyle = c.ink; ctx.font = `700 190px ${FONT}`; ctx.globalAlpha = enter(p, 0.1, 0.2);
  ctx.fillText(String(Math.round(info.count * easeOut(p / 0.45))), cx, cy + 66); ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- scenes
/** The scenes for one person's year. Async because the globe needs its data. */
export async function buildScenes(s) {
  const work = s.mode === 'work';
  const P = personaOf(s.persona);
  const scenes = [];
  const scene = (theme, dur, draw) => scenes.push({ theme, dur, draw });
  const cap = (ctx, text, y, p, c) => say(ctx, String(text).toLocaleUpperCase(), y, { size: 34, weight: 600, colour: c.mute, a: enter(p, 0.02), rise: 30, track: 3 });

  scene('c-black', 2.2, (ctx, p, c) => {
    let y = 760;
    y = cap(ctx, CONFIG.brand.name, y, p, c);
    y = say(ctx, t('Your {year},', { year: s.year }), y + 20, { size: 150, colour: c.ink, a: enter(p, 0.08), rise: 60 });
    say(ctx, work ? t('in meetings.') : t('in plans.'), y - 20, { size: 150, colour: c.ink, a: enter(p, 0.2), rise: 60 });
  });
  scene('c-blue', 2.6, (ctx, p, c) => {
    let y = 520;
    y = cap(ctx, t('The headline'), y, p, c);
    y = bigNumber(ctx, work ? s.meetings : s.events, y, p, c.ink, c.mute);
    y = say(ctx, work ? (s.isPartialYear ? t('meetings this year, so far.') : t('meetings this year.')) : (s.isPartialYear ? t('things in the diary, so far.') : t('things in the diary.')), y, { size: 66, colour: c.ink, a: enter(p, 0.15), rise: 30 });
    dots(ctx, work ? s.meetings : s.events, p, y + 40, c.ink);
  });
  if (work) {
    scene('c-indigo', 2.6, (ctx, p, c) => {
      let y = 640;
      y = cap(ctx, t('Time spent'), y, p, c);
      y = bigNumber(ctx, Math.round(s.totalHours), y, p, c.ink, c.mute, { unit: t('hrs') });
      y = say(ctx, t('in a room, or on a call, with other people.'), y, { size: 66, colour: c.ink, a: enter(p, 0.15), rise: 30 });
      weeksBar(ctx, s.workingWeeksEquivalent, p, y + 60, c.ink, c.base);
    });
    scene('c-white', 2.4, (ctx, p, c) => {
      let y = 560;
      y = cap(ctx, t('Your working time'), y, p, c);
      ring(ctx, s.shareOfWork, p, W / 2, y + 330, 270, c.ink, c.base);
      say(ctx, t('of your working hours were meetings.'), y + 700, { size: 66, colour: c.ink, a: enter(p, 0.3), rise: 30 });
    });
  }
  const yo = yoyChange(s);
  if (yo && Math.abs(yo.pct) >= 3) {
    scene(yo.pct > 0 ? 'c-orange' : 'c-teal', 2.2, (ctx, p, c) => {
      let y = 700;
      y = cap(ctx, t('Compared with {year}', { year: s.yoy.year }), y, p, c);
      y = bigNumber(ctx, Math.abs(yo.pct), y, p, c.ink, c.mute, { prefix: yo.pct > 0 ? '+' : '−', suffix: '%' });
      say(ctx, work ? (yo.pct > 0 ? t('more time in meetings than last year.') : t('less time in meetings than last year.')) : (yo.pct > 0 ? t('more plans than last year.') : t('fewer plans than last year.')), y, { size: 66, colour: c.ink, a: enter(p, 0.2), rise: 30 });
    });
  }
  if (s.daily) {
    scene('c-black', 3.2, (ctx, p, c) => {
      let y = 270;
      y = cap(ctx, t('Day by day'), y, p, c);
      y = say(ctx, coverageLine(s), y + 10, { size: 76, colour: c.ink, a: enter(p, 0.06), rise: 40 });
      heatmap(ctx, s.daily, s.year, p, y + 50, c.ink, c.base);
    });
  }
  if (!work && s.categories.length) {
    scene('c-orange', 2.6, (ctx, p, c) => {
      let y = 640;
      y = cap(ctx, t('Where the time went'), y, p, c);
      y = say(ctx, t('{category}, mostly.', { category: categoryLabel(s.categories[0].key) }), y + 10, { size: 96, colour: c.ink, a: enter(p, 0.06), rise: 40 });
      bars(ctx, s.categories.map((x) => ({ label: categoryLabel(x.key), value: x.count, sub: fmt.int(x.count) })), p, y + 60, c.ink, c.base, c.bg);
    });
  }
  const top = work ? s.collaborators?.[0] : s.people?.[0];
  if (top) {
    scene('c-green', 2.4, (ctx, p, c) => {
      let y = 720;
      y = cap(ctx, work ? t('Most seen') : t('Your people'), y, p, c);
      y = say(ctx, top.name, y + 10, { size: 140, colour: c.ink, a: enter(p, 0.06), rise: 50, max: 2 });
      y = say(ctx, plain(work ? t('**{n} meetings** together, {h} hours. More than most people see their family.', { n: fmt.int(top.count), h: fmt.hours(top.hours) }) : t('**{n} plans** together this year. {p} people made it into the calendar at all.', { n: fmt.int(top.count), p: fmt.int(s.uniquePeople) })), y + 20, { size: 50, weight: 500, colour: c.mute, a: enter(p, 0.2), rise: 30 });
      bars(ctx, (work ? s.collaborators : s.people).slice(1, 5).map((x) => ({ label: x.name, value: x.count, sub: fmt.int(x.count) })), p, y + 60, c.ink, c.base, c.bg);
    });
  }

  // The globe, rendered in manual mode on a hidden canvas so each frame can set its progress.
  let globe = null, globeCanvas = null;
  const routes = s.travel?.routes;
  if (routes) {
    globeCanvas = document.createElement('canvas');
    globeCanvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:900px;--viz-ink:#ffffff;--viz-base:rgba(255,255,255,0.22);--viz-text:rgba(255,255,255,0.75);--viz-halo:#3a36c8';
    document.body.append(globeCanvas);
    globe = await createGlobe(globeCanvas, routes, { manual: true, interactive: false, size: 900, labels: 5 });
    scene('c-indigo', 3.6, (ctx, p, c) => {
      let y = 330;
      y = cap(ctx, work ? t('On the move') : t('Away'), y, p, c);
      y = say(ctx, t('{km} km in the air.', { km: fmt.int(routes.km) }), y + 10, { size: 96, colour: c.ink, a: enter(p, 0.04), rise: 40 });
      globe.renderAt(easeOut((p - 0.1) / 0.75), 0.12);
      ctx.globalAlpha = enter(p, 0.05, 0.12);
      ctx.drawImage(globeCanvas, (W - 960) / 2, y + 40, 960, 960);
      ctx.globalAlpha = 1;
    });
  }
  if (hasTimeOff(s)) {
    const o = s.timeOff;
    scene('c-teal', 3.2, (ctx, p, c) => {
      let y = 300;
      y = cap(ctx, t('Time off'), y, p, c);
      y = bigNumber(ctx, o.taken, y, p, c.ink, c.mute, { unit: work ? t('days') : t('weekdays') });
      y = say(ctx, work ? (s.isPartialYear ? t('of leave taken so far.') : t('of leave this year.')) : (s.isPartialYear ? t('away from it all, so far.') : t('away from it all this year.')), y, { size: 62, colour: c.ink, a: enter(p, 0.15), rise: 30 });
      leaveRows(ctx, o.days, s.year, p, y + 70, c);
    });
  }
  if (hasBirthdays(s)) {
    const b = s.birthdayInfo;
    scene('c-purple', 3, (ctx, p, c) => {
      let y = 300;
      y = cap(ctx, t('Birthdays'), y, p, c);
      y = say(ctx, b.busiestMonth ? t('{month} is birthday season.', { month: monthName(b.busiestMonth.i) }) : t('{n} birthdays in the calendar.', { n: b.count }), y + 10, { size: 84, colour: c.ink, a: enter(p, 0.06), rise: 40 });
      wheel(ctx, b, p, W / 2, y + 520, 360, c);
    });
  }
  if (showHighlights(s)) {
    const items = highlights(s).slice(0, 6);
    scene('c-orange', 3.4, (ctx, p, c) => {
      let y = 330;
      y = cap(ctx, t('Highlights'), y, p, c);
      y = say(ctx, t('The bits that mattered.'), y + 10, { size: 90, colour: c.ink, a: enter(p, 0.05), rise: 40 });
      y += 60;
      ctx.fillStyle = c.base; ctx.fillRect(PAD + 205, y + 20, 4, items.length * 170 - 60);
      items.forEach((x, i) => {
        const a = enter(p, 0.15 + i * 0.07, 0.15), yy = y + i * 170 + (1 - a) * 30;
        ctx.globalAlpha = a;
        ctx.fillStyle = c.mute; ctx.font = `600 38px ${FONT}`; ctx.fillText(monthName(x.m, 'short').replace('.', ''), PAD, yy + 62);
        ctx.fillStyle = c.ink; ctx.beginPath(); ctx.arc(PAD + 207, yy + 48, 46, 0, Math.PI * 2); ctx.fill();
        ctx.font = `52px ${EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(x.emoji, PAD + 207, yy + 66); ctx.textAlign = 'left';
        say(ctx, x.title, yy + 10, { size: 52, colour: c.ink, a, x: PAD + 290, maxW: W - PAD * 2 - 290, max: 2, lh: 1.15 });
      });
      ctx.globalAlpha = 1;
    });
  }
  if (hasHealth(s)) {
    const H = s.health;
    scene('c-white', 3.2, (ctx, p, c) => {
      let y = 330;
      y = cap(ctx, t('Calendar health'), y, p, c);
      // The gauge sweeps round as the number counts up.
      const k = easeOut(clamp((p - 0.08) / 0.5)), cx = W / 2, cy = y + 470, r = 360;
      ctx.lineCap = 'round'; ctx.lineWidth = 64;
      ctx.strokeStyle = c.base; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = c.ink; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * (H.score / 100) * Math.max(0.001, k)); ctx.stroke();
      ctx.font = `800 300px ${DISPLAY}`; stretch(ctx, 'condensed'); ctx.letterSpacing = '-9px'; ctx.fillStyle = c.ink; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(H.score * k)), cx, cy - 10); ctx.textAlign = 'left'; ctx.letterSpacing = '0px';
      y = say(ctx, bandLabel(H.band, s.mode), cy + 90, { size: 110, colour: c.ink, a: enter(p, 0.45), rise: 30 });
      const worst = H.drags[0] && H.parts.find((x) => x.key === H.drags[0]);
      if (worst) say(ctx, t('Costing you most: {part}.', { part: partCopy(worst)[0].toLowerCase() }), y + 20, { size: 46, weight: 500, colour: c.mute, a: enter(p, 0.55) });
    });
  }
  if (hasAwards(s)) {
    const list = s.awards.slice(0, 5);
    scene('c-yellow', 3.4, (ctx, p, c) => {
      let y = 330;
      y = cap(ctx, t('Awards'), y, p, c);
      y = say(ctx, t('The year gave you {n} awards.', { n: list.length }), y + 10, { size: 84, colour: c.ink, a: enter(p, 0.05), rise: 40 });
      y += 70;
      list.forEach((x, i) => {
        const a = enter(p, 0.14 + i * 0.08, 0.16), yy = y + i * 200;
        const [title, line] = awardCopy(x);
        ctx.globalAlpha = a;
        // Medals pop in with a little overshoot.
        const pop = a < 1 ? 0.6 + 0.5 * Math.sin(a * Math.PI * 0.75) : 1;
        ctx.save(); ctx.translate(PAD + 62, yy + 62); ctx.scale(pop, pop);
        ctx.fillStyle = c.base; ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.fill();
        ctx.font = `64px ${EMOJI}`; ctx.textAlign = 'center'; ctx.fillStyle = c.ink; ctx.fillText(x.emoji, 0, 22); ctx.textAlign = 'left';
        ctx.restore();
        say(ctx, title, yy + 6, { size: 56, colour: c.ink, a, x: PAD + 160, maxW: W - PAD * 2 - 160, max: 1, weight: 800 });
        say(ctx, line, yy + 76, { size: 38, weight: 500, colour: c.mute, a, x: PAD + 160, maxW: W - PAD * 2 - 160, max: 2, lh: 1.2 });
      });
      ctx.globalAlpha = 1;
    });
  }
  scene('c-pink', 3, (ctx, p, c) => {
    // The persona lands like a rubber stamp: big and tilted, then slammed down with a jolt.
    const k = clamp((p - 0.08) / 0.16), land = 1 - (1 - k) ** 3;
    const sc = 2.2 - 1.2 * land + (k >= 1 ? 0 : Math.sin(k * Math.PI) * 0.06), rot = (-24 + 16 * land) * Math.PI / 180;
    const jolt = p > 0.24 && p < 0.32 ? Math.sin((p - 0.24) / 0.08 * Math.PI * 3) * 10 * (0.32 - p) / 0.08 : 0;
    ctx.save(); ctx.translate(W / 2, 560 + jolt); ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.strokeStyle = c.ink; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, 300, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.setLineDash([8, 12]); ctx.beginPath(); ctx.arc(0, 0, 210, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const ring = `${CONFIG.brand.name} · ${s.year} · ${P.name} · `.toLocaleUpperCase();
    ctx.font = `800 34px ${FONT}`; ctx.fillStyle = c.ink; ctx.textAlign = 'center';
    const chars = [...ring], step = (Math.PI * 2) / chars.length, spin = p * 0.6;
    chars.forEach((ch, i) => { ctx.save(); ctx.rotate(i * step + spin); ctx.translate(0, -248); ctx.fillText(ch, 0, 12); ctx.restore(); });
    ctx.font = `230px ${EMOJI}`; ctx.fillText(P.emoji, 0, 80); ctx.textAlign = 'left';
    ctx.restore(); ctx.globalAlpha = 1;
    let y = 960;
    y = cap(ctx, t('Your calendar persona'), y, p, c);
    y = say(ctx, P.name, y + 10, { size: 130, colour: c.ink, a: enter(p, 0.15), rise: 50, max: 3 });
    say(ctx, P.blurb, y + 30, { size: 52, weight: 500, colour: c.mute, a: enter(p, 0.3), rise: 30 });
  });
  if (work && s.reclaim.totalHours > 0) {
    scene('c-green', 2.8, (ctx, p, c) => {
      let y = 520;
      y = cap(ctx, t('Next year'), y, p, c);
      y = bigNumber(ctx, Math.round(s.reclaim.totalHours), y, p, c.ink, c.mute, { unit: t('hrs') });
      y = say(ctx, t('you could realistically get back.'), y, { size: 66, colour: c.ink, a: enter(p, 0.15), rise: 30 });
      blocks(ctx, s.totalHours * (s.daysCovered ? 365 / Math.max(30, s.daysCovered) : 1), s.reclaim.totalHours, p, y + 50, c.ink, c.base);
    });
  } else if (!work) {
    scene('c-green', 2.2, (ctx, p, c) => {
      let y = 760;
      y = cap(ctx, t('Next year'), y, p, c);
      say(ctx, t('A few gentle nudges.'), y + 10, { size: 130, colour: c.ink, a: enter(p, 0.08), rise: 50 });
    });
  }
  scene('c-black', 2.6, (ctx, p, c) => {
    let y = 780;
    y = say(ctx, CONFIG.brand.name, y, { size: 120, colour: c.ink, a: enter(p, 0.05), rise: 50 });
    y = say(ctx, t('Make yours at {domain}', { domain: CONFIG.brand.domain }), y + 30, { size: 60, weight: 500, colour: c.mute, a: enter(p, 0.2), rise: 30 });
    say(ctx, t('Nothing uploaded.'), y + 10, { size: 44, weight: 500, colour: c.mute, a: enter(p, 0.35), rise: 20 });
  });
  return { scenes, cleanup: () => { globe?.destroy(); globeCanvas?.remove(); } };
}

// ---------------------------------------------------------------- frames
function colours(theme) {
  const [bg, ink] = THEME_COLOURS[theme] || THEME_COLOURS['c-black'];
  return { bg, ink, mute: rgba(ink, 0.74), base: rgba(ink, 0.2) };
}
export function frameRenderer(scenes) {
  const starts = []; let acc = 0;
  for (const s of scenes) { starts.push(acc); acc += s.dur; }
  const total = acc, FADE = 0.3;
  const buffer = document.createElement('canvas'); buffer.width = W; buffer.height = H;
  const bctx = buffer.getContext('2d');
  function paint(ctx, i, local) {
    const sc = scenes[i], c = colours(sc.theme);
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    sc.draw(ctx, local / sc.dur, c);
    // Story-style progress and brand, on every frame.
    const gap = 8, segW = (W - 48 - gap * (scenes.length - 1)) / scenes.length;
    scenes.forEach((_, k) => {
      ctx.fillStyle = rgba(c.ink, 0.3); ctx.fillRect(24 + k * (segW + gap), 40, segW, 6);
      const f = k < i ? 1 : k === i ? clamp(local / sc.dur) : 0;
      if (f) { ctx.fillStyle = c.ink; ctx.fillRect(24 + k * (segW + gap), 40, segW * f, 6); }
    });
    ctx.font = `600 34px ${FONT}`; ctx.fillStyle = c.ink; ctx.fillText(CONFIG.brand.name, 48, 120);
    ctx.font = `500 30px ${FONT}`; ctx.fillStyle = c.mute; ctx.fillText(CONFIG.brand.domain, 48, H - 70);
  }
  return {
    total,
    starts,
    frames: Math.round(total * FPS),
    draw(ctx, timeSec) {
      let i = starts.findIndex((st, k) => timeSec < st + scenes[k].dur);
      if (i < 0) i = scenes.length - 1;
      const local = timeSec - starts[i];
      paint(ctx, i, local);
      const remain = scenes[i].dur - local;
      if (i < scenes.length - 1 && remain < FADE) { // cross-fade into the next scene
        paint(bctx, i + 1, 0);
        ctx.globalAlpha = 1 - remain / FADE; ctx.drawImage(buffer, 0, 0); ctx.globalAlpha = 1;
      }
    },
  };
}

// ---------------------------------------------------------------- encoding
async function pickEncoder() {
  if (typeof VideoEncoder !== 'function') return null;
  const tries = [['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42e028', 'avc'], ['vp09.00.40.08', 'vp9']];
  for (const [codec, mux] of tries) {
    try { const r = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 8_000_000, framerate: FPS }); if (r.supported) return { codec, mux }; } catch { /* next */ }
  }
  return null;
}

async function encodeWithWebCodecs(renderer, canvas, ctx, enc, { onProgress, preview, music }) {
  const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer.js');
  const target = new ArrayBufferTarget();
  const sound = music ? await pickAudioCodec() : null;
  const muxer = new Muxer({ target, video: { codec: enc.mux, width: W, height: H, frameRate: FPS }, ...(sound ? { audio: { codec: sound.mux, numberOfChannels: 2, sampleRate: SAMPLE_RATE } } : {}), fastStart: 'in-memory' });
  let failure = null;
  // The soundtrack goes in first; the muxer interleaves it with the frames when it finishes.
  if (sound) {
    const audio = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
    audio.configure({ codec: sound.codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128000 });
    for (const data of audioChunks(music)) { audio.encode(data); data.close(); }
    await audio.flush();
    audio.close();
  }
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  encoder.configure({ codec: enc.codec, width: W, height: H, bitrate: 8_000_000, framerate: FPS, latencyMode: 'quality' });
  for (let i = 0; i < renderer.frames; i++) {
    if (failure) throw failure;
    renderer.draw(ctx, i / FPS);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 6) await new Promise((r) => { encoder.addEventListener('dequeue', r, { once: true }); setTimeout(r, 200); });
    if (i % 6 === 0) { onProgress?.(i / renderer.frames); preview?.(canvas); await new Promise((r) => setTimeout(r, 0)); }
  }
  await encoder.flush();
  if (failure) throw failure;
  encoder.close();
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  blob.hasAudio = !!sound;
  return blob;
}

async function encodeWithRecorder(renderer, canvas, ctx, { onProgress, preview, music }) {
  const types = music ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const type = types.find((x) => MediaRecorder.isTypeSupported?.(x));
  if (!type) throw new Error('unsupported');
  const stream = canvas.captureStream(FPS);
  // Real time here, so the music plays into the recording as the frames are drawn.
  let actx = null, source = null;
  if (music && (window.AudioContext || window.webkitAudioContext)) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = actx.createMediaStreamDestination();
      source = actx.createBufferSource(); source.buffer = music; source.connect(dest);
      for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
    } catch { actx = null; source = null; }
  }
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const done = new Promise((r) => { rec.onstop = r; });
  rec.start(250);
  source?.start();
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const sec = (performance.now() - t0) / 1000;
      renderer.draw(ctx, Math.min(sec, renderer.total - 0.001));
      onProgress?.(sec / renderer.total); preview?.(canvas);
      if (sec < renderer.total) requestAnimationFrame(tick); else resolve();
    };
    tick();
  });
  rec.stop(); await done;
  try { source?.stop(); actx?.close(); } catch { /* already stopped */ }
  const blob = new Blob(parts, { type: type.split(';')[0] });
  blob.hasAudio = !!source;
  return blob;
}

/** Make the video. Returns { blob, type, ext, seconds }. */
export async function makeVideo(stats, { onProgress, preview, music: withMusic = true } = {}) {
  try { await Promise.all(['800 200px', '750 80px'].map((f) => document.fonts.load(`${f} "Bricolage Grotesque"`))); } catch { /* falls back to system type */ }
  const { scenes, cleanup } = await buildScenes(stats);
  try {
    const renderer = frameRenderer(scenes);
    let music = null;
    if (withMusic) { try { music = await renderSoundtrack(renderer.total, renderer.starts); } catch { music = null; } }
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    const enc = await pickEncoder();
    let blob;
    if (enc) blob = await encodeWithWebCodecs(renderer, canvas, ctx, enc, { onProgress, preview, music });
    else if (typeof MediaRecorder === 'function' && canvas.captureStream) blob = await encodeWithRecorder(renderer, canvas, ctx, { onProgress, preview, music });
    else throw new Error('unsupported');
    onProgress?.(1);
    return { blob, type: blob.type, ext: blob.type.includes('mp4') ? 'mp4' : 'webm', seconds: Math.round(renderer.total), codec: enc?.codec || 'recorder', audio: !!blob.hasAudio };
  } finally { cleanup(); }
}

/** For tests: scene titles and durations without drawing. */
export async function sceneSummary(stats) {
  const { scenes, cleanup } = await buildScenes(stats);
  cleanup();
  return scenes.map((s) => ({ theme: s.theme, dur: s.dur }));
}
