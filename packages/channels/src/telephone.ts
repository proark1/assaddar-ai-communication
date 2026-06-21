import type { ChannelAdapter, DeliveryResult, NormalizedInboundEvent, OutboundMessage } from "./types";

export class TwilioVoiceAdapter implements ChannelAdapter {
  readonly channel = "telephone" as const;
  readonly provider = "twilio";

  normalizeInbound(payload: unknown, tenantId: string): NormalizedInboundEvent[] {
    if (!isRecord(payload)) {
      return [];
    }

    const speechResult = typeof payload.SpeechResult === "string" ? payload.SpeechResult : undefined;
    const from = typeof payload.From === "string" ? payload.From : undefined;
    const callSid = typeof payload.CallSid === "string" ? payload.CallSid : undefined;
    if (!speechResult) {
      return [];
    }

    const event: NormalizedInboundEvent = {
      tenantId,
      channel: this.channel,
      provider: this.provider,
      text: speechResult,
      raw: payload
    };

    if (callSid) {
      event.externalConversationId = callSid;
    }

    if (from) {
      event.externalUserId = from;
    }

    return [event];
  }

  async sendMessage(_message: OutboundMessage): Promise<DeliveryResult> {
    return {
      status: "sent",
      detail: "Telephone replies are rendered as TwiML by the voice runtime."
    };
  }
}

export function createTwiMLSay(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(message)}</Say><Gather input="speech" action="/twilio/voice" method="POST" speechTimeout="auto"><Say>What else can I help with?</Say></Gather></Response>`;
}

export function createTwiMLGather(prompt: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="/twilio/voice" method="POST" speechTimeout="auto"><Say>${escapeXml(prompt)}</Say></Gather></Response>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
