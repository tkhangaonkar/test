/// <reference lib="webworker" />
import { analyzeTrack } from './analysis';

// Runs BPM / waveform analysis off the main thread. Channel buffers are
// transferred in and straight back out, so no audio data is copied.
self.onmessage = (e: MessageEvent<{ id: number; channels: Float32Array[]; sampleRate: number }>) => {
  const { id, channels, sampleRate } = e.data;
  const analysis = analyzeTrack(channels, sampleRate);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, channels, analysis }, [
    ...channels.map((c) => c.buffer),
    analysis.waveform.amp.buffer,
    analysis.waveform.low.buffer,
  ]);
};
