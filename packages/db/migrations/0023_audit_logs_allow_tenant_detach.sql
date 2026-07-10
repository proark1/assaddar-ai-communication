set search_path = public, extensions;

-- Tenant deletion must not be blocked by the append-only audit-log guard.
--
-- audit_logs.tenant_id references tenants ON DELETE SET NULL, so deleting a
-- tenant makes Postgres UPDATE that tenant's audit rows. The append-only
-- trigger from migration 0019 rejected EVERY update, so a tenant with any
-- audit history could never be deleted (the GDPR erasure path included).
--
-- Allow exactly the referential detach — tenant_id going non-null -> null with
-- every other column unchanged — and keep rejecting all other updates and all
-- deletes. Log content stays immutable; an erased tenant leaves platform-level
-- tombstone rows (tenant_id null) so the audit trail itself survives erasure.
create or replace function prevent_audit_logs_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and old.tenant_id is not null
    and new.tenant_id is null
    and to_jsonb(old) - 'tenant_id' = to_jsonb(new) - 'tenant_id'
  then
    return new;
  end if;

  raise exception 'audit_logs is append-only'
    using errcode = '2F000';
end;
$$;
