set search_path = public, extensions;

-- The delivery-retry worker (apps/workers) scans message_deliveries for failed,
-- retryable rows ordered by updated_at, with NO tenant filter. The existing
-- indexes are (tenant_id, created_at) and (provider_message_id), so that
-- recurring sweep full-scans and sorts the whole all-tenant, ever-growing table.
-- A partial index on failed rows keyed by updated_at turns it into an index
-- range scan.
create index if not exists message_deliveries_retry_idx
  on message_deliveries (updated_at)
  where status = 'failed';
