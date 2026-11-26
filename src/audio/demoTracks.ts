import { bass, clap, crash, hat, kick, midiToFreq, pad, riser, stab } from './synth';

/**
 * Two original, procedurally composed demo tracks so the app can be tried
 * immediately without importing music. They are arranged DJ-style: beat-only
 * intro and outro, a breakdown in the middle, and a steady tempo throughout.
 */
export interface DemoSpec {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  roots: number[];
  chords: number[][];
  bars: number;
}

export const DEMOS: DemoSpec[] = [
  {
    id: 'demo-neon-drift',
    title: 'Neon Drift',
    artist: 'DeckFlow Demo',
    bpm: 124,
    roots: [45, 41, 48, 43],
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [55, 60, 64],
      [55, 59, 62],
    ],
    bars: 64,
  },
  {
    id: 'demo-night-circuit',
    title: 'Night Circuit',
    artist: 'DeckFlow Demo',
    bpm: 128,
    roots: [41, 37, 44, 39],
    chords: [
      [53, 56, 60],
      [53, 56, 61],
      [51, 56, 60],
      [51, 55, 58],
    ],
    bars: 64,
  },
];

type Voice = (ctx: BaseAudioContext, dest: AudioNode, t: number) => void;

/** Render one short sound to PCM (a tiny offline graph is fast; one huge graph is not). */
async function renderVoice(voice: Voice, seconds: number, sampleRate: number): Promise<Float32Array[]> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  voice(ctx, ctx.destination, 0);
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

/**
 * Renders a demo track. Every distinct sound (kick, hat, each chord stab…) is
 * rendered once, then the arrangement is mixed by adding samples at offsets.
 */
export async function renderDemo(spec: DemoSpec, sampleRate: number): Promise<AudioBuffer> {
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const seconds = spec.bars * bar + 1;
  const length = Math.ceil(seconds * sampleRate);
  const L = new Float32Array(length);
  const R = new Float32Array(length);

  const [kickV, hatC, hatO, clapV, crashV, riserV] = await Promise.all([
    renderVoice((c, d, t) => kick(c, d, t, 1), 0.5, sampleRate),
    renderVoice((c, d, t) => hat(c, d, t, false, 1), 0.08, sampleRate),
    renderVoice((c, d, t) => hat(c, d, t, true, 1), 0.3, sampleRate),
    renderVoice((c, d, t) => clap(c, d, t, 1), 0.32, sampleRate),
    renderVoice((c, d, t) => crash(c, d, t, 1), 2.2, sampleRate),
    renderVoice((c, d, t) => riser(c, d, t, bar * 4, 1), bar * 4 + 0.05, sampleRate),
  ]);
  const bassV = await Promise.all(
    spec.roots.map((r) => renderVoice((c, d, t) => bass(c, d, t, midiToFreq(r), beat * 0.45, 1), beat * 0.5, sampleRate)),
  );
  const stabLong = await Promise.all(
    spec.chords.map((ch) => renderVoice((c, d, t) => stab(c, d, t, ch, beat * 0.5, 1), beat * 0.6, sampleRate)),
  );
  const stabShort = await Promise.all(
    spec.chords.map((ch) => renderVoice((c, d, t) => stab(c, d, t, ch, beat * 0.35, 1), beat * 0.45, sampleRate)),
  );
  const padV = await Promise.all(
    spec.chords.map((ch) =>
      renderVoice((c, d, t) => pad(c, d, t, ch.map((n) => n + 12), bar, 1), bar + 0.06, sampleRate),
    ),
  );

  /** Mix a voice in at `time` with gain and constant-power pan (-1..1). */
  const add = (v: Float32Array[], time: number, gain: number, pan = 0) => {
    const off = Math.round(time * sampleRate);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const [vl, vr] = v;
    const n = Math.min(vl.length, length - off);
    for (let i = 0; i < n; i++) {
      L[off + i] += vl[i] * gl;
      R[off + i] += vr[i] * gr;
    }
  };

  // Section map (in bars): intro 0-15, main 16-31, breakdown 32-39, main 40-55, outro 56-63.
  const section = (b: number) =>
    b < 8 ? 'intro1' : b < 16 ? 'intro2' : b < 32 ? 'main' : b < 40 ? 'break' : b < 56 ? 'main2' : 'outro';

  for (let b = 0; b < spec.bars; b++) {
    const s = section(b);
    const t0 = b * bar;
    const ci = b % spec.roots.length;
    const withKick = s !== 'break';
    const full = s === 'main' || s === 'main2';

    if (b === 16 || b === 40) add(crashV, t0, 0.5);

    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat;
      if (withKick) add(kickV, t, 0.85);
      if (s !== 'break') add(s === 'intro1' ? hatC : hatO, t + beat / 2, s === 'intro1' ? 0.5 : 0.6, 0.15);
      if (s !== 'intro1' && s !== 'break' && (q === 1 || q === 3)) add(clapV, t, 0.55);
      if (full || s === 'outro') add(hatC, t + beat * 0.25, 0.3, -0.2);
      if (full) add(hatC, t + beat * 0.75, 0.3, -0.2);
      if (full) add(bassV[ci], t + beat / 2, 0.6);
    }
    if (full) {
      // Syncopated chord stabs on the "and" of 2 and on 4.
      add(stabLong[ci], t0 + beat * 1.5, 0.55, -0.35);
      add(stabShort[ci], t0 + beat * 3, 0.45, 0.35);
    }
    if (s === 'break') add(padV[ci], t0, 1.1);
    if (s === 'main2') add(padV[ci], t0, 0.5, -0.3);
    if (b === 36) add(riserV, t0, 0.6);
  }

  // Normalise with gentle soft-clipping so the demo sits near -1 dBFS.
  let peak = 1e-9;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const drive = 1.25 / peak;
  const norm = 0.89 / Math.tanh(1.25);
  for (let i = 0; i < length; i++) {
    L[i] = Math.tanh(L[i] * drive) * norm;
    R[i] = Math.tanh(R[i] * drive) * norm;
  }

  const out = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  out.copyToChannel(L, 0);
  out.copyToChannel(R, 1);
  return out;
}
