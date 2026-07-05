/**
 * Dependency-free Prometheus metrics.
 *
 * A tiny in-process registry that implements just enough of the Prometheus
 * client surface for this service: a labelled counter, a labelled histogram
 * with fixed buckets, and a couple of process gauges. We deliberately avoid
 * pulling in `prom-client` to keep the dependency tree small and the exposition
 * format fully under our control.
 *
 * Output conforms to the Prometheus text exposition format v0.0.4:
 *   https://github.com/prometheus/docs/blob/main/content/docs/instrumenting/exposition_formats.md
 */

export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

type Labels = Record<string, string>;

/** Escape a label value per the exposition format (\\, \n, and "). */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

/** Serialize a label set into the `{a="1",b="2"}` form (sorted for stable output). */
function renderLabels(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) {
    return "";
  }
  const parts = keys.map(
    (key) => `${key}="${escapeLabelValue(labels[key] ?? "")}"`,
  );
  return `{${parts.join(",")}}`;
}

/** Stable key for a label set, used to dedupe series within a metric. */
function seriesKey(labels: Labels): string {
  return renderLabels(labels);
}

/** A monotonically increasing counter with a fixed label schema. */
class Counter {
  readonly name: string;
  readonly help: string;
  private readonly series = new Map<
    string,
    { labels: Labels; value: number }
  >();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: Labels = {}, amount = 1): void {
    const key = seriesKey(labels);
    const existing = this.series.get(key);
    if (existing) {
      existing.value += amount;
    } else {
      this.series.set(key, { labels, value: amount });
    }
  }

  render(): string {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    // Always emit at least a zero series so scrapers see the metric exists.
    if (this.series.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const { labels, value } of this.series.values()) {
        lines.push(`${this.name}${renderLabels(labels)} ${value}`);
      }
    }
    return lines.join("\n");
  }
}

/** A histogram with fixed, shared buckets across all label sets. */
class Histogram {
  readonly name: string;
  readonly help: string;
  /** Upper bounds (inclusive), ascending. `+Inf` is appended at render time. */
  readonly buckets: number[];
  private readonly series = new Map<
    string,
    { labels: Labels; counts: number[]; sum: number; count: number }
  >();

  constructor(name: string, help: string, buckets: number[]) {
    this.name = name;
    this.help = help;
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(labels: Labels, value: number): void {
    const key = seriesKey(labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = {
        labels,
        counts: new Array(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.series.set(key, entry);
    }
    entry.sum += value;
    entry.count += 1;
    for (let i = 0; i < this.buckets.length; i += 1) {
      const bound = this.buckets[i];
      if (bound !== undefined && value <= bound) {
        entry.counts[i] = (entry.counts[i] ?? 0) + 1;
      }
    }
  }

  render(): string {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const entry of this.series.values()) {
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i += 1) {
        cumulative += entry.counts[i] ?? 0;
        const bucketLabels = { ...entry.labels, le: String(this.buckets[i]) };
        lines.push(
          `${this.name}_bucket${renderLabels(bucketLabels)} ${cumulative}`,
        );
      }
      // The +Inf bucket equals the total observation count.
      const infLabels = { ...entry.labels, le: "+Inf" };
      lines.push(
        `${this.name}_bucket${renderLabels(infLabels)} ${entry.count}`,
      );
      lines.push(`${this.name}_sum${renderLabels(entry.labels)} ${entry.sum}`);
      lines.push(
        `${this.name}_count${renderLabels(entry.labels)} ${entry.count}`,
      );
    }
    return lines.join("\n");
  }
}

/** A point-in-time value sampled at scrape time (e.g. uptime, memory). */
class Gauge {
  readonly name: string;
  readonly help: string;
  private readonly sample: () => number;

  constructor(name: string, help: string, sample: () => number) {
    this.name = name;
    this.help = help;
    this.sample = sample;
  }

  render(): string {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
      `${this.name} ${this.sample()}`,
    ].join("\n");
  }
}

/**
 * Default request-duration buckets in seconds. Tuned for a JSON API: most
 * requests should fall in the lower buckets, with headroom for slow upstreams.
 */
const DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/** The process-wide metrics registry for the API. */
export class MetricsRegistry {
  /** Count of HTTP responses, partitioned by method/route/status. */
  readonly httpRequestsTotal = new Counter(
    "http_requests_total",
    "Total number of HTTP requests handled, by method, route and status.",
  );

  /** Distribution of request durations, partitioned by method/route. */
  readonly httpRequestDuration = new Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds, by method and route.",
    DURATION_BUCKETS_SECONDS,
  );

  /** Count of unhandled/captured errors, partitioned by error kind. */
  readonly errorsTotal = new Counter(
    "errors_total",
    "Total number of captured (unhandled) errors, by kind.",
  );

  /** Distribution of selected internal operation durations. */
  readonly appOperationDuration = new Histogram(
    "app_operation_duration_seconds",
    "Internal operation duration in seconds, by low-cardinality operation name and status.",
    DURATION_BUCKETS_SECONDS,
  );

  private readonly startedAtMs = Date.now();

  private readonly gauges = [
    new Gauge(
      "process_uptime_seconds",
      "Process uptime in seconds.",
      () => (Date.now() - this.startedAtMs) / 1000,
    ),
    new Gauge(
      "process_resident_memory_bytes",
      "Resident set size of the process in bytes.",
      () => process.memoryUsage().rss,
    ),
  ];

  /** Render the full registry as Prometheus text exposition format. */
  render(): string {
    const blocks = [
      this.httpRequestsTotal.render(),
      this.httpRequestDuration.render(),
      this.errorsTotal.render(),
      this.appOperationDuration.render(),
      ...this.gauges.map((gauge) => gauge.render()),
    ];
    // Exposition format requires a trailing newline.
    return `${blocks.join("\n")}\n`;
  }

  observeOperation(
    operation: string,
    status: "success" | "error",
    startedAtMs: number,
  ): void {
    this.appOperationDuration.observe(
      { operation, status },
      (Date.now() - startedAtMs) / 1000,
    );
  }
}
