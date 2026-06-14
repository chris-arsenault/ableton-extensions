# Backlog — ordered milestones

Future-state work for a dedicated agent. Roughly ordered; each milestone should
leave `npm run typecheck`, `npm test`, and `npm run build` green.

## Strategy — verification in Live is deferred to the end

Transferring a build to the Ableton machine and exercising it by hand is a heavy,
manual step, so we do it **once, when the feature set is complete** — not per
milestone. Consequences for how this backlog is ordered:

- **Every milestone except the final one is completable on a normal dev host with
  no Live install**, and must leave `typecheck` + `test` + `build` green.
- Anything whose *only* possible check is "run it inside Live" is collected into
  the **final milestone (M8)** and done in a single pass.
- To make that deferral safe rather than hopeful, we build a **fake Extensions SDK
  host** (M3) early and run the real `activate()` → capture → ingest flow against a
  local Sulion through it. That gives near-end-to-end confidence without Live, so
  M8 should hold few surprises. Treat "could a fake-host test cover this?" as the
  default question before reaching for Live.

Done so far: **M0**, **M1**.

## M0 — Toolchain up (no SDK needed) — DONE

- [x] `npm install`; `npm run typecheck` and `npm test` pass on the scaffold.
- [x] `npm run build` produces a bundled `packages/send-to-sulion/dist/index.js`.

## M1 — Pin the SDK reality (unblocks everything SDK-facing) — DONE

Source of truth: the vendored beta bundle (`extensions-sdk-1.0.0-beta.0.zip` →
`vendor/@ableton-extensions/{sdk,cli}`). See [extensions-sdk.md](extensions-sdk.md).

- [x] Vendored the Extensions SDK + CLI tgz; wired `@ableton-extensions/sdk` into `send-to-sulion` via `file:`.
- [x] Rewrote `packages/send-to-sulion/src/index.ts` against the real API: `activate`/`initialize`, `registerCommand` + `registerContextMenuAction("MidiClip", …)`, `getObjectFromHandle(handle, MidiClip)`, `clip.notes`, `withinProgressDialog`.
- [x] Fixed `RawSdkNote` + `fromSdkNote` in `shared/src/notes.ts` to the real `NoteDescription` shape (`startTime`/`muted`/optional velocity); extended the test.
- [x] Replaced `manifest.json` with the real schema (`name`/`author`/`entry`/`version`/`minimumApiVersion`).
- [x] **Filesystem-sandbox question resolved:** not sandboxed; credentials default to `environment.storageDirectory`. The fallback is dropped.
- [x] Updated [extensions-sdk.md](extensions-sdk.md) and the browser-open path in [auth.md](auth.md).
- [x] `typecheck` + `test` + `build` green; the bundle exports `activate`.

## M2 — Sulion backend + pairing page (no Live needed)

Server-side and browser-side work, verifiable in the `../sulion` repo and a browser
— Live is never in the loop here. Built to [sulion-api.md](sulion-api.md)
(`backend/src/api/device_routes.rs`, `midi_routes.rs`, migration `0052`, tests
`device_integration.rs`):

- [x] `POST /api/devices/pair` + `POST /api/devices/pair/token` (public device-auth).
- [x] `POST /api/devices/pair/approve` (Cognito-authenticated) binding the pairing to the logged-in user.
- [x] `POST /api/midi/ingest` (device-token auth) — stored in the new `midi_clips` table (JSONB notes).
- [x] Device-token issuance + revocation model (`device_tokens.revoked_at`; only hashes stored).
- [ ] **Frontend `/pair` approval page** (React SPA) — reads `?code=`, calls `/api/devices/pair/approve`. The remaining piece for the browser half of pairing.
- [ ] (Optional) device-list UI for revocation; relate device tokens to the existing secret broker.

## M3 — Fake-host harness (this is what lets us defer Live)

A test/dev double for the Extensions SDK host so the SDK-facing edge runs off-Live.
Highest priority after M2 — everything downstream leans on it.

- [ ] Build a **fake `ActivationContext`/`ExtensionContext`**: fake `Handle`s, a fake `MidiClip` backed by a `NoteDescription[]` fixture, `application.song.tempo`, `environment.storageDirectory` → a temp dir, and a `withinProgressDialog` that records status updates and can simulate cancel/abort. Keep it in a shared test-support module so every extension reuses it.
- [ ] Drive `send-to-sulion`'s real `activate()` through the fake host end-to-end: register → invoke the command with a fake clip handle → assert the captured payload and the recorded progress statuses. No SDK internals stubbed beyond the host boundary.
- [ ] Add a **local-Sulion integration path**: a script/test (gated, e.g. `SULION_BASE_URL` set) that runs the same flow against a real locally-running Sulion and asserts the clip lands in `midi_clips`. Covers the wire contract without Live.
- [ ] **Round-trip fidelity** assertions: a known `NoteDescription[]` → ingest → read back → pitches/start/duration/velocity/muted/probability match within tolerance.
- [ ] `npm run dev:harness` (or similar) wired so a human can fire the flow against local Sulion by hand.

## M4 — Error UX + edge cases (through the harness, not Live)

Exercise every failure path via the M3 fake host + a fake/erroring `fetch`:

- [ ] Empty clip (no notes) → clear status, no POST.
- [ ] Network down / Sulion unreachable → actionable status, no crash.
- [ ] User cancels mid-pairing or mid-send (abort signal) → clean stop.
- [ ] `401` re-pair path: stale token → re-pair once → retry ingest (already coded in `capture.ts`; assert it through the harness).
- [ ] Progress-dialog message copy reviewed for the real `update(text, progress?)` API (progress 0–100), including a terminal success/error state.

## M5 — More extensions (built + harness-tested, not yet run in Live)

The shared library (auth + Sulion client + note types) plus the M3 fake host are the
reuse surface. Each new extension lands as `packages/<name>/` with: a thin
SDK-facing `index.ts`, SDK-independent logic in `capture.ts`/`shared`, unit tests,
fake-host coverage, and a green `build`. **None are run in Live until M8.**

- [ ] **Pull a Sulion clip back into Live** — fetch a generated clip from Sulion, `createMidiClip` / set `MidiClip.notes`. Needs a canonical→`NoteDescription` adapter (the inverse of `fromSdkNote`) in `shared`.
- [ ] **Sync tempo / markers** — push or pull `song.tempo`, cue points (`song.cuePoints` / `createCuePoint`).
- [ ] **Send arrangement / automation** — capture an arrangement selection (`ArrangementSelection` scope) or device-parameter automation to Sulion.
- [ ] Extend [sulion-api.md](sulion-api.md) for any new endpoints and flag the matching `../sulion` change.

## M6 — DX + CI (no Live)

- [ ] Add eslint and wire `npm run lint` (the SDK ships an eslint config to mirror).
- [ ] GitHub Actions: Node 24 → `typecheck` + `test` + `build` + `lint`. Live-dependent steps stay out of CI by design.
- [ ] Wire `npm run package` per extension (`extensions-cli package` → `.ablx`) and confirm the archive builds in CI (building ≠ running, so this is CI-safe).

## M7 — Feature-complete gate (no Live)

A checkpoint, not new work: confirm the feature set is done and everything off-Live
is green before the one-time transfer.

- [ ] All planned extensions built, unit-tested, and fake-host-tested.
- [ ] `typecheck` + `test` + `build` + `lint` green; `.ablx` archives build.
- [ ] Each extension's manifest, entry, and context-menu scope reviewed against the SDK reference.
- [ ] Assemble the M8 acceptance checklist (below) from each extension's intended behavior.

## M8 — Live verification, single pass (the ONLY Live-dependent milestone)

Done once, on the Ableton machine, when M7 is green. Install Live 12.4.5 + Node 24,
set `EXTENSION_HOST_PATH`, `extensions-cli run` each extension, and walk the full
checklist for every feature in one sitting:

- [ ] First-run pairing from inside Live (browser opens, approve, token cached in `environment.storageDirectory`).
- [ ] send-to-sulion: right-click a MIDI clip → "Send to Sulion" → notes appear in Sulion; status shows the count.
- [ ] `401` re-pair: revoke the token, re-run, confirm it re-pairs and succeeds.
- [ ] Round-trip fidelity against a real Live clip (pitches/timing/velocity).
- [ ] Pull-back, tempo/markers, arrangement/automation extensions each exercised.
- [ ] Progress + error UX look right in the real dialog (cancel, network down).
- [ ] Log any host-only surprises; fix, rebuild, and re-verify just the affected feature.
