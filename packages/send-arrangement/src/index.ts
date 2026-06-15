/**
 * Extension entry point — the SDK-facing layer, the ONLY file that touches the SDK.
 * Right-click an arrangement selection on a MIDI track → export the in-range notes
 * (offset to the selection start) to Sulion as one `.mid`.
 *
 * Notes only: the beta SDK exposes no automation/envelope API, so device-parameter
 * automation is not captured (see docs/backlog.md).
 */

import { spawn } from "node:child_process";
import {
  DataModelObject,
  MidiClip,
  MidiTrack,
  initialize,
  type ActivationContext,
  type ArrangementSelection,
} from "@ableton-extensions/sdk";

import {
  captureAndSend,
  fromSdkNotes,
  resolveConfig,
  selectionNotes,
  type ArrangementClip,
  type ProgressHost,
} from "@sulion-ableton/shared";

const SEND_ARRANGEMENT = "sulion.sendArrangement";

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

  context.commands.registerCommand(SEND_ARRANGEMENT, (arg: unknown) => {
    void context.ui.withinProgressDialog(
      "Send arrangement to Sulion",
      {},
      async (update, abortSignal) => {
        const host: ProgressHost = {
          setStatus: (message) => {
            void update(message);
          },
          isCancelled: () => abortSignal.aborted,
          openUrl: (url) => openInBrowser(url),
        };

        const selection = arg as ArrangementSelection;
        const clips: ArrangementClip[] = [];
        let name = "arrangement";

        for (const handle of selection.selected_lanes) {
          const lane = context.getObjectFromHandle(handle, DataModelObject);
          if (lane instanceof MidiTrack) {
            if (lane.name) name = lane.name;
            for (const clip of lane.arrangementClips) {
              if (clip instanceof MidiClip) {
                clips.push({ startTime: clip.startTime, notes: fromSdkNotes(clip.notes) });
              }
            }
          }
        }

        const notes = selectionNotes(
          clips,
          selection.time_selection_start,
          selection.time_selection_end,
        );

        try {
          await captureAndSend(
            { name, tempo: context.application.song.tempo, notes },
            host,
            { config },
          );
        } catch (err) {
          console.error("Send arrangement to Sulion failed:", err);
        }
      },
    );
  });

  void context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Send arrangement to Sulion",
    SEND_ARRANGEMENT,
  );
}
