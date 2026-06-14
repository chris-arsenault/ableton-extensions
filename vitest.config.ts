import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@sulion-ableton/shared": fileURLToPath(
        new URL("./shared/src/index.ts", import.meta.url),
      ),
      "@sulion-ableton/test-host": fileURLToPath(
        new URL("./packages/test-host/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["shared/**/*.test.ts", "packages/**/*.test.ts"],
    environment: "node",
  },
});
