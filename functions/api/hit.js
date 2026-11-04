// Cloudflare Pages Function: privacy-friendly analytics.
// POST text "story_started" → counts a funnel event.
// POST JSON {e:'error', m, f} or {e:'vitals', lcp, cls, inp} → forwarded to Loki only.
// Stores daily totals in KV (COUNTERS) and, if LOKI_* are set, pushes one log line per
// event to Grafana Cloud so the dashboard in grafana/dashboard.json works.
// No cookies, no IPs, no IDs.
// GET /api/hit?token=STATS_TOKEN → { totals, days }
import { loki } from '../_lib/util.js';

export const EVENTS = new Set([
  'file_loaded', 'demo_loaded', 'google_connected', 'microsoft_connected', 'story_started', 'story_finished',
  'card_saved', 'card_shared', 'link_copied', 'slide_shared', 'shared_link_opened', 'shared_cta', 'compare_opened',
  'unlock_opened', 'unlock_paid', 'plan_emailed', 'action_used', 'bench_joined', 'lang_changed', 'team_started', 'team_built',
]);
const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : undefined);

export async function onRequestPost({ request, env, waitUntil }) {
  const raw = (await request.text()).slice(0, 600);
  const later = (p) => (waitUntil ? waitUntil(p) : p);
  if (raw.startsWith('{')) {
    let d; try { d = JSON.parse(raw); } catch { return new Response(null, { status: 204 }); }
    if (d.e === 'error') later(loki(env, { kind: 'error' }, { message: String(d.m || '').slice(0, 160), frame: String(d.f || '').slice(0, 80) }));
    if (d.e === 'vitals') later(loki(env, { kind: 'vitals' }, { lcp: num(d.lcp, 60000), cls: num(d.cls, 10), inp: num(d.inp, 60000) }));
    return new Response(null, { status: 204 });
  }
  const name = raw.trim().slice(0, 40);
  if (!EVENTS.has(name)) return new Response(null, { status: 204 });
  later(loki(env, { kind: 'event', event: name }, name));
  if (env.COUNTERS) {
    const key = `d:${new Date().toISOString().slice(0, 10)}:${name}`;
    const cur = Number(await env.COUNTERS.get(key)) || 0; // KV is eventually consistent; fine for a funnel
    await env.COUNTERS.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 400 });
  }
  return new Response(null, { status: 204 });
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  if (!env.STATS_TOKEN || token !== env.STATS_TOKEN || !env.COUNTERS) return new Response('Not found', { status: 404 });
  const days = {}; const totals = {};
  let cursor;
  do {
    const page = await env.COUNTERS.list({ prefix: 'd:', cursor });
    for (const { name } of page.keys) {
      const [, day, ev] = name.split(':');
      const n = Number(await env.COUNTERS.get(name)) || 0;
      (days[day] ||= {})[ev] = n;
      totals[ev] = (totals[ev] || 0) + n;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return new Response(JSON.stringify({ totals, days }, null, 2), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
