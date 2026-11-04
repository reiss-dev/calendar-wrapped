// Opt-in benchmarks. Only coarse buckets are sent (see benchmarkBuckets in stats.js),
// once per browser per year, and only after the person taps "Compare with others".
import { benchmarkBuckets, percentileFrom } from './stats.js';
import { storage, store } from './ui.js';

const KEY = 'cw:bench';
export const MIN_SAMPLE = 100; // below this, percentiles are noise

export async function compareWithOthers(stats) {
  const b = benchmarkBuckets(stats);
  const sent = storage(KEY, {});
  const tag = `${b.m}${b.y}`;
  if (!sent[tag]) {
    const res = await fetch('/api/bench', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    if (!res.ok) throw new Error('unavailable');
    store(KEY, { ...sent, [tag]: Date.now() });
  }
  const res = await fetch(`/api/bench?m=${b.m}&y=${b.y}`);
  if (!res.ok) throw new Error('unavailable');
  const data = await res.json();
  const out = { n: data.n || 0, ready: (data.n || 0) >= MIN_SAMPLE, metrics: {} };
  for (const [metric, hist] of Object.entries(data.hist || {})) if (b[metric] != null) out.metrics[metric] = percentileFrom(hist, b[metric]);
  return out;
}
export const alreadyShared = (stats) => { const b = benchmarkBuckets(stats); return !!storage(KEY, {})[`${b.m}${b.y}`]; };
