# Sulion API contract

The **only** coupling between this repo and Sulion. Two concerns: device pairing
(auth) and clip transfer (file upload). These endpoints live in the **`../sulion` repo**
(Rust backend); this doc is authoritative for both sides — change it here and mirror the
handler there.

Base URL comes from `SULION_BASE_URL` (default `http://localhost:8080`). Pairing bodies
are JSON; clip transfer is a raw file upload.

## Auth model

Device-authorization ("pairing") flow — see [auth.md](auth.md) for the why. The
extension never sees a password; it gets a long-lived **device token** after the user
approves in an already-authenticated Sulion browser session. The token is sent as
`Authorization: Bearer <access_token>` on every file request.

---

## `POST /api/devices/pair`

Begin pairing. No auth.

**Request**
```json
{ "client": "ableton-extensions" }
```

**Response `200`**
```json
{
  "device_code": "opaque-server-secret",
  "user_code": "WXYZ-1234",
  "verification_uri": "https://sulion.local/pair",
  "verification_uri_complete": "https://sulion.local/pair?code=WXYZ-1234",
  "expires_in": 900,
  "interval": 2
}
```
- `device_code` — secret the client polls with; never shown to the user.
- `user_code` — short code shown in the progress dialog so the user can confirm a match.
- `verification_uri_complete` — opened in the browser for one-click approval (falls back to `verification_uri`).
- `expires_in` / `interval` — seconds; the client honors whatever the server returns.

## `POST /api/devices/pair/token`

Poll for the result. No auth (the `device_code` is the secret).

**Request**
```json
{ "device_code": "opaque-server-secret" }
```

**Responses**
- `428 Precondition Required` — authorization pending; the user hasn't approved yet. Keep polling at `interval`.
- `200 OK` — approved; token minted exactly once:
  ```json
  { "access_token": "tok_…", "token_type": "Bearer" }
  ```
  Device tokens are **non-expiring and revocable**, so `expires_in` is omitted (the
  client caches no `expiresAt`). Revocation yields `401` on the next file request and the
  client re-pairs.
- `410 Gone` — `device_code` unknown, expired, already claimed, or denied. The client restarts pairing.

## `POST /api/devices/pair/approve`

The browser approval step. **Auth: Cognito JWT** (the normal logged-in Sulion session).
Not called by the extension — called by the frontend `/pair` page
(`frontend/src/components/PairPage.tsx` in `../sulion`), which reads `?code=` and posts
the `user_code` with the user's bearer.

**Request**
```json
{ "user_code": "WXYZ-1234" }
```

**Responses**
- `200 OK` — `{ "status": "approved", "client": "ableton-extensions", "user_code": "WXYZ-1234" }`. Idempotent.
- `404 Not Found` — no pairing with that `user_code`.
- `400 Bad Request` — pairing expired, already used, or denied.

Approval binds the pairing to the caller's account; the token is minted later, at poll
time.

---

## `POST /api/repos/:name/ingest?path=<repo-relative-path>`

Upload a clip as a file. **Auth: `Authorization: Bearer <access_token>`** (device token).
The extension renders the selected clip to a Standard MIDI File and uploads the raw bytes.

**Request**
- Path params: `:name` — target repo (from `SULION_REPO`).
- Query: `path` — repo-relative destination, e.g. `clips/verse.mid`. Leading/trailing
  slashes trimmed; no `..` or absolute paths.
- Headers: `Content-Type: application/octet-stream`.
- Body: raw file bytes (the `.mid`). Limit **50 MiB**.

**Responses**
- `200 OK` — `{ "path": "clips/verse.mid", "bytes": 4096 }` (normalized path written, byte count).
- `400 Bad Request` — `{ "error": "<message>" }` — empty/invalid path, path traversal, or too large.
- `401 Unauthorized` — token missing/expired/revoked. The client drops the cached token and re-pairs (handled in `capture.ts`).

Source in `../sulion`: `backend/src/api/repo_routes.rs` (`post_repo_ingest`,
`IngestQuery`, `IngestResponse`), wired in `backend/src/api/mod.rs`, covered by
`backend/tests/device_integration.rs`.

## `GET /api/repos/:name/raw?path=<repo-relative-path>`

Download a file. **Auth: `Authorization: Bearer <access_token>`** (device token). Used to
pull a `.mid` back into Live.

**Responses**
- `200 OK` — the raw file bytes, `Content-Type: application/octet-stream`.
- `400 Bad Request` — empty/invalid path or traversal.
- `401 Unauthorized` — token missing/expired/revoked (client re-pairs).
- `404 Not Found` — no file (or non-file) at `path`.

Source in `../sulion`: `backend/src/api/repo_routes.rs` (`get_repo_raw`, `RawQuery`).
The shared file-contract spec lives at `../sulion/docs/ableton-file-contract.md`.

## Note shape

The canonical in-memory note (`SulionNote` / `SulionClipPayload`) lives in
`shared/src/notes.ts`. The wire format is the uploaded `.mid`: it carries pitch / start /
duration / velocity, plus tempo and markers; it does not carry `muted` or `probability`.
