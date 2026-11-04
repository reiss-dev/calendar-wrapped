// Cloudflare Pages Function: POST /api/checkout → { url }
// Creates a Stripe Checkout session for the one-off unlock.
// Env vars (Pages → Settings → Environment variables):
//   STRIPE_SECRET_KEY  sk_live_... or sk_test_...
//   STRIPE_PRICE_ID       price_... for the £4 personal unlock
//   STRIPE_TEAM_PRICE_ID  price_... for the £29 team report
//   UNLOCK_SECRET      any long random string, shared with verify.js
export async function onRequestPost({ request, env }) {
  let returnTo = '/';
  let product = 'personal';
  try {
    const body = await request.json();
    if (typeof body.returnTo === 'string' && /^\/(?!\/)[\w\-./]*$/.test(body.returnTo)) returnTo = body.returnTo;
    if (body.product === 'team') product = 'team';
  } catch { /* no body */ }
  const price = product === 'team' ? env.STRIPE_TEAM_PRICE_ID : env.STRIPE_PRICE_ID;
  if (!env.STRIPE_SECRET_KEY || !price) return json({ error: 'payments_not_configured' }, 503);
  const origin = new URL(request.url).origin;
  const back = product === 'team' ? '#team-report' : '#summary';

  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    'metadata[product]': product,
    success_url: `${origin}${returnTo}?session_id={CHECKOUT_SESSION_ID}${back}`,
    cancel_url: `${origin}${returnTo}?checkout=cancelled${back}`,
    'payment_method_types[0]': 'card',
    allow_promotion_codes: 'true',
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json();
  if (!res.ok) return json({ error: data.error?.message || 'stripe_error' }, 502);
  return json({ url: data.url });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
