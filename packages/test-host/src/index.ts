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
  clip: FakeClip;
  tempo: number;
  /** Per-extension persistent dir the SDK exposes as `environment.storageDirectory`. */
  storageDirectory: string;
  tempDirectory?: string;
  language?: string;
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
  /** Progress-dialog updates recorded across the run. */
  progress: RecordedProgress;
  /** Invoke a registered command directly, returning when its progress dialog closes. */
  invokeCommand(commandId: string, ...args: unknown[]): Promise<void>;
  /** Trigger the context-menu action registered for `scope`, passing the clip handle. */
  invokeAction(scope: string): Promise<void>;
  /** Simulate the user cancelling the dialog (aborts the SDK's AbortSignal). */
  cancel(): void;
}

// Handle ids are arbitrary, assigned by the host; the registry caches by `id`.
const ROOT_ID = 1n; // the Application root
const SONG_ID = 2n;
const CLIP_ID = 3n;

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
  const { clip, tempo, storageDirectory, tempDirectory, language } = options;

  const appHandle: Handle = { id: ROOT_ID };
  const songHandle: Handle = { id: SONG_ID };
  const clipHandle: Handle = { id: CLIP_ID };

  // Exact leaf class per handle. Exact-match (no parent classes) guarantees the
  // SDK registry resolves the clip as a MidiClip, not its Clip base.
  const classNameById = new Map<bigint, string>([
    [ROOT_ID, "Application"],
    [SONG_ID, "Song"],
    [CLIP_ID, "MidiClip"],
  ]);

  const dataModel = throwingProxy<Api["dataModel"]>(
    {
      getRoot: () => appHandle,
      getObjectIsOfClass: (handle, className) =>
        classNameById.get(handle.id) === className,
      rootGetSong: () => songHandle,
      songGetTempo: () => tempo,
      clipGetName: () => clip.name,
      midiclipGetNotes: () => clip.notes,
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

  const invokeAction = (scope: string): Promise<void> => {
    const commandId = commandIdByScope.get(scope);
    if (!commandId) throw new Error(`no context-menu action registered for scope: ${scope}`);
    return invokeCommand(commandId, clipHandle);
  };

  const cancel = (): void => {
    if (!onCancelled) throw new Error("no progress dialog open to cancel");
    onCancelled();
  };

  return {
    activation,
    clipHandle,
    progress: { updates, done: closed },
    invokeCommand,
    invokeAction,
    cancel,
  };
}
