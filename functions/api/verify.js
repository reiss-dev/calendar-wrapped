// Cloudflare Pages Function: GET /api/verify?session_id=cs_... → { paid, token, product }
// The token is signed. For the team plan it carries the subscription id, so later
// entitlement checks and the billing portal need no database.
import { json, stripe, sign, secretOf } from '../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json({ paid: false, error: 'bad_session' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ paid: false, error: 'payments_not_configured' }, 503);
  let data;
  try { data = await stripe(env, `checkout/sessions/${encodeURIComponent(sessionId)}`); } catch (e) { return json({ paid: false, error: e.message }, 502); }
  const product = data.metadata?.product === 'team' ? 'team' : 'personal';
  const paid = data.payment_status === 'paid' || (product === 'team' && data.status === 'complete' && data.payment_status === 'no_payment_required');
  if (!paid) return json({ paid: false });
  const value = product === 'team' && data.subscription ? `sub:${data.subscription}` : `pay:${sessionId}`;
  return json({ paid: true, product, token: await sign(value, secretOf(env)) });
}
