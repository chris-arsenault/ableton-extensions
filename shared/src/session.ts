/**
 * Host-agnostic auth orchestration shared by every extension: load the cached device
 * token, or run the browser pairing flow if it's missing/stale. No SDK dependency —
 * the host behaviour it needs (status, cancel, open-a-URL) is injected via ProgressHost.
 */
import { loadCredentials, pollForToken, saveCredentials, startPairing } from "./auth.js";
import type { StoredCredentials } from "./auth.js";
import type { SulionConfig } from "./config.js";

/** The bits of UI/host behaviour the session/capture flow needs, injected for tests. */
export interface ProgressHost {
  setStatus(message: string): void;
  isCancelled(): boolean;
  /** Open a URL in the user's browser (for the pairing approval step). */
  openUrl(url: string): void | Promise<void>;
}

/** Return the cached token, or run pairing if there isn't a usable one. */
export async function ensureCredentials(
  config: SulionConfig,
  host: ProgressHost,
): Promise<StoredCredentials> {
  const existing = await loadCredentials(config);
  if (existing) return existing;
  return runPairing(config, host);
}

/** Run the browser device-pairing flow and cache the resulting token. */
export async function runPairing(
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
