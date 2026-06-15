import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Runtime configuration for talking to a Sulion-family backend.
 *
 * Everything is resolved from the environment so an extension never hard-codes a
 * host or a credential path. In the managed Sulion PTY these come from the
 * environment; outside it, set them in your own shell.
 */
export interface SulionConfig {
  /** Base URL of the Sulion backend, e.g. "https://sulion.local" (no trailing slash). */
  baseUrl: string;
  /** Absolute path to the JSON file where the device token is cached. */
  credentialsPath: string;
  /** Sulion repo that uploaded clip files land in. Override with SULION_REPO. */
  repo: string;
}

const DEFAULT_BASE_URL = "http://localhost:8080";
const DEFAULT_REPO = "ableton";

/** Host-supplied defaults, e.g. the SDK's per-extension `environment.storageDirectory`. */
export interface ConfigDefaults {
  /**
   * Directory to cache credentials in when no env override is set. The Extensions
   * SDK exposes a dedicated persistent dir at `context.environment.storageDirectory`;
   * the SDK-facing entry point passes it here so the token lands in the host's
   * managed location instead of `~/.sulion`.
   */
  configDir?: string;
}

/** Directory holding cross-extension Sulion state. Override with SULION_CONFIG_DIR. */
export function configDir(
  env: NodeJS.ProcessEnv = process.env,
  defaults: ConfigDefaults = {},
): string {
  return env.SULION_CONFIG_DIR ?? defaults.configDir ?? join(homedir(), ".sulion");
}

export function resolveConfig(
  env: NodeJS.ProcessEnv = process.env,
  defaults: ConfigDefaults = {},
): SulionConfig {
  const baseUrl = (env.SULION_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const credentialsPath =
    env.SULION_CREDENTIALS_PATH ?? join(configDir(env, defaults), "credentials.json");
  const repo = env.SULION_REPO ?? DEFAULT_REPO;
  return { baseUrl, credentialsPath, repo };
}
