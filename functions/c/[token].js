// Cloudflare Pages Function: GET /c/<token> → the app, with link-preview tags for this card.
// Crawlers (LinkedIn, Slack, iMessage…) read the tags; people get the normal page, which
// reads the token from the address. Nothing is stored.
import { decodeModel } from '../../js/share.js';
import { CONFIG } from '../../js/config.js';
import { cardMeta } from '../_lib/card-svg.js';
import { withSecurityHeaders } from '../../js/security-headers.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Pure so it can be tested: rewrite index.html for one card. */
export function withCardMeta(html, { origin, token, model }) {
  const meta = cardMeta(model, { brand: CONFIG.brand.name });
  const image = `${origin}/og/${token}.png`;
  const set = (h, prop, value, attr = 'property') => {
    const re = new RegExp(`<meta ${attr}="${prop}" content="[^"]*"\\s*/?>`);
    const tag = `<meta ${attr}="${prop}" content="${esc(value)}" />`;
    return re.test(h) ? h.replace(re, tag) : h.replace('</head>', `  ${tag}\n</head>`);
  };
  let out = html.replace('<head>', '<head>\n  <base href="/" />');
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  out = set(out, 'og:title', meta.title);
  out = set(out, 'og:description', meta.description);
  out = set(out, 'og:image', image);
  out = set(out, 'og:url', `${origin}/c/${token}`);
  out = set(out, 'twitter:card', 'summary_large_image', 'name');
  out = set(out, 'twitter:image', image, 'name');
  return out;
}

export async function onRequestGet({ params, request, env }) {
  const url = new URL(request.url);
  const token = String(params.token || '');
  const model = decodeModel(token);
  if (!model) return Response.redirect(new URL('/', url).href, 302);
  const page = await env.ASSETS.fetch(new URL('/', url)); // '/' rather than '/index.html', which redirects
  const html = withCardMeta(await page.text(), { origin: url.origin, token, model });
  return withSecurityHeaders(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } }));
}
