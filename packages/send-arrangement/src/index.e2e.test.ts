/**
 * End-to-end coverage of the real `activate()` through the fake Extension Host: an
 * arrangement selection over a MIDI track exports the in-range notes (offset to the
 * selection start) as one `.mid`. No Live, no Sulion, no browser spawn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromMidiFile } from "@sulion-ableton/shared";
import { makeFakeExtensionHost } from "@sulion-ableton/test-host";
import { activate } from "./index.js";

const BASE_URL = "https://sulion.test";

interface Upload {
  url: string;
  bytes: Uint8Array;
}

let storageDir: string;
let uploads: Upload[];

beforeEach(async () => {
  storageDir = await mkdtemp(join(tmpdir(), "send-arrangement-e2e-"));
  await writeFile(
    join(storageDir, "credentials.json"),
    JSON.stringify({ accessToken: "tok", tokenType: "Bearer" }),
    { mode: 0o600 },
  );
  vi.stubEnv("SULION_BASE_URL", BASE_URL);
  vi.stubEnv("SULION_REPO", "ableton");
  vi.stubEnv("SULION_CONFIG_DIR", undefined as unknown as string);
  vi.stubEnv("SULION_CREDENTIALS_PATH", undefined as unknown as string);

  uploads = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/ingest")) {
        uploads.push({ url: u, bytes: init?.body as Uint8Array });
        return new Response(JSON.stringify({ path: "clips/x.mid", bytes: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(storageDir, { recursive: true, force: true });
});

describe("send-arrangement activate() end to end", () => {
  it("exports the in-range arrangement notes, offset to the selection start", async () => {
    const host = makeFakeExtensionHost({
      clip: { name: "unused", notes: [] },
      tempo: 120,
      storageDirectory: storageDir,
      arrangementTracks: [
        {
          name: "Drums",
          clips: [
            // at beat 4 → note lands at arrangement beat 4 (in [4,8))
            { startTime: 4, clip: { name: "a", notes: [{ pitch: 36, startTime: 0, duration: 0.5, velocity: 100 }] } },
            // at beat 8 → note lands at arrangement beat 8 (excluded, end-exclusive)
            { startTime: 8, clip: { name: "b", notes: [{ pitch: 38, startTime: 0, duration: 0.5, velocity: 90 }] } },
          ],
        },
      ],
    });

    activate(host.activation);
    await host.invokeContextMenu("MidiTrack.ArrangementSelection", {
      time_selection_start: 4,
      time_selection_end: 8,
      selected_lanes: host.arrangementTrackHandles,
    });

    expect(uploads).toHaveLength(1);
    expect(new URL(uploads[0]!.url).searchParams.get("path")).toBe("clips/Drums.mid");
    expect(fromMidiFile(uploads[0]!.bytes).notes).toEqual([
      { pitch: 36, start: 0, duration: 0.5, velocity: 100 },
    ]);
    expect(host.progress.updates.at(-1)?.text).toBe("Sent 1 notes to Sulion ✓");
  });
});
