export type CrossfaderCurve = 'smooth' | 'mix' | 'cut';

export const CURVES: { id: CrossfaderCurve; label: string; hint: string }[] = [
  { id: 'smooth', label: 'Smooth', hint: 'Constant-power blend — best for long fades' },
  { id: 'mix', label: 'Mix', hint: 'Both decks at full volume in the middle' },
  { id: 'cut', label: 'Cut', hint: 'Sharp cut-in for scratching and cuts' },
];

/**
 * Gains for deck A and deck B at crossfader position x (0 = full A, 1 = full B).
 */
export function crossfaderGains(x: number, curve: CrossfaderCurve): [number, number] {
  const p = Math.min(1, Math.max(0, x));
  switch (curve) {
    case 'smooth':
      return [Math.cos((p * Math.PI) / 2), Math.sin((p * Math.PI) / 2)];
    case 'mix':
      return [Math.min(1, 2 * (1 - p)), Math.min(1, 2 * p)];
    case 'cut': {
      const edge = 0.04;
      return [Math.min(1, (1 - p) / edge), Math.min(1, p / edge)];
    }
  }
}
