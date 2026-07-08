import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const clientRoots = ["apps/admin/app", "apps/widget/src"];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const forbiddenClientTokens = [
  "ONEBRAIN_API_BASE_URL",
  "ONEBRAIN_SERVICE_KEY",
  "/api/service/",
  "api/service/",
];

describe("OneBrain browser boundary", () => {
  it("keeps admin and widget client code behind communication APIs", () => {
    const violations: string[] = [];
    for (const root of clientRoots) {
      for (const file of listSourceFiles(join(repoRoot, root))) {
        const content = readFileSync(file, "utf8");
        for (const token of forbiddenClientTokens) {
          if (content.includes(token)) {
            violations.push(`${relative(repoRoot, file)} contains ${token}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

function listSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (sourceExtensions.has(path.slice(path.lastIndexOf(".")))) {
      files.push(path);
    }
  }
  return files;
}
