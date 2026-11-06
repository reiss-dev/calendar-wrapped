// The heavy lifting, kept free of DOM so it can run in a Web Worker, on the page, or in tests.
// It holds the parsed events itself, so only small summaries cross between threads.
import { parseICS, guessSelfEmail } from './ics.js';
import { computeStats, computeTeamStats, yearOverYear, detectMode, applyExclusions, _internal } from './stats.js';
import { hasFlights, loadGeo } from './geo.js';

const day = (k, plus = 0) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d + plus); };
const at = (k, h) => { const d = day(k); d.setHours(h); return d; };
const base = { status: 'CONFIRMED', attendees: [], organizer: null, isRecurring: false, transparent: false, location: '', description: '', manual: true };
/**
 * What someone added on the prep screen, as calendar entries the engine already understands:
 * time off is an all-day out-of-office block, a trip is a flight out and a flight home
 * (plus time off when it was a holiday). Moments don't touch the numbers.
 */
export function extraEvents(extras = {}) {
  const out = [];
  for (const [i, o] of (extras.off || []).entries()) {
    out.push({ ...base, uid: `extra-off-${i}`, title: o.label ? `Time off - ${o.label}` : 'Time off', start: day(o.start), end: day(o.end, 1), allDay: true, oof: true });
  }
  for (const [i, tr] of (extras.trips || []).entries()) {
    out.push({ ...base, uid: `extra-trip-${i}-out`, title: `✈ Flight to ${tr.to}`, start: at(tr.start, 9), end: at(tr.start, 11), allDay: false });
    out.push({ ...base, uid: `extra-trip-${i}-back`, title: '✈ Flight home', toHome: true, start: at(tr.end, 17), end: at(tr.end, 19), allDay: false });
    if (tr.holiday) out.push({ ...base, uid: `extra-trip-${i}-off`, title: `Time off - ${tr.to}`, start: day(tr.start), end: day(tr.end, 1), allDay: true, oof: true });
  }
  return out;
}

const loadRange = (now = new Date()) => ({ rangeStart: new Date(now.getFullYear() - 2, 0, 1), rangeEnd: new Date(now.getFullYear() + 1, 0, 1) });

const guessRole = (events, owner) => detectMode(_internal.annotate(events, owner)).mode;

export function createCore() {
  let events = [];
  let meta = null;
  // One person's calendars (work and personal). Each event carries its calendar's role and owner.
  let calendars = [];
  let nextCal = 1;
  const rebuild = () => {
    events = calendars.length > 1
      ? calendars.flatMap((c) => c.events.map((e) => ({ ...e, src: c.role, owner: c.owner || undefined })))
      : (calendars[0]?.events || []);
  };
  const calendarList = () => calendars.map((c) => ({ id: c.id, label: c.label, role: c.role, count: c.events.length, owner: c.owner }));
  const members = new Map();
  let nextId = 1;

  function summary() {
    const perYear = {};
    for (const e of events) perYear[e.start.getFullYear()] = (perYear[e.start.getFullYear()] || 0) + 1;
    return { meta, count: events.length, perYear, selfEmail: calendars[0]?.owner ?? guessSelfEmail(events, meta), calendars: calendarList() };
  }

  return {
    async loadText({ text, label = null }) {
      const parsed = parseICS(text, loadRange());
      meta = parsed.meta;
      const owner = guessSelfEmail(parsed.events, meta);
      calendars = [{ id: nextCal++, label: label || owner || meta?.calendarName || 'Calendar', events: parsed.events, owner, role: guessRole(parsed.events, owner) }];
      rebuild();
      if (hasFlights(events)) await loadGeo();
      return summary();
    },
    async loadEvents({ events: ev, meta: m, label = null }) {
      const list = ev.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
      meta = m;
      const owner = guessSelfEmail(list, meta);
      calendars = [{ id: nextCal++, label: label || owner || meta?.calendarName || 'Calendar', events: list, owner, role: guessRole(list, owner) }];
      rebuild();
      if (hasFlights(events)) await loadGeo();
      return summary();
    },
    /** Add another of the same person's calendars, e.g. personal alongside work. */
    async addCalendar({ text, label = null }) {
      const parsed = parseICS(text, loadRange());
      if (!parsed.events.length) return { error: 'empty' };
      const owner = guessSelfEmail(parsed.events, parsed.meta);
      const role = guessRole(parsed.events, owner);
      // Two of the same kind: assume the newcomer is the other one; it can be switched on the prep screen.
      const taken = new Set(calendars.map((c) => c.role));
      const finalRole = taken.has(role) && calendars.length === 1 ? (role === 'work' ? 'personal' : 'work') : role;
      calendars.push({ id: nextCal++, label: label || owner || parsed.meta?.calendarName || 'Calendar', events: parsed.events, owner, role: finalRole });
      if (!meta?.timezone && parsed.meta?.timezone) meta = { ...meta, timezone: parsed.meta.timezone };
      rebuild();
      if (hasFlights(events)) await loadGeo();
      return summary();
    },
    setCalendarRole({ id, role }) { const c = calendars.find((x) => x.id === id); if (c && (role === 'work' || role === 'personal')) c.role = role; rebuild(); return summary(); },
    removeCalendar({ id }) { if (calendars.length > 1) calendars = calendars.filter((c) => c.id !== id); rebuild(); return summary(); },
    async compute({ year, mode = 'auto', selfEmail = null, workHoursPerWeek = 40, country = 'GB', extras = null, exclude = null, groups = [] }) {
      const added = extras ? extraEvents(extras) : [];
      if (added.length && hasFlights(added)) await loadGeo();
      const kept = exclude ? applyExclusions(events, exclude) : events;
      const all = added.length ? [...kept, ...added] : kept;
      const timezone = meta?.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null);
      const s = computeStats(all, { rangeStart: new Date(year, 0, 1), rangeEnd: new Date(year + 1, 0, 1), selfEmail, mode, workHoursPerWeek, timezone, country, groups });
      s.yoy = yearOverYear(all, { year, selfEmail, mode: s.mode, workHoursPerWeek });
      return s;
    },
    addMember({ text, label }) {
      const y = new Date().getFullYear();
      const parsed = parseICS(text, { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y + 1, 0, 1) });
      if (!parsed.events.length) return { error: 'empty' };
      const selfEmail = guessSelfEmail(parsed.events, parsed.meta);
      if (selfEmail && [...members.values()].some((m) => m.selfEmail === selfEmail)) return { error: 'duplicate' };
      let name = null;
      for (const e of parsed.events) {
        const a = e.attendees.find((x) => x.email === selfEmail && x.name && !/@/.test(x.name));
        if (a) { name = a.name.replace(/"/g, ''); break; }
      }
      const id = nextId++;
      members.set(id, { events: parsed.events, selfEmail, label: name || selfEmail || label });
      return { id, name: name || selfEmail || label, count: parsed.events.length, selfEmail };
    },
    removeMember({ id }) { members.delete(id); return { ok: true }; },
    clearMembers() { members.clear(); return { ok: true }; },
    team({ workHoursPerWeek = 40 } = {}) {
      const y = new Date().getFullYear();
      return computeTeamStats([...members.values()], { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y + 1, 0, 1), workHoursPerWeek });
    },
  };
}
