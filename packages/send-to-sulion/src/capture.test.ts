import { afterEach, describe, expect, it, vi } from "vitest";
import { captureAndSend, type ProgressHost } from "./capture.js";
import type { SulionConfig } from "@sulion-ableton/shared";

// Note: this test exercises the early-exit branch that needs no network. The
// happy path and the 401-re-pair path require mocking the shared module's HTTP
// calls — left for the dedicated agent once the API contract is locked (see
// docs/sulion-api.md). This establishes the test harness shape.

const config: SulionConfig = {
  baseUrl: "https://sulion.test",
  credentialsPath: "/tmp/sulion-test/credentials.json",
};

function host(): ProgressHost & { statuses: string[] } {
  const statuses: string[] = [];
  return {
    statuses,
    setStatus: (m) => statuses.push(m),
    isCancelled: () => false,
    openUrl: vi.fn(),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("captureAndSend", () => {
  it("short-circuits on an empty clip without touching the network", async () => {
    const h = host();
    await captureAndSend({ name: "Empty", notes: [] }, h, { config });
    expect(h.statuses).toContain("Clip has no notes");
    expect(h.openUrl).not.toHaveBeenCalled();
  });
});
