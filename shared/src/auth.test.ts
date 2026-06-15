import { describe, expect, it, vi } from "vitest";
import {
  pollForToken,
  startPairing,
  type AuthDeps,
  type PairStartResponse,
} from "./auth.js";
import type { SulionConfig } from "./config.js";

const config: SulionConfig = {
  baseUrl: "https://sulion.test",
  credentialsPath: "/tmp/does-not-matter/credentials.json",
  repo: "ableton",
};

function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    fetch: vi.fn(),
    readFileText: vi.fn(),
    writeFileText: vi.fn(async () => {}),
    now: () => 1_000_000,
    sleep: async () => {},
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("startPairing", () => {
  it("returns the device/user codes from the backend", async () => {
    const start: PairStartResponse = {
      device_code: "dev123",
      user_code: "WXYZ-1234",
      verification_uri: "https://sulion.test/pair",
      expires_in: 300,
      interval: 1,
    };
    const deps = makeDeps({ fetch: vi.fn(async () => jsonResponse(200, start)) });
    await expect(startPairing(config, deps)).resolves.toEqual(start);
  });
});

describe("pollForToken", () => {
  const start: PairStartResponse = {
    device_code: "dev123",
    user_code: "WXYZ-1234",
    verification_uri: "https://sulion.test/pair",
    expires_in: 300,
    interval: 1,
  };

  it("retries on 428 then stores the token once approved", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(428, { error: "authorization_pending" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "tok_abc", token_type: "Bearer", expires_in: 3600 }),
      );
    const writeFileText = vi.fn(async () => {});
    const deps = makeDeps({ fetch, writeFileText });

    const creds = await pollForToken(config, start, deps);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(creds.accessToken).toBe("tok_abc");
    expect(creds.expiresAt).toBe(1_000_000 + 3600 * 1000);
    expect(writeFileText).toHaveBeenCalledOnce();
  });

  it("aborts when onTick signals cancellation", async () => {
    const deps = makeDeps({ fetch: vi.fn() });
    await expect(pollForToken(config, start, deps, () => false)).rejects.toThrow(/cancelled/);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});
