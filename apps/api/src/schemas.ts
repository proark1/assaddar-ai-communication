import { z } from "zod";

const SafeCssColorSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[#a-zA-Z0-9\s.,()%+-]+$/)
  .refine((value) => !/\b(?:expression|url|import)\s*\(/i.test(value), {
    message: "CSS color must not include executable CSS functions.",
  });

const SafeLeadFieldNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/);

export const ParamsTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

export const RoleNameSchema = z.enum([
  "platform_owner",
  "tenant_owner",
  "tenant_admin",
  "operator",
  "viewer",
]);

export const TenantRoleNameSchema = z.enum([
  "tenant_owner",
  "tenant_admin",
  "operator",
  "viewer",
]);

/**
 * Optional pagination query params for list endpoints. Both are coerced from
 * strings and clamped: `limit` to [1, 100], `offset` to >= 0. Omitting them
 * preserves the prior default-page behaviour.
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  status: z.string().trim().min(1).max(40).optional(),
});

export const ParamsKnowledgeSchema = ParamsTenantSchema.extend({
  knowledgeId: z.string().uuid(),
});

export const ParamsKnowledgeSuggestionSchema = ParamsTenantSchema.extend({
  suggestionId: z.string().uuid(),
});

export const ParamsConversationSchema = ParamsTenantSchema.extend({
  conversationId: z.string().uuid(),
});

export const ParamsHandoffSchema = ParamsTenantSchema.extend({
  handoffId: z.string().uuid(),
});

export const ParamsContactSchema = ParamsTenantSchema.extend({
  contactId: z.string().uuid(),
});

export const ParamsAssistantSchema = z.object({
  assistantId: z.string().min(8),
});

export const ParamsMetaChannelSchema = z.object({
  channel: z.enum(["whatsapp", "messenger", "instagram"]),
});

export const ParamsChannelSchema = ParamsTenantSchema.extend({
  channel: z.enum([
    "website",
    "whatsapp",
    "messenger",
    "instagram",
    "telephone",
    "telegram",
    "email",
  ]),
});

export const CreateTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  defaultLocale: z.string().min(2).max(16).optional(),
  theme: z
    .object({
      primaryColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      launcherLabel: z.string().optional(),
      openingMessage: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
});

export const AutomationSettingsSchema = z.object({
  ownerLeadEmailEnabled: z.boolean().optional(),
  visitorConfirmationEmailEnabled: z.boolean().optional(),
  autoQualifyReadinessEnabled: z.boolean().optional(),
  autoQualifyLeadDetailsEnabled: z.boolean().optional(),
  weeklySummaryEmailEnabled: z.boolean().optional(),
  staleLeadReminderDays: z.number().int().min(1).max(30).optional(),
  readinessQualificationScore: z.number().int().min(1).max(100).optional(),
});

export const WidgetThemeSchema = z.object({
  primaryColor: SafeCssColorSchema.optional(),
  backgroundColor: SafeCssColorSchema.optional(),
  textColor: SafeCssColorSchema.optional(),
  launcherLabel: z.string().min(1).max(40).optional(),
  openingMessage: z.string().min(1).max(500).optional(),
  language: z.string().min(2).max(16).optional(),
  position: z.enum(["bottom-right", "bottom-left"]).optional(),
  assistantName: z.string().min(1).max(80).optional(),
  leadCaptureEnabled: z.boolean().optional(),
  leadCaptureIntro: z.string().min(1).max(500).optional(),
  leadCaptureFields: z.array(SafeLeadFieldNameSchema).max(10).optional(),
  ctaLabel: z.string().min(1).max(80).optional(),
  ctaUrl: z.string().url().max(500).optional(),
  bookingUrl: z.string().url().max(500).optional(),
  consentEnabled: z.boolean().optional(),
  consentText: z.string().min(1).max(500).optional(),
  quickReplies: z.array(z.string().min(1).max(120)).max(8).optional(),
  readinessEnabled: z.boolean().optional(),
  readinessIntro: z.string().min(1).max(500).optional(),
  automation: AutomationSettingsSchema.optional(),
});

export const OnboardingProjectSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  defaultLocale: z.string().min(2).max(16).default("de-DE"),
  theme: WidgetThemeSchema.optional(),
});

export const UpdateTenantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  defaultLocale: z.string().min(2).max(16).optional(),
  tone: z.enum(["friendly", "neutral", "formal"]).optional(),
  confidenceThreshold: z.number().min(0.05).max(0.95).optional(),
  maxMessageLength: z.number().int().min(200).max(4000).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  theme: WidgetThemeSchema.optional(),
});

export const AddFaqSchema = z.object({
  question: z.string().min(3).max(500),
  answer: z.string().min(3).max(4000),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export const BrainOnboardingAnswerSchema = z.object({
  questionKey: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/),
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(1).max(4000),
  category: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["draft", "approved", "archived"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpsertBrainOnboardingSchema = z.object({
  answers: z.array(BrainOnboardingAnswerSchema).min(1).max(50),
  publishApproved: z.boolean().optional(),
});

export const KnowledgeSuggestionSourceTypeSchema = z.enum([
  "unanswered_question",
  "human_reply",
  "document_extraction",
  "feedback",
  "manual",
  "conflict_detection",
]);

export const CreateKnowledgeSuggestionSchema = z.object({
  sourceType: KnowledgeSuggestionSourceTypeSchema.default("manual"),
  sourceConversationId: z.string().uuid().nullable().optional(),
  sourceMessageId: z.string().uuid().nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  suggestedQuestion: z.string().trim().min(3).max(500).nullable().optional(),
  suggestedAnswer: z.string().trim().min(3).max(4000).nullable().optional(),
  suggestedTitle: z.string().trim().min(3).max(500).nullable().optional(),
  suggestedTags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  suggestedMetadata: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const ReviewKnowledgeSuggestionSchema = z.object({
  question: z.string().trim().min(3).max(500).optional(),
  answer: z.string().trim().min(3).max(4000).optional(),
  title: z.string().trim().min(3).max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  reviewNote: z.string().trim().max(1000).optional(),
});

export const KnowledgeDocumentUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  contentType: z.string().trim().min(1).max(120),
  contentBase64: z.string().min(1).max(7_000_000),
  suggestedTags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  maxSuggestions: z.number().int().min(1).max(20).optional(),
});

export const ScanKnowledgeSuggestionsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

export const UpdateHandoffSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "dismissed"]).optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  pipelineStage: z
    .enum(["new", "contacted", "qualified", "proposal", "won", "lost"])
    .optional(),
  note: z.string().max(1000).optional(),
});

export const TestAssistantSchema = z.object({
  message: z.string().min(1).max(1200),
  locale: z.string().min(2).max(16).optional(),
});

export const WidgetChatSchema = z.object({
  assistantId: z.string().min(8),
  message: z.string().min(1).max(1200),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(16).optional(),
});

export const WidgetLeadSchema = z.object({
  assistantId: z.string().min(8),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  pageUrl: z.string().url().max(500).optional(),
  fields: z
    .record(z.string(), z.string().max(1000))
    .refine(
      (fields) => Object.values(fields).some((value) => value.trim()),
      "At least one lead field is required.",
    ),
});

export const WidgetReadinessSchema = z.object({
  assistantId: z.string().min(8),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  pageUrl: z.string().url().max(500).optional(),
  answers: z
    .record(z.string(), z.string().max(1200))
    .refine(
      (answers) => Object.values(answers).some((value) => value.trim()),
      "At least one readiness answer is required.",
    ),
});

export const WidgetEventSchema = z.object({
  assistantId: z.string().min(8),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  pageUrl: z.string().url().max(500).optional(),
  eventType: z.enum([
    "widget_open",
    "quick_reply_clicked",
    "cta_clicked",
    "intake_mode_selected",
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const MetaWebhookQuerySchema = z.object({
  assistantId: z.string().min(8).optional(),
});

export const ChannelConnectionSchema = z.object({
  channel: z.enum([
    "website",
    "whatsapp",
    "messenger",
    "instagram",
    "telephone",
    "telegram",
    "email",
  ]),
  provider: z.string().min(1).max(80),
  externalAccountId: z.string().max(256).nullable().optional(),
  status: z.enum(["pending", "connected", "disabled"]).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const E164PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format, for example +49301234567.");

export const TelephoneProviderSchema = z.enum([
  "easybell",
  "sipgate",
  "peoplefone",
  "custom_sip",
]);
export const TelephoneNumberTypeSchema = z.enum([
  "local",
  "mobile",
  "toll-free",
]);
export const TwilioNumberTypeSchema = z.enum(["local", "mobile", "toll-free"]);

export const TelephoneCountrySchema = z
  .string()
  .trim()
  .length(2)
  .default("DE")
  .transform((value) => value.toUpperCase());

export const TwilioNumberSearchQuerySchema = z.object({
  country: TelephoneCountrySchema,
  numberType: TwilioNumberTypeSchema.default("local"),
  contains: z.string().trim().min(1).max(32).optional(),
  locality: z.string().trim().min(1).max(80).optional(),
  region: z.string().trim().min(1).max(80).optional(),
  postalCode: z.string().trim().min(1).max(24).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const OnboardingPhoneNumberQuerySchema = z.object({
  country: TelephoneCountrySchema,
  locality: z.string().trim().min(1).max(80).optional(),
  numberType: TelephoneNumberTypeSchema.default("local"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const ReservePhoneNumberSchema = z.object({
  numberId: z.string().uuid(),
});

export const BillingCheckoutSessionSchema = z.object({
  successUrl: z.string().url().max(500).optional(),
  cancelUrl: z.string().url().max(500).optional(),
});

export const TelephoneNumberInventorySchema = z.object({
  provider: TelephoneProviderSchema.default("easybell"),
  phoneNumber: E164PhoneNumberSchema,
  country: TelephoneCountrySchema,
  locality: z.string().trim().min(1).max(80).nullable().optional(),
  numberType: TelephoneNumberTypeSchema.default("local"),
  sipTarget: z.string().trim().min(3).max(240).nullable().optional(),
  assistantId: z.string().trim().min(8).max(120).nullable().optional(),
  status: z
    .enum(["available", "reserved", "assigned", "suspended", "retired"])
    .default("available"),
  assignedTenantId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const TelephoneNumberInventoryUpdateSchema =
  TelephoneNumberInventorySchema.partial();

export const BillableAcceptedCallSchema = z.object({
  providerCallId: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(1).default(1),
  unitAmountCents: z.number().int().min(0).max(10_000).default(10),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const PurchaseTwilioNumberSchema = z.object({
  phoneNumber: E164PhoneNumberSchema,
  numberType: TwilioNumberTypeSchema.default("local"),
  friendlyName: z.string().trim().min(1).max(120).optional(),
  bundleSid: z
    .string()
    .trim()
    .regex(/^BU[0-9a-fA-F]{32}$/)
    .optional(),
  addressSid: z
    .string()
    .trim()
    .regex(/^AD[0-9a-fA-F]{32}$/)
    .optional(),
});

export const ConnectExistingTwilioNumberSchema = z
  .object({
    phoneNumberSid: z
      .string()
      .trim()
      .regex(/^PN[0-9a-fA-F]{32}$/)
      .optional(),
    phoneNumber: E164PhoneNumberSchema.optional(),
    numberType: TwilioNumberTypeSchema.default("local"),
  })
  .refine((input) => input.phoneNumberSid || input.phoneNumber, {
    message: "Provide a Twilio phone number SID or phone number.",
  });

export const NewTelephoneNumberSetupSchema = z.object({
  provider: TelephoneProviderSchema.default("easybell"),
  requestedCountry: TelephoneCountrySchema,
  numberType: TelephoneNumberTypeSchema.default("local"),
  areaCode: z.string().trim().min(1).max(24).optional(),
  locality: z.string().trim().min(1).max(80).optional(),
  orderedNumber: E164PhoneNumberSchema.optional(),
  sipRegistrar: z.string().trim().min(3).max(240).optional(),
  sipUsername: z.string().trim().min(1).max(160).optional(),
  sipConfigured: z.boolean().default(false),
  fallbackNumber: E164PhoneNumberSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const CarrierForwardingSchema = z.object({
  provider: TelephoneProviderSchema.default("easybell"),
  existingNumber: E164PhoneNumberSchema,
  aiNumber: E164PhoneNumberSchema,
  carrierName: z.string().trim().min(1).max(120).optional(),
  forwardingConfirmed: z.boolean().default(false),
  fallbackNumber: E164PhoneNumberSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const SipByocSetupSchema = z.object({
  provider: TelephoneProviderSchema.default("custom_sip"),
  carrierName: z.string().trim().min(1).max(120).optional(),
  sipDomain: z.string().trim().min(3).max(240).optional(),
  sipRegistrar: z.string().trim().min(3).max(240).optional(),
  sipUsername: z.string().trim().min(1).max(160).optional(),
  trunkSid: z.string().trim().min(2).max(160).optional(),
  inboundSipUri: z.string().trim().min(3).max(240).optional(),
  publicNumber: E164PhoneNumberSchema.optional(),
  fallbackNumber: E164PhoneNumberSchema.optional(),
  sipConfigured: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
});

export const TelephoneSettingsSchema = z.object({
  provider: TelephoneProviderSchema.optional(),
  setupChecklist: z
    .object({
      numberOrdered: z.boolean().optional(),
      sipConfigured: z.boolean().optional(),
      testCallCompleted: z.boolean().optional(),
      fallbackSet: z.boolean().optional(),
      disclosureConfirmed: z.boolean().optional(),
    })
    .optional(),
  businessHours: z
    .object({
      mode: z
        .enum(["always_on", "business_hours", "after_hours_only"])
        .default("always_on"),
      timezone: z.string().trim().min(1).max(80).default("Europe/Berlin"),
      hours: z.string().trim().max(240).optional(),
      afterHoursAction: z
        .enum(["answer", "voicemail", "callback", "transfer"])
        .default("answer"),
    })
    .optional(),
  handoffRules: z
    .object({
      lowConfidence: z.boolean().default(true),
      urgentKeywords: z.boolean().default(true),
      officeHoursTransfer: z.boolean().default(false),
      repeatedFailure: z.boolean().default(true),
      askBeforeTransfer: z.boolean().default(true),
    })
    .optional(),
  gdpr: z
    .object({
      disclosureText: z.string().trim().min(1).max(500).optional(),
      recordingEnabled: z.boolean().default(false),
      storeTranscripts: z.boolean().default(true),
      transcriptRetentionDays: z.coerce
        .number()
        .int()
        .min(1)
        .max(3650)
        .default(90),
    })
    .optional(),
  voiceQuality: z
    .object({
      language: z.string().trim().min(2).max(16).default("de-DE"),
      speakingStyle: z
        .enum(["professional", "friendly", "concise"])
        .default("professional"),
      maxAnswerLength: z.coerce.number().int().min(160).max(1200).default(450),
      askBeforeTransfer: z.boolean().default(true),
    })
    .optional(),
  testCall: z
    .object({
      status: z.enum(["not_started", "pending", "passed", "failed"]),
      phoneNumber: E164PhoneNumberSchema.optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .optional(),
});

export const WhatsappTemplateSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9_ -]+$/),
  language: z.string().min(2).max(16).default("de"),
  category: z
    .enum(["marketing", "utility", "authentication"])
    .default("utility"),
  status: z
    .enum(["draft", "submitted", "approved", "rejected", "paused"])
    .default("draft"),
  body: z.string().min(5).max(1024),
  variables: z.array(z.string().min(1).max(80)).max(20).optional(),
  providerTemplateId: z.string().max(240).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const WebsiteImportSchema = z.object({
  url: z.string().url().max(500),
  maxFaqs: z.number().int().min(1).max(12).default(6),
  maxPages: z.number().int().min(1).max(8).default(1),
});

export const InstallCheckSchema = z.object({
  url: z.string().url().max(500),
  assistantId: z.string().min(8),
  widgetUrl: z.string().url().max(500).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email().max(240),
  password: z.string().min(8).max(200),
});

export const CreateTenantUserSchema = z.object({
  email: z.string().email().max(240),
  name: z.string().min(1).max(160),
  role: TenantRoleNameSchema.default("operator"),
  password: z.string().min(8).max(200).optional(),
});

export const CreateTenantInviteSchema = z.object({
  email: z.string().email().max(240),
  role: TenantRoleNameSchema.default("operator"),
});

export const AcceptTenantInviteSchema = z.object({
  token: z.string().min(24).max(240),
  name: z.string().min(1).max(160),
  password: z.string().min(8).max(200),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type OnboardingProjectInput = z.infer<typeof OnboardingProjectSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
export type AddFaqInput = z.infer<typeof AddFaqSchema>;
export type UpsertBrainOnboardingInput = z.infer<
  typeof UpsertBrainOnboardingSchema
>;
export type CreateKnowledgeSuggestionInput = z.infer<
  typeof CreateKnowledgeSuggestionSchema
>;
export type ReviewKnowledgeSuggestionInput = z.infer<
  typeof ReviewKnowledgeSuggestionSchema
>;
export type KnowledgeDocumentUploadInput = z.infer<
  typeof KnowledgeDocumentUploadSchema
>;
export type ScanKnowledgeSuggestionsInput = z.infer<
  typeof ScanKnowledgeSuggestionsSchema
>;
export type UpdateHandoffInput = z.infer<typeof UpdateHandoffSchema>;
export type ChannelConnectionInput = z.infer<typeof ChannelConnectionSchema>;
export type WhatsappTemplateInput = z.infer<typeof WhatsappTemplateSchema>;
export type WidgetThemeInput = z.infer<typeof WidgetThemeSchema>;
export type RoleName = z.infer<typeof RoleNameSchema>;
export type TenantRoleName = z.infer<typeof TenantRoleNameSchema>;
