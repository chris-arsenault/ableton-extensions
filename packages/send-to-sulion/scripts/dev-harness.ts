/**
 * Human-run dev harness: fire send-to-sulion against a local Sulion without Live.
 *
 *   SULION_BASE_URL=http://localhost:8080 npm run dev:harness
 *   SULION_BASE_URL=http://localhost:8080 npm run dev:harness ./my-clip.json
 *
 * Uses the real `fetch` and a persistent storage dir (default ~/.sulion), so the
 * first run performs real browser pairing and caches the token for later runs.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runHarness, type HarnessFixture } from "./harness.js";

const fixturePath =
  process.argv[2] ?? fileURLToPath(new URL("../fixtures/example-clip.json", import.meta.url));

const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as HarnessFixture;
const storageDirectory = process.env.SULION_CONFIG_DIR ?? join(homedir(), ".sulion");

const statuses = await runHarness({ fixture, storageDirectory });
for (const line of statuses) console.log(line);
