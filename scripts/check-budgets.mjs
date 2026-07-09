import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const budgets = [
  {
    name: "widget raw bundle",
    value: fileSize("apps/widget/dist/widget.js"),
    max: 45 * 1024,
    unit: "bytes",
  },
  {
    name: "widget gzip bundle",
    value: gzipSize("apps/widget/dist/widget.js"),
    max: 12 * 1024,
    unit: "bytes",
  },
  {
    name: "admin static assets",
    value: directorySize("apps/admin/.next/static"),
    max: 1_400_000,
    unit: "bytes",
  },
  {
    name: "admin page.tsx lines",
    value: lineCount("apps/admin/app/page.tsx"),
    // Raised for the 2026-07-09 OneBrain release train; keep decomposing
    // admin panels into smaller surfaces before increasing this again.
    max: 11_000,
    unit: "lines",
  },
  {
    name: "api server.ts lines",
    value: lineCount("apps/api/src/server.ts"),
    // Raised for OneBrain-first playbook, portal, consent, and bulk-knowledge
    // routes. Next growth should move route groups into dedicated modules.
    max: 8_600,
    unit: "lines",
  },
  {
    name: "db repository.ts lines",
    value: lineCount("packages/db/src/repository.ts"),
    // Raised for portal projection repository methods (and the webhook
    // idempotency claim/finalize data methods); keep future data-layer growth in
    // focused repositories instead of this shared file.
    max: 6_650,
    unit: "lines",
  },
];

const failures = [];

for (const budget of budgets) {
  const formatted = `${budget.value.toLocaleString()} / ${budget.max.toLocaleString()} ${budget.unit}`;
  if (budget.value > budget.max) {
    failures.push(`${budget.name}: ${formatted}`);
    console.error(`FAIL ${budget.name}: ${formatted}`);
  } else {
    console.log(`PASS ${budget.name}: ${formatted}`);
  }
}

if (failures.length > 0) {
  console.error(
    [
      "",
      "Quality budget exceeded.",
      "If the growth is intentional, split the affected surface first or raise the budget with a note in the PR.",
    ].join("\n"),
  );
  process.exit(1);
}

function fileSize(relativePath) {
  return statSync(join(root, relativePath)).size;
}

function gzipSize(relativePath) {
  return gzipSync(readFileSync(join(root, relativePath))).length;
}

function lineCount(relativePath) {
  const text = readFileSync(join(root, relativePath), "utf8");
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

function directorySize(relativePath) {
  const absolutePath = join(root, relativePath);
  let total = 0;
  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    const child = join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(join(relativePath, entry.name));
    } else if (entry.isFile()) {
      total += statSync(child).size;
    }
  }
  return total;
}
