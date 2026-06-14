# Ableton Extensions SDK — what we know

The [Extensions SDK](https://ableton.github.io/extensions-sdk/) launched as a **public beta on 2026-06-02** alongside **Live 12.4.5 Suite**. It lets you build JavaScript/TypeScript tools that run *inside* Live, triggered from the right-click context menu.

**Status: pinned.** The beta bundle (`extensions-sdk-1.0.0-beta.0.zip`) is vendored **locally** (gitignored — closed beta, not redistributable) and the SDK is wired in for real — package `@ableton-extensions/sdk` 1.0.0-beta.0, extracted to `vendor/` and referenced via `file:`. Everything below is verified against its `dist/index.d.mts` and the bundled `examples/`. The earlier "placeholder, treat as a guess" caveats no longer apply to `index.ts`, `notes.ts`, or `manifest.json`.

## The real API (verified against the beta bundle)

- **Runtime:** full Node.js (SDK `engines` ≥ 22.11.0; we pin **24.16.0** in `.nvmrc` to match Live). Not a sandboxed JS dialect — `node:child_process`, `node:fs`, etc. are available.
- **Package / import:** `@ableton-extensions/sdk` (note: `-extensions/`, not `/extensions-sdk`). Not published to npm during beta — install from the vendored tgz.
- **Entry point:** export a function `activate(activation: ActivationContext)`; call `const context = initialize(activation, "1.0.0")` to get the API. The manifest's `entry` points at the bundled CJS.
- **Registration:** `context.commands.registerCommand(id, callback)` defines what runs; `context.ui.registerContextMenuAction(scope, title, commandId)` defines where it appears. `scope` is a string like `"MidiClip"`, `"ClipSlot"`, `"AudioTrack"`, … (see `ContextMenuScope`).
- **How the command gets its target:** the callback receives `(...args: unknown[])`. For object scopes (`"MidiClip"`, `"ClipSlot"`, …) `args[0]` is an opaque `Handle`; resolve it with `context.getObjectFromHandle(handle, MidiClip)`. Selection scopes pass an `ArrangementSelection` / `ClipSlotSelection` of handles instead.
- **Clips + notes:** `MidiClip.notes` (getter/setter) is `NoteDescription[]`; fields are `pitch, startTime, duration, velocity?, muted?, probability?, velocityDeviation?, releaseVelocity?, selected?` (all times in **beats**). Tempo is `context.application.song.tempo`.
- **UI:** `context.ui.withinProgressDialog(text, { progress? }, async (update, abortSignal) => {…})` — `update(text, progress?)` is async (progress 0–100); `abortSignal` fires on cancel. Also `showModalDialog(url, w, h)` (a webview that can host an `https:`/`http://localhost`/`data:` page and post a result back) — not used yet, but a candidate for the pairing handoff.
- **Persistent storage:** `context.environment.storageDirectory` — a dedicated per-extension dir for "configuration, credentials, and cached state." Also `tempDirectory` and `language`. **This settles the filesystem question** (see below).
- **Trigger + lifecycle:** right-click context menu; **runs once, does its task, stops.** No long-running process.
- **External services:** full Node networking → outbound HTTPS works. Foundation of send-to-sulion.

## Resolved unknowns

The scaffold called these out as guesses; the beta bundle settled each one:

| Was a guess | Reality |
| --- | --- |
| import `@ableton/extensions-sdk` | `@ableton-extensions/sdk` |
| `activate(sdk)` + top-level global `sdk` | `export function activate(activation)` → `initialize(activation, "1.0.0")` |
| `registerContextMenuAction({ target, label, command })` | `ui.registerContextMenuAction(scope, title, commandId)` + `commands.registerCommand(id, cb)` |
| `context.selection.clip` / `context.target.clip` | command callback gets a `Handle`; `context.getObjectFromHandle(handle, MidiClip)` |
| `clip.getNotes()` | `midiClip.notes` getter |
| note fields `start_time`, `mute` | `startTime`, `muted` (+ `velocity?`, `probability?`, `velocityDeviation?`, `releaseVelocity?`, `selected?`) |
| `manifest.json` `{ id, minLiveVersion, … }` | `{ name, author, entry, version, minimumApiVersion }` |
| **Filesystem sandboxed?** | **Not sandboxed.** Full `node:fs`, plus a managed `environment.storageDirectory` for credentials. The localhost-listener fallback in [auth.md](auth.md) is unnecessary. |
| No browser-open primitive | Correct — there is none. We launch the system browser via `node:child_process` (`open`/`xdg-open`/`start`) for the pairing approval. `showModalDialog` is an alternative for later. |

## Dev / install flow

The bundle ships `@ableton-extensions/cli`. From the extension dir:

- `npm run build` → esbuild bundles `src/index.ts` to a single CJS `dist/index.js` (the manifest `entry`).
- `npm run start` → build + `extensions-cli run` loads it into Live's Extension Host. `run` needs `EXTENSION_HOST_PATH` (path to `ExtensionHostNodeModule.node`) via env or a `.env` in the package dir.
- `npm run package` → `extensions-cli package` builds a `.ablx` archive for distribution.

## Where the bundle lives

The Extensions SDK is a **closed beta and may not be redistributed**, so nothing from it is committed to this repo — not the `extensions-sdk-1.0.0-beta.0.zip` Centercode download (root, gitignored) nor the tgz packages extracted from it (`vendor/*.tgz`, gitignored). Supply them locally from your own beta access; see [`vendor/README.md`](../vendor/README.md). The zip's three tgz are `@ableton-extensions/{sdk,cli}` (used by the build) and `@ableton-extensions/create-extension` (the scaffolder); the full HTML API reference is inside the zip under `api/`.

## Reference links

- Landing: <https://ableton.github.io/extensions-sdk/>
- Ableton blog: <https://www.ableton.com/en/blog/introducing-extensions-sdk/>
- Getting-started writeup (confirms Node 24.16.0, `withinProgressDialog`, run-once): <https://audio.ooo/thoughts/ableton-extension-sdk/>
- FAQ (permissions/security — could not be fetched at scaffold time; check it): <https://help.ableton.com/hc/en-us/articles/27303428331420-Ableton-Extensions-FAQ>
