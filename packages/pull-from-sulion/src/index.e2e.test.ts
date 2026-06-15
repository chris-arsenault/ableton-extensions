/**
 * End-to-end coverage of the real `activate()` driven through the fake Extension Host:
 * right-click an (empty) clip slot → download clips/<track>.mid → create a MIDI clip in
 * the slot with the decoded notes. No Live, no Sulion, no browser spawn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toMidiFile } from "@sulion-ableton/shared";
import { makeFakeExtensionHost } from "@sulion-ableton/test-host";
import { activate } from "./index.js";

const BASE_URL = "https://sulion.test";

let storageDir: string;

beforeEach(async () => {
  storageDir = await mkdtemp(join(tmpdir(), "pull-from-sulion-e2e-"));
  await writeFile(
    join(storageDir, "credentials.json"),
    JSON.stringify({ accessToken: "tok", tokenType: "Bearer" }),
    { mode: 0o600 },
  );
  vi.stubEnv("SULION_BASE_URL", BASE_URL);
  vi.stubEnv("SULION_REPO", "ableton");
  vi.stubEnv("SULION_CONFIG_DIR", undefined as unknown as string);
  vi.stubEnv("SULION_CREDENTIALS_PATH", undefined as unknown as string);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(storageDir, { recursive: true, force: true });
});

describe("pull-from-sulion activate() end to end", () => {
  it("downloads clips/<track>.mid and creates a MIDI clip in the slot", async () => {
    const mid = toMidiFile({
      name: "Bass",
      tempo: 120,
      notes: [
        { pitch: 36, start: 0, duration: 0.5, velocity: 100 },
        { pitch: 38, start: 1, duration: 0.5, velocity: 90 },
      ],
    });
    let url = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string | URL) => {
        url = String(u);
        if (url.includes("/raw")) {
          return new Response(mid, {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          });
        }
        throw new Error(`unexpected fetch: ${u}`);
      }),
    );

    const host = makeFakeExtensionHost({
      clip: { name: "unused", notes: [] },
      tempo: 120,
      storageDirectory: storageDir,
      clipSlots: [null], // one empty slot to create into
      clipSlotTrackNames: ["Bass"], // its parent track
    });

    activate(host.activation);
    await host.invokeContextMenu("ClipSlot", host.clipSlotHandles[0]!);

    expect(url).toBe(`${BASE_URL}/api/repos/ableton/raw?path=clips%2FBass.mid`);
    expect(host.createdClips).toHaveLength(1);
    expect(host.notesSetOn(host.createdClips[0]!.handle)).toEqual([
      { pitch: 36, startTime: 0, duration: 0.5, velocity: 100, muted: false },
      { pitch: 38, startTime: 1, duration: 0.5, velocity: 90, muted: false },
    ]);
    expect(host.progress.updates.at(-1)?.text).toBe("Loaded 2 notes from Sulion ✓");
  });
});
