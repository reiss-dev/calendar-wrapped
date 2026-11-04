// Shareable links. A card link is /c/<token>, where the token is the card model in base64url.
// The server reads it only to draw the preview image for link unfurls, and stores nothing.
// Older #c=<token> links still open.
import { sanitizeModel } from './model.js';

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const TOKEN = '[A-Za-z0-9_-]{20,1600}';

export const encodeModel = (model) => b64url(new TextEncoder().encode(JSON.stringify(model)));
export function decodeModel(token) {
  try { return sanitizeModel(JSON.parse(new TextDecoder().decode(unb64url(token)))); } catch { return null; }
}

/** Site root, also when the page itself lives under /c/<token>. */
export const siteRoot = (loc = location) => `${loc.origin}${loc.pathname.replace(/\/c\/[^/]*$/, '/').replace(/[^/]*$/, '')}`;

export const shareUrl = (model, root = siteRoot()) => `${root}c/${encodeModel(model)}`;
export const compareUrl = (mine, theirs, root = siteRoot()) => `${root}#vs=${encodeModel(mine)}.${encodeModel(theirs)}`;

/** What the current address is asking us to show: a shared card, a comparison, or nothing. */
export function readShared(loc = location) {
  const path = new RegExp(`/c/(${TOKEN})/?$`).exec(loc.pathname);
  if (path) { const m = decodeModel(path[1]); return m ? { type: 'card', model: m, token: path[1] } : null; }
  const hash = new RegExp(`^#c=(${TOKEN})$`).exec(loc.hash || '');
  if (hash) { const m = decodeModel(hash[1]); return m ? { type: 'card', model: m, token: hash[1] } : null; }
  const vs = new RegExp(`^#vs=(${TOKEN})\\.(${TOKEN})$`).exec(loc.hash || '');
  if (vs) { const a = decodeModel(vs[1]), b = decodeModel(vs[2]); return a && b ? { type: 'compare', a, b } : null; }
  return null;
}
