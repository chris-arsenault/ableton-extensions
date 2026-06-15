# ableton-extensions — agent orientation

Ableton Live Extensions (Extensions SDK, Node 24 / TypeScript) that bridge Live into the **Sulion** session broker. Sibling repo: `../sulion` (Rust + React + Postgres). This repo is the *client* side; Sulion owns the server endpoints.

Read before editing:

- [README.md](README.md) — layout, requirements, how to build
- [docs/extensions-sdk.md](docs/extensions-sdk.md) — what the SDK gives us, what's **verified vs. guessed**, where to get real types
- [docs/sulion-api.md](docs/sulion-api.md) — the HTTP contract with Sulion (authoritative for both repos)
- [docs/auth.md](docs/auth.md) — device-pairing flow design and rationale
- [docs/backlog.md](docs/backlog.md) — ordered milestones; start here for what to build next

## SDK is pinned — read this first

The Extensions SDK launched as a **Live 12.4.5 public beta** (June 2 2026). Its full API reference ships inside the beta bundle, **not** on the public web. The SDK is **vendored locally** (`vendor/*.tgz`, gitignored — closed beta, not redistributable; see [vendor/README.md](vendor/README.md)) and `send-to-sulion` is wired against the real `@ableton-extensions/sdk` 1.0.0-beta.0 — so the earlier "every name is a placeholder" caveat is resolved. The verified API lives in [docs/extensions-sdk.md](docs/extensions-sdk.md); the highlights:

- **Import** `@ableton-extensions/sdk`; **entry** is `export function activate(activation)` → `initialize(activation, "1.0.0")`.
- **Register:** `commands.registerCommand(id, cb)` + `ui.registerContextMenuAction(scope, title, commandId)`; the command callback receives a `Handle`, resolved via `context.getObjectFromHandle(handle, MidiClip)`.
- **Notes:** `MidiClip.notes` → `NoteDescription[]` (`pitch`/`startTime`/`duration`/optional `velocity`/`muted`/…). **UI:** `ui.withinProgressDialog(text, opts, cb)`.
- **Filesystem is not sandboxed:** full `node:fs` plus a managed `environment.storageDirectory` for credentials. The browser-open step uses `node:child_process` (no SDK primitive for it).
- **Transport:** Sulion takes **files**. The extension renders a clip to a `.mid` and uploads it via the generic file endpoint ([docs/sulion-api.md](docs/sulion-api.md)). `send-to-sulion` still uses the old notes-JSON path and is migrating — see [docs/backlog.md](docs/backlog.md) Phase 1.

**Live verification is deferred to one final pass.** Transferring a build to the Ableton machine is costly, so all remaining features are built and tested *off-Live* — the fake Extension Host (`@sulion-ableton/test-host`) drives the real `activate()` → capture → upload flow without Live — and the extensions run inside Live 12.4.5 exactly once, when the feature set is complete (backlog Phase 5). Every phase but the last must stay green (`typecheck` + `test` + `build`) without Live. The bundle exports `activate`.

## Architecture rule — keep the SDK at the edge

Business logic must stay SDK-independent and unit-tested:

- `shared/` and `packages/*/src/capture.ts` — **real, tested, no SDK imports.** They operate on the canonical `SulionNote`/`SulionClipPayload` types.
- `packages/*/src/index.ts` — the **only** file that touches the SDK. Keep it thin: translate SDK objects → canonical types, then delegate to `capture.ts`.

This boundary is what lets the fake SDK host (`@sulion-ableton/test-host`) drive the whole flow in tests, so features can be built and verified without Live until the final pass (backlog Phase 5).

## Working rules

- **Node 24.16.0 required** (`.nvmrc`). This host runs Node 20 — `nvm use` first or builds/tests may behave differently than in Live.
- Tests are **vitest**, colocated as `*.test.ts`. Network/fs/clock are injected (see `shared/src/auth.ts` `AuthDeps`) — never hit the real network or write real files in a test.
- **Never commit a real token.** `credentials.json` and `.sulion/` are gitignored. The pairing flow writes tokens at runtime only.
- Secrets/credentials follow the Sulion convention: in the managed PTY, run commands needing secrets via `with-cred --`; in docs, treat the Sulion base URL and any keys as environment concerns, not hard-coded values.
- The **Sulion API contract** ([docs/sulion-api.md](docs/sulion-api.md)) is shared with the `../sulion` repo. If you change a request/response shape, update that doc and flag the matching backend change — don't silently diverge.

## Companion doc

[`AGENTS.md`](AGENTS.md) carries the same orientation for non-Claude agents — keep the two in sync.
