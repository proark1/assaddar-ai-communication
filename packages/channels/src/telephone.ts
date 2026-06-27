import type {
  ChannelAdapter,
  DeliveryResult,
  NormalizedInboundEvent,
  OutboundMessage,
} from "./types";

export class TwilioVoiceAdapter implements ChannelAdapter {
  readonly channel = "telephone" as const;
  readonly provider = "twilio";

  normalizeInbound(
    payload: unknown,
    tenantId: string,
  ): NormalizedInboundEvent[] {
    if (!isRecord(payload)) {
      return [];
    }

    const speechResult =
      typeof payload.SpeechResult === "string"
        ? payload.SpeechResult
        : undefined;
    const digits =
      typeof payload.Digits === "string" ? payload.Digits : undefined;
    const from = typeof payload.From === "string" ? payload.From : undefined;
    const callSid =
      typeof payload.CallSid === "string" ? payload.CallSid : undefined;
    const text = digits === "0" ? "human_transfer_requested" : speechResult;
    if (!text) {
      return [];
    }

    const event: NormalizedInboundEvent = {
      tenantId,
      channel: this.channel,
      provider: this.provider,
      text,
      raw: payload,
    };

    if (typeof payload.To === "string") {
      event.providerAccountId = payload.To;
    }

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
      detail: "Telephone replies are rendered as TwiML by the voice runtime.",
    };
  }
}

export type TwiMLVoiceOptions = {
  actionUrl?: string;
  language?: string;
  voice?: string;
};

export function createTwiMLSay(
  message: string,
  options: TwiMLVoiceOptions = {},
): string {
  const actionUrl = options.actionUrl ?? "/twilio/voice";
  const language = options.language ?? "de-DE";
  const voice = options.voice ?? "alice";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="${escapeXml(language)}" voice="${escapeXml(voice)}">${escapeXml(message)}</Say><Gather input="speech dtmf" action="${escapeXml(actionUrl)}" method="POST" speechTimeout="auto" numDigits="1"><Say language="${escapeXml(language)}" voice="${escapeXml(voice)}">Was kann ich sonst noch helfen? Druecken Sie 0, wenn Sie mit einem Menschen sprechen moechten.</Say></Gather></Response>`;
}

export function createTwiMLGather(
  prompt: string,
  options: TwiMLVoiceOptions = {},
): string {
  const actionUrl = options.actionUrl ?? "/twilio/voice";
  const language = options.language ?? "de-DE";
  const voice = options.voice ?? "alice";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech dtmf" action="${escapeXml(actionUrl)}" method="POST" speechTimeout="auto" numDigits="1"><Say language="${escapeXml(language)}" voice="${escapeXml(voice)}">${escapeXml(prompt)}</Say></Gather></Response>`;
}

export function createTwiMLDial(
  phoneNumber: string,
  options: TwiMLVoiceOptions = {},
): string {
  const language = options.language ?? "de-DE";
  const voice = options.voice ?? "alice";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="${escapeXml(language)}" voice="${escapeXml(voice)}">Ich verbinde Sie jetzt.</Say><Dial>${escapeXml(phoneNumber)}</Dial></Response>`;
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
