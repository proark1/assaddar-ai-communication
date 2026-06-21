# API

Base URL in local development: `http://localhost:4000`

Admin endpoints require:

```http
x-admin-token: change-me-dev-admin-token
```

## Health

```http
GET /health
```

## Create Tenant

```http
POST /admin/tenants
content-type: application/json

{
  "name": "Demo Business",
  "slug": "demo-business"
}
```

Returns the tenant, including `id` and public `publicId`. The public ID is safe to expose in the widget. The internal tenant ID is not.

## Add FAQ Knowledge

```http
POST /admin/tenants/{tenantId}/knowledge/faqs
content-type: application/json

{
  "question": "What are your opening hours?",
  "answer": "We are open Monday to Friday from 09:00 to 18:00.",
  "tags": ["opening-hours", "faq"]
}
```

FAQ entries are stored as approved knowledge source, document, and chunk records under that tenant.

## Test Assistant

```http
POST /admin/tenants/{tenantId}/test-assistant
content-type: application/json

{
  "message": "When are you open?"
}
```

Returns:

```json
{
  "conversationId": "conv_...",
  "answer": {
    "status": "answered",
    "text": "We are open Monday to Friday from 09:00 to 18:00.",
    "confidence": 0.5,
    "intent": "opening_hours",
    "citations": []
  }
}
```

## Widget Config

```http
GET /widget/config/{assistantId}
```

Returns public tenant/widget config. `assistantId` is the tenant `publicId`, not the internal tenant UUID.

## Widget Chat

```http
POST /widget/chat
content-type: application/json

{
  "assistantId": "asst_...",
  "conversationId": "conv_...",
  "visitorId": "visitor_...",
  "message": "Which services do you offer?"
}
```

Returns the reply, status, citations, and conversation ID. The API stores inbound/outbound messages, usage events, and handoff requests when needed.

## GDPR Helpers

```http
GET /admin/tenants/{tenantId}/export
DELETE /admin/tenants/{tenantId}
```

The export endpoint returns tenant profile, knowledge, conversations, and handoff records. The delete endpoint cascades tenant-owned data through database foreign keys.

## Webhook Shells

```http
GET /webhooks/meta/{channel}
POST /webhooks/meta/{channel}
```

Supported `channel` values: `whatsapp`, `messenger`, `instagram`.

Verification follows Meta's `hub.mode`, `hub.verify_token`, and `hub.challenge` flow. Payload ingestion is intentionally credential-gated until channel connection mapping is configured.
