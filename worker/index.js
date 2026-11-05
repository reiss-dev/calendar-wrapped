// Worker entry point for Cloudflare Workers (with static assets). Routes requests to the same
// handlers Cloudflare Pages runs from functions/, so the project deploys either way:
//   Workers: `npx wrangler deploy` (wrangler.jsonc)      Pages: `functions/` as before
// Static files are served by the assets binding before this runs; only unmatched paths get here.
import * as bench from '../functions/api/bench.js';
import * as checkout from '../functions/api/checkout.js';
import * as entitlement from '../functions/api/entitlement.js';
import * as hit from '../functions/api/hit.js';
import * as portal from '../functions/api/portal.js';
import * as referral from '../functions/api/referral.js';
import * as subscribe from '../functions/api/subscribe.js';
import * as unsubscribe from '../functions/api/unsubscribe.js';
import * as verify from '../functions/api/verify.js';
import * as card from '../functions/c/[token].js';
import * as og from '../functions/og/[token].js';

const API = { bench, checkout, entitlement, hit, portal, referral, subscribe, unsubscribe, verify };

/** Calls a Pages-style module: onRequestGet / onRequestPost / onRequest. */
function call(mod, ctx) {
  const m = ctx.request.method;
  const handler = mod[`onRequest${m.charAt(0)}${m.slice(1).toLowerCase()}`] || mod.onRequest;
  if (!handler) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  return handler(ctx);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const base = { request, env, params: {}, waitUntil: (p) => ctx.waitUntil(p), next: () => env.ASSETS.fetch(request) };
    try {
      let m = /^\/api\/([a-z]+)\/?$/.exec(url.pathname);
      if (m && API[m[1]]) return await call(API[m[1]], base);
      m = /^\/c\/([^/]+)\/?$/.exec(url.pathname);
      if (m) return await call(card, { ...base, params: { token: m[1] } });
      m = /^\/og\/([^/]+)$/.exec(url.pathname);
      if (m) return await call(og, { ...base, params: { token: m[1] } });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
    return env.ASSETS.fetch(request);
  },
};
