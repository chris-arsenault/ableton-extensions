/**
 * Gated local-Sulion integration check. Skipped by default so `npm test` stays
 * green with no Sulion running; it only executes when BOTH env vars are set:
 *
 *   SULION_BASE_URL=http://localhost:8080 \
 *   SULION_DEVICE_TOKEN=tok_… \
 *   npx vitest run packages/send-to-sulion/src/ingest.integration.test.ts
 *
 * It drives the real `activate()` against the running Sulion and asserts the
 * success status — i.e. Sulion accepted the clip and counted the notes. There is
 * no read-back endpoint in the contract, so this is a count-level check, not a
 * content read-back (deliberately kept lightweight).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NoteDescription } from "@ableton-extensions/sdk";
import { makeFakeExtensionHost } from "@sulion-ableton/test-host";
import { activate } from "./index.js";

const enabled = !!process.env.SULION_BASE_URL && !!process.env.SULION_DEVICE_TOKEN;

describe.runIf(enabled)("send-to-sulion against a local Sulion", () => {
  let storageDir: string;
  const savedConfigDir = process.env.SULION_CONFIG_DIR;
  const savedCredPath = process.env.SULION_CREDENTIALS_PATH;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "send-to-sulion-int-"));
    delete process.env.SULION_CONFIG_DIR;
    delete process.env.SULION_CREDENTIALS_PATH;
    await writeFile(
      join(storageDir, "credentials.json"),
      JSON.stringify({ accessToken: process.env.SULION_DEVICE_TOKEN, tokenType: "Bearer" }),
      { mode: 0o600 },
    );
  });

  afterEach(async () => {
    if (savedConfigDir !== undefined) process.env.SULION_CONFIG_DIR = savedConfigDir;
    if (savedCredPath !== undefined) process.env.SULION_CREDENTIALS_PATH = savedCredPath;
    await rm(storageDir, { recursive: true, force: true });
  });

  it("ingests a clip and reports the note count", async () => {
    const notes: NoteDescription[] = [
      { pitch: 36, startTime: 0, duration: 0.5, velocity: 100, muted: false },
      { pitch: 38, startTime: 1, duration: 0.5, velocity: 90 },
    ];
    const host = makeFakeExtensionHost({
      clip: { name: "Integration clip", notes },
      tempo: 120,
      storageDirectory: storageDir,
    });

    activate(host.activation);
    await host.invokeAction("MidiClip");

    expect(host.progress.updates.at(-1)?.text).toBe(`Sent ${notes.length} notes to Sulion ✓`);
  });
});
