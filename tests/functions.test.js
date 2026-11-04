import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as checkout from '../functions/api/checkout.js';
import * as verify from '../functions/api/verify.js';
import * as subscribe from '../functions/api/subscribe.js';
import * as hit from '../functions/api/hit.js';

let calls = [];
const realFetch = globalThis.fetch;
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const post = (url, body, raw = false) => new Request(url, { method: 'POST', body: raw ? body : JSON.stringify(body), headers: { 'content-type': raw ? 'text/plain' : 'application/json' } });
function kv() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) };
}
beforeEach(() => { globalThis.fetch = realFetch; });

test('checkout picks the team price and tags the session', async () => {
  mockFetch(() => json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
  const env = { STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_ID: 'price_personal', STRIPE_TEAM_PRICE_ID: 'price_team' };
  const res = await checkout.onRequestPost({ request: post('https://x.app/api/checkout', { product: 'team', returnTo: '/' }), env });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('line_items[0][price]'), 'price_team');
  assert.equal(body.get('metadata[product]'), 'team');
  assert.match(body.get('success_url'), /^https:\/\/x\.app\/\?session_id=\{CHECKOUT_SESSION_ID\}#team-report$/);
});

test('checkout rejects odd return paths and reports missing config', async () => {
  mockFetch(() => json({ url: 'u' }));
  const env = { STRIPE_SECRET_KEY: 'sk', STRIPE_PRICE_ID: 'price_p' };
  await checkout.onRequestPost({ request: post('https://x.app/api/checkout', { returnTo: '//evil.com' }), env });
  assert.match(new URLSearchParams(calls[0].init.body).get('success_url'), /^https:\/\/x\.app\/\?/);
  const res = await checkout.onRequestPost({ request: post('https://x.app/api/checkout', { product: 'team' }), env });
  assert.equal(res.status, 503, 'team price not configured');
});

test('verify returns the product for a paid session and refuses bad ids', async () => {
  mockFetch(() => json({ payment_status: 'paid', metadata: { product: 'team' } }));
  const ok = await verify.onRequestGet({ request: new Request('https://x.app/api/verify?session_id=cs_test_abc'), env: { STRIPE_SECRET_KEY: 'sk', UNLOCK_SECRET: 's' } });
  const data = await ok.json();
  assert.equal(data.paid, true);
  assert.equal(data.product, 'team');
  assert.match(data.token, /^cs_test_abc\.[0-9a-f]{64}$/);
  const bad = await verify.onRequestGet({ request: new Request('https://x.app/api/verify?session_id=../../x'), env: { STRIPE_SECRET_KEY: 'sk' } });
  assert.equal(bad.status, 400);
});

test('subscribe sends the plan and stores only the address when opted in', async () => {
  mockFetch(() => json({ id: 'em_1' }));
  const SUBSCRIBERS = kv();
  const env = { RESEND_API_KEY: 're_x', MAIL_FROM: 'CW <hi@x.app>', SUBSCRIBERS };
  const res = await subscribe.onRequestPost({ request: post('https://x.app/api/subscribe', { email: 'Alex@Example.com', subscribe: true, plan: 'PLAN TEXT', year: 2026 }), env });
  assert.deepEqual(await res.json(), { ok: true, emailed: true });
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.to, ['alex@example.com']);
  assert.equal(sent.text, 'PLAN TEXT');
  const stored = JSON.parse(SUBSCRIBERS.m.get('sub:alex@example.com'));
  assert.equal(stored.year, 2026);
  assert.ok(!JSON.stringify(stored).includes('PLAN'), 'the plan is never stored');
  await subscribe.onRequestPost({ request: post('https://x.app/api/subscribe', { email: 'b@example.com', subscribe: false, plan: 'p' }), env });
  assert.ok(!SUBSCRIBERS.m.has('sub:b@example.com'), 'no opt-in, nothing stored');
});

test('subscribe validates email and reports missing config', async () => {
  const bad = await subscribe.onRequestPost({ request: post('https://x.app/api/subscribe', { email: 'nope' }), env: { RESEND_API_KEY: 'k', MAIL_FROM: 'f' } });
  assert.equal(bad.status, 400);
  const none = await subscribe.onRequestPost({ request: post('https://x.app/api/subscribe', { email: 'a@b.co' }), env: {} });
  assert.equal(none.status, 503);
});

test('hit counts known events only, and stats need the token', async () => {
  const COUNTERS = kv();
  const env = { COUNTERS, STATS_TOKEN: 't0ken' };
  for (const ev of ['story_started', 'story_started', 'card_saved', 'not_an_event']) {
    const r = await hit.onRequestPost({ request: post('https://x.app/api/hit', ev, true), env });
    assert.equal(r.status, 204);
  }
  assert.equal(COUNTERS.m.size, 2);
  const denied = await hit.onRequestGet({ request: new Request('https://x.app/api/hit?token=wrong'), env });
  assert.equal(denied.status, 404);
  const ok = await hit.onRequestGet({ request: new Request('https://x.app/api/hit?token=t0ken'), env });
  const data = await ok.json();
  assert.equal(data.totals.story_started, 2);
  assert.equal(data.totals.card_saved, 1);
});
