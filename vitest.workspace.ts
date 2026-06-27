import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/core/vitest.config.ts",
  "packages/db/vitest.config.ts",
  "packages/channels/vitest.config.ts",
  "apps/api/vitest.config.ts",
  "apps/workers/vitest.config.ts",
  "apps/admin/vitest.config.ts",
]);
