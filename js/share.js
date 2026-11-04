// Shareable links. The card model is packed into the URL fragment, which browsers never
// send to a server, so a shared card needs no backend and stores nothing anywhere.
import { sanitizeModel } from './card.js';

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export function encodeModel(model) {
  return b64url(new TextEncoder().encode(JSON.stringify(model)));
}

export function decodeModel(token) {
  try { return sanitizeModel(JSON.parse(new TextDecoder().decode(unb64url(token)))); } catch { return null; }
}

export function shareUrl(model, origin = location.origin + location.pathname) {
  return `${origin}#c=${encodeModel(model)}`;
}

export function readSharedFromHash(hash = location.hash) {
  const m = /^#c=([A-Za-z0-9_-]+)$/.exec(hash || '');
  return m ? decodeModel(m[1]) : null;
}
