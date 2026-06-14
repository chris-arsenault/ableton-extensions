import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHarness } from "../scripts/harness.js";

let storageDir: string;

beforeEach(async () => {
  storageDir = await mkdtemp(join(tmpdir(), "send-to-sulion-harness-"));
  // Pre-seed a token so the harness skips pairing (no browser).
  await writeFile(
    join(storageDir, "credentials.json"),
    JSON.stringify({ accessToken: "tok_test", tokenType: "Bearer" }),
    { mode: 0o600 },
  );
});

afterEach(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

describe("runHarness", () => {
  it("drives the flow with an injected fetch and returns the status lines", async () => {
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ingest_id: "i1", note_count: body.notes.length }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const statuses = await runHarness({
      fixture: {
        name: "Harness clip",
        tempo: 120,
        notes: [
          { pitch: 36, startTime: 0, duration: 0.5, velocity: 100, muted: false },
          { pitch: 38, startTime: 1, duration: 0.5, velocity: 90 },
        ],
      },
      storageDirectory: storageDir,
      fetchImpl,
    });

    expect(statuses.at(-1)).toBe("Sent 2 notes to Sulion ✓");
  });
});
