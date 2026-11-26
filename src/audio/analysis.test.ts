import { describe, expect, it } from 'vitest';
import { analyzeTrack, beatPhase, snapToBeat } from './analysis';

/** Synthesise a simple four-on-the-floor pattern: kick on beats, hat off-beat. */
function makeBeat(bpm: number, seconds: number, offset: number, sr = 44100): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  const beat = 60 / bpm;
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let t = offset; t < seconds; t += beat) {
    const start = Math.round(t * sr);
    for (let i = 0; i < sr * 0.25 && start + i < out.length; i++) {
      const tt = i / sr;
      const f = 50 + 90 * Math.exp(-tt * 30);
      out[start + i] += Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 9) * 0.8;
    }
    const hat = Math.round((t + beat / 2) * sr);
    for (let i = 0; i < sr * 0.04 && hat + i < out.length; i++) {
      out[hat + i] += noise() * Math.exp(-(i / sr) * 90) * 0.15;
    }
  }
  return out;
}

describe('analyzeTrack', () => {
  for (const bpm of [92, 100, 124, 127.5, 128, 140, 174]) {
    it(`detects ${bpm} BPM and the first beat`, () => {
      const offset = 0.21;
      const sig = makeBeat(bpm, 40, offset);
      const a = analyzeTrack([sig], 44100);
      expect(a.bpm).not.toBeNull();
      expect(Math.abs(a.bpm! - bpm)).toBeLessThan(0.1);
      // firstBeat is the offset folded into one beat length.
      const expected = offset % (60 / bpm);
      const diff = Math.abs(beatPhase(a.firstBeat, bpm, expected) - 0);
      expect(Math.min(diff, 1 - diff)).toBeLessThan(0.05);
    });
  }

  it('returns null BPM for silence and normalised peaks', () => {
    const a = analyzeTrack([new Float32Array(44100 * 6)], 44100);
    expect(a.bpm).toBeNull();
    expect(a.waveform.amp.length).toBeGreaterThan(500);
  });
});

describe('grid helpers', () => {
  it('snaps to nearest beat', () => {
    expect(snapToBeat(1.04, 120, 0.0)).toBeCloseTo(1.0);
    expect(snapToBeat(1.3, 120, 0.1)).toBeCloseTo(1.1);
    expect(snapToBeat(1.3, null, 0)).toBe(1.3);
  });
});

describe('performance', () => {
  it('analyses a 5-minute stereo track quickly', () => {
    const sig = makeBeat(126, 300, 0.1);
    const t0 = performance.now();
    const a = analyzeTrack([sig, sig], 44100);
    const ms = performance.now() - t0;
    expect(a.bpm).toBe(126);
    expect(ms).toBeLessThan(3000);
  });
});
