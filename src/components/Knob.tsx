import { useRef } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  /** Value restored on double-tap. */
  defaultValue?: number;
  label?: React.ReactNode;
  size?: number;
  /** Draw the arc from the centre (for EQ/filter style controls). */
  bipolar?: boolean;
  color?: string;
  title?: string;
  format?: (v: number) => string;
  className?: string;
}

const START = -135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

export function Knob({
  value,
  onChange,
  min = -1,
  max = 1,
  defaultValue = 0,
  label,
  size = 44,
  bipolar = false,
  color = 'var(--accent)',
  title,
  format,
  className = '',
}: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const lastTap = useRef(0);
  const norm = (value - min) / (max - min);
  const angle = START + norm * SWEEP;
  const from = bipolar ? START + ((defaultValue - min) / (max - min)) * SWEEP : START;
  const c = size / 2;
  const r = size / 2 - 4;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const [px, py] = polar(c, c, r - 6, angle);

  return (
    <div className={`knob ${className}`} title={title}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="slider"
        tabIndex={0}
        aria-label={typeof label === 'string' ? label : title}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuetext={format?.(value)}
        onPointerDown={(e) => {
          const now = performance.now();
          if (now - lastTap.current < 300) {
            onChange(defaultValue);
            lastTap.current = 0;
            return;
          }
          lastTap.current = now;
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const fine = e.shiftKey ? 0.25 : 1;
          const dv = ((drag.current.y - e.clientY) / 160) * (max - min) * fine;
          onChange(clamp(drag.current.v + dv));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          const step = (max - min) / 50;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step));
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step));
          else if (e.key === 'Home' || e.key === '0') onChange(defaultValue);
          else return;
          e.preventDefault();
        }}
      >
        <path d={arc(c, c, r, START, START + SWEEP)} className="knob-track" />
        {Math.abs(angle - from) > 0.5 && (
          <path d={arc(c, c, r, Math.min(from, angle), Math.max(from, angle))} stroke={color} className="knob-value" />
        )}
        <circle cx={c} cy={c} r={r - 5} className="knob-cap" />
        <line x1={c} y1={c} x2={px} y2={py} className="knob-pointer" />
      </svg>
      {label != null && <div className="knob-label">{label}</div>}
    </div>
  );
}
