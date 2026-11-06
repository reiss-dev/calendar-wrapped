// Where results live on this device. They hold names and meeting titles, so:
//  - by default they're kept in this browser for 30 days, then cleared the next time the page opens;
//  - in private mode ("Keep my results on this device" off) they live only in this tab and are
//    gone when it closes;
//  - "Start over" clears them at once.
// Nothing here ever leaves the device.
const PREF = 'cw:remember';
export const MAX_AGE_DAYS = 30;
const MAX_AGE = MAX_AGE_DAYS * 86400000;
/** Keys that can hold calendar-derived details: names, titles, places, moments. */
export const RESULT_KEYS = ['cw:stats', 'cw:team', 'cw:extras', 'cw:friend', 'cw:filters', 'cw:groups', 'cw:hide'];

const local = () => { try { return window.localStorage; } catch { return null; } };
const session = () => { try { return window.sessionStorage; } catch { return null; } };

export function remembering() {
  try { return local()?.getItem(PREF) !== 'false'; } catch { return false; }
}
/** Turn keeping results on or off. Turning it off moves anything already kept into this tab only. */
export function setRemembering(on) {
  try { local()?.setItem(PREF, on ? 'true' : 'false'); } catch { /* storage blocked */ }
  for (const key of RESULT_KEYS) {
    const text = recall(key);
    if (text != null) keep(key, text);
  }
}

/** Store a string. */
export function keep(key, text) {
  const wrapped = JSON.stringify({ at: Date.now(), v: text });
  const [to, from] = remembering() ? [local(), session()] : [session(), local()];
  try { to?.setItem(key, wrapped); } catch { /* quota or blocked */ }
  try { from?.removeItem(key); } catch { /* blocked */ }
}

/** Read a string, or null. Results older than 30 days are cleared instead. */
export function recall(key) {
  for (const store of [session(), local()]) {
    let raw = null;
    try { raw = store?.getItem(key); } catch { /* blocked */ }
    if (raw == null) continue;
    let o = null;
    try { o = JSON.parse(raw); } catch { return raw; }
    if (o && typeof o === 'object' && 'at' in o && 'v' in o) {
      if (store === local() && Date.now() - o.at > MAX_AGE) { forget(key); return null; }
      return o.v;
    }
    return raw; // stored before results carried a date
  }
  return null;
}

export function forget(key) {
  try { local()?.removeItem(key); } catch { /* blocked */ }
  try { session()?.removeItem(key); } catch { /* blocked */ }
}
/** Clear every result from this device. Purchases, language and sound settings stay. */
export function forgetAll() { RESULT_KEYS.forEach(forget); }

/** Clear anything past its 30 days, without waiting for it to be read. */
export function sweep() { RESULT_KEYS.forEach((k) => recall(k)); }
