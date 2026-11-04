// Small helpers shared by the Pages Functions and the reminders Worker.
export const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** "value.signature", so tokens can be checked without a database. */
export async function sign(value, secret) { return `${value}.${await hmac(value, secret)}`; }
export async function verify(token, secret) {
  const i = String(token || '').lastIndexOf('.');
  if (i < 1) return null;
  const value = token.slice(0, i), sig = token.slice(i + 1);
  const expect = await hmac(value, secret);
  if (sig.length !== expect.length) return null;
  let diff = 0;
  for (let k = 0; k < sig.length; k++) diff |= sig.charCodeAt(k) ^ expect.charCodeAt(k);
  return diff === 0 ? value : null;
}
export const secretOf = (env) => env.UNLOCK_SECRET || env.STRIPE_SECRET_KEY || '';

export async function stripe(env, path, { method = 'GET', form } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || 'stripe_error'), { status: res.status });
  return data;
}

/** Push one log line to Grafana Cloud Loki. Optional: does nothing without LOKI_URL. */
export function loki(env, labels, line) {
  if (!env.LOKI_URL || !env.LOKI_USER || !env.LOKI_TOKEN) return Promise.resolve();
  const body = JSON.stringify({ streams: [{ stream: { app: env.LOKI_APP || 'calendar-wrapped', ...labels }, values: [[`${Date.now()}000000`, typeof line === 'string' ? line : JSON.stringify(line)]] }] });
  return fetch(`${env.LOKI_URL.replace(/\/$/, '')}/loki/api/v1/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Basic ${btoa(`${env.LOKI_USER}:${env.LOKI_TOKEN}`)}` },
    body,
  }).catch(() => {});
}

export const CURRENCIES = new Set(['gbp', 'eur', 'sek', 'nok', 'dkk']);
