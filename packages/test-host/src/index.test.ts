import { describe, expect, it } from "vitest";
import { initialize, MidiClip, type NoteDescription } from "@ableton-extensions/sdk";
import { makeFakeExtensionHost } from "@sulion-ableton/test-host";

function newHost() {
  return makeFakeExtensionHost({
    clip: {
      name: "Verse",
      notes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 100, muted: false }],
    },
    tempo: 120,
    storageDirectory: "/tmp/fake-storage",
  });
}

describe("@sulion-ableton/test-host", () => {
  it("exposes the fake-host factory", () => {
    expect(typeof makeFakeExtensionHost).toBe("function");
  });

  it("lets the real initialize() read tempo and a MidiClip's notes through the fake host", () => {
    const notes: NoteDescription[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 100, muted: false },
      { pitch: 64, startTime: 1, duration: 0.5, velocity: 90 },
    ];
    const host = makeFakeExtensionHost({
      clip: { name: "Verse", notes },
      tempo: 120,
      storageDirectory: "/tmp/fake-storage",
    });

    const context = initialize(host.activation, "1.0.0");

    expect(context.application.song.tempo).toBe(120);

    const clip = context.getObjectFromHandle(host.clipHandle, MidiClip);
    expect(clip.name).toBe("Verse");
    expect(clip.notes).toEqual(notes);
  });

  it("records progress updates when a context-menu action is invoked", async () => {
    const host = newHost();
    const context = initialize(host.activation, "1.0.0");

    context.commands.registerCommand("x", () => {
      void context.ui.withinProgressDialog("init", {}, async (update) => {
        await update("hi", 50);
      });
    });
    context.ui.registerContextMenuAction("MidiClip", "Title", "x");

    await host.invokeAction("MidiClip");

    expect(host.progress.updates).toContainEqual({ text: "hi", progress: 50 });
  });

  it("cancel() aborts the callback's AbortSignal", () => {
    const host = newHost();
    const context = initialize(host.activation, "1.0.0");

    let captured: AbortSignal | undefined;
    context.commands.registerCommand("x", () => {
      void context.ui.withinProgressDialog("init", {}, async (_update, signal) => {
        captured = signal;
        // keep the dialog open until cancelled
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve());
        });
      });
    });
    context.ui.registerContextMenuAction("MidiClip", "Title", "x");

    const done = host.invokeAction("MidiClip");
    expect(captured?.aborted).toBe(false);
    host.cancel();
    expect(captured?.aborted).toBe(true);
    return done;
  });
});
