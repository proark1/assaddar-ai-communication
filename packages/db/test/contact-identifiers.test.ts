import { describe, expect, it } from "vitest";
import {
  contactIdentifierContainmentValues,
  hasSharedIdentifier,
} from "../src/repository-helpers";

describe("contact identifier helpers", () => {
  it("detects shared channel identifiers", () => {
    expect(
      hasSharedIdentifier(
        { whatsappUserIds: ["wa-1"], websiteVisitorIds: ["visitor-1"] },
        { whatsappUserIds: ["wa-2"], websiteVisitorIds: ["visitor-1"] },
      ),
    ).toBe(true);

    expect(
      hasSharedIdentifier(
        { whatsappUserIds: ["wa-1"] },
        { whatsappUserIds: ["wa-2"] },
      ),
    ).toBe(false);
  });

  it("builds JSONB containment values for indexed lookups", () => {
    expect(
      contactIdentifierContainmentValues({
        whatsappUserIds: ["wa-1", ""],
        websiteVisitorIds: ["visitor-1"],
      }),
    ).toEqual([
      JSON.stringify({ whatsappUserIds: ["wa-1"] }),
      JSON.stringify({ websiteVisitorIds: ["visitor-1"] }),
    ]);
  });
});
