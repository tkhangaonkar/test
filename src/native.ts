import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** True inside the Android app (Capacitor), false in a browser. */
export const isNative = () => Capacitor.isNativePlatform();

const CHUNK = 3 * 1024 * 1024; // multiple of 3 so base64 chunks concatenate cleanly

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Write a Blob to a file in chunks, so long mixes don't need one giant string. */
async function writeBlob(blob: Blob, path: string, directory: Directory) {
  for (let off = 0; off < blob.size || off === 0; off += CHUNK) {
    const bytes = new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer());
    const data = toBase64(bytes);
    if (off === 0) await Filesystem.writeFile({ path, data, directory, recursive: true });
    else await Filesystem.appendFile({ path, data, directory });
    if (blob.size === 0) break;
  }
  return (await Filesystem.getUri({ path, directory })).uri;
}

/** Save a recording to the phone's Documents/DeckFlow folder. Returns a human-readable location. */
export async function saveRecording(blob: Blob, name: string): Promise<string> {
  try {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
  } catch {
    /* permission not needed on recent Android */
  }
  await writeBlob(blob, `DeckFlow/${name}`, Directory.Documents);
  return `Documents/DeckFlow/${name}`;
}

/** Open the Android share sheet (Drive, WhatsApp, Files…) for a recording. */
export async function shareRecording(blob: Blob, name: string) {
  const uri = await writeBlob(blob, name, Directory.Cache);
  await Share.share({ title: name, files: [uri], dialogTitle: 'Share your mix' });
}
