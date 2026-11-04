// Tiny DOM + formatting helpers. No framework, on purpose.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export const fmt = {
  int: (n) => Math.round(n).toLocaleString('en-GB'),
  num: (n, d = 1) => Number(n).toLocaleString('en-GB', { maximumFractionDigits: d }),
  hours: (n) => (n >= 100 ? fmt.int(n) : fmt.num(n, 1)),
  date: (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  dateLong: (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
  time: (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  weekRange: (start) => {
    const s = new Date(start);
    const e = new Date(s); e.setDate(e.getDate() + 4);
    return `${s.getDate()}–${e.getDate()} ${e.toLocaleDateString('en-GB', { month: 'short' })}`;
  },
  plural: (n, one, many = `${one}s`) => `${fmt.int(n)} ${n === 1 ? one : many}`,
};

const easeOut = (t) => 1 - Math.pow(1 - t, 4);

/** Animate a number from 0 to `to` inside `el`. */
export function countUp(el, to, { duration = 1400, decimals = 0, prefix = '', suffix = '', delay = 0 } = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const render = (v) => { el.textContent = `${prefix}${Number(v).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`; };
  if (reduce || to === 0) { render(to); return; }
  render(0);
  let start = null;
  const step = (ts) => {
    if (start === null) start = ts;
    const t = Math.min(1, (ts - start) / duration);
    render(to * easeOut(t));
    if (t < 1) requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), delay);
}

/** Apply stagger indices to every [data-reveal] descendant so CSS can delay them. */
export function stagger(root, base = 0) {
  root.querySelectorAll('[data-reveal]').forEach((node, i) => {
    node.style.setProperty('--i', String(base + i));
  });
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

export function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function toast(message, { duration = 2600 } = {}) {
  let host = document.querySelector('.toasts');
  if (!host) { host = h('div', { class: 'toasts' }); document.body.append(host); }
  const t = h('div', { class: 'toast', role: 'status' }, message);
  host.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, duration);
}

export function storage(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function store(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}
