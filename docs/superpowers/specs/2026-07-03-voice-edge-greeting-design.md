# Voice Edge Greeting Design

## Context

The easybell voice edge currently accepts inbound calls and then waits silently for caller speech. This feels broken to callers because no assistant voice is heard until the caller speaks and the turn pipeline finishes.

## Goals

- Let the caller hear normal ringing before the assistant answers.
- Answer after about two rings, then play a greeting immediately.
- Start listening for the caller only after the greeting finishes.
- Keep the behavior configurable without changing easybell settings.

## Proposed Flow

1. On inbound `INVITE`, validate SDP and allocate RTP as today.
2. Send `180 Ringing` immediately.
3. Wait for a configurable answer delay, default `5s`.
4. Send `200 OK`.
5. After the call becomes active via `ACK`, play a configured greeting.
6. Reset VAD and begin normal caller turn handling after greeting playback ends.

Default greeting:

`Hallo, hier ist der KI-Assistent von Assad Dar. Wie kann ich Ihnen helfen?`

## Configuration

- `VOICE_EDGE_ANSWER_DELAY_MS`: optional delay before `200 OK`, default `5000`.
- `VOICE_EDGE_GREETING_TEXT`: optional greeting text, default German greeting above.

## Audio Strategy

The first implementation synthesizes the greeting with the existing Gemini TTS provider and caches the resulting PCM in memory after first use. If first-call latency is still too long, a follow-up can prewarm the greeting at service startup or ship a static WAV greeting file.

## Error Handling

- If greeting synthesis fails, log the error and keep the call alive so the caller can speak.
- If the caller hangs up during the answer delay, cancel the session and do not send a late answer.
- If the call is not active yet, do not send RTP greeting packets.

## Tests

- Config defaults parse answer delay and greeting text.
- INVITE handling sends `180 Ringing` before `200 OK`.
- RTP/VAD ignores caller input while the greeting is playing.
- Greeting synthesis failure does not terminate the call session.
