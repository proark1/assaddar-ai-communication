import { runOneBrainSmoke } from "@assaddar/core";

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
