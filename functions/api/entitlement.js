// Cloudflare Pages Function: GET /api/entitlement?token=... → { active }
// Checks a team-plan token's subscription is still live in Stripe.
import { json, stripe, verify, secretOf } from '../_lib/util.js';

const LIVE = new Set(['active', 'trialing', 'past_due']);
export async function onRequestGet({ request, env }) {
  const value = await verify(new URL(request.url).searchParams.get('token'), secretOf(env));
  if (!value) return json({ active: false, error: 'bad_token' }, 400);
  if (!value.startsWith('sub:')) return json({ active: true }); // one-off unlocks never expire
  try {
    const sub = await stripe(env, `subscriptions/${encodeURIComponent(value.slice(4))}`);
    return json({ active: LIVE.has(sub.status), status: sub.status });
  } catch (e) {
    return json({ active: true, error: e.message }, 200); // fail open: never lock people out on our error
  }
}
