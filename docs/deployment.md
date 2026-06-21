# Deployment

This repo is deployment-ready as a single Docker image that runs different services based on the `SERVICE` environment variable.

## Services

Create one deployed service for each runtime:

| Runtime         | SERVICE value | Start command                    |
| --------------- | ------------- | -------------------------------- |
| API             | `api`         | `node scripts/start-service.mjs` |
| Admin dashboard | `admin`       | `node scripts/start-service.mjs` |
| Widget host     | `widget`      | `node scripts/start-service.mjs` |
| Voice webhook   | `voice`       | `node scripts/start-service.mjs` |
| Workers         | `workers`     | `node scripts/start-service.mjs` |

The shared `Dockerfile` installs the workspace, builds every package, and starts the selected runtime. `railway.toml` tells Railway to build with that Dockerfile.

## Required Variables

Set these on every runtime unless noted otherwise:

```text
NODE_ENV=production
SERVICE=api|admin|widget|voice|workers
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

API:

```text
ADMIN_API_TOKEN=<random 32+ byte token>
WIDGET_ALLOWED_ORIGINS=https://your-admin-domain,https://your-widget-domain,https://customer-site.example
META_VERIFY_TOKEN=<random verify token>
WHATSAPP_ACCESS_TOKEN=<only when WhatsApp sending is enabled>
MESSENGER_PAGE_ACCESS_TOKEN=<only when Messenger/Instagram sending is enabled>
```

Admin:

```text
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain
```

Voice:

```text
TWILIO_ACCOUNT_SID=<when Twilio is enabled>
TWILIO_AUTH_TOKEN=<when Twilio is enabled>
TWILIO_FROM_NUMBER=<when outbound calling is enabled>
VOICE_TRANSFER_NUMBER=<when transfer is enabled>
```

OpenAI is optional for the current deterministic MVP:

```text
OPENAI_API_KEY=<only when provider-backed generation is enabled>
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_VOICE_MODEL=gpt-4o-mini-tts
```

## Railway CLI Flow

```bash
railway init --name assaddar-ai-communication
railway add --service assaddar-api
railway add --service assaddar-admin
railway add --service assaddar-widget
railway add --service assaddar-voice
railway add --service assaddar-workers
railway add --database redis
```

For each service, set `SERVICE` and the required variables, then deploy:

```bash
railway up --service assaddar-api --detach
railway up --service assaddar-admin --detach
railway up --service assaddar-widget --detach
railway up --service assaddar-voice --detach
railway up --service assaddar-workers --detach
```

Generate public domains for API, admin, widget, and voice:

```bash
railway domain --service assaddar-api
railway domain --service assaddar-admin
railway domain --service assaddar-widget
railway domain --service assaddar-voice
```

After domains exist, update:

```text
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain
WIDGET_ALLOWED_ORIGINS=https://your-admin-domain,https://your-widget-domain,https://customer-site.example
```

Then redeploy API and admin.

## Smoke Checks

```bash
curl https://your-api-domain/health
curl https://your-voice-domain/health
curl https://your-widget-domain/widget.js
```

For an end-to-end API check against a deployed API:

```bash
API_BASE_URL=https://your-api-domain pnpm smoke:api
```
