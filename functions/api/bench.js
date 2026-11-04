// Cloudflare Pages Function: anonymous benchmark pool.
// POST { m, y, ...buckets } adds one person's rounded numbers. GET ?m=w&y=2026 → { n, hist }.
// Only coarse buckets are accepted; nothing identifies who sent them.
// Binding: BENCH (KV).
import { json } from '../_lib/util.js';

const SPEC = {
  w: { share: [0, 95, 5], perDay: [0, 10, 0.5], b2b: [0, 100, 5] },
  p: { events: [0, 1000, 25], freeWeekendShare: [0, 95, 5] },
};
const valid = (v, [min, max, step]) => typeof v === 'number' && v >= min && v <= max && Math.abs(v / step - Math.round(v / step)) < 1e-9;

export async function onRequestPost({ request, env }) {
  if (!env.BENCH) return json({ error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const spec = SPEC[b.m];
  const y = Number(b.y);
  if (!spec || !Number.isInteger(y) || y < 2020 || y > 2100) return json({ error: 'bad_input' }, 400);
  for (const [k, s] of Object.entries(spec)) if (!valid(b[k], s)) return json({ error: `bad_${k}` }, 400);
  const bump = async (key) => env.BENCH.put(key, String((Number(await env.BENCH.get(key)) || 0) + 1));
  await bump(`b:${b.m}:${y}:n`);
  for (const k of Object.keys(spec)) await bump(`b:${b.m}:${y}:${k}:${b[k]}`);
  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!env.BENCH) return json({ error: 'not_configured' }, 503);
  const u = new URL(request.url);
  const m = u.searchParams.get('m'), y = Number(u.searchParams.get('y'));
  if (!SPEC[m] || !Number.isInteger(y)) return json({ error: 'bad_input' }, 400);
  const prefix = `b:${m}:${y}:`;
  const hist = {};
  let n = 0, cursor;
  do {
    const page = await env.BENCH.list({ prefix, cursor });
    for (const { name } of page.keys) {
      const c = Number(await env.BENCH.get(name)) || 0;
      const rest = name.slice(prefix.length).split(':');
      if (rest[0] === 'n') n = c; else (hist[rest[0]] ||= {})[rest[1]] = c;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return json({ n, hist }, 200, { 'cache-control': 'public, max-age=300' });
}
