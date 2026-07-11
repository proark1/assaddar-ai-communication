set search_path = public, extensions;

-- Legal hold on a tenant. While legal_hold_at is set, the tenant's data must be
-- preserved: retention pruning and every erasure path (GDPR, account closure, and
-- a remote OneBrain tombstone) refuse to delete it. This mirrors OneBrain's own
-- legal-hold precedence (legal hold > erasure > retention expiry) on the module
-- side, so a preservation duty is honored wherever data lives.

alter table tenants
  add column if not exists legal_hold_at timestamptz,
  add column if not exists legal_hold_reason text;
