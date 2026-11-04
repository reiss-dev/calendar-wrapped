// Funnel counters without tracking: one event name per beacon, no cookies, no IDs,
// no URLs, no calendar data. See functions/api/hit.js for the allowed names.
import { CONFIG } from './config.js';

const sentOnce = new Set();
export function track(name, { once = false } = {}) {
  if (!CONFIG.analytics || location.protocol === 'file:') return;
  if (once) { if (sentOnce.has(name)) return; sentOnce.add(name); }
  try {
    if (navigator.sendBeacon && navigator.sendBeacon('/api/hit', name)) return;
    fetch('/api/hit', { method: 'POST', body: name, keepalive: true }).catch(() => {});
  } catch { /* never let analytics break the app */ }
}
