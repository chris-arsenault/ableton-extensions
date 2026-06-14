# Backlog — ordered milestones

Future-state work for a dedicated agent. Roughly ordered; each milestone should
leave `npm run typecheck` and `npm test` green.

## M0 — Toolchain up (no SDK needed)

- [ ] `nvm use` (Node 24.16.0), `npm install`.
- [ ] Confirm `npm run typecheck` and `npm test` pass on the scaffold as-is.
- [ ] Confirm `npm run build` produces `packages/send-to-sulion/dist/index.js` (the SDK-facing stub won't *run* in Live yet, but it should bundle).

## M1 — Pin the SDK reality (unblocks everything SDK-facing) — DONE

Source of truth: the vendored beta bundle (`extensions-sdk-1.0.0-beta.0.zip` →
`vendor/@ableton-extensions/{sdk,cli}`). See [extensions-sdk.md](extensions-sdk.md).

- [x] Vendored the Extensions SDK + CLI tgz; wired `@ableton-extensions/sdk` into `send-to-sulion` via `file:`.
- [x] Rewrote `packages/send-to-sulion/src/index.ts` against the real API: `activate`/`initialize`, `registerCommand` + `registerContextMenuAction("MidiClip", …)`, `getObjectFromHandle(handle, MidiClip)`, `clip.notes`, `withinProgressDialog`.
- [x] Fixed `RawSdkNote` + `fromSdkNote` in `shared/src/notes.ts` to the real `NoteDescription` shape (`startTime`/`muted`/optional velocity); extended the test.
- [x] Replaced `manifest.json` with the real schema (`name`/`author`/`entry`/`version`/`minimumApiVersion`).
- [x] **Filesystem-sandbox question resolved:** not sandboxed; credentials default to `environment.storageDirectory`. The fallback is dropped.
- [x] Updated the "verified vs. not" table in [extensions-sdk.md](extensions-sdk.md) and the browser-open path in [auth.md](auth.md).
- [x] `typecheck` + `test` + `build` green; the bundle is a single CJS `dist/index.js` exporting `activate`.

Not doable on this dev host (needs Live 12.4.5 + Node 24): actually loading the
built extension via `extensions-cli run` (`EXTENSION_HOST_PATH`). That belongs to M3.

## M2 — Sulion backend endpoints (in the `../sulion` repo) — mostly DONE

Built to [sulion-api.md](sulion-api.md) (`backend/src/api/device_routes.rs`,
`midi_routes.rs`, migration `0052`, tests `device_integration.rs`):

- [x] `POST /api/devices/pair` + `POST /api/devices/pair/token` (public device-auth).
- [x] `POST /api/devices/pair/approve` (Cognito-authenticated) binding the pairing to the logged-in user.
- [x] `POST /api/midi/ingest` (device-token auth) — stored in the new `midi_clips` table (JSONB notes).
- [x] Device-token issuance + revocation model (`device_tokens.revoked_at`; only hashes stored).
- [ ] **Frontend `/pair` approval page** (React SPA) — reads `?code=`, calls `/api/devices/pair/approve`. The only remaining piece for an end-to-end browser flow.
- [ ] (Optional) relate device tokens to the existing secret broker / a device-list UI for revocation.

## M3 — End-to-end send-to-sulion

- [ ] First-run pairing works from inside Live (or via the sandbox fallback).
- [ ] Select a clip → "Send to Sulion" → notes appear in Sulion; status shows note count.
- [ ] `401` re-pair path verified (revoke token, re-run).
- [ ] Round-trip fidelity check: pitches/timing/velocity match the Live clip.

## M4 — Hardening + DX

- [ ] Add a linter (eslint) and wire `npm run lint`.
- [ ] CI (GitHub Actions): Node 24, `typecheck` + `test` + `build`. Note Live-dependent steps can't run in CI.
- [ ] Error UX in the progress dialog (network down, no Sulion, cancelled).
- [ ] A `dev` harness that exercises `capture.ts` against a local Sulion without Live (fake clip JSON in → ingest).

## Later — more extensions

The shared library (auth + Sulion client + note types) is the reuse surface. Candidate next extensions: pull a Sulion-generated clip *back* into Live, sync tempo/markers, send arrangement/automation. Add each as `packages/<name>/`.
