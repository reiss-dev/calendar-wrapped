// Cloudflare Pages Function: POST /api/checkout { product, currency, returnTo } → { url }
// personal: one-off payment. team: monthly subscription.
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_ID (one-off), STRIPE_TEAM_PRICE_ID (monthly).
// Give both prices currency options for GBP, EUR, SEK, NOK and DKK in Stripe.
import { json, stripe, CURRENCIES } from '../_lib/util.js';

export async function onRequestPost({ request, env }) {
  let returnTo = '/', product = 'personal', currency = null;
  try {
    const body = await request.json();
    if (typeof body.returnTo === 'string' && /^\/(?!\/)[\w\-./]*$/.test(body.returnTo)) returnTo = body.returnTo;
    if (body.product === 'team') product = 'team';
    if (CURRENCIES.has(String(body.currency || '').toLowerCase())) currency = body.currency.toLowerCase();
  } catch { /* no body */ }
  const price = product === 'team' ? env.STRIPE_TEAM_PRICE_ID : env.STRIPE_PRICE_ID;
  if (!env.STRIPE_SECRET_KEY || !price) return json({ error: 'payments_not_configured' }, 503);
  const origin = new URL(request.url).origin;
  const back = product === 'team' ? '#team-report' : '#summary';
  const form = {
    mode: product === 'team' ? 'subscription' : 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    'metadata[product]': product,
    success_url: `${origin}${returnTo}?session_id={CHECKOUT_SESSION_ID}${back}`,
    cancel_url: `${origin}${returnTo}?checkout=cancelled${back}`,
    allow_promotion_codes: 'true',
  };
  if (currency) form.currency = currency;
  if (product === 'team') form['subscription_data[metadata][product]'] = 'team';
  try {
    const session = await stripe(env, 'checkout/sessions', { method: 'POST', form });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
