set search_path = public, extensions;

create or replace function prevent_audit_logs_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only'
    using errcode = '2F000';
end;
$$;

drop trigger if exists audit_logs_append_only_trigger on audit_logs;

create trigger audit_logs_append_only_trigger
  before update or delete on audit_logs
  for each row
  execute function prevent_audit_logs_mutation();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'assaddar_app') then
    revoke update, delete on audit_logs from assaddar_app;
  end if;
end $$;
