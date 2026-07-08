# OneBrain Project Brand Provisioning Design

Date: 2026-07-09

## Summary

OneBrain becomes the source that starts a new customer/project deployment. A
project created in OneBrain sends a signed provisioning request to the
communication platform. The communication platform creates or updates the
tenant, assistant, widget, AI communication settings, and initial channel/tool
theme from that request.

Brand colors are project-level defaults, not one-off widget fields. Each tool
inherits the project brand at deployment time, and each tool can still override
its main colors locally without changing the project brand.

The first built-in brand preset is the current Assad Dar palette from
assad-dar.de.

## Goals

- Let OneBrain trigger deployment for a new customer/project.
- Store project brand colors in a reusable theme model instead of scattering
  hardcoded color values across admin, API, widget, and seed paths.
- Apply brand colors automatically to the personal assistant and AI
  communication tools when a project is deployed.
- Keep per-tool color editing available after deployment.
- Add the Assad Dar brand as the standard starting preset.
- Make provisioning idempotent so OneBrain retries do not create duplicate
  tenants or assistants.
- Keep existing tenants and saved widget themes working.

## Non-Goals

- Do not replace the current answer engine with OneBrain in this phase.
- Do not make browsers or widgets call OneBrain directly.
- Do not build a full visual brand management suite.
- Do not auto-provision every external provider account in this first pass.
- Do not remove tenant admins' ability to edit widget/tool colors manually.

## Chosen Approach

Use OneBrain-first provisioning with a small signed API contract.

OneBrain owns the project/customer blueprint. The communication platform owns
the runtime deployment: tenant records, public assistant IDs, widget config,
channel connections, conversations, handoffs, usage, and the admin dashboard.

The communication platform exposes a service endpoint for OneBrain:

```text
POST /service/onebrain/projects/deploy
```

The request contains a stable OneBrain project identity, customer metadata,
brand theme, assistant defaults, and the initial tool/channel list. The API
verifies the service signature, validates colors, creates or updates the local
tenant, applies theme defaults, ensures the requested tool settings exist, and
returns the deployed assistant and tenant identifiers.

## Theme Model

Use three layers:

1. `brandTheme`: project-level colors and preset metadata from OneBrain.
2. `defaultToolTheme`: generated defaults for each tool from the project brand.
3. `toolThemeOverrides`: per-tool values edited later inside the communication
   admin UI.

Effective tool theme:

```text
effectiveToolTheme = defaultToolTheme(brandTheme, toolType)
  merged with toolThemeOverrides
```

This means a new website assistant, voice setup screen, or messaging surface can
start on brand. If a user changes the widget primary color later, that change
affects only the widget unless they explicitly update the project brand.

## Assad Dar Standard Preset

Add a built-in preset named `assadDar`:

```json
{
  "id": "assadDar",
  "label": "Assad Dar",
  "primaryColor": "#a66e2f",
  "backgroundColor": "#ffffff",
  "textColor": "#16191e",
  "pageBackgroundColor": "#f7f5f1",
  "surfaceColor": "#ffffff",
  "surfaceMutedColor": "#f1ece2",
  "accentHoverColor": "#8c5a24"
}
```

This preset replaces the current scattered teal/blue fallback values as the
standard assistant theme. Existing saved tenant themes continue to win over new
defaults.

## Provisioning Request

The first version of the request should be intentionally small:

```json
{
  "onebrainProjectId": "ob_project_123",
  "onebrainAccountId": "ob_account_123",
  "customer": {
    "name": "Example Customer",
    "slug": "example-customer",
    "locale": "de"
  },
  "brandTheme": {
    "preset": "assadDar",
    "primaryColor": "#a66e2f",
    "backgroundColor": "#ffffff",
    "textColor": "#16191e"
  },
  "assistant": {
    "name": "Example AI Assistant",
    "openingMessage": "Hallo, wie kann ich helfen?",
    "tone": "friendly"
  },
  "tools": [
    {
      "type": "website",
      "enabled": true,
      "themeOverrides": {
        "primaryColor": "#a66e2f"
      }
    }
  ]
}
```

The API should reject invalid payloads before creating anything. Colors use the
same safe CSS color validation rules as the existing widget theme, tightened to
hex colors for automatic provisioning unless a future provider needs more.

## Local Data Shape

Keep backward compatibility with the existing `tenants.theme` JSON while
introducing clearer structure:

```json
{
  "brandTheme": {
    "preset": "assadDar",
    "primaryColor": "#a66e2f",
    "backgroundColor": "#ffffff",
    "textColor": "#16191e",
    "surfaceMutedColor": "#f1ece2"
  },
  "toolThemes": {
    "website": {
      "primaryColor": "#a66e2f",
      "backgroundColor": "#ffffff",
      "textColor": "#16191e"
    }
  },
  "primaryColor": "#a66e2f",
  "backgroundColor": "#ffffff",
  "textColor": "#16191e"
}
```

The legacy top-level color fields remain for the current widget and API
contracts. New helper functions derive them from `brandTheme` and
`toolThemes.website` until the widget can consume the structured fields
directly.

## Idempotency and Mapping

The local tenant needs a stable mapping back to OneBrain. Use a dedicated
mapping table rather than hiding the relationship inside tenant theme metadata:

```text
onebrain_project_deployments
  id
  onebrain_project_id unique
  onebrain_account_id
  tenant_id
  status
  request_hash
  deployed_at
  last_error
  created_at
  updated_at
```

On each request:

1. Verify the signature.
2. Look up by `onebrain_project_id`.
3. If found, update the mapped tenant.
4. If not found, create the tenant and mapping in one transaction.
5. Store request hash and deployment status.
6. Return the local tenant ID, public assistant ID, widget config URL, and
   deployment status.

This allows OneBrain to retry safely after timeouts.

## API Response

```json
{
  "status": "deployed",
  "tenantId": "local-tenant-uuid",
  "publicAssistantId": "asst_abc",
  "widgetConfigUrl": "https://api.example.com/widget/config/asst_abc",
  "theme": {
    "preset": "assadDar",
    "primaryColor": "#a66e2f",
    "backgroundColor": "#ffffff",
    "textColor": "#16191e"
  }
}
```

Errors should be explicit and safe:

- `401` for missing or invalid service signature.
- `400` for invalid project, color, or tool payload.
- `409` when the OneBrain project maps to a conflicting local tenant state.
- `500` only for unexpected deployment failures.

## Admin UI

The admin theme editor should show both concepts without becoming heavy:

- Project brand colors: inherited from OneBrain and shown as the default.
- Tool colors: editable values for the current tool.
- A "Reset to project brand" action for the website assistant theme.

For this phase, the website widget is the only required tool UI. The data model
should be ready for voice, email, and messaging tool theme overrides later.

## Runtime Widget

The widget continues to read `theme.primaryColor`, `theme.backgroundColor`, and
`theme.textColor` from `GET /widget/config/:assistantId`.

The API should resolve the effective website theme before returning config:

```text
legacy top-level theme fields
  <- effective website tool theme
  <- brand theme
  <- assadDar fallback
```

This preserves the public widget contract and avoids breaking embedded scripts.

## Security

- OneBrain provisioning calls use a server-side service secret.
- The endpoint must use HMAC request signing with timestamp and replay
  protection.
- Browsers, widgets, and tenant admins never receive OneBrain service keys.
- Provisioning writes audit events with OneBrain project ID, local tenant ID,
  actor type, and fields changed.
- The request should not contain raw customer secrets or provider access tokens.

## Error Handling

- Missing optional colors fall back to the selected preset.
- Invalid colors reject the request instead of silently deploying a broken
  theme.
- Unknown presets fall back only when explicit colors are valid; otherwise the
  request fails.
- OneBrain retries are idempotent.
- A OneBrain outage does not affect already deployed assistants because runtime
  config is stored locally.
- Tenant, mapping, theme, and requested local tool settings are written in a
  single transaction.

## Testing

Add focused tests for:

- signed OneBrain deployment request acceptance and rejection;
- idempotent create/update by `onebrainProjectId`;
- tenant theme generation from `brandTheme`;
- per-tool website overrides winning over project brand;
- legacy `GET /widget/config/:assistantId` returning effective website colors;
- Assad Dar preset values as the default fallback;
- invalid color rejection;
- no duplicate tenant creation on repeated requests.

## Rollout

1. Add brand theme helpers and the Assad Dar preset.
2. Extend shared `WidgetTheme` types to include `brandTheme` and `toolThemes`
   while preserving legacy fields.
3. Add the local OneBrain project deployment mapping.
4. Add the signed OneBrain deployment endpoint.
5. Resolve effective website themes in widget config.
6. Update admin theme editor with project-brand display and reset action.
7. Update seed/default tenant creation to use the Assad Dar preset.
8. Add tests and docs for the new provisioning contract.

## Success Criteria

- OneBrain can trigger a new customer/project deployment.
- The communication platform returns a public assistant ID and widget config URL.
- The new assistant starts with the project brand colors.
- The default preset matches assad-dar.de colors.
- A user can override the website assistant colors inside the tool without
  changing the project brand.
- Repeating the same OneBrain deployment request updates the existing tenant
  instead of creating a duplicate.
