import { createServer, type Server } from "node:http";

/**
 * Minimal liveness listener for the workers service, which otherwise has no
 * HTTP surface. The container healthcheck (scripts/healthcheck.mjs) probes
 * `GET /health` on WORKERS_HEALTH_PORT (default 4200). Returns 200 while the
 * BullMQ worker reports running, 503 once it has stopped.
 *
 * Deliberately fail-open on startup: if the port cannot be bound the worker
 * keeps processing jobs and only the probe degrades — a liveness helper must
 * never take the service down.
 */
export function startHealthServer(options: {
  isHealthy: () => boolean;
  port?: number | undefined;
}): Server {
  const port = options.port ?? 4200;

  const server = createServer((request, response) => {
    if (
      new URL(request.url ?? "/", "http://localhost").pathname !== "/health"
    ) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    let healthy: boolean;
    try {
      healthy = options.isHealthy();
    } catch {
      healthy = false;
    }

    response.writeHead(healthy ? 200 : 503, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ status: healthy ? "ok" : "stopped" }));
  });

  server.on("error", (error) => {
    console.warn(
      `[health] liveness listener failed on port ${port}; ` +
        "the worker keeps running without it.",
      error,
    );
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[health] liveness endpoint listening on ${port}`);
  });

  return server;
}
