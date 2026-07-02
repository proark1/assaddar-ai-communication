# Custom Voice Edge Design

Date: 2026-07-02

## Summary

Build a self-hosted `voice-edge` service that connects an easybell phone number to Assaddar telephone AI without Twilio, Vapi, Retell, Asterisk, FreeSWITCH, or another PBX/media server. easybell remains the regulated carrier and SIP trunk provider. Gemini provides speech services. Assaddar owns the SIP/RTP edge, turn orchestration, dashboard visibility, storage, handoff policy, and tenant isolation.

The MVP focuses on reliable inbound German test calls:

```text
easybell number
  -> custom SIP REGISTER/INVITE handling
  -> custom RTP media session
  -> Gemini speech-to-text
  -> existing POST /voice/turn
  -> Gemini text-to-speech
  -> RTP audio back to caller
```

## Goals

- Receive inbound calls for an easybell number through a custom SIP/RTP service.
- Keep SIP credentials and carrier secrets inside the voice edge only.
- Reuse the existing `apps/voice` `/voice/turn` endpoint, HMAC contract, tenant lookup, conversation storage, answer engine, and admin telephone setup.
- Use Gemini for speech-to-text and text-to-speech while keeping Assaddar's own answer logic in the existing platform.
- Support one production-like inbound call path that can be tested end to end from a real phone.
- Make the edge observable enough to debug registration, INVITE negotiation, RTP media, speech latency, and failed calls.

## Non-Goals

- No outbound dialing in the first version.
- No multi-carrier abstraction beyond easybell-compatible SIP.
- No Asterisk, FreeSWITCH, Kamailio, OpenSIPS, Twilio, Vapi, Retell, or managed voice-agent bridge.
- No video, call recording, voicemail, conference calls, IVR trees, DTMF workflows, or warm human transfer in the first version.
- No full SIP feature coverage. The MVP implements the subset required for authenticated easybell registration and inbound calls.

## Service Shape

Add a new Go service at `apps/voice-edge` in the monorepo. Go is the preferred runtime because the edge needs low-level UDP sockets, concurrent call sessions, long-running WebSocket connections, and deterministic packet timing.

The service exposes:

- SIP UDP listener, default `0.0.0.0:5060`.
- RTP UDP port pool, default configurable range such as `30000-30100`.
- HTTP health endpoints, default `:4200/health` and `:4200/ready`.
- Structured logs for SIP transactions, media sessions, Gemini calls, and `/voice/turn` calls.

The existing `apps/voice` service remains the application bridge. It does not receive SIP or RTP directly.

## Components

### SIP Transport

Responsibilities:

- Listen on UDP for SIP messages.
- Send outbound `REGISTER` requests to easybell.
- Handle digest authentication challenges for `REGISTER`.
- Refresh registration before expiry.
- Parse inbound `INVITE`, `ACK`, `BYE`, and `CANCEL`.
- Respond with `100 Trying`, `180 Ringing`, `200 OK`, `4xx`, and `5xx` as needed.
- Generate and parse SDP offers/answers.

MVP constraints:

- UDP transport first.
- TLS/SRTP are deferred until the plain SIP/RTP path is proven.
- One easybell account/trunk per service instance for the first version.

### RTP Media Session

Responsibilities:

- Allocate a local UDP RTP port per call.
- Parse RTP headers.
- Decode G.711 A-law/PCMA as the primary codec.
- Optionally decode G.711 u-law/PCMU if offered.
- Maintain sequence number and timestamp state.
- Apply a small jitter buffer before speech processing.
- Encode generated audio back to G.711 and packetize as RTP.

MVP constraints:

- 20 ms audio frames.
- 8 kHz mono telephony audio.
- No RTCP in the first version unless easybell requires it for stable calls.

### Audio Pipeline

Inbound:

```text
RTP G.711 8 kHz
  -> linear PCM 8 kHz
  -> resample to PCM 16 kHz
  -> voice activity detection
  -> Gemini STT
  -> text turn
```

Outbound:

```text
/voice/turn reply text
  -> Gemini TTS
  -> PCM 24 kHz
  -> resample to PCM 8 kHz
  -> G.711 encode
  -> RTP packet stream
```

The MVP uses a simple energy-based voice activity detector with silence thresholds. It is isolated behind an interface so a WebRTC VAD can replace it without changing SIP/RTP code.

### Gemini Speech Provider

Responsibilities:

- Transcribe caller speech to text.
- Synthesize Assaddar answer text to audio.
- Normalize Gemini audio formats to the edge pipeline.

Initial strategy:

- Use one Gemini Live API session per active call for speech-to-text.
- Use Gemini TTS for exact answer playback.
- Keep Gemini responsible for speech only. The business answer still comes from Assaddar's existing `/voice/turn` endpoint.

Relevant Gemini constraints from official docs:

- Gemini Live API accepts raw 16-bit little-endian PCM audio and documents 16 kHz input as native.
- Gemini Live API audio output is raw 16-bit little-endian PCM at 24 kHz.
- Gemini TTS accepts text input and returns audio output suitable for exact answer playback.

### Turn Bridge Client

Responsibilities:

- Call `POST /voice/turn?assistantId=asst_public_id`, replacing `asst_public_id` with the assistant ID parsed from the SIP target URI.
- Include `text`, `callId`, `from`, `to`, `provider`, `locale`, and metadata.
- Sign requests with `x-voice-edge-timestamp` and `x-voice-edge-signature` using `VOICE_EDGE_SECRET`.
- Parse `reply`, `status`, `confidence`, `handoffRecommended`, and `transferPhoneNumber`.

This preserves the existing app boundary: the voice edge handles telephony and speech; `apps/voice` handles tenant context, persistence, answer generation, usage logging, and handoff policy.

### Call Session State

Each call session tracks:

- SIP dialog IDs: Call-ID, From tag, To tag, CSeq, branch.
- Remote and local RTP addresses.
- Codec, packetization interval, RTP sequence, timestamp, SSRC.
- Public assistant ID from SIP URI user, for example `sip:asst_xxx@voice-edge.assaddar.de`.
- Caller number from SIP headers where available.
- Public destination number.
- Current phase: ringing, active, listening, thinking, speaking, ended.
- Timing metrics: setup time, first audio time, STT time, `/voice/turn` time, TTS time.

## Configuration

Add `apps/voice-edge` environment variables:

```text
VOICE_EDGE_HTTP_PORT=4200
VOICE_EDGE_PUBLIC_IP=203.0.113.10
VOICE_EDGE_SIP_BIND=0.0.0.0:5060
VOICE_EDGE_RTP_PORT_MIN=30000
VOICE_EDGE_RTP_PORT_MAX=30100

EASYBELL_SIP_REGISTRAR=voip.easybell.de
EASYBELL_SIP_USERNAME=easybell_sip_user_from_secret_manager
EASYBELL_SIP_PASSWORD=easybell_sip_password_from_secret_manager
EASYBELL_SIP_FROM_DOMAIN=voip.easybell.de
EASYBELL_PUBLIC_NUMBER=+49...

VOICE_TURN_URL=https://your-voice-domain/voice/turn
VOICE_EDGE_SECRET=shared_hmac_secret_from_secret_manager

GEMINI_API_KEY=gemini_api_key_from_secret_manager
GEMINI_STT_MODEL=gemini-3.1-flash-live-preview
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_VOICE=Kore
VOICE_LOCALE=de-DE
```

Set the existing API/admin config to:

```text
VOICE_PUBLIC_URL=https://your-voice-domain
VOICE_SIP_DOMAIN=voice-edge.assaddar.de
VOICE_EDGE_SECRET=shared_hmac_secret_from_secret_manager
```

## Admin Integration

The current admin telephone setup already stores provider, public number, SIP registrar, SIP username, `voiceBridgeUrl`, and `sipTarget`. For the MVP, use the existing "SIP trunk" path:

- Provider: `easybell`
- Public number: easybell number in E.164 format
- SIP registrar: `voip.easybell.de`
- SIP username: easybell SIP user
- SIP target: generated as `sip:asst_public_id@voice-edge.assaddar.de`, where `asst_public_id` is the selected tenant assistant's public ID.

No SIP password is stored in the admin dashboard.

## Error Handling

SIP errors:

- Registration auth failure: keep retrying with backoff, expose `/ready` as unhealthy, log sanitized reason.
- Malformed INVITE: respond `400 Bad Request`.
- Unsupported codec: respond `488 Not Acceptable Here`.
- No RTP port available: respond `486 Busy Here` or `503 Service Unavailable`.
- Unknown assistant ID: answer with a short failure prompt if the call is already accepted; otherwise reject the SIP dialog with `404 Not Found`.

Runtime errors:

- Gemini STT failure: play a short retry prompt and allow one repeat.
- `/voice/turn` failure: play a short fallback prompt.
- Gemini TTS failure: play a static pre-generated fallback prompt if available, otherwise end politely.
- RTP timeout: end call with BYE and mark session failed.

Secrets must never appear in logs.

## Observability

Minimum metrics/log fields:

- Registration state and next refresh time.
- Active calls.
- Calls accepted, rejected, failed, completed.
- SIP response status counts.
- RTP packet counts, packet loss estimate, jitter-buffer underruns.
- STT latency, `/voice/turn` latency, TTS latency, end-to-end turn latency.
- Gemini and voice bridge error counts.

Logs use one correlation ID per call, derived from SIP Call-ID plus an internal suffix.

## Testing

Unit tests:

- SIP message parser and serializer.
- Digest authentication response generation.
- SDP offer parsing and answer generation.
- RTP packet encode/decode.
- G.711 A-law encode/decode.
- HMAC signing for `/voice/turn`.

Integration tests:

- Fake easybell SIP server challenges `REGISTER` and sends an inbound `INVITE`.
- Fake RTP peer sends a short G.711 fixture and receives RTP response packets.
- Fake Gemini provider returns deterministic transcript/audio.
- Fake `/voice/turn` returns deterministic answer JSON.

Manual acceptance:

- Service registers successfully with easybell.
- Calling the easybell number reaches `voice-edge`.
- Caller hears an opening prompt or can speak after answer.
- Caller speech appears as a telephone conversation in Assaddar inbox.
- AI response is spoken back over the call.
- Admin checklist can be marked connected after the test call.

## Milestones

1. Scaffold `apps/voice-edge` Go service with config, health endpoints, logs, and CI build command.
2. Implement SIP parser/serializer, UDP listener, REGISTER with digest auth, and registration refresh.
3. Implement inbound INVITE handling, SDP answer generation, and call state.
4. Implement RTP port allocation, G.711 decode/encode, packet timing, and local audio fixtures.
5. Implement Gemini speech provider abstraction with fake provider tests.
6. Implement `/voice/turn` HMAC client and end-to-end fake-call integration test.
7. Connect to easybell in a controlled environment and run a real inbound test call.
8. Add production deployment notes for firewall, NAT, DNS, and secret management.

## Risks

- SIP provider behavior can differ from documentation, especially around NAT, contact headers, and codec negotiation.
- RTP timing bugs create choppy audio quickly; packet scheduling needs careful tests and real-call verification.
- Gemini TTS and Live speech models are preview/evolving in places, so model IDs must be configurable.
- Fully custom SIP/RTP increases maintenance burden compared with a PBX core, but it gives Assaddar full control and avoids telecom platform lock-in.

## References

- Gemini Live API: https://ai.google.dev/gemini-api/docs/live-api
- Gemini Live API audio capabilities: https://ai.google.dev/gemini-api/docs/live-api/capabilities
- Gemini text-to-speech: https://ai.google.dev/gemini-api/docs/speech-generation
- easybell VoIP configuration: https://en.easybell.de/help/telephone-configuration/general/general-guidances-for-voip-configuration/
- Existing Assaddar telephone bridge: `apps/voice/src/index.ts`
- Existing integration notes: `docs/integrations.md`
