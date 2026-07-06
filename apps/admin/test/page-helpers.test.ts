import { describe, expect, it } from "vitest";
import {
  buildAnswerTrustSummary,
  buildContactMemorySummary,
  buildCustomerPortalPreview,
  buildHandoffCopilotSummary,
  buildPlaybookPreview,
  buildTelephoneWarningsFromSettings,
  buildVoiceQualitySummary,
  formatTelephoneMode,
  getAnswer,
  getQuestion,
  normalizeBaseUrl,
  normalizeTelephoneProviderUi,
  parseFaqImport,
  parseTags,
  readableError,
  settingAfterHoursAction,
  settingBoolean,
  settingBusinessHoursMode,
  settingNumber,
  settingRecord,
  settingSpeakingStyle,
  settingString,
  settingTestCallStatus,
  statusTone,
  telephoneProviderLabel,
  telephoneSettingString,
} from "../app/page-helpers";
import type {
  ChannelConnection,
  ContactProfile,
  Conversation,
  Handoff,
  KnowledgeItem,
  TestAnswer,
} from "../app/page-types";

function knowledge(overrides: Partial<KnowledgeItem>): KnowledgeItem {
  return {
    id: "k1",
    content: "",
    tags: [],
    status: "approved",
    ...overrides,
  } as KnowledgeItem;
}

describe("normalizeBaseUrl", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl("  https://api.example.com//  ")).toBe(
      "https://api.example.com",
    );
    expect(normalizeBaseUrl("https://api.example.com")).toBe(
      "https://api.example.com",
    );
  });
});

describe("statusTone", () => {
  it("returns neutral for empty status", () => {
    expect(statusTone("")).toBe("neutral");
  });
  it("flags error-like messages as danger", () => {
    expect(statusTone("Login rejected")).toBe("danger");
    expect(statusTone("API unreachable")).toBe("danger");
    expect(statusTone("Failed to save")).toBe("danger");
  });
  it("treats other messages as success", () => {
    expect(statusTone("Tenant created")).toBe("success");
  });
});

describe("getQuestion / getAnswer", () => {
  it("prefers metadata, falls back to title/content", () => {
    expect(getQuestion(knowledge({ metadata: { question: "Hours?" } }))).toBe(
      "Hours?",
    );
    expect(getQuestion(knowledge({ title: "Opening hours" }))).toBe(
      "Opening hours",
    );
    expect(getQuestion(knowledge({}))).toBe("Knowledge item");
    expect(getAnswer(knowledge({ metadata: { answer: "9-5" } }))).toBe("9-5");
    expect(getAnswer(knowledge({ content: "Mon-Fri" }))).toBe("Mon-Fri");
  });
});

describe("parseTags", () => {
  it("splits, lowercases, dedupes, and trims", () => {
    expect(parseTags("Sales, support , SALES")).toEqual(["sales", "support"]);
  });
  it("defaults to ['faq'] when empty", () => {
    expect(parseTags("   ")).toEqual(["faq"]);
  });
});

describe("parseFaqImport", () => {
  it("parses question/answer blocks separated by blank lines", () => {
    const result = parseFaqImport(
      "What are your hours?\nMon-Fri 9-5\n\nDo you ship?\nYes, worldwide.",
    );
    expect(result).toEqual([
      { question: "What are your hours?", answer: "Mon-Fri 9-5" },
      { question: "Do you ship?", answer: "Yes, worldwide." },
    ]);
  });
  it("drops blocks whose question or answer is too short", () => {
    expect(parseFaqImport("Hi\nyo")).toEqual([]);
  });
});

describe("readableError", () => {
  it("maps common failures to friendly copy", () => {
    expect(readableError(new Error("Failed to fetch"))).toMatch(/unreachable/i);
    expect(readableError(new Error("401 unauthorized"))).toMatch(/rejected/i);
    expect(readableError(new Error("404 not found"))).toMatch(/not found/i);
  });
  it("extracts error/message from JSON payloads", () => {
    expect(readableError(new Error('{"error":"Slug already exists."}'))).toBe(
      "Slug already exists.",
    );
  });
  it("handles non-Error values", () => {
    expect(readableError("boom")).toBe("Something went wrong.");
  });
});

describe("buildContactMemorySummary", () => {
  it("summarizes channels, missing fields, and open handoffs", () => {
    const contact: ContactProfile = {
      id: "contact-1",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      confidence: 92,
      identifiers: { email: ["ada@example.com"] },
      createdAt: "2026-01-01T10:00:00.000Z",
    };
    const conversations: Conversation[] = [
      {
        id: "conversation-1",
        publicId: "pub-1",
        channel: "website",
        contactId: "contact-1",
        status: "open",
        locale: "en",
        createdAt: "2026-01-02T10:00:00.000Z",
      },
      {
        id: "conversation-2",
        publicId: "pub-2",
        channel: "telephone",
        contactId: "contact-1",
        status: "open",
        locale: "en",
        createdAt: "2026-01-03T10:00:00.000Z",
      },
    ];
    const handoffs: Handoff[] = [
      {
        id: "handoff-1",
        conversationId: "conversation-2",
        channel: "telephone",
        reason: "lead_capture",
        requesterMessage: "Name: Ada",
        status: "open",
        createdAt: "2026-01-03T10:05:00.000Z",
      },
    ];

    const summary = buildContactMemorySummary(contact, conversations, handoffs);

    expect(summary.label).toBe("Ada Lovelace");
    expect(summary.channels).toEqual(["Website", "Telephone"]);
    expect(summary.openHandoffCount).toBe(1);
    expect(summary.missingFields).toEqual(["phone", "company"]);
    expect(summary.nextAction).toBe("Resolve open handoff");
  });
});

describe("buildHandoffCopilotSummary", () => {
  it("prioritizes urgent requests and exposes missing contact data", () => {
    const handoff: Handoff = {
      id: "handoff-1",
      channel: "website",
      reason: "urgent legal call",
      requesterMessage: "Name: Ada\nCompany: Engine Co\nProject type: AI",
      status: "open",
      createdAt: "2026-01-01T10:00:00.000Z",
    };

    const summary = buildHandoffCopilotSummary(handoff);

    expect(summary.priority).toBe("High");
    expect(summary.suggestedAction).toBe("Take over now");
    expect(summary.missingFields).toEqual(["email", "phone"]);
  });
});

describe("buildAnswerTrustSummary", () => {
  it("rewards confident answers grounded in approved knowledge", () => {
    const answer: TestAnswer = {
      status: "answered",
      text: "We help with AI automation.",
      intent: "services",
      confidence: 0.8,
      handoffRecommended: false,
    };

    const summary = buildAnswerTrustSummary({
      answer,
      matchedKnowledge: knowledge({
        title: "Services",
        content: "We help with AI automation.",
        status: "approved",
      }),
      scenarioPassed: true,
    });

    expect(summary.tone).toBe("good");
    expect(summary.score).toBe(95);
    expect(summary.recommendation).toBe("Keep this answer live");
  });
});

describe("buildVoiceQualitySummary", () => {
  it("surfaces launch blockers for incomplete telephone setup", () => {
    const connection: ChannelConnection = {
      channel: "telephone",
      provider: "easybell",
      label: "Telephone",
      status: "pending",
      credentialConfigured: true,
      settings: {},
    };

    const summary = buildVoiceQualitySummary({
      connection,
      edgeStatus: { status: "offline", url: "https://voice", checkedAt: "" },
      checklist: { numberOrdered: true, disclosureConfirmed: true },
      transcriptRetentionDays: 90,
    });

    expect(summary.label).toBe("Setup needed");
    expect(summary.blockers).toEqual([
      "Routing",
      "Voice edge",
      "SIP",
      "Test call",
    ]);
    expect(summary.recommendation).toBe("Fix Routing");
  });
});

describe("telephone setting helpers", () => {
  it("normalizes telephone provider, mode, and setting values", () => {
    const connection: ChannelConnection = {
      channel: "telephone",
      provider: "easybell",
      label: "Telephone",
      status: "connected",
      externalAccountId: "+491234",
      credentialConfigured: true,
      settings: { sipTarget: "sip:tenant@example.com" },
    };

    expect(telephoneSettingString(connection, "sipTarget")).toBe(
      "sip:tenant@example.com",
    );
    expect(formatTelephoneMode("sip_byoc")).toBe("SIP trunk");
    expect(formatTelephoneMode("custom_mode")).toBe("custom mode");
    expect(telephoneProviderLabel("custom_sip")).toBe("Custom SIP");
    expect(telephoneProviderLabel(undefined)).toBe("Not selected");
    expect(normalizeTelephoneProviderUi("sipgate")).toBe("sipgate");
    expect(normalizeTelephoneProviderUi("twilio")).toBe("easybell");
    expect(settingRecord({ ok: true })).toEqual({ ok: true });
    expect(settingRecord(["nope"])).toEqual({});
    expect(settingString("value")).toBe("value");
    expect(settingString(42)).toBeUndefined();
    expect(settingBoolean(false, true)).toBe(false);
    expect(settingBoolean("false", true)).toBe(true);
    expect(settingNumber(12, 1)).toBe(12);
    expect(settingNumber(Number.NaN, 1)).toBe(1);
    expect(settingTestCallStatus("passed")).toBe("passed");
    expect(settingTestCallStatus("unknown")).toBe("not_started");
    expect(settingBusinessHoursMode("after_hours_only")).toBe(
      "after_hours_only",
    );
    expect(settingBusinessHoursMode("weekends")).toBe("always_on");
    expect(settingAfterHoursAction("transfer")).toBe("transfer");
    expect(settingAfterHoursAction("queue")).toBe("answer");
    expect(settingSpeakingStyle("friendly")).toBe("friendly");
    expect(settingSpeakingStyle("verbose")).toBe("professional");
  });

  it("builds telephone setup warnings from persisted settings", () => {
    const warnings = buildTelephoneWarningsFromSettings({
      setupChecklist: {
        numberOrdered: true,
        sipConfigured: false,
        testCallCompleted: false,
      },
      testCall: { status: "failed" },
      gdpr: {},
    });

    expect(warnings.map((warning) => warning.title)).toEqual([
      "SIP routing pending",
      "Test call missing",
      "Fallback number missing",
      "AI disclosure missing",
    ]);
  });
});

describe("buildPlaybookPreview", () => {
  it("tracks consultancy launch progress", () => {
    const preview = buildPlaybookPreview({
      tenantName: "Assad Dar AI Consultancy",
      knowledgeCount: 8,
      missingKnowledgeCount: 0,
      bookingUrl: "https://cal.com/assad",
      leadCaptureEnabled: true,
      readinessEnabled: true,
      automationSettings: { ownerLeadEmailEnabled: true },
      channelConnections: [
        {
          channel: "website",
          provider: "widget",
          label: "Website",
          status: "connected",
          credentialConfigured: true,
          settings: {},
        },
      ],
    });

    expect(preview.completed).toBe(6);
    expect(preview.nextStep).toBe("Channel expansion");
    expect(preview.stage).toBe("Nearly ready");
  });
});

describe("buildCustomerPortalPreview", () => {
  it("creates a project portal preview and readiness score", () => {
    const preview = buildCustomerPortalPreview({
      tenant: {
        name: "Assad Dar AI Consultancy",
        slug: "assad-dar-ai",
        publicId: "tenant_public",
      },
      siteUrl: "https://example.com/",
      bookingUrl: "https://cal.com/assad",
      leadCaptureEnabled: true,
      readinessEnabled: true,
      consentEnabled: true,
      contactsCount: 3,
      conversationsCount: 4,
    });

    expect(preview.url).toBe("https://example.com/portal/assad-dar-ai");
    expect(preview.score).toBe(100);
    expect(preview.primaryAction).toBe("Share preview");
  });
});
