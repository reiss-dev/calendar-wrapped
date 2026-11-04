// Cloudflare Pages Function: POST /api/portal { token, returnTo } → { url }
// Opens Stripe's billing portal so team-plan customers can change cards or cancel.
import { json, stripe, verify, secretOf } from '../_lib/util.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const value = await verify(body.token, secretOf(env));
  if (!value?.startsWith('sub:')) return json({ error: 'bad_token' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'payments_not_configured' }, 503);
  const returnTo = typeof body.returnTo === 'string' && /^\/(?!\/)[\w\-./]*$/.test(body.returnTo) ? body.returnTo : '/';
  try {
    const sub = await stripe(env, `subscriptions/${encodeURIComponent(value.slice(4))}`);
    const session = await stripe(env, 'billing_portal/sessions', { method: 'POST', form: { customer: sub.customer, return_url: `${new URL(request.url).origin}${returnTo}#team-report` } });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
