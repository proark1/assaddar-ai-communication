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
  -> Gemini speech-to-text
  -> apps/voice /voice/turn
  -> Gemini TTS
  -> RTP response audio
```

The current runtime uses a turn-based speech loop: inbound G.711 RTP is decoded
to PCM, voice activity detection emits caller utterances, Gemini transcribes the
utterance via the Interactions API, `/voice/turn` returns the assistant text, and
Gemini TTS returns PCM that is encoded back to PCMA/PCMU RTP. Gemini Live can
replace the speech provider later for lower latency without changing the SIP
edge contract.

## Required Environment

```text
VOICE_EDGE_HTTP_PORT=4200
VOICE_EDGE_PUBLIC_IP=203.0.113.10
VOICE_EDGE_SIP_BIND=0.0.0.0:5060
VOICE_EDGE_RTP_PORT_MIN=30000
VOICE_EDGE_RTP_PORT_MAX=30100
VOICE_EDGE_ANSWER_DELAY_MS=2000
VOICE_EDGE_GREETING_DELAY_MS=1000
VOICE_EDGE_GREETING_TEXT=Hallo, hier ist der KI-Assistent von Assad Dar. Wie kann ich Ihnen helfen?

EASYBELL_SIP_REGISTRAR=voip.easybell.de
EASYBELL_SIP_USERNAME=...
EASYBELL_SIP_PASSWORD=...
EASYBELL_SIP_FROM_DOMAIN=voip.easybell.de
EASYBELL_PUBLIC_NUMBER=+49...

VOICE_TURN_URL=https://your-voice-domain/voice/turn
VOICE_EDGE_SECRET=...
VOICE_EDGE_ASSISTANT_ID=asst_...

GEMINI_API_KEY=...
GEMINI_STT_MODEL=gemini-3.5-flash
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_VOICE=Kore
VOICE_LOCALE=de-DE
```
