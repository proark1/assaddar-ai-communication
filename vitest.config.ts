import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/core/vitest.config.ts",
      "packages/db/vitest.config.ts",
      "packages/channels/vitest.config.ts",
      "apps/api/vitest.config.ts",
      "apps/workers/vitest.config.ts",
      "apps/admin/vitest.config.ts",
    ],
  },
});
