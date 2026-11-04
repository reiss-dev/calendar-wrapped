// Turns a suggestion into something the person can do in one tap:
// a ready-to-send message, a calendar block to import, or the exact settings to change.
import { t, weekdayName } from './i18n.js';
import { CONFIG } from './config.js';

const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const firstName = (s) => String(s || '').split(/[\s.@]/)[0].replace(/^./, (c) => c.toUpperCase());

/** Next date (from tomorrow) that falls on `weekday` (0 = Sunday). */
export function nextWeekday(weekday, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** A weekly recurring block as an .ics file. Floating local time, so it lands at the same clock time in any calendar. */
export function blockIcs({ title, description = '', days, startHour, startMin = 0, minutes, from = new Date(), uid }) {
  const first = nextWeekday(days[0], from);
  first.setHours(startHour, startMin, 0, 0);
  const end = new Date(first.getTime() + minutes * 60000);
  const id = uid || `${first.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}@${CONFIG.brand.domain}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${CONFIG.brand.name}//Reclaim//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${id}`, `DTSTAMP:${stamp(new Date())}`, `SUMMARY:${esc(title)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    `DTSTART:${local(first)}`, `DTEND:${local(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => DAYS[d]).join(',')}`,
    'TRANSP:OPAQUE', 'X-MICROSOFT-CDO-BUSYSTATUS:BUSY', 'STATUS:CONFIRMED',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-PT10M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n') + '\r\n';
}

/** An all-day hold from `start` to `end` (inclusive, 'YYYY-MM-DD'), shown as out of office. */
export function leaveIcs({ title, start, end, description = '' }) {
  const ymd = (k) => k.replace(/-/g, '');
  const [y, m, d] = end.split('-').map(Number);
  const after = new Date(y, m - 1, d + 1);
  const id = `leave-${ymd(start)}-${Math.random().toString(36).slice(2, 10)}@${CONFIG.brand.domain}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${CONFIG.brand.name}//Planner//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${id}`, `DTSTAMP:${stamp(new Date())}`, `SUMMARY:${esc(title)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${after.getFullYear()}${pad(after.getMonth() + 1)}${pad(after.getDate())}`,
    'TRANSP:OPAQUE', 'X-MICROSOFT-CDO-BUSYSTATUS:OOF', 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE', 'STATUS:TENTATIVE',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n') + '\r\n';
}

const mailto = (to, subject, body) => `mailto:${to ? encodeURIComponent(to) : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

function message(kind, x, sender) {
  const s = x.series || {};
  const to = firstName(s.organizer?.name || s.organizer?.email) || t('there');
  const sign = sender ? `\n\n${sender}` : '';
  const p = { name: to, title: s.title || '', minutes: s.durationMin, shorter: (s.durationMin || 30) - 5 };
  const T = {
    cadence: [t('Could “{title}” go fortnightly?', p), t('Hi {name},\n\nI’ve been looking at where my meeting time goes, and “{title}” is one of the biggest chunks. Would you be open to trying it every other week for a month, with written updates in between? If it doesn’t work we can switch back.\n\nThanks!', p)],
    async: [t('Trying “{title}” async twice a week?', p), t('Hi {name},\n\nWould you be up for running “{title}” as a written update on two days a week? Everyone posts their update in the channel by 10am, and we keep the live call for the other days. Happy to trial it for a month.\n\nThanks!', p)],
    shorten: [t('Shaving five minutes off “{title}”?', p), t('Hi {name},\n\nSmall idea: could we make “{title}” {shorter} minutes instead of {minutes}? It gives everyone a few minutes between calls and I don’t think we’d lose anything.\n\nThanks!', p)],
  }[kind];
  if (!T) return null;
  return { subject: T[0], body: T[1] + sign, to: s.organizer?.email || '' };
}

/** Every action available for one suggestion. */
export function actionsFor(x, { senderName = '', calendar = 'google' } = {}) {
  const out = [];
  const s = x.series || {};
  if (['cadence', 'async', 'shorten'].includes(x.kind)) {
    if (s.organizedBySelf) {
      out.push({ type: 'howto', label: t('You own this one'), steps: calendar === 'outlook'
        ? [t('Open the series in Outlook and choose Edit series.'), x.kind === 'shorten' ? t('Change the end time and save.') : t('Under Repeat, set it to every 2 weeks and save.'), t('Outlook sends the update to everyone.')]
        : [t('Open the event in Google Calendar and choose Edit.'), x.kind === 'shorten' ? t('Change the end time, then choose All events when saving.') : t('Under Does not repeat, choose Custom and set every 2 weeks. Save for all events.'), t('Choose Send to let everyone know.')] });
    } else {
      const m = message(x.kind, x, senderName);
      if (m) out.push({ type: 'message', label: t('Message the organiser'), ...m, mailto: mailto(m.to, m.subject, m.body) });
    }
  }
  if (x.kind === 'focus') {
    const day = Number.isInteger(x.quietestWeekday) ? x.quietestWeekday : 3;
    out.push({ type: 'ics', label: t('Add a weekly focus morning'), hint: t('Every {day}, 9:00 to 12:00', { day: weekdayName(day) }), filename: 'focus-morning.ics',
      content: blockIcs({ title: t('Focus time: no meetings'), description: t('Protected time for real work. Added by {brand}.', { brand: CONFIG.brand.name }), days: [day], startHour: 9, minutes: 180 }) });
  }
  if (x.kind === 'friday') {
    out.push({ type: 'ics', label: t('Block Friday afternoons'), hint: t('Every Friday, 14:00 to 17:00'), filename: 'friday-afternoons.ics',
      content: blockIcs({ title: t('Friday afternoon: no new meetings'), days: [5], startHour: 14, minutes: 180 }) });
  }
  if (x.kind === 'evenings') {
    out.push({ type: 'ics', label: t('Keep one evening free'), hint: t('Every Wednesday, from 18:00'), filename: 'free-evening.ics',
      content: blockIcs({ title: t('Nothing planned, on purpose'), days: [3], startHour: 18, minutes: 240 }) });
  }
  if (x.kind === 'move') {
    out.push({ type: 'ics', label: t('Add two workouts a week'), hint: t('Tuesdays and Thursdays, 7:00 to 8:00'), filename: 'workouts.ics',
      content: blockIcs({ title: t('Workout'), days: [2, 4], startHour: 7, minutes: 60 }) });
  }
  if (x.kind === 'buffers') {
    out.push({ type: 'howto', label: t('Turn it on'), steps: calendar === 'outlook'
      ? [t('In Outlook, open Settings, then Calendar, then Events and invitations.'), t('Turn on Shorten duration for all events, ending meetings 5 or 10 minutes early.')]
      : [t('In Google Calendar, open Settings, then General, then Event settings.'), t('Tick Speedy meetings. New 30 and 60 minute meetings become 25 and 50.')] });
  }
  if (x.kind === 'hours') {
    out.push({ type: 'howto', label: t('Set it up'), steps: calendar === 'outlook'
      ? [t('In Outlook, open Settings, then Calendar, then View.'), t('Set your working hours and days. People booking you will see them.')]
      : [t('In Google Calendar, open Settings, then General, then Working hours and location.'), t('Turn on Working hours and set them. Google warns people who invite you outside them.')] });
  }
  if (x.kind === 'agenda' || x.kind === 'optional' || x.kind === 'rsvp') {
    const body = {
      agenda: t('Hi all,\n\nSmall request for our meetings: could we add two or three lines of agenda to the invite? If there isn’t one by the day before, I’ll assume it can be an email instead.\n\nThanks!'),
      optional: t('Hi,\n\nI’m going to switch myself to optional for this one and catch up from the notes. If there’s something you specifically need me for, give me a shout and I’ll be there.\n\nThanks!'),
      rsvp: t('Hi,\n\nI won’t make this one, so I’m declining to keep your numbers right. Happy to help async if you need anything from me.\n\nThanks!'),
    }[x.kind];
    out.push({ type: 'message', label: t('Copy a polite note'), subject: '', body: body + (senderName ? `\n\n${senderName}` : ''), to: '' });
  }
  if (x.kind === 'reconnect') {
    const name = firstName(x.person?.name);
    out.push({ type: 'message', label: t('Copy a message'), subject: '', to: '', body: t('Hey {name}! It’s been ages. Fancy a coffee or a drink in the next couple of weeks?', { name }) });
  }
  return out;
}
