# Voice Edge Audio Quality Design

## Context

The easybell call path is working end to end: SIP registration succeeds, inbound calls are accepted, caller audio is transcribed, `/voice/turn` returns a reply, Gemini synthesizes speech, and RTP audio is sent back to the caller.

The heard output quality is poor in the expected "old telephone" way, without packet drops or stutter. The current media path receives Gemini PCM audio, linearly downsamples it to 8 kHz, then encodes it as G.711 PCMA/PCMU for SIP telephony.

## Goals

- Make the assistant voice clearer and less harsh within the limits of 8 kHz G.711 telephony.
- Prevent the assistant's own playback from being captured as a new caller turn.
- Keep the change low-risk and compatible with the current easybell SIP setup.

## Non-Goals

- Do not switch the provider or replace Gemini in this change.
- Do not implement WebRTC, Opus, G.722, or Gemini Live in this change.
- Do not change easybell account configuration unless testing shows the SIP endpoint offers a better codec.

## Proposed Approach

1. Add a telephony output conditioning step before G.711 encoding:
   - Downsample with simple anti-aliasing instead of direct linear resampling.
   - Normalize assistant PCM to a target peak range.
   - Apply a soft limiter to avoid clipping before G.711 compression.

2. Suppress input VAD while assistant audio is being processed or played:
   - Drop or ignore inbound RTP frames while `processing` is true.
   - Reset VAD after playback so buffered assistant echo cannot trigger another turn.

3. Add focused tests:
   - Audio conditioning keeps output within int16 limits.
   - Downsampling preserves expected output length.
   - RTP handling ignores input while a session is processing.

## Trade-Offs

- This improves clarity but cannot create HD voice over a narrowband PSTN path.
- Anti-aliasing and normalization add small CPU cost, but the workload is tiny for one call.
- Ignoring input during playback avoids echo loops, but true barge-in support can come later.

## Rollout

Build and test locally, deploy the updated voice-edge binary to the Hetzner server, restart the systemd service, and run one live call. Success means the caller hears a clearer voice, no repeated self-triggering happens during playback, and logs still show successful SIP registration, STT, `/voice/turn`, TTS, and RTP send.
