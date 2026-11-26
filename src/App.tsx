import { useEffect, useRef, useState } from 'react';
import type { DeckId } from './audio/deck';
import { Engine } from './audio/engine';
import { DeckPanel } from './components/DeckPanel';
import { FxPanel } from './components/FxPanel';
import { LibraryPanel, RecordingsPanel } from './components/LibraryPanel';
import { Mixer } from './components/Mixer';
import { SamplerPanel } from './components/SamplerPanel';
import { ScrollingWaveform } from './components/Waveform';
import { formatTime, useFrame, useStore } from './hooks';

type Tab = 'library' | 'fx' | 'sampler' | 'mixes';

const SHORTCUTS: [string, string][] = [
  ['Q / P', 'Play / pause deck A / B'],
  ['A / L', 'Cue deck A / B'],
  ['1–4 / 7–0', 'Hot cues deck A / B'],
  ['S / K', 'Sync deck A / B'],
  ['← / →', 'Nudge crossfader'],
  ['Z … M', 'Sampler pads 1–7'],
];

function StartScreen({ onStart, error }: { onStart: () => void; error: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="start">
      <div className="start-card">
        <svg viewBox="0 0 512 512" width="84" height="84" aria-hidden="true">
          <rect width="512" height="512" rx="112" fill="#151a24" />
          <circle cx="256" cy="256" r="176" fill="#0b0d12" stroke="#38bdf8" strokeWidth="20" />
          <circle cx="256" cy="256" r="126" fill="none" stroke="#222a38" strokeWidth="6" />
          <circle cx="256" cy="256" r="58" fill="#f472b6" />
          <circle cx="256" cy="256" r="12" fill="#0b0d12" />
          <rect x="244" y="80" width="24" height="96" rx="12" fill="#38bdf8" />
        </svg>
        <h1>DeckFlow DJ</h1>
        <p className="tagline">Two decks, effects, loops, sampler, automix and recording. Everything is included, with no accounts and no in-app purchases.</p>
        <button
          className="btn primary big"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onStart();
          }}
        >
          {busy && !error ? 'Starting…' : 'Start mixing'}
        </button>
        {error && <p className="error">{error}</p>}
        <p className="muted small">Your music never leaves your device. Use headphones or speakers for the best sound.</p>
      </div>
    </div>
  );
}

function RecButton({ engine }: { engine: Engine }) {
  const s = useStore(engine.store);
  const time = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    if (time.current && engine.state.recording) {
      time.current.textContent = formatTime((Date.now() - engine.state.recordStartedAt) / 1000);
    }
  });
  if (!engine.canRecord) return null;
  return (
    <button
      className={`btn rec ${s.recording ? 'on' : ''}`}
      onClick={() => (s.recording ? engine.stopRecording() : engine.startRecording())}
      aria-pressed={s.recording}
      title="Record your mix"
    >
      <span className="rec-dot" />
      {s.recording ? <span ref={time}>0:00</span> : 'REC'}
    </button>
  );
}

function TopBar({ engine, onHelp }: { engine: Engine; onHelp: () => void }) {
  const s = useStore(engine.store);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        DeckFlow
      </div>
      <div className="top-actions">
        <button
          className={`chip ${s.automix ? 'on' : ''}`}
          onClick={() => engine.automix.setEnabled(!s.automix)}
          aria-pressed={s.automix}
          title="Automatically mix through your library"
        >
          {s.automix ? '● Automix' : 'Automix'}
        </button>
        <RecButton engine={engine} />
        <button className="icon help" onClick={onHelp} aria-label="Keyboard shortcuts and help">
          ?
        </button>
      </div>
    </header>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Help" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Quick guide</h2>
        <ul className="guide">
          <li>
            <b>Load</b> songs from the Library tab, or drag files onto a deck.
          </li>
          <li>
            <b>Scratch</b> by dragging the platter or the big waveform.
          </li>
          <li>
            <b>SYNC</b> matches tempo and beat phase to the other deck.
          </li>
          <li>
            <b>Hot cues</b>: tap to set or jump, hold to clear.
          </li>
          <li>
            <b>Roll</b> pads loop while held, then the track carries on as if you never stopped.
          </li>
          <li>
            <b>Double-tap</b> any knob or fader to reset it.
          </li>
          <li>
            <b>FX pad</b>: hold and drag; X is the effect parameter, Y is the mix.
          </li>
        </ul>
        <h3>Keyboard</h3>
        <table className="keys">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

function useKeyboard(engine: Engine | null) {
  useEffect(() => {
    if (!engine) return;
    const { A, B } = engine.decks;
    const hot: Record<string, [typeof A, number]> = {
      '1': [A, 0],
      '2': [A, 1],
      '3': [A, 2],
      '4': [A, 3],
      '7': [B, 0],
      '8': [B, 1],
      '9': [B, 2],
      '0': [B, 3],
    };
    const pads = 'zxcvbnm';
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.repeat && k !== 'arrowleft' && k !== 'arrowright') return;
      if (el.closest('[role="slider"]') && k.startsWith('arrow')) return;
      if (k === 'q') A.togglePlay();
      else if (k === 'p') B.togglePlay();
      else if (k === 'a') A.cueDown();
      else if (k === 'l') B.cueDown();
      else if (k === 's') engine.toggleSync(A);
      else if (k === 'k') engine.toggleSync(B);
      else if (hot[k]) hot[k][0].hotCue(hot[k][1]);
      else if (k === 'arrowleft') engine.setCrossfader(engine.state.crossfader - 0.05);
      else if (k === 'arrowright') engine.setCrossfader(engine.state.crossfader + 0.05);
      else if (pads.includes(k)) engine.sampler.trigger(pads.indexOf(k));
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a') A.cueUp();
      else if (k === 'l') B.cueUp();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [engine]);
}

/** Keep the screen awake while a deck is playing (mobile). */
function useWakeLock(engine: Engine | null) {
  useEffect(() => {
    if (!engine || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const update = async () => {
      const playing = engine.decks.A.state.playing || engine.decks.B.state.playing;
      try {
        if (playing && !lock && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen');
          lock.addEventListener('release', () => (lock = null));
        } else if (!playing && lock) {
          await lock.release();
          lock = null;
        }
      } catch {
        /* not allowed right now */
      }
    };
    const unsubs = [engine.decks.A.store.subscribe(update), engine.decks.B.store.subscribe(update)];
    document.addEventListener('visibilitychange', update);
    return () => {
      unsubs.forEach((u) => u());
      document.removeEventListener('visibilitychange', update);
      void lock?.release();
    };
  }, [engine]);
}

function Workspace({ engine }: { engine: Engine }) {
  const [tab, setTab] = useState<Tab>('library');
  const [zoom, setZoom] = useState(8);
  const [help, setHelp] = useState(false);
  const [dropTarget, setDropTarget] = useState<DeckId | 'library' | null>(null);
  const decks = [engine.decks.A, engine.decks.B];

  const onDrop = (e: React.DragEvent, target: DeckId | 'library') => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const added = engine.library.addFiles(Array.from(e.dataTransfer.files));
    if (target !== 'library' && added[0]) void engine.loadTrack(target, added[0].id);
  };
  const dragProps = (target: DeckId | 'library') => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(target);
    },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: React.DragEvent) => onDrop(e, target),
  });

  return (
    <div className="app" {...dragProps('library')}>
      <TopBar engine={engine} onHelp={() => setHelp(true)} />

      <div className="waves">
        {decks.map((d) => (
          <div key={d.id} className={`wave-row wave-${d.id.toLowerCase()}`}>
            <span className="wave-tag">{d.id}</span>
            <ScrollingWaveform deck={d} zoom={zoom} />
          </div>
        ))}
        <div className="zoom" role="group" aria-label="Waveform zoom">
          <button className="icon" onClick={() => setZoom((z) => Math.min(32, z * 2))} aria-label="Zoom out">
            −
          </button>
          <button className="icon" onClick={() => setZoom((z) => Math.max(2, z / 2))} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>

      <main className="main">
        {decks.map((d) => (
          <div key={d.id} className={`deck-wrap wrap-${d.id.toLowerCase()} ${dropTarget === d.id ? 'drop' : ''}`} {...dragProps(d.id)}>
            <DeckPanel deck={d} engine={engine} />
          </div>
        ))}
        <Mixer engine={engine} />
      </main>

      <section className="bottom">
        <nav className="tabs" role="tablist" aria-label="Panels">
          {(
            [
              ['library', 'Library'],
              ['fx', 'Effects'],
              ['sampler', 'Sampler'],
              ['mixes', 'Recordings'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="tab-body">
          {tab === 'library' && <LibraryPanel engine={engine} />}
          {tab === 'fx' && <FxPanel decks={decks} />}
          {tab === 'sampler' && <SamplerPanel sampler={engine.sampler} />}
          {tab === 'mixes' && <RecordingsPanel engine={engine} />}
        </div>
      </section>

      {dropTarget === 'library' && <div className="drop-hint">Drop audio files to add them to the library</div>}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  );
}

export default function App() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  useKeyboard(engine);
  useWakeLock(engine);

  const start = async () => {
    try {
      if (!('AudioWorkletNode' in window)) throw new Error('unsupported');
      const e = await Engine.create();
      if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = e;
      e.library.addDemos();
      setEngine(e);
      const [first, second] = e.library.tracks;
      if (first) void e.loadTrack('A', first.id);
      if (second) void e.loadTrack('B', second.id);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && err.message === 'unsupported'
          ? 'This browser does not support the audio features DeckFlow needs. Try a recent Chrome, Edge, Firefox or Safari.'
          : 'Could not start audio. Check that sound is allowed for this site and try again.',
      );
    }
  };

  if (!engine) return <StartScreen onStart={start} error={error} />;
  return <Workspace engine={engine} />;
}
