#!/usr/bin/env node
// Diagnose a real export without opening the app: node tools/inspect.js path/to/file.ics [--titles]
// Use it when testing Outlook tenants and odd calendars. Titles are hidden unless --titles is passed.
import { readFileSync } from 'node:fs';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats } from '../js/stats.js';

const file = process.argv[2];
const showTitles = process.argv.includes('--titles');
if (!file) { console.error('Usage: node tools/inspect.js file.ics [--titles]'); process.exit(1); }
const text = readFileSync(file, 'utf8');
const y = new Date().getFullYear();
const range = { rangeStart: new Date(y - 2, 0, 1), rangeEnd: new Date(y + 1, 0, 1) };
const { events, meta } = parseICS(text, range);
const tzids = [...new Set([...text.matchAll(/TZID[=:]"?([^:;"\r\n]+)/g)].map((m) => m[1]))];
const self = guessSelfEmail(events, meta);
const timed = events.filter((e) => !e.allDay);
const withAtt = timed.filter((e) => e.attendees.length).length;
const s = computeStats(events, { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y + 1, 0, 1), selfEmail: self });
const line = (k, v) => console.log(`${k.padEnd(28)} ${v}`);
line('Producer', meta.prodId || '(none)');
line('Detected source', meta.source);
line('Calendar name', meta.calendarName || '(none)');
line('Owner guess', self || '(none, attendee data missing)');
line('Time zones referenced', tzids.join(', ') || '(none, UTC or floating)');
line('Raw VEVENTs', meta.rawEventCount);
line('Occurrences (3 yrs)', events.length);
line('All-day / timed', `${events.length - timed.length} / ${timed.length}`);
line('Timed with attendees', `${withAtt} (${timed.length ? Math.round((withAtt / timed.length) * 100) : 0}%)`);
line('Recurring occurrences', events.filter((e) => e.isRecurring).length);
line('Cancelled', events.filter((e) => e.status === 'CANCELLED').length);
line('Free/transparent', events.filter((e) => e.transparent).length);
line(`Mode for ${y}`, `${s.mode} (detected ${s.detectedMode})`);
if (s.mode === 'work') {
  line('Meetings', `${s.meetings}, ${s.totalHours} hrs, ${s.shareOfWork}% of working time`);
  line('Collaborators found', s.uniquePeople);
  line('Recurring series', s.recurringCount);
} else {
  line('Plans', `${s.events}, ${s.totalHours} hrs`);
}
line('Persona', `${s.persona.emoji} ${s.persona.name}`);
line('Suggestions', s.reclaim.suggestions.length);
if (showTitles) console.log('\nTop titles:', s.topTitles.map((t) => `${t.key} (${t.count})`).join(', '));
if (!withAtt && timed.length) console.log('\nNote: no attendee data. Outlook web publishing usually strips it; the app falls back to counting every timed event.');
