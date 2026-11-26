import { useRef, useState } from 'react';
import type { DeckId } from '../audio/deck';
import type { Engine } from '../audio/engine';
import { formatTime, useStore } from '../hooks';

export function LibraryPanel({ engine }: { engine: Engine }) {
  const { tracks } = useStore(engine.library.store);
  const es = useStore(engine.store);
  const a = useStore(engine.decks.A.store);
  const b = useStore(engine.decks.B.store);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? tracks.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q)) : tracks;

  const load = (deck: DeckId, id: string) => void engine.loadTrack(deck, id);

  return (
    <div className="library">
      <div className="lib-bar">
        <button className="btn primary" onClick={() => input.current?.click()}>
          + Add music
        </button>
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) engine.library.addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          className="search"
          type="search"
          placeholder="Search library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search library"
        />
        <div className="automix">
          <button
            className={`chip ${es.automix ? 'on' : ''}`}
            onClick={() => engine.automix.setEnabled(!es.automix)}
            aria-pressed={es.automix}
            disabled={!tracks.length}
            title="Mix through the library automatically, in order"
          >
            {es.automix ? '● Automix on' : 'Automix'}
          </button>
          <label className="fade-len">
            Fade
            <select value={es.automixFade} onChange={(e) => engine.automix.setFadeLength(Number(e.target.value))}>
              {[4, 8, 10, 16, 24, 32].map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="empty-lib">
          <p>Your library is empty. Add songs from your device — MP3, AAC/M4A, WAV, OGG, FLAC (depending on your browser).</p>
          <button className="chip" onClick={() => engine.library.addDemos()}>
            Add demo tracks
          </button>
        </div>
      ) : (
        <ol className="tracks">
          {shown.map((t) => {
            const onA = a.track?.id === t.id;
            const onB = b.track?.id === t.id;
            return (
              <li key={t.id} className={`track ${onA ? 'on-a' : ''} ${onB ? 'on-b' : ''}`}>
                <div className="t-main">
                  <div className="t-title">{t.title}</div>
                  <div className="t-artist">
                    {t.status === 'error' ? <span className="error">{t.error}</span> : t.artist}
                  </div>
                </div>
                <div className="t-meta">
                  <span>{t.bpm ? `${t.bpm} BPM` : t.status === 'loading' ? 'analysing…' : '— BPM'}</span>
                  <span>{t.duration ? formatTime(t.duration) : ''}</span>
                </div>
                <div className="t-actions">
                  <button className="load a" onClick={() => load('A', t.id)} aria-label={`Load ${t.title} on deck A`}>
                    A
                  </button>
                  <button className="load b" onClick={() => load('B', t.id)} aria-label={`Load ${t.title} on deck B`}>
                    B
                  </button>
                  <button className="icon" onClick={() => engine.library.move(t.id, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button className="icon" onClick={() => engine.library.move(t.id, 1)} aria-label="Move down">
                    ↓
                  </button>
                  <button className="icon" onClick={() => engine.library.remove(t.id)} aria-label={`Remove ${t.title}`}>
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
          {!tracks.some((t) => t.source.kind === 'demo') && (
            <li className="track add-demos">
              <button className="chip small" onClick={() => engine.library.addDemos()}>
                Add demo tracks
              </button>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

export function RecordingsPanel({ engine }: { engine: Engine }) {
  const s = useStore(engine.store);
  if (!engine.canRecord) {
    return <p className="muted pad-text">Recording is not supported in this browser.</p>;
  }
  return (
    <div className="recordings">
      <p className="muted">
        Tap <b>REC</b> in the top bar to record everything you play — decks, effects and sampler — then download the mix here.
      </p>
      {s.recordings.length === 0 ? (
        <p className="muted">No recordings yet.</p>
      ) : (
        <ul>
          {s.recordings.map((r) => (
            <li key={r.id} className="rec-item">
              <div>
                <div className="t-title">{r.name}</div>
                <div className="t-artist">
                  {formatTime(r.seconds)} · {(r.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
              <audio controls src={r.url} preload="none" />
              <a className="btn primary small" href={r.url} download={r.name}>
                Download
              </a>
              <button className="icon" onClick={() => engine.deleteRecording(r.id)} aria-label={`Delete ${r.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
