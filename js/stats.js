// Stats engine. Pure functions over the event list produced by ics.js.
// Everything here is deterministic and DOM-free so it can be unit-tested.

const HOUR = 3600000;
const DAY = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const NON_MEETING_TITLE = /^(focus( time)?|lunch|break|busy|hold|block(ed)?|no meetings?|commute|gym|ooo|out of office|do not book|dnd|heads? down|deep work|admin|travel time)\b/i;
const WORKING_LOCATION = /^(home|office|working (from|at) .*|wfh|remote|in office|working location)$/i;
const CALL_LINK = /(teams\.microsoft|microsoft teams|zoom\.us|zoom meeting|meet\.google|google meet|webex|whereby|around\.co)/i;
const MAX_PEOPLE_PER_MEETING = 25; // bigger than this is a broadcast, not a collaboration
const OOO_TITLE = /\b(ooo|out of office|annual leave|holiday|vacation|pto|time off|sick|bank holiday|leave)\b/i;
const FLIGHT_RE = /(\bflight\b|✈|\b[A-Z]{2}\s?\d{2,4}\b.*\b(to|->|→)\b|\bdeparts?\b|\barrives?\b)/i;
const HOTEL_RE = /(\bhotel\b|\bstay at\b|\bcheck[- ]?in\b|\bairbnb\b|\baccommodation\b)/i;
const TRAIN_RE = /(\btrain\b|\beurostar\b|\brail\b)/i;
const FLIGHT_TO_RE = /(?:flight|fly|flying|train)\s+(?:to|→|->)\s+([A-Z][\w .'-]{1,30}?)(?:\s*[(\[-]|\s*$|,)/i;

const PERSONAL_CATEGORIES = [
  { key: 'fitness', label: 'Fitness', re: /\b(gym|workout|run|running|yoga|pilates|swim|cycling|ride|crossfit|climb|football|tennis|padel|hiit|boxing|hike|5k|10k|parkrun|training)\b/i },
  { key: 'food', label: 'Food & drinks', re: /\b(dinner|lunch|brunch|drinks|pub|coffee|restaurant|bbq|supper|breakfast|cocktails|beers?|wine)\b/i },
  { key: 'birthday', label: 'Birthdays', re: /\b(birthday|bday|b-day|turns \d+)\b/i },
  { key: 'health', label: 'Health & appointments', re: /\b(doctor|dentist|gp|physio|optician|hospital|clinic|appointment|therapy|vet)\b/i },
  { key: 'travel', label: 'Travel', re: /\b(flight|hotel|trip|holiday|airbnb|train|eurostar|weekend away|vacation)\b/i },
  { key: 'family', label: 'Family & kids', re: /\b(school|nursery|kids?|parents|mum|dad|family|pickup|pick up|drop off|nanny|grandma|grandad)\b/i },
  { key: 'culture', label: 'Culture & events', re: /\b(cinema|film|movie|theatre|gig|concert|show|festival|museum|gallery|match|game|comedy|exhibition)\b/i },
  { key: 'home', label: 'Home & errands', re: /\b(plumber|delivery|cleaner|haircut|barber|mot|car|dry cleaning|shopping|ikea|diy|garden)\b/i },
];

// ---------- helpers ----------
const hours = (ms) => ms / HOUR;
const round1 = (n) => Math.round(n * 10) / 10;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();

function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekStartDate(d) {
  const s = startOfDay(d);
  const diff = (s.getDay() + 6) % 7; // Monday = 0
  s.setDate(s.getDate() - diff);
  return s;
}

function normTitle(t) {
  return t
    .replace(/\s+/g, ' ')
    .replace(/^(fw|fwd|re|invitation|updated invitation|accepted|declined|canceled|cancelled):\s*/i, '')
    .replace(/\s*[-–|:]\s*(weekly|daily|monthly|biweekly|fortnightly)\s*$/i, '')
    .replace(/\s*@\s*.*$/, '')
    .trim();
}

function topN(map, n, { minCount = 1 } = {}) {
  return [...map.entries()]
    .filter(([, v]) => (typeof v === 'number' ? v : v.count) >= minCount)
    .sort((a, b) => (typeof a[1] === 'number' ? b[1] - a[1] : b[1].count - a[1].count))
    .slice(0, n)
    .map(([k, v]) => (typeof v === 'number' ? { key: k, count: v } : { key: k, ...v }));
}

function countWorkingDays(start, end) {
  let n = 0;
  for (let d = startOfDay(start); d < end; d.setDate(d.getDate() + 1)) {
    if (!isWeekend(d)) n++;
  }
  return n;
}

function displayName(att) {
  if (att.name && !/@/.test(att.name)) return att.name.replace(/"/g, '').trim();
  if (att.email) {
    const local = att.email.split('@')[0];
    return local.split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
  return 'Someone';
}

// ---------- classification ----------
export function detectMode(events) {
  const timed = events.filter((e) => !e.allDay && e.status !== 'CANCELLED');
  if (timed.length === 0) return { mode: 'personal', confidence: 0 };
  // Without attendee data (Outlook web publishing, Apple exports) fall back to when things
  // happen and whether they carry a video-call link.
  const withAttendees = timed.filter((e) => e.attendees.length > 0).length;
  if (withAttendees / timed.length < 0.1) {
    let office = 0, calls = 0;
    for (const e of timed) {
      const d = e.start;
      if (!isWeekend(d) && d.getHours() >= 8 && d.getHours() < 18) office++;
      if (CALL_LINK.test(`${e.location} ${e.description}`)) calls++;
    }
    const officeShare = office / timed.length;
    const callShare = calls / timed.length;
    const work = officeShare >= 0.7 || callShare >= 0.2;
    return { mode: work ? 'work' : 'personal', confidence: round1(Math.max(Math.abs(officeShare - 0.7), callShare) * 2) };
  }
  let workLike = 0;
  for (const e of timed) {
    const others = e.attendees.filter((a) => !a.isResource).length;
    const d = e.start;
    const officeHours = !isWeekend(d) && d.getHours() >= 7 && d.getHours() < 19;
    if (others >= 2 && officeHours) workLike++;
  }
  const ratio = workLike / timed.length;
  return { mode: ratio >= 0.35 ? 'work' : 'personal', confidence: round1(Math.abs(ratio - 0.35) * 2) };
}

function annotate(events, selfEmail) {
  return events.map((e) => {
    const self = selfEmail ? e.attendees.find((a) => a.email === selfEmail) : null;
    const others = e.attendees.filter((a) => a.email !== selfEmail && !a.isResource);
    const myStatus = self ? self.status : null;
    const organizedBySelf = !!(selfEmail && e.organizer?.email === selfEmail);
    const workingLocation = e.allDay && WORKING_LOCATION.test(e.title.trim());
    return { ...e, others, myStatus, organizedBySelf, workingLocation, durationH: hours(e.end - e.start) };
  });
}

function isMeeting(e, { attendeeInfoAvailable }) {
  if (e.allDay || e.status === 'CANCELLED' || e.transparent) return false;
  if (e.myStatus === 'DECLINED') return false;
  if (e.durationH < 5 / 60 || e.durationH > 8) return false;
  if (NON_MEETING_TITLE.test(e.title) && e.others.length === 0) return false;
  if (!attendeeInfoAvailable) return !NON_MEETING_TITLE.test(e.title) && !OOO_TITLE.test(e.title);
  return e.others.length >= 1 || (e.organizer && !e.organizedBySelf);
}

// ---------- shared stats ----------
function travelStats(all) {
  const travelEvents = all.filter((e) => e.status !== 'CANCELLED' && (FLIGHT_RE.test(e.title) || HOTEL_RE.test(e.title) || TRAIN_RE.test(e.title)));
  const flights = travelEvents.filter((e) => FLIGHT_RE.test(e.title) && !HOTEL_RE.test(e.title));
  const trains = travelEvents.filter((e) => TRAIN_RE.test(e.title) && !FLIGHT_RE.test(e.title));
  const hotelNights = travelEvents.filter((e) => HOTEL_RE.test(e.title)).reduce((n, e) => n + Math.max(1, Math.round((e.end - e.start) / DAY)), 0);
  const places = new Map();
  for (const e of travelEvents) {
    const m = e.title.match(FLIGHT_TO_RE);
    const place = m ? m[1].trim() : (e.location || '').split(',')[0].trim();
    if (place && place.length > 1 && place.length < 32) places.set(place, (places.get(place) || 0) + 1);
  }
  // Drop the home city: a place that shows up in most itineraries is where you fly back to.
  const placeList = [...places.entries()].sort((a, b) => b[1] - a[1]);
  if (placeList.length >= 3 && placeList[0][1] >= Math.max(2, 2 * placeList[1][1])) places.delete(placeList[0][0]);
  // Trips: cluster travel events within 3 days of each other.
  let trips = 0;
  let last = null;
  for (const e of travelEvents.sort((a, b) => a.start - b.start)) {
    if (!last || e.start - last > 3 * DAY) trips++;
    last = e.end;
  }
  const oooDays = new Set();
  for (const e of all) {
    if (e.allDay && OOO_TITLE.test(e.title)) {
      for (let d = startOfDay(e.start); d < e.end; d.setDate(d.getDate() + 1)) if (!isWeekend(d)) oooDays.add(dayKey(d));
    }
  }
  return {
    flights: flights.length,
    trains: trains.length,
    hotelNights,
    trips,
    places: topN(places, 6),
    daysOff: oooDays.size,
    found: travelEvents.length > 0 || oooDays.size > 0,
  };
}

function monthlyBreakdown(items, rangeStart, rangeEnd, valueFn) {
  const out = [];
  for (let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1); m < rangeEnd; m.setMonth(m.getMonth() + 1)) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const inMonth = items.filter((e) => e.start >= m && e.start < next);
    out.push({ month: MONTHS[m.getMonth()], short: MONTHS[m.getMonth()].slice(0, 3), year: m.getFullYear(), count: inMonth.length, value: round1(inMonth.reduce((s, e) => s + valueFn(e), 0)) });
  }
  return out;
}

function weekdayBreakdown(items, valueFn) {
  const out = WEEKDAYS.map((name) => ({ day: name, short: name.slice(0, 3), count: 0, value: 0 }));
  for (const e of items) { out[e.start.getDay()].count++; out[e.start.getDay()].value += valueFn(e); }
  return out.map((d) => ({ ...d, value: round1(d.value) }));
}

function hourHistogram(items) {
  const out = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const e of items) out[e.start.getHours()].count++;
  return out;
}

function streaks(items, rangeStart, rangeEnd, { workdaysOnly }) {
  const busy = new Set(items.map((e) => dayKey(e.start)));
  const today = new Date();
  const end = rangeEnd < today ? rangeEnd : startOfDay(today);
  let bestFree = { length: 0, start: null, end: null };
  let bestBusy = { length: 0, start: null, end: null };
  let curFree = { length: 0, start: null };
  let curBusy = { length: 0, start: null };
  for (let d = startOfDay(rangeStart); d <= end; d.setDate(d.getDate() + 1)) {
    if (workdaysOnly && isWeekend(d)) continue;
    const k = dayKey(d);
    if (busy.has(k)) {
      curBusy.length ? curBusy.length++ : (curBusy = { length: 1, start: new Date(d) });
      if (curBusy.length > bestBusy.length) bestBusy = { length: curBusy.length, start: curBusy.start, end: new Date(d) };
      curFree = { length: 0, start: null };
    } else {
      curFree.length ? curFree.length++ : (curFree = { length: 1, start: new Date(d) });
      if (curFree.length > bestFree.length) bestFree = { length: curFree.length, start: curFree.start, end: new Date(d) };
      curBusy = { length: 0, start: null };
    }
  }
  return { longestFree: bestFree, longestBusy: bestBusy };
}

function people(items, selfEmail) {
  const map = new Map();
  for (const e of items) {
    if (e.others.length > MAX_PEOPLE_PER_MEETING) continue;
    for (const a of e.others) {
      const key = a.email || a.name;
      if (!key) continue;
      const cur = map.get(key) || { name: displayName(a), email: a.email, count: 0, hours: 0, firstSeen: e.start, lastSeen: e.start };
      cur.count++;
      cur.hours += e.durationH;
      if (e.start < cur.firstSeen) cur.firstSeen = e.start;
      if (e.start > cur.lastSeen) cur.lastSeen = e.start;
      map.set(key, cur);
    }
  }
  return [...map.values()].map((p) => ({ ...p, hours: round1(p.hours) })).sort((a, b) => b.count - a.count);
}

// ---------- work mode ----------
function workStats(all, ctx) {
  const { rangeStart, rangeEnd, workHoursPerWeek } = ctx;
  const meetings = all.filter((e) => isMeeting(e, ctx));
  const totalHours = meetings.reduce((s, e) => s + e.durationH, 0);
  const workingDays = countWorkingDays(rangeStart, rangeEnd < new Date() ? rangeEnd : new Date());
  const availableHours = workingDays * (workHoursPerWeek / 5);
  const shareOfWork = availableHours ? totalHours / availableHours : 0;

  // Weeks
  const weeks = new Map();
  for (const e of meetings) {
    const k = isoWeekKey(e.start);
    const cur = weeks.get(k) || { key: k, start: weekStartDate(e.start), count: 0, hours: 0 };
    cur.count++; cur.hours += e.durationH; weeks.set(k, cur);
  }
  const weekList = [...weeks.values()].map((w) => ({ ...w, hours: round1(w.hours) }));
  const worstWeek = weekList.sort((a, b) => b.hours - a.hours)[0] || null;

  // Days
  const days = new Map();
  for (const e of meetings) {
    const k = dayKey(e.start);
    const cur = days.get(k) || { key: k, date: startOfDay(e.start), count: 0, hours: 0, events: [] };
    cur.count++; cur.hours += e.durationH; cur.events.push(e); days.set(k, cur);
  }
  const dayList = [...days.values()];
  const worstDay = [...dayList].sort((a, b) => b.hours - a.hours)[0] || null;

  // Back-to-back + fragmentation
  let backToBack = 0;
  let b2bDays = 0;
  let fragmentedDays = 0;
  let maxChain = { length: 0, date: null };
  for (const d of dayList) {
    const evs = d.events.sort((a, b) => a.start - b.start);
    let chain = 1;
    let dayB2b = 0;
    for (let i = 1; i < evs.length; i++) {
      const gap = (evs[i].start - evs[i - 1].end) / 60000;
      if (gap <= 5 && gap >= -30) { backToBack++; dayB2b++; chain++; } else chain = 1;
      if (chain > maxChain.length) maxChain = { length: chain, date: d.date };
    }
    if (dayB2b >= 3) b2bDays++;
    // Fragmented: no free 2h block between 9:00 and 17:30 on a day with >= 3 meetings
    if (evs.length >= 3) {
      let cursor = 9 * 60;
      let freeBlock = false;
      for (const e of evs) {
        const s = minutesOfDay(e.start);
        if (s - cursor >= 120) { freeBlock = true; break; }
        cursor = Math.max(cursor, minutesOfDay(e.end));
      }
      if (!freeBlock && 17.5 * 60 - cursor < 120) fragmentedDays++;
    }
  }

  // Titles & recurring series
  const titles = new Map();
  const series = new Map();
  for (const e of meetings) {
    const t = normTitle(e.title);
    titles.set(t, (titles.get(t) || 0) + 1);
    if (e.isRecurring) {
      const cur = series.get(e.uid) || { uid: e.uid, title: t, count: 0, hours: 0, attendees: e.others.length, organizedBySelf: e.organizedBySelf, durationMin: Math.round(e.durationH * 60) };
      cur.count++; cur.hours += e.durationH; series.set(e.uid, cur);
    }
  }
  const recurringSeries = [...series.values()].map((s) => ({ ...s, hours: round1(s.hours) })).sort((a, b) => b.hours - a.hours);
  const recurringHours = recurringSeries.reduce((s, x) => s + x.hours, 0);

  const collaborators = people(meetings, ctx.selfEmail);
  const oneToOnes = meetings.filter((e) => e.others.length === 1);
  const large = meetings.filter((e) => e.others.length >= 8);
  const earliest = [...meetings].sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start))[0] || null;
  const latest = [...meetings].sort((a, b) => minutesOfDay(b.end) - minutesOfDay(a.end))[0] || null;
  const longest = [...meetings].sort((a, b) => b.durationH - a.durationH)[0] || null;
  const earlyMeetings = meetings.filter((e) => minutesOfDay(e.start) < 8 * 60);
  const lateMeetings = meetings.filter((e) => minutesOfDay(e.end) > 18 * 60);
  const fridayPm = meetings.filter((e) => e.start.getDay() === 5 && e.start.getHours() >= 13);
  const noAgenda = meetings.filter((e) => e.others.length >= 2 && !e.description.trim());
  const unanswered = meetings.filter((e) => e.myStatus === 'NEEDS-ACTION' && !e.organizedBySelf);
  const organized = meetings.filter((e) => e.organizedBySelf);
  const declined = all.filter((e) => e.myStatus === 'DECLINED' && !e.allDay);
  const weekend = meetings.filter((e) => isWeekend(e.start));
  const monthly = monthlyBreakdown(meetings, rangeStart, ctx.fullEnd || rangeEnd, (e) => e.durationH);
  const busiestMonth = [...monthly].sort((a, b) => b.value - a.value)[0] || null;
  const quietestMonth = [...monthly].filter((m) => new Date(m.year, MONTHS.indexOf(m.month), 1) < new Date()).sort((a, b) => a.value - b.value)[0] || null;
  const byWeekday = weekdayBreakdown(meetings, (e) => e.durationH);
  const busiestWeekday = [...byWeekday].sort((a, b) => b.value - a.value)[0] || null;
  const st = streaks(meetings, rangeStart, rangeEnd, { workdaysOnly: true });
  const avgPerDay = dayList.length ? meetings.length / workingDays : 0;
  const avgLengthMin = meetings.length ? (totalHours / meetings.length) * 60 : 0;

  const stats = {
    mode: 'work',
    meetings: meetings.length,
    totalHours: round1(totalHours),
    workingDays,
    availableHours: Math.round(availableHours),
    shareOfWork: Math.round(shareOfWork * 100),
    workingWeeksEquivalent: round1(totalHours / workHoursPerWeek),
    avgPerWorkingDay: round1(avgPerDay),
    avgLengthMin: Math.round(avgLengthMin),
    worstWeek,
    weekly: [...weekList].sort((a, b) => a.start - b.start).map((w) => ({ start: w.start, hours: w.hours, count: w.count })),
    worstDay: worstDay ? { date: worstDay.date, count: worstDay.count, hours: round1(worstDay.hours) } : null,
    backToBack,
    backToBackDays: b2bDays,
    longestChain: maxChain,
    fragmentedDays,
    topTitles: topN(titles, 5),
    recurringSeries: recurringSeries.slice(0, 10),
    recurringCount: recurringSeries.length,
    recurringHours: round1(recurringHours),
    recurringShare: totalHours ? Math.round((recurringHours / totalHours) * 100) : 0,
    collaborators: collaborators.slice(0, 8),
    uniquePeople: collaborators.length,
    oneToOnes: oneToOnes.length,
    oneToOneHours: round1(oneToOnes.reduce((s, e) => s + e.durationH, 0)),
    largeMeetings: large.length,
    largeMeetingHours: round1(large.reduce((s, e) => s + e.durationH, 0)),
    earliest: earliest ? { title: earliest.title, start: earliest.start } : null,
    latest: latest ? { title: latest.title, end: latest.end } : null,
    longest: longest ? { title: longest.title, hours: round1(longest.durationH), start: longest.start } : null,
    earlyMeetings: earlyMeetings.length,
    lateMeetings: lateMeetings.length,
    outOfHoursHours: round1([...earlyMeetings, ...lateMeetings].reduce((s, e) => s + e.durationH, 0)),
    fridayPm: fridayPm.length,
    noAgenda: noAgenda.length,
    noAgendaHours: round1(noAgenda.reduce((s, e) => s + e.durationH, 0)),
    unanswered: unanswered.length,
    organized: organized.length,
    declined: declined.length,
    weekendMeetings: weekend.length,
    monthly,
    busiestMonth,
    quietestMonth,
    byWeekday,
    busiestWeekday,
    byHour: hourHistogram(meetings),
    longestFreeStreak: st.longestFree,
    longestBusyStreak: st.longestBusy,
    travel: travelStats(all),
    attendeeInfoAvailable: ctx.attendeeInfoAvailable,
  };
  stats.persona = workPersona(stats);
  stats.reclaim = reclaimSuggestions(stats, 365 / Math.max(30, (rangeEnd - rangeStart) / DAY));
  stats.equivalents = equivalents(totalHours);
  return stats;
}

function workPersona(s) {
  const options = [];
  if (s.meetings === 0) return { name: 'The Ghost', emoji: '👻', blurb: 'Not a single meeting found. Either you have achieved enlightenment or you exported the wrong calendar.' };
  if (s.shareOfWork >= 55) options.push([s.shareOfWork, { name: 'The Calendar Tetris Champion', emoji: '🧱', blurb: `Over half of your working hours were meetings. Your calendar is less a schedule, more a wall.` }]);
  if (s.backToBackDays >= 25) options.push([s.backToBackDays * 1.5, { name: 'The Firefighter', emoji: '🚒', blurb: `${s.backToBackDays} days of back-to-back meetings. You don't take breaks, you take hits.` }]);
  if (s.oneToOnes >= 80 && s.oneToOnes / s.meetings > 0.35) options.push([s.oneToOnes / 2, { name: 'The People Person', emoji: '🤝', blurb: `${s.oneToOnes} one-to-ones. You run on conversation and you know everyone's dog's name.` }]);
  if (s.earlyMeetings >= 30) options.push([s.earlyMeetings, { name: 'The Early Bird', emoji: '🌅', blurb: `${s.earlyMeetings} meetings before 8am. The worm never stood a chance.` }]);
  if (s.lateMeetings >= 30) options.push([s.lateMeetings, { name: 'The Night Owl', emoji: '🦉', blurb: `${s.lateMeetings} meetings running past 6pm. Time zones are a construct, apparently.` }]);
  if (s.travel.trips >= 8) options.push([s.travel.trips * 4, { name: 'The Road Warrior', emoji: '✈️', blurb: `${s.travel.trips} trips this year. Your laptop has seen more lounges than your sofa.` }]);
  if (s.recurringShare >= 60) options.push([s.recurringShare / 2, { name: 'The Creature of Habit', emoji: '🔁', blurb: `${s.recurringShare}% of your meeting time was recurring. Same time next week?` }]);
  if (s.organized / Math.max(1, s.meetings) >= 0.5) options.push([s.organized / 3, { name: 'The Ringleader', emoji: '🎪', blurb: `You organised ${s.organized} meetings. If there's a calendar invite, odds are you sent it.` }]);
  if (s.shareOfWork <= 20) options.push([40 - s.shareOfWork, { name: 'The Deep Worker', emoji: '🧘', blurb: `Only ${s.shareOfWork}% of your time in meetings. Protect it. People will try to take it.` }]);
  if (!options.length) return { name: 'The Balanced One', emoji: '⚖️', blurb: 'A respectable amount of meetings and a respectable amount of actual work. Suspicious.' };
  return options.sort((a, b) => b[0] - a[0])[0][1];
}

function equivalents(totalHours) {
  return [
    { label: 'full working weeks', value: round1(totalHours / 40) },
    { label: 'flights London to New York', value: Math.round(totalHours / 7.5) },
    { label: 'complete watches of The Office (US)', value: round1(totalHours / 73) },
    { label: 'marathons (at a steady 4h pace)', value: Math.round(totalHours / 4) },
  ];
}

export function reclaimSuggestions(s, annualize = 1) {
  const out = [];
  const yr = (h) => round1(h * annualize);
  const weeksLeft = 46; // working weeks in a typical year
  for (const r of s.recurringSeries.slice(0, 4)) {
    if (r.count < 8) continue;
    const perOccurrence = r.durationMin;
    const perWeek = r.count / Math.max(1, s.workingDays / 5);
    if (perWeek >= 3.5 && perOccurrence <= 30) {
      out.push({ kind: 'async', title: `Make “${r.title}” async twice a week`, detail: `${r.count} occurrences, ${r.hours}h. Daily meetings rarely need to be daily. Two written updates a week keeps the rhythm and gives everyone the time back.`, hoursPerYear: yr(r.hours * 0.4) });
      continue;
    }
    if (perOccurrence >= 30 && perOccurrence % 30 === 0) {
      out.push({ kind: 'shorten', title: `Trim “${r.title}” by 5 minutes`, detail: `${r.count} occurrences at ${perOccurrence} min. ${perOccurrence - 5} minute slots give everyone a breather and nobody notices the difference.`, hoursPerYear: yr(r.count * 5 / 60) });
    }
    if (perWeek >= 0.9 && perWeek <= 1.2 && perOccurrence >= 45) {
      out.push({ kind: 'cadence', title: `Move “${r.title}” to every other week`, detail: `It ran ${r.count} times for ${r.hours}h. Halving the cadence is the single biggest lever you have, and most weekly meetings survive it fine.`, hoursPerYear: yr(r.hours / 2) });
    }
  }
  if (s.largeMeetings >= 10) out.push({ kind: 'optional', title: `Go optional on big meetings`, detail: `${s.largeMeetings} meetings had 8+ people (${s.largeMeetingHours}h). If you spoke in fewer than half, you could read the notes instead.`, hoursPerYear: yr(s.largeMeetingHours / 2) });
  if (s.noAgenda >= 10) out.push({ kind: 'agenda', title: `Ask for an agenda`, detail: `${s.noAgenda} group meetings (${s.noAgendaHours}h) had no description at all. “No agenda, no attenda” saves roughly a quarter of them.`, hoursPerYear: yr(s.noAgendaHours / 4) });
  if (s.backToBackDays >= 10) out.push({ kind: 'buffers', title: `Turn on speedy meetings`, detail: `${s.backToBackDays} days were wall-to-wall. Default 25 and 50 minute slots give you ${Math.round(s.backToBack * 5 / 60)} hours of breathing room back.`, hoursPerYear: yr(s.backToBack * 5 / 60) });
  if (s.fragmentedDays >= 15) out.push({ kind: 'focus', title: `Block one no-meeting morning a week`, detail: `${s.fragmentedDays} days had no two-hour gap for real work. One protected morning restores about ${Math.round(3 * weeksLeft)} focus hours a year.`, hoursPerYear: round1(3 * weeksLeft), isFocus: true });
  if (s.outOfHoursHours >= 20) out.push({ kind: 'hours', title: `Set working hours in your calendar`, detail: `${s.outOfHoursHours}h of meetings sat before 8am or after 6pm. Visible working hours nudge others to book inside them.`, hoursPerYear: yr(s.outOfHoursHours * 0.6) });
  if (s.fridayPm >= 20) out.push({ kind: 'friday', title: `Protect Friday afternoons`, detail: `${s.fridayPm} meetings landed on a Friday afternoon. Nobody is at their best in them. Move the movable ones.`, hoursPerYear: yr(s.fridayPm * 0.5 * 0.5) });
  if (s.unanswered >= 15) out.push({ kind: 'rsvp', title: `Actually reply to invites`, detail: `${s.unanswered} meetings you attended without ever responding. A "no" is free. Decline a third of them.`, hoursPerYear: yr(s.unanswered * 0.5 / 3) });
  out.sort((a, b) => b.hoursPerYear - a.hoursPerYear);
  const total = round1(out.reduce((t, x) => t + x.hoursPerYear, 0));
  return { suggestions: out, totalHours: total, workingDays: round1(total / 8), featured: pickFeatured(out, ['cadence', 'async', 'focus', 'shorten']) };
}

// The free suggestion should be the most surprising one: a change to a meeting the
// person can name, not generic advice. Falls back to the biggest win.
function pickFeatured(list, preferredKinds) {
  if (!list.length) return -1;
  for (const kind of preferredKinds) {
    let best = -1;
    list.forEach((x, i) => { if (x.kind === kind && (best < 0 || x.hoursPerYear > list[best].hoursPerYear)) best = i; });
    if (best >= 0) return best;
  }
  return 0;
}

// ---------- personal mode ----------
function personalStats(all, ctx) {
  const { rangeStart, rangeEnd } = ctx;
  const events = all.filter((e) => e.status !== 'CANCELLED' && e.myStatus !== 'DECLINED' && !e.workingLocation && !(!e.allDay && e.durationH > 24));
  const timed = events.filter((e) => !e.allDay);
  const totalHours = timed.reduce((s, e) => s + e.durationH, 0);
  const cats = PERSONAL_CATEGORIES.map((c) => {
    const items = events.filter((e) => c.re.test(e.title));
    return { key: c.key, label: c.label, count: items.length, hours: round1(items.filter((e) => !e.allDay).reduce((s, e) => s + e.durationH, 0)) };
  }).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const titles = new Map();
  for (const e of events) { const t = normTitle(e.title); titles.set(t, (titles.get(t) || 0) + 1); }
  const pals = people(events, ctx.selfEmail);
  const weekendEvents = events.filter((e) => isWeekend(e.start));
  const weekendKeys = new Set();
  const busyWeekends = new Set();
  for (let d = startOfDay(rangeStart); d < rangeEnd && d < new Date(); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 6) weekendKeys.add(dayKey(d));
  }
  for (const e of weekendEvents) {
    const sat = new Date(e.start); if (sat.getDay() === 0) sat.setDate(sat.getDate() - 1);
    busyWeekends.add(dayKey(startOfDay(sat)));
  }
  const freeWeekends = [...weekendKeys].filter((k) => !busyWeekends.has(k)).length;
  const evenings = timed.filter((e) => !isWeekend(e.start) && e.start.getHours() >= 18);
  const monthly = monthlyBreakdown(events, rangeStart, ctx.fullEnd || rangeEnd, (e) => (e.allDay ? 0 : e.durationH));
  const busiestMonth = [...monthly].sort((a, b) => b.count - a.count)[0] || null;
  const byWeekday = weekdayBreakdown(events, (e) => (e.allDay ? 0 : e.durationH));
  const busiestWeekday = [...byWeekday].sort((a, b) => b.count - a.count)[0] || null;
  const st = streaks(events, rangeStart, rangeEnd, { workdaysOnly: false });
  const earliest = [...timed].sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start))[0] || null;
  const latest = [...timed].sort((a, b) => minutesOfDay(b.end) - minutesOfDay(a.end))[0] || null;
  const recurring = new Map();
  for (const e of events.filter((x) => x.isRecurring)) {
    const cur = recurring.get(e.uid) || { title: normTitle(e.title), count: 0, hours: 0 };
    cur.count++; cur.hours += e.allDay ? 0 : e.durationH; recurring.set(e.uid, cur);
  }
  const recurringSeries = [...recurring.values()].map((r) => ({ ...r, hours: round1(r.hours) })).sort((a, b) => b.count - a.count);
  const birthdays = events.filter((e) => /\b(birthday|bday)\b/i.test(e.title)).length;
  const cutoff = new Date(rangeEnd.getTime() - 60 * DAY);
  const missed = pals.filter((p) => p.count >= 2 && p.lastSeen < cutoff).sort((a, b) => a.lastSeen - b.lastSeen).slice(0, 3);

  const stats = {
    mode: 'personal',
    events: events.length,
    totalHours: round1(totalHours),
    categories: cats,
    topTitles: topN(titles, 5),
    people: pals.slice(0, 8),
    uniquePeople: pals.length,
    weekendEvents: weekendEvents.length,
    freeWeekends,
    totalWeekends: weekendKeys.size,
    eveningEvents: evenings.length,
    monthly,
    busiestMonth,
    byWeekday,
    busiestWeekday,
    byHour: hourHistogram(timed),
    longestFreeStreak: st.longestFree,
    longestBusyStreak: st.longestBusy,
    earliest: earliest ? { title: earliest.title, start: earliest.start } : null,
    latest: latest ? { title: latest.title, end: latest.end } : null,
    recurringSeries: recurringSeries.slice(0, 8),
    birthdays,
    notSeenLately: missed,
    travel: travelStats(all),
    attendeeInfoAvailable: ctx.attendeeInfoAvailable,
  };
  stats.persona = personalPersona(stats);
  stats.reclaim = personalSuggestions(stats);
  return stats;
}

function personalPersona(s) {
  if (s.events === 0) return { name: 'The Blank Page', emoji: '📄', blurb: 'Nothing in the calendar. Either spontaneous or suspiciously organised elsewhere.' };
  const cat = (k) => s.categories.find((c) => c.key === k)?.count || 0;
  const options = [];
  if (cat('fitness') >= 60) options.push([cat('fitness'), { name: 'The Machine', emoji: '🏋️', blurb: `${cat('fitness')} workouts in the calendar. Rest days are for other people.` }]);
  if (cat('food') >= 40) options.push([cat('food') * 1.2, { name: 'The Social Butterfly', emoji: '🦋', blurb: `${cat('food')} dinners, drinks and coffees. Your friends have a good year because of you.` }]);
  if (s.travel.trips >= 6) options.push([s.travel.trips * 8, { name: 'The Globetrotter', emoji: '🌍', blurb: `${s.travel.trips} trips. Your suitcase never fully gets unpacked.` }]);
  if (cat('family') >= 40) options.push([cat('family'), { name: 'The Family Taxi', emoji: '🚗', blurb: `${cat('family')} pickups, drop-offs and school things. Unpaid, unthanked, undefeated.` }]);
  if (cat('culture') >= 20) options.push([cat('culture') * 2, { name: 'The Culture Vulture', emoji: '🎭', blurb: `${cat('culture')} gigs, films and shows. You have opinions about the support act.` }]);
  if (s.freeWeekends / Math.max(1, s.totalWeekends) >= 0.6) options.push([30, { name: 'The Homebody', emoji: '🛋️', blurb: `${s.freeWeekends} weekends with nothing booked. Peace, quiet and a very good sofa.` }]);
  if (s.events >= 300) options.push([s.events / 10, { name: 'The Planner', emoji: '📋', blurb: `${s.events} things in the calendar. If it's not written down, it didn't happen.` }]);
  if (!options.length) return { name: 'The Easygoing One', emoji: '🌤️', blurb: 'Enough plans to have a life, not so many that it needs project management.' };
  return options.sort((a, b) => b[0] - a[0])[0][1];
}

function personalSuggestions(s) {
  const out = [];
  if (s.notSeenLately.length) {
    const p = s.notSeenLately[0];
    out.push({ kind: 'reconnect', title: `Text ${p.name}`, detail: `You've seen them ${p.count} times this year but not since ${MONTHS[p.lastSeen.getMonth()]}. Low effort, high return.`, hoursPerYear: 0 });
  }
  if (s.freeWeekends >= 6) out.push({ kind: 'weekends', title: `${s.freeWeekends} empty weekends`, detail: `Nothing booked on ${s.freeWeekends} of ${s.totalWeekends} weekends. Great if that was the plan. If not, book the thing you keep saying you'll do.`, hoursPerYear: 0 });
  if (s.eveningEvents >= 60) out.push({ kind: 'evenings', title: `Protect a weeknight`, detail: `${s.eveningEvents} weekday evenings had something on. Pick one night a week that stays empty on purpose.`, hoursPerYear: round1(46 * 2) });
  const fitnessRe = PERSONAL_CATEGORIES.find((c) => c.key === 'fitness').re;
  const familyRe = PERSONAL_CATEGORIES.find((c) => c.key === 'family').re;
  const r = s.recurringSeries.find((x) => x.count >= 20 && x.hours >= 20 && !fitnessRe.test(x.title) && !familyRe.test(x.title));
  if (r) out.push({ kind: 'recurring', title: `Still enjoying “${r.title}”?`, detail: `${r.hours} hours across ${r.count} sessions this year. If you look forward to it, brilliant. If you dread it, it's allowed to stop.`, hoursPerYear: round1(r.hours) });
  const fit = s.categories.find((c) => c.key === 'fitness');
  if (!fit || fit.count < 20) out.push({ kind: 'move', title: `Put exercise in the calendar`, detail: `${fit ? fit.count : 0} workouts made it in. Things that are scheduled happen. Things that aren't, don't.`, hoursPerYear: 0 });
  return { suggestions: out, totalHours: round1(out.reduce((t, x) => t + x.hoursPerYear, 0)), workingDays: 0, featured: pickFeatured(out, ['reconnect', 'recurring', 'evenings']) };
}

// ---------- entry point ----------
export function computeStats(rawEvents, { rangeStart, rangeEnd, selfEmail = null, mode = 'auto', workHoursPerWeek = 40, now = new Date() } = {}) {
  const requestedEnd = rangeEnd;
  if (now < rangeEnd) rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const all = annotate(rawEvents.filter((e) => e.start < rangeEnd && e.end > rangeStart), selfEmail);
  const timed = all.filter((e) => !e.allDay);
  const withAttendees = timed.filter((e) => e.attendees.length > 0).length;
  const attendeeInfoAvailable = timed.length === 0 || withAttendees / timed.length >= 0.1;
  const detected = detectMode(all);
  const chosen = mode === 'auto' ? detected.mode : mode;
  const ctx = { rangeStart, rangeEnd, fullEnd: requestedEnd, selfEmail, workHoursPerWeek, attendeeInfoAvailable };
  const stats = chosen === 'work' ? workStats(all, ctx) : personalStats(all, ctx);
  return {
    ...stats,
    detectedMode: detected.mode,
    range: { start: rangeStart, end: rangeEnd, requestedEnd },
    daysCovered: Math.round((rangeEnd - rangeStart) / DAY),
    isPartialYear: rangeEnd < requestedEnd,
    year: rangeStart.getFullYear(),
    generatedAt: new Date(),
    totalEventsInRange: all.length,
  };
}


// ---------- team mode ----------
/** Meeting series in one person's calendar, keyed by UID so they can be matched across exports. */
export function meetingSeries(rawEvents, { rangeStart, rangeEnd, selfEmail }) {
  const all = annotate(rawEvents.filter((e) => e.start < rangeEnd && e.end > rangeStart), selfEmail);
  const timed = all.filter((e) => !e.allDay);
  const attendeeInfoAvailable = timed.length === 0 || timed.filter((e) => e.attendees.length > 0).length / timed.length >= 0.1;
  const map = new Map();
  for (const e of all) {
    if (!e.isRecurring || !isMeeting(e, { attendeeInfoAvailable })) continue;
    const cur = map.get(e.uid) || { uid: e.uid, title: normTitle(e.title), count: 0, hours: 0, durationMin: Math.round(e.durationH * 60), attendees: e.others.length + 1 };
    cur.count++; cur.hours += e.durationH;
    map.set(e.uid, cur);
  }
  return map;
}

function memberName(events, selfEmail, fallback) {
  if (selfEmail) {
    for (const e of events) {
      const a = e.attendees.find((x) => x.email === selfEmail && x.name && !/@/.test(x.name));
      if (a) return a.name.replace(/"/g, '').trim();
      if (e.organizer?.email === selfEmail && e.organizer.name && !/@/.test(e.organizer.name)) return e.organizer.name.replace(/"/g, '').trim();
    }
    return displayName({ email: selfEmail });
  }
  return fallback;
}

/**
 * members: [{ events, selfEmail, label }]
 * Returns per-person work stats plus the meetings the team shares and the single biggest lever.
 */
export function computeTeamStats(members, { rangeStart, rangeEnd, now = new Date(), workHoursPerWeek = 40 } = {}) {
  const people = members.map((m, i) => {
    const stats = computeStats(m.events, { rangeStart, rangeEnd, selfEmail: m.selfEmail, mode: 'work', workHoursPerWeek, now });
    const end = stats.range.end;
    const series = meetingSeries(m.events, { rangeStart, rangeEnd: end, selfEmail: m.selfEmail });
    return { id: i, name: memberName(m.events, m.selfEmail, m.label || `Person ${i + 1}`), email: m.selfEmail, stats, series };
  });
  const annualize = people.length ? 365 / Math.max(30, people[0].stats.daysCovered) : 1;

  // Shared series: the same UID in two or more people's calendars.
  const shared = new Map();
  for (const p of people) {
    for (const s of p.series.values()) {
      const cur = shared.get(s.uid) || { uid: s.uid, title: s.title, durationMin: s.durationMin, members: [], personHours: 0, occurrences: 0 };
      cur.members.push(p.name);
      cur.personHours += s.hours;
      cur.occurrences = Math.max(cur.occurrences, s.count);
      shared.set(s.uid, cur);
    }
  }
  const sharedSeries = [...shared.values()]
    .filter((s) => s.members.length >= 2)
    .map((s) => ({ ...s, personHours: round1(s.personHours), personHoursPerYear: round1(s.personHours * annualize), share: round1(s.members.length / people.length) }))
    .sort((a, b) => b.personHours - a.personHours);

  const lever = sharedSeries[0] ? (() => {
    const s = sharedSeries[0];
    const perWeek = s.occurrences / Math.max(1, (people[0].stats.workingDays || 1) / 5);
    const action = perWeek >= 3.5 ? 'Make it async twice a week' : perWeek >= 0.9 ? 'Move it to every other week' : 'Cut it to half the length';
    const saved = round1(s.personHoursPerYear * (perWeek >= 3.5 ? 0.4 : 0.5));
    return { title: s.title, action, members: s.members.length, personHoursPerYear: s.personHoursPerYear, savedPerYear: saved, workingDays: round1(saved / 8) };
  })() : null;

  const totalHours = round1(people.reduce((t, p) => t + p.stats.totalHours, 0));
  const monthly = people[0] ? people[0].stats.monthly.map((m, i) => ({ ...m, value: round1(people.reduce((t, p) => t + (p.stats.monthly[i]?.value || 0), 0)) })) : [];
  const busiestMonth = [...monthly].sort((a, b) => b.value - a.value)[0] || null;
  const sharedHours = round1(sharedSeries.reduce((t, s) => t + s.personHours, 0));
  const ranked = [...people].sort((a, b) => b.stats.shareOfWork - a.stats.shareOfWork);

  return {
    mode: 'team',
    year: rangeStart.getFullYear(),
    isPartialYear: people[0]?.stats.isPartialYear || false,
    range: people[0]?.stats.range,
    size: people.length,
    totalHours,
    totalMeetings: people.reduce((t, p) => t + p.stats.meetings, 0),
    avgShare: people.length ? Math.round(people.reduce((t, p) => t + p.stats.shareOfWork, 0) / people.length) : 0,
    sharedHours,
    sharedShare: totalHours ? Math.round((sharedHours / totalHours) * 100) : 0,
    mostLoaded: ranked[0] ? { name: ranked[0].name, share: ranked[0].stats.shareOfWork } : null,
    leastLoaded: ranked.at(-1) ? { name: ranked.at(-1).name, share: ranked.at(-1).stats.shareOfWork } : null,
    members: people.map((p) => ({
      name: p.name, email: p.email, meetings: p.stats.meetings, hours: p.stats.totalHours, share: p.stats.shareOfWork,
      backToBackDays: p.stats.backToBackDays, fragmentedDays: p.stats.fragmentedDays, persona: p.stats.persona,
      reclaimHours: p.stats.reclaim.totalHours,
    })).sort((a, b) => b.hours - a.hours),
    sharedSeries: sharedSeries.slice(0, 15),
    lever,
    monthly,
    busiestMonth,
    generatedAt: new Date(),
  };
}

export const _internal = { normTitle, isMeeting, annotate, isoWeekKey, pickFeatured, MONTHS, WEEKDAYS };
