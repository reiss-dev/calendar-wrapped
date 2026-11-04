// Microsoft 365 / Outlook connect. Runs entirely in the browser:
// OAuth 2.0 authorisation code with PKCE in a popup (no library), events read straight from
// Microsoft Graph, token held in memory only and dropped as soon as events load.
import { CONFIG } from './config.js';

const SCOPE = 'User.Read Calendars.Read';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const RESPONSE = { accepted: 'ACCEPTED', declined: 'DECLINED', tentativelyAccepted: 'TENTATIVE', notResponded: 'NEEDS-ACTION', none: 'NEEDS-ACTION', organizer: 'ACCEPTED' };

export const microsoftEnabled = () => !!CONFIG.microsoft?.clientId;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const authBase = () => `https://login.microsoftonline.com/${CONFIG.microsoft.tenant || 'common'}/oauth2/v2.0`;
const redirectUri = () => new URL('auth-callback.html', location.href).href;

/**
 * Must be called straight from a click handler: the popup opens synchronously so
 * browsers don't block it, and the PKCE work happens after.
 */
export async function connectMicrosoft({ timeMin, timeMax, onProgress } = {}) {
  const popup = window.open('about:blank', 'cw-microsoft', 'width=520,height=680');
  if (!popup) throw new Error('Your browser blocked the Microsoft sign-in window.');
  try {
    const verifier = random(48);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = random(16);
    const url = new URL(`${authBase()}/authorize`);
    url.search = new URLSearchParams({ client_id: CONFIG.microsoft.clientId, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query', scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
    popup.location.href = url.href;
    const params = await waitForCallback(popup);
    if (params.get('error')) throw new Error(params.get('error_description') || 'Microsoft sign-in was cancelled.');
    if (params.get('state') !== state) throw new Error('Microsoft sign-in could not be verified. Please try again.');
    const token = await redeem(params.get('code'), verifier);
    const [me, items] = await Promise.all([graph(token, '/me?$select=displayName,mail,userPrincipalName'), calendarView(token, { timeMin, timeMax, onProgress })]);
    return graphToEvents({ me, items }, { rangeStart: timeMin, rangeEnd: timeMax });
  } finally {
    try { popup.close(); } catch { /* already closed */ }
  }
}

function waitForCallback(popup) {
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.data?.type !== 'cw-oauth') return;
      cleanup(); resolve(new URLSearchParams(e.data.search || ''));
    };
    const timer = setInterval(() => { if (popup.closed) { cleanup(); reject(new Error('Microsoft sign-in was cancelled.')); } }, 500);
    const cleanup = () => { clearInterval(timer); window.removeEventListener('message', onMsg); };
    window.addEventListener('message', onMsg);
  });
}

async function redeem(code, verifier) {
  const res = await fetch(`${authBase()}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CONFIG.microsoft.clientId, scope: SCOPE, code, redirect_uri: redirectUri(), grant_type: 'authorization_code', code_verifier: verifier }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description?.split('\n')[0] || 'Microsoft sign-in failed.');
  return data.access_token;
}

async function graph(token, path) {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
  if (res.status === 403) throw new Error('Your organisation doesn’t allow apps to read calendars. Use a file export instead.');
  if (!res.ok) throw new Error(`Microsoft Graph returned ${res.status}.`);
  return res.json();
}

async function calendarView(token, { timeMin, timeMax, onProgress }) {
  const select = 'subject,start,end,isAllDay,isCancelled,showAs,attendees,organizer,seriesMasterId,type,iCalUId,responseStatus,isOrganizer,location,bodyPreview,isOnlineMeeting';
  let next = `${GRAPH}/me/calendarView?startDateTime=${timeMin.toISOString()}&endDateTime=${timeMax.toISOString()}&$top=500&$select=${select}`;
  const items = [];
  while (next) {
    const page = await graph(token, next);
    items.push(...(page.value || []));
    onProgress?.(items.length);
    next = page['@odata.nextLink'] || null;
  }
  return items;
}

const utc = (dt) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(dt) ? dt : `${dt.replace(/\.\d+$/, '')}Z`);
const floating = (dt) => { const [y, m, d] = dt.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

/** Pure converter from Graph's /me and /me/calendarView to the internal event shape. */
export function graphToEvents({ me, items }, { rangeStart, rangeEnd } = {}) {
  const self = String(me?.mail || me?.userPrincipalName || '').toLowerCase() || null;
  const events = [];
  for (const it of items || []) {
    if (!it.start?.dateTime) continue;
    const allDay = !!it.isAllDay;
    const start = allDay ? floating(it.start.dateTime) : utc(it.start.dateTime);
    const end = allDay ? floating(it.end.dateTime) : utc(it.end.dateTime);
    if (rangeStart && end <= rangeStart) continue;
    if (rangeEnd && start >= rangeEnd) continue;
    const attendees = (it.attendees || []).map((a) => ({
      email: (a.emailAddress?.address || '').toLowerCase() || null,
      name: a.emailAddress?.name || null,
      status: RESPONSE[a.status?.response] || 'NEEDS-ACTION',
      role: a.type === 'optional' ? 'OPT-PARTICIPANT' : 'REQ-PARTICIPANT',
      isResource: a.type === 'resource',
    }));
    // Graph lists other attendees; your own reply sits on the event. Add yourself so declines count.
    if (self && attendees.length && !attendees.some((a) => a.email === self)) {
      attendees.push({ email: self, name: me.displayName || null, status: it.isOrganizer ? 'ACCEPTED' : RESPONSE[it.responseStatus?.response] || 'NEEDS-ACTION', role: 'REQ-PARTICIPANT', isResource: false });
    }
    let title = (it.subject || '').trim() || '(no title)';
    if (it.showAs === 'oof' && allDay) title = 'Out of office';
    const organizer = it.organizer?.emailAddress ? { email: (it.organizer.emailAddress.address || '').toLowerCase() || null, name: it.organizer.emailAddress.name || null } : null;
    events.push({
      uid: it.seriesMasterId || it.iCalUId || it.id,
      title,
      description: `${it.bodyPreview || ''}${it.isOnlineMeeting ? ' Microsoft Teams meeting' : ''}`.trim(),
      location: it.location?.displayName || '',
      start, end, allDay,
      status: it.isCancelled ? 'CANCELLED' : 'CONFIRMED',
      organizer: it.isOrganizer && self ? { email: self, name: me.displayName || null } : organizer,
      attendees,
      isRecurring: it.type === 'occurrence' || it.type === 'exception',
      transparent: it.showAs === 'free',
      oof: it.showAs === 'oof',
    });
  }
  events.sort((a, b) => a.start - b.start);
  return { events, meta: { calendarName: me?.displayName || 'Outlook', calendarEmail: self, prodId: 'microsoft-graph', timezone: 'UTC', rawEventCount: (items || []).length, source: 'outlook' } };
}
