import { describe, expect, it } from "vitest";
import { buildServer, type PlatformStore } from "../src/server";

/**
 * Minimal store stub. The metrics tests only exercise `/health`, `/metrics`,
 * and an unmatched route, none of which touch the data store, so an empty
 * object cast to the interface is sufficient. `ping` is the only method that
 * could plausibly be hit; include it defensively.
 */
function createStubStore(): PlatformStore {
  return {
    ping: async () => true,
  } as unknown as PlatformStore;
}

describe("/metrics", () => {
  it("returns 200 with the Prometheus content-type and the expected metric names", async () => {
    const app = await buildServer({
      store: createStubStore(),
      adminToken: "test-token",
      allowedOrigins: ["*"],
    });

    // Generate some traffic so the request counter/histogram have series.
    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/health" });

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.headers["content-type"]).toContain("version=0.0.4");

    const body = response.body;
    // Metric names are present.
    expect(body).toContain("http_requests_total");
    expect(body).toContain("http_request_duration_seconds");
    expect(body).toContain("errors_total");
    expect(body).toContain("process_uptime_seconds");
    expect(body).toContain("process_resident_memory_bytes");

    // HELP/TYPE lines for the histogram and counter exist.
    expect(body).toContain("# TYPE http_requests_total counter");
    expect(body).toContain("# TYPE http_request_duration_seconds histogram");

    // Histogram components are emitted.
    expect(body).toContain("http_request_duration_seconds_bucket");
    expect(body).toContain("http_request_duration_seconds_sum");
    expect(body).toContain("http_request_duration_seconds_count");
    expect(body).toContain('le="+Inf"');

    // The /health requests were recorded using the route template, and the
    // count reflects at least the two requests we made.
    expect(body).toMatch(
      /http_requests_total\{[^}]*route="\/health"[^}]*\} [2-9]/,
    );

    // Exposition format ends with a trailing newline.
    expect(body.endsWith("\n")).toBe(true);

    await app.close();
  });

  it("labels unmatched routes without leaking the raw path", async () => {
    const app = await buildServer({
      store: createStubStore(),
      adminToken: "test-token",
      allowedOrigins: ["*"],
    });

    await app.inject({ method: "GET", url: "/no/such/route/12345" });

    const response = await app.inject({ method: "GET", url: "/metrics" });
    const body = response.body;

    // The high-cardinality raw path must not appear; it collapses to a single
    // <unmatched> series.
    expect(body).not.toContain("/no/such/route/12345");
    expect(body).toContain('route="<unmatched>"');

    await app.close();
  });
});
