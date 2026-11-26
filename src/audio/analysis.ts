/**
 * Offline track analysis: waveform peaks, BPM and beat-grid phase.
 *
 * Everything here is pure (no Web Audio), so it runs in tests and could be
 * moved into a Web Worker unchanged.
 */

export interface WaveformData {
  /** Peaks per second of audio. */
  rate: number;
  /** Full-band peak amplitude per bucket, normalised 0..1. */
  amp: Float32Array;
  /** Low-band (kick / bass) peak amplitude per bucket, normalised 0..1. */
  low: Float32Array;
}

export interface Analysis {
  bpm: number | null;
  /** Time in seconds of the first beat of the grid (0 <= firstBeat < beat length). */
  firstBeat: number;
  waveform: WaveformData;
}

const ONSET_FPS = 200;
const PEAKS_PER_SECOND = 100;
const MIN_BPM = 60;
const MAX_BPM = 200;

export function analyzeTrack(channels: Float32Array[], sampleRate: number): Analysis {
  const left = channels[0];
  const right = channels[1] ?? channels[0];
  const length = left.length;

  const hop = Math.max(1, Math.round(sampleRate / ONSET_FPS));
  const fps = sampleRate / hop;
  const bucket = Math.max(1, Math.round(sampleRate / PEAKS_PER_SECOND));

  const frames = Math.floor(length / hop);
  const lowEnergy = new Float32Array(frames);
  const highEnergy = new Float32Array(frames);
  const buckets = Math.ceil(length / bucket);
  const amp = new Float32Array(buckets);
  const low = new Float32Array(buckets);

  // Two cascaded one-pole low-passes at ~150 Hz isolate the kick drum.
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let lp1 = 0;
  let lp2 = 0;
  let accLow = 0;
  let accHigh = 0;
  let frameIdx = 0;
  let frameFill = 0;
  let bucketIdx = 0;
  let bucketFill = 0;
  let bAmp = 0;
  let bLow = 0;

  for (let i = 0; i < length; i++) {
    const x = (left[i] + right[i]) * 0.5;
    lp1 += a * (x - lp1);
    lp2 += a * (lp1 - lp2);
    const h = x - lp2;
    accLow += lp2 * lp2;
    accHigh += h * h;

    const ax = x < 0 ? -x : x;
    const al = lp2 < 0 ? -lp2 : lp2;
    if (ax > bAmp) bAmp = ax;
    if (al > bLow) bLow = al;

    if (++frameFill === hop) {
      if (frameIdx < frames) {
        lowEnergy[frameIdx] = accLow / hop;
        highEnergy[frameIdx] = accHigh / hop;
      }
      frameIdx++;
      frameFill = 0;
      accLow = 0;
      accHigh = 0;
    }
    if (++bucketFill === bucket) {
      amp[bucketIdx] = bAmp;
      low[bucketIdx] = bLow;
      bucketIdx++;
      bucketFill = 0;
      bAmp = 0;
      bLow = 0;
    }
  }
  if (bucketFill > 0 && bucketIdx < buckets) {
    amp[bucketIdx] = bAmp;
    low[bucketIdx] = bLow;
  }

  // Normalise waveform; boost the low band so it reads clearly when drawn.
  let maxAmp = 1e-9;
  let maxLow = 1e-9;
  for (let i = 0; i < buckets; i++) {
    if (amp[i] > maxAmp) maxAmp = amp[i];
    if (low[i] > maxLow) maxLow = low[i];
  }
  for (let i = 0; i < buckets; i++) {
    amp[i] /= maxAmp;
    low[i] = Math.min(amp[i], (low[i] / maxLow) * 0.9);
  }

  const onset = onsetEnvelope(lowEnergy, highEnergy, fps);
  const bpm = estimateBpm(onset, fps);
  const firstBeat = bpm ? estimatePhase(onset, fps, bpm) : 0;

  return {
    bpm,
    firstBeat,
    waveform: { rate: sampleRate / bucket, amp, low },
  };
}

/** Positive log-energy flux of the low and high bands, with local mean removed. */
export function onsetEnvelope(lowEnergy: Float32Array, highEnergy: Float32Array, fps: number): Float32Array {
  const n = lowEnergy.length;
  const raw = new Float32Array(n);
  let prevL = Math.log1p(lowEnergy[0] * 1e4 || 0);
  let prevH = Math.log1p(highEnergy[0] * 1e4 || 0);
  for (let i = 1; i < n; i++) {
    const l = Math.log1p(lowEnergy[i] * 1e4);
    const h = Math.log1p(highEnergy[i] * 1e4);
    raw[i] = Math.max(0, l - prevL) + 0.5 * Math.max(0, h - prevH);
    prevL = l;
    prevH = h;
  }
  // Subtract a ~0.25 s moving average so sustained loud passages don't dominate.
  const half = Math.max(1, Math.round(fps * 0.125));
  const out = new Float32Array(n);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < Math.min(n, half); i++) {
    sum += raw[i];
    count++;
  }
  for (let i = 0; i < n; i++) {
    const add = i + half;
    if (add < n) {
      sum += raw[add];
      count++;
    }
    const rem = i - half - 1;
    if (rem >= 0) {
      sum -= raw[rem];
      count--;
    }
    out[i] = Math.max(0, raw[i] - sum / count);
  }
  return out;
}

function autocorrelate(o: Float32Array, maxLag: number): Float32Array {
  const n = o.length;
  const r = new Float32Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += o[i] * o[i - lag];
    r[lag] = s / (n - lag || 1);
  }
  return r;
}

function interp(arr: Float32Array, x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= arr.length) return 0;
  const f = x - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

/** Prefer tempos near 120 BPM when choosing between octave-related candidates. */
function tempoPrior(bpm: number): number {
  const octaves = Math.log2(bpm / 120);
  return Math.exp(-0.5 * (octaves / 0.6) ** 2);
}

export function estimateBpm(onset: Float32Array, fps: number): number | null {
  if (onset.length < fps * 4) return null; // need a few seconds of audio

  // Use at most ~3 minutes from the middle of the track.
  const maxFrames = Math.round(fps * 180);
  let o = onset;
  if (onset.length > maxFrames) {
    const start = Math.floor((onset.length - maxFrames) / 2);
    o = onset.subarray(start, start + maxFrames);
  }

  let energy = 0;
  for (let i = 0; i < o.length; i++) energy += o[i];
  if (energy < 1e-6) return null;

  const harmonics = 4;
  const maxLag = Math.ceil(((60 * fps) / MIN_BPM) * harmonics);
  const r = autocorrelate(o, Math.min(maxLag, o.length - 2));

  const score = (bpm: number) => {
    const lag = (60 * fps) / bpm;
    let s = 0;
    for (let k = 1; k <= harmonics; k++) s += interp(r, lag * k) / k ** 0.5;
    return s * tempoPrior(bpm);
  };

  let best = MIN_BPM;
  let bestScore = -Infinity;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.1) {
    const s = score(bpm);
    if (s > bestScore) {
      bestScore = s;
      best = bpm;
    }
  }
  // Fine search around the winner.
  const lo = best - 0.15;
  const hi = best + 0.15;
  for (let bpm = lo; bpm <= hi; bpm += 0.005) {
    const s = score(bpm);
    if (s > bestScore) {
      bestScore = s;
      best = bpm;
    }
  }
  if (!(bestScore > 0)) return null;

  // Octave check: if there is nearly as much periodicity at half the beat
  // period, the music is really at double this tempo (e.g. 174 vs 87).
  const lag = (60 * fps) / best;
  if (best * 2 <= MAX_BPM && interp(r, lag / 2) >= 0.8 * interp(r, lag)) best *= 2;

  best = refineBpm(o, fps, best);
  const rounded = Math.round(best);
  if (Math.abs(best - rounded) < 0.06) return rounded;
  return Math.round(best * 100) / 100;
}

/**
 * Autocorrelation gets the tempo octave right but is only accurate to ~0.1 BPM.
 * A comb filter laid over the whole window is far sharper: a tempo that is off
 * by 0.05 BPM drifts off the onsets within a minute. Search tempo and phase
 * jointly for the comb that hits the most onset energy.
 */
function refineBpm(o: Float32Array, fps: number, coarse: number): number {
  let best = coarse;
  let bestScore = -Infinity;
  for (let bpm = coarse - 0.3; bpm <= coarse + 0.3; bpm += 0.01) {
    const period = (60 * fps) / bpm;
    for (let phase = 0; phase < period; phase += 1) {
      let s = 0;
      for (let t = phase; t < o.length - 1; t += period) s += interp(o, t);
      if (s > bestScore) {
        bestScore = s;
        best = bpm;
      }
    }
  }
  return best;
}

/** Find the time offset of the beat grid that lines up best with onsets. */
export function estimatePhase(onset: Float32Array, fps: number, bpm: number): number {
  const period = (60 * fps) / bpm;
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let phase = 0; phase < period; phase += 0.5) {
    let s = 0;
    for (let t = phase; t < onset.length - 1; t += period) {
      s += interp(onset, t);
    }
    if (s > bestScore) {
      bestScore = s;
      bestPhase = phase;
    }
  }
  return bestPhase / fps;
}

/** Duration of one beat in seconds. */
export function beatLength(bpm: number): number {
  return 60 / bpm;
}

/** Snap a time (seconds) to the nearest beat on a grid. */
export function snapToBeat(time: number, bpm: number | null, firstBeat: number): number {
  if (!bpm) return time;
  const len = beatLength(bpm);
  const n = Math.round((time - firstBeat) / len);
  return Math.max(0, firstBeat + n * len);
}

/** Fractional beat phase (0..1) of a time on a grid. */
export function beatPhase(time: number, bpm: number, firstBeat: number): number {
  const len = beatLength(bpm);
  const p = ((time - firstBeat) / len) % 1;
  return p < 0 ? p + 1 : p;
}
