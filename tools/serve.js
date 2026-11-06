#!/usr/bin/env node
// Zero-dependency static server for local preview and the e2e suite: node tools/serve.js [port]
// It stands in for the Cloudflare functions: payments and email report "not configured",
// counters accept and discard, and /c/<token> serves the app like the real card route does.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from '../js/security-headers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.css': 'text/css; charset=utf-8', '.ics': 'text/calendar', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain', '.md': 'text/markdown' };
const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const bench = { n: 0, hist: {} };
const referrals = new Map(), credited = new Set();
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { r(JSON.parse(b)); } catch { r({}); } }); });

createServer(async (req, res) => {
  // Same security headers as production, so the e2e suite runs under the real Content Security Policy.
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (k !== 'Strict-Transport-Security') res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  const p0 = url.pathname;
  if (p0 === '/api/checkout' || p0 === '/api/subscribe' || p0 === '/api/portal') return json(res, 503, { error: 'not_configured' });
  if (p0 === '/api/hit') { res.writeHead(204); res.end(); return; }
  if (p0 === '/api/entitlement') return json(res, 200, { active: true });
  if (p0 === '/api/bench') {
    if (req.method === 'POST') { bench.n++; return json(res, 200, { ok: true }); }
    return json(res, 200, bench);
  }
  if (p0 === '/api/referral') {
    // Same rules as functions/api/referral.js, in memory.
    const ID = /^[a-z0-9]{10,24}$/;
    if (req.method === 'POST') {
      const { r, v } = await readBody(req);
      if (!ID.test(r || '') || !ID.test(v || '')) return json(res, 400, { error: 'bad_input' });
      if (r === v || credited.has(v)) return json(res, 200, { ok: true, counted: false });
      credited.add(v); referrals.set(r, (referrals.get(r) || 0) + 1);
      return json(res, 200, { ok: true, counted: true });
    }
    const r = url.searchParams.get('r') || '';
    if (!ID.test(r)) return json(res, 400, { error: 'bad_input' });
    const n = referrals.get(r) || 0;
    return json(res, 200, { count: Math.min(n, 3), goal: 3, unlocked: n >= 3 });
  }
  if (/^\/c\/[A-Za-z0-9_-]+\/?$/.test(p0)) {
    const html = (await readFile(join(root, 'index.html'), 'utf8')).replace('<head>', '<head>\n  <base href="/" />');
    res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' }); res.end(html); return;
  }
  let p = normalize(decodeURIComponent(p0)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = join(root, p);
  try {
    const st = await stat(file);
    const target = st.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': types[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
  }
}).listen(port, () => console.log(`Calendar Wrapped → http://localhost:${port}`));
