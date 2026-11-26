# DeckFlow DJ

A free two-deck DJ mixer built with React, TypeScript and the Web Audio API. It runs in any modern browser, installs as an app (PWA), and can be packaged for Android with Capacitor.

Everything is included. There are no accounts, ads or in-app purchases, and your music never leaves your device.

## Features

**Decks (×2)**
- Load your own music: MP3, AAC/M4A, WAV, OGG/Opus, FLAC (whatever the device can decode). Use the library or drag files onto a deck.
- Spinning platter with **scratching**: drag in a circle to move the record forwards or backwards, playing or paused.
- Scrolling waveform with beat grid. Drag it to scrub; zoom from 2 s to 32 s.
- Track overview: tap to jump.
- **Automatic BPM and beat-grid detection**, with tap tempo, ×2 / ÷2 and grid nudge for manual fixes.
- Tempo fader with ±8 / ±16 / ±50 % range and pitch-bend buttons.
- **SYNC**: matches tempo and beat phase to the other deck, and keeps following it while on.
- CDJ-style **CUE**: set it, return to it, or hold to preview.
- **4 hot cues** per deck: tap to set or jump, hold to clear.
- **Beat-locked loops** (½–16 beats) with halve/double.
- **Loop roll**: loops while held, then continues as if the track never stopped.

**Mixer**
- Per channel: gain, 3-band EQ (HI / MID / LOW) with kill switches, one-knob low-pass/high-pass filter, volume fader, level meter.
- Crossfader with Smooth / Mix / Cut curves.
- Master level with limiter and meter.

**Effects** (per deck, BPM-synced where it makes sense)
- Echo, Reverb, Flanger, Phaser, Gate, Bit-crush.
- Touch **XY pad**: X is the effect parameter, Y is the mix. Hold it to engage the effect.

**Sampler**
- 8 pads of built-in synthesized sounds (horn, siren, laser, riser, drop, kick, clap, snare).
- Load your own sound onto any pad.

**Automix**
- Mixes through your library in order. It beat-matches when the tempos are close, crossfades with a bass swap, and loads the next track automatically. Fade length is adjustable.

**Recording**
- Record the master output (decks, effects and sampler) and download the mix.

**Extras**
- Two built-in demo tracks, composed procedurally in code, so you can try it immediately.
- Keyboard shortcuts for desktop (press **?** in the app).
- Screen stays awake while playing; responsive layout for phone, tablet and desktop.
- Works offline once installed (PWA).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (BPM detection, crossfader curves, file-name parsing)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Browsers only allow audio after a user gesture, so the app starts with a **Start mixing** button.

## Android app

The `android/` folder is a ready-made [Capacitor](https://capacitorjs.com) project.

```bash
npm run android:sync   # build the web app and copy it into android/
npm run android:open   # open in Android Studio, then Run ▶ or Build → Build APK(s)
```

Requires Android Studio with an Android SDK. To publish on Google Play, change `appId` in `capacitor.config.json` to your own package name before the first release, then build a signed App Bundle from Android Studio.

## How it works

| File | Role |
| --- | --- |
| `src/audio/deckProcessor.ts` | AudioWorklet playback head: variable speed (including reverse), scratching, sample-accurate loops |
| `src/audio/deck.ts` | One deck: transport, cues, loops, sync, EQ/filter/FX chain |
| `src/audio/engine.ts` | AudioContext, master bus, crossfader, limiter, recorder |
| `src/audio/analysis.ts` | Waveform peaks, BPM (onset autocorrelation + comb refinement), beat phase |
| `src/audio/analysis.worker.ts` | Runs the analysis off the main thread |
| `src/audio/fx.ts` | Effect units |
| `src/audio/automix.ts` | Automatic transitions |
| `src/audio/synth.ts`, `demoTracks.ts` | Procedural sounds for the sampler and demo tracks |
| `src/components/` | React UI (platter, waveforms, knobs, faders, mixer, panels) |

## Known limitations

- **Key lock** (changing tempo without changing pitch) is not implemented; the tempo fader changes pitch like a vinyl turntable.
- **Headphone pre-listening** on a separate output is not available: browsers expose a single audio output to a page.
- In the Android wrapper, the recording **Download** link needs a native file-save plugin to work. Recording works today in the browser and installed PWA.
