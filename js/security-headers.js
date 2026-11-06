// Security headers for every page. The Content Security Policy is the technical version of the
// privacy promise: the browser may only talk to this site, and to Google or Microsoft when someone
// chooses to sign in with them. A page that tried to send a calendar anywhere else would be blocked
// by the browser itself. Static files get these from _headers (written by tools/make-headers.js);
// pages the server builds (share links) add them in code. One source, so they can't drift.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://graph.microsoft.com https://login.microsoftonline.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Strict-Transport-Security': 'max-age=31536000',
};

/** Adds the headers to a response the server built itself, keeping any it already set. */
export function withSecurityHeaders(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}
