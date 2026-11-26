import { useRef } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  defaultValue?: number;
  orientation?: 'vertical' | 'horizontal';
  /** Vertical only: put `min` at the top (DJ tempo-fader convention). */
  invert?: boolean;
  label: string;
  className?: string;
  color?: string;
  format?: (v: number) => string;
  marks?: number[];
}

const CAP = 26;

export function Fader({
  value,
  onChange,
  min = 0,
  max = 1,
  defaultValue,
  orientation = 'vertical',
  invert = false,
  label,
  className = '',
  color = 'var(--accent)',
  format,
  marks,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; v: number } | null>(null);
  const lastTap = useRef(0);
  const vertical = orientation === 'vertical';
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const norm = (value - min) / (max - min);
  // Position along the track, 0 = start (top/left), 1 = end (bottom/right).
  const pos = vertical ? (invert ? norm : 1 - norm) : norm;

  const fromPointer = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const len = (vertical ? r.height : r.width) - CAP;
    const p = ((vertical ? e.clientY - r.top : e.clientX - r.left) - CAP / 2) / len;
    const n = Math.min(1, Math.max(0, p));
    const v = vertical ? (invert ? n : 1 - n) : n;
    return { value: min + v * (max - min), len, coord: vertical ? e.clientY : e.clientX };
  };

  return (
    <div
      ref={ref}
      className={`fader ${vertical ? 'fader-v' : 'fader-h'} ${className}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 1000) / 1000}
      aria-valuetext={format?.(value)}
      style={{ '--pos': pos, '--fader-color': color } as React.CSSProperties}
      onPointerDown={(e) => {
        const now = performance.now();
        if (defaultValue !== undefined && now - lastTap.current < 300) {
          onChange(defaultValue);
          lastTap.current = 0;
          return;
        }
        lastTap.current = now;
        ref.current!.setPointerCapture(e.pointerId);
        const p = fromPointer(e);
        const r = ref.current!.getBoundingClientRect();
        const capCenter = (vertical ? r.top : r.left) + CAP / 2 + pos * p.len;
        // Grab the cap where it is; tapping the track jumps there.
        if (Math.abs(p.coord - capCenter) > CAP) onChange(clamp(p.value));
        drag.current = { start: p.coord, v: Math.abs(p.coord - capCenter) > CAP ? p.value : value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const r = ref.current!.getBoundingClientRect();
        const len = (vertical ? r.height : r.width) - CAP;
        const d = ((vertical ? e.clientY : e.clientX) - drag.current.start) / len;
        const fine = e.shiftKey ? 0.2 : 1;
        const dv = (vertical ? (invert ? d : -d) : d) * (max - min) * fine;
        onChange(clamp(drag.current.v + dv));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        const step = (max - min) / 100;
        const up = vertical && invert ? -step : step;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + up));
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - up));
        else if (e.key === 'Home' && defaultValue !== undefined) onChange(defaultValue);
        else return;
        e.preventDefault();
      }}
    >
      <div className="fader-track" />
      {marks?.map((m) => {
        const n = (m - min) / (max - min);
        const p = vertical ? (invert ? n : 1 - n) : n;
        return <div key={m} className="fader-mark" style={{ '--mark': p } as React.CSSProperties} />;
      })}
      <div className="fader-cap" />
    </div>
  );
}
