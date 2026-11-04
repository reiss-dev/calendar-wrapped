// Cloudflare Pages Function: privacy-friendly funnel counters.
// POST /api/hit with a plain-text event name → 204. No cookies, no IPs, no IDs stored:
// just a per-day count per event in the COUNTERS KV namespace.
// GET /api/hit?token=STATS_TOKEN → { days: { "2026-12-01": { story_started: 12, ... } }, totals: {...} }
const EVENTS = new Set([
  'file_loaded', 'demo_loaded', 'google_connected', 'story_started', 'story_finished',
  'card_saved', 'card_shared', 'link_copied', 'slide_shared', 'shared_link_opened', 'shared_cta',
  'unlock_opened', 'unlock_paid', 'plan_emailed', 'team_started', 'team_built',
]);

export async function onRequestPost({ request, env }) {
  const name = (await request.text()).trim().slice(0, 40);
  if (!EVENTS.has(name) || !env.COUNTERS) return new Response(null, { status: 204 });
  const key = `d:${new Date().toISOString().slice(0, 10)}:${name}`;
  // KV is eventually consistent, so counts can be off by one under bursts. Fine for a funnel.
  const cur = Number(await env.COUNTERS.get(key)) || 0;
  await env.COUNTERS.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 400 });
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
