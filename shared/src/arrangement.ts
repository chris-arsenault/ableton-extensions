/**
 * Flatten the notes of arrangement clips within a time selection, re-based so the
 * selection start becomes beat 0. Pure (no SDK) — the SDK edge supplies each clip's
 * arrangement `startTime` and its (clip-relative) notes.
 */
import type { SulionNote } from "./notes.js";

export interface ArrangementClip {
  /** Clip start position in the arrangement, in beats. */
  startTime: number;
  /** The clip's notes, relative to the clip start. */
  notes: SulionNote[];
}

/**
 * Notes whose arrangement position (`clip.startTime + note.start`) is within
 * `[rangeStart, rangeEnd)`, offset to the selection start and sorted by start.
 */
export function selectionNotes(
  clips: ArrangementClip[],
  rangeStart: number,
  rangeEnd: number,
): SulionNote[] {
  const out: SulionNote[] = [];
  for (const clip of clips) {
    for (const note of clip.notes) {
      const pos = clip.startTime + note.start;
      if (pos >= rangeStart && pos < rangeEnd) {
        out.push({ ...note, start: pos - rangeStart });
      }
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}
