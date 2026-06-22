export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Assaddar AI Communication Platform API",
    version: "0.1.0",
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
      },
    },
    "/admin/tenants": {
      get: {
        summary: "List tenants",
      },
      post: {
        summary: "Create a tenant",
      },
    },
    "/admin/tenants/{tenantId}/knowledge/faqs": {
      post: {
        summary: "Add an approved FAQ knowledge entry",
      },
    },
    "/admin/tenants/{tenantId}/knowledge": {
      get: {
        summary: "List approved tenant knowledge",
      },
    },
    "/admin/tenants/{tenantId}/knowledge/{knowledgeId}": {
      put: {
        summary: "Update an approved FAQ knowledge entry",
      },
      delete: {
        summary: "Delete an approved knowledge entry",
      },
    },
    "/admin/tenants/{tenantId}/analytics": {
      get: {
        summary: "Fetch tenant conversation and handoff analytics",
      },
    },
    "/admin/tenants/{tenantId}/conversations": {
      get: {
        summary: "List tenant conversations",
      },
    },
    "/admin/tenants/{tenantId}/conversations/{conversationId}/messages": {
      get: {
        summary: "List messages for a tenant conversation",
      },
    },
    "/admin/tenants/{tenantId}/handoffs": {
      get: {
        summary: "List tenant handoff requests",
      },
    },
    "/admin/tenants/{tenantId}/handoffs/{handoffId}": {
      patch: {
        summary: "Update a tenant handoff request",
      },
    },
    "/admin/tenants/{tenantId}/channel-connections": {
      get: {
        summary: "List tenant channel connection setup status",
      },
    },
    "/admin/tenants/{tenantId}/channel-connections/{channel}": {
      put: {
        summary: "Create or update a tenant channel connection",
      },
    },
    "/admin/tenants/{tenantId}/weekly-report": {
      post: {
        summary: "Send the tenant weekly automation summary email",
      },
    },
    "/admin/tenants/{tenantId}/test-assistant": {
      post: {
        summary: "Test the grounded answer engine for a tenant",
      },
    },
    "/widget/config/{assistantId}": {
      get: {
        summary: "Fetch public widget configuration",
      },
    },
    "/widget/chat": {
      post: {
        summary: "Send a website chat message",
      },
    },
    "/widget/events": {
      post: {
        summary: "Track lightweight widget funnel events",
      },
    },
    "/widget/leads": {
      post: {
        summary: "Capture a website lead and create a handoff",
      },
    },
    "/widget/readiness": {
      post: {
        summary: "Capture an AI readiness assessment as a lead",
      },
    },
    "/webhooks/meta/{channel}": {
      get: {
        summary:
          "Meta webhook verification for WhatsApp, Messenger, and Instagram",
      },
      post: {
        summary: "Credential-gated Meta webhook ingest placeholder",
      },
    },
  },
};
