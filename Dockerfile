FROM node:22-slim AS app

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm build

ENV NODE_ENV=production

CMD ["node", "scripts/start-service.mjs"]
