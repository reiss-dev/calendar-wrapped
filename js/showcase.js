// Landing page showcase: the real visualisations, drawn with made-up sample data.
import { yearHeatmap, radialClock, bubbles, treemap } from './viz.js';
import { t } from './i18n.js';

let seed = 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function sampleYear(year) {
  const daily = {};
  const now = new Date();
  for (let d = new Date(year, 0, 1); d.getFullYear() === year && d <= now; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    const m = d.getMonth();
    if ((m === 7 && d.getDate() > 8 && d.getDate() < 22) || (m === 3 && d.getDate() < 10)) continue; // holidays
    const k = `${year}-${String(m + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    daily[k] = Math.round((0.5 + rand() * 4 + (wd === 2 ? 1.5 : 0) + (m === 5 ? 1.2 : 0)) * 10) / 10;
  }
  return daily;
}

export function renderShowcase() {
  const root = document.getElementById('showcase');
  if (!root) return;
  seed = 42;
  const year = new Date().getFullYear();
  const put = (id, el) => { const host = document.getElementById(id); if (host) { host.innerHTML = ''; host.append(el); } };
  put('show-heatmap', yearHeatmap(sampleYear(year), year));
  const hours = [0, 0, 0, 0, 0, 0, 0, 2, 9, 22, 31, 24, 8, 18, 27, 25, 19, 9, 3, 1, 0, 0, 0, 0];
  put('show-clock', radialClock(hours.map((count, hour) => ({ hour, count }))));
  put('show-bubbles', bubbles([['Priya Shah', 475], ['Tom Hendricks', 442], ['Daniel Okafor', 424], ['Maja Lindqvist', 300], ['Jonas Berg', 210], ['Sofie de Vries', 160], ['Lucas Meyer', 120], ['Hannah Clarke', 90]].map(([label, value]) => ({ label, value, sub: String(value) })), { max: 8 }));
  put('show-treemap', treemap([['Daily standup', 54], ['Weekly Sync', 44], ['Sprint planning', 44], ['Pipeline review', 43], ['1:1 with Priya', 22], ['Retro', 21], ['All hands', 10]].map(([label, value]) => ({ label, value, sub: t('{h} hrs', { h: value }) })), { H: 260, W: 900 }));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in-view'); }), { threshold: 0.2 }).observe(root);
  } else root.classList.add('in-view');
}
