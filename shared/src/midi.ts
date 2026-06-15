/**
 * Render the canonical clip shape to a Standard MIDI File and back. This is the wire
 * format Sulion stores (uploaded via the generic file endpoint — see
 * docs/sulion-api.md). A `.mid` carries pitch / start / duration / velocity plus tempo;
 * `SulionNote.muted` and `probability` have no MIDI representation and are dropped.
 *
 * No SDK dependency — operates only on the canonical types, so it stays unit-testable.
 */
import { Midi } from "@tonejs/midi";
import type { SulionClipPayload, SulionNote } from "./notes.js";

const DEFAULT_TEMPO = 120;

/** Encode a clip to `.mid` bytes. Times are in beats; converted via the file's PPQ. */
export function toMidiFile(payload: SulionClipPayload): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(payload.tempo ?? DEFAULT_TEMPO);
  const ppq = midi.header.ppq;

  const track = midi.addTrack();
  if (payload.name) track.name = payload.name;

  for (const note of payload.notes) {
    track.addNote({
      midi: note.pitch,
      ticks: Math.round(note.start * ppq),
      durationTicks: Math.round(note.duration * ppq),
      velocity: Math.min(1, Math.max(0, note.velocity / 127)),
    });
  }

  return midi.toArray();
}

export interface DecodedClip {
  tempo?: number;
  notes: SulionNote[];
}

/** Decode `.mid` bytes back to canonical notes (+tempo). Inverse of {@link toMidiFile}. */
export function fromMidiFile(bytes: Uint8Array): DecodedClip {
  const midi = new Midi(bytes);
  const ppq = midi.header.ppq;

  const notes: SulionNote[] = midi.tracks.flatMap((track) =>
    track.notes.map((note) => ({
      pitch: note.midi,
      start: note.ticks / ppq,
      duration: note.durationTicks / ppq,
      velocity: Math.max(1, Math.round(note.velocity * 127)),
    })),
  );

  const tempo = midi.header.tempos[0]?.bpm;
  return tempo != null ? { tempo, notes } : { notes };
}
