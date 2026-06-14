# send-to-sulion

Right-click a clip in Ableton Live → send its MIDI notes to Sulion.

## How it's structured

- `src/index.ts` — **SDK-facing stub.** The only file that touches the Extensions SDK. Translates the selected clip's notes into the canonical wire shape, then delegates. All SDK names here are placeholders (see [../../docs/extensions-sdk.md](../../docs/extensions-sdk.md)).
- `src/capture.ts` — host-agnostic orchestration: ensure auth (pair if needed) → POST clip → report progress, with a `401` re-pair retry. SDK-independent and unit-tested.
- `manifest.json` — Live extension manifest. **Schema unverified** — replace from the real beta docs.

Shared logic (auth, Sulion HTTP client, note types) lives in [`@sulion-ableton/shared`](../../shared).

## Build

```bash
nvm use            # Node 24.16.0
npm install        # from repo root (workspaces)
npm run build -w @sulion-ableton/send-to-sulion   # → dist/index.js
```

`manifest.json`'s `entry` points at `dist/index.js`. The install/sideload path into
Live's beta is TBD — see the backlog M1.

## Next steps

See [../../docs/backlog.md](../../docs/backlog.md) (M1 onward).
