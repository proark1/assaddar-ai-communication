-- listHandoffs orders by created_at desc, but handoff_requests was only indexed
-- on (tenant_id, status). Add a tenant-scoped index that matches the ordering so
-- the list/pagination query can use the index instead of a sort.
create index if not exists handoff_requests_tenant_created_idx
  on handoff_requests (tenant_id, created_at desc);
