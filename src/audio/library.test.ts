import { describe, expect, it } from 'vitest';
import { parseFileName } from './library';

describe('parseFileName', () => {
  it('splits artist and title', () => {
    expect(parseFileName('Some Artist - Great Song.mp3')).toEqual({ artist: 'Some Artist', title: 'Great Song' });
    expect(parseFileName('my_track_01.wav')).toEqual({ artist: 'Unknown artist', title: 'my track 01' });
    expect(parseFileName('A – B – C.flac')).toEqual({ artist: 'A', title: 'B – C' });
  });
});
