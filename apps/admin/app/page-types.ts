export type Tenant = {
  id: string;
  publicId: string;
  name: string;
  slug: string;
  status?: string;
  defaultLocale?: string;
  tone?: "friendly" | "neutral" | "formal";
  confidenceThreshold?: string | number;
  maxMessageLength?: number;
  retentionDays?: number;
  theme?: WidgetTheme;
};

export type WidgetTheme = {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  launcherLabel?: string;
  openingMessage?: string;
  language?: string;
  position?: "bottom-right" | "bottom-left";
  assistantName?: string;
  leadCaptureEnabled?: boolean;
  leadCaptureIntro?: string;
  leadCaptureFields?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  bookingUrl?: string;
  consentEnabled?: boolean;
  consentText?: string;
  quickReplies?: string[];
  readinessEnabled?: boolean;
  readinessIntro?: string;
  automation?: WidgetAutomationSettings;
};

export type WidgetAutomationSettings = {
  ownerLeadEmailEnabled?: boolean;
  visitorConfirmationEmailEnabled?: boolean;
  autoQualifyReadinessEnabled?: boolean;
  autoQualifyLeadDetailsEnabled?: boolean;
  weeklySummaryEmailEnabled?: boolean;
  staleLeadReminderDays?: number;
  readinessQualificationScore?: number;
};

export type KnowledgeItem = {
  id: string;
  title?: string;
  content: string;
  tags: string[];
  status: string;
  metadata?: {
    question?: string;
    answer?: string;
  };
};

export type Conversation = {
  id: string;
  publicId: string;
  channel: string;
  contactId?: string | null;
  externalUserId?: string | null;
  status: string;
  locale: string;
  createdAt: string;
  updatedAt?: string;
};

export type ContactProfile = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  confidence?: number;
  identifiers?: Record<string, string[]>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type UnifiedInboxItem = Conversation & {
  contact?: ContactProfile | null;
  lastMessage?: {
    id: string;
    direction: string;
    role: string;
    content: string;
    createdAt: string;
  } | null;
  messageCount: number;
  openHandoffs: Array<{
    id: string;
    reason: string;
    status: string;
    assignedTo?: string | null;
    createdAt: string;
  }>;
  nextAction: string;
};

export type ConversationMessage = {
  id: string;
  direction: string;
  role: string;
  content: string;
  trace?: Record<string, unknown>;
  createdAt: string;
};

export type Handoff = {
  id: string;
  conversationId?: string | null;
  channel: string;
  reason: string;
  requesterMessage: string;
  status: string;
  assignedTo?: string | null;
  metadata?: {
    pipelineStage?: LeadPipelineStage;
    notes?: Array<{ body: string; createdAt?: string }>;
    [key: string]: unknown;
  };
  createdAt: string;
};

export type TenantAnalytics = {
  conversations: number;
  messages: number;
  contacts?: number;
  approvedKnowledge: number;
  openHandoffs: number;
  totalHandoffs: number;
  lastConversationAt?: string | null;
  lastMessageAt?: string | null;
  usageByStatus: Array<{
    eventType: string;
    total: number;
    credits: number;
  }>;
  deliveries?: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    other: number;
    failureRate: number;
  };
  quality?: {
    answered: number;
    refused: number;
    handoff: number;
    total: number;
    containmentRate: number;
    refusalRate: number;
    handoffRate: number;
  };
  byChannel?: Array<{
    channel: string;
    inbound: number;
    outbound: number;
    total: number;
  }>;
  voice?: {
    calls: number;
    completed: number;
    avgDurationSeconds: number | null;
    lastCallAt?: string | null;
  };
  window?: {
    days: number;
    conversations: number;
    messages: number;
    handoffs: number;
  };
};

export type WhatsappTemplate = {
  id: string;
  name: string;
  language: string;
  category: "marketing" | "utility" | "authentication";
  status: "draft" | "submitted" | "approved" | "rejected" | "paused";
  body: string;
  variables: string[];
  providerTemplateId?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type WhatsappCompliance = {
  lastInboundAt?: string | null;
  windowClosesAt?: string | null;
  canUseFreeformReply: boolean;
  templates: {
    total: number;
    approved: number;
    draft: number;
    needsAttention: number;
  };
  recentDeliveries: Array<{
    id: string;
    providerMessageId?: string | null;
    status: string;
    detail?: string | null;
    createdAt: string;
  }>;
};

export type WorkflowSuggestion = {
  id: string;
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  detail: string;
  actionLabel: string;
};

export type WorkflowSuggestionsResult = {
  generatedAt: string;
  suggestions: WorkflowSuggestion[];
  counts: {
    suggestions: number;
    openHandoffs: number;
    contacts: number;
    whatsappTemplates: number;
  };
};

export type ProductionReadinessCheck = {
  id: string;
  title: string;
  detail: string;
  status: "pass" | "warn" | "fail";
  actionLabel: string;
  weight: number;
  score: number;
};

export type ProductionReadinessSection = {
  id: string;
  title: string;
  score: number;
  checks: ProductionReadinessCheck[];
};

export type ProductionReadinessResult = {
  generatedAt: string;
  score: number;
  status: "ready_for_beta" | "needs_work" | "not_ready";
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    blockers: ProductionReadinessCheck[];
    nextActions: ProductionReadinessCheck[];
  };
  sections: ProductionReadinessSection[];
};

export type DashboardBootstrap = {
  knowledge: KnowledgeItem[];
  analytics: TenantAnalytics | null;
  conversations: Conversation[];
  unifiedInbox: UnifiedInboxItem[];
  contacts: ContactProfile[];
  handoffs: Handoff[];
  channelConnections: ChannelConnection[];
  whatsappTemplates: WhatsappTemplate[];
  whatsappCompliance: WhatsappCompliance | null;
  unansweredQuestions: UnansweredQuestion[];
  workflowSuggestions: WorkflowSuggestionsResult | null;
  productionReadiness: ProductionReadinessResult | null;
  tenantUsers: TenantUser[];
  tenantInvites: TenantInvite[];
};

export type WebsiteImportResult = {
  sourceUrl: string;
  statusCode: number;
  pagesScanned?: Array<{
    url: string;
    statusCode: number;
    title: string;
  }>;
  title: string;
  detectedLanguage: string;
  summary: string;
  suggestedFaqs: Array<{
    question: string;
    answer: string;
    tags: string[];
  }>;
};

export type AdminSession = {
  authenticated: boolean;
  authType?: "admin_token" | "user_session";
  user: {
    id?: string;
    email: string;
    name: string;
    role:
      | "owner"
      | "admin"
      | "platform_owner"
      | "tenant_owner"
      | "tenant_admin"
      | "operator"
      | "viewer";
  };
  memberships?: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    role:
      | "platform_owner"
      | "tenant_owner"
      | "tenant_admin"
      | "operator"
      | "viewer";
    status: string;
  }>;
  permissions: string[];
};

export type TenantRole =
  | "tenant_owner"
  | "tenant_admin"
  | "operator"
  | "viewer";

export type TenantUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
  membershipStatus?: string;
};

export type TenantInvite = {
  id: string;
  email: string;
  roleName: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export type UnansweredQuestion = {
  id: string;
  conversationId?: string | null;
  channel: string;
  reason: string;
  question: string;
  status: string;
  createdAt: string;
  suggestedTags: string[];
};

export type ChannelConnection = {
  channel: "website" | "whatsapp" | "messenger" | "instagram" | "telephone";
  provider: string;
  label: string;
  status: "pending" | "connected" | "disabled";
  externalAccountId?: string | null;
  webhookUrl?: string;
  assistantWebhookUrl?: string;
  credentialConfigured: boolean;
  settings: Record<string, unknown>;
  updatedAt?: string;
};

export type TelephoneSetupMode = "new_number" | "forwarding" | "sip_byoc";

export type TelephoneProvider =
  | "easybell"
  | "sipgate"
  | "peoplefone"
  | "custom_sip";

export type TelephoneNumberType = "local" | "mobile" | "toll-free";

export type TwilioNumberCapabilities = {
  voice: boolean;
  sms: boolean;
  mms: boolean;
};

export type TwilioOwnedNumber = {
  sid?: string | null;
  phoneNumber?: string | null;
  friendlyName?: string | null;
  isoCountry?: string | null;
  capabilities: TwilioNumberCapabilities;
  voiceUrl?: string | null;
  voiceMethod?: string | null;
};

export type TelephoneComplianceNotice = {
  level: string;
  title: string;
  detail: string;
};

export type TelephoneSetupResponse = {
  connection: ChannelConnection;
  webhookUrl?: string;
  number?: TwilioOwnedNumber;
  instructions?: string[];
  compliance?: TelephoneComplianceNotice;
  warnings?: TelephoneSetupWarning[];
  sipTarget?: string;
};

export type TelephoneSetupWarning = {
  level: "info" | "warn";
  title: string;
  detail: string;
};

export type TelephoneVoiceEdgeStatus = {
  status: "online" | "degraded" | "offline";
  url: string;
  checkedAt: string;
  responseStatus?: number;
  detail?: string;
};

export type InstallCheckResult = {
  checkedUrl: string;
  statusCode: number;
  installed: boolean;
  hasAssistantId: boolean;
  hasWidgetScript: boolean;
  hasApiUrl: boolean;
  evidence: string[];
};

export type TestAnswer = {
  status: string;
  text: string;
  intent: string;
  confidence: number;
  handoffRecommended: boolean;
};

export type ToastKind = "success" | "danger" | "info";

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

export type TabKey = "home" | "leads" | "knowledge" | "channels" | "settings";

export type KnowledgeStatusFilter = "all" | "approved" | "draft";
export type InboxFilter = "all" | "needs_human" | "recent";
export type HandoffFilter = "open" | "in_progress" | "resolved" | "all";
export type WidgetPlatform = "html" | "wordpress" | "webflow" | "shopify";
export type LeadPipelineStage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export type AdminDeepLink = {
  tenantId?: string;
  tab?: TabKey;
  handoffId?: string;
  conversationId?: string;
  inviteToken?: string;
};
