FROM node:22-slim AS deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build

RUN pnpm build

FROM node:22-slim AS app

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/apps/admin/.next ./apps/admin/.next
COPY --from=build /app/apps/widget/dist ./apps/widget/dist

ENV NODE_ENV=production

# Run as the unprivileged `node` user that ships with the base image.
RUN chown -R node:node /app
USER node

# Healthcheck dispatches on the same SERVICE / RAILWAY_SERVICE_NAME env vars
# as start-service.mjs, so every service (api, admin, widget, voice, workers)
# probes its own `GET /health` endpoint instead of lying by curling the API
# port. Override with HEALTHCHECK_URL, or disable with `docker run
# --no-healthcheck`. When no service env is set it falls back to the historic
# API probe. Uses Node's built-in fetch (Node 22), no curl/wget required.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "scripts/healthcheck.mjs"]

CMD ["node", "scripts/start-service.mjs"]
