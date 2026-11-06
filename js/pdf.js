// A tiny PDF writer: one JPEG per page, nothing else. Enough for a LinkedIn carousel, which is
// a PDF of square-ish images. Made on the device; no library, nothing uploaded.
const enc = new TextEncoder();

/**
 * pages: [{ jpeg: Uint8Array, w, h }] (pixel sizes). Returns the PDF as a Uint8Array.
 * Each page is w × h points at half scale, so a 1080 × 1350 image is a 540 × 675 pt page.
 */
export function imagesToPdf(pages, { title = '' } = {}) {
  const parts = [];
  const offsets = [];
  let size = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  const esc = (s) => String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '');

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const first = 4; // 1 catalog, 2 pages, 3 info, then three objects per page
  const kids = pages.map((_, i) => `${first + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, `<< /Title (${esc(title)}) /Producer (Calendar Wrapped) >>`);
  pages.forEach((p, i) => {
    const n = first + i * 3;
    const W = p.w / 2, H = p.h / 2;
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(n + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    obj(n + 2, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
  });
  const count = first + pages.length * 3;
  const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}
