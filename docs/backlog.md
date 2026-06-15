# Backlog — the plan

One ordered plan for the extensions/client code in this repo. Every phase except the
final one is completable on a dev host with **no Ableton Live install** and must leave
`npm run typecheck`, `npm test`, and `npm run build` green.

## Where things stand

- **Working off-Live (green):** Node 24 toolchain; the real Extensions SDK wired in
  (`@ableton-extensions/sdk`, vendored locally per [vendor/README.md](../vendor/README.md));
  a fake Extension Host harness (`@sulion-ableton/test-host`) that drives a real
  `activate()` with no Live; error UX (cancel, actionable failure, 401 re-pair); and the
  **file transport** — `send-to-sulion` renders the clip to a `.mid` and uploads it via
  the generic file endpoint (`shared` `toMidiFile`/`fromMidiFile` + `uploadFile`).
- **External (the `../sulion` repo, another agent):** device pairing and the generic
  file-ingest endpoint are live. A device-authed raw file **download** (needed to pull a
  clip back into Live) does not exist yet; the spec is in
  `../sulion/docs/ableton-file-contract.md` for that agent to build.
- **Not built yet:** the three new extensions, lint/CI, and the one-time Live
  verification.

## Two standing constraints

**Live verification is deferred to one final pass.** Transferring a build to the
Ableton machine is costly, so it happens once, when the whole feature set is complete.
The fake Extension Host harness exists to make that deferral safe: drive the real
`activate()` → capture → upload flow in tests, off-Live. Before reaching for Live, ask
"could a fake-host test cover this?"

**This repo owns only the extensions/client code.** The Sulion backend and pairing page
belong to a separate agent in `../sulion`. [sulion-api.md](sulion-api.md) is the shared
contract; to change a request/response shape, update that doc and the spec handed to the
Sulion agent rather than editing Sulion here.

## Completed

- Toolchain + real SDK wired; `manifest.json`, the `notes.ts` adapter, and `index.ts`
  built against the verified SDK API. ([extensions-sdk.md](extensions-sdk.md))
- `@sulion-ableton/test-host` fake Extension Host; `send-to-sulion` driven end-to-end
  through it; `npm run dev:harness`.
- Error UX: clean cancel, actionable failure status, 401 re-pair retry.

## Phase 1 — Migrate the transport to MIDI files — DONE

Moved the shared layer and `send-to-sulion` off the dead notes-JSON endpoint onto the
generic file upload.

- [x] Wrote the file-API spec for the Sulion agent (`../sulion/docs/ableton-file-contract.md`);
  updated [sulion-api.md](sulion-api.md) to the file contract. Conventions: `SULION_REPO`
  env (default `ableton`) + `clips/<name>.mid`; proposed `GET /api/repos/:name/raw?path=`
  for the Phase 2 download.
- [x] Added `@tonejs/midi`; `toMidiFile` / `fromMidiFile` in `shared` (canonical notes ↔
  `.mid` bytes). A `.mid` carries pitch/start/duration/velocity + tempo; `muted`/
  `probability` are dropped.
- [x] Replaced `ingestClip` with `uploadFile` (`POST /api/repos/:name/ingest?path=`, raw
  bytes); added `repo` to config.
- [x] Migrated `send-to-sulion` `capture.ts` to encode + upload; rewrote the transport
  tests to assert the uploaded `.mid` decodes to the expected notes. `typecheck` + `test`
  + `build` green.

## Phase 2 — More extensions (file model, harness-tested)

Each lands as `packages/<name>/` with a thin SDK-facing `index.ts`, host-agnostic logic,
fake-host coverage, and a green `build`.

- [ ] **Pull a Sulion clip back into Live** — needs the specced device-authed download, a
  `fromMidiFile` decode, and fake-host write support (`createMidiClip` / set `notes`).
  **[decision]** how the source clip is chosen (no text-input UI).
- [ ] **Sync tempo / markers** — encode `song.tempo` + cue points as tempo/marker meta in
  a `.mid`; pull reads them back via `createCuePoint`.
  **[decision]** trigger scope (no `Song` scope exists) and push-only vs push+pull.
- [ ] **Send arrangement selection** — `MidiTrack.ArrangementSelection` scope: encode the
  in-range arrangement notes to a `.mid` and upload.
  **[decision]** device-parameter automation is lossy as MIDI — notes-only first,
  automation a later item.

## Phase 3 — DX + CI

- [ ] eslint + `npm run lint` (mirror the SDK's eslint config).
- [ ] GitHub Actions on Node 24: `typecheck` + `test` + `build` + `lint`.
- [ ] `npm run package` per extension (`extensions-cli package` → `.ablx`); confirm the
  archive builds in CI.

## Phase 4 — Feature-complete gate

- [ ] All extensions built, unit-tested, fake-host-tested; `typecheck`/`test`/`build`/
  `lint` green; `.ablx` archives build.
- [ ] Review each extension's manifest, entry, and context-menu scope against the SDK
  reference.
- [ ] Assemble the Phase 5 checklist from each extension's intended behavior.

## Phase 5 — Live verification (one pass, on the Ableton machine)

Install Live 12.4.5 + Node 24, set `EXTENSION_HOST_PATH`, `extensions-cli run` each
extension, and walk the checklist once:

- [ ] First-run pairing from inside Live (browser opens, approve, token cached in
  `environment.storageDirectory`).
- [ ] `send-to-sulion`: right-click a MIDI clip → renders a `.mid` → uploads; status
  shows success.
- [ ] 401 re-pair: revoke the token, re-run, confirm re-pair + success.
- [ ] Round-trip fidelity against a real Live clip (pitch / timing / velocity).
- [ ] Pull-back, tempo/markers, and arrangement extensions each exercised.
- [ ] Progress + error UX in the real dialog (cancel, network down).
- [ ] Log host-only surprises; fix, rebuild, re-verify the affected extension.
