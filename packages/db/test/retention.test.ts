import { describe, expect, it } from "vitest";
import { retentionCutoff } from "../src";

const NOW = new Date("2026-06-27T12:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("retentionCutoff", () => {
  it("returns now minus retentionDays for a valid window", () => {
    const cutoff = retentionCutoff(30, NOW);
    expect(cutoff).not.toBeNull();
    expect(cutoff?.getTime()).toBe(NOW.getTime() - 30 * MS_PER_DAY);
  });

  it("computes a one-day window correctly", () => {
    const cutoff = retentionCutoff(1, NOW);
    expect(cutoff?.toISOString()).toBe("2026-06-26T12:00:00.000Z");
  });

  it("returns null (delete nothing) for non-positive windows", () => {
    expect(retentionCutoff(0, NOW)).toBeNull();
    expect(retentionCutoff(-5, NOW)).toBeNull();
  });

  it("returns null for missing or invalid values", () => {
    expect(retentionCutoff(undefined, NOW)).toBeNull();
    expect(retentionCutoff(null, NOW)).toBeNull();
    expect(retentionCutoff(Number.NaN, NOW)).toBeNull();
    // Non-integer day counts are rejected — retention is whole days only.
    expect(retentionCutoff(1.5, NOW)).toBeNull();
  });

  it("defaults `now` to the current time when omitted", () => {
    const before = Date.now();
    const cutoff = retentionCutoff(10);
    const after = Date.now();
    expect(cutoff).not.toBeNull();
    const cutoffMs = cutoff!.getTime();
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 10 * MS_PER_DAY);
    expect(cutoffMs).toBeLessThanOrEqual(after - 10 * MS_PER_DAY);
  });
});
