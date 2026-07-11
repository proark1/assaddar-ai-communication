/**
 * Liveness endpoint for the admin service, probed by the container
 * healthcheck (scripts/healthcheck.mjs). Forced dynamic so every request is
 * answered by the live Next.js server rather than a prerendered response.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", service: "admin" });
}
