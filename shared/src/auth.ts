import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SulionConfig } from "./config.js";

/**
 * Device-authorization ("pairing") flow for getting a long-lived token into an
 * extension without a text-input UI inside Live. See docs/auth.md for the full
 * design and docs/sulion-api.md for the wire contract.
 *
 * Lifecycle note: an extension runs once and stops, so there is no background
 * process. Each run reads the cached token; only when it is missing/expired does
 * it run the (browser-based) pairing flow.
 */

export interface StoredCredentials {
  accessToken: string;
  tokenType: string; // "Bearer"
  /** Epoch millis after which the token must be refreshed/re-paired. Omit if non-expiring. */
  expiresAt?: number;
}

export interface PairStartResponse {
  device_code: string;
  user_code: string;
  /** URL the user opens to approve; *_complete embeds the code for one-click. */
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number; // seconds
  interval: number; // seconds between polls
}

/** Minimal injectable seam so the flow is unit-testable without real fs/network/clock. */
export interface AuthDeps {
  fetch: typeof fetch;
  readFileText: (path: string) => Promise<string>;
  writeFileText: (path: string, data: string) => Promise<void>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const defaultAuthDeps: AuthDeps = {
  fetch: (...args) => fetch(...args),
  readFileText: (path) => readFile(path, "utf8"),
  writeFileText: async (path, data) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { mode: 0o600 });
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export async function loadCredentials(
  config: SulionConfig,
  deps: AuthDeps = defaultAuthDeps,
): Promise<StoredCredentials | null> {
  try {
    const creds = JSON.parse(await deps.readFileText(config.credentialsPath)) as StoredCredentials;
    if (creds.expiresAt != null && creds.expiresAt <= deps.now()) return null;
    return creds;
  } catch {
    return null; // missing or unreadable → treat as "not paired"
  }
}

export async function saveCredentials(
  config: SulionConfig,
  creds: StoredCredentials,
  deps: AuthDeps = defaultAuthDeps,
): Promise<void> {
  await deps.writeFileText(config.credentialsPath, JSON.stringify(creds, null, 2));
}

/** Begin pairing: ask the backend for a device/user code pair. */
export async function startPairing(
  config: SulionConfig,
  deps: AuthDeps = defaultAuthDeps,
): Promise<PairStartResponse> {
  const res = await deps.fetch(`${config.baseUrl}/api/devices/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client: "ableton-extensions" }),
  });
  if (!res.ok) throw new Error(`pair start failed: HTTP ${res.status}`);
  return (await res.json()) as PairStartResponse;
}

/**
 * Poll until the user approves in the browser (or it times out). Returns the
 * stored credentials on success. Honors the server's poll `interval` and the
 * `authorization_pending` (HTTP 428) signal.
 */
export async function pollForToken(
  config: SulionConfig,
  start: PairStartResponse,
  deps: AuthDeps = defaultAuthDeps,
  onTick?: () => boolean, // return false to cancel (e.g. progress dialog cancelled)
): Promise<StoredCredentials> {
  const deadline = deps.now() + start.expires_in * 1000;
  const intervalMs = Math.max(1, start.interval) * 1000;

  while (deps.now() < deadline) {
    if (onTick && onTick() === false) throw new Error("pairing cancelled");
    await deps.sleep(intervalMs);

    const res = await deps.fetch(`${config.baseUrl}/api/devices/pair/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: start.device_code }),
    });

    if (res.status === 428) continue; // authorization_pending
    if (!res.ok) throw new Error(`pair token failed: HTTP ${res.status}`);

    const body = (await res.json()) as {
      access_token: string;
      token_type?: string;
      expires_in?: number;
    };
    const creds: StoredCredentials = {
      accessToken: body.access_token,
      tokenType: body.token_type ?? "Bearer",
      ...(body.expires_in != null
        ? { expiresAt: deps.now() + body.expires_in * 1000 }
        : {}),
    };
    await saveCredentials(config, creds, deps);
    return creds;
  }
  throw new Error("pairing timed out");
}
