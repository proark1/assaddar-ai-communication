FROM node:22-slim AS deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build

RUN pnpm build

FROM node:22-slim AS app

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
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

# Healthcheck assumes the API service (the only service that exposes an HTTP
# health endpoint). The API listens on API_PORT (falling back to PORT), default
# 4000, and serves `GET /health`. Override HEALTHCHECK_URL when running a
# different service, or disable with `docker run --no-healthcheck`.
# Uses Node's built-in fetch (Node 22) so no curl/wget is required in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch(process.env.HEALTHCHECK_URL || ('http://127.0.0.1:' + (process.env.API_PORT || process.env.PORT || 4000) + '/health')).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "scripts/start-service.mjs"]
