import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toMidiFile, type ProgressHost, type SulionConfig } from "@sulion-ableton/shared";
import { pullClip } from "./capture-back.js";

const BASE_URL = "https://sulion.test";

let credentialsPath: string;

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "pull-from-sulion-"));
  credentialsPath = join(dir, "credentials.json");
  await writeFile(
    credentialsPath,
    JSON.stringify({ accessToken: "tok", tokenType: "Bearer" }),
    { mode: 0o600 },
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(credentialsPath.replace(/\/credentials\.json$/, ""), { recursive: true, force: true });
});

function config(): SulionConfig {
  return { baseUrl: BASE_URL, credentialsPath, repo: "ableton" };
}

function host(): ProgressHost & { statuses: string[] } {
  const statuses: string[] = [];
  return { statuses, setStatus: (m) => statuses.push(m), isCancelled: () => false, openUrl: vi.fn() };
}

describe("pullClip", () => {
  it("downloads clips/<name>.mid and returns SDK-ready notes", async () => {
    const mid = toMidiFile({
      name: "Bass",
      tempo: 120,
      notes: [{ pitch: 36, start: 0, duration: 0.5, velocity: 100 }],
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

    const h = host();
    const pulled = await pullClip("Bass", h, { config: config() });

    expect(url).toBe(`${BASE_URL}/api/repos/ableton/raw?path=clips%2FBass.mid`);
    expect(pulled?.notes).toEqual([
      { pitch: 36, startTime: 0, duration: 0.5, velocity: 100, muted: false },
    ]);
    expect(h.statuses.at(-1)).toBe("Loaded 1 notes from Sulion ✓");
  });

  it("reports and returns null when the clip is not found (404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const h = host();

    const pulled = await pullClip("Missing", h, { config: config() });

    expect(pulled).toBeNull();
    expect(h.statuses.at(-1)).toBe("No Sulion clip at clips/Missing.mid");
  });
});
