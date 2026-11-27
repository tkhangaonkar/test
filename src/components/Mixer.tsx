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

export function PhonesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h2.5a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 6.5 20H5a1 1 0 0 1-1-1v-5zm16 0h-2.5a1.5 1.5 0 0 0-1.5 1.5v3a1.5 1.5 0 0 0 1.5 1.5H19a1 1 0 0 0 1-1v-5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Channel({ deck, engine }: { deck: Deck; engine: Engine }) {
  const s = useStore(deck.store);
  const color = `var(--deck-${deck.id.toLowerCase()})`;
  const band = (b: EqBand, label: string) => (
    <div className={`eq-row eq-${b} ${s.kills[b] ? 'killed' : ''}`}>
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
        className="k-gain"
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
        className="k-filter"
        value={s.filter}
        onChange={(v) => deck.setFilter(Math.abs(v) < 0.03 ? 0 : v)}
        bipolar
        size={40}
        label="Filter"
        color="var(--accent)"
        title="Left: low-pass · right: high-pass · double-tap to reset"
        format={(v) => (Math.abs(v) < 0.03 ? 'off' : v < 0 ? `LP ${Math.round(-v * 100)}%` : `HP ${Math.round(v * 100)}%`)}
      />
      <button
        className={`ch-cue ${s.pfl ? 'on' : ''}`}
        onClick={() => engine.togglePfl(deck)}
        aria-pressed={s.pfl}
        aria-label={`Cue deck ${deck.id} in headphones`}
        title="Pre-listen this deck in your headphones"
      >
        <PhonesIcon />
      </button>
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
        <Channel deck={engine.decks.A} engine={engine} />
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
          <Knob
            className="k-cuemix"
            value={s.cueMix}
            min={0}
            max={1}
            defaultValue={0.25}
            onChange={(v) => engine.setCueMix(v)}
            size={34}
            label="Cue/Mst"
            color="var(--cue)"
            title="Headphone mix: left = cue only, right = master only"
            format={(v) => `${Math.round((1 - v) * 100)}% cue`}
          />
          <Knob
            className="k-phones"
            value={s.phonesLevel}
            min={0}
            max={1}
            defaultValue={0.8}
            onChange={(v) => engine.setPhonesLevel(v)}
            size={34}
            label="Phones"
            color="var(--cue)"
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <VuMeter analyser={engine.masterAnalyser} className="master-vu" />
        </div>
        <Channel deck={engine.decks.B} engine={engine} />
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
