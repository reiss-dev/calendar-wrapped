// The heavy lifting, kept free of DOM so it can run in a Web Worker, on the page, or in tests.
// It holds the parsed events itself, so only small summaries cross between threads.
import { parseICS, guessSelfEmail } from './ics.js';
import { computeStats, computeTeamStats, yearOverYear } from './stats.js';
import { hasFlights, loadGeo } from './geo.js';

const loadRange = (now = new Date()) => ({ rangeStart: new Date(now.getFullYear() - 2, 0, 1), rangeEnd: new Date(now.getFullYear() + 1, 0, 1) });

export function createCore() {
  let events = [];
  let meta = null;
  const members = new Map();
  let nextId = 1;

  function summary() {
    const perYear = {};
    for (const e of events) perYear[e.start.getFullYear()] = (perYear[e.start.getFullYear()] || 0) + 1;
    return { meta, count: events.length, perYear, selfEmail: guessSelfEmail(events, meta) };
  }

  return {
    async loadText({ text }) { ({ events, meta } = parseICS(text, loadRange())); if (hasFlights(events)) await loadGeo(); return summary(); },
    async loadEvents({ events: ev, meta: m }) { events = ev.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) })); meta = m; if (hasFlights(events)) await loadGeo(); return summary(); },
    compute({ year, mode = 'auto', selfEmail = null, workHoursPerWeek = 40 }) {
      const timezone = meta?.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null);
      const s = computeStats(events, { rangeStart: new Date(year, 0, 1), rangeEnd: new Date(year + 1, 0, 1), selfEmail, mode, workHoursPerWeek, timezone });
      s.yoy = yearOverYear(events, { year, selfEmail, mode: s.mode, workHoursPerWeek });
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
