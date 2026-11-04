// Tiny synthesised UI sounds and haptics. No audio files.
// On by default on touch devices, off on desktop; the choice is remembered.
import { storage, store } from './ui.js';

const KEY = 'cw:sound';
let ctx = null;
let enabled = storage(KEY, null);
if (enabled === null) enabled = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function audio() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function note(freq, { at = 0, dur = 0.12, gain = 0.05, type = 'sine', glide = 0 } = {}) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

export const sound = {
  get on() { return enabled; },
  set(v) { enabled = !!v; store(KEY, enabled); if (enabled) audio(); },
  toggle() { this.set(!enabled); return enabled; },
  /** Call from a user gesture so browsers allow audio later. */
  prime() { if (enabled) audio(); },
  tick() { if (!enabled) return; note(1320, { dur: 0.05, gain: 0.03, glide: 0.9 }); buzz(6); },
  back() { if (!enabled) return; note(990, { dur: 0.05, gain: 0.025, glide: 0.9 }); buzz(4); },
  chime() { if (!enabled) return; note(1318.5, { dur: 0.5, gain: 0.05, type: 'triangle' }); note(1975.5, { at: 0.09, dur: 0.7, gain: 0.04, type: 'triangle' }); buzz([10, 40, 14]); },
  pop() { if (!enabled) return; note(660, { dur: 0.08, gain: 0.04, glide: 1.6 }); buzz(8); },
};
