/**
 * Canonical MIDI note shape that crosses the wire to Sulion.
 *
 * This is intentionally decoupled from whatever object the Extensions SDK hands
 * back for a clip's notes — the SDK's exact type is not yet pinned down (see
 * docs/extensions-sdk.md, "Open questions"). Keep the wire format stable here;
 * adapt the SDK's raw note to it in `fromSdkNote` once the real type is known.
 */
export interface SulionNote {
  /** MIDI pitch, 0–127 (60 = middle C / C3 in Live). */
  pitch: number;
  /** Note start, in beats from the clip start. */
  start: number;
  /** Note length, in beats. */
  duration: number;
  /** Velocity, 1–127. */
  velocity: number;
  /** Whether the note is muted/deactivated. */
  muted?: boolean;
  /** Trigger probability 0–1, if the source exposes it. */
  probability?: number;
}

export interface SulionClipPayload {
  /** Human-readable clip name, if available. */
  name?: string;
  /** Clip tempo in BPM, if the SDK exposes the Set tempo at capture time. */
  tempo?: number;
  /** Clip loop/length in beats, if available. */
  lengthBeats?: number;
  /** Time-signature numerator/denominator, if available. */
  timeSignature?: { numerator: number; denominator: number };
  notes: SulionNote[];
}

/**
 * One note as the Extensions SDK returns it from `MidiClip.notes`. This is a
 * hand-mirror of the SDK's `NoteDescription` type (verified against
 * `@ableton-extensions/sdk` 1.0.0-beta.0) — kept structural rather than imported
 * so `shared/` stays free of any SDK dependency (see CLAUDE.md, "keep the SDK at
 * the edge"). If the SDK type changes, update this mirror and the test.
 *
 * Of these, `pitch`/`startTime`/`duration` are always present on a real note;
 * the rest are optional. We only forward the fields the Sulion wire shape needs;
 * `velocityDeviation`/`releaseVelocity`/`selected` are deliberately dropped.
 */
export interface RawSdkNote {
  pitch?: number;
  startTime?: number;
  duration?: number;
  velocity?: number;
  muted?: boolean;
  probability?: number;
  velocityDeviation?: number;
  releaseVelocity?: number;
  selected?: boolean;
}

/** Default velocity for a note whose SDK velocity is absent (Live's default). */
const DEFAULT_VELOCITY = 100;

/** Adapt one raw SDK note to the canonical wire shape. */
export function fromSdkNote(raw: RawSdkNote): SulionNote {
  return {
    pitch: req(raw.pitch, "pitch"),
    start: req(raw.startTime, "startTime"),
    duration: req(raw.duration, "duration"),
    velocity: raw.velocity ?? DEFAULT_VELOCITY,
    muted: raw.muted ?? false,
    ...(raw.probability != null ? { probability: raw.probability } : {}),
  };
}

export function fromSdkNotes(raw: RawSdkNote[]): SulionNote[] {
  return raw.map(fromSdkNote);
}

function req(value: number | undefined, field: string): number {
  if (value == null || Number.isNaN(value)) {
    throw new Error(`MIDI note missing required field "${field}"`);
  }
  return value;
}
