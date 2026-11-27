import { beatLength, beatPhase, snapToBeat, type WaveformData } from './analysis';
import { DECK_PROCESSOR_NAME, MOTOR_TAU } from './deckProcessor';
import { FxUnit, type FxType } from './fx';
import { Store } from './store';

export type DeckId = 'A' | 'B';
export type EqBand = 'high' | 'mid' | 'low';

export interface LoadedTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  bpm: number | null;
  firstBeat: number;
  waveform: WaveformData;
}

export interface LoopState {
  start: number;
  end: number;
  beats: number;
}

export interface DeckState {
  track: LoadedTrack | null;
  loading: boolean;
  error: string | null;
  playing: boolean;
  ended: boolean;
  /** Fractional tempo change: 0.03 = +3 %. */
  tempo: number;
  tempoRange: number;
  /** Key lock: tempo changes keep the original pitch. */
  keylock: boolean;
  sync: boolean;
  cue: number;
  hotCues: (number | null)[];
  loop: LoopState | null;
  rolling: boolean;
  /** Knob positions, -1..1 with 0 = unity. */
  trim: number;
  eq: Record<EqBand, number>;
  kills: Record<EqBand, boolean>;
  filter: number;
  /** Channel fader, 0..1. */
  volume: number;
  /** Pre-fader listen: send this deck to the headphones. */
  pfl: boolean;
  fx: { type: FxType; on: boolean; wet: number; param: number };
}

export const TEMPO_RANGES = [0.08, 0.16, 0.5];
export const HOT_CUES = 4;
const BEND_AMOUNT = 0.04;
/** One platter revolution at 33⅓ RPM is 1.8 s of audio. */
export const SECONDS_PER_REV = 1.8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dbToGain = (db: number) => Math.pow(10, db / 20);

export class Deck {
  readonly store: Store<DeckState>;
  readonly analyser: AnalyserNode;
  /** Crossfader stage; the engine sets its gain. */
  readonly xfade: GainNode;
  readonly fx: FxUnit;
  /** Called when the user corrects BPM / grid so the library can remember it. */
  onGridEdit?: (trackId: string, bpm: number | null, firstBeat: number) => void;
  /** Called right after playback starts (used to phase-lock synced decks). */
  onPlay?: () => void;

  private node: AudioWorkletNode;
  private trim: GainNode;
  private eqNodes: Record<EqBand, BiquadFilterNode>;
  private lp: BiquadFilterNode;
  private hp: BiquadFilterNode;
  private fader: GainNode;
  private cueTap: GainNode;

  private srcRate = 44100;
  private frame = 0;
  private reportTime = 0;
  private rate = 0;
  private loadToken = 0;
  private cuePreview = false;
  private roll: { pos: number; time: number } | null = null;
  private taps: number[] = [];

  constructor(
    private ctx: AudioContext,
    readonly id: DeckId,
    destination: AudioNode,
    cueDestination?: AudioNode,
  ) {
    this.store = new Store<DeckState>({
      track: null,
      loading: false,
      error: null,
      playing: false,
      ended: false,
      tempo: 0,
      tempoRange: 0.08,
      keylock: false,
      sync: false,
      cue: 0,
      hotCues: Array(HOT_CUES).fill(null),
      loop: null,
      rolling: false,
      trim: 0,
      eq: { high: 0, mid: 0, low: 0 },
      kills: { high: false, mid: false, low: false },
      filter: 0,
      volume: 1,
      pfl: false,
      fx: { type: 'echo', on: false, wet: 0.5, param: 0.5 },
    });

    this.node = new AudioWorkletNode(ctx, DECK_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (e) => this.onWorkletMessage(e.data);

    this.trim = ctx.createGain();
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 220;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 0.7;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 3800;
    this.eqNodes = { low, mid, high };
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = ctx.sampleRate / 2;
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 10;
    this.fx = new FxUnit(ctx);
    this.fader = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.xfade = ctx.createGain();

    this.node.connect(this.trim);
    this.trim.connect(low).connect(mid).connect(high).connect(this.lp).connect(this.hp).connect(this.fx.input);
    this.fx.output.connect(this.fader);
    // Headphone cue taps the signal before the channel fader.
    this.cueTap = ctx.createGain();
    this.cueTap.gain.value = 0;
    this.fx.output.connect(this.cueTap);
    if (cueDestination) this.cueTap.connect(cueDestination);
    this.fader.connect(this.analyser);
    this.fader.connect(this.xfade);
    this.xfade.connect(destination);
  }

  get state() {
    return this.store.get();
  }

  // ---------------------------------------------------------------- position

  private onWorkletMessage(m: { type: string; frame: number; rate: number; playing: boolean; time: number; ended: boolean }) {
    if (m.type !== 'pos') return;
    this.frame = m.frame;
    this.reportTime = m.time;
    this.rate = m.rate;
    if (m.ended) this.store.set({ playing: false, ended: true });
  }

  /** Current playhead in seconds, extrapolated between worklet reports. */
  position(): number {
    const track = this.state.track;
    if (!track) return 0;
    let t = this.frame / this.srcRate + Math.max(0, this.ctx.currentTime - this.reportTime) * this.rate;
    const loop = this.state.loop;
    if (loop && this.rate > 0 && t >= loop.end) t = loop.start + ((t - loop.start) % (loop.end - loop.start));
    return clamp(t, 0, track.duration);
  }

  /** Playback speed including tempo fader and pitch bend (1 = original). */
  speed(): number {
    return this.rate;
  }

  effectiveBpm(): number | null {
    const bpm = this.state.track?.bpm;
    return bpm ? bpm * (1 + this.state.tempo) : null;
  }

  private post(msg: Record<string, unknown>, transfer: Transferable[] = []) {
    this.node.port.postMessage(msg, transfer);
  }

  // ------------------------------------------------------------------ loading

  beginLoad() {
    this.loadToken++;
    this.post({ type: 'unload' });
    this.frame = 0;
    this.rate = 0;
    this.store.set({ loading: true, error: null, playing: false, track: null, loop: null, rolling: false });
    return this.loadToken;
  }

  finishLoad(token: number, track: LoadedTrack, channels: Float32Array[], sampleRate: number) {
    if (token !== this.loadToken) return; // a newer load superseded this one
    this.srcRate = sampleRate;
    this.frame = 0;
    this.reportTime = this.ctx.currentTime;
    this.post(
      { type: 'load', left: channels[0], right: channels[1] ?? null, length: channels[0].length, sampleRate },
      channels.map((c) => c.buffer),
    );
    this.store.set({
      track,
      loading: false,
      ended: false,
      cue: 0,
      hotCues: Array(HOT_CUES).fill(null),
      loop: null,
    });
    this.applyRate();
    this.applyFx();
  }

  failLoad(token: number, message: string) {
    if (token !== this.loadToken) return;
    this.store.set({ loading: false, error: message });
  }

  eject() {
    this.loadToken++;
    this.post({ type: 'unload' });
    this.store.set({ track: null, playing: false, loop: null, loading: false, error: null });
  }

  // ---------------------------------------------------------------- transport

  play() {
    if (!this.state.track) return;
    if (this.state.ended || this.position() >= this.state.track.duration - 0.01) this.seek(0);
    this.post({ type: 'play', value: true });
    this.store.set({ playing: true, ended: false });
    this.onPlay?.();
  }

  pause() {
    this.post({ type: 'play', value: false });
    this.store.set({ playing: false });
  }

  togglePlay() {
    if (this.state.playing) this.pause();
    else this.play();
  }

  /** `compensate`: advance by however long the message takes to reach the audio thread (beat-exact sync). */
  seek(seconds: number, compensate = false) {
    const track = this.state.track;
    if (!track) return;
    const t = clamp(seconds, 0, track.duration);
    this.frame = t * this.srcRate;
    this.reportTime = this.ctx.currentTime;
    this.post({ type: 'seek', frame: this.frame, refTime: compensate ? this.ctx.currentTime : null });
    if (this.state.ended) this.store.set({ ended: false });
  }

  /** CDJ-style cue: playing → back to cue & stop; stopped elsewhere → set cue; stopped on cue → preview while held. */
  cueDown() {
    if (!this.state.track) return;
    if (this.state.playing) {
      this.pause();
      this.seek(this.state.cue);
      return;
    }
    const pos = this.position();
    if (Math.abs(pos - this.state.cue) > 0.02) {
      this.store.set({ cue: pos });
    } else {
      this.cuePreview = true;
      this.play();
    }
  }

  cueUp() {
    if (!this.cuePreview) return;
    this.cuePreview = false;
    this.pause();
    this.seek(this.state.cue);
  }

  hotCue(i: number) {
    const cues = this.state.hotCues;
    if (!this.state.track) return;
    if (cues[i] == null) {
      const next = cues.slice();
      next[i] = this.position();
      this.store.set({ hotCues: next });
    } else {
      this.seek(cues[i]!);
      if (!this.state.playing) this.play();
    }
  }

  clearHotCue(i: number) {
    const next = this.state.hotCues.slice();
    next[i] = null;
    this.store.set({ hotCues: next });
  }

  // -------------------------------------------------------------------- tempo

  private applyRate() {
    this.post({ type: 'rate', value: 1 + this.state.tempo });
    this.applyFx();
  }

  setTempo(tempo: number, fromUser = false) {
    const range = this.state.tempoRange;
    this.store.set({ tempo: clamp(tempo, -range, range), ...(fromUser ? { sync: false } : {}) });
    this.applyRate();
  }

  setTempoRange(range: number) {
    this.store.set({ tempoRange: range, tempo: clamp(this.state.tempo, -range, range) });
    this.applyRate();
  }

  cycleTempoRange() {
    const i = TEMPO_RANGES.indexOf(this.state.tempoRange);
    this.setTempoRange(TEMPO_RANGES[(i + 1) % TEMPO_RANGES.length]);
  }

  setKeylock(on: boolean) {
    this.store.set({ keylock: on });
    this.post({ type: 'keylock', value: on });
  }

  /** Temporary nudge: -1 slows down, +1 speeds up, 0 releases. */
  bend(direction: -1 | 0 | 1) {
    this.post({ type: 'bend', value: direction * BEND_AMOUNT });
  }

  /**
   * Match tempo (and optionally beat phase) to another deck. Returns false when BPMs are unknown.
   * `starting`: this deck has just been told to play, so compensate for the spin-up ramp.
   */
  syncTo(master: Deck, alignPhase = true, starting = false): boolean {
    const masterBpm = master.effectiveBpm();
    const track = this.state.track;
    if (!masterBpm || !track?.bpm) return false;
    let target = masterBpm / track.bpm - 1;
    // If it is a long way off, the BPMs are probably an octave apart.
    if (target > 0.5) target = masterBpm / (track.bpm * 2) - 1;
    if (target < -0.4) target = (masterBpm * 2) / track.bpm - 1;
    let range = this.state.tempoRange;
    if (Math.abs(target) > range) range = TEMPO_RANGES.find((r) => Math.abs(target) <= r) ?? 0.5;
    this.store.set({ tempoRange: range, tempo: clamp(target, -range, range) });
    this.applyRate();

    const mTrack = master.state.track;
    if (alignPhase && mTrack?.bpm) {
      const mPhase = beatPhase(master.position(), mTrack.bpm, mTrack.firstBeat);
      const pos = this.position();
      const phase = beatPhase(pos, track.bpm, track.firstBeat);
      let d = mPhase - phase;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      // An exponential spin-up from rest lags the playhead by tau × speed, so start that far ahead.
      const lead = starting ? MOTOR_TAU * (1 + this.state.tempo) : 0;
      this.seek(pos + d * beatLength(track.bpm) + lead, true);
    }
    return true;
  }

  setSyncFlag(on: boolean) {
    this.store.set({ sync: on });
  }

  // ------------------------------------------------------------------ scratch

  scratchStart() {
    this.post({ type: 'scratchStart' });
  }

  /** Move the record by `seconds` of audio (negative = backwards). */
  scratchMove(seconds: number) {
    this.post({ type: 'scratchMove', delta: seconds * this.srcRate });
  }

  scratchEnd() {
    this.post({ type: 'scratchEnd' });
  }

  // -------------------------------------------------------------------- loops

  private beatLen(): number {
    return beatLength(this.state.track?.bpm ?? 120);
  }

  private sendLoop(loop: LoopState | null) {
    this.post(
      loop
        ? { type: 'loop', start: loop.start * this.srcRate, end: loop.end * this.srcRate }
        : { type: 'loop', start: null },
    );
    this.store.set({ loop });
  }

  toggleLoop(beats: number) {
    const track = this.state.track;
    if (!track) return;
    const cur = this.state.loop;
    if (cur && cur.beats === beats && !this.state.rolling) {
      this.sendLoop(null);
      return;
    }
    const start = cur ? cur.start : snapToBeat(this.position(), track.bpm, track.firstBeat);
    this.sendLoop({ start, end: Math.min(track.duration, start + beats * this.beatLen()), beats });
  }

  exitLoop() {
    this.sendLoop(null);
  }

  resizeLoop(factor: number) {
    const cur = this.state.loop;
    if (!cur) return;
    const beats = clamp(cur.beats * factor, 1 / 32, 64);
    this.sendLoop({ ...cur, beats, end: cur.start + beats * this.beatLen() });
  }

  /** Loop roll: loops while held, then jumps to where the track would have been. */
  rollStart(beats: number) {
    const track = this.state.track;
    if (!track || !this.state.playing) return;
    this.roll = { pos: this.position(), time: this.ctx.currentTime };
    const len = beats * this.beatLen();
    const start = snapToBeat(this.roll.pos, track.bpm, track.firstBeat);
    this.store.set({ rolling: true });
    this.sendLoop({ start, end: start + len, beats });
  }

  rollEnd() {
    if (!this.roll) return;
    const target = this.roll.pos + (this.ctx.currentTime - this.roll.time) * (1 + this.state.tempo);
    this.roll = null;
    this.sendLoop(null);
    this.store.set({ rolling: false });
    this.seek(target);
  }

  // --------------------------------------------------------------------- grid

  setBpm(bpm: number | null, firstBeat?: number) {
    const track = this.state.track;
    if (!track) return;
    const next = { ...track, bpm, firstBeat: firstBeat ?? track.firstBeat };
    this.store.set({ track: next });
    this.applyFx();
    this.onGridEdit?.(track.id, next.bpm, next.firstBeat);
  }

  /** Tap tempo: tap on each beat; after four taps the BPM and grid follow your taps. */
  tap() {
    const track = this.state.track;
    if (!track) return;
    const now = performance.now() / 1000;
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 4) return;
    const span = this.taps[this.taps.length - 1] - this.taps[0];
    const realBpm = (60 * (this.taps.length - 1)) / span;
    const bpm = Math.round((realBpm / (1 + this.state.tempo)) * 10) / 10;
    const beat = beatLength(bpm);
    const firstBeat = ((this.position() % beat) + beat) % beat;
    this.setBpm(bpm, firstBeat);
  }

  // -------------------------------------------------------------------- mixer

  private smooth(param: AudioParam, value: number) {
    param.setTargetAtTime(value, this.ctx.currentTime, 0.012);
  }

  setTrim(v: number) {
    this.store.set({ trim: v });
    this.smooth(this.trim.gain, dbToGain(v * 12));
  }

  private applyEq(band: EqBand) {
    const v = this.state.eq[band];
    const db = this.state.kills[band] ? -40 : v < 0 ? v * 26 : v * 6;
    this.smooth(this.eqNodes[band].gain, db);
  }

  setEq(band: EqBand, v: number) {
    this.store.set({ eq: { ...this.state.eq, [band]: v } });
    this.applyEq(band);
  }

  toggleKill(band: EqBand) {
    this.store.set({ kills: { ...this.state.kills, [band]: !this.state.kills[band] } });
    this.applyEq(band);
  }

  /** One-knob filter: left = low-pass, right = high-pass, centre = off. */
  setFilter(v: number) {
    this.store.set({ filter: v });
    const nyquist = this.ctx.sampleRate / 2;
    const q = Math.abs(v) > 0.03 ? Math.abs(v) * 7 : 0;
    if (v < -0.03) {
      this.smooth(this.lp.frequency, Math.min(nyquist, 20000 * Math.pow(70 / 20000, -v)));
      this.smooth(this.hp.frequency, 10);
    } else if (v > 0.03) {
      this.smooth(this.hp.frequency, 20 * Math.pow(9000 / 20, v));
      this.smooth(this.lp.frequency, nyquist);
    } else {
      this.smooth(this.lp.frequency, nyquist);
      this.smooth(this.hp.frequency, 10);
    }
    this.smooth(this.lp.Q, q);
    this.smooth(this.hp.Q, q);
  }

  setPfl(on: boolean) {
    this.store.set({ pfl: on });
    this.smooth(this.cueTap.gain, on ? 1 : 0);
  }

  setVolume(v: number) {
    this.store.set({ volume: v });
    this.smooth(this.fader.gain, v * v);
  }

  setFx(patch: Partial<DeckState['fx']>) {
    const fx = { ...this.state.fx, ...patch };
    this.store.set({ fx });
    if (patch.type) this.fx.setType(patch.type);
    this.applyFx();
  }

  private applyFx() {
    const fx = this.state.fx;
    this.fx.set({ on: fx.on, wet: fx.wet, param: fx.param, bpm: this.effectiveBpm() ?? 120 });
  }
}
