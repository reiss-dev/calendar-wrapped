import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scrubMessage } from '../js/scrub.js';
import { CSP, SECURITY_HEADERS, withSecurityHeaders } from '../js/security-headers.js';
import { headersFile } from '../tools/make-headers.js';
import { swSource, precacheList } from '../tools/make-sw.js';
import * as hit from '../functions/api/hit.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('error messages lose anything that could be calendar text', () => {
  const cases = [
    ['invalid line (no token ";" or ":") "Board meeting: Project Falcon acquisition"', ['Falcon', 'Board']],
    ["Invalid parameters in 'ATTENDEE;CN=Jane Smith:mailto:jane@acme.com'", ['Jane', 'acme']],
    ['Failed to fetch https://graph.microsoft.com/v1.0/me/events?x=1', ['graph', 'events']],
    ['Could not parse event: Salary review with Tom', ['Salary', 'Tom']],
    ['Mail to ceo@bigco.com bounced', ['ceo', 'bigco']],
    ['Quota exceeded: 5242880 bytes', ['5242880']],
  ];
  for (const [input, gone] of cases) {
    const out = scrubMessage(input);
    for (const g of gone) assert.ok(!out.includes(g), `${JSON.stringify(out)} still has ${g}`);
    assert.ok(out.length <= 100);
  }
  assert.equal(scrubMessage("Cannot read properties of undefined (reading 'x')").startsWith('Cannot read properties of undefined'), true, 'the useful part stays');
});

test('the server scrubs error reports again before logging them', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(String(init?.body || '')); return new Response(null, { status: 204 }); };
  try {
    const env = { LOKI_URL: 'https://loki.example', LOKI_USER: 'u', LOKI_TOKEN: 't' };
    const body = JSON.stringify({ e: 'error', m: 'ParserError: invalid line "Acquisition of Contoso – strictly confidential"', f: 'js/ics.js:12:4' });
    await hit.onRequestPost({ request: new Request('https://x.app/api/hit', { method: 'POST', body }), env, waitUntil: (p) => p });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(sent.length, 1);
    assert.ok(!/Contoso|confidential|Acquisition/.test(sent[0]), sent[0]);
  } finally { globalThis.fetch = realFetch; }
});

test('security headers: one source, written to _headers, shown on the security page', () => {
  assert.equal(read('_headers'), headersFile(), 'run: node tools/make-headers.js');
  assert.ok(read('security.html').includes(CSP), 'the security page shows the policy the site sends');
  assert.match(CSP, /connect-src 'self' https:\/\/www\.googleapis\.com/);
  assert.ok(!/connect-src[^;]*\*/.test(CSP), 'no wildcard destinations');
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'no-referrer');
  const res = withSecurityHeaders(new Response('x', { headers: { 'content-type': 'text/html' } }));
  assert.equal(res.headers.get('Content-Security-Policy'), CSP);
  assert.equal(res.headers.get('content-type'), 'text/html');
});

test('no inline scripts anywhere, so the policy needs no exceptions', () => {
  for (const page of ['index.html', 'privacy.html', 'security.html', 'diagnose.html', 'auth-callback.html']) {
    const html = read(page);
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    assert.equal(inline.length, 0, `${page} has an inline script`);
    assert.ok(!/\son[a-z]+="/i.test(html), `${page} has an inline event handler`);
  }
});

test('request logging is off in the Worker config', () => {
  assert.match(read('wrangler.jsonc'), /"observability": \{ "enabled": false \}/);
});

test('the offline copy covers every app file and is current', () => {
  assert.equal(read('sw.js'), swSource(), 'run: node tools/make-sw.js');
  const list = precacheList();
  for (const f of ['index.html', 'styles.css', 'js/app.js', 'js/worker.js', 'js/geo/places.js', 'vendor/ical.js', 'fonts/bricolage-latin.woff2', 'sample/work.ics']) assert.ok(list.includes(f), f);
  assert.ok(!list.some((f) => /^(functions|tests|tools|worker)\//.test(f)), 'server code and tests are not part of it');
  assert.match(read('sw.js'), /\(api\|c\|og\)/, 'server routes are never cached');
});

test('results on the device: 30 days, private mode, start over', async () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
  const local = mem(), session = mem();
  globalThis.window = { localStorage: local, sessionStorage: session };
  try {
    const v = await import('../js/vault.js');
    assert.equal(v.remembering(), true, 'kept by default');
    v.keep('cw:stats', '{"a":1}');
    assert.equal(v.recall('cw:stats'), '{"a":1}');
    assert.ok(local.m.has('cw:stats'));
    // Older than 30 days: cleared on read.
    local.setItem('cw:stats', JSON.stringify({ at: Date.now() - 31 * 86400000, v: '{"old":1}' }));
    assert.equal(v.recall('cw:stats'), null);
    assert.ok(!local.m.has('cw:stats'));
    // Private mode moves what's there into this tab only.
    v.keep('cw:team', '{"t":1}');
    v.setRemembering(false);
    assert.ok(!local.m.has('cw:team') && session.m.has('cw:team'));
    v.keep('cw:stats', '{"b":2}');
    assert.ok(!local.m.has('cw:stats') && session.m.has('cw:stats'));
    // Start over clears every result, from both places.
    local.setItem('cw:extras', 'x'); local.setItem('cw:unlock', 'paid');
    v.forgetAll();
    for (const k of v.RESULT_KEYS) assert.ok(!local.m.has(k) && !session.m.has(k), k);
    assert.ok(local.m.has('cw:unlock'), 'a purchase is not a result');
  } finally { delete globalThis.window; }
});

test('the stylesheets are well formed: every brace closes, none too many', () => {
  for (const file of ['styles.css']) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    let depth = 0;
    css.split('\n').forEach((line, i) => {
      for (const ch of line) { if (ch === '{') depth++; if (ch === '}') depth--; }
      assert.ok(depth >= 0, `${file}: a stray } around line ${i + 1}`);
    });
    assert.equal(depth, 0, `${file}: unclosed {`);
  }
});
