# Production CI/CD Design

## Context

Production currently has two deployment targets:

- Railway runs the HTTP services from the monorepo: API, admin, widget, voice webhook, and workers.
- Hetzner runs `apps/voice-edge`, the SIP/RTP service that talks to easybell.

GitHub is already the source of truth for `main`, and CI already runs lint, tests, typecheck, build, and Go tests for `apps/voice-edge`. The missing piece is a single production deployment workflow that updates Railway and the Hetzner voice edge after `main` passes CI.

## Goals

- Make `main` the only production deployment source.
- Deploy Railway HTTP services through GitHub Actions after CI succeeds.
- Deploy the Hetzner voice edge through GitHub Actions after CI succeeds.
- Verify both targets after deployment.
- Keep secrets in GitHub Actions secrets, not in repo files.

## Non-Goals

- Do not move the SIP/RTP voice edge to Railway. It stays on Hetzner because it needs public UDP SIP/RTP ports.
- Do not replace Railway's Docker-based service setup.
- Do not add database migrations to the automatic deploy workflow yet.
- Do not store production secrets or private keys in the repository.

## Workflow

Create `.github/workflows/deploy-production.yml`.

Trigger:

- `workflow_run` after the existing `CI` workflow completes successfully on `main`.
- `workflow_dispatch` for manual production redeploys.

Jobs:

1. `deploy-railway`
   - Check out the repository.
   - Install Railway CLI.
   - Use `RAILWAY_TOKEN`.
   - Use `RAILWAY_PROJECT_ID` so CI does not depend on local Railway linking.
   - Run `railway up --project <project> --service <service> --environment production --ci` for each service in `RAILWAY_SERVICES`.
   - Default `RAILWAY_SERVICES` to the currently known production services: `assaddar-api assaddar-voice`.

2. `deploy-voice-edge`
   - Use a dedicated GitHub Actions SSH private key.
   - SSH into the Hetzner server.
   - Run:
     - `cd /opt/assaddar-ai-communication`
     - `git fetch origin main`
     - `git reset --hard origin/main`
     - `cd apps/voice-edge`
     - `go test ./...`
     - `go build -o /tmp/assaddar-voice-edge-new ./cmd/voice-edge`
     - `install -m 0755 /tmp/assaddar-voice-edge-new /usr/local/bin/assaddar-voice-edge`
     - `systemctl restart assaddar-voice-edge`
     - `systemctl is-active assaddar-voice-edge`

3. `verify-production`
   - Check API health.
   - Check voice webhook health.
   - Check Hetzner voice-edge `/ready`.
   - Fetch recent voice-edge logs and require a successful SIP registration log line.

## Required GitHub Secrets

- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `HETZNER_HOST`
- `HETZNER_USER`
- `HETZNER_SSH_KEY`
- `HETZNER_SSH_PORT`
- `VOICE_EDGE_READY_URL`
- `API_HEALTH_URL`
- `VOICE_HEALTH_URL`

## Optional GitHub Variables

- `RAILWAY_SERVICES`: space-separated Railway service names to deploy. Defaults to `assaddar-api assaddar-voice`.
- `HETZNER_REPO_PATH`: repository path on the Hetzner server. Defaults to `/opt/assaddar-ai-communication`.

## Server Requirements

The Hetzner server must be able to pull the repository from GitHub. Use either:

- a read-only deploy key installed on the server, or
- HTTPS with a limited repository access token stored only on the server.

The GitHub Actions SSH key only needs server access. It should not be the same key as a human user's SSH key.

## Rollout

1. Add the workflow in a pull request or direct `main` commit.
2. Add the required GitHub Actions secrets.
3. Run `workflow_dispatch` once.
4. Confirm Railway services are healthy.
5. Confirm Hetzner voice-edge is active, `/ready` returns OK, and SIP registration succeeds.

## References

- Railway CLI deployment docs: https://docs.railway.com/cli/deploying
- Railway CLI token docs: https://github.com/railwayapp/cli
- GitHub deploy key docs: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
