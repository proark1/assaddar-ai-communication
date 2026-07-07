set search_path = public, extensions;

-- Webhook idempotency must be tenant-scoped. The previous unique index on
-- (channel, provider_event_id) was global, so a provider_event_id that collided
-- across tenants silently swallowed tenant B's genuine inbound event as a
-- duplicate of tenant A's (and returned A's row). Re-key uniqueness on
-- (tenant_id, channel, provider_event_id).
--
-- Null-tenant platform rows are intentionally not deduped by this index
-- (Postgres treats NULL as distinct), which matches recordChannelWebhookEvent:
-- inbound events resolve their tenant before recording, so the dedup path only
-- runs with a non-null tenant_id.
drop index if exists channel_webhook_events_provider_event_idx;

create unique index if not exists channel_webhook_events_tenant_event_idx
  on channel_webhook_events (tenant_id, channel, provider_event_id);
