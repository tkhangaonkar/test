import type { Analysis, WaveformData } from './analysis';
import { DEMOS, renderDemo, type DemoSpec } from './demoTracks';
import { Store } from './store';

export type TrackSource = { kind: 'file'; file: File } | { kind: 'demo'; spec: DemoSpec };

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  source: TrackSource;
  duration?: number;
  bpm?: number | null;
  firstBeat?: number;
  waveform?: WaveformData;
  status: 'new' | 'loading' | 'ready' | 'error';
  error?: string;
}

export interface DecodedTrack {
  channels: Float32Array[];
  sampleRate: number;
  duration: number;
  analysis: Analysis;
}

let nextId = 1;

/** "Artist - Title.mp3" → { artist, title }. */
export function parseFileName(name: string): { artist: string; title: string } {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: 'Unknown artist', title: base || name };
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|wave|ogg|oga|opus|flac|webm|aif|aiff|caf)$/i;

export class Library {
  readonly store = new Store<{ tracks: LibraryTrack[] }>({ tracks: [] });
  private worker: Worker | null = null;
  private pending = new Map<number, (r: { channels: Float32Array[]; analysis: Analysis }) => void>();
  private jobId = 0;

  constructor(private ctx: AudioContext) {}

  get tracks() {
    return this.store.get().tracks;
  }

  find(id: string) {
    return this.tracks.find((t) => t.id === id);
  }

  update(id: string, patch: Partial<LibraryTrack>) {
    this.store.set({ tracks: this.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }

  addFiles(files: Iterable<File>): LibraryTrack[] {
    const added: LibraryTrack[] = [];
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) continue;
      const { artist, title } = parseFileName(file.name);
      added.push({ id: `t${nextId++}`, title, artist, source: { kind: 'file', file }, status: 'new' });
    }
    if (added.length) this.store.set({ tracks: [...this.tracks, ...added] });
    return added;
  }

  addDemos(): LibraryTrack[] {
    const existing = new Set(this.tracks.map((t) => t.id));
    const added: LibraryTrack[] = DEMOS.filter((d) => !existing.has(d.id)).map((spec) => ({
      id: spec.id,
      title: spec.title,
      artist: spec.artist,
      source: { kind: 'demo', spec },
      status: 'new',
    }));
    if (added.length) this.store.set({ tracks: [...this.tracks, ...added] });
    return added;
  }

  remove(id: string) {
    this.store.set({ tracks: this.tracks.filter((t) => t.id !== id) });
  }

  move(id: string, delta: number) {
    const list = this.tracks.slice();
    const i = list.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.store.set({ tracks: list });
  }

  /** Decode a track to PCM and analyse it (cached analysis is reused). */
  async decode(id: string): Promise<DecodedTrack> {
    const track = this.find(id);
    if (!track) throw new Error('Track not found');
    this.update(id, { status: 'loading', error: undefined });
    try {
      let buffer: AudioBuffer;
      if (track.source.kind === 'demo') {
        buffer = await renderDemo(track.source.spec, this.ctx.sampleRate);
      } else {
        const bytes = await track.source.file.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(bytes);
      }
      // Own copies of the PCM so they can be transferred to the worker / worklet.
      let channels: Float32Array[] = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) =>
        buffer.getChannelData(c).slice(),
      );
      let analysis: Analysis;
      const cached = this.find(id);
      if (cached?.waveform && cached.bpm !== undefined) {
        analysis = { bpm: cached.bpm, firstBeat: cached.firstBeat ?? 0, waveform: cached.waveform };
      } else {
        const r = await this.analyse(channels, buffer.sampleRate);
        channels = r.channels;
        analysis = r.analysis;
        // Demo tracks have a known tempo; trust it over detection.
        if (track.source.kind === 'demo') analysis.bpm = track.source.spec.bpm;
      }
      this.update(id, {
        status: 'ready',
        duration: buffer.duration,
        bpm: analysis.bpm,
        firstBeat: analysis.firstBeat,
        waveform: analysis.waveform,
      });
      return { channels, sampleRate: buffer.sampleRate, duration: buffer.duration, analysis };
    } catch (err) {
      const message =
        err instanceof DOMException || err instanceof Error
          ? `Could not decode “${track.title}”. The format may not be supported on this device.`
          : String(err);
      this.update(id, { status: 'error', error: message });
      throw new Error(message);
    }
  }

  private analyse(channels: Float32Array[], sampleRate: number) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const resolve = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        resolve?.(e.data);
      };
    }
    const id = ++this.jobId;
    return new Promise<{ channels: Float32Array[]; analysis: Analysis }>((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ id, channels, sampleRate }, channels.map((c) => c.buffer));
    });
  }
}
