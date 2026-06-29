# Integration Notes

Credential-dependent integrations are intentionally adapter-backed and conservative in this MVP.

## Website

- Public config endpoint: `GET /widget/config/{assistantId}`
- Chat endpoint: `POST /widget/chat`
- Widget isolation: Shadow DOM
- Conversation continuity: browser `localStorage` stores the public conversation ID and a bounded local transcript cache for the visitor experience. The widget keeps at most 50 messages and expires local state after 30 days.
- Public IDs: `asst_...` values do not expose internal tenant UUIDs

## WhatsApp Business

Adapter: `WhatsAppCloudAdapter`

Current foundation:

- Meta webhook verification using `hub.mode`, `hub.verify_token`, and `hub.challenge`
- Meta webhook POST signature verification using `X-Hub-Signature-256`; production startup requires `META_APP_SECRET`
- Incoming payload normalization for text messages
- Provider message IDs are stored as webhook event IDs and deduplicated before
  answer generation, message creation, usage logging, or outbound replies.
- Outgoing sender is credential-gated until `WHATSAPP_ACCESS_TOKEN` and phone number mapping are configured
- Automated freeform replies are hard-blocked outside the 24-hour customer-service window.
- Tenant-level template storage for draft/submitted/approved/rejected WhatsApp templates
- Compliance endpoint showing the last inbound message, 24-hour freeform reply window, template counts, and recent delivery outcomes
- Provider delivery outcomes are recorded for troubleshooting and future retries
- Customer-service messaging-window enforcement is surfaced in the admin UI and enforced in the automated reply path.

Official docs checked:

- [Meta WhatsApp webhook endpoint setup](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/)
- [Meta WhatsApp webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/)

## Instagram And Facebook Messenger

Adapter: `MetaMessengerAdapter`

Current foundation:

- Shared Meta webhook verification
- Incoming text normalization for `messaging` payloads
- Provider message IDs are stored as webhook event IDs and deduplicated before
  answer generation, message creation, usage logging, or outbound replies.
- 24-hour response window awareness represented as policy metadata
- Automated freeform replies are hard-blocked outside the 24-hour customer-service window.
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

- The product treats telephone providers as number/SIP carriers only; Assaddar owns the AI, inbox, summaries, and handoff workflow.
- Admin setup supports three paths: request/connect a new provider number, forward an existing customer number to an AI destination number, or connect a SIP trunk/PBX.
- Supported provider labels are `easybell`, `sipgate`, `peoplefone`, and `custom_sip`.
- `apps/voice` exposes `POST /voice/turn` for a SIP/RTP edge such as Asterisk or FreeSWITCH. The edge sends transcribed text plus call metadata and receives the assistant reply, confidence, and handoff state.
- Admin setup also tracks launch checklist, test-call result, voice-edge health, provider setup guides, business hours, handoff rules, GDPR phone settings, voice quality, and recent phone transcripts.
- The legacy Twilio TwiML route remains available for old tests/deployments, but it is no longer the main product direction.
- Human handoff summaries, media streams, callback workflows, and deeper call analytics are TODOs behind the same runtime boundary.

Required env for the Railway voice bridge:

- `VOICE_PUBLIC_URL`
- `VOICE_SIP_DOMAIN` or `VOICE_EDGE_SIP_DOMAIN` once a SIP edge is deployed
- `VOICE_EDGE_SECRET` shared only with the SIP/RTP edge
- `TWILIO_TRANSFER_PHONE_NUMBER` only for the legacy Twilio route

Voice edge contract:

- `POST /voice/turn?assistantId=<public assistant id>`
- Headers: `x-voice-edge-timestamp` as Unix seconds and `x-voice-edge-signature` as HMAC-SHA256 over `<timestamp>.<raw JSON body>` using `VOICE_EDGE_SECRET`. `sha256=<hex>` and plain hex are accepted.
- JSON body: `text`, optional `callId`, `from`, `to`, `provider`, `locale`, and metadata.
- JSON response: `reply`, `status`, `confidence`, `handoffRecommended`, and optional `transferPhoneNumber`.

Official docs checked:

- [easybell SIP Trunks](https://en.easybell.de/business/sip-trunks/)
- [sipgate trunking](https://teamhelp.sipgate.co.uk/integrations-and-connections/using-sipgate-trunking/what-is-sipgate-trunking)
- [peoplefone SIP trunk](https://support.peoplefone.com/en-che/peoplefone-sip-trunk/)
- [Asterisk SIP trunking](https://www.asterisk.org/sip-trunking-for-asterisk/)
- [FreeSWITCH](https://signalwire.com/freeswitch)

Planned provider expansion:

- Add provider-specific API automation only after partner/reseller access is available.
- Add an EU/self-hosted SIP/RTP edge for live audio before selling production phone AI as GDPR-ready.

## TODOs Before Production Credentials

- Replace the env-key channel credential cipher with a KMS-backed provider and key rotation process.
- Add retry queues and dead-letter handling for outbound delivery.
- Add richer voice callback workflows and call summaries.
- Add provider-specific integration health dashboards.
- Add hard enforcement for WhatsApp template-only replies outside the 24-hour response window.
- Sync WhatsApp template approval status from Meta instead of only storing admin-entered status.
