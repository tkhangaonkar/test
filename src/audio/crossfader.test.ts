import { describe, expect, it } from 'vitest';
import { crossfaderGains } from './crossfader';

describe('crossfaderGains', () => {
  it('is full A at 0 and full B at 1 for every curve', () => {
    for (const c of ['smooth', 'mix', 'cut'] as const) {
      const [a0, b0] = crossfaderGains(0, c);
      const [a1, b1] = crossfaderGains(1, c);
      expect(a0).toBeCloseTo(1);
      expect(b0).toBeCloseTo(0);
      expect(a1).toBeCloseTo(0);
      expect(b1).toBeCloseTo(1);
    }
  });
  it('smooth keeps constant power', () => {
    for (const x of [0.1, 0.3, 0.5, 0.8]) {
      const [a, b] = crossfaderGains(x, 'smooth');
      expect(a * a + b * b).toBeCloseTo(1);
    }
  });
  it('mix and cut keep both decks loud in the middle', () => {
    expect(crossfaderGains(0.5, 'mix')).toEqual([1, 1]);
    expect(crossfaderGains(0.5, 'cut')).toEqual([1, 1]);
    expect(crossfaderGains(0.99, 'cut')[0]).toBeLessThan(0.3);
  });
});
