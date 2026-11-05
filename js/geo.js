// Turns flight entries into routes on a map. Data (js/geo/places.js) is loaded lazily,
// only when a calendar actually contains flights.
const FLIGHTISH = /(\bflight\b|✈|\bvlucht\b|\bflyg\b|\bfly\b|\bflyreise\b|\bflug\b|\b[A-Z]{3}\s*(→|->|-|–|to)\s*[A-Z]{3}\b)/iu;
const TO = String.raw`(?:to|→|->|–|naar|till|til|nach)`;
const FROM = String.raw`(?:from|van|från|fra|von)`;
const TO_CITY = new RegExp(`${TO}\\s+([\\p{L}][\\p{L} .'’-]{1,40}?)(?=\\s*[(\\[,:;]|\\s+(?:on|via|at|op|på|kl)\\b|\\s*$)`, 'iu');
const FROM_CITY = new RegExp(`${FROM}\\s+([\\p{L}][\\p{L} .'’-]{1,40}?)\\s+${TO}\\b`, 'iu');

let data = null;
export const norm = (s) => String(s).replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').replace(/ß/g, 'ss').replace(/[łŁ]/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function parse({ PLACES, AIRPORTS }) {
  const places = new Map(), airports = new Map();
  for (const row of PLACES.split(';')) {
    const [k, display, lat, lon] = row.split('|');
    const name = (display || k.replace(/\b\w/g, (c) => c.toUpperCase())).replace(/^New York City$/, 'New York');
    places.set(k, { name, lat: +lat, lon: +lon });
  }
  for (const row of AIRPORTS.split(';')) {
    const code = row.slice(0, 3);
    const [lat, lon, ...city] = row.slice(3).split(',');
    airports.set(code, { name: city.join(','), lat: +lat, lon: +lon, code });
  }
  return { places, airports };
}

export const hasFlights = (events) => events.some((e) => FLIGHTISH.test(e.title) || e.toHome);
export async function loadGeo() { if (!data) data = parse(await import('./geo/places.js')); return data; }
export const geoLoaded = () => !!data;
/** Type-ahead for places someone adds by hand: cities and airport codes, best matches first. */
export function searchPlaces(q, n = 6) {
  if (!data) return [];
  const k = norm(q);
  if (!k) return [];
  const out = [], seen = new Set();
  const push = (p) => { const id = norm(p.name); if (!seen.has(id)) { seen.add(id); out.push({ name: p.name, code: p.code || null }); } };
  if (/^[a-z]{3}$/.test(k) && data.airports.get(k.toUpperCase())) push(data.airports.get(k.toUpperCase()));
  for (const [key, p] of data.places) if (key.startsWith(k)) { push(p); if (out.length >= n * 3) break; }
  if (out.length < n) for (const [key, p] of data.places) if (key.includes(` ${k}`)) { push(p); if (out.length >= n * 3) break; }
  return out.sort((a, b) => a.name.length - b.name.length).slice(0, n);
}
/** The known place a typed name points at, or null. */
export const resolvePlace = (name) => (data ? (codesIn(name)[0] || placeFrom(name)) : null);
/** For tests and the worker, which already have the module. */
export function useGeo(mod) { data = parse(mod); }

export function haversine(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

/** Longest run of words from the start of `phrase` that names a known place. */
function placeFrom(phrase) {
  const words = norm(phrase).split(' ').filter(Boolean);
  for (let n = Math.min(4, words.length); n > 0; n--) {
    const hit = data.places.get(words.slice(0, n).join(' '));
    if (hit) return hit;
  }
  return null;
}
function codesIn(text) {
  return [...String(text).matchAll(/\b([A-Z]{3})\b/g)].map((m) => data.airports.get(m[1])).filter(Boolean);
}
/** The place in a location field: an airport code, or a city at the start. */
function placeIn(location) {
  if (!location) return null;
  return codesIn(location)[0] || placeFrom(location) || placeFrom(location.split(/[,(]/)[0]) || null;
}
const tzCity = (tz) => (tz ? placeFrom(tz.split('/').pop().replace(/_/g, ' ')) : null);

/**
 * events: flight-like entries (title, location, start). Returns { legs, home, km, longest }.
 * Origins come from an airport code or "from X to Y", else the previous destination if the
 * trip is still going (within three weeks), else home.
 */
export function flightLegs(events, { timezone } = {}) {
  if (!data) return null;
  const parsed = events
    .filter((e) => FLIGHTISH.test(e.title) || e.toHome)
    .sort((a, b) => a.start - b.start)
    .map((e) => {
      if (e.toHome) return { date: e.start, from: null, to: null, toHome: true }; // a trip added by hand, flying back
      const titleCodes = codesIn(e.title);
      let from = null, to = null;
      if (titleCodes.length >= 2) [from, to] = titleCodes;
      const fm = FROM_CITY.exec(e.title);
      if (fm) from = placeFrom(fm[1]) || from;
      const tm = TO_CITY.exec(e.title);
      if (tm) to = placeFrom(tm[1]) || to;
      if (!to && titleCodes.length === 1) to = titleCodes[0];
      if (!from) from = placeIn(e.location);
      if (from && to && norm(from.name) === norm(to.name) && from.code && to.code === undefined) from = null;
      return { date: e.start, from, to };
    })
    .filter((p) => p.to || p.toHome);

  // Home: the most common explicit origin, else the calendar's time zone city.
  const tally = new Map();
  for (const p of parsed) if (p.from) tally.set(norm(p.from.name), [p.from, (tally.get(norm(p.from.name))?.[1] || 0) + 1]);
  const home = [...tally.values()].sort((a, b) => b[1] - a[1])[0]?.[0] || tzCity(timezone) || null;

  const legs = [];
  let last = null;
  for (const p of parsed) {
    if (p.toHome) { if (!home) continue; p.to = home; }
    let from = p.from;
    if (!from && last && p.date - last.date < 21 * 86400000) from = last.to;
    if (!from) from = home;
    if (!from || norm(from.name) === norm(p.to.name)) { last = p; continue; }
    const leg = { date: p.date, from: { name: from.name, lat: from.lat, lon: from.lon, code: from.code }, to: { name: p.to.name, lat: p.to.lat, lon: p.to.lon, code: p.to.code } };
    leg.km = haversine(leg.from, leg.to);
    legs.push(leg);
    last = { ...p, to: leg.to };
  }
  const km = legs.reduce((t, l) => t + l.km, 0);
  const longest = legs.reduce((a, b) => (!a || b.km > a.km ? b : a), null);
  const cities = new Set(legs.flatMap((l) => [norm(l.from.name), norm(l.to.name)]));
  return { legs, home: home ? { name: home.name, lat: home.lat, lon: home.lon } : null, km, longest, cities: cities.size, aroundEarth: Math.round((km / 40075) * 10) / 10 };
}
