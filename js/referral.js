// Unlock by sharing. Your share links carry a random invite id (?r=…). When three different people
// open one and go on to make their own Wrapped from a real calendar, the personal unlock is yours.
// Ids are random and anonymous: no names, emails or calendar data are involved.
import { storage, store } from './ui.js';

const REF = 'cw:ref', VISITOR = 'cw:vid', REFERRER = 'cw:referrer', CREDITED = 'cw:credited';
export const GOAL = 3;
const ID = /^[a-z0-9]{10,24}$/;
const randomId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => (b % 36).toString(36)).join('');

function id(key) {
  let v = storage(key);
  if (typeof v !== 'string' || !ID.test(v)) { v = randomId(); store(key, v); }
  return v;
}
export const myRef = () => id(REF);
const visitorId = () => id(VISITOR);

/** Adds the invite id to a share link. */
export function withRef(url) {
  const u = new URL(url);
  u.searchParams.set('r', myRef());
  return u.href;
}

/** On page load: remember who invited us, and tidy the address bar. */
export function captureReferrer(loc = location) {
  const u = new URL(loc.href);
  const r = u.searchParams.get('r');
  if (!r) return null;
  u.searchParams.delete('r');
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  if (!ID.test(r) || r === storage(REF) || storage(CREDITED)) return null;
  store(REFERRER, r);
  return r;
}

/** Called once someone has made their own Wrapped from a real calendar. Credits the inviter once. */
export async function creditReferrer() {
  const r = storage(REFERRER);
  if (!r || storage(CREDITED) || r === storage(REF)) return false;
  try {
    const res = await fetch('/api/referral', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ r, v: visitorId() }) });
    if (!res.ok) return false;
    store(CREDITED, r);
    return true;
  } catch { return false; }
}

/** How many friends have made theirs from my links. Null when the service isn't there. */
export async function referralProgress() {
  try {
    const res = await fetch(`/api/referral?r=${myRef()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const d = await res.json();
    const goal = Number(d.goal) || GOAL;
    const count = Math.max(0, Number(d.count) || 0);
    return { count, goal, unlocked: count >= goal };
  } catch { return null; }
}
