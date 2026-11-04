// Google Calendar connect. Runs entirely in the browser:
// Google Identity Services gives a short-lived token, events are read straight from the
// Calendar API, the token is revoked straight after. Nothing touches our servers.
import { CONFIG } from './config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const STATUS = { accepted: 'ACCEPTED', declined: 'DECLINED', tentative: 'TENTATIVE', needsAction: 'NEEDS-ACTION' };

export const googleEnabled = () => !!CONFIG.google?.clientId;
/** Load Google's script early so the sign-in popup opens straight from the click. */
export const preloadGoogle = () => { if (googleEnabled()) loadGis().catch(() => {}); };

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.append(s);
  });
}

function requestToken() {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.google.clientId,
      scope: SCOPE,
      prompt: '',
      callback: (resp) => (resp && resp.access_token ? resolve(resp.access_token) : reject(new Error(resp?.error || 'Sign-in was cancelled.'))),
      error_callback: (err) => reject(new Error(err?.message || 'Sign-in was cancelled.')),
    });
    client.requestAccessToken();
  });
}

async function fetchAll(token, { timeMin, timeMax, onProgress }) {
  const items = [];
  let pageToken = '';
  let summary = null;
  do {
    const url = new URL(API);
    url.search = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), showDeleted: 'false', ...(pageToken ? { pageToken } : {}) });
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(res.status === 403 ? 'Google sign-in: access to the calendar was refused.' : `Google Calendar returned ${res.status}.`);
    const page = await res.json();
    summary = summary || page.summary || null;
    items.push(...(page.items || []));
    onProgress?.(items.length);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return { kind: 'calendar#events', summary, items };
}

/** Sign in, read the primary calendar, revoke. Returns { events, meta } in the same shape as parseICS. */
export async function connectGoogle({ timeMin, timeMax, onProgress } = {}) {
  await loadGis();
  const token = await requestToken();
  try {
    const data = await fetchAll(token, { timeMin, timeMax, onProgress });
    return googleToEvents(data, { rangeStart: timeMin, rangeEnd: timeMax });
  } finally {
    try { window.google.accounts.oauth2.revoke(token, () => {}); } catch { /* best effort */ }
  }
}

const toDate = (t) => (t?.dateTime ? new Date(t.dateTime) : t?.date ? new Date(`${t.date}T00:00:00`) : null);

/** Pure converter from a Calendar API events list to the internal event shape. */
export function googleToEvents(data, { rangeStart, rangeEnd } = {}) {
  const events = [];
  let selfEmail = null;
  for (const it of data.items || []) {
    if (it.status === 'cancelled') continue;
    if (it.eventType === 'workingLocation') continue;
    let start = toDate(it.start);
    let end = toDate(it.end) || start;
    if (!start) continue;
    let allDay = !!it.start?.date;
    let title = (it.summary || '').trim() || '(no title)';
    if (it.eventType === 'outOfOffice') {
      // Out-of-office spans are timed in the API; treat them as days off.
      allDay = true; title = 'Out of office';
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + (end.getHours() || end.getMinutes() ? 1 : 0));
    }
    if (it.eventType === 'focusTime') title = 'Focus time';
    if (rangeStart && end <= rangeStart) continue;
    if (rangeEnd && start >= rangeEnd) continue;
    const attendees = (it.attendees || []).map((a) => {
      if (a.self) selfEmail = (a.email || '').toLowerCase();
      return { email: (a.email || '').toLowerCase() || null, name: a.displayName || null, status: STATUS[a.responseStatus] || 'NEEDS-ACTION', role: a.optional ? 'OPT-PARTICIPANT' : 'REQ-PARTICIPANT', isResource: !!a.resource };
    });
    if (!selfEmail && it.organizer?.self) selfEmail = (it.organizer.email || '').toLowerCase();
    events.push({
      uid: it.recurringEventId || it.iCalUID || it.id,
      title,
      description: it.description || '',
      location: it.location || '',
      start, end, allDay,
      status: (it.status || 'confirmed').toUpperCase(),
      organizer: it.organizer ? { email: (it.organizer.email || '').toLowerCase() || null, name: it.organizer.displayName || null } : null,
      attendees,
      isRecurring: !!it.recurringEventId,
      transparent: it.transparency === 'transparent' || it.eventType === 'focusTime',
    });
  }
  events.sort((a, b) => a.start - b.start);
  const calEmail = data.summary && /@/.test(data.summary) ? data.summary.toLowerCase() : null;
  return { events, meta: { calendarName: data.summary || 'Google Calendar', calendarEmail: calEmail || selfEmail, prodId: 'google-api', timezone: data.timeZone || null, rawEventCount: (data.items || []).length, source: 'google' } };
}
