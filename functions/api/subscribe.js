// Cloudflare Pages Function: POST /api/subscribe { email, subscribe, plan, year, locale } → { ok, emailed }
// Emails the visitor their plan. If they ticked the box, remembers the address for a
// quarterly check-in (sent by workers/reminders). The plan is never stored.
// Env: RESEND_API_KEY, MAIL_FROM, UNLOCK_SECRET. Binding: SUBSCRIBERS (KV).
import { json, sign, secretOf } from '../_lib/util.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const LOCALES = new Set(['en', 'nl', 'sv', 'nb', 'da']);

export async function unsubscribeLink(origin, email, env) {
  return `${origin}/api/unsubscribe?t=${encodeURIComponent(await sign(`unsub:${email}`, secretOf(env)))}`;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const plan = String(body.plan || '').slice(0, 6000);
  const year = Number(body.year) || new Date().getFullYear();
  const locale = LOCALES.has(body.locale) ? body.locale : 'en';
  if (!EMAIL.test(email)) return json({ ok: false, error: 'bad_email' }, 400);
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return json({ ok: false, error: 'not_configured' }, 503);

  const origin = new URL(request.url).origin;
  const subscribed = body.subscribe === true && !!env.SUBSCRIBERS;
  const footer = subscribed ? `\n\n—\nYou'll get a short check-in each quarter. Stop any time: ${await unsubscribeLink(origin, email, env)}` : '';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject: `Your ${year} reclaim plan`, text: plan + footer }),
  });
  if (!res.ok) return json({ ok: false, error: 'send_failed' }, 502);

  // Only the address, date, year and language are kept. Never the plan.
  if (subscribed) await env.SUBSCRIBERS.put(`sub:${email}`, JSON.stringify({ at: new Date().toISOString(), year, locale, consent: 'quarterly' }));
  return json({ ok: true, emailed: true });
}
