-- Idempotency for retried lead/readiness submissions. A client retry of
-- POST /widget/leads or /widget/readiness must not create duplicate handoffs.
-- Add an optional key plus a partial unique index so only one handoff exists
-- per (tenant, conversation, key). Handoffs without a key are unaffected.
alter table handoff_requests
  add column if not exists idempotency_key text;

create unique index if not exists handoff_requests_idempotency_idx
  on handoff_requests (tenant_id, conversation_id, idempotency_key)
  where idempotency_key is not null;
