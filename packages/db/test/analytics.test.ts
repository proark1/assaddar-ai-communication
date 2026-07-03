import { describe, expect, it } from "vitest";
import { deriveQualityMetrics } from "../src";

describe("deriveQualityMetrics", () => {
  it("returns zeroed rates when there are no answer events", () => {
    const result = deriveQualityMetrics([]);
    expect(result).toEqual({
      answered: 0,
      refused: 0,
      handoff: 0,
      total: 0,
      containmentRate: 0,
      refusalRate: 0,
      handoffRate: 0,
    });
  });

  it("computes containment / refusal / handoff rates from usage events", () => {
    const result = deriveQualityMetrics([
      { eventType: "answered", total: 70 },
      { eventType: "refused", total: 20 },
      { eventType: "handoff", total: 10 },
    ]);
    expect(result).toMatchObject({
      answered: 70,
      refused: 20,
      handoff: 10,
      total: 100,
      containmentRate: 0.7,
      refusalRate: 0.2,
      handoffRate: 0.1,
    });
  });

  it("ignores non-answer event types and rounds rates to 3 decimals", () => {
    const result = deriveQualityMetrics([
      { eventType: "answered", total: 2 },
      { eventType: "refused", total: 1 },
      { eventType: "credit_topup", total: 999 },
    ]);
    expect(result.total).toBe(3);
    expect(result.containmentRate).toBe(0.667);
    expect(result.refusalRate).toBe(0.333);
    expect(result.handoff).toBe(0);
  });
});
