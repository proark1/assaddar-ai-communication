export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Assaddar AI Communication Platform API",
    version: "0.1.0"
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check"
      }
    },
    "/admin/tenants": {
      get: {
        summary: "List tenants"
      },
      post: {
        summary: "Create a tenant"
      }
    },
    "/admin/tenants/{tenantId}/knowledge/faqs": {
      post: {
        summary: "Add an approved FAQ knowledge entry"
      }
    },
    "/admin/tenants/{tenantId}/test-assistant": {
      post: {
        summary: "Test the grounded answer engine for a tenant"
      }
    },
    "/widget/config/{assistantId}": {
      get: {
        summary: "Fetch public widget configuration"
      }
    },
    "/widget/chat": {
      post: {
        summary: "Send a website chat message"
      }
    },
    "/webhooks/meta/{channel}": {
      get: {
        summary: "Meta webhook verification for WhatsApp, Messenger, and Instagram"
      },
      post: {
        summary: "Credential-gated Meta webhook ingest placeholder"
      }
    }
  }
};
