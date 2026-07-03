/**
 * Pure evaluation of whether Postgres row-level security is actually enforced
 * for the role the application connects as. Kept side-effect free so it can be
 * unit-tested without a live database; the SQL that gathers the facts lives in
 * check.ts.
 *
 * RLS is silently INERT for a role when any of these hold:
 *  - the role is a superuser (superusers always bypass RLS), or
 *  - the role has the BYPASSRLS attribute, or
 *  - the role owns the tenant tables and FORCE ROW LEVEL SECURITY is not set
 *    (a table's owner is exempt from its own RLS policies unless forced).
 *
 * The app's primary tenant isolation is the repository's explicit tenant_id
 * predicates; RLS is the database-level backstop. This check surfaces when that
 * backstop is doing nothing so it is a conscious choice, not a silent gap.
 */
export type RoleRlsFacts = {
  isSuperuser: boolean;
  hasBypassRls: boolean;
  ownsTenantTables: boolean;
  forceEnabledOnTenantTables: boolean;
  rowSecurityEnabledOnTenantTables: boolean;
};

export type RlsEffectivenessResult = {
  effective: boolean;
  reasons: string[];
};

export function evaluateRlsEffectiveness(
  facts: RoleRlsFacts,
): RlsEffectivenessResult {
  const reasons: string[] = [];
  if (!facts.rowSecurityEnabledOnTenantTables) {
    reasons.push("row level security is not enabled on the tenant tables");
  }
  if (facts.isSuperuser) {
    reasons.push("the connecting role is a superuser (superusers bypass RLS)");
  }
  if (facts.hasBypassRls) {
    reasons.push("the connecting role has the BYPASSRLS attribute");
  }
  if (facts.ownsTenantTables && !facts.forceEnabledOnTenantTables) {
    reasons.push(
      "the connecting role owns the tenant tables and FORCE ROW LEVEL " +
        "SECURITY is not set (a table owner bypasses its own RLS unless forced)",
    );
  }
  return { effective: reasons.length === 0, reasons };
}

/**
 * A representative set of tenant-scoped tables that must carry a tenant
 * isolation policy. Used by the check to sample ownership/force state.
 */
export const SAMPLE_TENANT_TABLES = [
  "conversations",
  "messages",
  "contacts",
  "message_deliveries",
] as const;
