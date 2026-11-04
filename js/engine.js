// Client for the engine. Uses a module worker when the browser can start one; otherwise
// (or if the worker dies) it replays the session into an in-page copy and carries on.
const MUTATING = new Set(['loadText', 'loadEvents', 'addMember', 'removeMember', 'clearMembers']);

export function createEngine({ forceLocal = false } = {}) {
  let worker = null;
  let ready = null;
  let core = null;
  let seq = 0;
  const pending = new Map();
  const history = [];

  function failAll(reason) {
    for (const { reject } of pending.values()) reject(Object.assign(new Error(reason), { workerDown: true }));
    pending.clear();
  }

  if (!forceLocal && typeof Worker === 'function') {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker start timeout')), 5000);
        worker.addEventListener('message', function first(e) { if (e.data?.ready) { clearTimeout(timer); worker.removeEventListener('message', first); resolve(); } });
      });
      worker.onmessage = (e) => {
        const { id, result, error } = e.data || {};
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        error ? p.reject(new Error(error)) : p.resolve(result);
      };
      worker.onerror = () => { worker = null; failAll('worker error'); };
    } catch { worker = null; }
  }

  async function local() {
    if (!core) {
      core = (await import('./engine-core.js')).createCore();
      for (const [m, a] of history) await core[m](a); // bring the in-page copy up to date
    }
    return core;
  }

  async function call(method, args = {}) {
    if (worker) {
      try {
        await ready;
        const result = await new Promise((resolve, reject) => {
          const id = ++seq;
          pending.set(id, { resolve, reject });
          worker.postMessage({ id, method, args });
        });
        if (MUTATING.has(method)) history.push([method, args]);
        return result;
      } catch (err) {
        if (!err.workerDown && !/timeout/.test(err.message)) throw err;
        try { worker?.terminate(); } catch { /* gone */ }
        worker = null;
      }
    }
    const c = await local();
    const result = await c[method](args);
    if (MUTATING.has(method)) history.push([method, args]);
    return result;
  }

  return {
    get mode() { return worker ? 'worker' : 'local'; },
    loadText: (text) => call('loadText', { text }),
    loadEvents: (events, meta) => call('loadEvents', { events, meta }),
    compute: (opts) => call('compute', opts),
    addMember: (text, label) => call('addMember', { text, label }),
    removeMember: (id) => call('removeMember', { id }),
    clearMembers: () => call('clearMembers'),
    team: (opts) => call('team', opts),
  };
}
