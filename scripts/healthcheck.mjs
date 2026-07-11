/**
 * Container healthcheck for the shared service image.
 *
 * One image serves five services (api, admin, widget, voice, workers), so the
 * probe must dispatch on the same service-role env vars that
 * `start-service.mjs` uses instead of blindly curling the API port. Each
 * branch mirrors the exact port-resolution order of the service it probes:
 *
 *   api     GET /health on API_PORT || PORT || 4000  (apps/api/src/env.ts)
 *   admin   GET /health on PORT || 3000              (next start -p ${PORT:-3000})
 *   widget  GET /health on PORT || 5174              (apps/widget/server.mjs)
 *   voice   GET /health on VOICE_PORT || PORT || 4100 (apps/voice/src/index.ts)
 *   workers GET /health on WORKERS_HEALTH_PORT || 4200 (apps/workers/src/health.ts)
 *
 * `HEALTHCHECK_URL` still overrides everything, and an unknown/unset service
 * falls back to the API URL — the exact pre-existing behaviour — so nothing
 * changes for deployments that never set SERVICE.
 */
import process from "node:process";

// Keep in sync with normalizeServiceName in scripts/start-service.mjs.
function normalizeServiceName(value) {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase().replace(/^@assaddar\//, "");
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

function defaultHealthUrl(service) {
  const env = process.env;
  switch (service) {
    case "admin":
      return `http://127.0.0.1:${env.PORT || 3000}/health`;
    case "widget":
      return `http://127.0.0.1:${env.PORT || 5174}/health`;
    case "voice":
      return `http://127.0.0.1:${env.VOICE_PORT || env.PORT || 4100}/health`;
    case "workers":
      return `http://127.0.0.1:${env.WORKERS_HEALTH_PORT || 4200}/health`;
    case "api":
    default:
      // Unknown/unset service keeps the historic API-probe behaviour.
      return `http://127.0.0.1:${env.API_PORT || env.PORT || 4000}/health`;
  }
}

const service = normalizeServiceName(
  process.env.SERVICE ??
    process.env.RAILWAY_SERVICE_NAME ??
    process.env.npm_package_name,
);

const url = process.env.HEALTHCHECK_URL || defaultHealthUrl(service);

fetch(url)
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1));
