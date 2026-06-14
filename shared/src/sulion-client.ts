import type { SulionConfig } from "./config.js";
import type { StoredCredentials } from "./auth.js";
import type { SulionClipPayload } from "./notes.js";

export interface IngestResponse {
  ingest_id: string;
  note_count: number;
}

export class SulionAuthError extends Error {}

/**
 * POST a captured clip to Sulion. Throws {@link SulionAuthError} on 401 so the
 * caller can drop the cached token and re-run the pairing flow.
 */
export async function ingestClip(
  config: SulionConfig,
  creds: StoredCredentials,
  payload: SulionClipPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<IngestResponse> {
  const res = await fetchImpl(`${config.baseUrl}/api/midi/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `${creds.tokenType} ${creds.accessToken}`,
    },
    body: JSON.stringify({ source: "ableton", ...payload }),
  });

  if (res.status === 401) throw new SulionAuthError("token rejected (401)");
  if (!res.ok) throw new Error(`ingest failed: HTTP ${res.status}`);
  return (await res.json()) as IngestResponse;
}
