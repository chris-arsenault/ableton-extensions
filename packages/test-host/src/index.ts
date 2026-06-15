/**
 * Fake Extensions SDK host for off-Live testing.
 *
 * Stands in for the native Extension Host at the *host boundary* —
 * `ActivationContext.initializeExtensionHost()` — so the real `initialize()` and
 * every SDK wrapper class run unmodified on top. Lets an extension's real
 * `activate()` be driven end-to-end in a test or dev harness with no Live install.
 *
 * Only the host-module methods that `send-to-sulion`'s activate path actually
 * invokes are implemented (see docs/backlog.md M3 Context / reuse-map). Every other
 * method is left as a throwing stub so an unexpected call is loud, not silent.
 */
import type {
  ActivationContext,
  EXTENSIONS_API,
  Handle,
  NoteDescription,
} from "@ableton-extensions/sdk";

/** The raw host-module bag `initializeExtensionHost` returns for API v1.0.0. */
type Api = EXTENSIONS_API["1.0.0"];

/** One progress-dialog state, as the SDK passes it to the host (`toProgressOptions`). */
export interface ProgressUpdate {
  text: string;
  progress?: number;
}

export interface FakeClip {
  name: string;
  notes: NoteDescription[];
}

export interface FakeHostOptions {
  /** The single MIDI clip resolved by `invokeAction("MidiClip")`. */
  clip: FakeClip;
  tempo: number;
  /** Per-extension persistent dir the SDK exposes as `environment.storageDirectory`. */
  storageDirectory: string;
  tempDirectory?: string;
  language?: string;
  /** Session-view clip slots for `ClipSlotSelection` actions; `null` = an empty slot. */
  clipSlots?: Array<FakeClip | null>;
  /** Parent track name per `clipSlots` entry (so `clipSlot.parent` resolves a Track). */
  clipSlotTrackNames?: string[];
  /** MIDI tracks (with arrangement clips at given beats) for ArrangementSelection actions. */
  arrangementTracks?: Array<{
    name?: string;
    clips: Array<{ startTime: number; clip: FakeClip }>;
  }>;
}

/** What the active progress dialog has shown, plus a promise that settles on close. */
export interface RecordedProgress {
  updates: ProgressUpdate[];
  /** Resolves when the dialog closes (i.e. the command's callback has settled). */
  done: Promise<void>;
}

export interface FakeExtensionHost {
  /** Pass to the extension's `activate()` — it calls `initialize(activation, …)`. */
  activation: ActivationContext;
  /** Handle for the fake MIDI clip, as a context-menu command would receive it. */
  clipHandle: Handle;
  /** Handles for the configured `clipSlots`, in order (for `ClipSlotSelection`). */
  clipSlotHandles: Handle[];
  /** Handles for the configured `arrangementTracks` (for `ArrangementSelection`). */
  arrangementTrackHandles: Handle[];
  /** MIDI clips created via `ClipSlot.createMidiClip` during the run, in order. */
  createdClips: Array<{ handle: Handle; length: number }>;
  /** Notes written to a clip via the `MidiClip.notes` setter (e.g. a created clip). */
  notesSetOn(handle: Handle): NoteDescription[];
  /** Progress-dialog updates recorded across the run. */
  progress: RecordedProgress;
  /** Invoke a registered command directly, returning when its progress dialog closes. */
  invokeCommand(commandId: string, ...args: unknown[]): Promise<void>;
  /** Trigger the context-menu action registered for `scope`, passing the clip handle. */
  invokeAction(scope: string): Promise<void>;
  /** Trigger the action registered for `scope` with an explicit first argument. */
  invokeContextMenu(scope: string, arg: unknown): Promise<void>;
  /** Simulate the user cancelling the dialog (aborts the SDK's AbortSignal). */
  cancel(): void;
}

// Handle ids are arbitrary, assigned by the host; the registry caches by `id`.
const ROOT_ID = 1n; // the Application root
const SONG_ID = 2n;
const CLIP_ID = 3n;
const SLOT_BASE = 100n; // clip-slot handles: 100, 101, …
const SLOT_CLIP_BASE = 200n; // the clip in slot i: 200 + i
const TRACK_BASE = 300n; // the parent track of slot i: 300 + i
const CREATED_BASE = 400n; // clips created via createMidiClip: 400, 401, …
const ARR_TRACK_BASE = 500n; // arrangement track i: 500 + i
const ARR_CLIP_BASE = 600n; // arrangement clips: 600 + i*100 + j

/**
 * Wrap a partial module impl so any method not implemented throws by name instead
 * of returning `undefined` (which would surface as an opaque "x is not a function").
 */
function throwingProxy<T extends object>(impl: Partial<T>, label: string): T {
  return new Proxy(impl, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }
      return () => {
        throw new Error(`${label}.${prop}() not implemented in fake host`);
      };
    },
  }) as T;
}

export function makeFakeExtensionHost(options: FakeHostOptions): FakeExtensionHost {
  const {
    clip,
    tempo,
    storageDirectory,
    tempDirectory,
    language,
    clipSlots = [],
    clipSlotTrackNames = [],
    arrangementTracks = [],
  } = options;

  const appHandle: Handle = { id: ROOT_ID };
  const songHandle: Handle = { id: SONG_ID };
  const clipHandle: Handle = { id: CLIP_ID };

  // Exact leaf class per handle. Exact-match (no parent classes) guarantees the
  // SDK registry resolves a clip as a MidiClip, not its Clip base.
  const classNameById = new Map<bigint, string>([
    [ROOT_ID, "Application"],
    [SONG_ID, "Song"],
    [CLIP_ID, "MidiClip"],
  ]);
  // Per-handle clip data, so reads work for the single clip and any slot clips.
  const clipById = new Map<bigint, FakeClip>([[CLIP_ID, clip]]);
  // Slot handle → its clip handle (or null when the slot is empty).
  const slotClipById = new Map<bigint, bigint | null>();
  // Slot handle → its parent track handle (for `clipSlot.parent`).
  const slotParentById = new Map<bigint, bigint>();
  const trackNameById = new Map<bigint, string>();
  const clipSlotHandles: Handle[] = [];

  clipSlots.forEach((slotClip, i) => {
    const slotId = SLOT_BASE + BigInt(i);
    classNameById.set(slotId, "ClipSlot");
    clipSlotHandles.push({ id: slotId });
    if (slotClip) {
      const clipId = SLOT_CLIP_BASE + BigInt(i);
      classNameById.set(clipId, "MidiClip");
      clipById.set(clipId, slotClip);
      slotClipById.set(slotId, clipId);
    } else {
      slotClipById.set(slotId, null);
    }
    const trackName = clipSlotTrackNames[i];
    if (trackName != null) {
      const trackId = TRACK_BASE + BigInt(i);
      classNameById.set(trackId, "MidiTrack");
      trackNameById.set(trackId, trackName);
      slotParentById.set(slotId, trackId);
    }
  });

  // Arrangement tracks → their arrangement clip handles; clip handle → its start beat.
  const trackArrClipsById = new Map<bigint, Handle[]>();
  const clipStartById = new Map<bigint, number>();
  const arrangementTrackHandles: Handle[] = [];

  arrangementTracks.forEach((track, i) => {
    const trackId = ARR_TRACK_BASE + BigInt(i);
    classNameById.set(trackId, "MidiTrack");
    if (track.name != null) trackNameById.set(trackId, track.name);
    arrangementTrackHandles.push({ id: trackId });
    const clipHandles: Handle[] = track.clips.map((entry, j) => {
      const clipId = ARR_CLIP_BASE + BigInt(i) * 100n + BigInt(j);
      classNameById.set(clipId, "MidiClip");
      clipById.set(clipId, entry.clip);
      clipStartById.set(clipId, entry.startTime);
      return { id: clipId };
    });
    trackArrClipsById.set(trackId, clipHandles);
  });

  // Write-path recorders (populated by createMidiClip / the notes setter).
  const createdClips: Array<{ handle: Handle; length: number }> = [];
  const notesByHandle = new Map<bigint, NoteDescription[]>();

  const dataModel = throwingProxy<Api["dataModel"]>(
    {
      getRoot: () => appHandle,
      getObjectIsOfClass: (handle, className) =>
        classNameById.get(handle.id) === className,
      rootGetSong: () => songHandle,
      songGetTempo: () => tempo,
      clipGetName: (handle) => clipById.get(handle.id)?.name ?? "",
      midiclipGetNotes: (handle) => clipById.get(handle.id)?.notes ?? [],
      clipslotGetClip: (handle) => {
        const clipId = slotClipById.get(handle.id);
        return clipId != null ? { id: clipId } : null;
      },
      getObjectCanonicalParent: (handle) => {
        const parentId = slotParentById.get(handle.id);
        return parentId != null ? { id: parentId } : null;
      },
      trackGetName: (handle) => trackNameById.get(handle.id) ?? "",
      trackGetArrangementClips: (handle) => trackArrClipsById.get(handle.id) ?? [],
      clipGetStartTime: (handle) => clipStartById.get(handle.id) ?? 0,
      clipslotCreateMidiClip: (_handle, length, onResult) => {
        const id = CREATED_BASE + BigInt(createdClips.length);
        classNameById.set(id, "MidiClip");
        const handle: Handle = { id };
        createdClips.push({ handle, length });
        onResult(handle);
      },
      midiclipSetNotes: (handle, notes) => {
        notesByHandle.set(handle.id, notes);
      },
      withinTransaction: (fn) => fn(),
    },
    "dataModel",
  );

  const environment: Api["environment"] = {
    storageDirectory,
    tempDirectory,
    language,
  };

  // --- Commands: store registered callbacks, invoke on demand. ---
  const callbacksById = new Map<string, (...args: unknown[]) => void>();
  const commands: Api["commands"] = {
    registerCommand: (commandId, callback) => {
      callbacksById.set(commandId, callback);
    },
    executeCommand: (commandId, ...args) => {
      const cb = callbacksById.get(commandId);
      if (!cb) throw new Error(`no command registered: ${commandId}`);
      cb(...args);
    },
  };

  // --- UI: record context-menu actions + progress-dialog activity. ---
  const commandIdByScope = new Map<string, string>();
  const updates: ProgressUpdate[] = [];
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let onCancelled: (() => void) | undefined;

  const ui = throwingProxy<Api["ui"]>(
    {
      registerContextMenuAction: (scope, _title, commandId, onRegisterSuccessful) => {
        commandIdByScope.set(scope, commandId);
        onRegisterSuccessful((onUnregisterSuccessful) => {
          commandIdByScope.delete(scope);
          onUnregisterSuccessful();
        });
      },
      showProgressDialog: (initialOptions, onShowDialog, cancelled) => {
        updates.push(initialOptions);
        onCancelled = cancelled;
        onShowDialog({
          update: (opts, onUpdated) => {
            updates.push(opts);
            onUpdated?.();
          },
          close: (onClosed) => {
            resolveClosed();
            onClosed?.();
          },
        });
      },
    },
    "ui",
  );

  // Unused on the send-to-sulion path; loud if something reaches for it.
  const resources = throwingProxy<Api["resources"]>({}, "resources");

  const api: Api = { commands, dataModel, environment, resources, ui };

  const activation: ActivationContext = {
    hostApiVersion: "1.0.0",
    initializeExtensionHost: () => api,
  };

  const invokeCommand = (commandId: string, ...args: unknown[]): Promise<void> => {
    const cb = callbacksById.get(commandId);
    if (!cb) throw new Error(`no command registered: ${commandId}`);
    cb(...args);
    return closed;
  };

  const invokeContextMenu = (scope: string, arg: unknown): Promise<void> => {
    const commandId = commandIdByScope.get(scope);
    if (!commandId) throw new Error(`no context-menu action registered for scope: ${scope}`);
    return invokeCommand(commandId, arg);
  };

  const invokeAction = (scope: string): Promise<void> => invokeContextMenu(scope, clipHandle);

  const cancel = (): void => {
    if (!onCancelled) throw new Error("no progress dialog open to cancel");
    onCancelled();
  };

  return {
    activation,
    clipHandle,
    clipSlotHandles,
    arrangementTrackHandles,
    createdClips,
    notesSetOn: (handle: Handle) => notesByHandle.get(handle.id) ?? [],
    progress: { updates, done: closed },
    invokeCommand,
    invokeAction,
    invokeContextMenu,
    cancel,
  };
}
