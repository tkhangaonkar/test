import { AutoMix } from './automix';
import { crossfaderGains, type CrossfaderCurve } from './crossfader';
import { Deck, type DeckId } from './deck';
import { deckProcessorSource } from './deckProcessor';
import { Library } from './library';
import { Sampler } from './sampler';
import { Store } from './store';

export interface Recording {
  id: number;
  url: string;
  name: string;
  size: number;
  seconds: number;
}

export interface EngineState {
  crossfader: number;
  curve: CrossfaderCurve;
  masterVolume: number;
  recording: boolean;
  recordStartedAt: number;
  recordings: Recording[];
  automix: boolean;
  automixFade: number;
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const options = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  return options.find((m) => MediaRecorder.isTypeSupported(m));
}

export class Engine {
  readonly decks: Record<DeckId, Deck>;
  readonly library: Library;
  readonly sampler: Sampler;
  readonly masterAnalyser: AnalyserNode;
  readonly store: Store<EngineState>;
  readonly automix: AutoMix;
  readonly canRecord: boolean;

  private master: GainNode;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recId = 0;

  static async create(): Promise<Engine> {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const url = URL.createObjectURL(new Blob([deckProcessorSource], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (ctx.state !== 'running') await ctx.resume();
    return new Engine(ctx);
  }

  private constructor(readonly ctx: AudioContext) {
    this.master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 1024;
    this.master.connect(limiter);
    limiter.connect(this.masterAnalyser);
    limiter.connect(ctx.destination);

    this.canRecord = !!pickMime() && typeof ctx.createMediaStreamDestination === 'function';
    if (this.canRecord) {
      this.recDest = ctx.createMediaStreamDestination();
      limiter.connect(this.recDest);
    }

    this.decks = {
      A: new Deck(ctx, 'A', this.master),
      B: new Deck(ctx, 'B', this.master),
    };
    this.sampler = new Sampler(ctx);
    this.sampler.output.connect(this.master);
    this.library = new Library(ctx);

    this.store = new Store<EngineState>({
      crossfader: 0.5,
      curve: 'smooth',
      masterVolume: 0.9,
      recording: false,
      recordStartedAt: 0,
      recordings: [],
      automix: false,
      automixFade: 10,
    });
    this.applyCrossfader();
    this.setMasterVolume(0.9);

    for (const deck of Object.values(this.decks)) {
      deck.onGridEdit = (id, bpm, firstBeat) => this.library.update(id, { bpm, firstBeat });
      // A synced deck lands on the beat when it starts, wherever it was paused.
      deck.onPlay = () => {
        const master = this.other(deck);
        if (deck.state.sync && master.state.playing) deck.syncTo(master, true, true);
      };
      this.followSync(deck);
    }
    this.automix = new AutoMix(this);

    // Mobile browsers suspend audio when the page is hidden; resume on return.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.ctx.state !== 'running') void this.ctx.resume();
    });
  }

  get state() {
    return this.store.get();
  }

  other(deck: Deck): Deck {
    return deck.id === 'A' ? this.decks.B : this.decks.A;
  }

  /** When a deck has SYNC on, it follows tempo changes of the other deck. */
  private followSync(master: Deck) {
    let lastBpm = master.effectiveBpm();
    master.store.subscribe(() => {
      const bpm = master.effectiveBpm();
      if (bpm === lastBpm) return;
      lastBpm = bpm;
      const follower = this.other(master);
      if (follower.state.sync && !master.state.sync) follower.syncTo(master, false);
    });
  }

  toggleSync(deck: Deck) {
    if (deck.state.sync) {
      deck.setSyncFlag(false);
      return true;
    }
    const master = this.other(deck);
    if (!deck.syncTo(master, true)) return false;
    master.setSyncFlag(false);
    deck.setSyncFlag(true);
    return true;
  }

  async loadTrack(deckId: DeckId, trackId: string) {
    const deck = this.decks[deckId];
    const token = deck.beginLoad();
    try {
      const d = await this.library.decode(trackId);
      const t = this.library.find(trackId)!;
      deck.finishLoad(
        token,
        {
          id: t.id,
          title: t.title,
          artist: t.artist,
          duration: d.duration,
          bpm: d.analysis.bpm,
          firstBeat: d.analysis.firstBeat,
          waveform: d.analysis.waveform,
        },
        d.channels,
        d.sampleRate,
      );
      if (deck.state.sync) deck.syncTo(this.other(deck), false);
    } catch (err) {
      deck.failLoad(token, err instanceof Error ? err.message : String(err));
    }
  }

  // ------------------------------------------------------------------- mixer

  private applyCrossfader() {
    const [a, b] = crossfaderGains(this.state.crossfader, this.state.curve);
    const t = this.ctx.currentTime;
    this.decks.A.xfade.gain.setTargetAtTime(a, t, 0.006);
    this.decks.B.xfade.gain.setTargetAtTime(b, t, 0.006);
  }

  setCrossfader(x: number, fromAutomix = false) {
    if (!fromAutomix) this.automix?.cancelFade();
    this.store.set({ crossfader: Math.min(1, Math.max(0, x)) });
    this.applyCrossfader();
  }

  setCurve(curve: CrossfaderCurve) {
    this.store.set({ curve });
    this.applyCrossfader();
  }

  setMasterVolume(v: number) {
    this.store.set({ masterVolume: v });
    this.master.gain.setTargetAtTime(v * v * 1.1, this.ctx.currentTime, 0.02);
  }

  // --------------------------------------------------------------- recording

  startRecording() {
    if (!this.recDest || this.recorder) return;
    const mimeType = pickMime();
    this.chunks = [];
    const rec = new MediaRecorder(this.recDest.stream, mimeType ? { mimeType, audioBitsPerSecond: 256000 } : undefined);
    rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    const startedAt = Date.now();
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(this.chunks, { type });
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const d = new Date(startedAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `deckflow-mix-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
      const recording: Recording = {
        id: ++this.recId,
        url: URL.createObjectURL(blob),
        name,
        size: blob.size,
        seconds: Math.round((Date.now() - startedAt) / 1000),
      };
      this.store.set((s) => ({ recordings: [recording, ...s.recordings], recording: false }));
      this.recorder = null;
    };
    rec.start(1000);
    this.recorder = rec;
    this.store.set({ recording: true, recordStartedAt: startedAt });
  }

  stopRecording() {
    this.recorder?.stop();
  }

  deleteRecording(id: number) {
    const r = this.state.recordings.find((x) => x.id === id);
    if (r) URL.revokeObjectURL(r.url);
    this.store.set((s) => ({ recordings: s.recordings.filter((x) => x.id !== id) }));
  }
}
