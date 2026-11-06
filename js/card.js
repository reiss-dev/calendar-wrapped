// Share images, drawn on canvas so the PNG is pixel-exact on every device.
// Everything renders from a card model (model.js), in the viewer's language.
// Formats: portrait (LinkedIn/feeds), square, story (9:16), wide (Slack/Teams).
import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { cardTiles, modelPersona, cardColours } from './model.js';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Inter", Helvetica, Arial, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const DISPLAY = '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
export const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
export const isLightInk = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150; };
export const THEME_COLOURS = {
  'c-black': ['#121014', '#f2eee6'], 'c-graphite': ['#24212b', '#e9e3ff'], 'c-blue': ['#2338e8', '#ffd9e6'], 'c-indigo': ['#1e1a4d', '#b8b2ff'],
  'c-purple': ['#c8b6ff', '#2b0e52'], 'c-pink': ['#ff4f8b', '#3a0619'], 'c-orange': ['#ff5a1f', '#2a0e00'], 'c-green': ['#a8f0c6', '#0b3b2b'],
  'c-teal': ['#0d5c63', '#bdf5ee'], 'c-yellow': ['#ffd23f', '#2e1a05'], 'c-white': ['#f3f1ec', '#17151a'],
};

export const FORMATS = {
  portrait: { label: () => t('Portrait'), W: 1080, H: 1350 },
  square: { label: () => t('Square'), W: 1080, H: 1080 },
  story: { label: () => t('Story'), W: 1080, H: 1920 },
  wide: { label: () => t('Wide'), W: 1200, H: 630 },
};

const setFont = (ctx, weight, size, tracking = 0, stretch = null) => {
  ctx.font = `${weight} ${size}px ${stretch ? DISPLAY : FONT}`; ctx.letterSpacing = `${tracking}px`;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch || 'normal';
};
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fitSize(ctx, text, maxWidth, weight, size, min, trackingRatio, stretch = null) {
  let s = size;
  while (s > min) { setFont(ctx, weight, s, trackingRatio * s, stretch); if (ctx.measureText(text).width <= maxWidth) break; s -= 2; }
  setFont(ctx, weight, s, trackingRatio * s, stretch);
  return s;
}
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const tt = line ? `${line} ${w}` : w; if (ctx.measureText(tt).width > maxWidth && line) { lines.push(line); line = w; } else line = tt; }
  if (line) lines.push(line);
  return lines;
}

const LAYOUTS = {
  portrait: { pad: 80, brandY: 100, brand: 26, head: [96, 268, 372], persona: { y: 440, emoji: 66, cap: 24, name: 56, nameDy: 128, capDy: 74, emojiDy: 112, indent: 98 }, tiles: { n: 6, cols: 2, y: 610, rowH: 150, gap: 40, num: 64, text: 44, label: 22, valueDy: 82, labelDy: 120 }, months: { y: 1090, h: 80, label: 18 }, foot: [22, 60] },
  square: { pad: 72, brandY: 92, brand: 24, head: [80, 214, 302], persona: { y: 352, emoji: 58, cap: 21, name: 48, nameDy: 112, capDy: 66, emojiDy: 100, indent: 86 }, tiles: { n: 4, cols: 2, y: 500, rowH: 138, gap: 36, num: 58, text: 40, label: 20, valueDy: 74, labelDy: 108 }, months: { y: 812, h: 72, label: 16 }, foot: [20, 52] },
  story: { pad: 90, brandY: 230, brand: 30, head: [124, 470, 604], persona: { y: 690, emoji: 80, cap: 28, name: 66, nameDy: 150, capDy: 88, emojiDy: 134, indent: 118 }, tiles: { n: 6, cols: 2, y: 900, rowH: 176, gap: 44, num: 74, text: 50, label: 26, valueDy: 96, labelDy: 140 }, months: { y: 1460, h: 110, label: 22 }, foot: [26, 250] },
  wide: { pad: 64, brandY: 84, brand: 22, head: [64, 196, 268], persona: { y: 316, emoji: 50, cap: 19, name: 40, nameDy: 98, capDy: 56, emojiDy: 86, indent: 72, width: 480 }, tiles: { n: 4, cols: 2, y: 118, rowH: 150, gap: 32, num: 54, text: 36, label: 18, valueDy: 70, labelDy: 102, x: 620 }, months: { y: 450, h: 64, label: 15, x: 620 }, foot: [18, 44] },
};

const monthInitials = () => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(document.documentElement.lang || 'en', { month: 'narrow' }).format(new Date(2021, i, 1)));

/** Draw the summary card from a model. */
export function renderCard(canvas, model, { format = 'portrait', watermark = true } = {}) {
  const F = FORMATS[format] || FORMATS.portrait;
  const L = LAYOUTS[format] || LAYOUTS.portrait;
  const { W, H } = F;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [paper, ink] = cardColours(model);
  const mute = hexA(ink, 0.74), rule = hexA(ink, 0.28);
  const pad = L.pad;
  const persona = modelPersona(model);
  ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

  setFont(ctx, 600, L.brand, -0.3); ctx.fillStyle = ink;
  ctx.fillText(CONFIG.brand.name, pad, L.brandY);
  ctx.textAlign = 'right'; ctx.fillStyle = mute; ctx.fillText(String(model.y), format === 'wide' ? L.tiles.x - 40 : W - pad, L.brandY); ctx.textAlign = 'left';

  const [hs, y1, y2] = L.head;
  const headW = format === 'wide' ? L.tiles.x - pad - 40 : W - pad * 2;
  ctx.fillStyle = ink;
  const l1 = t('Your {year},', { year: model.y }), l2 = model.m === 'w' ? t('in meetings.') : t('in plans.');
  const size = Math.min(fitSize(ctx, l1, headW, 800, hs * 1.12, hs * 0.6, -0.03, 'condensed'), fitSize(ctx, l2, headW, 800, hs * 1.12, hs * 0.6, -0.03, 'condensed'));
  setFont(ctx, 800, size, -size * 0.03, 'condensed');
  ctx.fillText(l1, pad - 3, y1);
  ctx.fillText(l2, pad - 3, y2);

  const P = L.persona;
  const pw = P.width || W - pad * 2;
  ctx.fillStyle = rule; ctx.fillRect(pad, P.y, pw, 2);
  ctx.fillStyle = ink; ctx.font = `${P.emoji}px ${EMOJI}`; ctx.letterSpacing = '0px';
  ctx.fillText(persona.emoji, pad, P.y + P.emojiDy);
  setFont(ctx, 500, P.cap, -0.3); ctx.fillStyle = mute;
  ctx.fillText(t('Your calendar persona'), pad + P.indent + 2, P.y + P.capDy);
  ctx.fillStyle = ink; fitSize(ctx, persona.name, pw - P.indent - 8, 800, P.name * 1.08, Math.round(P.name * 0.55), -0.025, 'semi-condensed');
  ctx.fillText(persona.name, pad + P.indent, P.y + P.nameDy);

  const T = L.tiles;
  const tx = T.x ?? pad;
  const tw = (T.x ? W - pad - T.x : W - pad * 2);
  const colW = (tw - T.gap * (T.cols - 1)) / T.cols;
  cardTiles(model).slice(0, T.n).forEach(([v, l], i) => {
    const col = i % T.cols, row = Math.floor(i / T.cols);
    const x = tx + col * (colW + T.gap), y = T.y + row * T.rowH;
    ctx.fillStyle = rule; ctx.fillRect(x, y, colW, 2);
    const numeric = /^[\d.,\s %]+$/.test(v);
    ctx.fillStyle = ink;
    fitSize(ctx, v, colW - 8, numeric ? 800 : 700, numeric ? T.num * 1.12 : T.text, Math.round(T.text * 0.55), numeric ? -0.025 : -0.02, numeric ? 'condensed' : 'semi-condensed');
    ctx.fillText(v, x, y + T.valueDy);
    ctx.fillStyle = mute; fitSize(ctx, l, colW - 4, 500, T.label, Math.round(T.label * 0.75), -0.01);
    ctx.fillText(l, x, y + T.labelDy);
  });

  if (L.months) {
    const M = L.months;
    const mx = M.x ?? pad, mw = (M.x ? W - pad - M.x : W - pad * 2), g = Math.round(mw / 100), bw = (mw - 11 * g) / 12;
    model.mo.forEach((v, i) => {
      const bh = Math.max(5, (v / 100) * M.h);
      ctx.fillStyle = i === model.hi ? ink : hexA(ink, 0.36);
      rounded(ctx, mx + i * (bw + g), M.y + M.h - bh, bw, bh, Math.min(5, bw / 4)); ctx.fill();
    });
    setFont(ctx, 500, M.label, 0); ctx.fillStyle = mute; ctx.textAlign = 'center';
    monthInitials().forEach((c, i) => ctx.fillText(c, mx + i * (bw + g) + bw / 2, M.y + M.h + M.label * 1.6));
    ctx.textAlign = 'left';
  }

  const [fs, fdy] = L.foot;
  setFont(ctx, 500, fs, -0.2);
  ctx.fillStyle = watermark ? ink : mute;
  ctx.fillText(watermark ? t('Make yours at {domain}', { domain: CONFIG.brand.domain }) : CONFIG.brand.domain, pad, H - fdy);
  ctx.textAlign = 'right'; ctx.fillStyle = mute; ctx.fillText(t('Nothing uploaded.'), W - pad, H - fdy); ctx.textAlign = 'left';
  return canvas;
}

/** A 9:16 image of one story slide. spec: { cap, big, unit, line, note, emoji, year } */
export function renderSlideCard(canvas, spec, theme = 'c-blue') {
  const W = 1080, H = 1920, pad = 96;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [bg, ink] = THEME_COLOURS[theme] || THEME_COLOURS['c-blue'];
  const mute = hexA(ink, 0.74);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

  setFont(ctx, 600, 30, -0.3); ctx.fillStyle = ink; ctx.fillText(CONFIG.brand.name, pad, 230);
  if (spec.year) { ctx.textAlign = 'right'; ctx.fillStyle = mute; ctx.fillText(String(spec.year), W - pad, 230); ctx.textAlign = 'left'; }

  const maxW = W - pad * 2;
  const blocks = [];
  if (spec.emoji) blocks.push({ h: 200, draw: (y) => { ctx.font = `150px ${EMOJI}`; ctx.letterSpacing = '0px'; ctx.fillStyle = ink; ctx.fillText(spec.emoji, pad - 4, y + 160); } });
  if (spec.cap) blocks.push({ h: 70, draw: (y) => { setFont(ctx, 650, 30, 2.6); ctx.fillStyle = mute; ctx.fillText(spec.cap.toLocaleUpperCase(), pad, y + 44); } });
  if (spec.big != null && spec.big !== '') {
    blocks.push({ h: 330, draw: (y) => {
      ctx.fillStyle = ink;
      const size = fitSize(ctx, String(spec.big), maxW - (spec.unit ? 180 : 0), 800, 400, 140, -0.03, 'condensed');
      ctx.fillText(String(spec.big), pad - 8, y + 290);
      if (spec.unit) { const w = ctx.measureText(String(spec.big)).width; setFont(ctx, 600, Math.round(size * 0.2), -1); ctx.fillStyle = mute; ctx.fillText(spec.unit, pad + w + 12, y + 290); }
    } });
  }
  if (spec.image && spec.image.width) {
    const side = 700;
    blocks.push({ h: side + 30, draw: (y) => { try { ctx.drawImage(spec.image, pad - 20, y, side, side * (spec.image.height / spec.image.width)); } catch { /* tainted or empty */ } } });
  }
  if (spec.line) {
    const size = spec.big ? 70 : (spec.image ? 76 : 110);
    setFont(ctx, 750, size, -size * 0.02, 'semi-condensed');
    const lines = wrap(ctx, spec.line, maxW).slice(0, 4);
    blocks.push({ h: lines.length * size * 1.1 + 30, draw: (y) => { setFont(ctx, 750, size, -size * 0.02, 'semi-condensed'); ctx.fillStyle = ink; lines.forEach((l, i) => ctx.fillText(l, pad, y + size + i * size * 1.1)); } });
  }
  if (spec.note) {
    setFont(ctx, 500, 40, -0.4);
    const lines = wrap(ctx, spec.note, maxW).slice(0, 4);
    blocks.push({ h: lines.length * 54 + 20, draw: (y) => { setFont(ctx, 500, 40, -0.4); ctx.fillStyle = mute; lines.forEach((l, i) => ctx.fillText(l, pad, y + 44 + i * 54)); } });
  }
  const total = blocks.reduce((a, b) => a + b.h, 0);
  let y = Math.max(320, H - 380 - total);
  for (const b of blocks) { b.draw(y); y += b.h; }

  setFont(ctx, 500, 30, -0.3); ctx.fillStyle = ink;
  ctx.fillText(t('Make yours at {domain}', { domain: CONFIG.brand.domain }), pad, H - 230);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
