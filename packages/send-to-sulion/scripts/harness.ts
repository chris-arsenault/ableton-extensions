/**
 * Dev harness core: drive the real `activate()` once through the fake Extension
 * Host and return the progress statuses it produced. Kept injectable (fetch +
 * storage dir) so it's unit-testable without network or a browser; the CLI wrapper
 * (`dev-harness.ts`) supplies the real `fetch` and a persistent storage dir.
 */
import type { NoteDescription } from "@ableton-extensions/sdk";
import { makeFakeExtensionHost } from "@sulion-ableton/test-host";
import { activate } from "../src/index.js";

export interface HarnessFixture {
  name: string;
  tempo: number;
  notes: NoteDescription[];
}

export interface HarnessOptions {
  fixture: HarnessFixture;
  /** Where the device token is read/written (credentials.json). */
  storageDirectory: string;
  /** Inject a fake `fetch` for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Run the send-to-sulion flow for `fixture`; resolves to the recorded status lines. */
export async function runHarness(options: HarnessOptions): Promise<string[]> {
  const { fixture, storageDirectory, fetchImpl } = options;

  const previousFetch = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try {
    const host = makeFakeExtensionHost({
      clip: { name: fixture.name, notes: fixture.notes },
      tempo: fixture.tempo,
      storageDirectory,
    });
    activate(host.activation);
    await host.invokeAction("MidiClip");
    return host.progress.updates.map((u) => u.text);
  } finally {
    globalThis.fetch = previousFetch;
  }
}
