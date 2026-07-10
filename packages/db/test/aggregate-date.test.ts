import { describe, expect, it } from "vitest";
import { toAggregateDate } from "../src/repository-helpers";

describe("toAggregateDate", () => {
  it("coerces the Postgres text form of a raw aggregate to a Date", () => {
    // Drizzle's postgres-js driver hands back this exact non-ISO text form for
    // a raw `sql`max(...)`` timestamp (space separator, "+00" offset) instead of
    // a Date. This is the value that made the OneBrain summary type lie.
    const result = toAggregateDate("2026-07-10 16:42:00.197+00");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe("2026-07-10T16:42:00.197Z");
  });

  it("passes a Date through unchanged", () => {
    const date = new Date("2026-07-10T16:42:00.197Z");
    // Same instance, so it stays correct under drivers/mocks that already map
    // the column to a Date.
    expect(toAggregateDate(date)).toBe(date);
  });

  it("returns null for null and undefined", () => {
    expect(toAggregateDate(null)).toBeNull();
    expect(toAggregateDate(undefined)).toBeNull();
  });
});
