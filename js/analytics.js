// Funnel counters, front-end errors and Core Web Vitals without tracking:
// no cookies, no IDs, no URLs, no calendar data. See functions/api/hit.js.
import { CONFIG } from './config.js';
import { scrubMessage } from './scrub.js';

const sentOnce = new Set();
const enabled = () => CONFIG.analytics && typeof location !== 'undefined' && location.protocol !== 'file:';

function beacon(body, type = 'text/plain') {
  try {
    const blob = new Blob([body], { type });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/hit', blob)) return;
    fetch('/api/hit', { method: 'POST', body, headers: { 'content-type': type }, keepalive: true }).catch(() => {});
  } catch { /* never let analytics break the app */ }
}

export function track(name, { once = false } = {}) {
  if (!enabled()) return;
  if (once) { if (sentOnce.has(name)) return; sentOnce.add(name); }
  beacon(name);
}

// Errors: the error's shape (never its quoted content) and the first frame of our own code. Capped per page.
let errorCount = 0;
function reportError(message, stack = '', name = '') {
  if (!enabled() || errorCount++ >= 5) return;
  const frame = (String(stack).split('\n').find((l) => /\/js\/[\w-]+\.js/.test(l)) || '').replace(/.*\/(js\/[\w-]+\.js:\d+:\d+).*/, '$1').slice(0, 80);
  const kind = /^[A-Za-z]{1,40}$/.test(name) ? `${name}: ` : '';
  beacon(JSON.stringify({ e: 'error', m: `${kind}${scrubMessage(message)}`.slice(0, 120), f: frame }), 'application/json');
}

// Core Web Vitals, sent once when the page is hidden.
function watchVitals() {
  if (!('PerformanceObserver' in window)) return;
  const v = { lcp: 0, cls: 0, inp: 0 };
  const obs = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch { /* unsupported */ } };
  obs('largest-contentful-paint', (e) => { v.lcp = Math.round(e.startTime); });
  obs('layout-shift', (e) => { if (!e.hadRecentInput) v.cls = Math.round((v.cls + e.value) * 1000) / 1000; });
  obs('event', (e) => { if (e.interactionId) v.inp = Math.max(v.inp, Math.round(e.duration)); });
  addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || sentOnce.has('vitals')) return;
    sentOnce.add('vitals');
    if (v.lcp || v.inp) beacon(JSON.stringify({ e: 'vitals', ...v }), 'application/json');
  });
}

export function initMonitoring() {
  if (!enabled()) return;
  addEventListener('error', (e) => reportError(e.error?.message ?? e.message, e.error?.stack, e.error?.name));
  addEventListener('unhandledrejection', (e) => reportError(e.reason?.message || String(e.reason), e.reason?.stack, e.reason?.name));
  watchVitals();
}
