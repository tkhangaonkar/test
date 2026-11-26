import { useRef } from 'react';
import { useCanvas } from '../hooks';

const SEGMENTS = 16;

/** Segmented peak meter with peak-hold, reading from an AnalyserNode. */
export function VuMeter({ analyser, className = '' }: { analyser: AnalyserNode; className?: string }) {
  const data = useRef(new Float32Array(analyser.fftSize));
  const level = useRef(0);
  const hold = useRef({ v: 0, t: 0 });
  const ref = useCanvas((g, w, h) => {
    analyser.getFloatTimeDomainData(data.current);
    let peak = 0;
    const d = data.current;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
    // Map -48 dB..0 dB to 0..1, fast attack / slow release.
    const db = 20 * Math.log10(peak + 1e-9);
    const target = Math.min(1, Math.max(0, (db + 48) / 48));
    level.current = target > level.current ? target : level.current * 0.92 + target * 0.08;
    const now = performance.now();
    if (level.current >= hold.current.v || now - hold.current.t > 900) hold.current = { v: level.current, t: now };

    g.clearRect(0, 0, w, h);
    const gap = 2;
    const segH = (h - gap * (SEGMENTS - 1)) / SEGMENTS;
    const lit = Math.round(level.current * SEGMENTS);
    const holdSeg = Math.round(hold.current.v * SEGMENTS) - 1;
    for (let i = 0; i < SEGMENTS; i++) {
      const y = h - (i + 1) * segH - i * gap;
      const hot = i >= SEGMENTS - 2 ? '#ef4444' : i >= SEGMENTS - 5 ? '#facc15' : '#4ade80';
      g.fillStyle = i < lit || i === holdSeg ? hot : 'rgba(255,255,255,0.07)';
      g.fillRect(0, y, w, segH);
    }
  });
  return <canvas ref={ref} className={`vu ${className}`} aria-hidden="true" />;
}
