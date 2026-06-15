/**
 * Extension entry point — the SDK-facing layer, the ONLY file that touches the
 * Extensions SDK. It stays thin: register the context-menu actions, resolve the
 * clicked clip(s), translate notes to canonical types, then delegate to the real,
 * tested pipeline in ./capture.ts.
 *
 * Two actions: send one right-clicked MIDI clip, or send every MIDI clip in a
 * Session-view selection (1-N export). Verified against @ableton-extensions/sdk
 * 1.0.0-beta.0 — see docs/extensions-sdk.md.
 */

import { spawn } from "node:child_process";
import {
  ClipSlot,
  initialize,
  MidiClip,
  type ActivationContext,
  type ClipSlotSelection,
  type ExtensionContext,
  type Handle,
} from "@ableton-extensions/sdk";

import { captureAndSend, captureAndSendAll, type ProgressHost } from "./capture.js";
import {
  fromSdkNotes,
  resolveConfig,
  type SulionClipPayload,
} from "@sulion-ableton/shared";

const SEND_CLIP = "sulion.sendClip";
const SEND_CLIPS = "sulion.sendClips";

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

  // Prefer the SDK's dedicated per-extension storage dir for the cached token.
  const config = resolveConfig(process.env, {
    configDir: context.environment.storageDirectory,
  });

  // Single clip: the "MidiClip" scope passes the clicked clip's handle.
  context.commands.registerCommand(SEND_CLIP, (arg: unknown) => {
    runWithProgress(context, async (host) => {
      let clip: MidiClip<"1.0.0">;
      try {
        clip = context.getObjectFromHandle(arg as Handle, MidiClip);
      } catch (err) {
        console.error("Send to Sulion: could not resolve the clicked clip:", err);
        host.setStatus("Couldn't read the selected clip");
        return;
      }
      await captureAndSend(payloadOf(clip, context.application.song.tempo), host, { config });
    });
  });

  // 1-N clips: the "ClipSlotSelection" scope passes the selected slots.
  context.commands.registerCommand(SEND_CLIPS, (arg: unknown) => {
    runWithProgress(context, async (host) => {
      const selection = arg as ClipSlotSelection;
      const payloads = collectMidiClips(context, selection, context.application.song.tempo);
      if (payloads.length === 0) {
        host.setStatus("No MIDI clips selected");
        return;
      }
      await captureAndSendAll(payloads, host, { config });
    });
  });

  void context.ui.registerContextMenuAction("MidiClip", "Send to Sulion", SEND_CLIP);
  void context.ui.registerContextMenuAction(
    "ClipSlotSelection",
    "Send selected clips to Sulion",
    SEND_CLIPS,
  );
}

/** Run `body` inside a progress dialog with the standard host; log any throw. */
function runWithProgress(
  context: ExtensionContext<"1.0.0">,
  body: (host: ProgressHost) => Promise<void>,
): void {
  void context.ui.withinProgressDialog("Send to Sulion", {}, async (update, abortSignal) => {
    const host: ProgressHost = {
      setStatus: (message) => {
        void update(message);
      },
      isCancelled: () => abortSignal.aborted,
      openUrl: (url) => openInBrowser(url),
    };
    try {
      await body(host);
    } catch (err) {
      // captureAndSend has already set an actionable status; just log the detail.
      console.error("Send to Sulion failed:", err);
    }
  });
}

/** Collect the MIDI clips among the selected slots (empty slots / audio clips skipped). */
function collectMidiClips(
  context: ExtensionContext<"1.0.0">,
  selection: ClipSlotSelection,
  tempo: number,
): SulionClipPayload[] {
  const payloads: SulionClipPayload[] = [];
  for (const handle of selection.selected_clip_slots) {
    const slot = context.getObjectFromHandle(handle, ClipSlot);
    const clip = slot.clip;
    if (clip instanceof MidiClip) payloads.push(payloadOf(clip, tempo));
  }
  return payloads;
}

function payloadOf(clip: MidiClip<"1.0.0">, tempo: number): SulionClipPayload {
  return { name: clip.name, tempo, notes: fromSdkNotes(clip.notes) };
}
