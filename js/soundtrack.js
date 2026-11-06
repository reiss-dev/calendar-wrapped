// The video's music, synthesised on the device: an original, gentle four-chord loop with a soft
// kick, plucked arpeggios and a whoosh at every scene change. No audio files, nothing licensed.
export const SAMPLE_RATE = 48000;
const BPM = 112;
const BEAT = 60 / BPM;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// A major: A, F#m, D, E (I–vi–IV–V), voiced warm and close.
const CHORDS = [[57, 61, 64, 68], [54, 57, 61, 64], [50, 54, 57, 61], [52, 56, 59, 62]];
const BASS = [45, 42, 38, 40];

function seeded(seed = 7) { let x = seed; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }

/**
 * Renders the soundtrack for a video of `total` seconds whose scenes start at `starts`.
 * Resolves to an AudioBuffer (stereo, 48 kHz), or null where the browser can't render audio.
 */
export async function renderSoundtrack(total, starts = []) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) return null;
  const ctx = new OAC(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  const rand = seeded();

  // Master: a gentle compressor, a fade in and a longer fade out.
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.exponentialRampToValueAtTime(1.5, 0.8);
  master.gain.setValueAtTime(1.5, Math.max(0.9, total - 2.2));
  master.gain.exponentialRampToValueAtTime(0.0001, total);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  master.connect(comp).connect(ctx.destination);

  // A short echo for the plucks, panned a little apart.
  const delay = ctx.createDelay(1); delay.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const wet = ctx.createGain(); wet.gain.value = 0.35;
  delay.connect(fb).connect(delay); delay.connect(wet).connect(master);

  const noise = ctx.createBuffer(1, SAMPLE_RATE, SAMPLE_RATE);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rand() * 2 - 1;

  const pan = (v) => { const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = v; p.connect(master); return p; };
  const left = pan(-0.35), right = pan(0.35), mid = pan(0);

  const pad = (notes, at, dur) => {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.045, at + 0.35);
    g.gain.setValueAtTime(0.045, at + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, at + dur + 0.25);
    lp.connect(g).connect(mid);
    for (const n of notes) for (const [type, detune] of [['sawtooth', -6], ['triangle', 5]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = midi(n); o.detune.value = detune;
      o.connect(lp); o.start(at); o.stop(at + dur + 0.3);
    }
  };
  const pluck = (n, at, out, gain = 0.05) => {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
    o.connect(g); g.connect(out); g.connect(delay);
    o.start(at); o.stop(at + 0.35);
  };
  const bass = (n, at, dur) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.16, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(mid); o.start(at); o.stop(at + dur + 0.02);
  };
  const kick = (at) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.32, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
    o.connect(g).connect(mid); o.start(at); o.stop(at + 0.3);
  };
  const hat = (at, gain = 0.018) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    s.connect(hp).connect(g).connect(mid); s.start(at, rand() * 0.5, 0.06);
  };
  const whoosh = (at) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, at - 0.35); bp.frequency.exponentialRampToValueAtTime(5000, at + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at - 0.35); g.gain.exponentialRampToValueAtTime(0.05, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    s.connect(bp).connect(g).connect(mid); s.start(Math.max(0, at - 0.35), rand() * 0.3, 0.65);
  };

  const bar = BEAT * 4;
  for (let b = 0, at = 0; at < total; b++, at += bar) {
    const k = b % 4;
    pad(CHORDS[k], at, bar);
    bass(BASS[k], at, BEAT * 1.6); bass(BASS[k], at + BEAT * 2, BEAT * 1.6);
    const groove = b >= 1; // one bar of pad and arpeggio before the beat comes in
    for (let i = 0; i < 8; i++) {
      const t8 = at + i * (BEAT / 2);
      if (t8 >= total) break;
      const notes = CHORDS[k];
      pluck(notes[[0, 2, 1, 3, 2, 1, 3, 2][i]] + 12, t8, i % 2 ? right : left, i % 4 === 0 ? 0.055 : 0.04);
      if (groove && i % 2 === 0) kick(t8);
      if (groove && i % 2 === 1) hat(t8);
    }
  }
  for (const s of starts.slice(1)) if (s > 0.4 && s < total - 0.5) whoosh(s);
  return ctx.startRendering();
}

/** Splits an AudioBuffer into AudioData chunks for an AudioEncoder. */
export function* audioChunks(buffer, frames = 4800) {
  const channels = buffer.numberOfChannels;
  for (let start = 0; start < buffer.length; start += frames) {
    const n = Math.min(frames, buffer.length - start);
    const data = new Float32Array(n * channels);
    for (let c = 0; c < channels; c++) data.set(buffer.getChannelData(c).subarray(start, start + n), c * n);
    yield new AudioData({ format: 'f32-planar', sampleRate: buffer.sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((start / buffer.sampleRate) * 1e6), data });
  }
}

/** The first audio codec this browser can encode into an MP4: AAC where it can, Opus otherwise. */
export async function pickAudioCodec() {
  if (typeof AudioEncoder !== 'function') return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    try { const r = await AudioEncoder.isConfigSupported({ codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128000 }); if (r.supported) return { codec, mux }; } catch { /* next */ }
  }
  return null;
}
