# Contributing

Thanks for contributing to the assaddar AI communication platform. This is a
pnpm workspace monorepo containing the API, admin, widget, voice apps, the
background workers, and shared packages (`core`, `db`, `channels`).

## Prerequisites

- **Node.js** >= 22 (see `engines` in `package.json`)
- **pnpm** >= 10 — enable it with `corepack enable` (the repo pins
  `pnpm@10.28.1` via `packageManager`)
- **PostgreSQL** with the `pgvector` extension for running the API locally and
  for migrations/seeds (CI uses the `pgvector/pgvector:pg16` image)

## Getting started

```bash
corepack enable
pnpm install
cp .env.example .env   # if present; otherwise set DATABASE_URL and ADMIN_API_TOKEN
pnpm db:migrate
pnpm db:seed
```

## Repository layout

- `apps/api` — backend API (exposes `GET /health`)
- `apps/admin` — admin dashboard
- `apps/widget` — embeddable chat widget
- `apps/voice` — voice service
- `apps/workers` — background workers (e.g. embedding backfill)
- `packages/core` — shared domain logic and providers
- `packages/db` — database client, migrations, and seed scripts
- `packages/channels` — messaging channel integrations

## Common scripts

Run these from the repository root:

| Script               | What it does                                                          |
| -------------------- | --------------------------------------------------------------------- |
| `pnpm build`         | Build all packages/apps                                               |
| `pnpm dev:api`       | Run the API in dev mode (also `dev:admin`, `dev:widget`, `dev:voice`) |
| `pnpm test`          | Run all package/app test suites                                       |
| `pnpm test:coverage` | Run tests with a v8 coverage report (text + HTML in `coverage/`)      |
| `pnpm typecheck`     | Type-check all packages/apps                                          |
| `pnpm lint`          | Lint with ESLint                                                      |
| `pnpm lint:fix`      | Lint and auto-fix                                                     |
| `pnpm format`        | Format with Prettier                                                  |
| `pnpm format:check`  | Check formatting without writing                                      |
| `pnpm db:migrate`    | Apply database migrations                                             |
| `pnpm db:seed`       | Seed demo data                                                        |
| `pnpm smoke:api`     | Run the API smoke test                                                |

Coverage is informational and non-blocking — it is not wired into CI thresholds.

## Branching and commits

- Branch off `main`. Use descriptive branch names (e.g.
  `feat/widget-typing-indicator`, `fix/api-health-timeout`).
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for
  commit messages, matching the existing history:
  - `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`
  - Optional scope, e.g. `fix(ci): stop smoke test from hanging`.
- Keep commits focused and the working tree clean before opening a PR.

## Before opening a pull request

Make sure the same checks CI runs pass locally:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

A pre-commit hook (Husky + lint-staged) runs ESLint and Prettier on staged
files automatically.

## Pull requests

- Open PRs against `main`.
- Describe what changed and why; link any related issues.
- Ensure CI is green. Reviewers are assigned automatically via
  [`.github/CODEOWNERS`](.github/CODEOWNERS) for sensitive areas (database,
  security, channels).
