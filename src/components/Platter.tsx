import { useRef } from 'react';
import { SECONDS_PER_REV, type Deck } from '../audio/deck';
import { useFrame, useStore } from '../hooks';

/**
 * Spinning platter. Drag in a circle to scratch: the record follows your hand,
 * forwards or backwards, whether or not the deck is playing.
 */
export function Platter({ deck }: { deck: Deck }) {
  const state = useStore(deck.store);
  const disc = useRef<SVGGElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const grab = useRef<{ angle: number; cx: number; cy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useFrame(() => {
    const pos = deck.position();
    const deg = ((pos / SECONDS_PER_REV) * 360) % 360;
    disc.current?.setAttribute('transform', `rotate(${deg} 100 100)`);
    const dur = deck.state.track?.duration ?? 0;
    if (ring.current) {
      const p = dur ? pos / dur : 0;
      const c = 2 * Math.PI * 94;
      ring.current.style.strokeDasharray = `${c * p} ${c}`;
      ring.current.classList.toggle('ending', dur > 0 && dur - pos < 20 && deck.state.playing);
    }
  });

  const angleOf = (e: React.PointerEvent) => {
    const g = grab.current!;
    return Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
  };

  const label = state.track?.title ?? '';
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  return (
    <div className={`platter ${state.track ? '' : 'empty'}`}>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        role="img"
        aria-label={`Deck ${deck.id} platter — drag to scratch`}
        onPointerDown={(e) => {
          if (!deck.state.track) return;
          const r = svgRef.current!.getBoundingClientRect();
          grab.current = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, angle: 0 };
          grab.current.angle = angleOf(e);
          svgRef.current!.setPointerCapture(e.pointerId);
          svgRef.current!.classList.add('touched');
          deck.scratchStart();
        }}
        onPointerMove={(e) => {
          if (!grab.current) return;
          const a = angleOf(e);
          let d = a - grab.current.angle;
          if (d > Math.PI) d -= 2 * Math.PI;
          if (d < -Math.PI) d += 2 * Math.PI;
          grab.current.angle = a;
          deck.scratchMove((d / (2 * Math.PI)) * SECONDS_PER_REV);
        }}
        onPointerUp={() => {
          if (!grab.current) return;
          grab.current = null;
          svgRef.current!.classList.remove('touched');
          deck.scratchEnd();
        }}
        onPointerCancel={() => {
          grab.current = null;
          svgRef.current?.classList.remove('touched');
          deck.scratchEnd();
        }}
      >
        <circle cx="100" cy="100" r="98" className="platter-base" />
        <circle cx="100" cy="100" r="94" className="platter-progress-bg" />
        <circle ref={ring} cx="100" cy="100" r="94" className="platter-progress" transform="rotate(-90 100 100)" />
        <g ref={disc}>
          <circle cx="100" cy="100" r="88" className="vinyl" />
          {[80, 72, 64, 56, 48].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} className="groove" />
          ))}
          <path d="M 100 14 A 86 86 0 0 1 172 56" className="sheen" />
          <circle cx="100" cy="100" r="34" className="label" />
          <text x="100" y="98" className="label-letter">
            {deck.id}
          </text>
          <text x="100" y="116" className="label-initials">
            {initials}
          </text>
          <rect x="97" y="12" width="6" height="18" rx="3" className="marker" />
          <circle cx="100" cy="100" r="3.5" className="spindle" />
        </g>
      </svg>
      {!state.track && <div className="platter-hint">{state.loading ? 'Loading…' : 'Load a track'}</div>}
    </div>
  );
}
