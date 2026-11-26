/**
 * Procedural one-shot sounds. Used both live (sampler pads) and offline
 * (rendering the built-in demo tracks), so the app ships with zero audio files.
 */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function env(g: AudioParam, t: number, peak: number, attack: number, decay: number) {
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noise(ctx: BaseAudioContext, t: number, dur: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur);
  return src;
}

export function kick(ctx: BaseAudioContext, dest: AudioNode, t: number, gain = 1) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);
  env(g.gain, t, gain, 0.002, 0.42);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.5);
  // click transient
  const c = noise(ctx, t, 0.01);
  const cf = ctx.createBiquadFilter();
  cf.type = 'highpass';
  cf.frequency.value = 3000;
  const cg = ctx.createGain();
  env(cg.gain, t, gain * 0.25, 0.001, 0.008);
  c.connect(cf).connect(cg).connect(dest);
}

export function hat(ctx: BaseAudioContext, dest: AudioNode, t: number, open: boolean, gain = 1) {
  const dur = open ? 0.22 : 0.045;
  const src = noise(ctx, t, dur + 0.01);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = open ? 7000 : 8500;
  const g = ctx.createGain();
  env(g.gain, t, gain * 0.35, 0.001, dur);
  src.connect(f).connect(g).connect(dest);
}

export function clap(ctx: BaseAudioContext, dest: AudioNode, t: number, gain = 1) {
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1400;
  f.Q.value = 0.8;
  f.connect(dest);
  for (let i = 0; i < 4; i++) {
    const tt = t + i * 0.011;
    const src = noise(ctx, tt, i === 3 ? 0.25 : 0.02);
    const g = ctx.createGain();
    env(g.gain, tt, gain * 0.7, 0.001, i === 3 ? 0.2 : 0.012);
    src.connect(g).connect(f);
  }
}

export function snare(ctx: BaseAudioContext, dest: AudioNode, t: number, gain = 1) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.1);
  const og = ctx.createGain();
  env(og.gain, t, gain * 0.5, 0.001, 0.12);
  osc.connect(og).connect(dest);
  osc.start(t);
  osc.stop(t + 0.2);
  const src = noise(ctx, t, 0.25);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1800;
  const g = ctx.createGain();
  env(g.gain, t, gain * 0.55, 0.001, 0.2);
  src.connect(f).connect(g).connect(dest);
}

export function crash(ctx: BaseAudioContext, dest: AudioNode, t: number, gain = 1) {
  const src = noise(ctx, t, 2.2);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 5000;
  const g = ctx.createGain();
  env(g.gain, t, gain * 0.4, 0.002, 2);
  src.connect(f).connect(g).connect(dest);
}

export function bass(ctx: BaseAudioContext, dest: AudioNode, t: number, freq: number, dur: number, gain = 1) {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const sub = ctx.createOscillator();
  sub.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(1600, t);
  f.frequency.exponentialRampToValueAtTime(180, t + dur * 0.9);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * 0.4, t + 0.005);
  g.gain.setValueAtTime(gain * 0.4, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(f);
  sub.connect(f);
  f.connect(g).connect(dest);
  osc.start(t);
  sub.start(t);
  osc.stop(t + dur + 0.02);
  sub.stop(t + dur + 0.02);
}

export function stab(ctx: BaseAudioContext, dest: AudioNode, t: number, notes: number[], dur: number, gain = 1) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(5000, t);
  f.frequency.exponentialRampToValueAtTime(600, t + dur);
  const g = ctx.createGain();
  env(g.gain, t, gain * 0.16, 0.004, dur);
  f.connect(g).connect(dest);
  for (const n of notes) {
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(n);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

export function pad(ctx: BaseAudioContext, dest: AudioNode, t: number, notes: number[], dur: number, gain = 1) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain * 0.09, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(dest);
  for (const n of notes) {
    for (const det of [-14, 0, 14]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(n);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

/** Rising filtered-noise sweep, the classic build-up effect. */
export function riser(ctx: BaseAudioContext, dest: AudioNode, t: number, dur: number, gain = 1) {
  const src = noise(ctx, t, dur);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(9000, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * 0.5, t + dur * 0.95);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
}

/** Multi-blast brass-like horn built from detuned saws. */
export function horn(ctx: BaseAudioContext, dest: AudioNode, t: number, gain = 1) {
  const blasts: [number, number][] = [
    [0, 0.14],
    [0.18, 0.14],
    [0.36, 0.6],
  ];
  const bp = ctx.createBiquadFilter();
  bp.type = 'peaking';
  bp.frequency.value = 1500;
  bp.gain.value = 8;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 2.5);
  shaper.curve = curve;
  shaper.connect(bp).connect(dest);
  for (const [off, len] of blasts) {
    const tt = t + off;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.exponentialRampToValueAtTime(gain * 0.18, tt + 0.015);
    g.gain.setValueAtTime(gain * 0.18, tt + len - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + len);
    g.connect(shaper);
    for (const [freq, det] of [
      [415, -6],
      [418, 7],
      [523, 0],
      [622, 4],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq * 0.92, tt);
      o.frequency.exponentialRampToValueAtTime(freq, tt + 0.04);
      o.detune.value = det;
      o.connect(g);
      o.start(tt);
      o.stop(tt + len + 0.02);
    }
  }
}

export function siren(ctx: BaseAudioContext, dest: AudioNode, t: number, gain = 1) {
  const dur = 1.6;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = 900;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 3;
  const depth = ctx.createGain();
  depth.gain.value = 350;
  lfo.connect(depth).connect(o.frequency);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 3000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * 0.12, t + 0.03);
  g.gain.setValueAtTime(gain * 0.12, t + dur - 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(dest);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur);
  lfo.stop(t + dur);
}

export function laser(ctx: BaseAudioContext, dest: AudioNode, t: number, gain = 1) {
  for (let i = 0; i < 3; i++) {
    const tt = t + i * 0.12;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(2600, tt);
    o.frequency.exponentialRampToValueAtTime(120, tt + 0.22);
    const g = ctx.createGain();
    env(g.gain, tt, gain * 0.2, 0.002, 0.22);
    o.connect(g).connect(dest);
    o.start(tt);
    o.stop(tt + 0.26);
  }
}

/** Deep sub-bass pitch dive. */
export function subDrop(ctx: BaseAudioContext, dest: AudioNode, t: number, gain = 1) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(30, t + 1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * 0.9, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 1.85);
}
