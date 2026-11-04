#!/usr/bin/env node
// Generates fixtures for paths that can't be exercised against live services here:
// Outlook web + desktop exports, a four-person team, a Google Calendar API response,
// and a hand-built edge-case calendar. Usage: node tools/make-fixtures.js [year]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const YEAR = Number(process.argv[2]) || new Date().getFullYear();
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const dateOnly = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const at = (m, d, h = 0, min = 0) => new Date(YEAR, m - 1, d, h, min);
const plus = (d, mins) => new Date(d.getTime() + mins * 60000);
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
const write = (rel, text) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

const LONDON_TZ = (tzid) => [
  'BEGIN:VTIMEZONE', `TZID:${tzid}`,
  'BEGIN:STANDARD', 'DTSTART:16010101T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10', 'END:STANDARD',
  'BEGIN:DAYLIGHT', 'DTSTART:16010101T010000', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3', 'END:DAYLIGHT',
  'END:VTIMEZONE'].join('\r\n');

// ---------------------------------------------------------------- Outlook
function outlook({ withAttendees }) {
  const TZ = 'GMT Standard Time';
  const SELF = ['Sam Patel', 'sam.patel@contoso.com'];
  const COLLEAGUES = [['Ingrid Olsen', 'ingrid.olsen@contoso.com'], ['Bas de Jong', 'bas.dejong@contoso.com'], ['Freya Lund', 'freya.lund@contoso.com'], ['Omar Haddad', 'omar.haddad@contoso.com']];
  let n = 0;
  const ev = ({ title, start, end, rrule, exdates = [], attendees = [], busy = 'BUSY', allDay = false, organizer = SELF }) => {
    const lines = ['BEGIN:VEVENT', `UID:040000008200E00074C5B7101A82E0080000000${String(++n).padStart(4, '0')}`, `SUMMARY:${esc(title)}`,
      `DTSTART;TZID=${TZ}:${local(start)}`, `DTEND;TZID=${TZ}:${local(end)}`, 'CLASS:PUBLIC', 'PRIORITY:5', `DTSTAMP:${YEAR}0101T090000Z`,
      `TRANSP:${busy === 'FREE' ? 'TRANSPARENT' : 'OPAQUE'}`, 'STATUS:CONFIRMED', 'SEQUENCE:0', 'LOCATION:Microsoft Teams Meeting',
      `X-MICROSOFT-CDO-BUSYSTATUS:${busy}`, `X-MICROSOFT-CDO-ALLDAYEVENT:${allDay ? 'TRUE' : 'FALSE'}`, 'X-MICROSOFT-CDO-IMPORTANCE:1'];
    if (rrule) lines.push(`RRULE:${rrule}`);
    for (const x of exdates) lines.push(`EXDATE;TZID=${TZ}:${local(x)}`);
    if (withAttendees && attendees.length) {
      lines.push(`ORGANIZER;CN="${organizer[0]}":mailto:${organizer[1]}`);
      for (const [cn, mail] of [SELF, ...attendees]) lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${mail === SELF[1] ? 'ACCEPTED' : 'NEEDS-ACTION'};RSVP=TRUE;CN="${cn}":mailto:${mail}`);
    }
    lines.push('END:VEVENT');
    return lines.join('\r\n');
  };
  const out = [];
  out.push(ev({ title: 'Weekly Sync', start: at(1, 6, 14), end: at(1, 6, 15), rrule: `FREQ=WEEKLY;UNTIL=${YEAR}1231T000000Z;INTERVAL=1;BYDAY=TU;WKST=MO`, exdates: [at(4, 7, 14), at(8, 11, 14)], attendees: COLLEAGUES, organizer: COLLEAGUES[0] }));
  out.push(ev({ title: 'Ingrid / Sam 1:1', start: at(1, 7, 10), end: at(1, 7, 10, 30), rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE;WKST=MO', attendees: [COLLEAGUES[0]], organizer: COLLEAGUES[0] }));
  out.push(ev({ title: 'Lunch', start: at(1, 5, 12, 30), end: at(1, 5, 13, 15), rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', busy: 'FREE' }));
  out.push(ev({ title: 'Annual leave', start: at(4, 6), end: at(4, 11), allDay: true, busy: 'OOF' }));
  for (let i = 0; i < 160; i++) {
    const d = at(1 + Math.floor(rand() * 10), 1 + Math.floor(rand() * 27), 9 + Math.floor(rand() * 8), pick([0, 30]));
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const title = pick(['Customer call', 'Architecture review', 'Quarterly planning', 'Sync', 'Hiring panel', 'Vendor demo']);
    out.push(ev({ title: i % 23 === 0 ? `Canceled: ${title}` : title, start: d, end: plus(d, pick([30, 60])), attendees: COLLEAGUES.slice(0, 1 + Math.floor(rand() * 4)) }));
  }
  return ['BEGIN:VCALENDAR', 'METHOD:PUBLISH', withAttendees ? 'PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN' : 'PRODID:Microsoft Exchange Server 2010', 'VERSION:2.0', 'X-WR-CALNAME:Calendar', LONDON_TZ(TZ), ...out, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- Team
const TEAM = [['Alex Morgan', 'alex.morgan@northwindlabs.com'], ['Priya Shah', 'priya.shah@northwindlabs.com'], ['Tom Hendricks', 'tom.hendricks@northwindlabs.com'], ['Maja Lindqvist', 'maja.lindqvist@northwindlabs.com']];
const OTHERS = [['Daniel Okafor', 'daniel.okafor@northwindlabs.com'], ['Sofie de Vries', 'sofie.devries@northwindlabs.com'], ['Kate Thornton', 'kate@acme-customer.co.uk']];
function teamCalendar(me) {
  const TZ = 'Europe/London';
  const lines = [];
  const ev = ({ uid, title, start, end, rrule, attendees, organizer = me, desc = '' }) => {
    const l = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${YEAR}0101T000000Z`, `SUMMARY:${esc(title)}`, `DTSTART;TZID=${TZ}:${local(start)}`, `DTEND;TZID=${TZ}:${local(end)}`];
    if (rrule) l.push(`RRULE:${rrule}`);
    if (desc) l.push(`DESCRIPTION:${esc(desc)}`);
    l.push(`ORGANIZER;CN=${organizer[0]}:mailto:${organizer[1]}`);
    for (const [cn, mail] of attendees) l.push(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${cn}:mailto:${mail}`);
    l.push('STATUS:CONFIRMED', 'END:VEVENT');
    lines.push(l.join('\r\n'));
  };
  const idx = TEAM.indexOf(me);
  // Shared series: identical UIDs in everyone's export, exactly as Google and Exchange produce them.
  ev({ uid: 'team-standup@northwindlabs.com', title: 'Daily standup', start: at(1, 5, 9, 30), end: at(1, 5, 9, 45), rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', attendees: TEAM, organizer: TEAM[1] });
  ev({ uid: 'team-weekly@northwindlabs.com', title: 'Weekly Sync', start: at(1, 6, 14), end: at(1, 6, 15), rrule: 'FREQ=WEEKLY;BYDAY=TU', attendees: [...TEAM, ...OTHERS.slice(0, 2)], organizer: TEAM[2] });
  if (idx !== 3) ev({ uid: 'team-planning@northwindlabs.com', title: 'Sprint planning', start: at(1, 12, 13), end: at(1, 12, 15), rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', attendees: TEAM.slice(0, 3), organizer: TEAM[2] });
  if (idx <= 1) ev({ uid: 'team-pipeline@northwindlabs.com', title: 'Pipeline review', start: at(1, 9, 10), end: at(1, 9, 11), rrule: 'FREQ=WEEKLY;BYDAY=FR', attendees: [TEAM[0], TEAM[1], OTHERS[0]], organizer: TEAM[0] });
  // Personal 1:1 with the next person round the table.
  const peer = TEAM[(idx + 1) % TEAM.length];
  ev({ uid: `team-1on1-${idx}@northwindlabs.com`, title: `${me[0].split(' ')[0]} / ${peer[0].split(' ')[0]} 1:1`, start: at(1, 7, 11), end: at(1, 7, 11, 30), rrule: 'FREQ=WEEKLY;BYDAY=WE', attendees: [me, peer] });
  // Ad hoc: busier for some people than others.
  const load = [140, 210, 90, 60][idx];
  for (let i = 0; i < load; i++) {
    const d = at(1 + Math.floor(rand() * 10), 1 + Math.floor(rand() * 27), 9 + Math.floor(rand() * 8), pick([0, 30]));
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    ev({ uid: `team-adhoc-${idx}-${i}@northwindlabs.com`, title: pick(['Customer call', 'Deal review', 'Quick chat', 'Demo prep', 'Interview']), start: d, end: plus(d, pick([30, 30, 60])), attendees: [me, pick([...TEAM, ...OTHERS].filter((p) => p !== me))] });
  }
  return ['BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0', `X-WR-CALNAME:${me[1]}`, `X-WR-TIMEZONE:${TZ}`, LONDON_TZ(TZ), ...lines, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- Edge cases
function edge() {
  const SELF = 'me@example.com';
  const lines = [];
  const att = (list) => list.map(([cn, mail, extra = '']) => `ATTENDEE;CN=${cn}${extra};PARTSTAT=ACCEPTED:mailto:${mail}`);
  const ev = (uid, title, start, end, extra = []) => lines.push(['BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${esc(title)}`, `DTSTART:${start}`, `DTEND:${end}`, ...extra, 'END:VEVENT'].join('\r\n'));
  const me = ['Me', SELF];
  const bob = ['Bob Stone', 'bob@example.com'];
  // 1. Three-day conference as one timed event: not a meeting.
  ev('conf', 'Industry conference', '20260302T090000Z', '20260304T170000Z', [`ORGANIZER;CN=Bob Stone:mailto:${bob[1]}`, ...att([me, bob])]);
  // 2. Room booked by me, nobody else invited: not a meeting.
  ev('room', 'Room hold', '20260305T100000Z', '20260305T110000Z', [`ORGANIZER;CN=Me:mailto:${SELF}`, ...att([me, ['Room 4.01', 'room401@example.com', ';CUTYPE=ROOM']])]);
  // 3. All hands with 200 people, four times: counts as meetings, not as collaborators.
  const crowd = Array.from({ length: 200 }, (_, i) => [`Person ${i}`, `p${i}@example.com`]);
  ev('allhands', 'All hands', '20260310T160000Z', '20260310T170000Z', ['RRULE:FREQ=WEEKLY;COUNT=4', `ORGANIZER;CN=CEO:mailto:ceo@example.com`, ...att([me, ...crowd])]);
  // 4. Three 1:1s with Bob: Bob should be the top collaborator.
  ev('bob1', 'Bob / Me', '20260311T100000Z', '20260311T103000Z', ['RRULE:FREQ=WEEKLY;COUNT=3', `ORGANIZER;CN=Bob Stone:mailto:${bob[1]}`, ...att([me, bob])]);
  // 5. Google working-location entries: ignored.
  for (let d = 16; d <= 20; d++) ev(`wl${d}`, d % 2 ? 'Home' : 'Office', `202603${d};VALUE=DATE`.replace(/^/, ''), `202603${d + 1}`, []);
  // 6. The same occurrence exported twice: counted once.
  ev('dup', 'Partner call', '20260312T140000Z', '20260312T150000Z', [`ORGANIZER;CN=Bob Stone:mailto:${bob[1]}`, ...att([me, bob])]);
  ev('dup', 'Partner call', '20260312T140000Z', '20260312T150000Z', [`ORGANIZER;CN=Bob Stone:mailto:${bob[1]}`, ...att([me, bob])]);
  // 7. Weekly series with two EXDATEs: 6 - 2 = 4 occurrences.
  ev('exd', 'Design crit', '20260302T150000Z', '20260302T160000Z', ['RRULE:FREQ=WEEKLY;COUNT=6', 'EXDATE:20260309T150000Z,20260316T150000Z', `ORGANIZER;CN=Bob Stone:mailto:${bob[1]}`, ...att([me, bob])]);
  // 8. Outlook-style cancelled meeting left in the calendar.
  ev('cxl', 'Canceled: Board prep', '20260313T090000Z', '20260313T100000Z', [`ORGANIZER;CN=Bob Stone:mailto:${bob[1]}`, ...att([me, bob])]);
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Edge//Fixture//EN', `X-WR-CALNAME:${SELF}`, ...lines, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  // The working-location lines above were written with DTSTART:...;VALUE=DATE; fix them into proper DATE params.
  return text.replace(/DTSTART:(\d{8});VALUE=DATE/g, 'DTSTART;VALUE=DATE:$1').replace(/DTEND:(\d{8})\r\n/g, 'DTEND;VALUE=DATE:$1\r\n');
}

// ---------------------------------------------------------------- Google API
function googleApi() {
  const self = 'alex.morgan@northwindlabs.com';
  const att = (extra = []) => [{ email: self, self: true, responseStatus: 'accepted', displayName: 'Alex Morgan' }, ...extra];
  const priya = { email: 'priya.shah@northwindlabs.com', displayName: 'Priya Shah', responseStatus: 'accepted' };
  const items = [];
  for (let w = 0; w < 10; w++) {
    const d = new Date(Date.UTC(YEAR, 0, 6 + w * 7, 14));
    items.push({ id: `weekly_${w}`, iCalUID: 'weekly@google.com', recurringEventId: 'weekly', status: 'confirmed', summary: 'Weekly Sync', start: { dateTime: d.toISOString(), timeZone: 'Europe/London' }, end: { dateTime: new Date(d.getTime() + 3600e3).toISOString() }, organizer: { email: priya.email, displayName: 'Priya Shah' }, attendees: att([priya, { email: 'room@resource.calendar.google.com', resource: true, responseStatus: 'accepted' }]), eventType: 'default' });
  }
  items.push({ id: 'declined1', iCalUID: 'd1@google.com', status: 'confirmed', summary: 'Optional townhall', start: { dateTime: `${YEAR}-02-03T10:00:00Z` }, end: { dateTime: `${YEAR}-02-03T11:00:00Z` }, organizer: { email: priya.email }, attendees: [{ email: self, self: true, responseStatus: 'declined' }, priya] });
  items.push({ id: 'cancel1', status: 'cancelled', recurringEventId: 'weekly', originalStartTime: { dateTime: `${YEAR}-03-17T14:00:00Z` } });
  items.push({ id: 'focus1', iCalUID: 'f1@google.com', status: 'confirmed', summary: 'Focus time', eventType: 'focusTime', start: { dateTime: `${YEAR}-02-04T09:00:00Z` }, end: { dateTime: `${YEAR}-02-04T11:00:00Z` }, organizer: { email: self, self: true }, transparency: 'opaque' });
  items.push({ id: 'wl1', iCalUID: 'wl1@google.com', status: 'confirmed', summary: 'Home', eventType: 'workingLocation', start: { date: `${YEAR}-02-05` }, end: { date: `${YEAR}-02-06` }, organizer: { email: self, self: true }, transparency: 'transparent' });
  items.push({ id: 'ooo1', iCalUID: 'o1@google.com', status: 'confirmed', summary: 'Away', eventType: 'outOfOffice', start: { dateTime: `${YEAR}-04-06T00:00:00+01:00` }, end: { dateTime: `${YEAR}-04-11T00:00:00+01:00` }, organizer: { email: self, self: true } });
  items.push({ id: 'allday1', iCalUID: 'a1@google.com', status: 'confirmed', summary: 'Hotel: Scandic Oslo', start: { date: `${YEAR}-06-17` }, end: { date: `${YEAR}-06-19` }, organizer: { email: self, self: true }, transparency: 'transparent' });
  return { kind: 'calendar#events', summary: self, timeZone: 'Europe/London', items };
}

write('sample/outlook-web.ics', outlook({ withAttendees: false }));
write('sample/outlook-desktop.ics', outlook({ withAttendees: true }));
TEAM.forEach((m) => write(`sample/team/${m[0].split(' ')[0].toLowerCase()}.ics`, teamCalendar(m)));
write('tests/fixtures/edge.ics', edge());
write('tests/fixtures/google-events.json', JSON.stringify(googleApi(), null, 2));
console.log(`Fixtures written for ${YEAR}: outlook-web, outlook-desktop, team/*4, edge, google-events`);
