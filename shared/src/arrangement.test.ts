import { describe, expect, it } from "vitest";
import { selectionNotes } from "./arrangement.js";

describe("selectionNotes", () => {
  it("keeps in-range notes, offsets them to the selection start, and sorts", () => {
    const clips = [
      // clip at beat 4: note at clip-beat 0 -> arrangement beat 4 (in [4,8))
      { startTime: 4, notes: [{ pitch: 36, start: 0, duration: 0.5, velocity: 100 }] },
      // clip at beat 8: note at clip-beat 0 -> arrangement beat 8 (NOT in [4,8))
      { startTime: 8, notes: [{ pitch: 38, start: 0, duration: 0.5, velocity: 90 }] },
      // clip at beat 2: note at clip-beat 4 -> arrangement beat 6 (in [4,8))
      { startTime: 2, notes: [{ pitch: 40, start: 4, duration: 1, velocity: 80 }] },
    ];

    expect(selectionNotes(clips, 4, 8)).toEqual([
      { pitch: 36, start: 0, duration: 0.5, velocity: 100 },
      { pitch: 40, start: 2, duration: 1, velocity: 80 },
    ]);
  });

  it("returns nothing when no note falls in the range", () => {
    expect(
      selectionNotes([{ startTime: 0, notes: [{ pitch: 60, start: 0, duration: 1, velocity: 100 }] }], 16, 32),
    ).toEqual([]);
  });
});
