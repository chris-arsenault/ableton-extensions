# ableton-extensions

Personal [Ableton Live Extensions](https://ableton.github.io/extensions-sdk/) — small tools that run inside Live (Extensions SDK) and bridge it into the [Sulion](../sulion) family of services.

First and reference extension: **send-to-sulion** — right-click a clip → send its MIDI notes to Sulion over an authenticated HTTP call.

## Status

The shared library (config, note serialization, device-pairing auth, Sulion HTTP client) is real and unit-tested, and the **SDK is pinned**: `send-to-sulion` is wired against the real `@ableton-extensions/sdk` 1.0.0-beta.0 (vendored from the beta bundle under `vendor/`), `typecheck` + `test` + `build` are green, and the build emits a single CJS `dist/index.js` exporting `activate`. What's left is running it inside Live 12.4.5 (needs the beta + Node 24 — see [docs/backlog.md](docs/backlog.md) M3). See [docs/extensions-sdk.md](docs/extensions-sdk.md) for the verified API.

## Requirements

- **Node.js 24.16.0** (the SDK's runtime; pinned in `.nvmrc`). This machine has Node 20 — use `nvm use` or install 24 before building extensions.
- **Ableton Live 12.4.5 Suite** (public beta) to actually run an extension.

## Layout

```
shared/                     @sulion-ableton/shared — reusable, SDK-independent logic
  src/config.ts             env-driven Sulion config (base URL, credentials path)
  src/notes.ts              canonical MIDI note wire shape + SDK-note adapter
  src/auth.ts               device-pairing flow + token cache
  src/sulion-client.ts      authenticated POST to Sulion ingest
packages/
  send-to-sulion/           the first extension
    manifest.json           Live extension manifest (real schema)
    src/index.ts            SDK-facing entry point — the only file touching the SDK
    src/capture.ts          host-agnostic orchestration (real, tested)
vendor/                     vendored @ableton-extensions/{sdk,cli} tgz (not on npm)
docs/                       design + contracts (read these first)
```

## Develop

```bash
nvm use                 # Node 24.16.0
npm install
npm run typecheck
npm test                # vitest — shared + package unit tests
npm run build           # bundle each extension's dist/index.js (esbuild)
```

Config (set in your shell, or via `with-cred` in the managed Sulion PTY):

| Env var                   | Default              | Purpose                                   |
| ------------------------- | -------------------- | ----------------------------------------- |
| `SULION_BASE_URL`         | `http://localhost:8080` | Sulion backend base URL                |
| `SULION_CONFIG_DIR`       | `~/.sulion`          | Where the device token is cached          |
| `SULION_CREDENTIALS_PATH` | `$SULION_CONFIG_DIR/credentials.json` | Override the exact token path |

## The Sulion boundary

This repo only talks to Sulion through two HTTP endpoints. The contract lives in
[docs/sulion-api.md](docs/sulion-api.md); the matching backend handlers live in the
**sulion** repo (not here). Keep the contract doc authoritative for both sides.
