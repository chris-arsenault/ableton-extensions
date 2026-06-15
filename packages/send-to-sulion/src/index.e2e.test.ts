/**
 * End-to-end + round-trip-fidelity coverage of the real `activate()` driven through
 * the fake Extension Host (no Live, no Sulion, no network, no browser spawn).
 *
 * Pairing is skipped by pre-seeding a credentials file in the fake
 * `environment.storageDirectory`, so the only network call is the file upload, which a
 * stubbed `fetch` captures (the raw `.mid` bytes) and answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NoteDescription } from "@ableton-extensions/sdk";
import { makeFakeExtensionHost } from "@sulion-ableton/test-host";
import { fromMidiFile } from "@sulion-ableton/shared";
import { activate } from "./index.js";

const BASE_URL = "https://sulion.test";

interface Upload {
  url: string;
  contentType: string | undefined;
  bytes: Uint8Array;
}

let storageDir: string;
let uploads: Upload[];
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
  vi.stubEnv("SULION_REPO", "ableton");
  vi.stubEnv("SULION_CONFIG_DIR", undefined as unknown as string);
  vi.stubEnv("SULION_CREDENTIALS_PATH", undefined as unknown as string);

  uploads = [];
  fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/ingest")) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const bytes = init?.body as Uint8Array;
      uploads.push({ url: u, contentType: headers["content-type"], bytes });
      return new Response(JSON.stringify({ path: "clips/x.mid", bytes: bytes.length }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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
  it("renders the clip to a .mid and uploads it, reporting the count", async () => {
    const notes: NoteDescription[] = [
      { pitch: 36, startTime: 0, duration: 0.5, velocity: 100, muted: false },
      { pitch: 36, startTime: 1, duration: 0.5, velocity: 90 },
    ];

    const host = await run({ name: "Verse bassline", notes }, 120);

    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.url).toBe(`${BASE_URL}/api/repos/ableton/ingest?path=clips%2FVerse_bassline.mid`);
    expect(uploads[0]!.contentType).toBe("application/octet-stream");

    const decoded = fromMidiFile(uploads[0]!.bytes);
    expect(decoded.tempo).toBeCloseTo(120, 5);
    expect(decoded.notes).toEqual([
      { pitch: 36, start: 0, duration: 0.5, velocity: 100 },
      { pitch: 36, start: 1, duration: 0.5, velocity: 90 },
    ]);

    expect(host.progress.updates.at(-1)?.text).toBe("Sent 2 notes to Sulion ✓");
  });

  // Characterization: the empty-clip early return already exists in capture.ts; this
  // locks it through activate(). (Green on arrival — temporarily removing the
  // `notes.length === 0` early return makes it red.)
  it("does not upload and reports an empty clip", async () => {
    const host = await run({ name: "Empty", notes: [] }, 120);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.progress.updates.map((u) => u.text)).toContain("Clip has no notes");
  });

  it("shows an actionable status (not a raw error) when the upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).includes("/ingest")) throw new TypeError("fetch failed");
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

  it("preserves the MIDI-representable note fields end to end", async () => {
    // muted/probability have no MIDI representation and are intentionally dropped.
    const notes: NoteDescription[] = [
      { pitch: 48, startTime: 2, duration: 1.5, velocity: 80, muted: true, probability: 0.5 },
      { pitch: 52, startTime: 4, duration: 1 }, // velocity omitted → defaults to 100
    ];

    await run({ name: "Rich", notes }, 90);

    expect(uploads).toHaveLength(1);
    const decoded = fromMidiFile(uploads[0]!.bytes);
    expect(decoded.tempo).toBeCloseTo(90, 2); // MIDI stores tempo as integer µs/qn
    expect(decoded.notes).toEqual([
      { pitch: 48, start: 2, duration: 1.5, velocity: 80 },
      { pitch: 52, start: 4, duration: 1, velocity: 100 },
    ]);
  });
});
