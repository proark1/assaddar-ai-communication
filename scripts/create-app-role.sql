-- Provision a dedicated, least-privilege application role for the API so that
-- Postgres row-level security is actually enforced (the table owner bypasses
-- RLS unless forced; a non-owner role does not).
--
-- The role:
--   * is NOT a superuser and has NOBYPASSRLS, so RLS applies to it;
--   * does NOT own the tables (the migration/owner role keeps ownership);
--   * gets only DML (select/insert/update/delete) on existing + future tables
--     and usage on sequences — enough to run the app, nothing schema-changing.
--
-- Run as the database owner/superuser, then point APP_DATABASE_URL at this role:
--   psql "$DATABASE_URL" -v app_password="'a-strong-secret'" -f scripts/create-app-role.sql
--   APP_DATABASE_URL=postgresql://assaddar_app:a-strong-secret@HOST:PORT/postgres?sslmode=require
--
-- Then enforce RLS with scripts/enable-force-rls.sql and verify with `pnpm db:check`.

set search_path = public, extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'assaddar_app') then
    execute format(
      'create role assaddar_app login nosuperuser nobypassrls password %L',
      current_setting('app_password', true)
    );
  end if;
end $$;

grant connect on database current_database() to assaddar_app;
grant usage on schema public to assaddar_app;

-- Existing objects.
grant select, insert, update, delete on all tables in schema public to assaddar_app;
grant usage, select on all sequences in schema public to assaddar_app;

-- Future objects created by the owner get the same grants automatically.
alter default privileges in schema public
  grant select, insert, update, delete on tables to assaddar_app;
alter default privileges in schema public
  grant usage, select on sequences to assaddar_app;
