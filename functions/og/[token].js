// Cloudflare Pages Function: GET /og/<token>.png → the card as a 1200×630 PNG for link previews.
// Deterministic from the token, so it's cached forever at the edge. Nothing is stored.
import wasm from '../_vendor/resvg.wasm';
import { decodeModel } from '../../js/share.js';
import { CONFIG } from '../../js/config.js';
import { cardSvg } from '../_lib/card-svg.js';
import { renderPng } from '../_lib/og-render.js';

export async function onRequestGet({ params, request }) {
  const token = String(params.token || '').replace(/\.png$/, '');
  const model = decodeModel(token);
  if (!model) return Response.redirect(new URL('/og.png', request.url).href, 302);
  try {
    const png = await renderPng(cardSvg(model, { brand: CONFIG.brand.name, domain: CONFIG.brand.domain }), wasm);
    return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
  } catch {
    return Response.redirect(new URL('/og.png', request.url).href, 302);
  }
}
