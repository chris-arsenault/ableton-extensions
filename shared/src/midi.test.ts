import { describe, expect, it } from "vitest";
import { fromMidiFile, toMidiFile } from "./midi.js";
import type { SulionNote } from "./notes.js";

describe("toMidiFile / fromMidiFile", () => {
  it("emits a valid Standard MIDI File (MThd header)", () => {
    const bytes = toMidiFile({ name: "X", tempo: 120, notes: [{ pitch: 60, start: 0, duration: 1, velocity: 100 }] });
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]); // "MThd"
  });

  it("round-trips pitch/start/duration/velocity and tempo", () => {
    const notes: SulionNote[] = [
      { pitch: 36, start: 0, duration: 0.5, velocity: 100 },
      { pitch: 60, start: 1.5, duration: 0.25, velocity: 90 },
      { pitch: 64, start: 2, duration: 1, velocity: 1 },
    ];
    const decoded = fromMidiFile(toMidiFile({ name: "Verse", tempo: 128, notes }));

    expect(decoded.tempo).toBeCloseTo(128, 5);
    expect(decoded.notes).toHaveLength(3);
    for (let i = 0; i < notes.length; i++) {
      expect(decoded.notes[i]!.pitch).toBe(notes[i]!.pitch);
      expect(decoded.notes[i]!.start).toBeCloseTo(notes[i]!.start, 5);
      expect(decoded.notes[i]!.duration).toBeCloseTo(notes[i]!.duration, 5);
      expect(decoded.notes[i]!.velocity).toBe(notes[i]!.velocity);
    }
  });

  it("defaults tempo to 120 when the clip has none", () => {
    const decoded = fromMidiFile(toMidiFile({ notes: [{ pitch: 60, start: 0, duration: 1, velocity: 64 }] }));
    expect(decoded.tempo).toBeCloseTo(120, 5);
  });
});
