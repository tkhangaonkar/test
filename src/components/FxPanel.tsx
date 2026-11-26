import { useRef } from 'react';
import type { Deck } from '../audio/deck';
import { FX_LIST } from '../audio/fx';
import { useStore } from '../hooks';
import { Knob } from './Knob';

/** Touch XY pad: X = effect parameter, Y = wet amount. Engages while held unless latched. */
function XYPad({ deck }: { deck: Deck }) {
  const s = useStore(deck.store);
  const ref = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  const latched = useRef(false);
  const apply = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    deck.setFx({ param: x, wet: y });
  };
  return (
    <div
      ref={ref}
      className={`xy ${s.fx.on ? 'on' : ''}`}
      style={{ '--x': s.fx.param, '--y': s.fx.wet } as React.CSSProperties}
      aria-label={`Deck ${deck.id} effect pad`}
      onPointerDown={(e) => {
        ref.current!.setPointerCapture(e.pointerId);
        held.current = true;
        latched.current = s.fx.on;
        apply(e);
        if (!s.fx.on) deck.setFx({ on: true });
      }}
      onPointerMove={(e) => held.current && apply(e)}
      onPointerUp={() => {
        held.current = false;
        if (!latched.current) deck.setFx({ on: false });
      }}
      onPointerCancel={() => {
        held.current = false;
        if (!latched.current) deck.setFx({ on: false });
      }}
    >
      <div className="xy-dot" />
      <span className="xy-hint">Hold &amp; drag</span>
    </div>
  );
}

function DeckFx({ deck }: { deck: Deck }) {
  const s = useStore(deck.store);
  const info = FX_LIST.find((f) => f.id === s.fx.type)!;
  const color = `var(--deck-${deck.id.toLowerCase()})`;
  return (
    <div className={`fx-deck fx-${deck.id.toLowerCase()}`}>
      <div className="fx-head">
        <span className="deck-badge sm">{deck.id}</span>
        <div className="fx-types" role="radiogroup" aria-label={`Deck ${deck.id} effect`}>
          {FX_LIST.map((f) => (
            <button
              key={f.id}
              role="radio"
              aria-checked={s.fx.type === f.id}
              className={`chip small ${s.fx.type === f.id ? 'on' : ''}`}
              onClick={() => deck.setFx({ type: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="fx-body">
        <XYPad deck={deck} />
        <div className="fx-controls">
          <button className={`btn fx-on ${s.fx.on ? 'on' : ''}`} onClick={() => deck.setFx({ on: !s.fx.on })} aria-pressed={s.fx.on}>
            {s.fx.on ? 'FX ON' : 'FX OFF'}
          </button>
          <Knob
            value={s.fx.wet}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => deck.setFx({ wet: v })}
            label={`Mix ${Math.round(s.fx.wet * 100)}%`}
            color={color}
            size={44}
          />
          <Knob
            value={s.fx.param}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => deck.setFx({ param: v })}
            label={`${info.param} ${info.describe(s.fx.param)}`}
            color={color}
            size={44}
          />
        </div>
      </div>
    </div>
  );
}

export function FxPanel({ decks }: { decks: Deck[] }) {
  return (
    <div className="fx-panel">
      {decks.map((d) => (
        <DeckFx key={d.id} deck={d} />
      ))}
    </div>
  );
}
