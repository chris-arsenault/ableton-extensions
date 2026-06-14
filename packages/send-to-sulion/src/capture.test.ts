import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureAndSend, type ProgressHost } from "./capture.js";
import type { SulionConfig } from "@sulion-ableton/shared";

// Capture-level harness: a hand-built ProgressHost + a stubbed global `fetch`.
// `shared`'s fetch resolves the global at call time, so the stub applies; `openUrl`
// is injected (vi.fn) so the pairing path never spawns a browser.

const BASE_URL = "https://sulion.test";

let credentialsPath: string;

beforeEach(async () => {
  // A fresh, empty dir → no cached credentials → the flow pairs.
  const dir = await mkdtemp(join(tmpdir(), "send-to-sulion-cap-"));
  credentialsPath = join(dir, "credentials.json");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(credentialsPath.replace(/\/credentials\.json$/, ""), {
    recursive: true,
    force: true,
  });
});

function config(): SulionConfig {
  return { baseUrl: BASE_URL, credentialsPath };
}

function host(opts: { cancelled?: boolean } = {}): ProgressHost & { statuses: string[] } {
  const statuses: string[] = [];
  return {
    statuses,
    setStatus: (m) => statuses.push(m),
    isCancelled: () => opts.cancelled ?? false,
    openUrl: vi.fn(),
  };
}

const ONE_NOTE = [{ pitch: 60, start: 0, duration: 1, velocity: 100 }];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PAIR_START = {
  device_code: "dc",
  user_code: "WXYZ-1234",
  verification_uri: `${BASE_URL}/pair`,
  expires_in: 300,
  interval: 0, // floored to a 1s poll wait by pollForToken; keeps the 401 test snappy
};

describe("captureAndSend", () => {
  it("short-circuits on an empty clip without touching the network", async () => {
    const h = host();
    await captureAndSend({ name: "Empty", notes: [] }, h, { config: config() });
    expect(h.statuses).toContain("Clip has no notes");
    expect(h.openUrl).not.toHaveBeenCalled();
  });

  it("stops cleanly with 'Cancelled' when the user cancels during pairing", async () => {
    const h = host({ cancelled: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).endsWith("/api/devices/pair")) return json(PAIR_START);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    await expect(
      captureAndSend({ name: "X", notes: ONE_NOTE }, h, { config: config() }),
    ).resolves.toBeUndefined();

    expect(h.statuses).toContain("Cancelled");
  });

  it("shows an actionable status and rethrows when Sulion is unreachable", async () => {
    await writeFile(
      credentialsPath,
      JSON.stringify({ accessToken: "tok", tokenType: "Bearer" }),
      { mode: 0o600 },
    );
    const h = host();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).endsWith("/api/midi/ingest")) throw new TypeError("fetch failed");
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    await expect(
      captureAndSend({ name: "X", notes: ONE_NOTE }, h, { config: config() }),
    ).rejects.toThrow();

    expect(h.statuses.at(-1)).toBe("Couldn't reach Sulion — check it's running");
  });

  // Characterization: the 401 re-pair-and-retry path already exists in capture.ts;
  // this locks it in. (Green on arrival — to confirm it has teeth, temporarily remove
  // the `if (err instanceof SulionAuthError)` branch and it goes red.)
  it("re-pairs once and retries on a 401, then succeeds", async () => {
    await writeFile(
      credentialsPath,
      JSON.stringify({ accessToken: "stale", tokenType: "Bearer" }),
      { mode: 0o600 },
    );
    const h = host();
    let ingestCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith("/api/midi/ingest")) {
          ingestCalls += 1;
          if (ingestCalls === 1) return json({ error: "unauthorized" }, 401);
          const body = JSON.parse(String(init?.body));
          return json({ ingest_id: "i1", note_count: body.notes.length });
        }
        if (u.endsWith("/api/devices/pair")) return json(PAIR_START);
        if (u.endsWith("/api/devices/pair/token")) {
          return json({ access_token: "fresh", token_type: "Bearer" });
        }
        throw new Error(`unexpected fetch: ${u}`);
      }),
    );

    await captureAndSend({ name: "X", notes: ONE_NOTE }, h, { config: config() });

    expect(ingestCalls).toBe(2);
    expect(h.statuses.at(-1)).toBe(`Sent ${ONE_NOTE.length} notes to Sulion ✓`);
  });
});
