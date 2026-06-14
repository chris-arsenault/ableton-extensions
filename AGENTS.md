# AGENTS.md

Orientation for non-Claude agents. The canonical, fuller version is [CLAUDE.md](CLAUDE.md) — read it. Summary:

- **What this is:** Ableton Live Extensions (Extensions SDK, Node 24 / TypeScript) that send data from Live to the Sulion backend (`../sulion`). This repo is the client; Sulion owns the server endpoints.
- **SDK is pinned (no longer guessed):** the Live 12.4.5 beta bundle is vendored (`vendor/@ableton-extensions/{sdk,cli}`) and `send-to-sulion` is wired against the real `@ableton-extensions/sdk` 1.0.0-beta.0 — real `activate`/`initialize`, `registerCommand`/`registerContextMenuAction`, `getObjectFromHandle`, `MidiClip.notes`, `withinProgressDialog`, and `environment.storageDirectory` (filesystem is not sandboxed). See [docs/extensions-sdk.md](docs/extensions-sdk.md) for the verified API.
- **Live verification is deferred:** transferring builds to the Ableton machine is costly, so all features are built and tested off-Live (a fake SDK host stands in — backlog M3) and Live is exercised once, at the end, in a single pass (backlog M8). Every milestone but the last stays green without Live.
- **Architecture rule:** keep the SDK only in `packages/*/src/index.ts`. All logic lives in `shared/` and `capture.ts`, which are SDK-independent and unit-tested.
- **Start here:** [docs/backlog.md](docs/backlog.md) for ordered milestones; [docs/sulion-api.md](docs/sulion-api.md) for the HTTP contract.
- **Rules:** Node 24.16.0 (`.nvmrc`); vitest with injected network/fs/clock; never commit a real token.
