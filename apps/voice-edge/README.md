# Assaddar Voice Edge

Custom SIP/RTP edge for easybell inbound calls. The edge owns telephony media
and speech plumbing; `apps/voice` remains the tenant-aware `/voice/turn`
application bridge.

## Local Commands

```bash
go test ./...
go run ./cmd/voice-edge
```

The local Codex workspace may not have Go installed. GitHub CI installs Go and
runs the service tests from this directory.

## MVP Runtime Flow

```text
easybell SIP/RTP
  -> voice-edge
  -> Gemini speech
  -> apps/voice /voice/turn
  -> Gemini TTS
  -> RTP response audio
```

## Required Environment

```text
VOICE_EDGE_HTTP_PORT=4200
VOICE_EDGE_PUBLIC_IP=203.0.113.10
VOICE_EDGE_SIP_BIND=0.0.0.0:5060
VOICE_EDGE_RTP_PORT_MIN=30000
VOICE_EDGE_RTP_PORT_MAX=30100

EASYBELL_SIP_REGISTRAR=voip.easybell.de
EASYBELL_SIP_USERNAME=...
EASYBELL_SIP_PASSWORD=...
EASYBELL_SIP_FROM_DOMAIN=voip.easybell.de
EASYBELL_PUBLIC_NUMBER=+49...

VOICE_TURN_URL=https://your-voice-domain/voice/turn
VOICE_EDGE_SECRET=...

GEMINI_API_KEY=...
GEMINI_STT_MODEL=gemini-3.1-flash-live-preview
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_VOICE=Kore
VOICE_LOCALE=de-DE
```
