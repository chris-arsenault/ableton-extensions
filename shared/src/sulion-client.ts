import type { SulionConfig } from "./config.js";
import type { StoredCredentials } from "./auth.js";

export interface UploadResponse {
  /** Normalized repo-relative path the file was written to. */
  path: string;
  /** Number of bytes written. */
  bytes: number;
}

export class SulionAuthError extends Error {}

/**
 * Upload a file to Sulion's generic per-repo file endpoint (see docs/sulion-api.md).
 * `path` is repo-relative (e.g. "clips/verse.mid"); the repo comes from {@link SulionConfig.repo}.
 * Throws {@link SulionAuthError} on 401 so the caller can drop the cached token and re-pair.
 */
export async function uploadFile(
  config: SulionConfig,
  creds: StoredCredentials,
  path: string,
  bytes: Uint8Array,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResponse> {
  const url =
    `${config.baseUrl}/api/repos/${encodeURIComponent(config.repo)}/ingest` +
    `?path=${encodeURIComponent(path)}`;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      authorization: `${creds.tokenType} ${creds.accessToken}`,
    },
    body: bytes,
  });

  if (res.status === 401) throw new SulionAuthError("token rejected (401)");
  if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);
  return (await res.json()) as UploadResponse;
}

export class SulionNotFoundError extends Error {}

/**
 * Download a file from Sulion's device-authed raw endpoint (see docs/sulion-api.md).
 * `path` is repo-relative; the repo comes from {@link SulionConfig.repo}. Throws
 * {@link SulionAuthError} on 401 (caller re-pairs) and {@link SulionNotFoundError} on 404.
 */
export async function downloadFile(
  config: SulionConfig,
  creds: StoredCredentials,
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const url =
    `${config.baseUrl}/api/repos/${encodeURIComponent(config.repo)}/raw` +
    `?path=${encodeURIComponent(path)}`;

  const res = await fetchImpl(url, {
    method: "GET",
    headers: { authorization: `${creds.tokenType} ${creds.accessToken}` },
  });

  if (res.status === 401) throw new SulionAuthError("token rejected (401)");
  if (res.status === 404) throw new SulionNotFoundError(`no file at ${path}`);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
