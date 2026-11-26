import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Store } from './audio/store';

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Run `cb` on every animation frame while mounted. */
export function useFrame(cb: () => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let id = 0;
    const loop = () => {
      ref.current();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

/**
 * Keeps a canvas' backing store matched to its CSS size × devicePixelRatio and
 * calls `draw` every frame with a ready-to-use 2D context in CSS pixels.
 */
export function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: r.width, h: r.height, dpr };
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useFrame(() => {
    const el = ref.current;
    const { w, h, dpr } = size.current;
    if (!el || !w || !h) return;
    const g = el.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, w, h);
  });
  return ref;
}

export function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Long-press helper: returns pointer handlers that call onTap or onLong. */
export function useLongPress(onTap: () => void, onLong: () => void, ms = 550) {
  const timer = useRef(0);
  const fired = useRef(false);
  return {
    onPointerDown: () => {
      fired.current = false;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, ms);
    },
    onPointerUp: () => {
      window.clearTimeout(timer.current);
      if (!fired.current) onTap();
    },
    onPointerLeave: () => window.clearTimeout(timer.current),
    onPointerCancel: () => window.clearTimeout(timer.current),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
