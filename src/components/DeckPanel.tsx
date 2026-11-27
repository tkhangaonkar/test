import { useRef, useState } from 'react';
import type { Deck } from '../audio/deck';
import type { Engine } from '../audio/engine';
import { formatTime, useFrame, useLongPress, useStore } from '../hooks';
import { Fader } from './Fader';
import { Platter } from './Platter';
import { OverviewWaveform } from './Waveform';

type PadMode = 'cues' | 'loop' | 'roll' | 'grid';

const LOOP_SIZES: [number, string][] = [
  [0.5, '½'],
  [1, '1'],
  [2, '2'],
  [4, '4'],
  [8, '8'],
  [16, '16'],
];
const ROLL_SIZES: [number, string][] = [
  [1 / 8, '1/32'],
  [1 / 4, '1/16'],
  [1 / 2, '1/8'],
  [1, '1/4'],
];

function Clock({ deck }: { deck: Deck }) {
  const el = useRef<HTMLSpanElement>(null);
  const rem = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const d = deck.state.track?.duration ?? 0;
    const p = deck.position();
    if (el.current) el.current.textContent = formatTime(p);
    if (rem.current) rem.current.textContent = `-${formatTime(d - p)}`;
  });
  return (
    <div className="clock">
      <span ref={el}>0:00</span>
      <span ref={rem} className="remain">
        -0:00
      </span>
    </div>
  );
}

function HotCuePad({ deck, i, value }: { deck: Deck; i: number; value: number | null }) {
  const press = useLongPress(
    () => deck.hotCue(i),
    () => deck.clearHotCue(i),
  );
  return (
    <button
      className={`pad hot ${value != null ? 'set' : ''}`}
      {...press}
      title={value != null ? 'Tap to jump · hold to clear' : 'Tap to set a hot cue here'}
    >
      <span className="pad-num">{i + 1}</span>
      <span className="pad-sub">{value != null ? formatTime(value) : 'set'}</span>
    </button>
  );
}

export function DeckPanel({ deck, engine }: { deck: Deck; engine: Engine }) {
  const s = useStore(deck.store);
  const [mode, setMode] = useState<PadMode>('cues');
  const [syncFail, setSyncFail] = useState(false);
  const track = s.track;
  const effBpm = deck.effectiveBpm();
  const range = Math.round(s.tempoRange * 100);
  const side = deck.id === 'A' ? 'left' : 'right';
  const keyButton = (
    <button
      className={`chip small key ${s.keylock ? 'on' : ''}`}
      onClick={() => deck.setKeylock(!s.keylock)}
      aria-pressed={s.keylock}
      title="Key lock: change tempo without changing pitch"
    >
      KEY
    </button>
  );

  const onSync = () => {
    const ok = engine.toggleSync(deck);
    if (!ok) {
      setSyncFail(true);
      window.setTimeout(() => setSyncFail(false), 1400);
    }
  };

  return (
    <section className={`deck deck-${deck.id.toLowerCase()} ${side}`} aria-label={`Deck ${deck.id}`}>
      <header className="deck-head">
        <div className="deck-badge">{deck.id}</div>
        <div className="deck-title">
          <div className="title">{track?.title ?? (s.loading ? 'Loading…' : 'No track loaded')}</div>
          <div className="artist">{s.error ?? track?.artist ?? 'Pick a song from the library below'}</div>
        </div>
        <div className="deck-bpm">
          <div className="bpm">{effBpm ? effBpm.toFixed(1) : '--.-'}</div>
          <div className="bpm-sub">
            {s.tempo >= 0 ? '+' : ''}
            {(s.tempo * 100).toFixed(1)}%
          </div>
        </div>
      </header>

      <OverviewWaveform deck={deck} />
      <Clock deck={deck} />

      <div className="deck-body">
        <Platter deck={deck} />
        <div className="tempo-col">
          <button className="chip small" onClick={() => deck.cycleTempoRange()} title="Tempo fader range">
            ±{range}%
          </button>
          {keyButton}
          <Fader
            label={`Deck ${deck.id} tempo`}
            value={s.tempo}
            min={-s.tempoRange}
            max={s.tempoRange}
            defaultValue={0}
            invert
            marks={[0]}
            color={`var(--deck-${deck.id.toLowerCase()})`}
            onChange={(v) => deck.setTempo(Math.abs(v) < s.tempoRange * 0.012 ? 0 : v, true)}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            className="tempo-fader"
          />
          <div className="bend">
            <button
              className="chip small"
              aria-label="Pitch bend down"
              onPointerDown={() => deck.bend(-1)}
              onPointerUp={() => deck.bend(0)}
              onPointerLeave={() => deck.bend(0)}
            >
              −
            </button>
            <button
              className="chip small"
              aria-label="Pitch bend up"
              onPointerDown={() => deck.bend(1)}
              onPointerUp={() => deck.bend(0)}
              onPointerLeave={() => deck.bend(0)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="tempo-h">
        <span className="muted small">Tempo</span>
        {keyButton}
        <Fader
          orientation="horizontal"
          label={`Deck ${deck.id} tempo`}
          value={s.tempo}
          min={-s.tempoRange}
          max={s.tempoRange}
          defaultValue={0}
          marks={[0]}
          color={`var(--deck-${deck.id.toLowerCase()})`}
          onChange={(v) => deck.setTempo(Math.abs(v) < s.tempoRange * 0.012 ? 0 : v, true)}
          format={(v) => `${(v * 100).toFixed(1)}%`}
        />
      </div>

      <div className="transport">
        <button
          className="btn cue"
          disabled={!track}
          onPointerDown={() => deck.cueDown()}
          onPointerUp={() => deck.cueUp()}
          onPointerLeave={() => deck.cueUp()}
        >
          CUE
        </button>
        <button
          className={`btn play ${s.playing ? 'on' : ''}`}
          disabled={!track}
          onClick={() => deck.togglePlay()}
          aria-label={s.playing ? 'Pause' : 'Play'}
        >
          {s.playing ? (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
              <rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button
          className={`btn sync ${s.sync ? 'on' : ''} ${syncFail ? 'fail' : ''}`}
          disabled={!track}
          onClick={onSync}
          title="Match tempo and beat phase to the other deck"
        >
          {syncFail ? 'NO BPM' : 'SYNC'}
        </button>
      </div>

      <div className="pad-modes" role="tablist" aria-label="Pad mode">
        {(
          [
            ['cues', 'Cues'],
            ['loop', 'Loop'],
            ['roll', 'Roll'],
            ['grid', 'BPM'],
          ] as [PadMode, string][]
        ).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`tab ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>

      <div className={`pads mode-${mode}`}>
        {mode === 'cues' && s.hotCues.map((c, i) => <HotCuePad key={i} deck={deck} i={i} value={c} />)}

        {mode === 'loop' && (
          <>
            {LOOP_SIZES.map(([beats, label]) => (
              <button
                key={beats}
                className={`pad loop ${s.loop && !s.rolling && s.loop.beats === beats ? 'active' : ''}`}
                disabled={!track}
                onClick={() => deck.toggleLoop(beats)}
              >
                <span className="pad-num">{label}</span>
                <span className="pad-sub">{beats === 1 ? 'beat' : 'beats'}</span>
              </button>
            ))}
            <button className="pad loop" disabled={!s.loop} onClick={() => deck.resizeLoop(0.5)}>
              <span className="pad-num">÷2</span>
            </button>
            <button className="pad loop" disabled={!s.loop} onClick={() => deck.resizeLoop(2)}>
              <span className="pad-num">×2</span>
            </button>
          </>
        )}

        {mode === 'roll' &&
          ROLL_SIZES.map(([beats, label]) => (
            <button
              key={beats}
              className={`pad roll ${s.rolling && s.loop?.beats === beats ? 'active' : ''}`}
              disabled={!track || !s.playing}
              onPointerDown={() => deck.rollStart(beats)}
              onPointerUp={() => deck.rollEnd()}
              onPointerLeave={() => deck.rollEnd()}
              onPointerCancel={() => deck.rollEnd()}
            >
              <span className="pad-num">{label}</span>
              <span className="pad-sub">hold</span>
            </button>
          ))}

        {mode === 'grid' && (
          <>
            <button className="pad grid" disabled={!track} onClick={() => deck.tap()} title="Tap on the beat four or more times">
              <span className="pad-num">TAP</span>
              <span className="pad-sub">{track?.bpm ? `${track.bpm} BPM` : 'tempo'}</span>
            </button>
            <button className="pad grid" disabled={!track?.bpm} onClick={() => track?.bpm && deck.setBpm(track.bpm * 2)}>
              <span className="pad-num">×2</span>
              <span className="pad-sub">BPM</span>
            </button>
            <button
              className="pad grid"
              disabled={!track?.bpm}
              onClick={() => track?.bpm && deck.setBpm(Math.round((track.bpm / 2) * 100) / 100)}
            >
              <span className="pad-num">÷2</span>
              <span className="pad-sub">BPM</span>
            </button>
            <button
              className="pad grid"
              disabled={!track?.bpm}
              onClick={() => track && deck.setBpm(track.bpm, Math.max(0, track.firstBeat - 0.01))}
              title="Shift beat grid earlier by 10 ms"
            >
              <span className="pad-num">◀</span>
              <span className="pad-sub">grid</span>
            </button>
            <button
              className="pad grid"
              disabled={!track?.bpm}
              onClick={() => track && deck.setBpm(track.bpm, track.firstBeat + 0.01)}
              title="Shift beat grid later by 10 ms"
            >
              <span className="pad-num">▶</span>
              <span className="pad-sub">grid</span>
            </button>
            <button className="pad grid" disabled={!track} onClick={() => deck.eject()} title="Unload this deck">
              <span className="pad-num">⏏</span>
              <span className="pad-sub">eject</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
