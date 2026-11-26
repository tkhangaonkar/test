import type { Deck } from './deck';
import type { Engine } from './engine';

interface Fade {
  from: Deck;
  to: Deck;
  start: number;
  duration: number;
  x0: number;
  x1: number;
  swapped: boolean;
  fromLow: number;
  toLow: number;
}

const smoothstep = (p: number) => p * p * (3 - 2 * p);

/**
 * Hands-free mixing through the library in order. Near the end of the playing
 * track it loads the next one on the other deck, matches its tempo (when the
 * BPMs are close), starts it and crossfades with a mid-point bass swap.
 */
export class AutoMix {
  private timer = 0;
  private fade: Fade | null = null;
  private loading = false;
  /** Decks whose current track has already been played by automix. */
  private spent = new Set<string>();

  constructor(private engine: Engine) {}

  get fading() {
    return !!this.fade;
  }

  setEnabled(on: boolean) {
    this.engine.store.set({ automix: on });
    window.clearInterval(this.timer);
    if (on) {
      this.spent.clear();
      this.timer = window.setInterval(() => this.tick(), 50);
      this.tick();
    } else {
      this.cancelFade();
    }
  }

  setFadeLength(seconds: number) {
    this.engine.store.set({ automixFade: seconds });
  }

  /** The user grabbed the crossfader: stop animating it. */
  cancelFade() {
    const f = this.fade;
    if (!f) return;
    this.fade = null;
    f.from.setEq('low', f.fromLow);
    f.to.setEq('low', f.toLow);
  }

  private async loadNext(deck: Deck, afterTrackId: string | undefined) {
    const tracks = this.engine.library.tracks;
    if (!tracks.length || this.loading) return false;
    const idx = afterTrackId ? tracks.findIndex((t) => t.id === afterTrackId) : -1;
    const next = tracks[(idx + 1) % tracks.length];
    this.loading = true;
    try {
      await this.engine.loadTrack(deck.id, next.id);
      this.spent.delete(deck.id);
      return !!deck.state.track;
    } finally {
      this.loading = false;
    }
  }

  private tick() {
    const { engine } = this;
    if (!engine.state.automix) return;
    if (this.fade) {
      this.stepFade();
      return;
    }
    if (this.loading) return;
    const { A, B } = engine.decks;
    const playing = [A, B].filter((d) => d.state.playing);

    if (playing.length === 0) {
      const ready = [A, B].find((d) => d.state.track && !d.state.ended && !this.spent.has(d.id));
      if (ready) {
        ready.play();
        engine.setCrossfader(ready.id === 'A' ? 0 : 1, true);
      } else {
        const last = A.state.track?.id ?? B.state.track?.id;
        void this.loadNext(A, last).then((ok) => {
          if (ok && engine.state.automix) {
            A.play();
            engine.setCrossfader(0, true);
          }
        });
      }
      return;
    }

    const active = playing.length === 1 ? playing[0] : engine.state.crossfader < 0.5 ? A : B;
    const next = engine.other(active);
    const track = active.state.track;
    if (!track) return;

    const needsTrack = !next.state.track || next.state.ended || this.spent.has(next.id);
    if (needsTrack && !next.state.playing) {
      void this.loadNext(next, track.id);
      return;
    }

    const remaining = track.duration - active.position();
    const duration = Math.min(engine.state.automixFade, Math.max(2, track.duration / 3));
    if (!next.state.playing && next.state.track && remaining <= duration + 0.3) {
      this.startFade(active, next, duration);
    }
  }

  private startFade(from: Deck, to: Deck, duration: number) {
    const { engine } = this;
    const nb = to.state.track?.bpm;
    const fb = from.effectiveBpm();
    to.exitLoop();
    to.seek(to.state.track?.firstBeat ?? 0);
    // Only beat-match when the tempos are close; otherwise just blend.
    if (nb && fb && Math.abs(fb / nb - 1) <= 0.08) to.syncTo(from, false);
    else to.setTempo(0);
    to.play();
    if (nb && fb) to.syncTo(from, true, true);

    this.fade = {
      from,
      to,
      start: engine.ctx.currentTime,
      duration,
      x0: engine.state.crossfader,
      x1: to.id === 'A' ? 0 : 1,
      swapped: false,
      fromLow: from.state.eq.low,
      toLow: to.state.eq.low,
    };
    to.setEq('low', -1);
  }

  private stepFade() {
    const f = this.fade!;
    const { engine } = this;
    const p = Math.min(1, (engine.ctx.currentTime - f.start) / f.duration);
    engine.setCrossfader(f.x0 + (f.x1 - f.x0) * smoothstep(p), true);
    if (!f.swapped && p >= 0.5) {
      f.swapped = true;
      f.to.setEq('low', f.toLow);
      f.from.setEq('low', -1);
    }
    if (p >= 1) {
      this.fade = null;
      f.from.pause();
      f.from.setEq('low', f.fromLow);
      this.spent.add(f.from.id);
    }
  }
}
