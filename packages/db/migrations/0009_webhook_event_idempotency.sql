set search_path = public, extensions;

-- Provider webhooks can be delivered more than once. Keep one durable row per
-- channel/provider event id so duplicate deliveries do not create duplicate
-- conversations, messages, usage events, or outbound replies.
create unique index if not exists channel_webhook_events_provider_event_idx
  on channel_webhook_events(channel, provider_event_id);
