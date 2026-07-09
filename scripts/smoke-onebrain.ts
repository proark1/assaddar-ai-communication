import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runOneBrainSmoke } from "../packages/core/src/onebrain-smoke.ts";

loadDotEnv();

try {
  const result = await runOneBrainSmoke(process.env);
  console.log("OneBrain smoke check passed");
  console.log(`App: ${result.expected.appId}`);
  console.log(`Purpose: ${result.expected.purpose}`);
  console.log(`Account: ${result.expected.accountId ?? "capability default"}`);
  console.log(`Space: ${result.expected.spaceId ?? "capability default"}`);
  console.log(`Capabilities tenant: ${result.capabilities.tenant_id}`);
  if (result.intake) {
    console.log(
      `Synthetic intake accepted as ${result.intake.accepted}: ${result.intake.id} (${result.intake.status})`,
    );
  } else {
    console.log("Synthetic intake skipped");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`OneBrain smoke check failed: ${message}`);
  process.exitCode = 1;
}

function loadDotEnv(path = resolve(process.cwd(), ".env")) {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = unquote(line.slice(index + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
