/**
 * Extension entry point — the SDK-facing layer, the ONLY file that touches the SDK.
 * Right-click a Session-view clip slot → pull `clips/<track-name>.mid` from Sulion and
 * create a MIDI clip in that slot. Host-agnostic logic lives in ./capture-back.ts.
 */

import { spawn } from "node:child_process";
import {
  ClipSlot,
  Track,
  initialize,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";

import { pullClip } from "./capture-back.js";
import { resolveConfig, type ProgressHost } from "@sulion-ableton/shared";

const PULL = "sulion.pullClip";

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

  const config = resolveConfig(process.env, {
    configDir: context.environment.storageDirectory,
  });

  context.commands.registerCommand(PULL, (arg: unknown) => {
    void context.ui.withinProgressDialog(
      "Pull from Sulion",
      {},
      async (update, abortSignal) => {
        const host: ProgressHost = {
          setStatus: (message) => {
            void update(message);
          },
          isCancelled: () => abortSignal.aborted,
          openUrl: (url) => openInBrowser(url),
        };

        let slot: ClipSlot<"1.0.0">;
        try {
          slot = context.getObjectFromHandle(arg as Handle, ClipSlot);
        } catch (err) {
          console.error("Pull from Sulion: could not resolve the clicked slot:", err);
          host.setStatus("Couldn't read the selected slot");
          return;
        }

        try {
          const pulled = await pullClip(slotName(slot), host, { config });
          if (!pulled) return; // not found / cancelled — status already set
          const clip = await slot.createMidiClip(pulled.lengthBeats);
          clip.notes = pulled.notes;
        } catch (err) {
          console.error("Pull from Sulion failed:", err);
        }
      },
    );
  });

  void context.ui.registerContextMenuAction("ClipSlot", "Pull from Sulion", PULL);
}

/** The clicked slot's track name — the clip file is matched by it (clips/<name>.mid). */
function slotName(slot: ClipSlot<"1.0.0">): string {
  const parent = slot.parent;
  return parent instanceof Track ? parent.name : "clip";
}
