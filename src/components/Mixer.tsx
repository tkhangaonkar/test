import { CURVES } from '../audio/crossfader';
import type { Deck, EqBand } from '../audio/deck';
import type { Engine } from '../audio/engine';
import { useStore } from '../hooks';
import { Fader } from './Fader';
import { Knob } from './Knob';
import { VuMeter } from './VuMeter';

const db = (v: number) => {
  const d = v < 0 ? v * 26 : v * 6;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`;
};

function Channel({ deck }: { deck: Deck }) {
  const s = useStore(deck.store);
  const color = `var(--deck-${deck.id.toLowerCase()})`;
  const band = (b: EqBand, label: string) => (
    <div className={`eq-row ${s.kills[b] ? 'killed' : ''}`}>
      <Knob
        value={s.eq[b]}
        onChange={(v) => deck.setEq(b, v)}
        bipolar
        size={40}
        color={s.kills[b] ? 'var(--danger)' : color}
        title={`${label} EQ — double-tap to reset`}
        format={db}
      />
      <button
        className={`kill ${s.kills[b] ? 'on' : ''}`}
        onClick={() => deck.toggleKill(b)}
        aria-pressed={s.kills[b]}
        title={`Kill ${label.toLowerCase()}`}
      >
        {label}
      </button>
    </div>
  );
  return (
    <div className={`channel ch-${deck.id.toLowerCase()}`}>
      <div className="ch-label" style={{ color }}>
        {deck.id}
      </div>
      <Knob
        value={s.trim}
        onChange={(v) => deck.setTrim(v)}
        bipolar
        size={34}
        label="Gain"
        color={color}
        format={(v) => `${(v * 12).toFixed(1)} dB`}
      />
      {band('high', 'HI')}
      {band('mid', 'MID')}
      {band('low', 'LOW')}
      <Knob
        value={s.filter}
        onChange={(v) => deck.setFilter(Math.abs(v) < 0.03 ? 0 : v)}
        bipolar
        size={40}
        label="Filter"
        color="var(--accent)"
        title="Left: low-pass · right: high-pass · double-tap to reset"
        format={(v) => (Math.abs(v) < 0.03 ? 'off' : v < 0 ? `LP ${Math.round(-v * 100)}%` : `HP ${Math.round(v * 100)}%`)}
      />
      <div className="ch-fader">
        <VuMeter analyser={deck.analyser} />
        <Fader
          label={`Deck ${deck.id} volume`}
          value={s.volume}
          onChange={(v) => deck.setVolume(v)}
          defaultValue={1}
          color={color}
          format={(v) => `${Math.round(v * 100)}%`}
          className="vol-fader"
        />
      </div>
    </div>
  );
}

export function Mixer({ engine }: { engine: Engine }) {
  const s = useStore(engine.store);
  return (
    <section className="mixer" aria-label="Mixer">
      <div className="channels">
        <Channel deck={engine.decks.A} />
        <div className="master-col">
          <div className="ch-label">MASTER</div>
          <Knob
            value={s.masterVolume}
            min={0}
            max={1}
            defaultValue={0.9}
            onChange={(v) => engine.setMasterVolume(v)}
            size={40}
            label="Level"
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <VuMeter analyser={engine.masterAnalyser} className="master-vu" />
        </div>
        <Channel deck={engine.decks.B} />
      </div>
      <div className="xfader">
        <span className="xf-side a">A</span>
        <Fader
          orientation="horizontal"
          label="Crossfader"
          value={s.crossfader}
          onChange={(v) => engine.setCrossfader(Math.abs(v - 0.5) < 0.015 ? 0.5 : v)}
          defaultValue={0.5}
          marks={[0.5]}
          color="var(--text)"
          className="crossfader"
        />
        <span className="xf-side b">B</span>
      </div>
      <div className="curves" role="radiogroup" aria-label="Crossfader curve">
        {CURVES.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={s.curve === c.id}
            className={`chip small ${s.curve === c.id ? 'on' : ''}`}
            onClick={() => engine.setCurve(c.id)}
            title={c.hint}
          >
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
