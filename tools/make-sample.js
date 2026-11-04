#!/usr/bin/env node
// Generates realistic sample calendars (work + personal) for demos and tests.
// Usage: node tools/make-sample.js [year]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const YEAR = Number(process.argv[2]) || new Date().getFullYear();

let seed = 20261104;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

const SELF = 'alex.morgan@northwindlabs.com';
const PEOPLE = [
  ['Priya Shah', 'priya.shah@northwindlabs.com'], ['Tom Hendricks', 'tom.hendricks@northwindlabs.com'],
  ['Maja Lindqvist', 'maja.lindqvist@northwindlabs.com'], ['Daniel Okafor', 'daniel.okafor@northwindlabs.com'],
  ['Sofie de Vries', 'sofie.devries@northwindlabs.com'], ['Jonas Berg', 'jonas.berg@northwindlabs.com'],
  ['Hannah Clarke', 'hannah.clarke@northwindlabs.com'], ['Lucas Meyer', 'lucas.meyer@northwindlabs.com'],
  ['Emma Walsh', 'emma.walsh@northwindlabs.com'], ['Rafael Costa', 'rafael.costa@northwindlabs.com'],
  ['Kate Thornton', 'kate@acme-customer.co.uk'], ['Oliver Brandt', 'oliver.brandt@contoso-bank.com'],
];
const FRIENDS = [['Sam', 'sam.r@gmail.com'], ['Jess', 'jess.k@gmail.com'], ['Mo', 'mo.h@outlook.com'], ['Chloe', 'chloe.b@gmail.com'], ['Dan', 'dan.w@gmail.com'], ['Mum', 'mum@family.net']];

const pad = (n) => String(n).padStart(2, '0');
const fmtLocal = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const fmtDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const TZ = 'Europe/London';
let uidN = 0;
const uid = () => `sample-${YEAR}-${++uidN}@calendarwrapped`;

function attendeeLines(list, selfStatus = 'ACCEPTED') {
  const lines = [`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${selfStatus};CN=Alex Morgan:mailto:${SELF}`];
  for (const [name, email] of list) lines.push(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${pick(['ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'TENTATIVE', 'NEEDS-ACTION'])};CN=${name}:mailto:${email}`);
  return lines;
}

function vevent({ title, start, end, allDay = false, attendees = [], organizer = SELF, rrule = null, description = '', location = '', selfStatus = 'ACCEPTED' }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid()}`, `DTSTAMP:${YEAR}0101T000000Z`, `SUMMARY:${esc(title)}`];
  if (allDay) { lines.push(`DTSTART;VALUE=DATE:${fmtDate(start)}`, `DTEND;VALUE=DATE:${fmtDate(end)}`); }
  else { lines.push(`DTSTART;TZID=${TZ}:${fmtLocal(start)}`, `DTEND;TZID=${TZ}:${fmtLocal(end)}`); }
  if (rrule) lines.push(`RRULE:${rrule}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (attendees.length || organizer !== SELF) {
    const orgName = PEOPLE.find((p) => p[1] === organizer)?.[0] || 'Alex Morgan';
    lines.push(`ORGANIZER;CN=${orgName}:mailto:${organizer}`);
    lines.push(...attendeeLines(attendees, selfStatus));
  }
  lines.push('STATUS:CONFIRMED', 'END:VEVENT');
  return lines.join('\r\n');
}

let Y = YEAR; // the year at() builds dates in; switched briefly to add last year's history
const at = (month, day, h = 0, m = 0) => new Date(Y, month - 1, day, h, m);
const plus = (d, mins) => new Date(d.getTime() + mins * 60000);

function header(name) {
  return ['BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${name}`, `X-WR-TIMEZONE:${TZ}`,
    'BEGIN:VTIMEZONE', `TZID:${TZ}`, 'X-LIC-LOCATION:Europe/London',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:BST', 'DTSTART:19700329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:GMT', 'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'].join('\r\n');
}

function workCalendar() {
  const ev = [];
  const team = PEOPLE.slice(0, 6);
  // Recurring
  ev.push(vevent({ title: 'Daily standup', start: at(1, 5, 9, 30), end: at(1, 5, 9, 45), attendees: team, organizer: PEOPLE[0][1], rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', description: 'Yesterday / today / blockers' }));
  ev.push(vevent({ title: 'Weekly Sync', start: at(1, 6, 14, 0), end: at(1, 6, 15, 0), attendees: PEOPLE.slice(0, 9), organizer: PEOPLE[1][1], rrule: 'FREQ=WEEKLY;BYDAY=TU' }));
  ev.push(vevent({ title: 'Priya / Alex 1:1', start: at(1, 7, 11, 0), end: at(1, 7, 11, 30), attendees: [PEOPLE[0]], organizer: PEOPLE[0][1], rrule: 'FREQ=WEEKLY;BYDAY=WE', description: 'Notes doc: go/alex-priya' }));
  ev.push(vevent({ title: 'Tom / Alex 1:1', start: at(1, 8, 16, 0), end: at(1, 8, 16, 30), attendees: [PEOPLE[1]], rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH' }));
  ev.push(vevent({ title: 'Pipeline review', start: at(1, 9, 10, 0), end: at(1, 9, 11, 0), attendees: PEOPLE.slice(0, 8), organizer: PEOPLE[2][1], rrule: 'FREQ=WEEKLY;BYDAY=FR' }));
  ev.push(vevent({ title: 'All Hands', start: at(1, 15, 16, 0), end: at(1, 15, 17, 0), attendees: PEOPLE.slice(0, 10), organizer: PEOPLE[3][1], rrule: 'FREQ=MONTHLY;BYDAY=3TH', description: 'Company all hands. Recording shared after.' }));
  ev.push(vevent({ title: 'Sprint planning', start: at(1, 12, 13, 0), end: at(1, 12, 15, 0), attendees: team, organizer: PEOPLE[1][1], rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO' }));
  ev.push(vevent({ title: 'Retro', start: at(1, 16, 15, 0), end: at(1, 16, 16, 0), attendees: team, organizer: PEOPLE[1][1], rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR' }));
  ev.push(vevent({ title: 'Focus time', start: at(1, 5, 8, 0), end: at(1, 5, 9, 30), rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' }));
  ev.push(vevent({ title: 'Lunch', start: at(1, 5, 12, 30), end: at(1, 5, 13, 15), rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }));

  // Ad-hoc meetings across the year
  const adhocTitles = ['Customer call: Acme', 'Contoso Bank - architecture review', 'Deal review', 'Quick chat', 'Demo prep', 'Interview: Senior SE', 'Q-planning', 'Proposal walkthrough', 'Sync', 'Partner catch up', 'Onboarding session', 'Escalation: prod alerts', 'Roadmap feedback', 'Catch up', 'Dashboard review', 'Sync', 'Pricing discussion', 'Offsite planning', 'Lunch & learn: SLOs'];
  for (let month = 1; month <= 12; month++) {
    const density = [10, 11, 12, 10, 12, 14, 9, 6, 14, 15, 13, 7][month - 1];
    for (let i = 0; i < density * 2; i++) {
      const day = 1 + Math.floor(rand() * 28);
      const d = at(month, day, 8 + Math.floor(rand() * 10), pick([0, 0, 30, 30, 15, 45]));
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const len = pick([30, 30, 30, 45, 60, 60, 90]);
      const nAtt = pick([1, 1, 2, 3, 4, 6, 9, 12]);
      const attendees = [...PEOPLE].sort(() => rand() - 0.5).slice(0, nAtt);
      const title = pick(adhocTitles);
      ev.push(vevent({ title, start: d, end: plus(d, len), attendees, organizer: chance(0.4) ? SELF : pick(attendees)[1], description: chance(0.55) ? '' : 'Agenda:\n1. Context\n2. Decisions\n3. Next steps', selfStatus: chance(0.12) ? 'NEEDS-ACTION' : chance(0.06) ? 'DECLINED' : 'ACCEPTED' }));
    }
  }
  // Early / late calls (US & APAC)
  for (let i = 0; i < 40; i++) {
    const month = 1 + Math.floor(rand() * 12); const day = 1 + Math.floor(rand() * 28);
    const d = chance(0.5) ? at(month, day, 7, 30) : at(month, day, 18, 0);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    ev.push(vevent({ title: chance(0.5) ? 'US sync' : 'APAC handover', start: d, end: plus(d, 45), attendees: PEOPLE.slice(6, 10), organizer: PEOPLE[7][1] }));
  }
  // Travel
  const trips = [[5, 18, 'New York', 'BA117'], [2, 10, 'Stockholm', 'BA778'], [3, 24, 'Amsterdam', 'KL1008'], [5, 12, 'Copenhagen', 'SK502'], [6, 17, 'Oslo', 'BA762'], [9, 8, 'Amsterdam', 'KL1012'], [10, 20, 'Helsinki', 'AY1332'], [11, 3, 'Stockholm', 'BA776']];
  for (const [m, dday, city, code] of trips) {
    const out = at(m, dday, 7, 15); const back = at(m, dday + 2, 18, 40);
    ev.push(vevent({ title: `✈ Flight to ${city} (${code})`, start: out, end: plus(out, 150), location: 'London Heathrow (LHR)' }));
    ev.push(vevent({ title: `Hotel: Scandic ${city}`, start: at(m, dday), end: at(m, dday + 2), allDay: true }));
    ev.push(vevent({ title: `✈ Flight to London (${code.slice(0, 2)}${Number(code.slice(2)) + 1})`, start: back, end: plus(back, 150), location: `${city} Airport` }));
    ev.push(vevent({ title: `Customer workshop - ${city}`, start: at(m, dday + 1, 9, 30), end: at(m, dday + 1, 16, 0), attendees: [PEOPLE[10], PEOPLE[0]], organizer: PEOPLE[10][1] }));
  }
  ev.push(vevent({ title: 'Eurostar to Paris', start: at(4, 14, 8, 1), end: at(4, 14, 11, 20), location: 'London St Pancras' }));
  // OOO
  ev.push(vevent({ title: 'Annual leave', start: at(4, 7), end: at(4, 12), allDay: true }));
  ev.push(vevent({ title: 'OOO - holiday', start: at(8, 10), end: at(8, 22), allDay: true }));
  ev.push(vevent({ title: 'Bank holiday', start: at(5, 25), end: at(5, 26), allDay: true }));
  ev.push(vevent({ title: 'Annual leave', start: at(12, 22), end: at(12, 32), allDay: true }));
  // Last year, lighter: a weekly sync and fewer ad-hoc meetings, so year-over-year has something to say.
  // Generated after this year's events so this year's random sequence is unchanged.
  Y = YEAR - 1;
  ev.push(vevent({ title: 'Weekly Sync', start: at(1, 7, 14, 0), end: at(1, 7, 15, 0), attendees: PEOPLE.slice(0, 7), organizer: PEOPLE[1][1], rrule: `FREQ=WEEKLY;BYDAY=WE;UNTIL=${YEAR - 1}1231T235959Z` }));
  for (let month = 1; month <= 12; month++) {
    for (let i = 0; i < 16; i++) {
      const d = at(month, 1 + Math.floor(rand() * 28), 9 + Math.floor(rand() * 8), pick([0, 30]));
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      ev.push(vevent({ title: pick(adhocTitles), start: d, end: plus(d, pick([30, 60])), attendees: [...PEOPLE].sort(() => rand() - 0.5).slice(0, pick([1, 2, 3, 5])) }));
    }
  }
  Y = YEAR;
  return [header(SELF), ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

function personalCalendar() {
  const ev = [];
  ev.push(vevent({ title: 'Gym', start: at(1, 5, 7, 0), end: at(1, 5, 8, 0), rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }));
  ev.push(vevent({ title: 'Parkrun', start: at(1, 3, 9, 0), end: at(1, 3, 10, 0), rrule: 'FREQ=WEEKLY;BYDAY=SA' }));
  ev.push(vevent({ title: 'Five-a-side football', start: at(1, 8, 19, 0), end: at(1, 8, 20, 0), rrule: 'FREQ=WEEKLY;BYDAY=TH', attendees: [FRIENDS[0], FRIENDS[2], FRIENDS[4]] }));
  ev.push(vevent({ title: 'Call Mum', start: at(1, 4, 18, 30), end: at(1, 4, 19, 0), rrule: 'FREQ=WEEKLY;BYDAY=SU', attendees: [FRIENDS[5]] }));
  ev.push(vevent({ title: 'Spanish class', start: at(1, 6, 19, 0), end: at(1, 6, 20, 30), rrule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20260630T000000Z' }));
  const social = ['Dinner with {p}', 'Drinks with {p}', 'Brunch with {p}', 'Coffee with {p}', 'Pub quiz', 'Cinema: new release', 'Gig at Brixton', 'Theatre - matinee', 'Sunday roast', 'BBQ at {p}\'s'];
  for (let month = 1; month <= 12; month++) {
    const n = [5, 6, 7, 8, 9, 11, 10, 8, 8, 7, 6, 12][month - 1];
    for (let i = 0; i < n; i++) {
      const day = 1 + Math.floor(rand() * 28);
      const d = at(month, day, pick([12, 13, 18, 19, 19, 20]), pick([0, 30]));
      const friend = pick(FRIENDS.slice(0, 5));
      const title = pick(social).replace('{p}', friend[0]);
      ev.push(vevent({ title, start: d, end: plus(d, pick([90, 120, 150, 180])), attendees: /{p}|with|BBQ/.test(title) || chance(0.5) ? [friend] : [] }));
    }
  }
  const appts = ['Dentist', 'Doctor', 'Haircut', 'Physio', 'Car MOT', 'Optician', 'Plumber coming', 'Delivery window'];
  for (let i = 0; i < 24; i++) { const d = at(1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28), 9 + Math.floor(rand() * 8), 0); ev.push(vevent({ title: pick(appts), start: d, end: plus(d, 60) })); }
  for (const [m, dd, who] of [[2, 14, 'Sam'], [3, 9, 'Mum'], [6, 21, 'Jess'], [9, 2, 'Dan'], [11, 30, 'Chloe']]) ev.push(vevent({ title: `${who}'s birthday`, start: at(m, dd), end: at(m, dd + 1), allDay: true }));
  const trips = [[2, 20, 'Lisbon', 'TP1359'], [5, 23, 'Edinburgh', null], [7, 18, 'Barcelona', 'VY7821'], [10, 9, 'Berlin', 'BA982']];
  for (const [m, dd, city, code] of trips) {
    const out = at(m, dd, 10, 20);
    ev.push(vevent({ title: code ? `✈ Flight to ${city} (${code})` : `Train to ${city}`, start: out, end: plus(out, code ? 160 : 270) }));
    ev.push(vevent({ title: `Airbnb ${city}`, start: at(m, dd), end: at(m, dd + 3), allDay: true }));
    ev.push(vevent({ title: code ? `✈ Flight to London` : `Train to London`, start: at(m, dd + 3, 16, 0), end: at(m, dd + 3, 18, 40) }));
  }
  ev.push(vevent({ title: 'Holiday - Cornwall', start: at(8, 8), end: at(8, 16), allDay: true }));
  ev.push(vevent({ title: 'Christmas at Mum\'s', start: at(12, 24), end: at(12, 28), allDay: true }));
  return [header('Alex (personal)'), ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

const outDir = join(__dirname, '..', 'sample');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'work.ics'), workCalendar());
writeFileSync(join(outDir, 'personal.ics'), personalCalendar());
console.log(`Wrote sample/work.ics and sample/personal.ics for ${YEAR}`);
