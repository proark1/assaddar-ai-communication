# Integration Notes

Credential-dependent integrations are intentionally adapter-backed and conservative in this MVP.

## Website

- Public config endpoint: `GET /widget/config/{assistantId}`
- Chat endpoint: `POST /widget/chat`
- Widget isolation: Shadow DOM
- Conversation continuity: browser `localStorage` public conversation ID
- Public IDs: `asst_...` values do not expose internal tenant UUIDs

## WhatsApp Business

Adapter: `WhatsAppCloudAdapter`

Current foundation:

- Meta webhook verification using `hub.mode`, `hub.verify_token`, and `hub.challenge`
- Incoming payload normalization for text messages
- Outgoing sender is credential-gated until `WHATSAPP_ACCESS_TOKEN` and phone number mapping are configured
- Tenant-level template storage for draft/submitted/approved/rejected WhatsApp templates
- Compliance endpoint showing the last inbound message, 24-hour freeform reply window, template counts, and recent delivery outcomes
- Provider delivery outcomes are recorded for troubleshooting and future retries
- Customer-service messaging-window enforcement is surfaced in the admin UI; hard blocking before production sending is still required

Official docs checked:

- [Meta WhatsApp webhook endpoint setup](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/)
- [Meta WhatsApp webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/)

## Instagram And Facebook Messenger

Adapter: `MetaMessengerAdapter`

Current foundation:

- Shared Meta webhook verification
- Incoming text normalization for `messaging` payloads
- 24-hour response window awareness represented as policy metadata
- Outgoing sender is credential-gated until page/account connection mapping is configured

Official docs checked:

- [Meta Messenger Platform webhooks](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks)
- [Meta Messenger Platform overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview)

## TikTok

Adapter: `TikTokBusinessMessagingMockAdapter`

Current foundation:

- Mock inbound/outbound interface
- Payload shape intentionally generic
- Real integration should wait for TikTok Business Messaging API or partner access details

Official docs checked:

- [TikTok API for Business docs](https://business-api.tiktok.com/portal/docs)
- [TikTok Business Messaging API education hub](https://business-api.tiktok.com/portal/bm-api/education-hub)

## Telephone / Voice AI

Adapter/runtime:

- `TwilioVoiceAdapter`
- `apps/voice`

Current foundation:

- Incoming call webhook receives Twilio form data
- First request prompts with TwiML `<Gather input="speech">`
- Speech result is normalized, sent through the answer engine, stored, and returned with TwiML `<Say>`
- Pressing `0` transfers to `TWILIO_TRANSFER_PHONE_NUMBER` when configured
- Human handoff summaries, media streams, callback workflows, and deeper call analytics are TODOs behind the same runtime boundary

Official docs checked:

- [Twilio Voice webhooks](https://www.twilio.com/docs/usage/webhooks/voice-webhooks)
- [Twilio TwiML for Programmable Voice](https://www.twilio.com/docs/voice/twiml)
- [Twilio Gather](https://www.twilio.com/docs/voice/twiml/gather)

## TODOs Before Production Credentials

- Encrypt/decrypt channel tokens with a KMS-backed provider.
- Persist provider account IDs and webhook event IDs per channel connection.
- Verify provider signatures, not only webhook verify tokens.
- Enforce WhatsApp and Messenger/Instagram response windows before sending.
- Add retry queues and dead-letter handling for outbound delivery.
- Add Twilio signature validation.
- Add richer voice callback workflows and call summaries.
- Add provider-specific integration health dashboards.
- Add hard enforcement for WhatsApp template-only replies outside the 24-hour response window.
- Sync WhatsApp template approval status from Meta instead of only storing admin-entered status.
