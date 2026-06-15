# AGENTS.md

Orientation for non-Claude agents. The canonical, fuller version is [CLAUDE.md](CLAUDE.md) — read it. Summary:

- **What this is:** Ableton Live Extensions (Extensions SDK, Node 24 / TypeScript) that send data from Live to the Sulion backend (`../sulion`). This repo is the client; Sulion owns the server endpoints.
- **SDK is pinned (no longer guessed):** the Live 12.4.5 beta SDK is vendored locally (`vendor/*.tgz`, gitignored — closed beta; see [vendor/README.md](vendor/README.md)) and `send-to-sulion` is wired against the real `@ableton-extensions/sdk` 1.0.0-beta.0 — real `activate`/`initialize`, `registerCommand`/`registerContextMenuAction`, `getObjectFromHandle`, `MidiClip.notes`, `withinProgressDialog`, and `environment.storageDirectory` (filesystem is not sandboxed). See [docs/extensions-sdk.md](docs/extensions-sdk.md) for the verified API.
- **Transport:** Sulion takes **files** — render a clip to a `.mid` and upload it via the generic file endpoint ([docs/sulion-api.md](docs/sulion-api.md)). `send-to-sulion` still uses the old notes-JSON path and is migrating (backlog Phase 1).
- **Live verification is deferred:** transferring builds to the Ableton machine is costly, so all features are built and tested off-Live (the fake Extension Host `@sulion-ableton/test-host` stands in) and Live is exercised once, at the end, in a single pass (backlog Phase 5). Every phase but the last stays green without Live.
- **Architecture rule:** keep the SDK only in `packages/*/src/index.ts`. All logic lives in `shared/` and `capture.ts`, which are SDK-independent and unit-tested.
- **Start here:** [docs/backlog.md](docs/backlog.md) for where things stand and the plan; [docs/sulion-api.md](docs/sulion-api.md) for the contract.
- **Rules:** Node 24.16.0 (`.nvmrc`); vitest with injected network/fs/clock; never commit a real token.
