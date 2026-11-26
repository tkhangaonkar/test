import { useRef } from 'react';
import { beatLength } from '../audio/analysis';
import type { Deck } from '../audio/deck';
import { useCanvas } from '../hooks';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function peakRange(arr: Float32Array, a: number, b: number) {
  const i0 = Math.max(0, Math.floor(a));
  const i1 = Math.min(arr.length - 1, Math.ceil(b));
  let m = 0;
  for (let i = i0; i <= i1; i++) if (arr[i] > m) m = arr[i];
  return m;
}

/** Zoomed, scrolling waveform centred on the playhead, with beat grid. Drag to scrub. */
export function ScrollingWaveform({ deck, zoom }: { deck: Deck; zoom: number }) {
  const drag = useRef<{ x: number } | null>(null);
  const width = useRef(1);
  const color = css(`--deck-${deck.id.toLowerCase()}`) || '#38bdf8';

  const ref = useCanvas((g, w, h) => {
    width.current = w;
    g.clearRect(0, 0, w, h);
    const s = deck.state;
    const track = s.track;
    const mid = h / 2;
    if (!track) {
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(0, mid - 0.5, w, 1);
      return;
    }
    const pos = deck.position();
    const secPerPx = zoom / w;
    const t0 = pos - (w / 2) * secPerPx;
    const wf = track.waveform;

    // Loop region
    if (s.loop) {
      const x0 = (s.loop.start - t0) / secPerPx;
      const x1 = (s.loop.end - t0) / secPerPx;
      g.fillStyle = 'rgba(163, 230, 53, 0.16)';
      g.fillRect(x0, 0, x1 - x0, h);
    }

    // Beat grid
    if (track.bpm) {
      const bl = beatLength(track.bpm);
      let n = Math.ceil((t0 - track.firstBeat) / bl);
      for (let t = track.firstBeat + n * bl; t < t0 + zoom; t += bl, n++) {
        const x = Math.round((t - t0) / secPerPx) + 0.5;
        const bar = ((n % 4) + 4) % 4 === 0;
        g.fillStyle = bar ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
        g.fillRect(x, 0, 1, bar ? h : h * 0.18);
        if (!bar) g.fillRect(x, h - h * 0.18, 1, h * 0.18);
      }
    }

    // Waveform: full band (light) with low band (deck colour) on top.
    const rate = wf.rate;
    for (let x = 0; x < w; x++) {
      const ta = t0 + x * secPerPx;
      if (ta < 0 || ta > track.duration) continue;
      const a = ta * rate;
      const b = a + secPerPx * rate;
      const amp = peakRange(wf.amp, a, b) * (mid - 2);
      const low = peakRange(wf.low, a, b) * (mid - 2);
      const played = ta < pos;
      g.fillStyle = played ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)';
      g.fillRect(x, mid - amp, 1, amp * 2);
      g.fillStyle = color;
      g.globalAlpha = played ? 0.45 : 1;
      g.fillRect(x, mid - low, 1, low * 2);
      g.globalAlpha = 1;
    }

    // Cue + hot cues
    const marker = (t: number, c: string, label?: string) => {
      const x = (t - t0) / secPerPx;
      if (x < -20 || x > w + 20) return;
      g.fillStyle = c;
      g.fillRect(x - 0.5, 0, 1.5, h);
      g.beginPath();
      g.moveTo(x - 5, 0);
      g.lineTo(x + 5, 0);
      g.lineTo(x, 7);
      g.fill();
      if (label) {
        g.font = '600 10px system-ui, sans-serif';
        g.fillText(label, x + 4, h - 4);
      }
    };
    marker(s.cue, '#fbbf24');
    s.hotCues.forEach((c, i) => c != null && marker(c, css('--hot') || '#a78bfa', String(i + 1)));

    // Playhead
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(w / 2) - 1, 0, 2, h);
  });

  return (
    <canvas
      ref={ref}
      className="wave-scroll"
      aria-label={`Deck ${deck.id} waveform — drag to scrub`}
      onPointerDown={(e) => {
        if (!deck.state.track) return;
        (e.target as Element).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX };
        deck.scratchStart();
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        drag.current.x = e.clientX;
        deck.scratchMove((-dx * zoom) / width.current);
      }}
      onPointerUp={() => {
        if (!drag.current) return;
        drag.current = null;
        deck.scratchEnd();
      }}
      onPointerCancel={() => {
        drag.current = null;
        deck.scratchEnd();
      }}
    />
  );
}

/** Whole-track overview. Tap or drag to jump. */
export function OverviewWaveform({ deck }: { deck: Deck }) {
  const width = useRef(1);
  const dragging = useRef(false);
  const color = css(`--deck-${deck.id.toLowerCase()}`) || '#38bdf8';
  const ref = useCanvas((g, w, h) => {
    width.current = w;
    g.clearRect(0, 0, w, h);
    const s = deck.state;
    const track = s.track;
    if (!track) return;
    const wf = track.waveform;
    const per = wf.amp.length / w;
    const mid = h / 2;
    const pos = deck.position();
    const px = (pos / track.duration) * w;
    for (let x = 0; x < w; x++) {
      const amp = peakRange(wf.amp, x * per, (x + 1) * per) * (mid - 1);
      const low = peakRange(wf.low, x * per, (x + 1) * per) * (mid - 1);
      g.fillStyle = x < px ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.45)';
      g.fillRect(x, mid - amp, 1, amp * 2);
      g.fillStyle = color;
      g.globalAlpha = x < px ? 0.4 : 0.9;
      g.fillRect(x, mid - low, 1, low * 2);
      g.globalAlpha = 1;
    }
    if (s.loop) {
      g.fillStyle = 'rgba(163, 230, 53, 0.35)';
      const x0 = (s.loop.start / track.duration) * w;
      g.fillRect(x0, 0, Math.max(2, ((s.loop.end - s.loop.start) / track.duration) * w), h);
    }
    g.fillStyle = '#fbbf24';
    g.fillRect((s.cue / track.duration) * w, 0, 1.5, h);
    g.fillStyle = css('--hot') || '#a78bfa';
    s.hotCues.forEach((c) => c != null && g.fillRect((c / track.duration) * w, 0, 1.5, h));
    g.fillStyle = '#fff';
    g.fillRect(px - 1, 0, 2, h);
  });

  const seekTo = (e: React.PointerEvent) => {
    const track = deck.state.track;
    if (!track) return;
    const r = (e.target as Element).getBoundingClientRect();
    deck.seek(((e.clientX - r.left) / r.width) * track.duration);
  };

  return (
    <canvas
      ref={ref}
      className="wave-overview"
      aria-label={`Deck ${deck.id} track overview — tap to jump`}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as Element).setPointerCapture(e.pointerId);
        seekTo(e);
      }}
      onPointerMove={(e) => dragging.current && seekTo(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    />
  );
}
