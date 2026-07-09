# easybell Custom Voice Edge Railway Design

Date: 2026-07-09

## Summary

Keep easybell as the telephone provider and use the existing Hetzner Germany
server as the SIP/RTP edge. Railway remains the product and application layer:
tenant lookup, `/voice/turn`, answer generation, conversation storage, usage
logging, admin UI, Postgres, Redis, workers, and retention controls.

Inspection found that the Hetzner server already runs the custom Go
`assaddar-voice-edge` service. It is registered with easybell and accepting
inbound SIP INVITEs. The next milestone is therefore not to install Asterisk
first. The next milestone is to fix and harden the existing custom edge, then
use Asterisk only as a fallback if the custom edge cannot pass real-call
acceptance.

```text
Caller
  -> easybell number / SIP trunk
  -> Hetzner Nürnberg server
       custom assaddar-voice-edge
       SIP registration and inbound INVITE handling
       RTP receive/send
       speech pipeline
  -> Railway assaddar-voice
       signed POST /voice/turn
       tenant context, answer engine, storage, usage
  -> Hetzner edge sends audio reply back to caller
```

## Current State

Hetzner server:

- Hostname: `ubuntu-4gb-nbg1-1`
- Public IPv4: `167.233.166.192`
- Region: Nürnberg, Germany
- OS: Ubuntu 24.04.4 LTS
- Firewall allows SSH, SIP UDP `5060`, RTP UDP `30000-30100`, and TCP `4200`.
- `assaddar-voice-edge.service` is installed, enabled, and running.
- `/health` and `/ready` on localhost port `4200` return healthy JSON.

Runtime observations:

- `assaddar-voice-edge` listens on SIP UDP `5060`.
- It allocates RTP ports in the configured `30000-30100` range.
- It successfully registers with `voip.easybell.de`.
- Recent logs show inbound INVITEs accepted with codec `PCMU`.
- Recent logs also show calls ending with `without ack`, so SIP dialog
  completion, advertised contact headers, NAT/public-address behavior, or the
  caller/provider call flow needs debugging before production use.

Existing edge config, redacted:

- easybell registrar: `voip.easybell.de`
- easybell trunk username: configured on the server
- easybell public number: configured on the server
- Railway turn URL:
  `https://assaddar-voice-production.up.railway.app/voice/turn`
- `VOICE_EDGE_SECRET`: configured on the server and must match Railway voice.
- `VOICE_EDGE_ASSISTANT_ID`: currently configured and must be validated against
  the intended Railway tenant before live testing.
- Gemini speech credentials are configured on the server.

Security note: the root password was exposed during setup. Once key-based SSH is
confirmed, rotate the root password and disable password SSH login or restrict
it to emergency console-only access.

## Goals

- Keep easybell as the only telephone provider for the prototype.
- Keep the phone call media edge in Germany/EU on the existing Hetzner server.
- Keep Railway as the app brain and data plane.
- Reuse the existing custom `apps/voice-edge` implementation where feasible.
- Make one inbound easybell test call work end to end:
  - phone rings through easybell,
  - edge answers,
  - caller audio is processed,
  - Railway `/voice/turn` receives a signed turn,
  - the answer is spoken back,
  - the conversation and usage event appear in Railway data.
- Keep the provider boundary modular so Asterisk, FreeSWITCH, or a future edge
  can replace the custom Go edge without changing the Railway answer contract.

## Non-Goals

- Do not move SIP/RTP directly to Railway.
- Do not use Twilio, Telnyx, Vapi, Retell, or another telecom provider for the
  initial easybell prototype.
- Do not install Asterisk first while the existing custom edge is close to
  working.
- Do not store call recordings by default.
- Do not commit SIP passwords, Railway secrets, root passwords, Gemini keys, or
  other credentials to the repository.
- Do not broaden the firewall beyond the existing prototype ports unless a
  specific test requires it.

## Architecture

### Hetzner Voice Edge

The Hetzner server owns the network capabilities Railway does not provide:

- public SIP listener,
- UDP RTP port range,
- easybell SIP registration,
- SIP dialog handling,
- G.711 telephony media handling,
- speech provider calls,
- signed turn requests to Railway,
- local call-session lifecycle.

The systemd unit remains the operational entrypoint:

```text
/etc/systemd/system/assaddar-voice-edge.service
/etc/assaddar/voice-edge.env
/usr/local/bin/assaddar-voice-edge
```

Before any change, back up the existing binary, unit, and environment file.

### Railway Voice Turn Bridge

Railway `assaddar-voice` remains the tenant-aware runtime:

```text
POST /voice/turn?assistantId=<public assistant id>
```

The edge signs requests with:

- `x-voice-edge-timestamp`
- `x-voice-edge-signature`

Railway verifies the shared `VOICE_EDGE_SECRET`, resolves the assistant tenant,
creates or finds the telephone conversation, stores inbound/outbound messages,
runs the answer engine, logs usage, and returns:

```json
{
  "reply": "answer text",
  "status": "answered",
  "confidence": 0.9,
  "handoffRecommended": false,
  "transferPhoneNumber": null
}
```

### Asterisk Fallback

Asterisk is a fallback, not the default implementation path.

Use Asterisk only if the custom edge fails one of these acceptance gates after a
focused debugging pass:

- cannot complete easybell SIP dialogs reliably,
- cannot maintain stable RTP media for a real call,
- cannot produce understandable audio,
- requires too much custom SIP work to become safe quickly.

If Asterisk is needed, it should run on the same Hetzner server as a thin SIP/RTP
front end, forwarding call media or turns to the same Railway `/voice/turn`
contract.

## Implementation Phases

### Phase 1: Baseline And Backups

- Confirm SSH key login works from the local workstation.
- Back up:
  - `/usr/local/bin/assaddar-voice-edge`
  - `/etc/systemd/system/assaddar-voice-edge.service`
  - `/etc/assaddar/voice-edge.env`
- Capture current health, `ss -tulpen`, `ufw status`, and recent journal logs.
- Rotate the exposed root password.
- Confirm whether password SSH login is enabled and disable it after key access
  is proven.

### Phase 2: Config Alignment

- Verify `VOICE_EDGE_SECRET` matches Railway `assaddar-voice`.
- Verify `VOICE_EDGE_ASSISTANT_ID` points to the intended Railway assistant.
- Verify `VOICE_TURN_URL` reaches the current Railway production voice service.
- Confirm easybell public number, registrar, username, and public IP.
- Ensure RTP range in config, UFW, and Hetzner firewall all match
  `30000-30100`.

### Phase 3: SIP ACK Debugging

- Reproduce a real inbound call while tailing structured logs.
- Capture sanitized SIP transaction details:
  - INVITE,
  - provisional responses,
  - 200 OK contact and SDP,
  - ACK presence or absence,
  - BYE/CANCEL behavior.
- Check whether the edge advertises the correct public contact IP and RTP
  address.
- Check whether easybell sends ACK to the advertised address and port.
- Fix the smallest failing boundary first: contact header, Via/rport handling,
  SDP connection address, dialog matching, or ACK parser/matcher.

### Phase 4: Media And Turn Path

- Confirm RTP packets arrive after answer.
- Confirm codec negotiation is stable for easybell, initially `PCMU` and/or
  `PCMA`.
- Confirm speech recognition receives caller audio.
- Confirm the edge calls Railway `/voice/turn` with the expected assistant,
  call ID, caller number, destination number, provider, locale, and metadata.
- Confirm Railway returns an answer and logs the telephone conversation.
- Confirm TTS audio is sent back over RTP.

### Phase 5: Hardening

- Restrict TCP `4200` to localhost or admin-only access unless an external
  health check truly needs it.
- Add or verify `Restart=always`, log retention, and systemd resource limits.
- Add log redaction for credentials and caller data where needed.
- Ensure call recording is off by default.
- Keep only minimal operational logs.
- Add a short GDPR voice disclosure prompt before AI handling when the product
  is shown beyond an internal prototype.

## Testing

Local/repo tests:

- Build `apps/voice-edge` from the repository.
- Run existing Go tests for SIP, RTP, G.711, media, and turn-bridge logic.
- Run `apps/voice` typecheck/tests for `/voice/turn` signature verification and
  telephone answer behavior.

Server checks:

- `systemctl status assaddar-voice-edge`
- `curl http://127.0.0.1:4200/health`
- `curl http://127.0.0.1:4200/ready`
- `journalctl -u assaddar-voice-edge -f`
- `ss -tulpen`

Manual acceptance:

1. easybell registration succeeds.
2. A real phone call reaches the Hetzner edge.
3. The SIP dialog receives ACK and stays active.
4. RTP arrives and leaves through the configured range.
5. The caller hears a greeting or AI response.
6. Railway receives `/voice/turn`.
7. The conversation appears under the intended assistant/tenant.
8. The call ends cleanly without orphaned sessions.

## Risks

- easybell may behave differently for trunk calls than generic SIP examples,
  especially around Contact, Via, rport, and public SDP addresses.
- The existing custom SIP implementation may need narrow protocol fixes before
  it is stable.
- Speech model IDs may drift; all model IDs must stay configurable.
- The current firewall exposes health port `4200` publicly. This should be
  tightened after debugging.
- The current server runs the edge as root. This is acceptable for immediate
  debugging but should move to a dedicated service user after the call path is
  proven.

## Rollback

- Keep the existing binary and config backups before deploying any change.
- If a new binary fails health or SIP registration, restore the previous binary
  and restart `assaddar-voice-edge.service`.
- If the custom edge cannot pass real-call acceptance quickly, install Asterisk
  on the same Hetzner server and route easybell into the same Railway turn
  contract.

## References

- Existing repo edge implementation: `apps/voice-edge`
- Existing Railway voice bridge: `apps/voice/src/index.ts`
- Existing voice edge design:
  `docs/superpowers/specs/2026-07-02-custom-voice-edge-design.md`
- Railway voice service:
  `https://assaddar-voice-production.up.railway.app/health`
- easybell SIP registrar: `voip.easybell.de`
