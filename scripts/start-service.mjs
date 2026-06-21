import { spawn } from "node:child_process";
import process from "node:process";

const aliases = new Map([
  ["api", ["pnpm", ["--filter", "@assaddar/api", "start"]]],
  ["admin", ["pnpm", ["--filter", "@assaddar/admin", "start"]]],
  ["widget", ["pnpm", ["--filter", "@assaddar/widget", "start"]]],
  ["voice", ["pnpm", ["--filter", "@assaddar/voice", "start"]]],
  ["workers", ["pnpm", ["--filter", "@assaddar/workers", "start"]]],
  ["worker", ["pnpm", ["--filter", "@assaddar/workers", "start"]]],
]);

const rawService =
  process.env.SERVICE ??
  process.env.RAILWAY_SERVICE_NAME ??
  process.env.npm_package_name;
const service = normalizeServiceName(rawService);
const command = service ? aliases.get(service) : undefined;

if (!command) {
  console.error(
    `Unknown SERVICE "${rawService ?? ""}". Expected one of: ${Array.from(aliases.keys()).join(", ")}`,
  );
  process.exit(1);
}

const [bin, args] = command;
const child = spawn(bin, args, {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

function normalizeServiceName(value) {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase().replace(/^@assaddar\//, "");
  if (aliases.has(normalized)) {
    return normalized;
  }

  if (normalized.includes("api")) {
    return "api";
  }
  if (normalized.includes("admin")) {
    return "admin";
  }
  if (normalized.includes("widget")) {
    return "widget";
  }
  if (normalized.includes("voice")) {
    return "voice";
  }
  if (normalized.includes("worker")) {
    return "workers";
  }

  return normalized;
}
