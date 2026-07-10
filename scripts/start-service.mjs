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

// Services that apply pending database migrations before they start. This runs
// inside Railway, where the internal DATABASE_URL (postgres.railway.internal)
// resolves — a migration launched from an external CI runner cannot reach that
// host. The migration runner takes an advisory lock so multiple instances
// serialize safely, and only the API owns this so exactly one service migrates
// per deploy; a failed migration refuses to start rather than serve a stale
// schema.
const MIGRATE_BEFORE_START = new Set(["api"]);

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

if (service && MIGRATE_BEFORE_START.has(service)) {
  await runMigrations();
}

startService(command);

function runMigrations() {
  return new Promise((resolve) => {
    console.log("Applying database migrations before starting the service...");
    const migrate = spawn("pnpm", ["--filter", "@assaddar/db", "migrate"], {
      stdio: "inherit",
      env: process.env,
    });

    migrate.on("error", (error) => {
      console.error("Failed to launch database migrations:", error);
      process.exit(1);
    });

    migrate.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code && code !== 0) {
        console.error(
          `Database migrations failed (exit ${code}); refusing to start.`,
        );
        process.exit(code);
      }
      resolve();
    });
  });
}

function startService([bin, args]) {
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
}

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
