// A LinkedIn carousel: the year as 1080 × 1350 pages in one PDF, drawn on the device from the
// stats as sharing allows (names and customers hidden as chosen). Same two-tone pages as the story.
import { CONFIG } from './config.js';
import { t, tn, monthName } from './i18n.js';
import { fmt } from './ui.js';
import { THEME_COLOURS, hexA } from './card.js';
import { persona as personaOf, categoryLabel } from './copy.js';
import { imagesToPdf } from './pdf.js';
import { hasMix, lead, headline, typeLabel } from './mix-ui.js';
import { hasAwards, awardCopy } from './awards-ui.js';
import { hasWhere, whereHeadline, whereLabel } from './where-ui.js';

export const W = 1080, H = 1350;
const PAD = 96;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Inter", Helvetica, Arial, sans-serif';
const DISPLAY = '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

function font(ctx, weight, size, display = false, stretchTo = 'normal') {
  ctx.font = `${weight} ${size}px ${display ? DISPLAY : FONT}`;
  ctx.letterSpacing = `${(-size * (display ? 0.025 : 0.01)).toFixed(1)}px`;
  if ('fontStretch' in ctx) ctx.fontStretch = display ? stretchTo : 'normal';
}
function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const tt = line ? `${line} ${w}` : w; if (ctx.measureText(tt).width > maxW && line) { lines.push(line); line = w; } else line = tt; }
  if (line) lines.push(line);
  return lines;
}
/** Writes wrapped text and returns the y below it. */
function text(ctx, str, y, { size, weight = 500, display = false, colour, maxW = W - PAD * 2, lh = 1.15, max = 4, x = PAD, stretch = 'semi-condensed' }) {
  if (!str) return y;
  font(ctx, weight, size, display, stretch);
  ctx.fillStyle = colour;
  const lines = wrap(ctx, str, maxW).slice(0, max);
  lines.forEach((l, i) => ctx.fillText(l, x, y + size + i * size * lh));
  return y + size + (lines.length - 1) * size * lh + size * 0.45;
}
/** A big number, shrunk to fit. */
function big(ctx, str, y, colour, { size = 300, unit = '' } = {}) {
  let s = size;
  for (; s > 120; s -= 8) { font(ctx, 800, s, true, 'condensed'); if (ctx.measureText(str).width <= W - PAD * 2 - (unit ? 180 : 0)) break; }
  ctx.fillStyle = colour; ctx.fillText(str, PAD - 6, y + s * 0.82);
  if (unit) { const w = ctx.measureText(str).width; font(ctx, 700, 56, true); ctx.fillText(unit, PAD + w + 18, y + s * 0.82); }
  return y + s * 0.82 + 40;
}
function bars(ctx, values, { y, h, colour, base, hi = -1, labels = null, mute }) {
  const n = values.length, gap = n > 20 ? 4 : 12, bw = (W - PAD * 2 - gap * (n - 1)) / n;
  const top = Math.max(1, ...values);
  values.forEach((v, i) => {
    const bh = Math.max(6, (v / top) * h);
    ctx.fillStyle = i === hi || hi < 0 ? colour : base;
    ctx.beginPath(); ctx.roundRect(PAD + i * (bw + gap), y + h - bh, bw, bh, Math.min(8, bw / 3)); ctx.fill();
  });
  if (labels) { font(ctx, 500, 26); ctx.fillStyle = mute; ctx.textAlign = 'center'; labels.forEach((l, i) => ctx.fillText(l, PAD + i * (bw + gap) + bw / 2, y + h + 40)); ctx.textAlign = 'left'; }
  return y + h + (labels ? 70 : 30);
}
function ring(ctx, pct, cx, cy, r, colour, base) {
  ctx.lineWidth = 34; ctx.lineCap = 'round';
  ctx.strokeStyle = base; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = colour; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, pct)) / 100); ctx.stroke();
}

/** The pages, as drawing functions. `s` should already be masked for sharing. */
export function carouselPages(s) {
  const work = s.mode === 'work';
  const P = personaOf(s.persona);
  const pages = [];
  const page = (theme, draw) => pages.push({ theme, draw });

  page(work ? 'c-blue' : 'c-pink', (ctx, c) => {
    let y = 300;
    font(ctx, 800, 170, true, 'condensed'); ctx.fillStyle = c.ink;
    ctx.fillText(t('Your {year},', { year: s.year }), PAD - 6, y + 140);
    ctx.fillText(work ? t('in meetings.') : t('in plans.'), PAD - 6, y + 300);
    y += 400;
    ctx.fillStyle = c.base; ctx.fillRect(PAD, y, W - PAD * 2, 3);
    ctx.fillStyle = c.ink; ctx.font = `110px ${EMOJI}`; ctx.fillText(P.emoji, PAD, y + 170);
    text(ctx, t('Your calendar persona'), y + 50, { size: 34, colour: c.mute, x: PAD + 150, maxW: W - PAD * 2 - 150 });
    text(ctx, P.name, y + 100, { size: 72, weight: 800, display: true, colour: c.ink, x: PAD + 150, maxW: W - PAD * 2 - 150, max: 2, lh: 1 });
    text(ctx, t('Swipe for the year →'), H - 240, { size: 40, weight: 600, colour: c.ink });
  });

  if (work) {
    page('c-indigo', (ctx, c) => {
      let y = text(ctx, t('The headline'), 220, { size: 34, weight: 650, colour: c.mute });
      y = big(ctx, fmt.int(s.meetings), y + 10, c.ink);
      y = text(ctx, s.isPartialYear ? t('meetings this year, so far.') : t('meetings this year.'), y, { size: 76, weight: 750, display: true, colour: c.ink, lh: 1.02 });
      text(ctx, t('{h} hours in all, about {w} full working weeks.', { h: fmt.int(s.totalHours), w: fmt.num(s.workingWeeksEquivalent) }), y + 20, { size: 40, colour: c.mute });
      bars(ctx, (s.weekly || []).map((w) => w.hours), { y: H - 360, h: 180, colour: c.ink, base: c.base });
    });
    page('c-white', (ctx, c) => {
      let y = text(ctx, t('Your working time'), 220, { size: 34, weight: 650, colour: c.mute });
      ring(ctx, s.shareOfWork, W / 2, y + 260, 210, c.ink, c.base);
      font(ctx, 800, 150, true, 'condensed'); ctx.fillStyle = c.ink; ctx.textAlign = 'center'; ctx.fillText(`${s.shareOfWork}%`, W / 2, y + 310); ctx.textAlign = 'left';
      y = text(ctx, t('of your working hours were meetings.'), y + 540, { size: 70, weight: 750, display: true, colour: c.ink, lh: 1.02 });
      text(ctx, t('Based on a {n}-hour week.', { n: fmt.num(s.workHoursPerWeek || 40) }), y + 10, { size: 36, colour: c.mute });
    });
    if (hasMix(s)) {
      const top = lead(s.mix);
      page('c-teal', (ctx, c) => {
        let y = text(ctx, t('Who you met with'), 220, { size: 34, weight: 650, colour: c.mute });
        y = big(ctx, `${top.pct}%`, y + 10, c.ink);
        y = text(ctx, headline(top), y, { size: 70, weight: 750, display: true, colour: c.ink, lh: 1.02 });
        const list = s.mix.types.filter((x) => x.pct > 0);
        const total = list.reduce((n, x) => n + x.hours, 0) || 1;
        let x = PAD; y += 40;
        list.forEach((m, i) => {
          const w = Math.max(10, ((W - PAD * 2 - 6 * (list.length - 1)) * m.hours) / total);
          ctx.fillStyle = hexA(c.ink, [1, 0.62, 0.38, 0.22, 0.12, 0.07][i] ?? 0.05);
          ctx.beginPath(); ctx.roundRect(x, y, w, 56, 12); ctx.fill(); x += w + 6;
        });
        y += 100;
        list.slice(0, 5).forEach((m, i) => {
          ctx.fillStyle = hexA(c.ink, [1, 0.62, 0.38, 0.22, 0.12][i]); ctx.beginPath(); ctx.roundRect(PAD, y + 6, 30, 30, 8); ctx.fill();
          text(ctx, typeLabel(m), y - 4, { size: 38, weight: 600, colour: c.ink, x: PAD + 50 });
          font(ctx, 700, 38); ctx.textAlign = 'right'; ctx.fillStyle = c.ink; ctx.fillText(`${m.pct}%`, W - PAD, y + 34); ctx.textAlign = 'left';
          y += 62;
        });
      });
    }
    if (hasWhere(s)) {
      const w = s.where, hd = whereHeadline(w);
      page('c-orange', (ctx, c) => {
        let y = text(ctx, t('Where you met'), 220, { size: 34, weight: 650, colour: c.mute });
        y = big(ctx, hd.suffix === '%' ? `${hd.value}%` : fmt.int(hd.value), y + 10, c.ink, hd.suffix === '%' ? {} : { unit: hd.suffix });
        y = text(ctx, hd.line, y, { size: 70, weight: 750, display: true, colour: c.ink, lh: 1.02 });
        if (hd.note) y = text(ctx, hd.note, y + 10, { size: 38, colour: c.mute });
        y += 40;
        w.types.forEach((m, i) => {
          const wd = Math.max(260, ((W - PAD * 2 - 160) * m.pct) / Math.max(1, ...w.types.map((x) => x.pct)));
          ctx.fillStyle = hexA(c.ink, [1, 0.6, 0.35][i] ?? 0.25); ctx.beginPath(); ctx.roundRect(PAD, y, wd, 64, 14); ctx.fill();
          text(ctx, whereLabel(m.key), y + 4, { size: 32, weight: 650, colour: i < 2 ? c.bg : c.ink, x: PAD + 20 });
          font(ctx, 700, 36); ctx.textAlign = 'right'; ctx.fillStyle = c.ink; ctx.fillText(`${m.pct}%`, W - PAD, y + 46); ctx.textAlign = 'left';
          y += 84;
        });
      });
    }
    if (s.worstWeek) {
      page('c-pink', (ctx, c) => {
        let y = text(ctx, t('The worst week'), 220, { size: 34, weight: 650, colour: c.mute });
        y = text(ctx, fmt.weekRange(s.worstWeek.start), y + 10, { size: 120, weight: 800, display: true, colour: c.ink, lh: 0.95, stretch: 'condensed' });
        y = big(ctx, fmt.int(s.worstWeek.hours), y + 10, c.ink, { size: 260, unit: t('hrs') });
        text(ctx, t('{n} meetings in five days.', { n: fmt.int(s.worstWeek.count) }), y, { size: 46, weight: 600, colour: c.ink });
        const weeks = (s.weekly || []);
        bars(ctx, weeks.map((w) => w.hours), { y: H - 360, h: 180, colour: c.ink, base: c.base, hi: weeks.findIndex((w) => +new Date(w.start) === +new Date(s.worstWeek.start)) });
      });
    }
  } else {
    page('c-purple', (ctx, c) => {
      let y = text(ctx, t('The headline'), 220, { size: 34, weight: 650, colour: c.mute });
      y = big(ctx, fmt.int(s.events), y + 10, c.ink);
      y = text(ctx, t('plans in the diary'), y, { size: 76, weight: 750, display: true, colour: c.ink });
      text(ctx, t('{h} hours of planned life.', { h: fmt.int(s.totalHours) }), y + 20, { size: 40, colour: c.mute });
    });
    if (s.categories?.length) {
      page('c-green', (ctx, c) => {
        let y = text(ctx, t('What filled it'), 220, { size: 34, weight: 650, colour: c.mute });
        y = text(ctx, categoryLabel(s.categories[0].key), y + 10, { size: 150, weight: 800, display: true, colour: c.ink, stretch: 'condensed', lh: 0.95 });
        const cats = s.categories.slice(0, 6);
        const top = Math.max(1, ...cats.map((x) => x.count));
        y += 40;
        cats.forEach((x, i) => {
          ctx.fillStyle = i ? c.base : c.ink; ctx.beginPath(); ctx.roundRect(PAD, y, Math.max(40, ((W - PAD * 2 - 130) * x.count) / top), 70, 16); ctx.fill();
          text(ctx, categoryLabel(x.key), y + 2, { size: 34, weight: 650, colour: i ? c.ink : c.bg, x: PAD + 22 });
          font(ctx, 600, 32); ctx.textAlign = 'right'; ctx.fillStyle = c.ink; ctx.fillText(`${fmt.int(x.count)}×`, W - PAD - 10, y + 47); ctx.textAlign = 'left';
          y += 88;
        });
      });
    }
    page('c-yellow', (ctx, c) => {
      let y = text(ctx, t('Weekends'), 220, { size: 34, weight: 650, colour: c.mute });
      // Hardly any free weekends reads better the other way round.
      const busy = s.freeWeekends <= 2;
      y = big(ctx, fmt.int(busy ? s.totalWeekends - s.freeWeekends : s.freeWeekends), y + 10, c.ink);
      y = text(ctx, busy ? t('weekends with something planned, out of {n}.', { n: fmt.int(s.totalWeekends) }) : t('weekends with nothing planned, out of {n}.', { n: fmt.int(s.totalWeekends) }), y, { size: 66, weight: 750, display: true, colour: c.ink, lh: 1.02 });
      if (s.travel?.trips) text(ctx, tn('And {n} trip away.', 'And {n} trips away.', s.travel.trips), y + 30, { size: 44, weight: 600, colour: c.ink });
    });
  }

  page(work ? 'c-blue' : 'c-indigo', (ctx, c) => {
    let y = text(ctx, t('Month by month'), 220, { size: 34, weight: 650, colour: c.mute });
    const bi = s.busiestMonth ? (s.busiestMonth.i ?? s.monthly.findIndex((m) => m.month === s.busiestMonth.month)) : -1;
    if (bi >= 0) y = text(ctx, t('{month} was the big one.', { month: monthName(bi) }), y + 10, { size: 96, weight: 800, display: true, colour: c.ink, lh: 1, stretch: 'condensed' });
    bars(ctx, s.monthly.map((m) => m.value), { y: H - 640, h: 400, colour: c.ink, base: c.base, hi: bi, labels: s.monthly.map((_, i) => monthName(i, 'narrow')), mute: c.mute });
  });

  if (hasAwards(s)) {
    page('c-yellow', (ctx, c) => {
      let y = text(ctx, t('Awards'), 220, { size: 34, weight: 650, colour: c.mute });
      y = text(ctx, t('The year gave you {n} awards.', { n: Math.min(5, s.awards.length) }), y + 10, { size: 76, weight: 800, display: true, colour: c.ink, lh: 1 });
      y += 30;
      s.awards.slice(0, 5).forEach((a) => {
        const [title, line] = awardCopy(a);
        ctx.fillStyle = c.base; ctx.beginPath(); ctx.arc(PAD + 52, y + 56, 52, 0, Math.PI * 2); ctx.fill();
        ctx.font = `56px ${EMOJI}`; ctx.textAlign = 'center'; ctx.fillStyle = c.ink; ctx.fillText(a.emoji, PAD + 52, y + 76); ctx.textAlign = 'left';
        const yy = text(ctx, title, y, { size: 46, weight: 800, display: true, colour: c.ink, x: PAD + 136, maxW: W - PAD * 2 - 136, max: 1 });
        text(ctx, line, yy - 12, { size: 30, colour: c.mute, x: PAD + 136, maxW: W - PAD * 2 - 136, max: 2 });
        y += 150;
      });
    });
  }

  if (work && s.reclaim?.totalHours > 0) {
    page('c-green', (ctx, c) => {
      let y = text(ctx, t('Next year'), 220, { size: 34, weight: 650, colour: c.mute });
      y = big(ctx, fmt.int(s.reclaim.totalHours), y + 10, c.ink, { unit: t('hrs') });
      y = text(ctx, t('you could realistically get back.'), y, { size: 76, weight: 750, display: true, colour: c.ink, lh: 1.02 });
      text(ctx, t('That’s about {d} working days, from changes drawn from the calendar itself.', { d: fmt.num(s.reclaim.workingDays) }), y + 20, { size: 40, colour: c.mute });
    });
  }

  page('c-black', (ctx, c) => {
    let y = text(ctx, CONFIG.brand.name, 300, { size: 40, weight: 650, colour: c.mute });
    y = text(ctx, t('Make yours.'), y + 20, { size: 170, weight: 800, display: true, colour: c.ink, stretch: 'condensed', lh: 0.95 });
    y = text(ctx, CONFIG.brand.domain, y + 20, { size: 60, weight: 700, colour: c.ink });
    text(ctx, t('Your calendar is read on your own device. Nothing is uploaded.'), y + 40, { size: 40, colour: c.mute });
  });
  return pages;
}

/** Draws one page onto a canvas. */
export function drawPage(canvas, pg, i, total) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [bg, ink] = THEME_COLOURS[pg.theme] || THEME_COLOURS['c-blue'];
  const c = { bg, ink, mute: hexA(ink, 0.7), base: hexA(ink, 0.22) };
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  pg.draw(ctx, c);
  font(ctx, 600, 28); ctx.fillStyle = c.mute; ctx.letterSpacing = '0px';
  ctx.fillText(CONFIG.brand.domain, PAD, H - 80);
  ctx.textAlign = 'right'; ctx.fillText(`${i + 1} / ${total}`, W - PAD, H - 80); ctx.textAlign = 'left';
  return canvas;
}

const toJpeg = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a))) : reject(new Error('jpeg'))), 'image/jpeg', 0.9));

/** The carousel as a PDF Blob. */
export async function makeCarousel(stats) {
  try { await Promise.all(['800 200px', '700 80px'].map((f) => document.fonts.load(`${f} "Bricolage Grotesque"`))); } catch { /* system type */ }
  const pages = carouselPages(stats);
  const canvas = document.createElement('canvas');
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    drawPage(canvas, pages[i], i, pages.length);
    out.push({ jpeg: await toJpeg(canvas), w: W, h: H });
  }
  const title = stats.mode === 'work' ? t('My {year} in meetings', { year: stats.year }) : t('My {year} in plans', { year: stats.year });
  return { blob: new Blob([imagesToPdf(out, { title })], { type: 'application/pdf' }), pages: pages.length };
}
