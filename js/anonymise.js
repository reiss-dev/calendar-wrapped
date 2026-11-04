// Turns a real calendar export into one that's safe to share for testing:
// every title, name, email, domain, location and description is replaced, but the
// structure the app depends on (times, time zones, recurrence, replies, statuses,
// and the keyword signals the stats engine looks for) is kept.
import { _internal } from './stats.js';

const SIGNALS = [
  ['flight', /\b(flight|vlucht|flyg|fly|✈)/i], ['hotel', /\b(hotel|hotell|airbnb)/i], ['train', /\b(train|trein|tåg|tog|eurostar)/i],
  ['leave', _internal.OOO_TITLE], ['focus', _internal.NON_MEETING_TITLE], ['standup', /stand ?up|daily/i], ['1:1', /1:1|1-1|one.to.one/i],
  ...(_internal.PERSONAL_CATEGORIES || []).map((c) => [c.key, c.re]),
];
const KEEP_PROPS = new Set(['BEGIN', 'END', 'VERSION', 'PRODID', 'CALSCALE', 'METHOD', 'X-WR-TIMEZONE', 'TZID', 'TZOFFSETFROM', 'TZOFFSETTO', 'TZNAME', 'DTSTART', 'DTEND', 'DURATION', 'RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID', 'STATUS', 'TRANSP', 'SEQUENCE', 'DTSTAMP', 'CREATED', 'LAST-MODIFIED', 'CLASS', 'PRIORITY', 'X-MICROSOFT-CDO-BUSYSTATUS', 'X-MICROSOFT-CDO-ALLDAYEVENT', 'X-MICROSOFT-CDO-INTENDEDSTATUS', 'X-LIC-LOCATION', 'ACTION', 'TRIGGER']);

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

export function anonymiseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); // unfold
  const people = new Map(); const titles = new Map();
  const person = (email) => {
    const k = String(email).toLowerCase();
    if (!people.has(k)) people.set(k, people.size + 1);
    return people.get(k);
  };
  const out = [];
  for (const line of lines) {
    if (!line) continue;
    const m = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (!m) continue;
    const [, name, params, value] = m;
    const prop = name.toUpperCase();
    if (prop === 'SUMMARY') {
      const cancelled = /^(cancell?ed|canceled|geannuleerd|inställt|inställd|avlyst|aflyst)\s*:/i.test(value) ? 'Canceled: ' : '';
      const plain = value.replace(/\\,/g, ',');
      const tags = SIGNALS.filter(([, re]) => re.test(plain)).map(([k]) => k);
      if (!titles.has(plain)) titles.set(plain, titles.size + 1);
      out.push(`SUMMARY:${cancelled}Title ${titles.get(plain)}${tags.length ? ` [${[...new Set(tags)].join(' ')}]` : ''}`);
    } else if (prop === 'ATTENDEE' || prop === 'ORGANIZER') {
      const n = person(value.replace(/^mailto:/i, ''));
      const keep = params.split(';').filter((p) => /^(PARTSTAT|ROLE|CUTYPE|RSVP)=/i.test(p)).join(';');
      out.push(`${prop}${keep ? `;${keep}` : ''};CN=Person ${n}:mailto:person${n}@example.com`);
    } else if (prop === 'X-WR-CALNAME') {
      out.push(/@/.test(value) ? `X-WR-CALNAME:person${person(value)}@example.com` : 'X-WR-CALNAME:Calendar');
    } else if (prop === 'UID') {
      out.push(`UID:${hash(value)}@example.com`);
    } else if (prop === 'LOCATION') {
      const tags = /teams|zoom|meet\.google|webex/i.test(value) ? 'Video call' : /airport|station|terminal/i.test(value) ? 'Station' : 'Somewhere';
      out.push(`LOCATION:${tags}`);
    } else if (prop === 'DESCRIPTION') {
      if (value.trim()) out.push(`DESCRIPTION:${/teams|zoom|meet\.google|webex/i.test(value) ? 'Video call link' : 'Description'}`);
    } else if (KEEP_PROPS.has(prop)) {
      out.push(line);
    }
  }
  return `${out.join('\r\n')}\r\n`;
}

/** A shareable report about a file: counts and formats only, nothing personal. */
export function diagnosticReport(text, { parseICS, guessSelfEmail, computeStats, now = new Date() }) {
  const y = now.getFullYear();
  const t0 = performance.now();
  const lines = [];
  const add = (k, v) => lines.push(`${k}: ${v}`);
  try {
    const { events, meta } = parseICS(text, { rangeStart: new Date(y - 2, 0, 1), rangeEnd: new Date(y + 1, 0, 1) });
    const parseMs = Math.round(performance.now() - t0);
    const self = guessSelfEmail(events, meta);
    const timed = events.filter((e) => !e.allDay);
    const withAtt = timed.filter((e) => e.attendees.length).length;
    const tzids = [...new Set([...text.matchAll(/TZID[=:]"?([^:;"\r\n]+)/g)].map((m) => m[1]))];
    add('Producer', meta.prodId || '(none)');
    add('Detected source', meta.source);
    add('Owner found', self ? 'yes' : 'no');
    add('Time zones', tzids.join(', ') || '(none)');
    add('Raw events', meta.rawEventCount);
    add('Occurrences, 3 years', events.length);
    add('All-day / timed', `${events.length - timed.length} / ${timed.length}`);
    add('Timed with attendees', `${timed.length ? Math.round((withAtt / timed.length) * 100) : 0}%`);
    add('Recurring occurrences', events.filter((e) => e.isRecurring).length);
    add('Cancelled', events.filter((e) => e.status === 'CANCELLED').length);
    add('Free or transparent', events.filter((e) => e.transparent).length);
    add('Parse time', `${parseMs} ms`);
    const s = computeStats(events, { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y + 1, 0, 1), selfEmail: self, now });
    add('Mode', `${s.mode} (detected ${s.detectedMode})`);
    if (s.mode === 'work') { add('Meetings', s.meetings); add('Share of working time', `${s.shareOfWork}%`); add('Recurring series', s.recurringCount); add('People', s.uniquePeople); }
    else { add('Plans', s.events); add('Categories', s.categories.map((c) => `${c.key} ${c.count}`).join(', ') || '(none)'); }
    add('Persona', s.persona.id);
    add('Suggestions', s.reclaim.suggestions.map((x) => x.kind).join(', ') || '(none)');
  } catch (err) {
    add('Error', String(err?.message || err).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>').slice(0, 200));
  }
  add('Browser', typeof navigator !== 'undefined' ? navigator.userAgent.replace(/\([^)]*\)/, '').trim().slice(0, 120) : 'node');
  return lines.join('\n');
}
