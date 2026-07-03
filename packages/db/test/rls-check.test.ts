import { describe, expect, it } from "vitest";
import { evaluateRlsEffectiveness, type RoleRlsFacts } from "../src/rls-check";

const enforced: RoleRlsFacts = {
  isSuperuser: false,
  hasBypassRls: false,
  ownsTenantTables: false,
  forceEnabledOnTenantTables: false,
  rowSecurityEnabledOnTenantTables: true,
};

describe("evaluateRlsEffectiveness", () => {
  it("is effective for a non-owner, non-bypass role with RLS enabled", () => {
    const result = evaluateRlsEffectiveness(enforced);
    expect(result.effective).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("is inert when the role is a superuser", () => {
    const result = evaluateRlsEffectiveness({ ...enforced, isSuperuser: true });
    expect(result.effective).toBe(false);
    expect(result.reasons.join(" ")).toContain("superuser");
  });

  it("is inert when the role has BYPASSRLS", () => {
    const result = evaluateRlsEffectiveness({
      ...enforced,
      hasBypassRls: true,
    });
    expect(result.effective).toBe(false);
    expect(result.reasons.join(" ")).toContain("BYPASSRLS");
  });

  it("is inert when the role owns the tables and FORCE is not set", () => {
    const result = evaluateRlsEffectiveness({
      ...enforced,
      ownsTenantTables: true,
      forceEnabledOnTenantTables: false,
    });
    expect(result.effective).toBe(false);
    expect(result.reasons.join(" ")).toContain("FORCE");
  });

  it("is effective when the owner has FORCE ROW LEVEL SECURITY set", () => {
    const result = evaluateRlsEffectiveness({
      ...enforced,
      ownsTenantTables: true,
      forceEnabledOnTenantTables: true,
    });
    expect(result.effective).toBe(true);
  });

  it("is inert when row security is disabled entirely", () => {
    const result = evaluateRlsEffectiveness({
      ...enforced,
      rowSecurityEnabledOnTenantTables: false,
    });
    expect(result.effective).toBe(false);
    expect(result.reasons.join(" ")).toContain("not enabled");
  });
});
