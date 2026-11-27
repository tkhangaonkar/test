import { useEffect, useState } from 'react';
import type { Engine } from '../audio/engine';
import { Headphones, type CueMode, type OutputDevice } from '../audio/headphones';
import { useStore } from '../hooks';
import { PhonesIcon } from './Mixer';

export function PhonesPanel({ engine }: { engine: Engine }) {
  const s = useStore(engine.store);
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const canDevice = Headphones.supportsDevice;

  useEffect(() => {
    if (canDevice) void Headphones.listOutputs().then(setDevices).catch(() => {});
  }, [canDevice]);

  const pick = (mode: CueMode) => {
    if (mode === 'device') {
      const id = s.cueDevice ?? devices.find((d) => d.deviceId !== 'default')?.deviceId;
      if (!id) {
        engine.notify('Tap “Find outputs” first, then choose your headphones.');
        return;
      }
      void engine.setCueMode('device', id);
    } else {
      void engine.setCueMode(mode);
    }
  };

  const findOutputs = async () => {
    setBusy(true);
    try {
      const chosen = await Headphones.unlockOutputs();
      const list = await Headphones.listOutputs();
      if (chosen && !list.some((d) => d.deviceId === chosen.deviceId)) list.push(chosen);
      setDevices(list);
      if (chosen) void engine.setCueMode('device', chosen.deviceId);
    } catch {
      engine.notify('The browser did not allow listing audio outputs.');
    } finally {
      setBusy(false);
    }
  };

  const modes: { id: CueMode; title: string; text: string; disabled?: boolean }[] = [
    { id: 'off', title: 'Off', text: 'Normal stereo output. Cue buttons have no effect.' },
    {
      id: 'split',
      title: 'Split (one output)',
      text: 'Left ear = headphone cue, right ear = master. Use a DJ splitter cable to send the right side to speakers, or just wear headphones. Works on phones.',
    },
    {
      id: 'device',
      title: 'Second output',
      text: canDevice
        ? 'Master plays on this device’s main output; the cue plays on another output such as USB or Bluetooth headphones.'
        : 'Not supported by this browser or device. Use Split instead.',
      disabled: !canDevice,
    },
  ];

  return (
    <div className="phones">
      <p className="muted">
        Press <span className="inline-icon"><PhonesIcon /></span> on a mixer channel to pre-listen that deck before the
        audience hears it. Blend cue and master with <b>Cue/Mst</b>, and set the headphone volume with <b>Phones</b>.
      </p>
      <div className="modes" role="radiogroup" aria-label="Headphone output mode">
        {modes.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={s.cueMode === m.id}
            disabled={m.disabled}
            className={`mode ${s.cueMode === m.id ? 'on' : ''}`}
            onClick={() => pick(m.id)}
          >
            <span className="mode-title">{m.title}</span>
            <span className="mode-text">{m.text}</span>
          </button>
        ))}
      </div>
      {canDevice && (
        <div className="devices">
          <label>
            Headphone output
            <select
              value={s.cueDevice ?? ''}
              onChange={(e) => e.target.value && void engine.setCueMode('device', e.target.value)}
            >
              <option value="">Choose…</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <button className="chip" onClick={findOutputs} disabled={busy}>
            {busy ? 'Asking…' : 'Find outputs'}
          </button>
          <p className="muted small">
            Browsers only show output names after a permission prompt. DeckFlow never records your microphone.
          </p>
        </div>
      )}
    </div>
  );
}
