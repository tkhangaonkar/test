import { useRef, useState } from 'react';
import type { Sampler } from '../audio/sampler';
import { useStore } from '../hooks';
import { Knob } from './Knob';

export function SamplerPanel({ sampler }: { sampler: Sampler }) {
  const s = useStore(sampler.store);
  const [edit, setEdit] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef(0);

  return (
    <div className="sampler">
      <div className="sampler-pads">
        {s.pads.map((p, i) => (
          <button
            key={i}
            className={`spad c${i} ${flash === i ? 'hit' : ''} ${edit ? 'editing' : ''}`}
            onPointerDown={() => {
              if (edit) {
                target.current = i;
                input.current?.click();
                return;
              }
              sampler.trigger(i);
              setFlash(i);
              window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 140);
            }}
          >
            <span className="spad-name">{p.name}</span>
            <span className="spad-sub">{edit ? (p.custom ? 'replace' : 'load sound') : p.custom ? 'custom' : `pad ${i + 1}`}</span>
            {edit && p.custom && (
              <span
                className="spad-reset"
                role="button"
                aria-label={`Reset pad ${i + 1}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  sampler.reset(i);
                }}
              >
                ✕
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="sampler-side">
        <Knob
          value={s.volume}
          min={0}
          max={1}
          defaultValue={0.8}
          onChange={(v) => sampler.setVolume(v)}
          label="Volume"
          size={48}
        />
        <button className={`chip ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} aria-pressed={edit}>
          {edit ? 'Done' : 'Load sounds'}
        </button>
        {error && <p className="error small">{error}</p>}
        <input
          ref={input}
          type="file"
          accept="audio/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setError(null);
              await sampler.assign(target.current, f);
            } catch {
              setError('That file could not be decoded.');
            }
          }}
        />
      </div>
    </div>
  );
}
