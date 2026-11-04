#!/usr/bin/env node
// Zero-dependency static server for local preview: node tools/serve.js [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ics': 'text/calendar', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain', '.md': 'text/markdown' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Local stand-in for the Pages Functions so the unlock flow can be exercised.
  if (url.pathname === '/api/checkout' || url.pathname === '/api/subscribe') { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"not_configured"}'); return; }
  if (url.pathname === '/api/hit') { res.writeHead(204); res.end(); return; }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
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
