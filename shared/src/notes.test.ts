import { describe, expect, it } from "vitest";
import { fromSdkNote, fromSdkNotes, type RawSdkNote } from "./notes.js";

describe("fromSdkNote", () => {
  it("maps the core fields to the canonical wire shape", () => {
    const raw: RawSdkNote = {
      pitch: 60,
      startTime: 1.5,
      duration: 0.25,
      velocity: 100,
      muted: false,
      probability: 0.8,
    };
    expect(fromSdkNote(raw)).toEqual({
      pitch: 60,
      start: 1.5,
      duration: 0.25,
      velocity: 100,
      muted: false,
      probability: 0.8,
    });
  });

  it("defaults muted to false and omits probability when absent", () => {
    const note = fromSdkNote({ pitch: 48, startTime: 0, duration: 1, velocity: 64 });
    expect(note.muted).toBe(false);
    expect(note).not.toHaveProperty("probability");
  });

  it("defaults velocity when the SDK omits it", () => {
    const note = fromSdkNote({ pitch: 48, startTime: 0, duration: 1 });
    expect(note.velocity).toBe(100);
  });

  it("ignores SDK-only fields the wire shape doesn't carry", () => {
    const note = fromSdkNote({
      pitch: 60,
      startTime: 0,
      duration: 1,
      velocity: 90,
      velocityDeviation: 5,
      releaseVelocity: 64,
      selected: true,
    });
    expect(note).toEqual({ pitch: 60, start: 0, duration: 1, velocity: 90, muted: false });
  });

  it("throws when a required field is missing", () => {
    expect(() => fromSdkNote({ startTime: 0, duration: 1, velocity: 64 })).toThrow(
      /pitch/,
    );
  });

  it("maps a list", () => {
    const notes = fromSdkNotes([
      { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      { pitch: 64, startTime: 1, duration: 1, velocity: 90 },
    ]);
    expect(notes).toHaveLength(2);
    expect(notes[1]?.pitch).toBe(64);
  });
});
