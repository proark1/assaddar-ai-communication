# Telegram Channel Design

## Context

The platform is built around one tenant-scoped customer communication system:
approved knowledge, answer policy, conversations, contacts, handoffs, usage,
deliveries, audit logs, and channel connections all live in the product
database. Website chat and telephone already use that shared model, and Meta
channels already have adapter foundations.

Telegram is the next channel to prove the same product idea across a lightweight
messaging provider. The first Telegram beta should support both private bot
chats and groups/supergroups, while keeping group behavior controlled so the bot
does not answer every group message.

## Goals

- Add Telegram as a first-class channel without changing the core answer engine.
- Support both private 1:1 chats and group/supergroup chats.
- In groups, answer only when the bot is intentionally addressed.
- Route all Telegram messages through the existing tenant-scoped conversations,
  contacts, inbox, usage, delivery, and handoff paths.
- Make setup simple enough for a tenant admin: paste bot token, verify bot,
  set webhook, show health.
- Preserve the platform privacy boundary: platform owner sees project/channel
  health, but tenant message content requires real tenant membership.

## Non-Goals

- Telegram voice messages, files, stickers, payments, inline mode, and Mini Apps
  are out of scope for the first beta.
- The beta does not answer every group message by default.
- The beta does not replace WhatsApp/Messenger setup. It creates a reusable
  pattern for easier provider onboarding.
- The beta does not add a general-purpose AI mode. Answers still come only from
  tenant-approved knowledge and existing policy checks.

## Recommended Approach

Use one `TelegramBotAdapter` with mode-aware normalization:

- Private chats: answer every inbound text message from a non-bot user.
- Groups and supergroups: answer only when one of the configured triggers
  matches.
- Channels: ignore for beta unless a later product decision adds broadcast
  support.

Group trigger settings are tenant/channel settings:

- `mentions`: answer messages that mention the bot username.
- `commands`: answer `/ask ...` and `/ask@botusername ...`.
- `replies`: answer messages that reply to a bot message.

The default group setting is `mentions + commands + replies`.

## User Experience

In the admin Channels tab, Telegram appears next to Website, Telephone,
WhatsApp, Messenger, and Instagram.

Setup flow:

1. Tenant admin creates a bot in BotFather.
2. Tenant admin pastes the bot token into Telegram setup.
3. The API calls Telegram `getMe` to validate the token and read bot id,
   username, and display name.
4. The platform stores the bot token as an encrypted channel credential.
5. The platform generates a webhook secret token and stores it as an encrypted
   channel credential.
6. The API calls Telegram `setWebhook` with the tenant webhook URL, allowed text
   message updates, and the generated secret token.
7. The admin UI shows webhook URL, bot username, status, last error if any, and
   group trigger settings.
8. The tenant admin can run a health check that calls Telegram `getWebhookInfo`.

The UI should keep manual steps short:

- Create bot with BotFather.
- Paste bot token here.
- Add the bot to a group if group support is needed.
- Mention the bot, reply to it, or use `/ask` in groups.

## Channel And Credential Model

Telegram adds `telegram` to the shared channel enum and to admin channel
dashboard types.

Channel connection:

- `channel`: `telegram`
- `provider`: `telegram-bot-api`
- `externalAccountId`: Telegram bot id as a string
- `status`: `pending`, `connected`, or `disabled`
- `settings`: non-secret bot metadata and group behavior settings

Non-secret settings:

- `botUsername`
- `botDisplayName`
- `groupTriggers`: array of `mentions`, `commands`, `replies`
- `allowedChatTypes`: array of `private`, `group`, `supergroup`
- `lastWebhookCheckAt`
- `lastWebhookStatus`

Secrets:

- Bot token is encrypted through the existing channel credential cipher.
- Webhook secret token is also encrypted and must not be stored in
  `settings`.
- The API should expose this second credential semantically as
  `webhookSecret`, even if the first implementation maps it onto the existing
  encrypted refresh-token column internally.

## Webhook Routing

Webhook endpoint:

- `POST /webhooks/telegram?assistantId=<tenant public id>`
- A generic `POST /webhooks/telegram` route may exist for future shared-bot
  routing, but the first beta should not depend on it because Telegram update
  payloads do not identify which bot received the update.

Verification:

- Require `X-Telegram-Bot-Api-Secret-Token`.
- Compare it to the encrypted webhook secret for the mapped channel connection.
- In production, reject Telegram webhooks when the secret cannot be verified.

Tenant routing:

1. The setup automation always registers the assistant-specific webhook URL.
2. The API loads the tenant by public assistant id and then loads that tenant's
   connected Telegram channel connection.
3. The API verifies the webhook secret for that specific connection.
4. If no tenant or Telegram connection is found, acknowledge with `202` and
   `routed: false`.

Idempotency:

- Store Telegram `update_id` as a string `providerEventId`.
- Deduplicate through `channel_webhook_events` before answer generation,
  message creation, usage logging, or outbound send.

## Message Normalization

The adapter reads text from:

- `message.text`
- later, `edited_message.text` only if product decides edits should be handled

The normalized event includes:

- `channel`: `telegram`
- `provider`: `telegram-bot-api`
- `providerEventId`: `update_id` converted to a string
- `providerAccountId`: bot id from the channel connection
- `externalConversationId`: Telegram chat id plus thread/topic id when present
- `externalUserId`: Telegram sender id
- `text`: cleaned message text after command or mention prefix removal
- `raw`: bounded raw Telegram message metadata

Private conversation key:

- `chat.id`

Group conversation key:

- `chat.id`
- include `message_thread_id` for forum topics when present

Contact identity:

- Use Telegram user id as a tenant-scoped identifier.
- Store optional non-sensitive display hints such as first name, last name, and
  username when provided by Telegram.
- Do not merge Telegram contacts with phone/email identities unless the user
  explicitly provides matching contact details later.

## Outbound Replies

The adapter sends replies through Telegram `sendMessage`.

Private chats:

- Send to the private chat id.

Groups:

- Send to the group chat id.
- Reply to the triggering message when possible.
- Preserve `message_thread_id` for forum topics.

Delivery handling:

- Map Telegram success to `sent` with provider message id.
- Map network errors, timeouts, HTTP 429, and HTTP 5xx to retryable `failed`.
- Map bad token, forbidden bot, blocked recipient, and other permanent 4xx
  responses to non-retryable `failed`.
- Skip outbound sends when credentials or recipient chat id are missing.

## Group Safety Rules

The platform only stores and processes group messages that trigger the bot.
Non-trigger group messages are ignored and should not create conversations,
messages, usage events, handoffs, or provider deliveries.

The bot should not answer:

- messages sent by bots
- service messages
- unsupported non-text messages
- group messages without an enabled trigger
- commands other than supported Telegram assistant commands

Initial supported command:

- `/ask <question>`

Optional future commands:

- `/help`
- `/human`
- `/reset`

## Privacy And Admin Boundary

Telegram messages are tenant personal data. Existing tenant-access rules still
apply:

- Platform owner can list all projects and see aggregate/channel health.
- Platform owner cannot read tenant Telegram conversations unless they are a
  real tenant member.
- Tenant admins can configure Telegram for their own tenant.
- Credential changes and webhook setup actions write audit events.

Group chats add extra privacy risk because messages may contain multiple people.
The beta limits storage to triggered messages only, and group admins must
intentionally add the bot to the group.

## Error Handling

- Invalid webhook secret: return `401`.
- Unknown tenant mapping: return `202` with `routed: false`.
- Duplicate processed update: return success without re-answering.
- Duplicate update whose prior processing failed or stayed received: retry
  processing.
- Telegram send failure: record message delivery outcome and let retryable
  failures enter the existing retry worker.
- `getMe`, `setWebhook`, or `getWebhookInfo` failure: keep channel status
  `pending` or `disabled`, show readable setup status, and avoid logging tokens.

## Testing

Adapter tests:

- Normalizes private text messages.
- Ignores bot messages and non-text messages.
- Triggers group messages by mention, `/ask`, and reply.
- Ignores group messages without a trigger.
- Preserves group chat id and topic id.
- Truncates outbound messages to Telegram text limits.
- Maps Telegram send success, retryable failure, permanent failure, and skipped
  send correctly.

API tests:

- Rejects Telegram webhook with missing or invalid secret.
- Routes assistant-specific webhook to the selected tenant.
- Returns `routed: false` for generic Telegram webhook calls during the beta.
- Deduplicates `update_id`.
- Does not process non-trigger group messages.
- Records inbound message, outbound reply, usage event, delivery outcome, and
  inbox item for a triggered Telegram update.

Admin/UI tests:

- Telegram appears in channel setup.
- Token submission validates bot metadata.
- Webhook setup health is visible.
- Group trigger settings can be saved by tenant admins only.
- Platform owner without tenant membership cannot read Telegram conversations.

## Rollout Plan

1. Add channel enum/type support and dashboard listing for Telegram.
2. Add Telegram adapter normalization and outbound sending.
3. Add Telegram credential/setup endpoints for `getMe`, `setWebhook`, and
   `getWebhookInfo`.
4. Add Telegram webhook route with secret verification and tenant routing.
5. Add admin setup UI and group trigger controls.
6. Add unit and API tests for private and group flows.
7. Test with Assaddar's own project before enabling the channel for other
   tenants.

## Open Decisions

- Whether to use one Telegram bot per tenant or allow a platform-managed bot
  shared across tenants later. The first beta assumes one bot per tenant because
  it is simpler to reason about, easier to explain, and cleaner for privacy.
- Whether group conversations should appear as one group timeline or split by
  Telegram forum topic. The first beta stores topic id in the conversation key
  when present.
- Whether `/human` should create a handoff in the first Telegram beta. The first
  beta can defer it unless needed during testing.

## Official Source Checked

- Telegram Bot API: https://core.telegram.org/bots/api
