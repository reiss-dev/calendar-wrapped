// Hand-built SVG visualisations. No chart library: every mark is drawn here so it can be
// animated, themed with CSS variables (--viz-ink, --viz-base, --viz-text), and stay crisp.
import { h, svg, fmt } from './ui.js';
import { t, monthName, weekdayName } from './i18n.js';

const pad2 = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const quantile = (vals, q) => { const v = vals.filter((x) => x > 0).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 1; };

// ---------------------------------------------------------------- year heatmap
/**
 * GitHub-style year: one square per day, Monday-first weeks, darker = more.
 * daily: { 'YYYY-MM-DD': value }. Returns an <svg>.
 */
export function yearHeatmap(daily, year, { unit = 'h', peak = null } = {}) {
  const cell = 13, gap = 3, step = cell + gap, left = 30, top = 22;
  const jan1 = new Date(year, 0, 1);
  const offset = (jan1.getDay() + 6) % 7; // Monday = 0
  const days = Math.round((new Date(year + 1, 0, 1) - jan1) / 86400000);
  const weeks = Math.ceil((days + offset) / 7);
  const W = left + weeks * step, H = top + 7 * step + 4;
  const cap = quantile(Object.values(daily), 0.95) || 1;
  const today = new Date();
  const s = svg('svg', { class: 'viz viz-heatmap', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('Your year, day by day') });
  for (let m = 0; m < 12; m++) {
    const d = new Date(year, m, 1);
    const col = Math.floor((Math.round((d - jan1) / 86400000) + offset) / 7);
    s.append(svg('text', { x: left + col * step, y: 12, class: 'viz-label' }, monthName(m, 'short')));
  }
  [0, 2, 4].forEach((r) => s.append(svg('text', { x: 0, y: top + r * step + cell - 2, class: 'viz-label' }, weekdayName((r + 1) % 7, 'narrow'))));
  for (let i = 0; i < days; i++) {
    const d = new Date(year, 0, 1 + i);
    const idx = i + offset, col = Math.floor(idx / 7), row = idx % 7;
    const k = key(d);
    const v = daily[k] || 0;
    const future = d > today;
    const level = v ? Math.max(0.18, Math.min(1, v / cap)) : 0;
    const r = svg('rect', { x: left + col * step, y: top + row * step, width: cell, height: cell, rx: 3, class: `cell${future ? ' future' : ''}${k === peak ? ' peak' : ''}`, style: `--v:${level.toFixed(2)}; --c:${col}`, 'data-date': k, 'data-v': v });
    r.append(svg('title', {}, `${fmt.dateLong(d)}: ${unit === 'h' ? t('{h} hours in meetings', { h: fmt.num(v) }) : t('{n} plans', { n: fmt.int(v) })}`));
    s.append(r);
  }
  return s;
}

/** Legend for the heatmap: less → more. */
export function heatLegend() {
  return h('div', { class: 'viz-legend' }, h('span', {}, t('Less')), ...[0, 0.25, 0.5, 0.75, 1].map((v) => h('i', { style: `--v:${v}` })), h('span', {}, t('More')));
}

// ---------------------------------------------------------------- radial clock
const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
function sector(cx, cy, r0, r1, a0, a1) {
  const [x0, y0] = polar(cx, cy, r0, a0), [x1, y1] = polar(cx, cy, r1, a0), [x2, y2] = polar(cx, cy, r1, a1), [x3, y3] = polar(cx, cy, r0, a1);
  return `M${x0} ${y0}L${x1} ${y1}A${r1} ${r1} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r0} ${r0} 0 0 0 ${x0} ${y0}Z`;
}
/** 24-hour clock: one petal per hour, length = how often something starts then. */
export function radialClock(byHour) {
  const S = 320, c = S / 2, r0 = 54, rMax = 134;
  const max = Math.max(1, ...byHour.map((x) => x.count));
  const peak = byHour.reduce((a, b) => (b.count > a.count ? b : a), byHour[0]);
  const s = svg('svg', { class: 'viz viz-clock', viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': t('Busiest hour: {h}:00', { h: pad2(peak.hour) }) });
  s.append(svg('circle', { cx: c, cy: c, r: rMax, class: 'ring-guide' }), svg('circle', { cx: c, cy: c, r: (r0 + rMax) / 2, class: 'ring-guide' }));
  byHour.forEach((x, i) => {
    const a0 = (i / 24) * Math.PI * 2 - Math.PI / 2 + 0.03, a1 = ((i + 1) / 24) * Math.PI * 2 - Math.PI / 2 - 0.03;
    const len = x.count ? Math.max(6, (x.count / max) * (rMax - r0)) : 2;
    s.append(svg('path', { d: sector(c, c, r0, r0 + len, a0, a1), class: `petal${x.hour === peak.hour ? ' peak' : ''}`, style: `--i:${i}; transform-origin:${c}px ${c}px` }));
  });
  [0, 6, 12, 18].forEach((hr) => { const [x, y] = polar(c, c, rMax + 16, (hr / 24) * Math.PI * 2 - Math.PI / 2); s.append(svg('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'viz-label' }, pad2(hr))); });
  s.append(svg('text', { x: c, y: c + 9, 'text-anchor': 'middle', class: 'viz-center' }, `${pad2(peak.hour)}:00`));
  return s;
}

// ---------------------------------------------------------------- weekday × hour grid
export function weekGridViz(grid, { from = 6, to = 22 } = {}) {
  const cols = to - from, cell = 22, left = 36, top = 6;
  const W = left + cols * cell, H = top + 7 * cell + 20;
  const max = Math.max(1, ...grid.flat());
  const s = svg('svg', { class: 'viz viz-grid', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('When in the week things happen') });
  [1, 2, 3, 4, 5, 6, 0].forEach((day, r) => {
    s.append(svg('text', { x: 0, y: top + r * cell + cell / 2 + 4, class: 'viz-label' }, weekdayName(day, 'short')));
    for (let hr = from; hr < to; hr++) {
      const v = grid[day][hr] / max;
      s.append(svg('circle', { cx: left + (hr - from) * cell + cell / 2, cy: top + r * cell + cell / 2, r: v ? 2 + v * 8 : 1.5, class: 'dot', style: `--v:${v.toFixed(2)}; --i:${r * cols + hr - from}` }));
    }
  });
  for (let hr = from; hr <= to; hr += 4) s.append(svg('text', { x: left + (hr - from) * cell, y: H - 4, class: 'viz-label' }, pad2(hr)));
  return s;
}

// ---------------------------------------------------------------- bubbles
const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
/** Packed circles, area proportional to value. items: [{ label, value, sub }] */
export function bubbles(items, { max = 10, minR = 16, maxR = 92 } = {}) {
  const list = items.slice(0, max).filter((x) => x.value > 0);
  if (!list.length) return svg('svg', { class: 'viz' });
  const top = list[0].value;
  const circles = [];
  for (const it of list) {
    const r = Math.max(minR, Math.sqrt(it.value / top) * maxR);
    let placed = null;
    if (!circles.length) placed = { x: 0, y: 0 };
    for (let k = 0; !placed && k < 4000; k++) {
      const a = k * 0.35, d = 2 + k * 0.9;
      const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.72; // slightly wide cluster
      if (circles.every((c) => Math.hypot(c.x - x, c.y - y) >= c.r + r + 4)) placed = { x, y };
    }
    circles.push({ ...it, ...placed, r });
  }
  const minX = Math.min(...circles.map((c) => c.x - c.r)) - 4, maxX = Math.max(...circles.map((c) => c.x + c.r)) + 4;
  const minY = Math.min(...circles.map((c) => c.y - c.r)) - 4, maxY = Math.max(...circles.map((c) => c.y + c.r)) + 4;
  const s = svg('svg', { class: 'viz viz-bubbles', viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, role: 'img', 'aria-label': list.map((c) => `${c.label} ${fmt.int(c.value)}`).join(', ') });
  circles.forEach((c, i) => {
    const g = svg('g', { class: `bubble${i === 0 ? ' first' : ''}`, style: `--i:${i}; transform-origin:${c.x}px ${c.y}px` });
    g.append(svg('circle', { cx: c.x, cy: c.y, r: c.r }));
    if (c.r >= 40) {
      const first = String(c.label).split(' ')[0];
      g.append(svg('text', { x: c.x, y: c.y - 2, 'text-anchor': 'middle', class: 'b-name', style: `font-size:${Math.min(22, c.r / 3.2)}px` }, first));
      g.append(svg('text', { x: c.x, y: c.y + Math.min(22, c.r / 3.2) * 0.95, 'text-anchor': 'middle', class: 'b-sub', style: `font-size:${Math.min(16, c.r / 4.6)}px` }, c.sub ?? fmt.int(c.value)));
    } else {
      g.append(svg('text', { x: c.x, y: c.y + Math.min(14, c.r / 2.4) * 0.35, 'text-anchor': 'middle', class: 'b-name', style: `font-size:${Math.min(14, c.r / 2.4)}px` }, initials(c.label)));
    }
    g.append(svg('title', {}, `${c.label}: ${c.sub ?? fmt.int(c.value)}`));
    s.append(g);
  });
  return s;
}

// ---------------------------------------------------------------- treemap
function squarify(items, x, y, w, h) {
  const out = [];
  let rest = items.slice();
  const total = rest.reduce((a, b) => a + b.value, 0) || 1;
  const scale = (w * h) / total;
  rest = rest.map((it) => ({ ...it, area: it.value * scale }));
  const worst = (row, side) => { const s = row.reduce((a, b) => a + b.area, 0); const mx = Math.max(...row.map((r) => r.area)), mn = Math.min(...row.map((r) => r.area)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  while (rest.length) {
    const side = Math.min(w, h);
    const row = [rest.shift()];
    while (rest.length && worst([...row, rest[0]], side) <= worst(row, side)) row.push(rest.shift());
    const s = row.reduce((a, b) => a + b.area, 0);
    if (w >= h) { const cw = s / h; let cy = y; for (const r of row) { const ch = r.area / cw; out.push({ ...r, x, y: cy, w: cw, h: ch }); cy += ch; } x += cw; w -= cw; }
    else { const rh = s / w; let cx = x; for (const r of row) { const rw = r.area / rh; out.push({ ...r, x: cx, y, w: rw, h: rh }); cx += rw; } y += rh; h -= rh; }
  }
  return out;
}
/** Rectangles sized by value. items: [{ label, value, sub }] */
export function treemap(items, { W = 600, H = 340, max = 8 } = {}) {
  const list = items.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, max);
  const s = svg('svg', { class: 'viz viz-treemap', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': list.map((x) => `${x.label} ${x.sub ?? ''}`).join(', ') });
  squarify(list, 0, 0, W, H).forEach((r, i) => {
    const g = svg('g', { class: 'tile-g', style: `--i:${i}; --o:${(1 - i * 0.09).toFixed(2)}; transform-origin:${r.x + r.w / 2}px ${r.y + r.h / 2}px` });
    g.append(svg('rect', { x: r.x + 2, y: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4), rx: 10 }));
    if (r.w > 90 && r.h > 46) {
      const fs = Math.max(12, Math.min(22, r.w / 9));
      const label = String(r.label).length > r.w / (fs * 0.55) ? `${String(r.label).slice(0, Math.floor(r.w / (fs * 0.55)) - 1)}…` : r.label;
      g.append(svg('text', { x: r.x + 14, y: r.y + 14 + fs, class: 't-name', style: `font-size:${fs}px` }, label));
      const subFs = fs * 0.72, maxSub = Math.floor((r.w - 24) / (subFs * 0.55));
      const sub = String(r.sub ?? '');
      if (r.h > 70) g.append(svg('text', { x: r.x + 14, y: r.y + 18 + fs * 2.1, class: 't-sub', style: `font-size:${subFs}px` }, sub.length > maxSub ? `${sub.slice(0, Math.max(1, maxSub - 1))}…` : sub));
    }
    g.append(svg('title', {}, `${r.label}: ${r.sub ?? fmt.int(r.value)}`));
    s.append(g);
  });
  return s;
}

// ---------------------------------------------------------------- pictograms
// Icon paths from Google's Material Icons (Apache 2.0).
const ICONS = {
  weeks: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z',
  flights: 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z',
  office: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z',
  marathons: 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9 1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z',
};
/** A row of icons, one per unit, capped with "+N". */
export function pictogram(kind, value, { cap = 24 } = {}) {
  const n = Math.max(0, Math.round(value));
  const shown = Math.min(n, cap);
  const s = svg('svg', { class: 'viz viz-picto', viewBox: `0 0 ${cap * 26} 26`, 'aria-hidden': 'true' });
  for (let i = 0; i < shown; i++) {
    const g = svg('g', { transform: `translate(${i * 26} 1)`, class: 'picto', style: `--i:${i}` });
    g.append(svg('path', { d: ICONS[kind] || ICONS.weeks }));
    s.append(g);
  }
  return h('div', { class: 'picto-row' }, s, n > cap ? h('span', { class: 'picto-more' }, `+${fmt.int(n - cap)}`) : null);
}

// ---------------------------------------------------------------- travel arcs
/** Abstract route map: home at the left, destinations fanned out on arcs. */
export function travelArcs(places) {
  const list = places.slice(0, 6);
  const W = 600, H = 250, hx = 40, hy = 210;
  const s = svg('svg', { class: 'viz viz-arcs', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': list.map((p) => p.key).join(', ') });
  s.append(svg('circle', { cx: hx, cy: hy, r: 7, class: 'home' }));
  list.forEach((p, i) => {
    const x = 170 + (i * (W - 220)) / Math.max(1, list.length - 1 || 1), y = 70 + (i % 2) * 70;
    const cx = (hx + x) / 2, cy = Math.min(hy, y) - 80 - i * 6;
    const d = `M${hx} ${hy} Q${cx} ${cy} ${x} ${y}`;
    s.append(svg('path', { d, class: 'arc', pathLength: 1, style: `--i:${i}` }));
    s.append(svg('circle', { cx: x, cy: y, r: 5 + Math.min(5, p.count), class: 'dest', style: `--i:${i}` }));
    s.append(svg('text', { x, y: y + 26, 'text-anchor': 'middle', class: 'viz-label dest-label', style: `--i:${i}` }, p.key));
  });
  return s;
}

// ---------------------------------------------------------------- confetti
/** A short burst over an element. Skipped when people prefer reduced motion. */
export function confetti(host, { colours = ['#ffd9e6', '#ffd23f', '#a8f0c6', '#b8b2ff', '#ff5a1f', '#2338e8', '#ff4f8b'], count = 140 } = {}) {
  if (reduceMotion() || !host) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const rect = host.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = rect.width * dpr; c.height = rect.height * dpr;
  host.append(c);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: rect.width / 2 + (Math.random() - 0.5) * 80, y: rect.height * 0.42,
    vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 15 - 5, g: 0.38 + Math.random() * 0.12,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 10, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
    col: colours[Math.floor(Math.random() * colours.length)],
  }));
  const start = performance.now();
  const frame = (now) => {
    const age = now - start;
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const p of parts) {
      p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 2600); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); ctx.restore();
    }
    if (age < 2700) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- dot matrix
/** One dot per meeting (or per few, for big numbers), filling in like a crowd. */
export function dotMatrix(n, { cap = 900, cols = 40 } = {}) {
  const per = Math.max(1, Math.ceil(n / cap));
  const dots = Math.ceil(n / per);
  const rows = Math.ceil(dots / cols), step = 15;
  const s = svg('svg', { class: 'viz viz-dots', viewBox: `0 0 ${cols * step} ${rows * step}`, 'aria-hidden': 'true' });
  for (let i = 0; i < dots; i++) {
    s.append(svg('circle', { cx: (i % cols) * step + step / 2, cy: Math.floor(i / cols) * step + step / 2, r: 5, class: 'm-dot', style: `--i:${i}; --d:${Math.min(1600, i * 1.6).toFixed(0)}ms` }));
  }
  return h('div', {}, s, per > 1 ? h('p', { class: 'viz-note' }, t('Each dot is {n} meetings.', { n: per })) : null);
}

// ---------------------------------------------------------------- year of weeks
/** 52 weeks in a row; the first N (fractional) fill in: the weeks that went on meetings. */
export function weeksBar(weeks) {
  const total = 52, w = 600 / total;
  const s = svg('svg', { class: 'viz viz-weeks', viewBox: `0 0 600 70`, 'aria-hidden': 'true' });
  for (let i = 0; i < total; i++) {
    const fill = Math.max(0, Math.min(1, weeks - i));
    s.append(svg('rect', { x: i * w + 1, y: 0, width: w - 2, height: 52, rx: 3, class: 'wk-base' }));
    if (fill > 0) s.append(svg('rect', { x: i * w + 1, y: 0, width: (w - 2) * fill, height: 52, rx: 3, class: 'wk-fill', style: `--i:${i}` }));
  }
  s.append(svg('text', { x: 0, y: 68, class: 'viz-label' }, t('Jan')), svg('text', { x: 600, y: 68, 'text-anchor': 'end', class: 'viz-label' }, t('Dec')));
  return s;
}

// ---------------------------------------------------------------- chain
/** The longest run of back-to-back meetings, drawn as linked blocks. */
export function chain(length) {
  const n = Math.max(1, Math.min(14, length));
  const bw = 600 / n;
  const s = svg('svg', { class: 'viz viz-chain', viewBox: `0 0 600 64`, 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    s.append(svg('rect', { x: i * bw + (i ? 3 : 0), y: 8, width: bw - (i ? 6 : 3), height: 48, rx: 10, class: 'link', style: `--i:${i}` }));
    if (i) s.append(svg('rect', { x: i * bw - 7, y: 28, width: 14, height: 8, rx: 4, class: 'joint', style: `--i:${i}` }));
  }
  return s;
}

// ---------------------------------------------------------------- bar race
/** Horizontal bars that race out to their values. items: [{ label, value, sub }] */
export function barRace(items, { max = 5 } = {}) {
  const list = items.slice(0, max);
  const top = Math.max(1, ...list.map((x) => x.value));
  return h('div', { class: 'bar-race' }, list.map((x, i) => h('div', { class: `race${i === 0 ? ' first' : ''}`, style: `--v:${(x.value / top).toFixed(3)}; --i:${i}` },
    h('div', { class: 'race-fill' }), h('span', { class: 'race-label' }, x.label), h('span', { class: 'race-val' }, x.sub ?? fmt.int(x.value)))));
}

// ---------------------------------------------------------------- hour blocks
/** A year's meeting hours as blocks; the reclaimable ones light up. */
export function hourBlocks(total, reclaim, { cap = 160 } = {}) {
  const per = Math.max(1, Math.ceil(total / cap / 5) * 5);
  const n = Math.max(1, Math.round(total / per)), k = Math.min(n, Math.round(reclaim / per));
  const cols = 20, step = 30;
  const s = svg('svg', { class: 'viz viz-blocks', viewBox: `0 0 ${cols * step} ${Math.ceil(n / cols) * step}`, 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    s.append(svg('rect', { x: (i % cols) * step + 2, y: Math.floor(i / cols) * step + 2, width: step - 4, height: step - 4, rx: 6, class: i < k ? 'blk back' : 'blk', style: `--i:${i}` }));
  }
  return h('div', {}, s, h('p', { class: 'viz-note' }, t('Each block is {n} hours. The bright ones are yours again.', { n: per })));
}

/** Loading animation: a year grid that lights up as the file is read. */
export function readingGrid() {
  const s = svg('svg', { class: 'viz viz-reading', viewBox: '0 0 371 55', 'aria-hidden': 'true' });
  let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let c = 0; c < 53; c++) for (let d = 0; d < 7; d++) {
    s.append(svg('rect', { x: c * 7, y: d * 7 + 3, width: 5.5, height: 5.5, rx: 1.2, class: 'rd', style: `--c:${c}; --v:${d > 4 ? 0.1 : (0.25 + r() * 0.75).toFixed(2)}` }));
  }
  return s;
}

// ---------------------------------------------------------------- time off
/**
 * The year as twelve rows of days. Leave taken is solid, leave booked is a ring, public holidays
 * are half-tone, weekends sit back. The longest break gets a soft highlight behind it.
 * days: { 'YYYY-MM-DD': 'l' | 'b' | 'h' }
 */
export function leaveYear(days, year, { highlight = null } = {}) {
  const step = 11.5, r = 4, left = 30, top = 4;
  const W = left + 31 * step, H = top + 12 * 15;
  const s = svg('svg', { class: 'viz viz-leave', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('Your year, day by day') });
  const rowY = (m) => top + m * 15 + 7;
  if (highlight) {
    const a = new Date(`${highlight.start}T12:00:00`), z = new Date(`${highlight.end}T12:00:00`);
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1, 12), last = new Date(year, m + 1, 0, 12);
      const from = a > first ? a : first, to = z < last ? z : last;
      if (from > to || from.getFullYear() !== year) continue;
      const x0 = left + (from.getDate() - 1) * step - 1, x1 = left + (to.getDate() - 1) * step + r * 2 + 1;
      s.append(svg('rect', { x: x0, y: rowY(m) - r - 2.5, width: x1 - x0, height: r * 2 + 5, rx: r + 2.5, class: 'lv-hl' }));
    }
  }
  let order = 0;
  for (let m = 0; m < 12; m++) {
    s.append(svg('text', { x: 0, y: rowY(m) + 4, class: 'viz-label' }, monthName(m, 'short')));
    const n = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= n; d++) {
      const date = new Date(year, m, d);
      const k = key(date);
      const kind = days[k];
      const we = date.getDay() === 0 || date.getDay() === 6;
      const cls = kind === 'l' ? 'lv on' : kind === 'b' ? 'lv booked' : kind === 'h' ? 'lv hol' : we ? 'lv we' : 'lv';
      s.append(svg('circle', { cx: left + (d - 1) * step + r, cy: rowY(m), r: kind ? r : we ? r * 0.55 : r * 0.75, class: cls, style: `--i:${m * 4 + Math.floor(d / 3)}${kind ? `; --s:${order++}` : ''}` }));
    }
  }
  return s;
}
export function leaveLegend({ booked = true } = {}) {
  return h('div', { class: 'viz-legend leave-legend' },
    h('i', { class: 'k-on' }), h('span', {}, t('leave')),
    booked ? [h('i', { class: 'k-booked' }), h('span', {}, t('booked'))] : null,
    h('i', { class: 'k-hol' }), h('span', {}, t('public holiday')));
}

/** One break, day by day: weekends, public holidays and the days of leave it takes. */
export function breakStrip(plan) {
  const a = new Date(`${plan.start}T12:00:00`), z = new Date(`${plan.end}T12:00:00`);
  const n = Math.round((z - a) / 86400000) + 1;
  const leave = new Set(plan.leave);
  const cell = 22, gap = 4;
  const s = svg('svg', { class: 'viz viz-break', viewBox: `0 0 ${n * (cell + gap) - gap} ${cell + 16}`, role: 'img', 'aria-label': t('Take {take}, get {off} days off', { take: plan.take, off: plan.off }) });
  for (let i = 0; i < n; i++) {
    const d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + i);
    const we = d.getDay() === 0 || d.getDay() === 6;
    const cls = leave.has(key(d)) ? 'bk take' : we ? 'bk we' : 'bk hol';
    s.append(svg('rect', { x: i * (cell + gap), y: 0, width: cell, height: cell, rx: 6, class: cls, style: `--i:${i}` }),
      svg('text', { x: i * (cell + gap) + cell / 2, y: cell + 13, 'text-anchor': 'middle', class: 'viz-label' }, weekdayName(d.getDay(), 'narrow')));
  }
  return s;
}
export function breakLegend() {
  return h('div', { class: 'viz-legend break-legend' },
    h('i', { class: 'k-take' }), h('span', {}, t('leave')),
    h('i', { class: 'k-hol' }), h('span', {}, t('public holiday')),
    h('i', { class: 'k-we' }), h('span', {}, t('weekend')));
}

// ---------------------------------------------------------------- birthdays
/** A year as a ring: one arc per month, one dot per birthday, the busiest month lit. */
export function birthdayWheel(info) {
  const S = 320, c = S / 2, R = 118;
  const s = svg('svg', { class: 'viz viz-bday', viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': t('{n} birthdays', { n: info.count }) });
  const ang = (m, d) => ((m + (d - 0.5) / new Date(2001, m + 1, 0).getDate()) / 12) * Math.PI * 2 - Math.PI / 2;
  for (let m = 0; m < 12; m++) {
    const a0 = (m / 12) * Math.PI * 2 - Math.PI / 2 + 0.035, a1 = ((m + 1) / 12) * Math.PI * 2 - Math.PI / 2 - 0.035;
    const [x0, y0] = polar(c, c, R, a0), [x1, y1] = polar(c, c, R, a1);
    s.append(svg('path', { d: `M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}`, pathLength: 1, class: `mo${info.busiestMonth?.i === m ? ' busy' : ''}`, style: `--i:${m}` }));
    const [lx, ly] = polar(c, c, R + 22, (m + 0.5) / 12 * Math.PI * 2 - Math.PI / 2);
    s.append(svg('text', { x: lx, y: ly + 4, 'text-anchor': 'middle', class: `viz-label${info.busiestMonth?.i === m ? ' hl' : ''}` }, monthName(m, 'narrow')));
  }
  const used = new Map();
  info.list.forEach((b, i) => {
    const slot = `${b.m}-${Math.floor(b.d / 4)}`;
    const k = used.get(slot) || 0; used.set(slot, k + 1);
    const [x, y] = polar(c, c, R - 18 - k * 15, ang(b.m, b.d));
    const g = svg('circle', { cx: x, cy: y, r: b.age && (b.age % 10 === 0 || b.age === 18 || b.age === 21) ? 8 : 6, class: 'bd', style: `--i:${i}` });
    g.append(svg('title', {}, `${b.name || t('Birthday')}, ${fmt.date(new Date(2001, b.m, b.d))}`));
    s.append(g);
  });
  s.append(svg('text', { x: c, y: c + 10, 'text-anchor': 'middle', class: 'viz-center bd-n' }, String(info.count)));
  s.append(svg('text', { x: c, y: c + 34, 'text-anchor': 'middle', class: 'viz-label bd-l' }, info.count === 1 ? t('birthday') : t('birthdays')));
  return s;
}

// ---------------------------------------------------------------- the year as twelve months
/** Twelve little month calendars, three across: the year heatmap shaped for a phone. */
export function monthGrid(daily, year, { unit = 'h', peak = null } = {}) {
  const cell = 10, step = 12.5, mw = 7 * step, lab = 15, mh = lab + 6 * step, gx = 18, gy = 12;
  const W = 3 * mw + 2 * gx, H = 4 * mh + 3 * gy;
  const cap = quantile(Object.values(daily), 0.95) || 1;
  const today = new Date();
  const s = svg('svg', { class: 'viz viz-heatmap viz-months', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('Your year, day by day') });
  for (let m = 0; m < 12; m++) {
    const x0 = (m % 3) * (mw + gx), y0 = Math.floor(m / 3) * (mh + gy);
    s.append(svg('text', { x: x0, y: y0 + 10, class: 'viz-label' }, monthName(m, 'short')));
    const first = (new Date(year, m, 1).getDay() + 6) % 7, n = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= n; d++) {
      const date = new Date(year, m, d), k = key(date), idx = first + d - 1;
      const v = daily[k] || 0;
      const r = svg('rect', { x: x0 + (idx % 7) * step, y: y0 + lab + Math.floor(idx / 7) * step, width: cell, height: cell, rx: 2.5,
        class: `cell${date > today ? ' future' : ''}${k === peak ? ' peak' : ''}`, style: `--v:${(v ? Math.max(0.18, Math.min(1, v / cap)) : 0).toFixed(2)}; --c:${m * 3 + Math.floor(idx / 7)}` });
      r.append(svg('title', {}, `${fmt.dateLong(date)}: ${unit === 'h' ? t('{h} hours in meetings', { h: fmt.num(v) }) : t('{n} plans', { n: fmt.int(v) })}`));
      s.append(r);
    }
  }
  return s;
}

// ---------------------------------------------------------------- persona stamp
/** A rubber stamp: the persona's emoji in a ring of type. Returns a wrapper with the emoji as real text. */
export function personaStamp(emoji, ringText) {
  const S = 300, c = S / 2, r = 118;
  const id = `stamp-${Math.random().toString(36).slice(2, 8)}`;
  const ring = svg('svg', { class: 'viz stamp-ring', viewBox: `0 0 ${S} ${S}`, 'aria-hidden': 'true' },
    svg('defs', {}, svg('path', { id, d: `M ${c} ${c} m -${r} 0 a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 -${r * 2} 0` })),
    svg('circle', { cx: c, cy: c, r: 144, class: 'st-outer' }),
    svg('circle', { cx: c, cy: c, r: 98, class: 'st-inner' }),
    svg('g', { class: 'st-spin' }, svg('text', { class: 'st-text' }, svg('textPath', { href: `#${id}`, textLength: Math.floor(2 * Math.PI * r) - 4, lengthAdjust: 'spacing' }, ringText))));
  return h('div', { class: 'stamp' }, ring, h('div', { class: 'persona-emoji stamp-emoji' }, emoji));
}
