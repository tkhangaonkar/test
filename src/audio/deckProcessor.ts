/**
 * AudioWorklet source for one deck's playback head.
 *
 * It is kept as a string and loaded through a Blob URL so it works the same
 * in Vite dev, a production build, and inside a Capacitor WebView.
 *
 * The processor plays a decoded track at any speed — including backwards —
 * which is what lets the platter scratch, the tempo fader bend pitch, and the
 * loop engine wrap seamlessly at sample accuracy.
 */
export const DECK_PROCESSOR_NAME = 'deckflow-deck';

/** Start/stop ramp time constant (seconds); avoids clicks. Exported for sync compensation. */
export const MOTOR_TAU = 0.005;

export const deckProcessorSource = /* js */ `
const MOTOR_TAU = ${MOTOR_TAU};
class DeckProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = null;
    this.right = null;
    this.length = 0;
    this.srcRate = sampleRate;
    this.pos = 0;            // playhead, in source frames (fractional)
    this.playing = false;
    this.rate = 1;           // tempo rate (1 = original speed)
    this.bend = 0;           // temporary pitch-bend offset
    this.current = 0;        // smoothed actual rate
    this.scratching = false;
    this.scratchTarget = 0;  // frame the "hand" is holding the record at
    this.loopStart = -1;
    this.loopEnd = -1;
    this.counter = 0;
    this.motorCoef = 1 - Math.exp(-1 / (MOTOR_TAU * sampleRate));
    this.handCoef = 1 - Math.exp(-1 / (0.010 * sampleRate));
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'load':
        this.left = m.left;
        this.right = m.right || m.left;
        this.length = m.length;
        this.srcRate = m.sampleRate;
        this.pos = 0;
        this.current = 0;
        this.playing = false;
        this.loopStart = this.loopEnd = -1;
        break;
      case 'unload':
        this.left = this.right = null;
        this.length = 0;
        this.playing = false;
        break;
      case 'play':
        this.playing = !!m.value;
        if (this.playing && this.pos >= this.length - 1) this.pos = 0;
        break;
      case 'seek': {
        let f = m.frame;
        // Compensate for the time the message spent in flight (used by sync).
        if (m.refTime != null && this.playing) {
          f += Math.max(0, currentTime - m.refTime) * (this.rate + this.bend) * this.srcRate;
        }
        this.pos = Math.max(0, Math.min(this.length - 1, f));
        if (this.scratching) this.scratchTarget = this.pos;
        break;
      }
      case 'rate':
        this.rate = m.value;
        break;
      case 'bend':
        this.bend = m.value;
        break;
      case 'scratchStart':
        this.scratching = true;
        this.scratchTarget = this.pos;
        break;
      case 'scratchMove':
        this.scratchTarget = Math.max(0, Math.min(this.length - 1, this.scratchTarget + m.delta));
        break;
      case 'scratchEnd':
        this.scratching = false;
        break;
      case 'loop':
        if (m.start == null) { this.loopStart = this.loopEnd = -1; }
        else { this.loopStart = m.start; this.loopEnd = m.end; }
        break;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const n = L.length;
    const left = this.left;
    if (!left) {
      L.fill(0); if (R !== L) R.fill(0);
      return true;
    }
    const right = this.right;
    const len = this.length;
    const ratio = this.srcRate / sampleRate;
    const loopOn = this.loopEnd > this.loopStart && this.loopStart >= 0;
    let ended = false;

    for (let i = 0; i < n; i++) {
      if (this.scratching) {
        // Playhead follows the hand; the speed of the hand becomes the pitch.
        const prev = this.pos;
        this.pos += (this.scratchTarget - this.pos) * this.handCoef;
        this.current = (this.pos - prev) / ratio;
      } else {
        const target = this.playing ? this.rate + this.bend : 0;
        this.current += (target - this.current) * this.motorCoef;
        if (Math.abs(this.current) < 1e-5 && !this.playing) this.current = 0;
        this.pos += this.current * ratio;
        if (loopOn && this.current > 0 && this.pos >= this.loopEnd) {
          this.pos = this.loopStart + ((this.pos - this.loopStart) % (this.loopEnd - this.loopStart));
        }
      }

      if (this.pos < 0) this.pos = 0;
      if (this.pos >= len - 1) {
        this.pos = len - 1;
        if (this.playing && !this.scratching) { this.playing = false; ended = true; }
      }

      const p = this.pos;
      const i0 = p | 0;
      const f = p - i0;
      const i1 = i0 + 1 < len ? i0 + 1 : i0;
      L[i] = left[i0] + (left[i1] - left[i0]) * f;
      R[i] = right[i0] + (right[i1] - right[i0]) * f;
    }

    this.counter += n;
    if (ended || this.counter >= 735) { // ~60 reports per second
      this.counter = 0;
      this.port.postMessage({
        type: 'pos',
        frame: this.pos,
        rate: this.current,
        playing: this.playing,
        time: currentTime + n / sampleRate, // frame is the position at the END of this block
        ended,
      });
    }
    return true;
  }
}
registerProcessor('${'deckflow-deck'}', DeckProcessor);
`;
