// ICS parsing + recurrence expansion on top of ical.js (vendored, MPL-2.0).
// Pure module: no DOM access, so it runs in the browser and in Node tests.
import ICAL from '../vendor/ical.js';

const MAX_OCCURRENCES_PER_SERIES = 20000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Outlook's cancelled prefix in English, Dutch, Swedish, Norwegian and Danish.
const CANCELLED_PREFIX = /^(cancell?ed|canceled|geannuleerd|inställt|inställd|avlyst|aflyst)\s*:\s*/i;

function stripMailto(value) {
  if (!value) return null;
  return String(value).replace(/^mailto:/i, '').trim().toLowerCase() || null;
}

function readAttendees(component) {
  const out = [];
  for (const prop of component.getAllProperties('attendee')) {
    const email = stripMailto(prop.getFirstValue());
    out.push({
      email,
      name: prop.getParameter('cn') || null,
      status: (prop.getParameter('partstat') || 'NEEDS-ACTION').toUpperCase(),
      role: (prop.getParameter('role') || 'REQ-PARTICIPANT').toUpperCase(),
      isResource: /^(RESOURCE|ROOM)$/i.test(prop.getParameter('cutype') || ''),
    });
  }
  return out;
}

function readOrganizer(component) {
  const prop = component.getFirstProperty('organizer');
  if (!prop) return null;
  return { email: stripMailto(prop.getFirstValue()), name: prop.getParameter('cn') || null };
}

function toJsDate(icalTime) {
  // ical.js resolves VTIMEZONE-backed zones; floating times fall back to local.
  return icalTime.toJSDate();
}

/**
 * Parse an ICS string into expanded event occurrences inside [rangeStart, rangeEnd).
 * Returns { events, meta }.
 */
export function parseICS(text, { rangeStart, rangeEnd } = {}) {
  const jcal = ICAL.parse(text);
  const root = new ICAL.Component(jcal);

  for (const tz of root.getAllSubcomponents('vtimezone')) {
    const tzid = tz.getFirstPropertyValue('tzid');
    if (tzid && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(tzid, new ICAL.Timezone({ component: tz, tzid }));
    }
  }

  const calName = root.getFirstPropertyValue('x-wr-calname') || null;
  const prodId = root.getFirstPropertyValue('prodid') || '';
  const calTz = root.getFirstPropertyValue('x-wr-timezone') || null;

  const vevents = root.getAllSubcomponents('vevent');
  const bases = new Map();
  const exceptions = [];
  for (const v of vevents) {
    const uid = v.getFirstPropertyValue('uid') || `anon-${bases.size}-${exceptions.length}`;
    if (v.hasProperty('recurrence-id')) exceptions.push(v);
    else bases.set(uid, new ICAL.Event(v));
  }
  for (const ex of exceptions) {
    const base = bases.get(ex.getFirstPropertyValue('uid'));
    if (base) {
      try { base.relateException(ex); } catch { /* malformed exception; skip */ }
    } else {
      // Orphan exception: treat it as a one-off event.
      bases.set(`${ex.getFirstPropertyValue('uid')}#${exceptions.indexOf(ex)}`, new ICAL.Event(ex));
    }
  }

  const start = rangeStart ? new Date(rangeStart) : new Date(1970, 0, 1);
  const end = rangeEnd ? new Date(rangeEnd) : new Date(2100, 0, 1);
  const events = [];
  const seen = new Set();
  let rawCount = 0;

  const pushOccurrence = (ev, item, startDate, endDate, isRecurring) => {
    const s = toJsDate(startDate);
    let e = toJsDate(endDate);
    if (!(e > s)) e = new Date(s.getTime() + (startDate.isDate ? 86400000 : 0));
    if (e <= start || s >= end) return;
    const comp = item.component;
    let status = (comp.getFirstPropertyValue('status') || 'CONFIRMED').toUpperCase();
    let title = (item.summary || '').trim() || '(no title)';
    // Outlook keeps cancelled meetings in published calendars with a "Canceled:" prefix.
    if (CANCELLED_PREFIX.test(title)) { status = 'CANCELLED'; title = title.replace(CANCELLED_PREFIX, '').trim() || '(no title)'; }
    // Outlook marks all-day events as midnight-to-midnight date-times plus a flag.
    const msAllDay = String(comp.getFirstPropertyValue('x-microsoft-cdo-alldayevent') || '').toUpperCase() === 'TRUE';
    const msBusy = String(comp.getFirstPropertyValue('x-microsoft-cdo-busystatus') || '').toUpperCase();
    const transp = (comp.getFirstPropertyValue('transp') || 'OPAQUE').toUpperCase();
    const key = `${ev.uid}|${s.getTime()}`;
    if (seen.has(key)) return; // the same occurrence exported twice
    seen.add(key);
    events.push({
      uid: ev.uid,
      title,
      description: comp.getFirstPropertyValue('description') || '',
      location: comp.getFirstPropertyValue('location') || '',
      start: s,
      end: e,
      allDay: !!startDate.isDate || msAllDay,
      status,
      organizer: readOrganizer(comp),
      attendees: readAttendees(comp),
      isRecurring,
      transparent: transp === 'TRANSPARENT' || msBusy === 'FREE',
    });
  };

  for (const ev of bases.values()) {
    rawCount++;
    try {
      if (ev.isRecurring()) {
        const iter = ev.iterator();
        let next;
        let n = 0;
        while ((next = iter.next()) && n < MAX_OCCURRENCES_PER_SERIES) {
          n++;
          const details = ev.getOccurrenceDetails(next);
          const s = toJsDate(details.startDate);
          if (s >= end) break;
          pushOccurrence(ev, details.item, details.startDate, details.endDate, true);
        }
      } else {
        pushOccurrence(ev, ev, ev.startDate, ev.endDate, false);
      }
    } catch {
      // A single broken event must not take the whole import down.
    }
  }

  events.sort((a, b) => a.start - b.start);

  return {
    events,
    meta: {
      calendarName: calName,
      calendarEmail: calName && EMAIL_RE.test(calName) ? calName.toLowerCase() : null,
      prodId,
      timezone: calTz,
      rawEventCount: rawCount,
      source: detectSource(prodId),
    },
  };
}

function detectSource(prodId) {
  const p = (prodId || '').toLowerCase();
  if (p.includes('google')) return 'google';
  if (p.includes('microsoft') || p.includes('outlook')) return 'outlook';
  if (p.includes('apple') || p.includes('macos') || p.includes('ical')) return 'apple';
  return 'unknown';
}

/** Best guess at which attendee is the calendar owner. */
export function guessSelfEmail(events, meta) {
  if (meta?.calendarEmail) return meta.calendarEmail;
  const counts = new Map();
  for (const ev of events) {
    if (ev.attendees.length < 2) continue;
    for (const a of ev.attendees) {
      if (!a.email || a.isResource) continue;
      counts.set(a.email, (counts.get(a.email) || 0) + 1);
    }
  }
  let best = null;
  let bestCount = 0;
  for (const [email, c] of counts) {
    if (c > bestCount) { best = email; bestCount = c; }
  }
  return best;
}
