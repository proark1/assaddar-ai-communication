# Connect Channels Experience Design

## Context

The platform's core idea is one tenant-owned customer communication system:
approved knowledge, answer policy, conversations, contacts, handoffs, usage,
deliveries, audit logs, and channel connections all live in the product
database. Website chat, telephone, WhatsApp, Messenger, Instagram, and the
planned Telegram integration already point toward that model.

The current admin UI has a `Channels` tab with a launch path, telephone setup,
generic channel cards, and a separate WhatsApp operations panel. That is the
right place for channel setup, but the experience should become easier for
non-technical tenant admins. The user should not have to understand webhooks,
tokens, provider IDs, or response windows before they know what to do next.

This design turns the `Channels` tab into a guided **Connect channels**
experience for:

- Website chat
- Telephone AI
- WhatsApp Business
- Facebook Messenger
- Instagram DM
- Telegram
- Email

## Goals

- Make all major customer channels visible from one place.
- Help tenant admins connect each channel with a simple tutorial and clear next
  action.
- Keep technical provider details available without making them the first thing
  users see.
- Support setup automation where provider APIs allow it.
- Separate real customer email conversations from existing owner notification
  emails.
- Preserve the privacy boundary: platform owners see setup and health, but
  message content stays tenant-scoped.
- Keep each channel behind the existing adapter, webhook event, delivery,
  conversation, contact, inbox, and usage abstractions.

## Non-Goals

- This design does not implement every provider integration in one step.
- This design does not turn the platform into a generic CRM or helpdesk clone.
- This design does not replace the existing Settings tab. Settings remains for
  tenant profile, widget styling, automation, users, and account-level controls.
- This design does not store provider secrets in channel settings.
- This design does not add TikTok production support yet.

## Recommended UX Approach

Use a **channel catalog plus detail panel**.

The Channels tab becomes:

1. A compact health summary at the top.
2. A recommended launch sequence.
3. A **Connect channels** catalog.
4. A selected channel detail panel with setup, tutorial, health, tests, and
   operations.

This is better than a giant settings page because each provider has different
rules. It is also better than separate pages per channel because users can see
their whole communication surface at once.

## Information Architecture

Primary tab:

- Existing tab label can stay **Channels**.
- Main section title should become **Connect channels**.

Channel groups:

- **Owned channels**: Website chat, Telephone AI, Email
- **Messaging apps**: WhatsApp Business, Facebook Messenger, Instagram DM,
  Telegram

Each channel card shows:

- Channel name
- Short plain-language purpose
- Status: `Not started`, `Needs setup`, `Connected`, `Action needed`,
  `Disabled`
- Main next action
- Last health check or last event
- Provider icon

The selected channel detail panel shows:

- What this channel does
- Setup checklist
- Guided tutorial
- Credentials and connection method
- Webhook or callback URL if relevant
- Test action
- Recent events and last error
- Advanced setup disclosure

## Visual Direction

This is an operational SaaS surface, so it should be calm, dense enough to scan,
and not feel like a marketing page. The distinctive visual idea is a
**signal board**: every channel is a line into the same customer brain.

Design tokens:

- `signal-ink`: `#18202A`
- `signal-paper`: `#F7F8FA`
- `line-blue`: `#2563EB`
- `ready-green`: `#138A5B`
- `warn-amber`: `#B7791F`
- `fault-red`: `#C2410C`

Layout concept:

```text
+-----------------------------------------------------------+
| Channel health summary                                    |
+----------------------+------------------------------------+
| Connect channels     | Selected channel detail            |
| [Website]            | WhatsApp Business                  |
| [Telephone]          | 1. Prepare Meta account            |
| [WhatsApp] selected  | 2. Connect phone number            |
| [Messenger]          | 3. Verify webhook                  |
| [Instagram]          | 4. Send test message               |
| [Telegram]           |                                    |
| [Email]              | Health, events, advanced setup     |
+----------------------+------------------------------------+
```

The catalog should use compact cards, not oversized hero cards. The detail panel
can use contained sections, but avoid nesting cards inside cards.

## Channel Status Model

Every channel should have a normalized status:

- `not_started`: no connection saved yet
- `needs_setup`: connection exists but credentials, mapping, webhook, or test is
  incomplete
- `connected`: credentials and provider health are valid, and a test has passed
  when the provider supports testing
- `action_needed`: provider reported an error, token expired, webhook failed, or
  policy setup is incomplete
- `disabled`: tenant intentionally turned the channel off

Existing stored statuses can remain `pending`, `connected`, and `disabled`, but
the UI should derive the friendlier display status from connection data,
credential state, health checks, and provider-specific requirements.

## Tutorial Pattern

Each channel tutorial should use the same plain-language shape:

1. **Prepare the account**
2. **Connect it here**
3. **Approve or copy the callback**
4. **Send a test message**
5. **Turn it on**

Copy style:

- Use words users recognize: "phone number", "Facebook Page", "support inbox".
- Hide advanced words like "webhook", "verify token", "Pub/Sub", "Graph API",
  and "HMAC" under Advanced setup.
- Button labels should say what happens: `Connect bot`, `Check webhook`,
  `Send test message`, `Copy callback URL`, `Save and turn on`.
- Errors should include the fix: `Token rejected. Paste a current bot token from
BotFather.`

## Channel Details

### Website Chat

Purpose:

- Add the assistant to the tenant's website.

Setup:

- Show assistant ID.
- Show copyable install snippet.
- Keep install checker in the detail panel.
- Link to Settings only for visual widget customization.

Test:

- Check a website URL for installed script.
- Send a test widget message.

### Telephone AI

Purpose:

- Answer and route calls through the shared knowledge and inbox.

Setup:

- Keep the current telephone setup flow, but present it as one selected channel
  detail panel.
- Keep modes: new number, forwarding, SIP/PBX.
- Keep voice edge health, business hours, handoff rules, GDPR disclosure, voice
  quality, and test-call status.

Test:

- Health check voice edge.
- Record test call result.

### WhatsApp Business

Purpose:

- Let customers message the business on WhatsApp and receive grounded automated
  answers when policy allows it.

Setup:

- Prepare Meta Business and WhatsApp Business Account.
- Connect phone number ID.
- Store access token as encrypted channel credential.
- Verify Meta webhook and signature.
- Show assistant-specific webhook URL.
- Sync or manage templates.
- Show 24-hour customer-service window state.

Operations:

- Move the existing WhatsApp operations panel into the WhatsApp channel detail.
- Show templates, approval status, response window, recent deliveries, and last
  provider error.

Test:

- Check webhook.
- Send test inbound payload in development.
- Send a test reply only when credentials and recipient are valid.

### Facebook Messenger

Purpose:

- Connect Facebook Page messages to the same inbox and answer engine.

Setup:

- Connect Meta app credentials.
- Map Facebook Page ID.
- Subscribe the app to message events.
- Verify webhook.
- Store page access token as encrypted channel credential.

Group with Instagram:

- Messenger and Instagram share a **Meta channels** setup pattern, but they
  remain separate channel cards because tenants may connect one without the
  other.

Test:

- Check webhook.
- Send a message to the connected Page.
- Confirm the message appears in the unified inbox.

### Instagram DM

Purpose:

- Connect Instagram Professional account DMs to the shared inbox and assistant.

Setup:

- Require an eligible Instagram Professional account connected to a Facebook
  Page.
- Map Instagram account ID.
- Subscribe the app to messaging webhooks.
- Store credentials through the same Meta credential path.

Test:

- Check webhook.
- Send a DM to the account.
- Confirm conversation and contact identity.

### Telegram

Purpose:

- Connect a Telegram bot for private chats and group/supergroup support.

Setup:

- Create bot with BotFather.
- Paste bot token.
- Validate with `getMe`.
- Store token and webhook secret as encrypted channel credentials.
- Set assistant-specific webhook URL.
- Configure group triggers: mentions, `/ask`, replies.

Test:

- Check webhook info.
- Send private bot message.
- Mention or use `/ask` in a group.

The Telegram behavior should follow the approved Telegram design spec.

### Email

Purpose:

- Turn a support mailbox into a tenant-scoped conversation channel.

Important distinction:

- Existing owner lead-alert and visitor-confirmation emails are notifications.
- The new Email channel is a real customer conversation inbox.

First implementation:

- **Forwarding address**: the platform generates a tenant-specific inbound
  email address. The tenant forwards a support mailbox to that address. This is
  the simplest first path because it works across Gmail, Microsoft 365, and
  custom mail hosts without requiring OAuth provider setup.

Planned mailbox connection options:

- **Gmail / Google Workspace**: OAuth mailbox connection, Gmail push
  notifications, message fetch by history id.
- **Microsoft 365 / Outlook**: OAuth mailbox connection, Microsoft Graph change
  notifications, message fetch through Graph.

Conversation model:

- Contact identity uses email address.
- Threading uses provider thread id, message id, and normalized subject fallback.
- Incoming emails become conversations and messages.
- Outbound replies in the first version use the platform sender with clear
  tenant branding and reply-to handling.
- Gmail/Outlook OAuth later allows replies from the connected mailbox.
- Attachments are not required for the first version. A later attachment feature
  must follow tenant retention and malware scanning rules.

Test:

- Send test email to connected support address.
- Confirm conversation appears in inbox.
- Send test reply.

## Data And API Shape

Channel dashboard should be backed by a normalized descriptor:

- `channel`
- `provider`
- `label`
- `group`
- `description`
- `status`
- `nextAction`
- `credentialConfigured`
- `accountMapped`
- `webhookConfigured`
- `testStatus`
- `health`
- `tutorialSteps`
- `advancedFields`
- `settings`

Provider-specific setup endpoints can sit behind consistent UI actions:

- `GET /admin/tenants/:tenantId/channel-connections`
- `PUT /admin/tenants/:tenantId/channel-connections/:channel`
- `POST /admin/tenants/:tenantId/channels/:channel/connect`
- `POST /admin/tenants/:tenantId/channels/:channel/test`
- `GET /admin/tenants/:tenantId/channels/:channel/health`

The exact endpoints can be split during implementation, but the UI should not
care whether a provider uses Meta Graph, Telegram Bot API, Gmail API,
Microsoft Graph, or an inbound email service.

## Security And Privacy

- Provider tokens, webhook secrets, OAuth refresh tokens, app secrets, and SMTP
  credentials are encrypted channel credentials or secret-manager values.
- Non-secret channel settings may include account IDs, display names, trigger
  settings, and last health status.
- Platform owner can see channel health and aggregate counts.
- Platform owner cannot read channel messages unless they are a tenant member.
- Credential writes, channel status changes, webhook setup, OAuth grants, and
  test sends write audit events.
- Email content, Telegram group-triggered messages, WhatsApp messages, Meta
  messages, and call transcripts are tenant personal data.

## Error Handling

Common UI error states:

- Missing credential
- Invalid credential
- Webhook not verified
- Provider account not mapped
- Token expired
- Provider permission missing
- Sending blocked by provider policy
- Test message not received
- Channel disabled

Error copy must name the fix:

- `Webhook check failed. Copy the callback URL again and save it in Meta.`
- `Token expired. Reconnect this channel.`
- `WhatsApp template required. Create or approve a template before sending
outside the 24-hour window.`
- `Email watch expired. Reconnect the mailbox or renew the watch.`

## Testing

UI tests:

- Channels tab renders all supported channel cards.
- Selecting a card opens the correct detail panel.
- Each detail panel shows tutorial steps, status, health, and test action.
- Tenant admins can save setup changes.
- Viewers can inspect status but cannot change setup.
- Platform owners without tenant membership cannot access message content.
- WhatsApp operations appear inside WhatsApp detail.
- Email channel explains the difference between notifications and conversation
  inbox.

API tests:

- Channel dashboard includes Website, Telephone, WhatsApp, Messenger,
  Instagram, Telegram, and Email descriptors.
- Friendly status derives correctly from connection, credentials, health, and
  test state.
- Secret-like settings are rejected.
- Credential writes are audited.
- Channel health endpoints never expose secrets.

Integration tests by channel:

- WhatsApp webhook and delivery paths continue to dedupe provider message IDs.
- Messenger and Instagram use separate account mappings.
- Telegram follows the assistant-specific webhook and group trigger rules.
- Email inbound creates tenant-scoped conversations and merges contacts by
  email address.
- Disabled channels do not auto-reply.

## Rollout Plan

Phase 1: UI foundation

- Rename **Other channel setup** to **Connect channels**.
- Add channel catalog and selected detail panel.
- Add Telegram and Email cards as planned channels if their backends are not
  implemented yet.
- Move WhatsApp operations into the WhatsApp detail panel.

Phase 2: WhatsApp production completion

- Finish live credential setup, template sync, provider health, and test flow.
- Keep 24-hour window and template-mode warnings visible.

Phase 3: Meta channels

- Complete Messenger and Instagram setup automation, account mapping, webhook
  health, and test flows.

Phase 4: Telegram

- Implement the approved Telegram channel design.

Phase 5: Email

- Implement the forwarding-address email path first.
- Add Gmail and Microsoft 365 OAuth mailbox connections after the forwarding
  path works end to end.

## Official Sources Checked

- WhatsApp Business Platform webhooks:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview
- Meta Messenger Platform webhooks:
  https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
- Telegram Bot API:
  https://core.telegram.org/bots/api
- Gmail push notifications:
  https://developers.google.com/workspace/gmail/api/guides/push
- Microsoft Graph Outlook change notifications:
  https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview
- Amazon SES email receiving:
  https://docs.aws.amazon.com/ses/latest/dg/receiving-email.html
