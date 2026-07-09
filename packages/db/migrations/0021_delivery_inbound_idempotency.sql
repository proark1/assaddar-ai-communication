set search_path = public, extensions;

-- Idempotent outbound delivery. A stable key -- for automated webhook replies,
-- the inbound provider event id -- lets deliverOutbound record the outbound
-- INTENT before it sends and skip a re-send when a delivery for the same inbound
-- event already exists. This closes the webhook-retry double-send window: if the
-- provider accepted a send but a later write failed, the provider's retry finds
-- the existing delivery and does not send the reply twice.
alter table message_deliveries
  add column if not exists idempotency_key text;

create unique index if not exists message_deliveries_idempotency_idx
  on message_deliveries (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- Idempotent inbound. Dedupe the stored customer message on the provider event
-- id so a webhook retry does not append a duplicate inbound turn.
alter table messages
  add column if not exists provider_event_id text;

create unique index if not exists messages_provider_event_idx
  on messages (tenant_id, conversation_id, provider_event_id)
  where provider_event_id is not null;
