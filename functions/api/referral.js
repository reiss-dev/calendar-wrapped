// Cloudflare Pages Function: unlock by sharing.
// POST { r, v } records that visitor v made their own Wrapped after opening a link from r.
// GET ?r=… → { count, goal, unlocked }.
// Ids are random strings made in the browser. Visitor ids are stored only as salted hashes,
// and each visitor can credit one inviter, once. Nothing else is kept.
// Binding: REFERRALS (KV). Optional: REFERRAL_GOAL (default 3).
import { json } from '../_lib/util.js';

const ID = /^[a-z0-9]{10,24}$/;
const YEAR = 60 * 60 * 24 * 400;
const goalOf = (env) => Math.max(1, Math.min(20, Number(env.REFERRAL_GOAL) || 3));

async function hash(value, env) {
  const salt = env.UNLOCK_SECRET || 'calendar-wrapped';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${value}`));
  return [...new Uint8Array(d).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const readCount = async (env, r) => {
  try { return JSON.parse(await env.REFERRALS.get(`r:${r}`)) || { n: 0, v: [] }; } catch { return { n: 0, v: [] }; }
};

export async function onRequestPost({ request, env }) {
  if (!env.REFERRALS) return json({ error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!ID.test(b?.r || '') || !ID.test(b?.v || '')) return json({ error: 'bad_input' }, 400);
  if (b.r === b.v) return json({ ok: true, counted: false });
  const hv = await hash(b.v, env);
  // One credit per visitor, ever: stops one person crediting everyone they know.
  if (await env.REFERRALS.get(`v:${hv}`)) return json({ ok: true, counted: false });
  const cur = await readCount(env, b.r);
  if (cur.v.includes(hv)) return json({ ok: true, counted: false });
  const next = { n: cur.n + 1, v: [...cur.v, hv].slice(-50) };
  await env.REFERRALS.put(`v:${hv}`, '1', { expirationTtl: YEAR });
  await env.REFERRALS.put(`r:${b.r}`, JSON.stringify(next), { expirationTtl: YEAR });
  return json({ ok: true, counted: true });
}

export async function onRequestGet({ request, env }) {
  if (!env.REFERRALS) return json({ error: 'not_configured' }, 503);
  const r = new URL(request.url).searchParams.get('r') || '';
  if (!ID.test(r)) return json({ error: 'bad_input' }, 400);
  const goal = goalOf(env);
  const { n } = await readCount(env, r);
  return json({ count: Math.min(n, goal), goal, unlocked: n >= goal });
}
