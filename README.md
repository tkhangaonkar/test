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
- **Key lock (KEY)**: change the tempo without changing the pitch (WSOLA time-stretching in the audio thread).
- **SYNC**: matches tempo and beat phase to the other deck, and keeps following it while on.
- CDJ-style **CUE**: set it, return to it, or hold to preview.
- **4 hot cues** per deck: tap to set or jump, hold to clear.
- **Beat-locked loops** (½–16 beats) with halve/double.
- **Loop roll**: loops while held, then continues as if the track never stopped.

**Mixer**
- Per channel: gain, 3-band EQ (HI / MID / LOW) with kill switches, one-knob low-pass/high-pass filter, volume fader, level meter.
- Crossfader with Smooth / Mix / Cut curves.
- Master level with limiter and meter.
- **Headphone cue**: a headphone button on each channel lets you pre-listen a deck, with Cue/Master blend and phones level. Two output modes:
  - **Split**: left ear = cue, right ear = master. Use a DJ splitter cable or headphones. Works everywhere, including the Android app.
  - **Second output**: the cue plays on another audio device (desktop Chrome/Edge/Firefox).

**Effects** (per deck, BPM-synced where it makes sense)
- Echo, Reverb, Flanger, Phaser, Gate, Bit-crush.
- Touch **XY pad**: X is the effect parameter, Y is the mix. Hold it to engage the effect.

**Sampler**
- 8 pads of built-in synthesized sounds (horn, siren, laser, riser, drop, kick, clap, snare).
- Load your own sound onto any pad.

**Automix**
- Mixes through your library in order. It beat-matches when the tempos are close, crossfades with a bass swap, and loads the next track automatically. Fade length is adjustable.

**Recording**
- Record the master output (decks, effects and sampler). Download it in the browser; in the Android app, **Save** writes it to `Documents/DeckFlow/` and **Share** opens the share sheet.

**Extras**
- Two built-in demo tracks, composed procedurally in code, so you can try it immediately.
- Keyboard shortcuts for desktop (press **?** in the app).
- Screen stays awake while playing. Responsive layout for phone, tablet and desktop, plus a one-screen “cockpit” layout for phones held sideways (panels open from **☰ Panels**).
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

A ready-built APK is in [`release/`](release/). Copy it to your phone, open it, and allow “install unknown apps” when Android asks.

To build it yourself (no CI needed), you need JDK 17+ and the Android SDK (platform 35, build-tools 35):

```bash
npm run android:sync                      # build the web app and copy it into android/
cd android && ./gradlew assembleDebug     # → android/app/build/outputs/apk/debug/app-debug.apk
```

Or run `npm run android:open` and build from Android Studio.

The APK is signed with the shared key in `android/app/deckflow-debug.keystore`, so every build installs over the previous one. To publish on Google Play, set your own `appId` in `capacitor.config.json` and sign a release App Bundle with a private key that you keep out of the repo.

## How it works

| File | Role |
| --- | --- |
| `src/audio/deckProcessor.ts` | AudioWorklet playback head: variable speed (including reverse), scratching, sample-accurate loops |
| `src/audio/deck.ts` | One deck: transport, cues, loops, sync, EQ/filter/FX chain |
| `src/audio/engine.ts` | AudioContext, master bus, crossfader, limiter, recorder |
| `src/audio/analysis.ts` | Waveform peaks, BPM (onset autocorrelation + comb refinement), beat phase |
| `src/audio/analysis.worker.ts` | Runs the analysis off the main thread |
| `src/audio/stretch.ts` | Key lock time-stretcher (embedded into the worklet) |
| `src/audio/headphones.ts` | Headphone cue routing (split / second output) |
| `src/audio/fx.ts` | Effect units |
| `src/audio/automix.ts` | Automatic transitions |
| `src/audio/synth.ts`, `demoTracks.ts` | Procedural sounds for the sampler and demo tracks |
| `src/components/` | React UI (platter, waveforms, knobs, faders, mixer, panels) |

## Notes

- Key lock sounds best within about ±15 %. At extreme tempo changes, expect the usual time-stretch smearing.
- “Second output” headphone mode depends on the browser letting a page choose an audio device. Phones and the Android app use Split mode instead.
