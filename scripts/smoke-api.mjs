import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";

const rootDir = new URL("../", import.meta.url);
const serverStartupTimeoutMs = Number(
  process.env.SMOKE_STARTUP_TIMEOUT_MS ?? 30_000,
);
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 10_000);
const tenantSlug = process.env.SMOKE_TENANT_SLUG ?? "demo-business";
const smokeMessage = process.env.SMOKE_MESSAGE ?? "When are you open?";

await loadDotenvIfPresent();

const apiBaseUrl = normalizeBaseUrl(
  process.env.API_BASE_URL ??
    `http://127.0.0.1:${process.env.API_PORT ?? "4000"}`,
);
const adminToken = process.env.ADMIN_API_TOKEN;

if (!adminToken) {
  fail("ADMIN_API_TOKEN is required for the API smoke test.");
}

let child;
try {
  const alreadyRunning = await isHealthy(apiBaseUrl);
  if (!alreadyRunning) {
    child = startApi();
    await waitForHealth(apiBaseUrl, serverStartupTimeoutMs);
  }

  await smokeApi(apiBaseUrl, adminToken);
  console.log("API smoke test passed.");
} catch (error) {
  if (error instanceof SmokeError) {
    console.error(`API smoke test failed: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  if (child) {
    child.kill("SIGTERM");
    await waitForExit(child);
  }
}

async function smokeApi(baseUrl, token) {
  const health = await fetchJson(`${baseUrl}/health`);
  assert(health.ok === true, "Health endpoint did not return ok=true.");

  const tenants = await fetchJson(`${baseUrl}/admin/tenants`, {
    headers: {
      "x-admin-token": token,
    },
  });
  assert(
    Array.isArray(tenants),
    "Admin tenants endpoint did not return an array.",
  );

  const tenant = tenants.find((item) => item?.slug === tenantSlug);
  assert(
    tenant?.publicId,
    `Seed tenant "${tenantSlug}" was not found. Run pnpm db:seed before smoke testing.`,
  );

  const config = await fetchJson(`${baseUrl}/widget/config/${tenant.publicId}`);
  assert(
    config.assistantId === tenant.publicId,
    "Widget config returned the wrong assistant ID.",
  );
  assert(config.tenantName, "Widget config did not include a tenant name.");
  assert(
    config.limits?.maxMessageLength > 0,
    "Widget config did not include message limits.",
  );

  const chat = await fetchJson(`${baseUrl}/widget/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      assistantId: tenant.publicId,
      visitorId: `smoke_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      message: smokeMessage,
    }),
  });

  assert(chat.conversationId, "Widget chat did not return a conversation ID.");
  assert(
    chat.reply && typeof chat.reply === "string",
    "Widget chat did not return a text reply.",
  );

  if (tenantSlug === "demo-business") {
    assert(
      chat.reply.includes("09:00") || chat.reply.includes("18:00"),
      `Demo tenant did not answer with the seeded opening-hours FAQ. Reply: ${chat.reply}`,
    );
  }

  console.log(`  API: ${baseUrl}`);
  console.log(`  tenant: ${tenant.slug}`);
  console.log(`  assistant: ${tenant.publicId}`);
  console.log(`  chat status: ${chat.status}`);
}

function startApi() {
  const childProcess = spawn("pnpm", ["--filter", "@assaddar/api", "start"], {
    cwd: rootDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logBuffer = [];
  const collect = (chunk) => {
    logBuffer.push(chunk.toString());
    if (logBuffer.length > 20) {
      logBuffer.shift();
    }
  };
  childProcess.stdout.on("data", collect);
  childProcess.stderr.on("data", collect);
  childProcess.on("exit", (code, signal) => {
    if (code && code !== 0 && !signal) {
      console.error(logBuffer.join(""));
    }
  });
  return childProcess;
}

async function isHealthy(baseUrl) {
  try {
    const health = await fetchJson(`${baseUrl}/health`);
    return health.ok === true;
  } catch {
    return false;
  }
}

async function waitForHealth(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy(baseUrl)) {
      return;
    }
    await sleep(500);
  }
  fail(`API did not become healthy at ${baseUrl} within ${timeoutMs}ms.`);
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDotenvIfPresent() {
  let raw;
  try {
    raw = await readFile(new URL("../.env", import.meta.url), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = unquote(trimmed.slice(equalsIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function fail(message) {
  throw new SmokeError(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(childProcess) {
  return new Promise((resolve) => {
    childProcess.once("exit", resolve);
    setTimeout(resolve, 3_000);
  });
}

class SmokeError extends Error {}
