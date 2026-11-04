// Cloudflare Pages Function: GET /api/verify?session_id=cs_... → { paid, token }
// Confirms the Checkout session was paid and returns a signed token the page stores locally.
export async function onRequestGet({ request, env }) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json({ paid: false, error: 'bad_session' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ paid: false, error: 'payments_not_configured' }, 503);

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) return json({ paid: false, error: data.error?.message || 'stripe_error' }, 502);
  const paid = data.payment_status === 'paid';
  if (!paid) return json({ paid: false });
  const token = await sign(sessionId, env.UNLOCK_SECRET || env.STRIPE_SECRET_KEY);
  return json({ paid: true, token, product: data.metadata?.product === 'team' ? 'team' : 'personal' });
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return `${value}.${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
