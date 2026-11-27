/**
 * Headphone cue (pre-listen).
 *
 * Decks with their headphone button on feed `cueBus` (pre-fader, so you can
 * hear a track before it is in the mix). The phones mix blends that cue with
 * the master. Two ways to get it to your ears:
 *
 * - split:  one stereo output is split — LEFT = phones mix (mono),
 *           RIGHT = master (mono). Use a DJ splitter cable, or just headphones.
 *           Works everywhere, including the Android app.
 * - device: the phones mix plays on a second audio output (e.g. USB headphones)
 *           while the master stays on the main output. Needs a browser that can
 *           pick audio outputs (desktop Chrome / Edge / Firefox).
 */

export type CueMode = 'off' | 'split' | 'device';

export interface OutputDevice {
  deviceId: string;
  label: string;
}

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
type SelectOutput = (opts?: object) => Promise<MediaDeviceInfo>;

function monoNode(ctx: AudioContext): GainNode {
  const g = ctx.createGain();
  g.channelCount = 1;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  return g;
}

export class Headphones {
  readonly cueBus: GainNode;
  private cueGain: GainNode;
  private masterGain: GainNode;
  private phones: GainNode;
  private masterMono: GainNode;
  private phonesMono: GainNode;
  private merger: ChannelMergerNode;
  private stream: MediaStreamAudioDestinationNode | null = null;
  private audio: SinkAudio | null = null;
  private mode: CueMode = 'off';

  static get supportsDevice(): boolean {
    return (
      typeof (HTMLMediaElement.prototype as SinkAudio).setSinkId === 'function' &&
      !!navigator.mediaDevices?.enumerateDevices
    );
  }

  constructor(
    private ctx: AudioContext,
    private masterOut: AudioNode,
  ) {
    this.cueBus = ctx.createGain();
    this.cueGain = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.phones = ctx.createGain();
    this.masterMono = monoNode(ctx);
    this.phonesMono = monoNode(ctx);
    this.merger = ctx.createChannelMerger(2);

    this.cueBus.connect(this.cueGain).connect(this.phones);
    masterOut.connect(this.masterGain).connect(this.phones);
    this.masterOut.connect(ctx.destination);
    this.setMix(0.25);
    this.setLevel(0.8);
  }

  /** 0 = cue only, 1 = master only. */
  setMix(x: number) {
    const t = this.ctx.currentTime;
    this.cueGain.gain.setTargetAtTime(Math.cos((x * Math.PI) / 2), t, 0.02);
    this.masterGain.gain.setTargetAtTime(Math.sin((x * Math.PI) / 2), t, 0.02);
  }

  setLevel(v: number) {
    this.phones.gain.setTargetAtTime(v * v * 1.2, this.ctx.currentTime, 0.02);
  }

  private disconnectOutputs() {
    try {
      this.masterOut.disconnect(this.ctx.destination);
    } catch {
      /* not connected */
    }
    try {
      this.masterOut.disconnect(this.masterMono);
    } catch {
      /* not connected */
    }
    this.masterMono.disconnect();
    this.phonesMono.disconnect();
    this.merger.disconnect();
    try {
      this.phones.disconnect(this.phonesMono);
    } catch {
      /* not connected */
    }
    if (this.stream) {
      try {
        this.phones.disconnect(this.stream);
      } catch {
        /* not connected */
      }
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
  }

  async setMode(mode: CueMode, deviceId?: string): Promise<void> {
    if (mode === 'device' && !deviceId) throw new Error('Pick an output device first.');
    this.disconnectOutputs();
    this.mode = mode;
    if (mode === 'split') {
      this.masterOut.connect(this.masterMono);
      this.masterMono.connect(this.merger, 0, 1); // right ear: master
      this.phones.connect(this.phonesMono);
      this.phonesMono.connect(this.merger, 0, 0); // left ear: phones mix
      this.merger.connect(this.ctx.destination);
      return;
    }
    this.masterOut.connect(this.ctx.destination);
    if (mode === 'device') {
      this.stream ??= this.ctx.createMediaStreamDestination();
      this.phones.connect(this.stream);
      this.audio ??= new Audio() as SinkAudio;
      this.audio.srcObject = this.stream.stream;
      try {
        await this.audio.setSinkId!(deviceId!);
        await this.audio.play();
      } catch (err) {
        this.disconnectOutputs();
        this.masterOut.connect(this.ctx.destination);
        this.mode = 'off';
        throw err;
      }
    }
  }

  get currentMode() {
    return this.mode;
  }

  /** Audio outputs the browser will tell us about (labels may need permission). */
  static async listOutputs(): Promise<OutputDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'communications')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Output ${i + 1}` }));
  }

  /**
   * Browsers only reveal output device names after a permission prompt.
   * Firefox has a dedicated output picker; elsewhere a momentary microphone
   * permission unlocks the list (the microphone is never recorded or used).
   */
  static async unlockOutputs(): Promise<OutputDevice | null> {
    const md = navigator.mediaDevices as MediaDevices & { selectAudioOutput?: SelectOutput };
    if (md.selectAudioOutput) {
      const d = await md.selectAudioOutput();
      return { deviceId: d.deviceId, label: d.label };
    }
    const s = await md.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return null;
  }
}
