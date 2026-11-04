// A dotted globe with the year's flights, drawn on canvas 2D. No WebGL, no libraries.
// Orthographic projection; land is a precomputed dot grid; routes are great-circle arcs
// lifted off the surface in proportion to distance. The year plays month by month.
import { monthName } from './i18n.js';

const RAD = Math.PI / 180;
let landCache = null;
async function landDots() {
  if (landCache) return landCache;
  const b64 = (await import('./geo/land-dots.js')).default;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ints = new Int16Array(bytes.buffer);
  landCache = new Float32Array(ints.length / 2 * 3);
  for (let i = 0, j = 0; i < ints.length; i += 2, j += 3) {
    const lat = (ints[i] / 10) * RAD, lon = (ints[i + 1] / 10) * RAD;
    landCache[j] = Math.cos(lat) * Math.sin(lon); landCache[j + 1] = Math.sin(lat); landCache[j + 2] = Math.cos(lat) * Math.cos(lon);
  }
  return landCache;
}

const vec = (lat, lon) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Great-circle points between two unit vectors, lifted into an arc. */
function arcPoints(a, b, steps = 64) {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const lift = 0.08 + 0.55 * (omega / Math.PI);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = Math.sin(omega) || 1;
    const k1 = omega ? Math.sin((1 - t) * omega) / s : 1 - t, k2 = omega ? Math.sin(t * omega) / s : t;
    const h = 1 + lift * Math.sin(Math.PI * t);
    pts.push([(a[0] * k1 + b[0] * k2) * h, (a[1] * k1 + b[1] * k2) * h, (a[2] * k1 + b[2] * k2) * h]);
  }
  return pts;
}

function readColours(el) {
  const cs = getComputedStyle(el);
  const v = (n, f) => cs.getPropertyValue(n).trim() || f;
  return { ink: v('--viz-ink', '#ffffff'), base: v('--viz-base', 'rgba(255,255,255,0.2)'), text: v('--viz-text', 'rgba(255,255,255,0.7)'), halo: v('--viz-halo', 'rgba(0,0,0,0.4)') };
}

/**
 * Draw an interactive globe into a canvas.
 * routes: { legs: [{ date, from: {name, lat, lon}, to: {...}, km }], home: {name, lat, lon} }
 * Returns { destroy, replay }.
 */
export async function createGlobe(canvas, routes, { autoplay = true, duration = 5200, interactive = true, labels = 6, manual = false, size: fixed = null } = {}) {
  const dots = await landDots();
  const ctx = canvas.getContext('2d');
  const legs = [...routes.legs].sort((a, b) => new Date(a.date) - new Date(b.date));
  const year = new Date(legs[0]?.date || Date.now()).getFullYear();
  const yearStart = new Date(year, 0, 1).getTime(), yearLen = new Date(year + 1, 0, 1).getTime() - yearStart;
  const paths = legs.map((l) => {
    const t = (new Date(l.date).getTime() - yearStart) / yearLen;
    return { leg: l, at: Math.max(0, Math.min(0.98, t)), pts: arcPoints(vec(l.from.lat, l.from.lon), vec(l.to.lat, l.to.lon)) };
  });
  // Cities ranked by visits, for labels.
  const visits = new Map();
  for (const l of legs) for (const p of [l.from, l.to]) { const k = p.name; visits.set(k, { ...p, n: (visits.get(k)?.n || 0) + 1 }); }
  const labelled = [...visits.values()].sort((a, b) => b.n - a.n).slice(0, labels);
  const home = routes.home;

  // Start facing the middle of the routes, tilted a little so northern routes read well.
  let cx = 0, cy = 0, cz = 0;
  for (const p of visits.values()) { const v = vec(p.lat, p.lon); cx += v[0]; cy += v[1]; cz += v[2]; }
  let lambda = Math.atan2(cx, cz) / RAD;
  let phi = Math.max(-40, Math.min(55, Math.atan2(cy, Math.hypot(cx, cz)) / RAD)) - 8;
  let progress = autoplay && !reduceMotion() ? 0 : 1;
  let started = null, raf = 0, alive = true, dragging = false, lastX = 0, lastY = 0, idle = 0;
  const colours = readColours(canvas);

  function size() {
    const dpr = fixed ? 1 : Math.min(2, devicePixelRatio || 1);
    const w = fixed || canvas.clientWidth || 360, h = fixed || canvas.clientHeight || w;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    return { w: canvas.width, h: canvas.height, dpr };
  }
  function project(v, R, ox, oy) {
    const cl = Math.cos(lambda * RAD), sl = Math.sin(lambda * RAD), cp = Math.cos(phi * RAD), sp = Math.sin(phi * RAD);
    const x1 = v[0] * cl - v[2] * sl, z1 = v[0] * sl + v[2] * cl;
    const y2 = v[1] * cp - z1 * sp, z2 = v[1] * sp + z1 * cp;
    return [ox + x1 * R, oy - y2 * R, z2, Math.hypot(x1, y2)];
  }
  const visible = (p) => p[2] > 0 || p[3] > 1; // in front, or lifted above the horizon

  function draw() {
    const { w, h, dpr } = size();
    const R = Math.min(w, h) * 0.45, ox = w / 2, oy = h / 2 - h * 0.01;
    ctx.clearRect(0, 0, w, h);
    // Sphere
    ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2);
    ctx.fillStyle = colours.base; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
    // Land
    ctx.fillStyle = colours.ink;
    const ds = Math.max(1.1, R / 170) * 1.05;
    for (let i = 0; i < dots.length; i += 3) {
      const p = project([dots[i], dots[i + 1], dots[i + 2]], R, ox, oy);
      if (p[2] <= 0) continue;
      ctx.globalAlpha = 0.18 + 0.5 * p[2];
      ctx.fillRect(p[0] - ds / 2, p[1] - ds / 2, ds, ds);
    }
    ctx.globalAlpha = 1;
    // Routes
    ctx.lineCap = 'round';
    for (const path of paths) {
      const local = Math.max(0, Math.min(1, (progress - path.at) / 0.12));
      if (local <= 0) continue;
      const n = Math.max(2, Math.round(local * (path.pts.length - 1)));
      ctx.strokeStyle = colours.ink;
      ctx.beginPath();
      let pen = false, tip = null;
      for (let i = 0; i < n; i++) {
        const p = project(path.pts[i], R, ox, oy);
        if (!visible(p)) { pen = false; continue; }
        if (pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
        tip = p;
      }
      ctx.lineWidth = Math.max(5, R / 30); ctx.globalAlpha = 0.12; ctx.stroke(); // glow
      ctx.lineWidth = Math.max(1.6, R / 140); ctx.globalAlpha = 0.9; ctx.stroke();
      if (local < 1 && tip) { ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(tip[0], tip[1], Math.max(3, R / 60), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // Cities
    const fs = Math.round(Math.max(11, R / 18));
    ctx.font = `600 ${fs}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Inter, Arial, sans-serif`;
    const placedLabels = [], queued = [];
    const free = (x, y, w, hh) => !placedLabels.some((b) => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + hh > b[1]);
    const order = [...visits.values()].sort((a, b) => (home && b.name === home.name) - (home && a.name === home.name) || b.n - a.n);
    for (const c of order) {
      const p = project(vec(c.lat, c.lon), R, ox, oy);
      if (p[2] <= 0.05) continue;
      const isHome = home && c.name === home.name;
      ctx.fillStyle = colours.ink;
      ctx.beginPath(); ctx.arc(p[0], p[1], isHome ? R / 34 : R / 55, 0, Math.PI * 2); ctx.fill();
      if (isHome) {
        const pulse = (performance.now() / 1400) % 1;
        ctx.globalAlpha = 0.6 * (1 - pulse); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p[0], p[1], R / 34 + pulse * R / 9, 0, Math.PI * 2); ctx.strokeStyle = colours.ink; ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (labelled.includes(c) || isHome) {
        const lw = ctx.measureText(c.name).width, lx = p[0] + R / 22, ly = p[1] - R / 36;
        if (free(lx - 2, ly - fs, lw + 4, fs + 4)) { placedLabels.push([lx - 2, ly - fs, lw + 4, fs + 4]); queued.push([c.name, lx, ly, Math.min(1, p[2] * 3)]); }
      }
    }
    // Labels last, with a halo in the background colour, so dots and arcs never cover them.
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, fs / 3.2); ctx.strokeStyle = colours.halo;
    for (const [text, lx, ly, a] of queued) { ctx.globalAlpha = a; ctx.strokeText(text, lx, ly); ctx.fillStyle = colours.ink; ctx.fillText(text, lx, ly); }
    ctx.globalAlpha = 1;
    // Month while playing
    if (progress < 1) {
      ctx.fillStyle = colours.text; ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(fs * 1.1)}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Inter, Arial, sans-serif`;
      ctx.fillText(monthName(Math.min(11, Math.floor(progress * 12))), ox, h - fs * 0.6);
      ctx.textAlign = 'left';
    }
    void dpr;
  }

  function frame(ts) {
    if (!alive) return;
    if (!canvas.isConnected) { destroy(); return; }
    if (started === null) started = ts;
    if (progress < 1) {
      progress = Math.min(1, (ts - started) / duration);
      // Follow the route being drawn.
      const current = paths.filter((p) => p.at <= progress).at(-1);
      if (current && !dragging) {
        const mid = current.pts[Math.floor(current.pts.length / 2)];
        const target = Math.atan2(mid[0], mid[2]) / RAD;
        let d = ((target - lambda + 540) % 360) - 180;
        lambda += d * 0.03;
      }
    } else if (!dragging && !reduceMotion()) {
      idle++; if (idle > 90) lambda += 0.06;
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  const onDown = (e) => { if (!interactive) return; dragging = true; idle = 0; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); e.stopPropagation(); };
  const onMove = (e) => {
    if (!dragging) return;
    lambda -= (e.clientX - lastX) * 0.35; phi = Math.max(-70, Math.min(70, phi + (e.clientY - lastY) * 0.35));
    lastX = e.clientX; lastY = e.clientY; e.stopPropagation();
  };
  const onUp = () => { dragging = false; idle = 0; }; // let taps reach the story
  if (interactive) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  }
  function destroy() {
    alive = false; cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
  }
  function replay() { progress = reduceMotion() ? 1 : 0; started = null; }
  /** Manual mode (video export): draw the globe at a given point in its playback. */
  function renderAt(p, spin = 0) {
    progress = Math.max(0, Math.min(1, p));
    const current = paths.filter((x) => x.at <= progress).at(-1);
    if (current) { const mid = current.pts[Math.floor(current.pts.length / 2)]; const target = Math.atan2(mid[0], mid[2]) / RAD; lambda += (((target - lambda + 540) % 360) - 180) * 0.08; }
    lambda += spin;
    draw();
  }
  if (manual) { draw(); return { destroy, replay, draw, renderAt }; }
  draw();
  raf = requestAnimationFrame(frame);
  return { destroy, replay, draw, renderAt };
}
