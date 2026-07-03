export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Assaddar AI Communication Platform API",
    version: "0.1.0",
    description:
      "Admin routes accept a Supabase Auth bearer token, a legacy HttpOnly project-user session cookie, or the bootstrap admin token. Tenant role requirements are documented with x-minimum-role.",
  },
  components: {
    securitySchemes: {
      projectSession: {
        type: "apiKey",
        in: "cookie",
        name: "assaddar_session",
      },
      supabaseBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Supabase access token",
      },
      bootstrapAdminToken: {
        type: "apiKey",
        in: "header",
        name: "x-admin-token",
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
      },
    },
    "/auth/login": {
      post: {
        summary: "Create a legacy project-user session",
      },
    },
    "/auth/logout": {
      post: {
        summary: "Delete the current user session",
      },
    },
    "/auth/session": {
      get: {
        summary: "Fetch the current admin or project-user session",
      },
    },
    "/auth/invites/accept": {
      post: {
        summary: "Accept a tenant invite and create a password login",
      },
    },
    "/admin/tenants": {
      get: {
        summary: "List tenants",
      },
      post: {
        summary: "Create a tenant",
        "x-minimum-role": "platform_owner",
      },
    },
    "/admin/tenants/{tenantId}/knowledge/faqs": {
      post: {
        summary: "Add an approved FAQ knowledge entry",
        "x-minimum-role": "tenant_admin",
      },
    },
    "/admin/tenants/{tenantId}/knowledge": {
      get: {
        summary: "List approved tenant knowledge",
        "x-minimum-role": "viewer",
      },
    },
    "/admin/tenants/{tenantId}/knowledge/{knowledgeId}": {
      put: {
        summary: "Update an approved FAQ knowledge entry",
        "x-minimum-role": "tenant_admin",
      },
      delete: {
        summary: "Delete an approved knowledge entry",
        "x-minimum-role": "tenant_admin",
      },
    },
    "/admin/tenants/{tenantId}/analytics": {
      get: {
        summary: "Fetch tenant conversation and handoff analytics",
      },
    },
    "/admin/tenants/{tenantId}/dashboard": {
      get: {
        summary:
          "Fetch the dashboard bootstrap payload for the admin workspace",
        "x-minimum-role": "viewer",
      },
    },
    "/admin/tenants/{tenantId}/production-readiness": {
      get: {
        summary:
          "Score tenant production-readiness across channels, AI quality, handoff operations, security, reliability, observability, onboarding, and SaaS controls",
        "x-minimum-role": "viewer",
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
        "x-minimum-role": "operator",
      },
    },
    "/admin/tenants/{tenantId}/channel-connections": {
      get: {
        summary: "List tenant channel connection setup status",
        "x-minimum-role": "viewer",
      },
    },
    "/admin/tenants/{tenantId}/channel-connections/{channel}": {
      put: {
        summary: "Create or update a tenant channel connection",
        "x-minimum-role": "tenant_admin",
      },
    },
    "/admin/tenants/{tenantId}/users": {
      get: {
        summary: "List tenant users and roles",
        "x-minimum-role": "tenant_admin",
      },
      post: {
        summary: "Create or update a tenant user login",
        "x-minimum-role": "tenant_admin",
      },
    },
    "/admin/tenants/{tenantId}/invites": {
      get: {
        summary: "List tenant invite links",
        "x-minimum-role": "tenant_admin",
      },
      post: {
        summary: "Create a tenant invite link",
        "x-minimum-role": "tenant_admin",
      },
    },
    "/admin/tenants/{tenantId}/telephone/twilio/search": {
      get: {
        summary: "Legacy: search available Twilio phone numbers",
      },
    },
    "/admin/tenants/{tenantId}/telephone/twilio/numbers": {
      get: {
        summary: "Legacy: list Twilio phone numbers owned by the account",
      },
    },
    "/admin/tenants/{tenantId}/telephone/twilio/purchase": {
      post: {
        summary: "Legacy: purchase a Twilio phone number",
      },
    },
    "/admin/tenants/{tenantId}/telephone/twilio/connect-existing": {
      post: {
        summary: "Legacy: route an existing Twilio number to the assistant",
      },
    },
    "/admin/tenants/{tenantId}/telephone/new-number": {
      post: {
        summary:
          "Save a new-number setup with a German/EU SIP provider such as easybell, sipgate, or peoplefone",
      },
    },
    "/admin/tenants/{tenantId}/telephone/carrier-forwarding": {
      post: {
        summary:
          "Save an existing-number forwarding setup to a provider AI destination number",
      },
    },
    "/admin/tenants/{tenantId}/telephone/sip-byoc": {
      post: {
        summary:
          "Save SIP trunk or PBX routing details for the Assaddar voice edge",
      },
    },
    "/admin/tenants/{tenantId}/telephone/settings": {
      put: {
        summary:
          "Save telephone checklist, test call, business-hours, handoff, GDPR, and voice-quality settings",
      },
    },
    "/admin/tenants/{tenantId}/telephone/voice-edge-status": {
      get: {
        summary: "Check the configured Railway voice bridge health endpoint",
      },
    },
    "/admin/tenants/{tenantId}/weekly-report": {
      post: {
        summary: "Send the tenant weekly automation summary email",
        "x-minimum-role": "tenant_admin",
      },
    },
    "/admin/tenants/{tenantId}/test-assistant": {
      post: {
        summary: "Test the grounded answer engine for a tenant",
        "x-minimum-role": "operator",
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
