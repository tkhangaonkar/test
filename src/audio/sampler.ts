import { Store } from './store';
import { clap, crash, horn, kick, laser, riser, siren, snare, subDrop } from './synth';

type SynthFn = (ctx: BaseAudioContext, dest: AudioNode, t: number) => void;

interface PadDef {
  name: string;
  play: SynthFn;
}

const BUILT_IN: PadDef[] = [
  { name: 'Horn', play: (c, d, t) => horn(c, d, t) },
  { name: 'Siren', play: (c, d, t) => siren(c, d, t) },
  { name: 'Laser', play: (c, d, t) => laser(c, d, t) },
  { name: 'Riser', play: (c, d, t) => riser(c, d, t, 2) },
  { name: 'Drop', play: (c, d, t) => subDrop(c, d, t) },
  { name: 'Kick', play: (c, d, t) => kick(c, d, t) },
  { name: 'Clap', play: (c, d, t) => clap(c, d, t) },
  { name: 'Snare', play: (c, d, t) => snare(c, d, t) },
  { name: 'Crash', play: (c, d, t) => crash(c, d, t) },
];

export interface PadState {
  name: string;
  custom: boolean;
}

export const PAD_COUNT = 8;

export class Sampler {
  readonly output: GainNode;
  readonly store: Store<{ pads: PadState[]; volume: number }>;
  private custom: (AudioBuffer | null)[] = Array(PAD_COUNT).fill(null);

  constructor(private ctx: AudioContext) {
    this.output = ctx.createGain();
    this.output.gain.value = 0.8;
    this.store = new Store<{ pads: PadState[]; volume: number }>({
      pads: BUILT_IN.slice(0, PAD_COUNT).map((p) => ({ name: p.name, custom: false })),
      volume: 0.8,
    });
  }

  trigger(i: number) {
    const t = this.ctx.currentTime + 0.005;
    const buf = this.custom[i];
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.output);
      src.start(t);
      return;
    }
    BUILT_IN[i]?.play(this.ctx, this.output, t);
  }

  async assign(i: number, file: File) {
    const buf = await this.ctx.decodeAudioData(await file.arrayBuffer());
    this.custom[i] = buf;
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 14);
    this.store.set((s) => ({ pads: s.pads.map((p, j) => (j === i ? { name, custom: true } : p)) }));
  }

  reset(i: number) {
    this.custom[i] = null;
    this.store.set((s) => ({
      pads: s.pads.map((p, j) => (j === i ? { name: BUILT_IN[i].name, custom: false } : p)),
    }));
  }

  setVolume(v: number) {
    this.store.set({ volume: v });
    this.output.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.02);
  }
}
