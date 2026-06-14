# Sulion API contract

The **only** coupling between this repo and Sulion. Two concerns: device pairing
(auth) and clip ingest. These endpoints live in the **`../sulion` repo** (Rust
backend); this doc is authoritative for both sides — change it here and mirror the
handler there.

Base URL comes from `SULION_BASE_URL` (default `http://localhost:8080`). All bodies are JSON.

> Status: **implemented.** The three device endpoints below plus `/api/midi/ingest`
> exist in the `../sulion` repo (`backend/src/api/device_routes.rs`, `midi_routes.rs`,
> migration `0052_device_pairing_and_midi_ingest.sql`, tests
> `device_integration.rs`), and the browser approval page is built
> (`frontend/src/components/PairPage.tsx`, `PairPage.test.tsx`). The whole pairing +
> ingest loop is wired end to end on the Sulion side.

## Auth model

Device-authorization ("pairing") flow — see [auth.md](auth.md) for the why. The
extension never sees a password; it gets a long-lived **device token** after the
user approves in an already-authenticated Sulion browser session.

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
  "expires_in": 300,
  "interval": 2
}
```
- `device_code` — secret the client polls with; never shown to the user.
- `user_code` — short code shown in the progress dialog so the user can confirm a match.
- `verification_uri_complete` — opened in the browser for one-click approval (falls back to `verification_uri`).
- `interval` — seconds the client must wait between token polls.

## `POST /api/devices/pair/token`

Poll for the result. No auth (the `device_code` is the secret).

**Request**
```json
{ "device_code": "opaque-server-secret" }
```

**Responses**
- `428 Precondition Required` — **authorization pending**; user hasn't approved yet. Client keeps polling at `interval`.
- `200 OK` — approved; token minted exactly once:
  ```json
  { "access_token": "tok_…", "token_type": "Bearer" }
  ```
  The backend issues **non-expiring, revocable** device tokens, so it omits
  `expires_in` (the client handles its absence — no `expiresAt` is cached).
  Revocation is via `device_tokens.revoked_at`; a revoked token yields `401` at
  ingest and the client re-pairs.
- `410 Gone` — `device_code` unknown, expired, already claimed, or denied. The
  token is minted on the **first** successful poll and the pairing flips to
  `claimed`, so a second poll of the same `device_code` returns `410`. Client
  restarts pairing.

## `POST /api/devices/pair/approve`

The browser approval step. **Auth: Cognito JWT** (the normal logged-in Sulion
session) — runs through the same `require_http_auth` middleware as the rest of the
app, so the backend captures *which user* approved. Not called by the extension;
called by the frontend `/pair` page.

**Request**
```json
{ "user_code": "WXYZ-1234" }
```
`user_code` is matched case-insensitively (trimmed + upper-cased server-side).

**Responses**
- `200 OK` — `{ "status": "approved", "client": "ableton-extensions", "user_code": "WXYZ-1234" }`. Idempotent: re-approving an already-approved pairing returns `200`.
- `404 Not Found` — no pairing with that `user_code`.
- `400 Bad Request` — pairing expired, already used (`claimed`), or denied.

Approval sets the pairing to `approved` and binds it to the caller's `sub`; the
token itself is minted later, at poll time (so plaintext is never stored on the
pairing). When backend auth is disabled (local dev / tests) the caller is the
synthetic `dev` user.

### Frontend `/pair` page — built

`SULION_PUBLIC_URL` (backend env, default `http://localhost:5173`) determines the
`verification_uri` returned by pair-start. The SPA route `/pair?code=WXYZ-1234`
(`frontend/src/components/PairPage.tsx` in the `../sulion` repo) reads `code` from
the query, lets the logged-in user confirm it, and `POST`s to
`/api/devices/pair/approve` via the shared `authFetch` (which attaches their
Cognito bearer). It's rendered inside the app's `AuthGate`, so an unauthenticated
visitor logs in first; on success it shows which `client` was approved. Hard loads
of `/pair` resolve via the nginx SPA fallback. Covered by `PairPage.test.tsx`.

---

## `POST /api/midi/ingest`

Send a captured clip. **Auth: `Authorization: Bearer <access_token>`.**

**Request**
```json
{
  "source": "ableton",
  "name": "Verse bassline",
  "tempo": 120,
  "lengthBeats": 16,
  "timeSignature": { "numerator": 4, "denominator": 4 },
  "notes": [
    { "pitch": 36, "start": 0,   "duration": 0.5, "velocity": 100, "muted": false },
    { "pitch": 36, "start": 1.0, "duration": 0.5, "velocity": 90 }
  ]
}
```
Note units: `start`/`duration`/`lengthBeats` in **beats**; `pitch` 0–127 (60 = middle C); `velocity` 1–127. `tempo`, `lengthBeats`, `timeSignature`, `name` optional. Field definitions live in `shared/src/notes.ts` (`SulionNote` / `SulionClipPayload`) — keep them in sync.

**Responses**
- `200 OK` — `{ "ingest_id": "…", "note_count": 2 }`
- `401 Unauthorized` — token missing/expired/revoked. Client drops the cached token and re-pairs (handled in `capture.ts`).

## Open design questions for the Sulion side

- Where do ingested clips land — a new table, the retrieval store, or a dedicated MIDI store? (Sulion repo decision.)
- Token storage/revocation model and how device tokens relate to the existing secret broker.
- Rate limiting / max notes per request.
