# Auth design — device pairing

## Why not just paste an API key

Two SDK constraints shape this:

1. **No text-input UI.** The only confirmed UI primitive is `withinProgressDialog()` (status + cancel). There's no seen way to prompt for a key inside Live.
2. **Run-once lifecycle.** An extension has no persistent process, so there's nowhere to host a login session.

So instead of entering a secret in Live, we use the **device-authorization flow** (the same shape as TV/CLI logins): approve once in a browser where you're *already* logged into Sulion, and the extension caches the resulting token.

This also fits the broader Sulion model nicely — token minting is a sibling of the existing credential broker, and the user reuses their existing web session rather than handling raw secrets.

## Flow

```
Extension run                              Sulion backend            Browser (you, logged in)
─────────────                              ──────────────            ────────────────────────
loadCredentials() ── token cached? ──► yes ─► use it ─► POST /api/midi/ingest
        │ no
        ▼
POST /api/devices/pair  ──────────────►  mint device_code+user_code
        │  ◄──────────────────────────  { user_code, verification_uri_complete, interval, … }
        ▼
openUrl(verification_uri_complete) ───────────────────────────────►  /pair?code=… approval page
setStatus("Approve in browser (code WXYZ-1234)…")                    user clicks Approve
        │                                          mark device_code approved, mint token
        ▼  (poll every `interval`s)
POST /api/devices/pair/token ─────────►  428 pending… then 200 { access_token }
        │  ◄──────────────────────────
        ▼
saveCredentials()  →  ~/.sulion/credentials.json (mode 0600)
        ▼
POST /api/midi/ingest  (Bearer token)
```

On a later run the cached token is used directly. On `401`, `capture.ts` drops the
token and re-runs pairing once, then retries the ingest.

## Where it lives in code

- `shared/src/auth.ts` — `startPairing`, `pollForToken`, `loadCredentials`, `saveCredentials`. Network/fs/clock are injected via `AuthDeps` for testing.
- `packages/send-to-sulion/src/capture.ts` — `runPairing` / `ensureCredentials` orchestration + the 401-retry.
- Wire contract: [sulion-api.md](sulion-api.md).

## Opening the browser

The SDK has **no browser-open primitive** (confirmed against the beta bundle). The
extension edge (`packages/send-to-sulion/src/index.ts`) launches the system browser
via `node:child_process` — `open` (macOS), `start` (Windows), `xdg-open` (Linux) —
which the full Node runtime allows. `capture.ts` stays host-agnostic: it calls
`host.openUrl(url)`, and `index.ts` supplies that.

> Alternative for later: `ui.showModalDialog(url, w, h)` can host the `/pair` page in
> an in-Live webview and receive the token back via `postMessage` (`close_and_send`),
> avoiding the external browser entirely. Not wired up yet.

## Token storage

By default the token is cached in the SDK's per-extension
`environment.storageDirectory` (passed into `resolveConfig` by `index.ts`), written
`0600`. `SULION_CONFIG_DIR` / `SULION_CREDENTIALS_PATH` override the location; outside
Live (tests, the future dev harness) it falls back to `~/.sulion/credentials.json`.
The file is gitignored either way.

## Filesystem is not sandboxed — settled

The token-on-disk cache assumed Node `fs` would be available; the beta bundle confirms
it is — full `node:fs`, plus the managed `environment.storageDirectory` above. The
localhost-listener / server-side-session fallbacks once sketched here are **not needed**
and have been dropped. The contract in [sulion-api.md](sulion-api.md) is unchanged.

## Security notes

- `device_code` is a server secret; never display it. Show only `user_code` so the user can confirm the request matches.
- Bind the minted token to the approving Sulion user account, server-side, on the `/pair` approval.
- Support revocation (a device list in Sulion). Client treats `401` as "re-pair".
