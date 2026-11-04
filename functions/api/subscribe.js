// Cloudflare Pages Function: POST /api/subscribe { email, subscribe, plan, year } → { ok, emailed }
// Emails the visitor their plan, and (only if they ticked the box) remembers the address
// for a single January check-in. The plan text is the only calendar-derived data that
// ever reaches a server, and only because the visitor asked for it.
// Env: RESEND_API_KEY + MAIL_FROM (e.g. "Calendar Wrapped <hello@yourdomain>") to send.
// Binding: SUBSCRIBERS (KV namespace) to keep January opt-ins. Both optional.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const plan = String(body.plan || '').slice(0, 6000);
  const year = Number(body.year) || new Date().getFullYear();
  if (!EMAIL.test(email)) return json({ ok: false, error: 'bad_email' }, 400);
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return json({ ok: false, error: 'not_configured' }, 503);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject: `Your ${year} reclaim plan`, text: plan }),
  });
  if (!res.ok) return json({ ok: false, error: 'send_failed' }, 502);

  // Only the address, date and year are kept. Never the plan.
  if (body.subscribe === true && env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put(`sub:${email}`, JSON.stringify({ at: new Date().toISOString(), year, consent: 'january-checkin' }));
  }
  return json({ ok: true, emailed: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
