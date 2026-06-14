/**
 * End-to-end + round-trip-fidelity coverage of the real `activate()` driven through
 * the fake Extension Host (no Live, no Sulion, no network, no browser spawn).
 *
 * Pairing is skipped by pre-seeding a credentials file in the fake
 * `environment.storageDirectory`, so the only network call is the ingest POST,
 * which a stubbed `fetch` captures and answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NoteDescription } from "@ableton-extensions/sdk";
import { makeFakeExtensionHost } from "@sulion-ableton/test-host";
import { fromSdkNotes } from "@sulion-ableton/shared";
import { activate } from "./index.js";

const BASE_URL = "https://sulion.test";

let storageDir: string;
let ingestBodies: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  storageDir = await mkdtemp(join(tmpdir(), "send-to-sulion-e2e-"));
  // Pre-seed a token so the flow skips pairing (no browser spawn).
  await writeFile(
    join(storageDir, "credentials.json"),
    JSON.stringify({ accessToken: "tok_test", tokenType: "Bearer" }),
    { mode: 0o600 },
  );

  vi.stubEnv("SULION_BASE_URL", BASE_URL);
  vi.stubEnv("SULION_CONFIG_DIR", undefined as unknown as string);
  vi.stubEnv("SULION_CREDENTIALS_PATH", undefined as unknown as string);

  ingestBodies = [];
  fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/api/midi/ingest")) {
      const body = JSON.parse(String(init?.body));
      ingestBodies.push(body);
      return new Response(
        JSON.stringify({ ingest_id: "i1", note_count: body.notes.length }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch in e2e: ${u}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(storageDir, { recursive: true, force: true });
});

async function run(clip: { name: string; notes: NoteDescription[] }, tempo: number) {
  const host = makeFakeExtensionHost({ clip, tempo, storageDirectory: storageDir });
  activate(host.activation);
  await host.invokeAction("MidiClip");
  return host;
}

describe("send-to-sulion activate() end to end", () => {
  it("captures the clicked clip and POSTs it to Sulion, reporting the count", async () => {
    const notes: NoteDescription[] = [
      { pitch: 36, startTime: 0, duration: 0.5, velocity: 100, muted: false },
      { pitch: 36, startTime: 1, duration: 0.5, velocity: 90 },
    ];

    const host = await run({ name: "Verse bassline", notes }, 120);

    expect(ingestBodies).toHaveLength(1);
    expect(ingestBodies[0]).toEqual({
      source: "ableton",
      name: "Verse bassline",
      tempo: 120,
      notes: fromSdkNotes(notes),
    });

    expect(host.progress.updates.at(-1)?.text).toBe("Sent 2 notes to Sulion ✓");
  });

  // Characterization: the empty-clip early return already exists in capture.ts; this
  // locks it through activate(). (Green on arrival — temporarily removing the
  // `notes.length === 0` early return makes it red.)
  it("does not POST and reports an empty clip", async () => {
    const host = await run({ name: "Empty", notes: [] }, 120);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.progress.updates.map((u) => u.text)).toContain("Clip has no notes");
  });

  it("shows an actionable status (not a raw error) when the ingest fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).endsWith("/api/midi/ingest")) throw new TypeError("fetch failed");
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const host = await run(
      { name: "X", notes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 100, muted: false }] },
      120,
    );

    expect(host.progress.updates.at(-1)?.text).toBe(
      "Couldn't reach Sulion — check it's running",
    );
  });

  it("preserves note fields end to end (round-trip fidelity)", async () => {
    const notes: NoteDescription[] = [
      { pitch: 48, startTime: 2, duration: 1.5, velocity: 80, muted: true, probability: 0.5 },
      { pitch: 52, startTime: 4, duration: 1 }, // velocity omitted → defaults to 100
    ];

    await run({ name: "Rich", notes }, 90);

    expect(ingestBodies).toHaveLength(1);
    expect((ingestBodies[0] as { notes: unknown }).notes).toEqual([
      { pitch: 48, start: 2, duration: 1.5, velocity: 80, muted: true, probability: 0.5 },
      { pitch: 52, start: 4, duration: 1, velocity: 100, muted: false },
    ]);
  });
});
