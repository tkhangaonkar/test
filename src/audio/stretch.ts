/**
 * Key lock: WSOLA (waveform-similarity overlap-add) time-stretching.
 *
 * Output is built from ~43 ms Hann-windowed slices of the source, overlapped by
 * 50 %. Slices are taken from wherever the nominal playhead is (so the tempo
 * follows the tempo fader), but each slice start is nudged by up to ±8 ms to
 * the point whose waveform best continues the previous slice. Slices are
 * replayed at their original speed, so the pitch never changes.
 *
 * This class is embedded verbatim into the AudioWorklet via `toString()`, so it
 * must stay self-contained: no imports, no module-level constants, and only
 * `declare`d fields (assigned in the constructor).
 */
export class Stretcher {
  declare N: number;
  declare H: number;
  declare tol: number;
  declare win: Float32Array;
  declare olaL: Float32Array;
  declare olaR: Float32Array;
  declare outL: Float32Array;
  declare outR: Float32Array;
  declare outIdx: number;
  declare prevStart: number;
  declare active: boolean;
  /** Last produced sample (left / right). */
  declare l: number;
  declare r: number;
  declare left: Float32Array;
  declare right: Float32Array;
  declare len: number;
  declare ls: number;
  declare le: number;
  declare inLoop: boolean;

  constructor(sampleRate: number) {
    this.N = sampleRate > 60000 ? 4096 : 2048;
    this.H = this.N / 2;
    this.tol = Math.round(sampleRate * 0.008);
    this.win = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.N);
    this.olaL = new Float32Array(this.N);
    this.olaR = new Float32Array(this.N);
    this.outL = new Float32Array(this.H);
    this.outR = new Float32Array(this.H);
    this.outIdx = this.H;
    this.prevStart = 0;
    this.active = false;
    this.l = 0;
    this.r = 0;
    this.left = this.outL;
    this.right = this.outR;
    this.len = 0;
    this.ls = -1;
    this.le = -1;
    this.inLoop = false;
  }

  reset() {
    this.active = false;
  }

  /** Map a source index through the active loop. */
  map(i: number): number {
    if (this.le > this.ls && this.ls >= 0) {
      const span = this.le - this.ls;
      if (i >= this.le) return this.ls + ((i - this.ls) % span);
      // Inside a loop the audio is circular: just before the start is the loop's tail.
      if (this.inLoop && i < this.ls) return this.le - ((this.ls - i) % span || span);
    }
    return i;
  }

  mono(i: number): number {
    const k = this.map(i);
    if (k < 0 || k >= this.len) return 0;
    return this.left[k] + this.right[k];
  }

  /** Overlap-add one windowed slice starting at source index `start`. */
  addSlice(start: number) {
    const N = this.N;
    for (let j = 0; j < N; j++) {
      const k = this.map(start + j);
      if (k < 0 || k >= this.len) continue;
      const w = this.win[j];
      this.olaL[j] += this.left[k] * w;
      this.olaR[j] += this.right[k] * w;
    }
  }

  /** Move the finished first half of the overlap buffer to the output queue. */
  shift() {
    const H = this.H;
    for (let j = 0; j < H; j++) {
      this.outL[j] = this.olaL[j];
      this.outR[j] = this.olaR[j];
      this.olaL[j] = this.olaL[j + H];
      this.olaR[j] = this.olaR[j + H];
      this.olaL[j + H] = 0;
      this.olaR[j + H] = 0;
    }
    this.outIdx = 0;
  }

  /** Normalised similarity of the slice at `cand` to the template at `nat`. */
  score(nat: number, cand: number, step: number): number {
    let dot = 0;
    let energy = 1e-9;
    for (let j = 0; j < this.H; j += step) {
      const b = this.mono(cand + j);
      dot += this.mono(nat + j) * b;
      energy += b * b;
    }
    return dot / Math.sqrt(energy);
  }

  hop(pos: number) {
    const ideal = Math.round(pos);
    const nat = this.map(this.prevStart + this.H);
    let best = nat;
    if (Math.abs(ideal - nat) > 2) {
      let bestScore = -Infinity;
      for (let off = -this.tol; off <= this.tol; off += 4) {
        const s = this.score(nat, ideal + off, 4);
        if (s > bestScore) {
          bestScore = s;
          best = ideal + off;
        }
      }
      const coarse = best;
      for (let off = -3; off <= 3; off++) {
        const s = this.score(nat, coarse + off, 2);
        if (s > bestScore) {
          bestScore = s;
          best = coarse + off;
        }
      }
    }
    this.addSlice(best);
    this.shift();
    this.prevStart = best;
  }

  /**
   * Produce the next output sample into `l` / `r`.
   * `pos` is the nominal playhead (source frames) for this output sample.
   */
  next(
    pos: number,
    left: Float32Array,
    right: Float32Array,
    len: number,
    loopStart: number,
    loopEnd: number,
  ) {
    this.left = left;
    this.right = right;
    this.len = len;
    this.ls = loopStart;
    this.le = loopEnd;
    this.inLoop = loopEnd > loopStart && loopStart >= 0 && pos >= loopStart && pos < loopEnd;
    if (!this.active) {
      // Warm start: pre-load the half slice before `pos` so output begins at full level.
      this.olaL.fill(0);
      this.olaR.fill(0);
      this.prevStart = Math.round(pos) - this.H;
      this.addSlice(this.prevStart);
      this.shift();
      this.outIdx = this.H;
      this.active = true;
    }
    if (this.outIdx >= this.H) this.hop(pos);
    this.l = this.outL[this.outIdx];
    this.r = this.outR[this.outIdx];
    this.outIdx++;
  }
}
