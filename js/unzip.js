// Reads Google Calendar's export (.zip) in the browser, so nobody has to unzip anything.
// A minimal ZIP reader: stored and deflated entries, inflated with the browser's own
// DecompressionStream. Nothing is uploaded; the file never leaves the device.
const MAX_TOTAL = 120 * 1024 * 1024; // refuse anything that inflates past this (zip bombs)

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);

async function inflate(bytes, limit) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const parts = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw new Error('zip_too_large'); }
    parts.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Lists a zip's files: [{ name, size, read(): Promise<string> }]. Throws 'not_a_zip' if it isn't one. */
export function readZip(buffer) {
  const v = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) if (u32(v, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not_a_zip');
  const count = u16(v, eocd + 10), cdOffset = u32(v, eocd + 16);
  const names = new TextDecoder('utf-8');
  const entries = [];
  let p = cdOffset, budget = MAX_TOTAL;
  for (let n = 0; n < count; n++) {
    if (u32(v, p) !== 0x02014b50) throw new Error('not_a_zip');
    const method = u16(v, p + 10), compSize = u32(v, p + 20), size = u32(v, p + 24);
    const nameLen = u16(v, p + 28), extraLen = u16(v, p + 30), commentLen = u16(v, p + 32), local = u32(v, p + 42);
    const name = names.decode(new Uint8Array(buffer, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    entries.push({
      name, size, method,
      async read() {
        if (u32(v, local) !== 0x04034b50) throw new Error('not_a_zip');
        const start = local + 30 + u16(v, local + 26) + u16(v, local + 28);
        const raw = new Uint8Array(buffer, start, compSize);
        if (size > budget) throw new Error('zip_too_large');
        const bytes = method === 0 ? raw : method === 8 ? await inflate(raw, budget) : null;
        if (!bytes) throw new Error('zip_method');
        budget -= bytes.length;
        return new TextDecoder('utf-8').decode(bytes);
      },
    });
  }
  return entries;
}

const base = (name) => name.split('/').pop();
const BIRTHDAYS = /#contacts@|addressbook#contacts|birthday|verjaardag|födelsedag|bursdag|fødselsdag/i;
const HOLIDAYS = /#holiday@|holiday|feestdag|helgdag|helligdag/i;
const SHARED = /@group\.calendar\.google\.com|@group\.v\.calendar\.google\.com/i;

/**
 * Which calendars in an export to use: the person's main calendar (the biggest one that isn't a
 * shared, holiday or birthday calendar), plus Google's birthdays calendar, which feeds the
 * birthday page. Public-holiday calendars are skipped; the app works holidays out itself.
 */
export function pickCalendars(entries) {
  const ics = entries.filter((e) => /\.ics$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name));
  const birthdays = ics.filter((e) => BIRTHDAYS.test(base(e.name)));
  const holidays = ics.filter((e) => HOLIDAYS.test(base(e.name)) && !birthdays.includes(e));
  const rest = ics.filter((e) => !birthdays.includes(e) && !holidays.includes(e));
  const own = rest.filter((e) => !SHARED.test(base(e.name)));
  const bySize = (list) => [...list].sort((a, b) => b.size - a.size)[0] || null;
  const primary = bySize(own) || bySize(rest) || bySize(ics);
  return { primary, birthdays: primary ? birthdays.filter((e) => e !== primary) : [], skipped: ics.filter((e) => e !== primary && !birthdays.includes(e)).map((e) => base(e.name)), count: ics.length };
}

/** Adds the events (and time zones) from another calendar into the main one. */
export function mergeIcs(main, extra) {
  const blocks = (text, kind) => text.match(new RegExp(`BEGIN:${kind}[\\s\\S]*?END:${kind}\\r?\\n?`, 'g')) || [];
  const add = [...blocks(extra, 'VTIMEZONE'), ...blocks(extra, 'VEVENT')].join('');
  if (!add) return main;
  const at = main.lastIndexOf('END:VCALENDAR');
  if (at < 0) return main;
  const nl = main.includes('\r\n') ? '\r\n' : '\n';
  return main.slice(0, at) + add.replace(/\r?\n/g, nl) + main.slice(at);
}

/** A calendar export (.zip) → { text, name, merged, skipped }. */
export async function calendarFromZip(file) {
  const entries = readZip(await file.arrayBuffer());
  const { primary, birthdays, skipped, count } = pickCalendars(entries);
  if (!primary) throw new Error('zip_no_calendar');
  let text = await primary.read();
  for (const b of birthdays) text = mergeIcs(text, await b.read());
  return { text, name: base(primary.name).replace(/\.ics$/i, ''), merged: birthdays.length, skipped, count };
}
