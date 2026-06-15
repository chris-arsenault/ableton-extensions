/**
 * Host-agnostic orchestration for "Pull from Sulion": resolve auth (pairing if
 * needed), download `clips/<name>.mid`, and decode it to SDK-ready notes. Returns the
 * notes for the SDK edge to write into Live, so it has NO Extensions SDK dependency
 * and is fully unit-testable.
 */
import {
  downloadFile,
  ensureCredentials,
  fromMidiFile,
  resolveConfig,
  runPairing,
  SulionAuthError,
  SulionNotFoundError,
  toSdkNotes,
  type ProgressHost,
  type SdkNoteWrite,
  type SulionConfig,
} from "@sulion-ableton/shared";

export interface PulledClip {
  notes: SdkNoteWrite[];
  /** Suggested new-clip length in beats (covers the last note). */
  lengthBeats: number;
}

export interface PullDeps {
  config?: SulionConfig;
}

/**
 * Download `clips/<name>.mid` and return SDK-ready notes + a clip length, or `null`
 * when there's nothing to create (clip not found, or the user cancelled) — in which
 * case a status has already been set.
 */
export async function pullClip(
  name: string,
  host: ProgressHost,
  deps: PullDeps = {},
): Promise<PulledClip | null> {
  const config = deps.config ?? resolveConfig();
  const path = clipPath(name);

  try {
    let creds = await ensureCredentials(config, host);
    host.setStatus(`Fetching ${path}…`);

    let bytes: Uint8Array;
    try {
      bytes = await downloadFile(config, creds, path);
    } catch (err) {
      if (err instanceof SulionAuthError) {
        creds = await runPairing(config, host);
        bytes = await downloadFile(config, creds, path);
      } else {
        throw err;
      }
    }

    const decoded = fromMidiFile(bytes);
    const notes = toSdkNotes(decoded.notes);
    const lengthBeats = Math.max(1, ...decoded.notes.map((n) => n.start + n.duration));
    host.setStatus(`Loaded ${notes.length} notes from Sulion ✓`);
    return { notes, lengthBeats };
  } catch (err) {
    if (host.isCancelled()) {
      host.setStatus("Cancelled");
      return null;
    }
    if (err instanceof SulionNotFoundError) {
      host.setStatus(`No Sulion clip at ${path}`);
      return null;
    }
    host.setStatus("Couldn't reach Sulion — check it's running");
    throw err;
  }
}

/** Repo-relative source for a clip's `.mid` — mirrors send-to-sulion's upload path. */
function clipPath(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return `clips/${safe || "clip"}.mid`;
}
