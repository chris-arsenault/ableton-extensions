/**
 * Extension entry point — the SDK-facing layer, the ONLY file that touches the
 * Extensions SDK. It stays thin: register the context-menu action, resolve the
 * clicked MIDI clip, translate its notes to canonical types, then delegate to the
 * real, tested pipeline in ./capture.ts.
 *
 * Verified against @ableton-extensions/sdk 1.0.0-beta.0 (the beta bundle). See
 * docs/extensions-sdk.md for what each call maps to.
 */

import { spawn } from "node:child_process";
import {
  initialize,
  MidiClip,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";

import { captureAndSend, type ProgressHost } from "./capture.js";
import { fromSdkNotes, resolveConfig } from "@sulion-ableton/shared";

const COMMAND_ID = "sulion.sendClip";

/** Open a URL in the user's default browser (for the device-pairing approval step). */
function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd as string, args as string[], { detached: true, stdio: "ignore" }).unref();
  } catch (err) {
    console.error(`Could not open browser for ${url}:`, err);
  }
}

export function activate(activation: ActivationContext): void {
  const context = initialize(activation, "1.0.0");

  // Resolve config once: prefer the SDK's dedicated per-extension storage dir for
  // the cached device token, unless an env override is set.
  const config = resolveConfig(process.env, {
    configDir: context.environment.storageDirectory,
  });

  context.commands.registerCommand(COMMAND_ID, (arg: unknown) => {
    // For the "MidiClip" scope, Live passes the clicked clip's handle as arg[0].
    const handle = arg as Handle;

    void context.ui.withinProgressDialog(
      "Send to Sulion",
      {},
      async (update, abortSignal) => {
        const host: ProgressHost = {
          setStatus: (message) => {
            void update(message);
          },
          isCancelled: () => abortSignal.aborted,
          openUrl: (url) => openInBrowser(url),
        };

        let clip: MidiClip<"1.0.0">;
        try {
          clip = context.getObjectFromHandle(handle, MidiClip);
        } catch (err) {
          console.error("Send to Sulion: could not resolve the clicked clip:", err);
          await update("Couldn't read the selected clip");
          return;
        }

        const tempo = context.application.song.tempo;

        try {
          await captureAndSend(
            {
              name: clip.name,
              tempo,
              notes: fromSdkNotes(clip.notes),
            },
            host,
            { config },
          );
        } catch (err) {
          // captureAndSend has already set an actionable status; just log the detail.
          console.error("Send to Sulion failed:", err);
        }
      },
    );
  });

  // Appears when right-clicking a MIDI clip; the host hands the command the clip.
  void context.ui.registerContextMenuAction("MidiClip", "Send to Sulion", COMMAND_ID);
}
