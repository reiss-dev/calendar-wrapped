// Where meetings happened: on a call, in a meeting room at the office, or somewhere real (on site).
// Read from the location field (and video links), in five languages. Pure: runs in the worker and tests.

const ONLINE = /(teams\.microsoft|microsoft teams|teams[- ]?(meeting|vergadering|möte|møte|møde)|zoom\.us|\bzoom\b|meet\.google|google meet|hangouts|webex|whereby|gotomeeting|goto\.com|bluejeans|chime\.aws|\bhuddle\b|skype|\bonline\b|virtual|video ?call|\bcall\b|phone|telefoon|telefon|dial[- ]?in|https?:\/\/|\bvirtueel\b|\bdigitalt?\b)/i;
const ROOM = /(\broom\b|meeting ?room|board ?room|conference|\bconf\b|\bfloor\b|\blevel\b|\blvl\b|\bkitchen\b|\bcanteen\b|\bdesk\b|\bpod\b|\bbooth\b|vergader(ruimte|zaal|kamer)|\bzaal\b|\bkamer\b|mötesrum|konferensrum|\brum\b|møterom|\bmøtesal\b|mødelokale|mødesal|\blokale\b|\b\d{1,2}\.\d{1,3}\b|\(\d{1,2}\)\s*$)/i;
// "Office" alone is ours only when nobody from outside came: "Acme office" with Acme there is on site.
const OFFICE_WORD = /(\bhq\b|head office|\boffice\b|kantoor|kontor(et)?\b)/i;
const NOWHERE = /^(tbc|tbd|n\/?a|none|-+|\?|home|thuis|hemma|hjemme|wfh|remote)$/i;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}|\d{4} ?[A-Z]{2}|\d{3} ?\d{2}|\d{4})\b/g;

/** Splits a location into its parts: Outlook joins several with "; ". */
const parts = (loc) => String(loc || '').split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);

/** 'online' | 'office' | 'onsite' | null (nothing said). */
export function whereOf(e, { company = '', external = false } = {}) {
  const ps = parts(e.location).filter((p) => !NOWHERE.test(p));
  const physical = ps.filter((p) => !ONLINE.test(p));
  const roomBooked = (e.attendees || []).some((a) => a.isResource);
  const companyRe = company && company.length >= 3 ? new RegExp(`\\b${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
  if (physical.length) {
    const inOffice = physical.every((p) => ROOM.test(p) || (companyRe && companyRe.test(p)) || (!external && OFFICE_WORD.test(p))) || (roomBooked && physical.length === 1 && !/,/.test(physical[0]));
    return inOffice ? 'office' : 'onsite';
  }
  if (ps.length || ONLINE.test(e.description || '')) return 'online';
  if (roomBooked) return 'office';
  return null;
}

/** A short name for a place: "Acme Customer, Kungsgatan 12, Stockholm" → "Acme Customer". */
export function placeName(loc) {
  const p = parts(loc).find((x) => !ONLINE.test(x)) || '';
  const bits = p.split(/\s*,\s*/).map((x) => x.replace(POSTCODE, '').trim()).filter(Boolean);
  const name = bits.find((x) => !/^\d/.test(x)) || bits[0] || '';
  return name.length > 32 ? `${name.slice(0, 31)}…` : name;
}

const r1 = (n) => Math.round(n * 10) / 10;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * meetings: annotated meetings. isExternal(e): true when someone from outside was there.
 * Returns null when too few meetings say where they were.
 */
export function whereStats(meetings, { company = '', isExternal = () => false } = {}) {
  const kinds = { online: { count: 0, hours: 0 }, office: { count: 0, hours: 0 }, onsite: { count: 0, hours: 0 } };
  const days = new Set(), customerDays = new Set(), places = new Map();
  let known = 0, knownHours = 0, customer = { count: 0, hours: 0 };
  for (const e of meetings) {
    const ext = isExternal(e);
    const w = whereOf(e, { company, external: ext });
    if (!w) continue;
    known++; knownHours += e.durationH;
    kinds[w].count++; kinds[w].hours += e.durationH;
    if (w !== 'onsite') continue;
    days.add(dayKey(e.start));
    if (ext) { customer.count++; customer.hours += e.durationH; customerDays.add(dayKey(e.start)); }
    const name = placeName(e.location);
    if (name) {
      const k = name.toLowerCase();
      const cur = places.get(k) || { name, count: 0, hours: 0, customer: false };
      cur.count++; cur.hours += e.durationH; cur.customer = cur.customer || ext; places.set(k, cur);
    }
  }
  if (meetings.length < 10 || known / meetings.length < 0.2) return null;
  const pct = (h) => (knownHours ? Math.round((h / knownHours) * 100) : 0);
  const types = Object.entries(kinds).map(([key, v]) => ({ key, count: v.count, hours: r1(v.hours), pct: pct(v.hours) })).filter((x) => x.count).sort((a, b) => b.hours - a.hours);
  return {
    types,
    known,
    inPersonShare: pct(kinds.office.hours + kinds.onsite.hours),
    onsite: { count: kinds.onsite.count, hours: r1(kinds.onsite.hours), days: days.size },
    customer: { count: customer.count, hours: r1(customer.hours), days: customerDays.size },
    places: [...places.values()].map((p) => ({ ...p, hours: r1(p.hours) })).sort((a, b) => b.hours - a.hours).slice(0, 8),
  };
}
