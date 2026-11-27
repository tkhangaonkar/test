import { describe, expect, it } from 'vitest';
import { Stretcher } from './stretch';

const SR = 48000;

function sine(freq: number, seconds: number) {
  const a = new Float32Array(SR * seconds);
  for (let i = 0; i < a.length; i++) a[i] = Math.sin((2 * Math.PI * freq * i) / SR) * 0.5;
  return a;
}

/** Run the stretcher like the worklet does: nominal position advances by `rate` per sample. */
function run(src: Float32Array, rate: number, samples: number, start = SR) {
  const st = new Stretcher(SR);
  const out = new Float32Array(samples);
  let pos = start;
  for (let i = 0; i < samples; i++) {
    st.next(pos, src, src, src.length, -1, -1);
    out[i] = st.l;
    pos += rate;
  }
  return { out, pos };
}

/** Estimate frequency from upward zero crossings. */
function freqOf(x: Float32Array) {
  let first = -1;
  let last = -1;
  let n = 0;
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) {
      if (first < 0) first = i;
      last = i;
      n++;
    }
  }
  return ((n - 1) * SR) / (last - first);
}

describe('Stretcher (key lock)', () => {
  it('reproduces the source exactly at normal speed', () => {
    const src = sine(440, 4);
    const { out } = run(src, 1, SR);
    let maxErr = 0;
    for (let i = 0; i < out.length; i++) maxErr = Math.max(maxErr, Math.abs(out[i] - src[SR + i]));
    expect(maxErr).toBeLessThan(1e-4);
  });

  for (const rate of [0.84, 0.92, 1.08, 1.16, 1.5]) {
    it(`keeps the pitch at ${Math.round(rate * 100)} % tempo`, () => {
      const src = sine(440, 6);
      const { out } = run(src, rate, SR * 2);
      expect(Math.abs(freqOf(out.subarray(4096)) - 440)).toBeLessThan(2);
      // Level stays steady (no dropouts at splice points).
      let min = Infinity;
      for (let i = 4096; i + 480 < out.length; i += 480) {
        let peak = 0;
        for (let j = 0; j < 480; j++) peak = Math.max(peak, Math.abs(out[i + j]));
        min = Math.min(min, peak);
      }
      expect(min).toBeGreaterThan(0.4);
    });
  }

  it('reads through an active loop without dropouts', () => {
    const src = new Float32Array(SR * 4);
    // Only the looped region has sound; any read outside it would show up as a level drop.
    const ls = SR;
    const le = SR + 9600;
    for (let i = ls; i < le; i++) src[i] = Math.sin((2 * Math.PI * 220 * (i - ls)) / SR) * 0.5;
    const st = new Stretcher(SR);
    const out = new Float32Array(SR);
    let pos = ls;
    for (let i = 0; i < SR; i++) {
      st.next(pos, src, src, src.length, ls, le);
      out[i] = st.l;
      pos += 1.05;
      if (pos >= le) pos = ls + ((pos - ls) % (le - ls));
    }
    let min = Infinity;
    for (let i = 4096; i + 480 < out.length; i += 480) {
      let peak = 0;
      for (let j = 0; j < 480; j++) peak = Math.max(peak, Math.abs(out[i + j]));
      min = Math.min(min, peak);
    }
    expect(min).toBeGreaterThan(0.4);
  });

  it('survives toString() for embedding in the worklet', () => {
    const Rebuilt = new Function(`return (${Stretcher.toString()});`)() as typeof Stretcher;
    const src = sine(330, 3);
    const st = new Rebuilt(SR);
    st.next(SR, src, src, src.length, -1, -1);
    expect(Number.isFinite(st.l)).toBe(true);
  });
});
