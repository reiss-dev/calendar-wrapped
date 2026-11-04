// Renders card SVG to PNG with resvg (WebAssembly). Kept separate from the route so it can be
// tested in Node with the same code.
import { initWasm, Resvg } from '../_vendor/resvg.mjs';
import { INTER_500, INTER_700 } from '../_vendor/fonts.js';

let ready = null;
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
let fonts = null;

export async function renderPng(svg, wasmModule) {
  if (!ready) ready = initWasm(wasmModule).catch((e) => { ready = null; throw e; });
  await ready;
  fonts ||= [bytes(INTER_500), bytes(INTER_700)];
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { fontBuffers: fonts, defaultFontFamily: 'Inter', loadSystemFonts: false } });
  const png = r.render().asPng();
  r.free?.();
  return png;
}
