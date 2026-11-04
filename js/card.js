// Share images, drawn on canvas so the PNG is pixel-exact on every device.
// Everything renders from a small "card model" so a shared link can rebuild the card
// without the calendar. Formats: portrait (LinkedIn/feed), square, story (9:16), wide (Slack/OG).
import { CONFIG } from './config.js';
import { fmt } from './ui.js';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Inter", Helvetica, Arial, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const BG = { w: '#0a5cff', p: '#ff2d55', t: '#1fa65a' };
export const THEME_COLOURS = {
  'c-black': ['#000000', '#ffffff'], 'c-graphite': ['#1c1c1e', '#ffffff'], 'c-blue': ['#0a5cff', '#ffffff'], 'c-indigo': ['#3a36c8', '#ffffff'],
  'c-purple': ['#7a3ff2', '#ffffff'], 'c-pink': ['#ff2d55', '#ffffff'], 'c-orange': ['#ff6a00', '#ffffff'], 'c-green': ['#1fa65a', '#ffffff'],
  'c-teal': ['#0098b8', '#ffffff'], 'c-yellow': ['#ffd60a', '#1d1d1f'], 'c-white': ['#f5f5f7', '#1d1d1f'],
};

export const FORMATS = {
  portrait: { label: 'Portrait', hint: 'LinkedIn, feeds', W: 1080, H: 1350 },
  square: { label: 'Square', hint: 'Instagram, X', W: 1080, H: 1080 },
  story: { label: 'Story', hint: 'Stories, TikTok', W: 1080, H: 1920 },
  wide: { label: 'Wide', hint: 'Slack, Teams', W: 1200, H: 630 },
};

// ---------------------------------------------------------------- model
const clip = (s, n = 40) => String(s ?? '').slice(0, n);

/** Reduce stats to the few strings a card needs. Names and titles are dropped when hideNames is set. */
export function cardModel(s, { hideNames = true } = {}) {
  const work = s.mode === 'work';
  let tiles;
  if (work) {
    tiles = [
      [fmt.int(s.totalHours), 'hours in meetings'],
      [fmt.int(s.meetings), 'meetings'],
      [`${s.shareOfWork}%`, 'of working time'],
      [s.worstWeek ? fmt.weekRange(s.worstWeek.start) : '—', s.worstWeek ? `worst week, ${fmt.hours(s.worstWeek.hours)} hrs` : 'worst week'],
      hideNames || !s.collaborators[0] ? [fmt.int(s.backToBack), 'back-to-back meetings'] : [s.collaborators[0].name.split(' ')[0], `most seen, ${fmt.int(s.collaborators[0].count)} times`],
      hideNames || !s.topTitles[0] ? [`${s.recurringShare}%`, 'of meeting time on repeat'] : [`“${s.topTitles[0].key}”`, `most common title, ${fmt.int(s.topTitles[0].count)} times`],
    ];
  } else {
    tiles = [
      [fmt.int(s.events), 'plans in the diary'],
      [fmt.int(s.totalHours), 'hours of planned life'],
      [s.categories[0]?.label || '—', s.categories[0] ? `top category, ${fmt.int(s.categories[0].count)} times` : 'top category'],
      hideNames || !s.people[0] ? [`${fmt.int(s.longestBusyStreak.length)} days`, 'longest run with plans'] : [s.people[0].name, `most seen, ${fmt.int(s.people[0].count)} times`],
      [`${s.freeWeekends} of ${s.totalWeekends}`, 'weekends with nothing planned'],
      s.travel.trips ? [fmt.int(s.travel.trips), 'trips away'] : [fmt.int(s.birthdays), 'birthdays remembered'],
    ];
  }
  const max = Math.max(1, ...s.monthly.map((m) => m.value));
  return {
    v: 1, m: work ? 'w' : 'p', y: s.year, e: s.persona.emoji, n: s.persona.name,
    t: tiles.map(([a, b]) => [clip(a, 28), clip(b, 40)]),
    mo: s.monthly.map((m) => Math.round((m.value / max) * 100)),
    hi: Math.max(0, s.monthly.findIndex((m) => s.busiestMonth && m.month === s.busiestMonth.month)),
  };
}

/** Validate a model that arrived in a URL. Returns null when it isn't one of ours. */
export function sanitizeModel(x) {
  if (!x || x.v !== 1 || !['w', 'p'].includes(x.m)) return null;
  const y = Number(x.y);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  if (!Array.isArray(x.t) || x.t.length !== 6 || !Array.isArray(x.mo) || x.mo.length !== 12) return null;
  return {
    v: 1, m: x.m, y,
    e: [...String(x.e || '')].slice(0, 2).join(''),
    n: clip(x.n, 40),
    t: x.t.map((p) => [clip(Array.isArray(p) ? p[0] : '', 28), clip(Array.isArray(p) ? p[1] : '', 40)]),
    mo: x.mo.map((v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))),
    hi: Math.max(0, Math.min(11, Number(x.hi) || 0)),
  };
}

// ---------------------------------------------------------------- drawing helpers
const setFont = (ctx, weight, size, tracking = 0) => { ctx.font = `${weight} ${size}px ${FONT}`; ctx.letterSpacing = `${tracking}px`; };
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fitSize(ctx, text, maxWidth, weight, size, min, trackingRatio) {
  let s = size;
  while (s > min) { setFont(ctx, weight, s, trackingRatio * s); if (ctx.measureText(text).width <= maxWidth) break; s -= 2; }
  setFont(ctx, weight, s, trackingRatio * s);
  return s;
}
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

const LAYOUTS = {
  portrait: { pad: 80, brandY: 100, brand: 26, head: [96, 268, 372], persona: { y: 440, emoji: 66, cap: 24, name: 56, nameDy: 128, capDy: 74, emojiDy: 112, indent: 98 }, tiles: { n: 6, cols: 2, y: 610, rowH: 150, gap: 40, num: 64, text: 44, label: 22, valueDy: 82, labelDy: 120 }, months: { y: 1090, h: 80, label: 18 }, foot: [22, 60] },
  square: { pad: 72, brandY: 92, brand: 24, head: [80, 214, 302], persona: { y: 352, emoji: 58, cap: 21, name: 48, nameDy: 112, capDy: 66, emojiDy: 100, indent: 86 }, tiles: { n: 4, cols: 2, y: 500, rowH: 138, gap: 36, num: 58, text: 40, label: 20, valueDy: 74, labelDy: 108 }, months: { y: 812, h: 72, label: 16 }, foot: [20, 52] },
  story: { pad: 90, brandY: 230, brand: 30, head: [124, 470, 604], persona: { y: 690, emoji: 80, cap: 28, name: 66, nameDy: 150, capDy: 88, emojiDy: 134, indent: 118 }, tiles: { n: 6, cols: 2, y: 900, rowH: 176, gap: 44, num: 74, text: 50, label: 26, valueDy: 96, labelDy: 140 }, months: { y: 1460, h: 110, label: 22 }, foot: [26, 250] },
  wide: { pad: 64, brandY: 84, brand: 22, head: [64, 196, 268], persona: { y: 316, emoji: 50, cap: 19, name: 40, nameDy: 98, capDy: 56, emojiDy: 86, indent: 72, width: 480 }, tiles: { n: 4, cols: 2, y: 118, rowH: 150, gap: 32, num: 54, text: 36, label: 18, valueDy: 70, labelDy: 102, x: 620 }, months: { y: 450, h: 64, label: 15, x: 620 }, foot: [18, 44] },
};

/** Draw the summary card from a model. */
export function renderCard(canvas, model, { format = 'portrait', watermark = true } = {}) {
  const F = FORMATS[format] || FORMATS.portrait;
  const L = LAYOUTS[format] || LAYOUTS.portrait;
  const { W, H } = F;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const ink = '#ffffff', mute = 'rgba(255,255,255,0.72)', rule = 'rgba(255,255,255,0.26)';
  const pad = L.pad;
  ctx.fillStyle = BG[model.m] || BG.w; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

  // Brand and year
  setFont(ctx, 600, L.brand, -0.3); ctx.fillStyle = ink;
  ctx.fillText(CONFIG.brand.name, pad, L.brandY);
  ctx.textAlign = 'right'; ctx.fillStyle = mute; ctx.fillText(String(model.y), format === 'wide' ? L.tiles.x - 40 : W - pad, L.brandY); ctx.textAlign = 'left';

  // Headline
  const [hs, y1, y2] = L.head;
  setFont(ctx, 700, hs, -hs * 0.047); ctx.fillStyle = ink;
  ctx.fillText(`Your ${model.y},`, pad - 3, y1);
  ctx.fillText(model.m === 'w' ? 'in meetings.' : 'in plans.', pad - 3, y2);

  // Persona
  const P = L.persona;
  const pw = P.width || W - pad * 2;
  ctx.fillStyle = rule; ctx.fillRect(pad, P.y, pw, 2);
  ctx.fillStyle = ink; ctx.font = `${P.emoji}px ${EMOJI}`; ctx.letterSpacing = '0px';
  ctx.fillText(model.e, pad, P.y + P.emojiDy);
  setFont(ctx, 500, P.cap, -0.3); ctx.fillStyle = mute;
  ctx.fillText('Your calendar persona', pad + P.indent + 2, P.y + P.capDy);
  ctx.fillStyle = ink; fitSize(ctx, model.n, pw - P.indent - 8, 700, P.name, Math.round(P.name * 0.6), -0.036);
  ctx.fillText(model.n, pad + P.indent, P.y + P.nameDy);

  // Stat tiles
  const T = L.tiles;
  const tx = T.x ?? pad;
  const tw = (T.x ? W - pad - T.x : W - pad * 2);
  const colW = (tw - T.gap * (T.cols - 1)) / T.cols;
  model.t.slice(0, T.n).forEach(([v, l], i) => {
    const col = i % T.cols, row = Math.floor(i / T.cols);
    const x = tx + col * (colW + T.gap), y = T.y + row * T.rowH;
    ctx.fillStyle = rule; ctx.fillRect(x, y, colW, 2);
    const numeric = /^[\d.,%]+( days| hrs)?$/.test(v) || /^\d+ of \d+$/.test(v);
    ctx.fillStyle = ink;
    fitSize(ctx, v, colW - 8, numeric ? 700 : 600, numeric ? T.num : T.text, Math.round(T.text * 0.55), numeric ? -0.047 : -0.027);
    ctx.fillText(v, x, y + T.valueDy);
    setFont(ctx, 500, T.label, -0.2); ctx.fillStyle = mute;
    ctx.fillText(l, x, y + T.labelDy);
  });

  // Month strip
  if (L.months) {
    const M = L.months;
    const mx = M.x ?? pad, mw = (M.x ? W - pad - M.x : W - pad * 2), g = Math.round(mw / 100), bw = (mw - 11 * g) / 12;
    model.mo.forEach((v, i) => {
      const bh = Math.max(5, (v / 100) * M.h);
      ctx.fillStyle = i === model.hi ? ink : 'rgba(255,255,255,0.38)';
      rounded(ctx, mx + i * (bw + g), M.y + M.h - bh, bw, bh, Math.min(5, bw / 4)); ctx.fill();
    });
    setFont(ctx, 500, M.label, 0); ctx.fillStyle = mute; ctx.textAlign = 'center';
    'JFMAMJJASOND'.split('').forEach((c, i) => ctx.fillText(c, mx + i * (bw + g) + bw / 2, M.y + M.h + M.label * 1.6));
    ctx.textAlign = 'left';
  }

  // Footer
  const [fs, fdy] = L.foot;
  setFont(ctx, 500, fs, -0.2);
  ctx.fillStyle = watermark ? ink : mute;
  ctx.fillText(watermark ? `Make yours at ${CONFIG.brand.domain}` : CONFIG.brand.domain, pad, H - fdy);
  ctx.textAlign = 'right'; ctx.fillStyle = mute; ctx.fillText('Nothing uploaded.', W - pad, H - fdy); ctx.textAlign = 'left';
  return canvas;
}

/** A 9:16 image of one story slide. spec: { cap, big, unit, line, note, emoji } */
export function renderSlideCard(canvas, spec, theme = 'c-blue') {
  const W = 1080, H = 1920, pad = 96;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [bg, ink] = THEME_COLOURS[theme] || THEME_COLOURS['c-blue'];
  const dark = ink !== '#ffffff';
  const mute = dark ? 'rgba(29,29,31,0.62)' : 'rgba(255,255,255,0.74)';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

  setFont(ctx, 600, 30, -0.3); ctx.fillStyle = ink; ctx.fillText(CONFIG.brand.name, pad, 230);
  if (spec.year) { ctx.textAlign = 'right'; ctx.fillStyle = mute; ctx.fillText(String(spec.year), W - pad, 230); ctx.textAlign = 'left'; }

  // Lay out bottom-up so content sits low, like the slides themselves.
  const maxW = W - pad * 2;
  const blocks = [];
  if (spec.emoji) blocks.push({ h: 200, draw: (y) => { ctx.font = `150px ${EMOJI}`; ctx.letterSpacing = '0px'; ctx.fillStyle = ink; ctx.fillText(spec.emoji, pad - 4, y + 160); } });
  if (spec.cap) blocks.push({ h: 70, draw: (y) => { setFont(ctx, 500, 38, -0.4); ctx.fillStyle = mute; ctx.fillText(spec.cap, pad, y + 44); } });
  if (spec.big != null) {
    blocks.push({ h: 330, draw: (y) => {
      ctx.fillStyle = ink;
      const size = fitSize(ctx, String(spec.big), maxW - (spec.unit ? 180 : 0), 700, 340, 140, -0.06);
      ctx.fillText(String(spec.big), pad - 8, y + 290);
      if (spec.unit) { const w = ctx.measureText(String(spec.big)).width; setFont(ctx, 500, Math.round(size * 0.24), -1); ctx.fillStyle = mute; ctx.fillText(spec.unit, pad + w + 12, y + 290); }
    } });
  }
  if (spec.line) {
    const size = spec.big != null ? 70 : 110;
    setFont(ctx, 700, size, -size * 0.03);
    const lines = wrap(ctx, spec.line, maxW).slice(0, 4);
    blocks.push({ h: lines.length * size * 1.1 + 30, draw: (y) => { setFont(ctx, 700, size, -size * 0.03); ctx.fillStyle = ink; lines.forEach((l, i) => ctx.fillText(l, pad, y + size + i * size * 1.1)); } });
  }
  if (spec.note) {
    setFont(ctx, 500, 40, -0.4);
    const lines = wrap(ctx, spec.note, maxW).slice(0, 4);
    blocks.push({ h: lines.length * 54 + 20, draw: (y) => { setFont(ctx, 500, 40, -0.4); ctx.fillStyle = mute; lines.forEach((l, i) => ctx.fillText(l, pad, y + 44 + i * 54)); } });
  }
  const total = blocks.reduce((t, b) => t + b.h, 0);
  let y = Math.max(320, H - 380 - total);
  for (const b of blocks) { b.draw(y); y += b.h; }

  setFont(ctx, 500, 30, -0.3); ctx.fillStyle = ink;
  ctx.fillText(`Make yours at ${CONFIG.brand.domain}`, pad, H - 230);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
