/**
 * Host-agnostic orchestration for "Send to Sulion": resolve auth (pairing if
 * needed), POST the clip, and report progress. Takes already-normalized notes so
 * it has NO dependency on the Extensions SDK and is fully unit-testable.
 */

import {
  loadCredentials,
  pollForToken,
  resolveConfig,
  saveCredentials,
  startPairing,
  SulionAuthError,
  toMidiFile,
  uploadFile,
  type SulionClipPayload,
  type SulionConfig,
  type StoredCredentials,
} from "@sulion-ableton/shared";

/** The bits of UI/host behaviour capture needs, injected so tests can fake them. */
export interface ProgressHost {
  setStatus(message: string): void;
  isCancelled(): boolean;
  /** Open a URL in the user's browser (for the pairing approval step). */
  openUrl(url: string): void | Promise<void>;
}

export interface CaptureDeps {
  config?: SulionConfig;
}

export async function captureAndSend(
  payload: SulionClipPayload,
  host: ProgressHost,
  deps: CaptureDeps = {},
): Promise<void> {
  const config = deps.config ?? resolveConfig();

  if (payload.notes.length === 0) {
    host.setStatus("Clip has no notes");
    return;
  }

  try {
    let creds = await ensureCredentials(config, host);

    const bytes = toMidiFile(payload);
    const path = clipPath(payload.name);
    const done = `Sent ${payload.notes.length} notes to Sulion ✓`;

    host.setStatus(`Sending ${payload.notes.length} notes…`);
    try {
      await uploadFile(config, creds, path, bytes);
      host.setStatus(done);
    } catch (err) {
      if (err instanceof SulionAuthError) {
        // Cached token went stale between load and use — re-pair once, then retry.
        creds = await runPairing(config, host);
        await uploadFile(config, creds, path, bytes);
        host.setStatus(done);
        return;
      }
      throw err;
    }
  } catch (err) {
    // The user cancelled (e.g. during pairing) — stop calmly, not as an error.
    if (host.isCancelled()) {
      host.setStatus("Cancelled");
      return;
    }
    // Otherwise show an actionable terminal status; the SDK edge logs the detail.
    host.setStatus("Couldn't reach Sulion — check it's running");
    throw err;
  }
}

/**
 * Send several clips in one go (for a ClipSlotSelection). Resolves credentials once,
 * uploads each clip's `.mid`, and reports `k/N` progress. Clips with no notes are
 * skipped. Cancel + actionable-failure handling mirrors {@link captureAndSend}.
 */
export async function captureAndSendAll(
  payloads: SulionClipPayload[],
  host: ProgressHost,
  deps: CaptureDeps = {},
): Promise<void> {
  const config = deps.config ?? resolveConfig();

  const clips = payloads.filter((p) => p.notes.length > 0);
  if (clips.length === 0) {
    host.setStatus("No clips with notes");
    return;
  }

  try {
    let creds = await ensureCredentials(config, host);

    for (let i = 0; i < clips.length; i++) {
      const payload = clips[i]!;
      const bytes = toMidiFile(payload);
      const path = clipPath(payload.name);
      host.setStatus(`Sending clip ${i + 1}/${clips.length}…`);
      try {
        await uploadFile(config, creds, path, bytes);
      } catch (err) {
        if (err instanceof SulionAuthError) {
          creds = await runPairing(config, host);
          await uploadFile(config, creds, path, bytes);
        } else {
          throw err;
        }
      }
    }

    host.setStatus(`Sent ${clips.length} clips to Sulion ✓`);
  } catch (err) {
    if (host.isCancelled()) {
      host.setStatus("Cancelled");
      return;
    }
    host.setStatus("Couldn't reach Sulion — check it's running");
    throw err;
  }
}

/** Repo-relative destination for a clip's `.mid`, with a filesystem-safe name. */
function clipPath(name: string | undefined): string {
  const safe = (name ?? "clip").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return `clips/${safe || "clip"}.mid`;
}

async function ensureCredentials(
  config: SulionConfig,
  host: ProgressHost,
): Promise<StoredCredentials> {
  const existing = await loadCredentials(config);
  if (existing) return existing;
  return runPairing(config, host);
}

async function runPairing(
  config: SulionConfig,
  host: ProgressHost,
): Promise<StoredCredentials> {
  const start = await startPairing(config);
  await host.openUrl(start.verification_uri_complete ?? start.verification_uri);
  host.setStatus(`Approve in browser (code ${start.user_code})…`);
  const creds = await pollForToken(config, start, undefined, () => !host.isCancelled());
  await saveCredentials(config, creds);
  return creds;
}
