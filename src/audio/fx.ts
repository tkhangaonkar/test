/**
 * Per-deck effect unit. One effect is active at a time; `wet` blends it in and
 * `param` is the effect's main control (echo time, reverb size, LFO rate...).
 * Time-based effects lock to the deck's current BPM.
 */

export type FxType = 'echo' | 'reverb' | 'flanger' | 'phaser' | 'gate' | 'crush';

export interface FxInfo {
  id: FxType;
  label: string;
  param: string;
  /** Human-readable value for a given param position. */
  describe: (param: number) => string;
}

const ECHO_BEATS = [1 / 8, 1 / 4, 3 / 8, 1 / 2, 3 / 4, 1];
const GATE_DIV = [1, 2, 4, 8];

const fraction = (b: number) =>
  b >= 1 ? `${b} beat` : ({ 0.125: '1/8', 0.25: '1/4', 0.375: '3/8', 0.5: '1/2', 0.75: '3/4' } as Record<number, string>)[b] ?? `${b}`;

const pick = <T,>(list: T[], p: number) => list[Math.min(list.length - 1, Math.floor(p * list.length))];
const lfoRate = (p: number) => 0.05 * Math.pow(80, p); // 0.05 Hz .. 4 Hz

export const FX_LIST: FxInfo[] = [
  { id: 'echo', label: 'Echo', param: 'Time', describe: (p) => fraction(pick(ECHO_BEATS, p)) },
  { id: 'reverb', label: 'Reverb', param: 'Size', describe: (p) => `${(0.6 + p * 4.4).toFixed(1)} s` },
  { id: 'flanger', label: 'Flanger', param: 'Rate', describe: (p) => `${lfoRate(p).toFixed(2)} Hz` },
  { id: 'phaser', label: 'Phaser', param: 'Rate', describe: (p) => `${lfoRate(p).toFixed(2)} Hz` },
  { id: 'gate', label: 'Gate', param: 'Rate', describe: (p) => `1/${pick(GATE_DIV, p) * 4}` },
  { id: 'crush', label: 'Crush', param: 'Bits', describe: (p) => `${Math.round(12 - p * 10)} bit` },
];

interface Effect {
  input: AudioNode;
  output: AudioNode;
  /** true: effect is added on top of the dry signal; false: it replaces it. */
  additive: boolean;
  update(param: number, bpm: number): void;
  dispose(): void;
}

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.round(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
    }
  }
  return buf;
}

function createEffect(ctx: AudioContext, type: FxType): Effect {
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  const track = <N extends AudioNode>(n: N) => {
    nodes.push(n);
    return n;
  };
  const dispose = () => {
    oscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    });
    nodes.forEach((n) => n.disconnect());
  };
  const now = () => ctx.currentTime;

  switch (type) {
    case 'echo': {
      const input = track(ctx.createGain());
      const delay = track(ctx.createDelay(4));
      const fb = track(ctx.createGain());
      const tone = track(ctx.createBiquadFilter());
      tone.type = 'bandpass';
      tone.frequency.value = 1800;
      tone.Q.value = 0.4;
      fb.gain.value = 0.5;
      input.connect(delay);
      delay.connect(tone);
      tone.connect(fb);
      fb.connect(delay);
      return {
        input,
        output: delay,
        additive: true,
        update(p, bpm) {
          const t = pick(ECHO_BEATS, p) * (60 / bpm);
          delay.delayTime.setTargetAtTime(Math.min(3.9, t), now(), 0.02);
        },
        dispose,
      };
    }
    case 'reverb': {
      const input = track(ctx.createBiquadFilter());
      input.type = 'highpass';
      input.frequency.value = 180;
      const conv = track(ctx.createConvolver());
      input.connect(conv);
      let size = -1;
      let timer = 0;
      return {
        input,
        output: conv,
        additive: true,
        update(p) {
          const next = Math.round((0.6 + p * 4.4) * 10) / 10;
          if (next === size) return;
          size = next;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => (conv.buffer = makeImpulse(ctx, size)), conv.buffer ? 120 : 0);
        },
        dispose() {
          window.clearTimeout(timer);
          dispose();
        },
      };
    }
    case 'flanger': {
      const input = track(ctx.createGain());
      const delay = track(ctx.createDelay(0.05));
      const fb = track(ctx.createGain());
      const lfo = track(ctx.createOscillator());
      const depth = track(ctx.createGain());
      delay.delayTime.value = 0.004;
      depth.gain.value = 0.0028;
      fb.gain.value = 0.65;
      lfo.connect(depth);
      depth.connect(delay.delayTime);
      input.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      lfo.start();
      oscs.push(lfo);
      return {
        input,
        output: delay,
        additive: true,
        update(p) {
          lfo.frequency.setTargetAtTime(lfoRate(p), now(), 0.05);
        },
        dispose,
      };
    }
    case 'phaser': {
      const input = track(ctx.createGain());
      const lfo = track(ctx.createOscillator());
      const depth = track(ctx.createGain());
      depth.gain.value = 900;
      lfo.connect(depth);
      let last: AudioNode = input;
      for (let i = 0; i < 6; i++) {
        const ap = track(ctx.createBiquadFilter());
        ap.type = 'allpass';
        ap.frequency.value = 1100;
        ap.Q.value = 0.6;
        depth.connect(ap.frequency);
        last.connect(ap);
        last = ap;
      }
      lfo.start();
      oscs.push(lfo);
      return {
        input,
        output: last,
        additive: true,
        update(p) {
          lfo.frequency.setTargetAtTime(lfoRate(p), now(), 0.05);
        },
        dispose,
      };
    }
    case 'gate': {
      const input = track(ctx.createGain());
      const vca = track(ctx.createGain());
      const lfo = track(ctx.createOscillator());
      const depth = track(ctx.createGain());
      lfo.type = 'square';
      vca.gain.value = 0.5;
      depth.gain.value = 0.5;
      lfo.connect(depth);
      depth.connect(vca.gain);
      input.connect(vca);
      lfo.start();
      oscs.push(lfo);
      return {
        input,
        output: vca,
        additive: false,
        update(p, bpm) {
          lfo.frequency.setTargetAtTime((bpm / 60) * pick(GATE_DIV, p), now(), 0.01);
        },
        dispose,
      };
    }
    case 'crush': {
      const input = track(ctx.createGain());
      const shaper = track(ctx.createWaveShaper());
      const post = track(ctx.createBiquadFilter());
      post.type = 'lowpass';
      post.frequency.value = 9000;
      input.connect(shaper);
      shaper.connect(post);
      let bits = -1;
      return {
        input,
        output: post,
        additive: false,
        update(p) {
          const b = Math.round(12 - p * 10);
          if (b === bits) return;
          bits = b;
          const steps = Math.pow(2, b - 1);
          const n = 8192;
          const curve = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            curve[i] = Math.round(x * steps) / steps;
          }
          shaper.curve = curve;
        },
        dispose,
      };
    }
  }
}

export class FxUnit {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wetGain: GainNode;
  private effect: Effect;
  private type: FxType;
  private wet = 0.5;
  private on = false;
  private param = 0.5;
  private bpm = 120;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.input.connect(this.dry);
    this.dry.connect(this.output);
    this.wetGain.connect(this.output);
    this.type = 'echo';
    this.effect = this.build('echo');
  }

  private build(type: FxType): Effect {
    const fx = createEffect(this.ctx, type);
    this.input.connect(fx.input);
    fx.output.connect(this.wetGain);
    fx.update(this.param, this.bpm);
    return fx;
  }

  setType(type: FxType) {
    if (type === this.type) return;
    this.input.disconnect(this.effect.input);
    this.effect.dispose();
    this.type = type;
    this.effect = this.build(type);
    this.applyMix();
  }

  set(opts: { on?: boolean; wet?: number; param?: number; bpm?: number }) {
    if (opts.on !== undefined) this.on = opts.on;
    if (opts.wet !== undefined) this.wet = opts.wet;
    if (opts.param !== undefined) this.param = opts.param;
    if (opts.bpm !== undefined && opts.bpm > 0) this.bpm = opts.bpm;
    if (opts.param !== undefined || opts.bpm !== undefined) this.effect.update(this.param, this.bpm);
    this.applyMix();
  }

  private applyMix() {
    const t = this.ctx.currentTime;
    const w = this.on ? this.wet : 0;
    const dry = this.effect.additive ? 1 : 1 - w;
    this.dry.gain.setTargetAtTime(dry, t, 0.015);
    this.wetGain.gain.setTargetAtTime(this.effect.additive ? w * 0.9 : w, t, 0.015);
  }
}
