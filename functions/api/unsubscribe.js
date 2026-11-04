// Cloudflare Pages Function: GET /api/unsubscribe?t=<signed> → deletes the address, shows a page.
import { verify, secretOf } from '../_lib/util.js';

const page = (msg) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><style>body{font:18px -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#1d1d1f}@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}}</style><p>${msg}</p>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });

export async function onRequestGet({ request, env }) {
  const value = await verify(new URL(request.url).searchParams.get('t'), secretOf(env));
  if (!value?.startsWith('unsub:')) return page('That link doesn’t look right. Reply to any of our emails and we’ll remove you.');
  await env.SUBSCRIBERS?.delete(`sub:${value.slice(6)}`);
  return page('Done. You won’t hear from us again.');
}
