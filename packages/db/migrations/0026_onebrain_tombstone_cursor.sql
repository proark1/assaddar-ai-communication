set search_path = public, extensions;

-- The consumer position for OneBrain's erasure feed (Phase 4). One row per
-- provider holds the last tombstone `seq` this deployment has consumed; the
-- tombstone-consume worker polls forward from it, mirrors each erasure locally,
-- acks it, and advances the cursor. Deployment-global, so no tenant column.

create table if not exists onebrain_tombstone_cursor (
  provider   text primary key,
  cursor     bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
