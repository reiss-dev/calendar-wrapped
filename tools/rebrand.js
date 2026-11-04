#!/usr/bin/env node
// Rename the product everywhere in one go.
//   node tools/rebrand.js "Meeting Year" meetingyear.app
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [name, domain] = process.argv.slice(2);
if (!name || !domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
  console.error('Usage: node tools/rebrand.js "New Name" newdomain.com');
  process.exit(1);
}
const config = readFileSync(join(root, 'js/config.js'), 'utf8');
const oldName = /name:\s*'([^']+)'/.exec(config)[1];
const oldDomain = /domain:\s*'([^']+)'/.exec(config)[1];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pairs = [[oldName, name], [oldDomain, domain], [slug(oldName), slug(name)]];
const files = ['index.html', 'privacy.html', 'diagnose.html', 'js/config.js', 'js/app.js', 'js/story.js', 'js/card.js', 'js/slides.js', 'functions/api/subscribe.js', 'functions/_lib/util.js', 'workers/reminders/index.js', 'workers/reminders/wrangler.toml', 'grafana/dashboard.json', 'tools/serve.js', 'README.md', 'LAUNCH.md', 'package.json'];
let changed = 0;
for (const f of files) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  const before = readFileSync(p, 'utf8');
  let after = before;
  for (const [a, b] of pairs) after = after.split(a).join(b);
  if (after !== before) { writeFileSync(p, after); changed++; console.log(`updated ${f}`); }
}
console.log(`${oldName} (${oldDomain}) → ${name} (${domain}) in ${changed} files. Regenerate og.png with: npm run og`);
