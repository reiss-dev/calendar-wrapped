// A work calendar where some numbers look wrong: far too much "leave" (a conference booked as out of
// office), and a shared team calendar's meetings that the owner was never invited to.
const ME = 'sam@corp.example';
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const day = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
let n = 0;
function ev({ title, start, end, allDay = false, attendees = [], organizer = ME }) {
  const lines = ['BEGIN:VEVENT', `UID:odd-${++n}@test`, `SUMMARY:${title}`];
  lines.push(allDay ? `DTSTART;VALUE=DATE:${day(start)}` : `DTSTART:${stamp(start)}`, allDay ? `DTEND;VALUE=DATE:${day(end)}` : `DTEND:${stamp(end)}`);
  if (organizer) lines.push(`ORGANIZER;CN=${organizer.split('@')[0]}:mailto:${organizer}`);
  for (const a of attendees) lines.push(`ATTENDEE;CN=${a.split('@')[0]};PARTSTAT=ACCEPTED:mailto:${a}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}
export function oddCalendar(year = 2026) {
  const out = [];
  const team = ['ana@corp.example', 'bo@corp.example', 'cy@corp.example'];
  // Real meetings, every weekday morning.
  for (let d = new Date(year, 0, 5); d < new Date(year, 9, 30); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    out.push(ev({ title: 'Team standup', start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9), end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 30), attendees: [ME, ...team] }));
    // The shared calendar's meetings: other people, not Sam.
    if (d.getDay() === 3) out.push(ev({ title: 'Ops review', start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14), end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 15), attendees: team, organizer: team[0] }));
  }
  // Real leave, and a conference booked as out of office for weeks.
  out.push(ev({ title: 'Annual leave', start: new Date(year, 7, 3), end: new Date(year, 7, 22), allDay: true }));
  for (const m of [1, 3, 5, 8]) out.push(ev({ title: 'OOO conference season', start: new Date(year, m, 2), end: new Date(year, m, 20), allDay: true }));
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Google Inc//Google Calendar 70.9054//EN\r\nX-WR-CALNAME:${ME}\r\n${out.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
}
export const ODD_SELF = ME;
