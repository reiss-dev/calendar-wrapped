// Module worker: runs the engine off the main thread so big calendars never freeze the page.
import { createCore } from './engine-core.js';

const core = createCore();
self.onmessage = (e) => {
  const { id, method, args } = e.data;
  Promise.resolve()
    .then(() => { if (typeof core[method] !== 'function') throw new Error(`Unknown method ${method}`); return core[method](args); })
    .then((result) => self.postMessage({ id, result }), (err) => self.postMessage({ id, error: err?.message || String(err) }));
};
self.postMessage({ ready: true });
