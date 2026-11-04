import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as checkout from '../functions/api/checkout.js';
import * as verify from '../functions/api/verify.js';
import * as entitlement from '../functions/api/entitlement.js';
import * as portal from '../functions/api/portal.js';
import * as subscribe from '../functions/api/subscribe.js';
import * as unsubscribe from '../functions/api/unsubscribe.js';
import * as bench from '../functions/api/bench.js';
import * as hit from '../functions/api/hit.js';
import * as referral from '../functions/api/referral.js';
import { withCardMeta } from '../functions/c/[token].js';
import { sign, verify as verifyToken } from '../functions/_lib/util.js';
import { run as runReminders } from '../workers/reminders/index.js';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats } from '../js/stats.js';
import { cardModel } from '../js/model.js';
import { encodeModel } from '../js/share.js';

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
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) };
}
const SECRET = { UNLOCK_SECRET: 'test-secret' };
beforeEach(() => { globalThis.fetch = realFetch; });

test('signed tokens verify and reject tampering', async () => {
  const tok = await sign('sub:sub_123', 's');
  assert.equal(await verifyToken(tok, 's'), 'sub:sub_123');
  assert.equal(await verifyToken(tok.replace('123', '124'), 's'), null);
  assert.equal(await verifyToken(tok, 'other'), null);
  assert.equal(await verifyToken('nonsense', 's'), null);
});

test('checkout: team is a subscription in the visitor’s currency', async () => {
  mockFetch(() => json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
  const env = { STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_ID: 'price_personal', STRIPE_TEAM_PRICE_ID: 'price_team' };
  const res = await checkout.onRequestPost({ request: post('https://x.app/api/checkout', { product: 'team', currency: 'SEK', returnTo: '/' }), env });
  assert.equal(res.status, 200);
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('mode'), 'subscription');
  assert.equal(body.get('line_items[0][price]'), 'price_team');
  assert.equal(body.get('currency'), 'sek');
  assert.equal(body.get('subscription_data[metadata][product]'), 'team');
  assert.match(body.get('success_url'), /#team-report$/);
  await checkout.onRequestPost({ request: post('https://x.app/api/checkout', { product: 'personal', currency: 'xyz', returnTo: '//evil.com' }), env });
  const b2 = new URLSearchParams(calls[1].init.body);
  assert.equal(b2.get('mode'), 'payment');
  assert.equal(b2.get('currency'), null, 'unknown currencies are ignored');
  assert.match(b2.get('success_url'), /^https:\/\/x\.app\/\?/);
  const none = await checkout.onRequestPost({ request: post('https://x.app/api/checkout', { product: 'team' }), env: { STRIPE_SECRET_KEY: 'sk' } });
  assert.equal(none.status, 503);
});

test('verify: team sessions carry the subscription id in a signed token', async () => {
  mockFetch(() => json({ payment_status: 'paid', status: 'complete', subscription: 'sub_ABC', metadata: { product: 'team' } }));
  const res = await verify.onRequestGet({ request: new Request('https://x.app/api/verify?session_id=cs_test_abc'), env: { STRIPE_SECRET_KEY: 'sk', ...SECRET } });
  const data = await res.json();
  assert.equal(data.product, 'team');
  assert.equal(await verifyToken(data.token, 'test-secret'), 'sub:sub_ABC');
  const bad = await verify.onRequestGet({ request: new Request('https://x.app/api/verify?session_id=../../x'), env: { STRIPE_SECRET_KEY: 'sk' } });
  assert.equal(bad.status, 400);
});

test('entitlement: live subscriptions pass, cancelled ones don’t, errors fail open', async () => {
  const env = { STRIPE_SECRET_KEY: 'sk', ...SECRET };
  const token = await sign('sub:sub_ABC', 'test-secret');
  mockFetch(() => json({ status: 'active' }));
  assert.equal((await (await entitlement.onRequestGet({ request: new Request(`https://x.app/api/entitlement?token=${token}`), env })).json()).active, true);
  mockFetch(() => json({ status: 'canceled' }));
  assert.equal((await (await entitlement.onRequestGet({ request: new Request(`https://x.app/api/entitlement?token=${token}`), env })).json()).active, false);
  mockFetch(() => json({ error: { message: 'down' } }, 500));
  assert.equal((await (await entitlement.onRequestGet({ request: new Request(`https://x.app/api/entitlement?token=${token}`), env })).json()).active, true);
  const forged = await entitlement.onRequestGet({ request: new Request('https://x.app/api/entitlement?token=sub:sub_ABC.deadbeef'), env });
  assert.equal(forged.status, 400);
});

test('portal opens a billing session for the token’s customer', async () => {
  mockFetch((url) => (url.includes('/subscriptions/') ? json({ customer: 'cus_1' }) : json({ url: 'https://billing.stripe.com/p/session_1' })));
  const token = await sign('sub:sub_ABC', 'test-secret');
  const res = await portal.onRequestPost({ request: post('https://x.app/api/portal', { token, returnTo: '/' }), env: { STRIPE_SECRET_KEY: 'sk', ...SECRET } });
  assert.equal((await res.json()).url, 'https://billing.stripe.com/p/session_1');
  assert.equal(new URLSearchParams(calls[1].init.body).get('customer'), 'cus_1');
});

test('subscribe sends the plan with an unsubscribe link and stores only the address', async () => {
  mockFetch(() => json({ id: 'em_1' }));
  const SUBSCRIBERS = kv();
  const env = { RESEND_API_KEY: 're_x', MAIL_FROM: 'CW <hi@x.app>', SUBSCRIBERS, ...SECRET };
  const res = await subscribe.onRequestPost({ request: post('https://x.app/api/subscribe', { email: 'Alex@Example.com', subscribe: true, plan: 'PLAN TEXT', year: 2026, locale: 'nl' }), env });
  assert.deepEqual(await res.json(), { ok: true, emailed: true });
  const sent = JSON.parse(calls[0].init.body);
  assert.match(sent.text, /^PLAN TEXT/);
  const link = /https:\/\/x\.app\/api\/unsubscribe\?t=\S+/.exec(sent.text)[0];
  const stored = JSON.parse(SUBSCRIBERS.m.get('sub:alex@example.com'));
  assert.equal(stored.consent, 'quarterly');
  assert.equal(stored.locale, 'nl');
  assert.ok(!JSON.stringify(stored).includes('PLAN'), 'the plan is never stored');
  const page = await unsubscribe.onRequestGet({ request: new Request(link), env });
  assert.match(await page.text(), /Done/);
  assert.ok(!SUBSCRIBERS.m.has('sub:alex@example.com'));
  const forged = await unsubscribe.onRequestGet({ request: new Request('https://x.app/api/unsubscribe?t=unsub:b@x.co.00'), env: { SUBSCRIBERS, ...SECRET } });
  assert.match(await forged.text(), /doesn’t look right/);
});

test('benchmarks accept only valid buckets and return histograms', async () => {
  const BENCH = kv();
  const env = { BENCH };
  for (const share of [20, 25, 25, 40]) {
    const r = await bench.onRequestPost({ request: post('https://x.app/api/bench', { m: 'w', y: 2026, share, perDay: 2.5, b2b: 10 }), env });
    assert.equal(r.status, 200);
  }
  assert.equal((await bench.onRequestPost({ request: post('https://x.app/api/bench', { m: 'w', y: 2026, share: 23, perDay: 2.5, b2b: 10 }), env })).status, 400, 'not a 5% bucket');
  assert.equal((await bench.onRequestPost({ request: post('https://x.app/api/bench', { m: 'x', y: 2026 }), env })).status, 400);
  const data = await (await bench.onRequestGet({ request: new Request('https://x.app/api/bench?m=w&y=2026'), env })).json();
  assert.equal(data.n, 4);
  assert.deepEqual(data.hist.share, { 20: 1, 25: 2, 40: 1 });
});

test('referrals: unique visitors only, one inviter each, unlock at the goal', async () => {
  const env = { REFERRALS: kv(), ...SECRET };
  const r = 'inviter00001', send = (v, who = r) => referral.onRequestPost({ request: post('https://x.app/api/referral', { r: who, v }), env }).then((x) => x.json());
  const progress = () => referral.onRequestGet({ request: new Request(`https://x.app/api/referral?r=${r}`), env }).then((x) => x.json());
  assert.deepEqual(await progress(), { count: 0, goal: 3, unlocked: false });
  assert.equal((await send('friend000001')).counted, true);
  assert.equal((await send('friend000001')).counted, false, 'same visitor twice');
  assert.equal((await send(r)).counted, false, 'self-referral');
  assert.equal((await send('friend000001', 'inviter00002')).counted, false, 'a visitor credits one inviter only');
  assert.equal((await send('friend000002')).counted, true);
  assert.deepEqual(await progress(), { count: 2, goal: 3, unlocked: false });
  await send('friend000003'); await send('friend000004');
  assert.deepEqual(await progress(), { count: 3, goal: 3, unlocked: true });
  assert.ok(![...env.REFERRALS.m.keys(), ...env.REFERRALS.m.values()].some((x) => String(x).includes('friend0000')), 'visitor ids are stored hashed');
  assert.equal((await referral.onRequestPost({ request: post('https://x.app/api/referral', { r: 'BAD!', v: 'friend000009' }), env })).status, 400);
  assert.equal((await referral.onRequestGet({ request: new Request('https://x.app/api/referral?r=x'), env })).status, 400);
  assert.equal((await referral.onRequestGet({ request: new Request(`https://x.app/api/referral?r=${r}`), env: {} })).status, 503);
});

test('hit counts known events, forwards to Loki, and keeps stats private', async () => {
  mockFetch(() => new Response(null, { status: 204 }));
  const COUNTERS = kv();
  const env = { COUNTERS, STATS_TOKEN: 't0ken', LOKI_URL: 'https://logs.grafana.net', LOKI_USER: '123', LOKI_TOKEN: 'glc' };
  for (const ev of ['story_started', 'story_started', 'card_saved', 'not_an_event']) assert.equal((await hit.onRequestPost({ request: post('https://x.app/api/hit', ev, true), env })).status, 204);
  await hit.onRequestPost({ request: post('https://x.app/api/hit', JSON.stringify({ e: 'vitals', lcp: 1800, cls: 0.02, inp: 90 }), true), env });
  await hit.onRequestPost({ request: post('https://x.app/api/hit', JSON.stringify({ e: 'error', m: 'x is undefined', f: 'js/app.js:1:2' }), true), env });
  assert.equal(COUNTERS.m.size, 2);
  const pushes = calls.filter((c) => c.url.endsWith('/loki/api/v1/push')).map((c) => JSON.parse(c.init.body).streams[0]);
  assert.equal(pushes.length, 5, '3 events + vitals + error');
  assert.deepEqual(pushes[0].stream, { app: 'calendar-wrapped', kind: 'event', event: 'story_started' });
  assert.equal(pushes[3].stream.kind, 'vitals');
  assert.equal(JSON.parse(pushes[3].values[0][1]).lcp, 1800);
  assert.match(calls[0].init.headers.Authorization, /^Basic /);
  assert.equal((await hit.onRequestGet({ request: new Request('https://x.app/api/hit?token=wrong'), env })).status, 404);
  const data = await (await hit.onRequestGet({ request: new Request('https://x.app/api/hit?token=t0ken'), env })).json();
  assert.equal(data.totals.story_started, 2);
});

test('card page carries per-card link-preview tags', () => {
  const y = 2026, range = { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y + 1, 0, 1) };
  const { events, meta } = parseICS(readFileSync(new URL('../sample/work.ics', import.meta.url), 'utf8'), range);
  const model = cardModel(computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta), now: new Date(y, 10, 4) }), { who: 'Alex' });
  const token = encodeModel(model);
  const html = withCardMeta(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { origin: 'https://x.app', token, model });
  assert.match(html, /<base href="\/" \/>/);
  assert.ok(html.includes(`<meta property="og:image" content="https://x.app/og/${token}.png" />`));
  assert.match(html, /<meta property="og:title" content="[^"]*Alex’s 2026[^"]*"/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/x\.app\/og\//);
  assert.equal((html.match(/og:image"/g) || []).length, 1, 'replaced, not duplicated');
});

test('reminders: quarterly, localised, rate-limited, with team subscribers from Stripe', async () => {
  const sent = [];
  mockFetch((url, init) => {
    if (url.includes('api.resend.com')) { sent.push(JSON.parse(init.body)); return json({ id: 'e' }); }
    if (url.includes('/subscriptions?')) return json({ data: [{ id: 'sub_1', customer: { email: 'lead@team.co', preferred_locales: ['sv-SE'] } }], has_more: false });
    return json({}, 404);
  });
  const SUBSCRIBERS = kv();
  await SUBSCRIBERS.put('sub:a@x.co', JSON.stringify({ locale: 'en' }));
  await SUBSCRIBERS.put('sub:b@x.co', JSON.stringify({ locale: 'en', lastSent: '2026-10-20T00:00:00Z' }));
  const env = { SUBSCRIBERS, RESEND_API_KEY: 'k', MAIL_FROM: 'f', SITE_URL: 'https://x.app', STRIPE_SECRET_KEY: 'sk', STRIPE_TEAM_PRICE_ID: 'price_team', ...SECRET };
  const r = await runReminders(env, { now: new Date('2026-11-04T08:00:00Z') });
  assert.deepEqual(r, { personal: 1, team: 1, skipped: 1, failed: 0 });
  assert.deepEqual(sent.map((m) => m.to[0]).sort(), ['a@x.co', 'lead@team.co']);
  assert.match(sent.find((m) => m.to[0] === 'a@x.co').text, /api\/unsubscribe\?t=/);
  const again = await runReminders(env, { now: new Date('2026-11-05T08:00:00Z') });
  assert.equal(again.personal + again.team, 0, 'never twice within 60 days');
});
