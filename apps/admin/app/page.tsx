"use client";

import {
  AlertCircle,
  BarChart3,
  Bot,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Filter,
  Globe2,
  Inbox,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  Menu,
  MessageCircle,
  MessageSquare,
  PhoneCall,
  Plus,
  RadioTower,
  RefreshCw,
  Router,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  ShoppingCart,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { APP_CONFIG } from "./config";
import { getSupabaseClient } from "./supabase-client";
import { AdminSidebar } from "./AdminSidebar";
import { DeleteKnowledgeModal } from "./DeleteKnowledgeModal";
import { DashboardMetrics } from "./DashboardMetrics";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { useDebouncedValue, useDialogA11y, useToasts } from "./dashboard-hooks";
import {
  buildAnswerTrustSummary,
  buildContactMemorySummary,
  buildCustomerPortalPreview,
  buildFollowUpIcs,
  buildHandoffCopilotSummary,
  buildLeadReplyDraft,
  buildLeadSummary,
  buildMailtoHref,
  buildPlaybookPreview,
  buildTelephoneWarningsFromSettings,
  buildVoiceQualitySummary,
  buildWidgetSnippets,
  defaultTheme,
  defaultWidgetUrl,
  extractTemplateVariablesFromBody,
  fieldLabel,
  findBestKnowledgeMatch,
  formatDate,
  formatPercent,
  formatTelephoneMode,
  formatWindowState,
  getAnswer,
  getAnswerWarnings,
  getContactDisplayName,
  getContactSubtitle,
  getKnowledgeText,
  getLeadContactEmail,
  getLeadContactPhone,
  getLeadDisplayName,
  getLeadFollowUpDate,
  getLeadNextStep,
  getLeadScore,
  getPipelineStage,
  getQuestion,
  getUsageTotal,
  groupUnansweredQuestions,
  isFollowUpDue,
  isHandoffFilter,
  isLeadOlderThan,
  isLeadRecent,
  mergeTheme,
  normalizeBaseUrl,
  normalizeTelephoneProviderUi,
  parseFaqImport,
  parseLeadDetails,
  parseTags,
  rate,
  readableError,
  readAdminDeepLink,
  settingAfterHoursAction,
  settingBoolean,
  settingBusinessHoursMode,
  settingNumber,
  settingRecord,
  settingSpeakingStyle,
  settingString,
  settingTestCallStatus,
  statusTone,
  suggestFaqAnswerFromUnanswered,
  tabs,
  telephoneProviderGuideUrl,
  telephoneProviderLabel,
  telephoneSettingString,
  titleCase,
} from "./page-helpers";
import type {
  AdminDeepLink,
  AdminSession,
  ChannelConnection,
  Conversation,
  ConversationMessage,
  ContactProfile,
  DashboardBootstrap,
  Handoff,
  HandoffFilter,
  InboxFilter,
  InstallCheckResult,
  KnowledgeIngestionJob,
  KnowledgeItem,
  KnowledgeSuggestion,
  KnowledgeStatusFilter,
  LeadPipelineStage,
  OnboardingPhoneNumbersResult,
  OnboardingState,
  TabKey,
  Tenant,
  TenantAnalytics,
  TenantInvite,
  TenantRole,
  TenantUser,
  TelephoneNumberInventoryItem,
  ProductionReadinessResult,
  TelephoneNumberType,
  TelephoneProvider,
  TelephoneSetupMode,
  TelephoneSetupResponse,
  TelephoneSetupWarning,
  TelephoneVoiceEdgeStatus,
  TestAnswer,
  UnansweredQuestion,
  UnifiedInboxItem,
  WebsiteImportResult,
  WhatsappCompliance,
  WhatsappTemplate,
  WidgetAutomationSettings,
  WidgetPlatform,
  WidgetTheme,
  WorkflowSuggestionsResult,
} from "./page-types";
import { ToastStack } from "./ToastStack";

// App-wide constants are consolidated in ./config (APP_CONFIG). These aliases
// keep the existing references throughout this file readable and unchanged.
const defaultApiBase = APP_CONFIG.api.base;
const defaultSiteUrl = APP_CONFIG.siteUrl;

const channelImplementationGuides: Partial<
  Record<ChannelConnection["channel"], { label: string; url: string }>
> = {
  telephone: {
    label: "SIP trunk setup",
    url: "https://en.easybell.de/business/sip-trunks/",
  },
  whatsapp: {
    label: "WhatsApp webhooks",
    url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/",
  },
  messenger: {
    label: "Messenger webhooks",
    url: "https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks",
  },
  instagram: {
    label: "Instagram webhooks",
    url: "https://developers.facebook.com/docs/instagram-platform/webhooks/",
  },
  telegram: {
    label: "Telegram Bot API",
    url: "https://core.telegram.org/bots/api",
  },
  email: {
    label: "Inbound email setup",
    url: "https://docs.aws.amazon.com/ses/latest/dg/receiving-email.html",
  },
};

const channelExperienceDetails: Record<
  ChannelConnection["channel"],
  {
    group: "Owned channel" | "Messaging app";
    purpose: string;
    nextAction: string;
    tutorial: string[];
  }
> = {
  website: {
    group: "Owned channel",
    purpose: "Put the assistant on the website and capture visitor questions.",
    nextAction: "Open widget setup and verify the install.",
    tutorial: [
      "Copy the website snippet.",
      "Paste it into the website footer.",
      "Run the install check.",
      "Send a test website message.",
    ],
  },
  telephone: {
    group: "Owned channel",
    purpose: "Answer calls with the same knowledge, inbox, and handoff rules.",
    nextAction: "Choose a phone setup path and run a test call.",
    tutorial: [
      "Choose new number, forwarding, or SIP/PBX.",
      "Add the provider details.",
      "Confirm the call notice and handoff rules.",
      "Run a test call.",
    ],
  },
  whatsapp: {
    group: "Messaging app",
    purpose: "Connect WhatsApp Business messages to the shared support inbox.",
    nextAction: "Connect the phone number ID and verify the Meta callback.",
    tutorial: [
      "Prepare Meta Business and WhatsApp Business.",
      "Paste the WhatsApp phone number ID.",
      "Copy the callback URL into Meta.",
      "Send a test WhatsApp message.",
    ],
  },
  messenger: {
    group: "Messaging app",
    purpose: "Answer Facebook Page messages from the same assistant.",
    nextAction: "Map the Facebook Page and subscribe message events.",
    tutorial: [
      "Choose the Facebook Page.",
      "Paste the Page ID.",
      "Subscribe the app to messages.",
      "Send a test Page message.",
    ],
  },
  instagram: {
    group: "Messaging app",
    purpose: "Bring Instagram Professional account DMs into the inbox.",
    nextAction: "Map the Instagram account and verify messaging webhooks.",
    tutorial: [
      "Use an Instagram Professional account.",
      "Confirm it is connected to a Facebook Page.",
      "Paste the Instagram account ID.",
      "Send a test DM.",
    ],
  },
  telegram: {
    group: "Messaging app",
    purpose:
      "Use a Telegram bot for private chats and controlled group replies.",
    nextAction: "Create a bot in BotFather, then paste the bot token.",
    tutorial: [
      "Create a bot with BotFather.",
      "Paste the bot token here.",
      "Check the webhook.",
      "Test a private chat and a group mention.",
    ],
  },
  email: {
    group: "Owned channel",
    purpose: "Turn a support mailbox into tenant-scoped email conversations.",
    nextAction: "Forward a support mailbox to the generated platform address.",
    tutorial: [
      "Choose the support mailbox.",
      "Copy the forwarding address.",
      "Forward incoming support mail.",
      "Send a test email.",
    ],
  },
};

const sampleQuestions = APP_CONFIG.sampleQuestions;

const businessKnowledgeChecks = [
  {
    label: "Services",
    terms: ["service", "leistungen", "automation", "implementation"],
  },
  {
    label: "Lead capture",
    terms: ["contact", "call", "email", "consultation", "termin"],
  },
  {
    label: "Pricing",
    terms: ["price", "pricing", "cost", "budget", "angebot"],
  },
  {
    label: "Data privacy",
    terms: ["privacy", "gdpr", "dsgvo", "data", "daten"],
  },
  {
    label: "Boundaries",
    terms: ["cannot", "not offer", "scope", "human", "handoff"],
  },
];

const leadFieldOptions = [
  "name",
  "email",
  "phone",
  "company",
  "projectType",
  "budget",
  "timeline",
  "contactPreference",
  "message",
];

const pipelineStages: Array<{ key: LeadPipelineStage; label: string }> = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

const listPageSize = 50;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? result);
    };
    reader.readAsDataURL(file);
  });
}

export default function DashboardPage() {
  const [deepLink] = useState<AdminDeepLink>(() => readAdminDeepLink());
  const [apiBase, setApiBase] = useState(defaultApiBase);
  const [adminToken, setAdminToken] = useState("");
  const [supabaseAccessToken, setSupabaseAccessToken] = useState("");
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup" | "admin_token">(
    "login",
  );
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [selfServiceProjectName, setSelfServiceProjectName] = useState("");
  const [selfServiceProjectSlug, setSelfServiceProjectSlug] = useState("");
  const [selfServiceLocality, setSelfServiceLocality] = useState("Berlin");
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState<
    TelephoneNumberInventoryItem[]
  >([]);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState("");
  const [onboardingState, setOnboardingState] =
    useState<OnboardingState | null>(null);
  const [onboardingPrices, setOnboardingPrices] = useState({
    currency: "eur",
    numberMonthlyPriceCents: 300,
    acceptedCallPriceCents: 10,
  });
  const [telephoneInventory, setTelephoneInventory] = useState<
    TelephoneNumberInventoryItem[]
  >([]);
  const [inventoryPhoneNumber, setInventoryPhoneNumber] = useState("");
  const [inventoryLocality, setInventoryLocality] = useState("Berlin");
  const [inventorySipTarget, setInventorySipTarget] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tagInput, setTagInput] = useState("faq");
  const [importText, setImportText] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testAnswer, setTestAnswer] = useState<TestAnswer | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeSuggestions, setKnowledgeSuggestions] = useState<
    KnowledgeSuggestion[]
  >([]);
  const [knowledgeIngestionJobs, setKnowledgeIngestionJobs] = useState<
    KnowledgeIngestionJob[]
  >([]);
  const [knowledgeUploadFile, setKnowledgeUploadFile] = useState<File | null>(
    null,
  );
  const [analytics, setAnalytics] = useState<TenantAnalytics | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unifiedInbox, setUnifiedInbox] = useState<UnifiedInboxItem[]>([]);
  const [contacts, setContacts] = useState<ContactProfile[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [channelConnections, setChannelConnections] = useState<
    ChannelConnection[]
  >([]);
  const [whatsappTemplates, setWhatsappTemplates] = useState<
    WhatsappTemplate[]
  >([]);
  const [whatsappCompliance, setWhatsappCompliance] =
    useState<WhatsappCompliance | null>(null);
  const [workflowSuggestions, setWorkflowSuggestions] =
    useState<WorkflowSuggestionsResult | null>(null);
  const [productionReadiness, setProductionReadiness] =
    useState<ProductionReadinessResult | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [tenantInvites, setTenantInvites] = useState<TenantInvite[]>([]);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<TenantRole>("operator");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("operator");
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [channelAccountDrafts, setChannelAccountDrafts] = useState<
    Record<string, string>
  >({});
  const [telephoneSetupMode, setTelephoneSetupMode] =
    useState<TelephoneSetupMode>("new_number");
  const [newNumberProvider, setNewNumberProvider] =
    useState<TelephoneProvider>("easybell");
  const [newNumberCountry, setNewNumberCountry] = useState("DE");
  const [newNumberType, setNewNumberType] =
    useState<TelephoneNumberType>("local");
  const [newNumberAreaCode, setNewNumberAreaCode] = useState("");
  const [newNumberLocality, setNewNumberLocality] = useState("");
  const [orderedPhoneNumber, setOrderedPhoneNumber] = useState("");
  const [newNumberSipRegistrar, setNewNumberSipRegistrar] = useState("");
  const [newNumberSipUsername, setNewNumberSipUsername] = useState("");
  const [newNumberSipConfigured, setNewNumberSipConfigured] = useState(false);
  const [forwardingProvider, setForwardingProvider] =
    useState<TelephoneProvider>("easybell");
  const [forwardingExistingNumber, setForwardingExistingNumber] = useState("");
  const [forwardingAiNumber, setForwardingAiNumber] = useState("");
  const [forwardingCarrierName, setForwardingCarrierName] = useState("");
  const [forwardingConfirmed, setForwardingConfirmed] = useState(false);
  const [sipProvider, setSipProvider] = useState<TelephoneProvider>("easybell");
  const [sipCarrierName, setSipCarrierName] = useState("");
  const [sipDomain, setSipDomain] = useState("");
  const [sipRegistrar, setSipRegistrar] = useState("");
  const [sipUsername, setSipUsername] = useState("");
  const [sipTrunkSid, setSipTrunkSid] = useState("");
  const [sipInboundUri, setSipInboundUri] = useState("");
  const [sipPublicNumber, setSipPublicNumber] = useState("");
  const [sipConfigured, setSipConfigured] = useState(false);
  const [telephoneFallbackNumber, setTelephoneFallbackNumber] = useState("");
  const [telephoneNotes, setTelephoneNotes] = useState("");
  const [phoneNumberOrdered, setPhoneNumberOrdered] = useState(false);
  const [phoneSipConfigured, setPhoneSipConfigured] = useState(false);
  const [phoneTestCallCompleted, setPhoneTestCallCompleted] = useState(false);
  const [phoneFallbackSet, setPhoneFallbackSet] = useState(false);
  const [phoneDisclosureConfirmed, setPhoneDisclosureConfirmed] =
    useState(false);
  const [telephoneTestCallStatus, setTelephoneTestCallStatus] = useState<
    "not_started" | "pending" | "passed" | "failed"
  >("not_started");
  const [telephoneTestCallNumber, setTelephoneTestCallNumber] = useState("");
  const [telephoneTestCallNotes, setTelephoneTestCallNotes] = useState("");
  const [businessHoursMode, setBusinessHoursMode] = useState<
    "always_on" | "business_hours" | "after_hours_only"
  >("always_on");
  const [businessHoursTimezone, setBusinessHoursTimezone] =
    useState("Europe/Berlin");
  const [businessHoursText, setBusinessHoursText] =
    useState("Mo-Fr 09:00-18:00");
  const [afterHoursAction, setAfterHoursAction] = useState<
    "answer" | "voicemail" | "callback" | "transfer"
  >("answer");
  const [handoffLowConfidence, setHandoffLowConfidence] = useState(true);
  const [handoffUrgentKeywords, setHandoffUrgentKeywords] = useState(true);
  const [handoffOfficeHoursTransfer, setHandoffOfficeHoursTransfer] =
    useState(false);
  const [handoffRepeatedFailure, setHandoffRepeatedFailure] = useState(true);
  const [handoffAskBeforeTransfer, setHandoffAskBeforeTransfer] =
    useState(true);
  const [phoneDisclosureText, setPhoneDisclosureText] = useState(
    "Hinweis: Dieser Anruf wird von einem KI-Assistenten verarbeitet. Bei Bedarf verbinden wir Sie mit einem Menschen.",
  );
  const [phoneRecordingEnabled, setPhoneRecordingEnabled] = useState(false);
  const [phoneStoreTranscripts, setPhoneStoreTranscripts] = useState(true);
  const [phoneTranscriptRetentionDays, setPhoneTranscriptRetentionDays] =
    useState(90);
  const [phoneVoiceLanguage, setPhoneVoiceLanguage] = useState("de-DE");
  const [phoneSpeakingStyle, setPhoneSpeakingStyle] = useState<
    "professional" | "friendly" | "concise"
  >("professional");
  const [phoneMaxAnswerLength, setPhoneMaxAnswerLength] = useState(450);
  const [telephoneWarnings, setTelephoneWarnings] = useState<
    TelephoneSetupWarning[]
  >([]);
  const [voiceEdgeStatus, setVoiceEdgeStatus] =
    useState<TelephoneVoiceEdgeStatus | null>(null);
  const [telephoneInstructions, setTelephoneInstructions] = useState<string[]>(
    [],
  );
  const [unansweredQuestions, setUnansweredQuestions] = useState<
    UnansweredQuestion[]
  >([]);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editingSuggestionId, setEditingSuggestionId] = useState("");
  const [suggestionQuestionDraft, setSuggestionQuestionDraft] = useState("");
  const [suggestionAnswerDraft, setSuggestionAnswerDraft] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeStatusFilter, setKnowledgeStatusFilter] =
    useState<KnowledgeStatusFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [inboxSearch, setInboxSearch] = useState("");
  const [handoffFilter, setHandoffFilter] = useState<HandoffFilter>("open");
  const [contactSearch, setContactSearch] = useState("");
  const [knowledgeHasMore, setKnowledgeHasMore] = useState(false);
  const [inboxHasMore, setInboxHasMore] = useState(false);
  const [contactsHasMore, setContactsHasMore] = useState(false);
  const [handoffsHasMore, setHandoffsHasMore] = useState(false);
  const [showAdvancedConnection, setShowAdvancedConnection] = useState(false);
  const [connectionAttempted, setConnectionAttempted] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] =
    useState<KnowledgeItem | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [leadNote, setLeadNote] = useState("");
  const [leadFollowUpDate, setLeadFollowUpDate] = useState("");
  const [leadReplyDraft, setLeadReplyDraft] = useState("");
  const [leadReplyTone, setLeadReplyTone] = useState<
    "friendly" | "formal" | "short"
  >("friendly");
  const [widgetPlatform, setWidgetPlatform] = useState<WidgetPlatform>("html");
  const [copiedSnippet, setCopiedSnippet] = useState("");
  const [siteUrl, setSiteUrl] = useState(defaultSiteUrl);
  const [templateName, setTemplateName] = useState("continue_conversation");
  const [templateLanguage, setTemplateLanguage] = useState<string>(
    APP_CONFIG.defaultLanguage,
  );
  const [templateCategory, setTemplateCategory] =
    useState<WhatsappTemplate["category"]>("utility");
  const [templateStatus, setTemplateStatus] =
    useState<WhatsappTemplate["status"]>("draft");
  const [templateBody, setTemplateBody] = useState(
    "Hallo {{name}}, wir koennen Ihre Anfrage gerne weiter bearbeiten. Antworten Sie bitte auf diese Nachricht, damit wir fortfahren koennen.",
  );
  const [crawlMaxPages, setCrawlMaxPages] = useState(4);
  const [websiteImport, setWebsiteImport] =
    useState<WebsiteImportResult | null>(null);
  const [installCheck, setInstallCheck] = useState<InstallCheckResult | null>(
    null,
  );
  const [assistantName, setAssistantName] = useState(
    defaultTheme.assistantName,
  );
  const [widgetPrimaryColor, setWidgetPrimaryColor] = useState(
    defaultTheme.primaryColor,
  );
  const [widgetBackgroundColor, setWidgetBackgroundColor] = useState(
    defaultTheme.backgroundColor,
  );
  const [widgetTextColor, setWidgetTextColor] = useState(
    defaultTheme.textColor,
  );
  const [widgetLauncherLabel, setWidgetLauncherLabel] = useState(
    defaultTheme.launcherLabel,
  );
  const [widgetOpeningMessage, setWidgetOpeningMessage] = useState(
    defaultTheme.openingMessage,
  );
  const [widgetLanguage, setWidgetLanguage] = useState(defaultTheme.language);
  const [widgetPosition, setWidgetPosition] = useState<
    "bottom-right" | "bottom-left"
  >(defaultTheme.position);
  const [leadCaptureEnabled, setLeadCaptureEnabled] = useState(
    defaultTheme.leadCaptureEnabled,
  );
  const [leadCaptureIntro, setLeadCaptureIntro] = useState(
    defaultTheme.leadCaptureIntro,
  );
  const [leadCaptureFields, setLeadCaptureFields] = useState<string[]>(
    defaultTheme.leadCaptureFields,
  );
  const [ctaLabel, setCtaLabel] = useState(defaultTheme.ctaLabel);
  const [ctaUrl, setCtaUrl] = useState(defaultTheme.ctaUrl);
  const [bookingUrl, setBookingUrl] = useState(defaultTheme.bookingUrl);
  const [consentEnabled, setConsentEnabled] = useState(
    defaultTheme.consentEnabled,
  );
  const [consentText, setConsentText] = useState(defaultTheme.consentText);
  const [quickReplies, setQuickReplies] = useState(
    defaultTheme.quickReplies.join("\n"),
  );
  const [readinessEnabled, setReadinessEnabled] = useState(
    defaultTheme.readinessEnabled,
  );
  const [readinessIntro, setReadinessIntro] = useState(
    defaultTheme.readinessIntro,
  );
  const [automationSettings, setAutomationSettings] = useState<
    Required<WidgetAutomationSettings>
  >(defaultTheme.automation);
  const [tenantLocale, setTenantLocale] = useState(defaultTheme.language);
  const [tenantTone, setTenantTone] = useState<
    "friendly" | "neutral" | "formal"
  >("friendly");
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.18);
  const [maxMessageLength, setMaxMessageLength] = useState(1200);
  const [retentionDays, setRetentionDays] = useState(365);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  // Mobile navigation: toggles the sidebar into a slide-in drawer on small screens.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, pushToast, dismissToast } = useToasts();
  const copiedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceRefreshId = useRef(0);
  const inFlightGetRequests = useRef(new Map<string, Promise<unknown>>());
  const debouncedKnowledgeSearch = useDebouncedValue(knowledgeSearch);
  const debouncedInboxSearch = useDebouncedValue(inboxSearch);
  const debouncedContactSearch = useDebouncedValue(contactSearch);

  const normalizedApiBase = normalizeBaseUrl(apiBase);
  const selectedTenant = useMemo(
    () =>
      tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
    [selectedTenantId, tenants],
  );
  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ),
    [conversations, selectedConversationId],
  );
  const handoffConversationIds = useMemo(
    () =>
      new Set(
        handoffs
          .filter((handoff) => handoff.status === "open")
          .map((handoff) => handoff.conversationId)
          .filter(Boolean),
      ),
    [handoffs],
  );
  const inboxItems: UnifiedInboxItem[] = useMemo(
    () =>
      unifiedInbox.length
        ? unifiedInbox
        : conversations.map((conversation) => ({
            ...conversation,
            contact: null,
            lastMessage: null,
            messageCount: 0,
            openHandoffs: [],
            nextAction: handoffConversationIds.has(conversation.id)
              ? "Human follow-up"
              : "Monitor",
          })),
    [conversations, handoffConversationIds, unifiedInbox],
  );
  const selectedInboxItem = useMemo(
    () =>
      inboxItems.find(
        (conversation) => conversation.id === selectedConversationId,
      ) ?? null,
    [inboxItems, selectedConversationId],
  );
  const openHandoffs = useMemo(
    () => handoffs.filter((handoff) => handoff.status === "open"),
    [handoffs],
  );
  const leadHandoffs = useMemo(
    () =>
      handoffs.filter((handoff) =>
        ["lead_capture", "readiness_assessment"].includes(handoff.reason),
      ),
    [handoffs],
  );
  const openLeads = useMemo(
    () => leadHandoffs.filter((handoff) => handoff.status === "open"),
    [leadHandoffs],
  );
  const readinessLeads = useMemo(
    () =>
      handoffs.filter((handoff) => handoff.reason === "readiness_assessment"),
    [handoffs],
  );
  const selectedLead = useMemo(
    () => leadHandoffs.find((handoff) => handoff.id === selectedLeadId) ?? null,
    [leadHandoffs, selectedLeadId],
  );
  const closeLeadDrawer = useCallback(() => setSelectedLeadId(""), []);
  // Focus trap + Escape-to-close + focus restore for the lead details drawer.
  const leadDrawerRef = useDialogA11y(Boolean(selectedLead), closeLeadDrawer);
  const staleLeads = useMemo(
    () =>
      leadHandoffs.filter(
        (handoff) =>
          ["open", "in_progress"].includes(handoff.status) &&
          isLeadOlderThan(handoff, automationSettings.staleLeadReminderDays),
      ),
    [automationSettings.staleLeadReminderDays, leadHandoffs],
  );
  const highIntentLeads = useMemo(
    () =>
      leadHandoffs.filter(
        (handoff) =>
          getLeadScore(handoff) >=
            automationSettings.readinessQualificationScore ||
          ["qualified", "proposal"].includes(getPipelineStage(handoff)),
      ),
    [automationSettings.readinessQualificationScore, leadHandoffs],
  );
  const dueLeads = useMemo(
    () => leadHandoffs.filter(isFollowUpDue),
    [leadHandoffs],
  );
  const hotLeads = useMemo(
    () =>
      leadHandoffs.filter(
        (handoff) =>
          !["resolved", "dismissed"].includes(handoff.status) &&
          getLeadScore(handoff) >=
            automationSettings.readinessQualificationScore,
      ),
    [automationSettings.readinessQualificationScore, leadHandoffs],
  );
  const waitingLeads = useMemo(
    () =>
      leadHandoffs.filter(
        (handoff) =>
          !["resolved", "dismissed"].includes(handoff.status) &&
          ["contacted", "proposal"].includes(getPipelineStage(handoff)),
      ),
    [leadHandoffs],
  );
  const newLeadsThisWeek = useMemo(
    () => leadHandoffs.filter((handoff) => isLeadRecent(handoff, 7)),
    [leadHandoffs],
  );
  const averageLeadScore = useMemo(
    () =>
      leadHandoffs.length
        ? Math.round(
            leadHandoffs.reduce(
              (total, handoff) => total + getLeadScore(handoff),
              0,
            ) / leadHandoffs.length,
          )
        : 0,
    [leadHandoffs],
  );
  const connectedChannelCount = useMemo(
    () =>
      channelConnections.filter(
        (connection) =>
          connection.status === "connected" || connection.channel === "website",
      ).length,
    [channelConnections],
  );
  const knownContactCount = analytics?.contacts ?? contacts.length;
  const telephoneConnection = channelConnections.find(
    (connection) => connection.channel === "telephone",
  );
  const messagingChannelsReady = channelConnections.filter(
    (connection) =>
      ["whatsapp", "messenger", "instagram", "telegram", "email"].includes(
        connection.channel,
      ) &&
      connection.status === "connected" &&
      (connection.credentialConfigured || connection.channel === "email"),
  ).length;
  const unansweredCount = getUsageTotal(analytics, ["handoff", "refused"]);
  const answeredCount = getUsageTotal(analytics, ["answered"]);
  const selectedTags = parseTags(tagInput);
  const duplicateQuestion = knowledge.some(
    (item) =>
      getQuestion(item).trim().toLowerCase() === question.trim().toLowerCase(),
  );
  const answerWarnings = getAnswerWarnings(question, answer, duplicateQuestion);
  const importFaqs = parseFaqImport(importText);
  const knowledgeText = knowledge.map(getKnowledgeText).join(" ").toLowerCase();
  const missingKnowledgeChecks = businessKnowledgeChecks.filter(
    (check) => !check.terms.some((term) => knowledgeText.includes(term)),
  );
  const unansweredTopicGroups = groupUnansweredQuestions(unansweredQuestions);
  const matchedKnowledge = findBestKnowledgeMatch(testMessage, knowledge);
  const approvedKnowledgeCount = knowledge.filter(
    (item) => item.status === "approved",
  ).length;
  const playbookPreview = buildPlaybookPreview({
    tenantName: selectedTenant?.name,
    knowledgeCount: approvedKnowledgeCount,
    channelConnections,
    automationSettings,
    bookingUrl,
    missingKnowledgeCount: missingKnowledgeChecks.length,
    leadCaptureEnabled,
    readinessEnabled,
  });
  const customerPortalPreview = buildCustomerPortalPreview({
    tenant: selectedTenant,
    siteUrl,
    bookingUrl,
    leadCaptureEnabled,
    readinessEnabled,
    consentEnabled,
    contactsCount: knownContactCount,
    conversationsCount: conversations.length,
    openHandoffsCount: openHandoffs.length,
  });
  const currentSnippet = selectedTenant
    ? buildWidgetSnippets(
        widgetPlatform,
        selectedTenant.publicId,
        normalizedApiBase,
      )
    : "";
  const currentTheme: WidgetTheme = {
    assistantName,
    primaryColor: widgetPrimaryColor,
    backgroundColor: widgetBackgroundColor,
    textColor: widgetTextColor,
    launcherLabel: widgetLauncherLabel,
    openingMessage: widgetOpeningMessage,
    language: widgetLanguage,
    position: widgetPosition,
    leadCaptureEnabled,
    leadCaptureIntro,
    leadCaptureFields,
    consentEnabled,
    consentText,
    quickReplies: quickReplies
      .split("\n")
      .map((reply) => reply.trim())
      .filter(Boolean),
    readinessEnabled,
    readinessIntro,
    automation: automationSettings,
  };
  if (ctaLabel) {
    currentTheme.ctaLabel = ctaLabel;
  }
  if (ctaUrl) {
    currentTheme.ctaUrl = ctaUrl;
  }
  if (bookingUrl) {
    currentTheme.bookingUrl = bookingUrl;
  }
  const statusKind = statusTone(status);

  // Surface every status change as a toast (inline status message is kept too).
  // pushToast is stable (useCallback) so this effectively runs on status change.
  useEffect(() => {
    if (!status) {
      return;
    }
    const tone = statusTone(status);
    pushToast(tone === "neutral" ? "info" : tone, status);
  }, [status, pushToast]);

  const filteredKnowledge = useMemo(
    () =>
      knowledge.filter((item) => {
        const text = getKnowledgeText(item).toLowerCase();
        const matchesSearch =
          !knowledgeSearch || text.includes(knowledgeSearch.toLowerCase());
        const matchesStatus =
          knowledgeStatusFilter === "all" ||
          item.status === knowledgeStatusFilter;

        return matchesSearch && matchesStatus;
      }),
    [knowledge, knowledgeSearch, knowledgeStatusFilter],
  );

  const filteredInboxItems = useMemo(
    () =>
      inboxItems.filter((conversation) => {
        if (inboxFilter === "needs_human") {
          return (
            conversation.openHandoffs.length > 0 ||
            handoffConversationIds.has(conversation.id)
          );
        }
        if (inboxFilter === "recent") {
          const createdAt = new Date(conversation.createdAt).getTime();
          return Date.now() - createdAt < 1000 * 60 * 60 * 24 * 7;
        }
        return true;
      }),
    [handoffConversationIds, inboxFilter, inboxItems],
  );

  const filteredHandoffs = useMemo(
    () =>
      handoffs.filter((handoff) => {
        if (handoffFilter === "all") {
          return true;
        }
        return handoff.status === handoffFilter;
      }),
    [handoffFilter, handoffs],
  );
  const widgetOpenCount = getUsageTotal(analytics, ["widget_open"]);
  const quickReplyCount = getUsageTotal(analytics, ["quick_reply_clicked"]);
  const ctaClickCount = getUsageTotal(analytics, ["cta_clicked"]);
  const chatOutcomeCount = getUsageTotal(analytics, [
    "answered",
    "handoff",
    "refused",
  ]);
  const conversionBase = widgetOpenCount || chatOutcomeCount;
  const leadConversionRate = rate(leadHandoffs.length, conversionBase);
  const unansweredRate = rate(unansweredCount, answeredCount + unansweredCount);
  const wonLeadCount = useMemo(
    () =>
      leadHandoffs.filter((handoff) => getPipelineStage(handoff) === "won")
        .length,
    [leadHandoffs],
  );
  const activeTabLabel =
    tabs.find((tab) => tab.key === activeTab)?.label ?? "Today";
  const activeTabDescription: Record<TabKey, string> = {
    home: "Daily priorities, health checks, and launch readiness.",
    leads: "Customer conversations, captured leads, and human handoffs.",
    knowledge: "Approved answers, website imports, and missing topics.",
    channels: "Website chat, telephone AI, WhatsApp, Messenger, and Instagram.",
    settings: "Business profile, widget install, automation rules, and tests.",
  };
  const nextActions = [
    openLeads.length
      ? {
          tone: "urgent",
          title: "Follow up open leads",
          detail: `${openLeads.length} lead${openLeads.length === 1 ? "" : "s"} waiting for action.`,
          tab: "leads" as TabKey,
          impact: `Protect ${openLeads.length} active opportunity${openLeads.length === 1 ? "" : "ies"}.`,
          reward: "+Lead momentum",
          source: "Lead loop",
        }
      : null,
    staleLeads.length
      ? {
          tone: "urgent",
          title: "Stale lead follow-up",
          detail: `${staleLeads.length} lead${staleLeads.length === 1 ? "" : "s"} older than ${automationSettings.staleLeadReminderDays} days.`,
          tab: "leads" as TabKey,
          impact: "Recover deals before they go cold.",
          reward: "+Response discipline",
          source: "Lead loop",
        }
      : null,
    unansweredQuestions.length
      ? {
          tone: "urgent",
          title: "Answer unanswered questions",
          detail: `${unansweredQuestions.length} question${unansweredQuestions.length === 1 ? "" : "s"} can become approved FAQs.`,
          tab: "knowledge" as TabKey,
          impact: "Turn real customer friction into reusable answers.",
          reward: "+Answer quality",
          source: "Knowledge loop",
        }
      : null,
    missingKnowledgeChecks.length
      ? {
          tone: "warn",
          title: "Fill knowledge gaps",
          detail: missingKnowledgeChecks
            .map((check) => check.label)
            .slice(0, 3)
            .join(", "),
          tab: "knowledge" as TabKey,
          impact: "Cover the topics buyers ask before they book.",
          reward: "+Coverage",
          source: "Knowledge loop",
        }
      : null,
    !installCheck?.installed
      ? {
          tone: "warn",
          title: "Verify website widget",
          detail: "Run the install check after every website or widget deploy.",
          tab: "settings" as TabKey,
          impact: "Confirm visitors can actually reach the assistant.",
          reward: "+Launch readiness",
          source: "Launch loop",
        }
      : null,
    !leadCaptureEnabled
      ? {
          tone: "warn",
          title: "Enable lead capture",
          detail: "Lead capture is currently off for the widget.",
          tab: "settings" as TabKey,
          impact: "Give high-intent visitors a way to convert.",
          reward: "+Conversion path",
          source: "Widget loop",
        }
      : null,
    !telephoneConnection?.externalAccountId
      ? {
          tone: "info",
          title: "Connect telephone",
          detail: "Add a provider number, forwarding setup, or SIP trunk.",
          tab: "channels" as TabKey,
          impact: "Bring phone conversations into the same workflow.",
          reward: "+Channel coverage",
          source: "Channel loop",
        }
      : null,
    !automationSettings.visitorConfirmationEmailEnabled
      ? {
          tone: "info",
          title: "Enable visitor confirmation",
          detail: "Visitors can receive a clear email after submitting a lead.",
          tab: "settings" as TabKey,
          impact: "Close the loop immediately after a visitor converts.",
          reward: "+Trust",
          source: "Automation loop",
        }
      : null,
    conversations.length === 0
      ? {
          tone: "info",
          title: "Run a live website test",
          detail:
            "Open the site widget, ask a real question, and confirm it lands here.",
          tab: "settings" as TabKey,
          impact: "Prove the end-to-end visitor journey.",
          reward: "+Launch confidence",
          source: "Test loop",
        }
      : null,
  ].filter(Boolean) as Array<{
    tone: "urgent" | "warn" | "info";
    title: string;
    detail: string;
    tab: TabKey;
    impact: string;
    reward: string;
    source: string;
  }>;

  const setupSteps = [
    {
      label: "Login",
      done: Boolean(adminToken || adminSession),
      action: "Sign in",
      tab: "settings" as TabKey,
    },
    {
      label: "API connection",
      done: tenants.length > 0,
      action: "Connect",
      tab: "settings" as TabKey,
    },
    {
      label: "Tenant",
      done: Boolean(selectedTenant),
      action: "Select tenant",
      tab: "settings" as TabKey,
    },
    {
      label: "Business profile",
      done: Boolean(selectedTenant?.defaultLocale || selectedTenant?.theme),
      action: "Save settings",
      tab: "settings" as TabKey,
    },
    {
      label: "Knowledge",
      done: knowledge.length > 0,
      action: "Add FAQ",
      tab: "knowledge" as TabKey,
    },
    {
      label: "Test answer",
      done: Boolean(testAnswer),
      action: "Run test",
      tab: "settings" as TabKey,
    },
    {
      label: "Widget",
      done: Boolean(installCheck?.installed),
      action: "Verify install",
      tab: "settings" as TabKey,
    },
    {
      label: "Channels",
      done: connectedChannelCount > 1,
      action: "Connect phone or Meta",
      tab: "channels" as TabKey,
    },
    {
      label: "Automation",
      done: Boolean(
        automationSettings.ownerLeadEmailEnabled &&
        automationSettings.autoQualifyReadinessEnabled,
      ),
      action: "Review rules",
      tab: "settings" as TabKey,
    },
  ];
  const completedSteps = setupSteps.filter((step) => step.done).length;
  const setupCompletion = setupSteps.length
    ? Math.round((completedSteps / setupSteps.length) * 100)
    : 0;
  const channelReadinessScore = channelConnections.length
    ? Math.round((connectedChannelCount / channelConnections.length) * 100)
    : connectedChannelCount
      ? 100
      : 0;
  const answerQualityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - unansweredRate)),
  );
  const leadScoreSignal = Math.max(
    leadConversionRate,
    averageLeadScore,
    leadHandoffs.length ? 35 : 0,
  );
  const productScore = Math.round(
    setupCompletion * 0.34 +
      answerQualityScore * 0.24 +
      channelReadinessScore * 0.18 +
      Math.min(100, leadScoreSignal) * 0.24,
  );
  type ProductLevel = { name: string; threshold: number; detail: string };
  type CommandTone = "urgent" | "warn" | "info";
  type CommandItem = {
    tone: CommandTone;
    title: string;
    detail: string;
    tab: TabKey;
    impact: string;
    reward: string;
    source: string;
  };
  type ScoreGuide = {
    label: string;
    score: number;
    action: string;
    tab: TabKey;
  };

  const productLevels: ProductLevel[] = [
    {
      name: "Launch Ready",
      threshold: 0,
      detail: "Core setup is moving and the assistant can be tested.",
    },
    {
      name: "Learning",
      threshold: 35,
      detail: "Real conversations are improving the answer base.",
    },
    {
      name: "Converting",
      threshold: 55,
      detail: "The widget has a visible path from intent to lead.",
    },
    {
      name: "Reliable",
      threshold: 75,
      detail: "Channels, handoffs, and answer quality are under control.",
    },
    {
      name: "Scaled",
      threshold: 90,
      detail: "The operating loop is ready for more channels and traffic.",
    },
  ];
  const currentProductLevel: ProductLevel =
    [...productLevels]
      .reverse()
      .find((level) => productScore >= level.threshold) ?? productLevels[0]!;
  const nextProductLevel = productLevels.find(
    (level) => level.threshold > productScore,
  );
  const scoreGuides: ScoreGuide[] = [
    {
      label: "Launch readiness",
      score: setupCompletion,
      action:
        setupCompletion >= 100
          ? "Keep the install test green."
          : (setupSteps.find((step) => !step.done)?.action ?? "Review setup"),
      tab: "settings" as TabKey,
    },
    {
      label: "Answer quality",
      score: answerQualityScore,
      action:
        unansweredQuestions.length || missingKnowledgeChecks.length
          ? "Draft the next approved FAQ."
          : "Test fresh buyer questions weekly.",
      tab: "knowledge" as TabKey,
    },
    {
      label: "Lead momentum",
      score: Math.min(100, Math.round(leadScoreSignal)),
      action:
        openLeads.length || staleLeads.length
          ? "Work the highest-scoring lead."
          : "Run a conversion test from the widget.",
      tab: (openLeads.length || staleLeads.length
        ? "leads"
        : "settings") as TabKey,
    },
    {
      label: "Channel coverage",
      score: channelReadinessScore,
      action:
        channelReadinessScore >= 100
          ? "Monitor delivery and handoffs."
          : "Connect the next customer channel.",
      tab: "channels" as TabKey,
    },
  ];
  const weakestScoreGuide = [...scoreGuides].sort(
    (left, right) => left.score - right.score,
  )[0];
  const workflowCommandItems: CommandItem[] = (
    workflowSuggestions?.suggestions ?? []
  ).map((suggestion) => ({
    tone:
      suggestion.priority === "high"
        ? "urgent"
        : suggestion.priority === "medium"
          ? "warn"
          : ("info" as CommandTone),
    title: suggestion.title,
    detail: suggestion.detail,
    tab:
      suggestion.category === "whatsapp"
        ? ("channels" as TabKey)
        : ("leads" as TabKey),
    impact: suggestion.actionLabel,
    reward: "+Automation",
    source: titleCase(suggestion.category),
  }));
  const commandQueue = [...nextActions, ...workflowCommandItems]
    .map((item) => ({
      ...item,
      priority: item.tone === "urgent" ? 0 : item.tone === "warn" ? 1 : 2,
    }))
    .sort((left, right) => left.priority - right.priority);

  useEffect(() => {
    if (!telephoneConnection) {
      setTelephoneWarnings([]);
      return;
    }
    const settings = telephoneConnection.settings ?? {};
    const provider = normalizeTelephoneProviderUi(telephoneConnection.provider);
    setNewNumberProvider(provider);
    setForwardingProvider(provider);
    setSipProvider(provider);

    const checklist = settingRecord(settings.setupChecklist);
    const businessHours = settingRecord(settings.businessHours);
    const handoffRules = settingRecord(settings.handoffRules);
    const gdpr = settingRecord(settings.gdpr);
    const voiceQuality = settingRecord(settings.voiceQuality);
    const testCall = settingRecord(settings.testCall);

    setPhoneNumberOrdered(
      settingBoolean(
        checklist.numberOrdered,
        Boolean(telephoneConnection.externalAccountId),
      ),
    );
    setPhoneSipConfigured(settingBoolean(checklist.sipConfigured, false));
    setPhoneTestCallCompleted(
      settingBoolean(
        checklist.testCallCompleted,
        settingString(testCall.status) === "passed",
      ),
    );
    setPhoneFallbackSet(
      settingBoolean(
        checklist.fallbackSet,
        Boolean(settingString(settings.fallbackNumber)),
      ),
    );
    setPhoneDisclosureConfirmed(
      settingBoolean(
        checklist.disclosureConfirmed,
        Boolean(settingString(gdpr.disclosureText)),
      ),
    );

    setTelephoneFallbackNumber(settingString(settings.fallbackNumber) ?? "");
    setTelephoneNotes(settingString(settings.notes) ?? "");
    setTelephoneTestCallStatus(
      settingTestCallStatus(settingString(testCall.status)),
    );
    setTelephoneTestCallNumber(settingString(testCall.phoneNumber) ?? "");
    setTelephoneTestCallNotes(settingString(testCall.notes) ?? "");

    setBusinessHoursMode(
      settingBusinessHoursMode(settingString(businessHours.mode)),
    );
    setBusinessHoursTimezone(
      settingString(businessHours.timezone) ?? "Europe/Berlin",
    );
    setBusinessHoursText(
      settingString(businessHours.hours) ?? "Mo-Fr 09:00-18:00",
    );
    setAfterHoursAction(
      settingAfterHoursAction(settingString(businessHours.afterHoursAction)),
    );

    setHandoffLowConfidence(settingBoolean(handoffRules.lowConfidence, true));
    setHandoffUrgentKeywords(settingBoolean(handoffRules.urgentKeywords, true));
    setHandoffOfficeHoursTransfer(
      settingBoolean(handoffRules.officeHoursTransfer, false),
    );
    setHandoffRepeatedFailure(
      settingBoolean(handoffRules.repeatedFailure, true),
    );
    setHandoffAskBeforeTransfer(
      settingBoolean(handoffRules.askBeforeTransfer, true),
    );

    setPhoneDisclosureText(
      settingString(gdpr.disclosureText) ??
        "Hinweis: Dieser Anruf wird von einem KI-Assistenten verarbeitet. Bei Bedarf verbinden wir Sie mit einem Menschen.",
    );
    setPhoneRecordingEnabled(settingBoolean(gdpr.recordingEnabled, false));
    setPhoneStoreTranscripts(settingBoolean(gdpr.storeTranscripts, true));
    setPhoneTranscriptRetentionDays(
      settingNumber(gdpr.transcriptRetentionDays, 90),
    );

    setPhoneVoiceLanguage(settingString(voiceQuality.language) ?? "de-DE");
    setPhoneSpeakingStyle(
      settingSpeakingStyle(settingString(voiceQuality.speakingStyle)),
    );
    setPhoneMaxAnswerLength(settingNumber(voiceQuality.maxAnswerLength, 450));
    setTelephoneWarnings(
      buildTelephoneWarningsFromSettings(settings, telephoneConnection),
    );
  }, [
    telephoneConnection?.externalAccountId,
    telephoneConnection?.provider,
    telephoneConnection?.status,
    telephoneConnection?.updatedAt,
  ]);

  useEffect(() => {
    const legacySavedToken = window.localStorage.getItem(
      "assaddar_admin_token",
    );
    const savedToken =
      window.sessionStorage.getItem("assaddar_admin_token") ?? legacySavedToken;
    const savedApiBase = window.localStorage.getItem("assaddar_api_base");
    const savedSiteUrl = window.localStorage.getItem("assaddar_site_url");

    if (legacySavedToken) {
      window.localStorage.removeItem("assaddar_admin_token");
    }

    if (savedToken) {
      setAdminToken(savedToken);
    }

    if (savedApiBase) {
      setApiBase(savedApiBase);
    }

    if (savedSiteUrl) {
      setSiteUrl(savedSiteUrl);
    }
  }, []);

  useEffect(() => {
    if (adminToken) {
      window.sessionStorage.setItem("assaddar_admin_token", adminToken);
    } else {
      window.sessionStorage.removeItem("assaddar_admin_token");
    }
    window.localStorage.removeItem("assaddar_admin_token");
  }, [adminToken]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSupabaseAccessToken(data.session?.access_token ?? "");
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseAccessToken(session?.access_token ?? "");
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      supabaseAccessToken &&
      !adminToken &&
      !adminSession &&
      !connectionAttempted
    ) {
      void refreshTenants();
    }
  }, [adminToken, adminSession, connectionAttempted, supabaseAccessToken]);

  useEffect(() => {
    if (normalizedApiBase) {
      window.localStorage.setItem("assaddar_api_base", normalizedApiBase);
    }
  }, [normalizedApiBase]);

  useEffect(() => {
    if (siteUrl) {
      window.localStorage.setItem("assaddar_site_url", siteUrl);
    }
  }, [siteUrl]);

  useEffect(() => {
    if (deepLink.tab) {
      setActiveTab(deepLink.tab);
    }
  }, [deepLink.tab]);

  useEffect(() => {
    if (
      deepLink.tenantId &&
      tenants.some((tenant) => tenant.id === deepLink.tenantId) &&
      selectedTenantId !== deepLink.tenantId
    ) {
      setSelectedTenantId(deepLink.tenantId);
    }
  }, [deepLink.tenantId, selectedTenantId, tenants]);

  useEffect(() => {
    if (!selectedTenant) {
      return;
    }

    const theme = mergeTheme(selectedTenant.theme);
    setAssistantName(theme.assistantName);
    setWidgetPrimaryColor(theme.primaryColor);
    setWidgetBackgroundColor(theme.backgroundColor);
    setWidgetTextColor(theme.textColor);
    setWidgetLauncherLabel(theme.launcherLabel);
    setWidgetOpeningMessage(theme.openingMessage);
    setWidgetLanguage(theme.language);
    setWidgetPosition(theme.position);
    setLeadCaptureEnabled(theme.leadCaptureEnabled);
    setLeadCaptureIntro(theme.leadCaptureIntro);
    setLeadCaptureFields(theme.leadCaptureFields);
    setCtaLabel(theme.ctaLabel);
    setCtaUrl(theme.ctaUrl);
    setBookingUrl(theme.bookingUrl);
    setConsentEnabled(theme.consentEnabled);
    setConsentText(theme.consentText);
    setQuickReplies(theme.quickReplies.join("\n"));
    setReadinessEnabled(theme.readinessEnabled);
    setReadinessIntro(theme.readinessIntro);
    setAutomationSettings(theme.automation);
    setTenantLocale(selectedTenant.defaultLocale ?? theme.language);
    setTenantTone(selectedTenant.tone ?? "friendly");
    setConfidenceThreshold(Number(selectedTenant.confidenceThreshold ?? 0.18));
    setMaxMessageLength(selectedTenant.maxMessageLength ?? 1200);
    setRetentionDays(selectedTenant.retentionDays ?? 365);
    setInstallCheck(null);
    setWebsiteImport(null);
    setKnowledgeSuggestions([]);
    setKnowledgeIngestionJobs([]);
    setKnowledgeUploadFile(null);
    setEditingSuggestionId("");
  }, [selectedTenant?.id]);

  useEffect(() => {
    if (selectedTenant?.id) {
      void refreshWorkspace(selectedTenant.id);
    }
  }, [selectedTenant?.id]);

  useEffect(() => {
    if (selectedTenant?.id) {
      void refreshOnboardingState(selectedTenant.id);
    } else {
      setOnboardingState(null);
      setAvailablePhoneNumbers([]);
      setSelectedPhoneNumberId("");
    }
  }, [selectedTenant?.id]);

  useEffect(() => {
    if (selectedTenant?.id && selectedConversationId) {
      void refreshConversationMessages(
        selectedTenant.id,
        selectedConversationId,
      );
    } else {
      setConversationMessages([]);
    }
  }, [selectedTenant?.id, selectedConversationId]);

  useEffect(() => {
    if (selectedTenant?.id && activeTab === "knowledge") {
      void Promise.all([
        refreshKnowledge(selectedTenant.id),
        refreshKnowledgeSuggestions(selectedTenant.id),
        refreshKnowledgeIngestionJobs(selectedTenant.id),
      ]);
    }
  }, [
    activeTab,
    debouncedKnowledgeSearch,
    knowledgeStatusFilter,
    selectedTenant?.id,
  ]);

  useEffect(() => {
    if (selectedTenant?.id && activeTab === "leads") {
      void Promise.all([
        refreshConversations(selectedTenant.id),
        refreshUnifiedInbox(selectedTenant.id),
        refreshHandoffs(selectedTenant.id),
      ]);
    }
  }, [activeTab, debouncedInboxSearch, selectedTenant?.id]);

  useEffect(() => {
    if (selectedTenant?.id && activeTab === "leads") {
      void refreshContacts(selectedTenant.id);
    }
  }, [activeTab, debouncedContactSearch, selectedTenant?.id]);

  useEffect(() => {
    if (selectedTenant?.id && activeTab === "settings") {
      void refreshTenantUsers(selectedTenant.id);
    }
  }, [activeTab, selectedTenant?.id, adminSession?.user.role]);

  useEffect(() => {
    if (activeTab === "channels" && canManagePlatformBilling()) {
      void refreshTelephoneInventory();
    }
  }, [activeTab, adminSession?.authType, adminSession?.user.role]);

  useEffect(() => {
    if (!deepLink.handoffId || !handoffs.length) {
      return;
    }

    const handoff = handoffs.find((item) => item.id === deepLink.handoffId);
    if (!handoff) {
      return;
    }

    if (["lead_capture", "readiness_assessment"].includes(handoff.reason)) {
      setActiveTab("leads");
      setSelectedLeadId(handoff.id);
    } else {
      setActiveTab("leads");
      setHandoffFilter(
        isHandoffFilter(handoff.status) ? handoff.status : "all",
      );
    }
    setStatus("Opened linked request");
  }, [deepLink.handoffId, handoffs]);

  useEffect(() => {
    if (!selectedLead) {
      setLeadReplyDraft("");
      setLeadFollowUpDate("");
      return;
    }

    setLeadFollowUpDate(getLeadFollowUpDate(selectedLead));
    setLeadReplyDraft(
      buildLeadReplyDraft(selectedLead, leadReplyTone, bookingUrl),
    );
  }, [selectedLeadId]);

  useEffect(() => {
    if (!deepLink.conversationId || !conversations.length) {
      return;
    }

    const conversation = conversations.find(
      (item) =>
        item.id === deepLink.conversationId ||
        item.publicId === deepLink.conversationId,
    );
    if (!conversation) {
      return;
    }

    setSelectedConversationId(conversation.id);
    if (!deepLink.handoffId) {
      setActiveTab("leads");
      setStatus("Opened linked conversation");
    }
  }, [deepLink.conversationId, deepLink.handoffId, conversations]);

  function buildListPath(
    path: string,
    options: {
      limit?: number;
      offset?: number;
      q?: string;
      status?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? listPageSize));
    params.set("offset", String(options.offset ?? 0));
    if (options.q?.trim()) {
      params.set("q", options.q.trim());
    }
    if (options.status && options.status !== "all") {
      params.set("status", options.status);
    }
    return `${path}?${params.toString()}`;
  }

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const method = init?.method?.toUpperCase() ?? "GET";
    const url = `${normalizedApiBase}${path}`;
    const headers = {
      "content-type": "application/json",
      ...(adminToken ? { "x-admin-token": adminToken } : {}),
      ...(!adminToken && supabaseAccessToken
        ? { authorization: `Bearer ${supabaseAccessToken}` }
        : {}),
      ...(init?.headers ?? {}),
    };
    const canDedupe = method === "GET" && !init?.body;
    const dedupeKey = canDedupe
      ? `${method} ${url} ${JSON.stringify(headers)}`
      : "";

    if (dedupeKey) {
      const existing = inFlightGetRequests.current.get(dedupeKey);
      if (existing) {
        return existing as Promise<T>;
      }
    }

    const request = fetch(url, {
      ...init,
      method,
      credentials: "include",
      headers,
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `${response.status} ${response.statusText}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    });

    if (dedupeKey) {
      inFlightGetRequests.current.set(dedupeKey, request);
      request.then(
        () => inFlightGetRequests.current.delete(dedupeKey),
        () => inFlightGetRequests.current.delete(dedupeKey),
      );
    }

    return request;
  }

  async function refreshTenants() {
    setBusy(true);
    try {
      const session = await apiFetch<AdminSession>("/admin/session");
      const nextTenants = await apiFetch<Tenant[]>("/admin/tenants");
      setAdminSession(session);
      setTenants(nextTenants);
      setConnectionAttempted(true);
      const linkedTenantId =
        deepLink.tenantId &&
        nextTenants.some((tenant) => tenant.id === deepLink.tenantId)
          ? deepLink.tenantId
          : "";
      if (linkedTenantId && selectedTenantId !== linkedTenantId) {
        setSelectedTenantId(linkedTenantId);
      } else if (
        nextTenants[0] &&
        !nextTenants.some((tenant) => tenant.id === selectedTenantId)
      ) {
        setSelectedTenantId(nextTenants[0].id);
      }
      setStatus(nextTenants.length ? "Connected" : "No tenants found");
    } catch (error) {
      setStatus(readableError(error));
      setConnectionAttempted(false);
    } finally {
      setBusy(false);
    }
  }

  async function loginWithPassword(event: FormEvent) {
    event.preventDefault();
    if (!loginEmail || !loginPassword) {
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const authHeaders: HeadersInit = {};
      let session: AdminSession;
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: loginPassword,
        });
        if (error || !data.session?.access_token) {
          throw error ?? new Error("Login failed.");
        }
        authHeaders.authorization = `Bearer ${data.session.access_token}`;
        setSupabaseAccessToken(data.session.access_token);
        session = await apiFetch<AdminSession>("/admin/session", {
          headers: authHeaders,
        });
      } else {
        session = await apiFetch<AdminSession>("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: loginEmail,
            password: loginPassword,
          }),
        });
      }
      setAdminToken("");
      window.sessionStorage.removeItem("assaddar_admin_token");
      window.localStorage.removeItem("assaddar_admin_token");
      setAdminSession(session);
      setConnectionAttempted(true);
      setLoginPassword("");
      const nextTenants = await apiFetch<Tenant[]>("/admin/tenants", {
        headers: authHeaders,
      });
      setTenants(nextTenants);
      if (nextTenants[0]) {
        setSelectedTenantId(nextTenants[0].id);
      }
      setStatus(nextTenants.length ? "Logged in" : "No projects assigned");
    } catch (error) {
      setStatus(readableError(error));
      setConnectionAttempted(false);
    } finally {
      setBusy(false);
    }
  }

  async function signUpWithPassword(event: FormEvent) {
    event.preventDefault();
    if (!signupName || !signupEmail || !signupPassword) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("Registration needs Supabase Auth to be configured.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            name: signupName,
          },
        },
      });
      if (error) {
        throw error;
      }
      setLoginEmail(signupEmail);
      setSignupPassword("");
      if (!data.session?.access_token) {
        setAuthMode("login");
        setStatus("Account created. Confirm your email, then log in.");
        return;
      }

      const authHeaders = {
        authorization: `Bearer ${data.session.access_token}`,
      };
      setSupabaseAccessToken(data.session.access_token);
      const session = await apiFetch<AdminSession>("/admin/session", {
        headers: authHeaders,
      });
      const nextTenants = await apiFetch<Tenant[]>("/admin/tenants", {
        headers: authHeaders,
      });
      setAdminSession(session);
      setTenants(nextTenants);
      setConnectionAttempted(true);
      if (nextTenants[0]) {
        setSelectedTenantId(nextTenants[0].id);
      }
      setStatus(nextTenants.length ? "Account ready" : "Create your project");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      } else {
        await apiFetch("/auth/logout", { method: "POST" });
      }
    } catch {
      // Local cleanup still matters even if the network request fails.
    } finally {
      setAdminSession(null);
      setSupabaseAccessToken("");
      setTenants([]);
      setSelectedTenantId("");
      setConnectionAttempted(false);
      setAdminToken("");
      window.sessionStorage.removeItem("assaddar_admin_token");
      window.localStorage.removeItem("assaddar_admin_token");
      setBusy(false);
      setStatus("Logged out");
    }
  }

  async function acceptInvite(event: FormEvent) {
    event.preventDefault();
    if (!deepLink.inviteToken || !inviteName || !invitePassword) {
      return;
    }

    setBusy(true);
    try {
      const session = await apiFetch<AdminSession>("/auth/invites/accept", {
        method: "POST",
        body: JSON.stringify({
          token: deepLink.inviteToken,
          name: inviteName,
          password: invitePassword,
        }),
      });
      setAdminSession(session);
      setConnectionAttempted(true);
      setInvitePassword("");
      const nextTenants = await apiFetch<Tenant[]>("/admin/tenants");
      setTenants(nextTenants);
      if (nextTenants[0]) {
        setSelectedTenantId(nextTenants[0].id);
      }
      window.history.replaceState({}, "", window.location.pathname);
      setStatus("Invite accepted");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createTenantUser(event: FormEvent) {
    event.preventDefault();
    if (!canManageUsers()) {
      setStatus("Your role cannot manage project users.");
      return;
    }
    if (!selectedTenant || !newUserEmail || !newUserName) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(`/admin/tenants/${selectedTenant.id}/users`, {
        method: "POST",
        body: JSON.stringify({
          email: newUserEmail,
          name: newUserName,
          role: newUserRole,
          password: newUserPassword || undefined,
        }),
      });
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      await refreshTenantUsers(selectedTenant.id);
      setStatus("Project user saved");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createTenantInvite(event: FormEvent) {
    event.preventDefault();
    if (!canManageUsers()) {
      setStatus("Your role cannot invite project users.");
      return;
    }
    if (!selectedTenant || !inviteEmail) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ acceptUrl: string }>(
        `/admin/tenants/${selectedTenant.id}/invites`,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: inviteRole,
          }),
        },
      );
      setInviteEmail("");
      setLastInviteUrl(result.acceptUrl);
      await refreshTenantUsers(selectedTenant.id);
      setStatus("Invite link created");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshWorkspace(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setKnowledge([]);
      setAnalytics(null);
      setConversations([]);
      setUnifiedInbox([]);
      setContacts([]);
      setHandoffs([]);
      setChannelConnections([]);
      setWhatsappTemplates([]);
      setWhatsappCompliance(null);
      setWorkflowSuggestions(null);
      setTenantUsers([]);
      setTenantInvites([]);
      setChannelAccountDrafts({});
      setWorkspaceLoading(false);
      return;
    }

    const refreshId = workspaceRefreshId.current + 1;
    workspaceRefreshId.current = refreshId;
    setWorkspaceLoading(true);

    try {
      const bootstrap = await apiFetch<DashboardBootstrap>(
        `/admin/tenants/${tenantId}/dashboard`,
      );

      if (workspaceRefreshId.current !== refreshId) {
        return;
      }

      setKnowledge(bootstrap.knowledge);
      setAnalytics(bootstrap.analytics);
      setConversations(bootstrap.conversations);
      setUnifiedInbox(bootstrap.unifiedInbox);
      setContacts(bootstrap.contacts);
      setHandoffs(bootstrap.handoffs);
      setChannelConnections(bootstrap.channelConnections);
      setWhatsappTemplates(bootstrap.whatsappTemplates);
      setWhatsappCompliance(bootstrap.whatsappCompliance);
      setUnansweredQuestions(bootstrap.unansweredQuestions);
      setWorkflowSuggestions(bootstrap.workflowSuggestions);
      setProductionReadiness(bootstrap.productionReadiness);
      setTenantUsers(bootstrap.tenantUsers);
      setTenantInvites(bootstrap.tenantInvites);
      setChannelAccountDrafts(
        Object.fromEntries(
          bootstrap.channelConnections.map((item) => [
            item.channel,
            item.externalAccountId ?? "",
          ]),
        ),
      );
      setKnowledgeHasMore(bootstrap.knowledge.length === listPageSize);
      setInboxHasMore(bootstrap.unifiedInbox.length === listPageSize);
      setContactsHasMore(bootstrap.contacts.length === listPageSize);
      setHandoffsHasMore(bootstrap.handoffs.length === listPageSize);
      setSelectedConversationId((current) => {
        if (!current) {
          return activeTab === "leads"
            ? (bootstrap.unifiedInbox[0]?.id ??
                bootstrap.conversations[0]?.id ??
                "")
            : "";
        }
        const stillLoaded =
          bootstrap.unifiedInbox.some(
            (conversation) => conversation.id === current,
          ) ||
          bootstrap.conversations.some(
            (conversation) => conversation.id === current,
          );
        return stillLoaded ? current : "";
      });

      if (activeTab !== "leads") {
        setSelectedConversationId("");
      }
    } catch (error) {
      if (workspaceRefreshId.current === refreshId) {
        setStatus(readableError(error));
      }
    } finally {
      if (workspaceRefreshId.current === refreshId) {
        setWorkspaceLoading(false);
      }
    }
  }

  async function refreshKnowledge(
    tenantId = selectedTenant?.id,
    options: { offset?: number; append?: boolean } = {},
  ) {
    if (!tenantId) {
      setKnowledge([]);
      setKnowledgeHasMore(false);
      return;
    }

    try {
      const items = await apiFetch<KnowledgeItem[]>(
        buildListPath(`/admin/tenants/${tenantId}/knowledge`, {
          offset: options.offset ?? 0,
          q: debouncedKnowledgeSearch,
          status: knowledgeStatusFilter,
        }),
      );
      setKnowledge((current) =>
        options.append ? [...current, ...items] : items,
      );
      setKnowledgeHasMore(items.length === listPageSize);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshKnowledgeSuggestions(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setKnowledgeSuggestions([]);
      return;
    }

    try {
      const items = await apiFetch<KnowledgeSuggestion[]>(
        buildListPath(`/admin/tenants/${tenantId}/knowledge/suggestions`, {
          status: "pending",
        }),
      );
      setKnowledgeSuggestions(items);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshKnowledgeIngestionJobs(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setKnowledgeIngestionJobs([]);
      return;
    }

    try {
      const items = await apiFetch<KnowledgeIngestionJob[]>(
        buildListPath(`/admin/tenants/${tenantId}/knowledge/ingestion-jobs`, {
          limit: 8,
        }),
      );
      setKnowledgeIngestionJobs(items);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshAnalytics(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setAnalytics(null);
      return;
    }

    try {
      const result = await apiFetch<TenantAnalytics>(
        `/admin/tenants/${tenantId}/analytics`,
      );
      setAnalytics(result);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshConversations(
    tenantId = selectedTenant?.id,
    options: { offset?: number; append?: boolean } = {},
  ) {
    if (!tenantId) {
      setConversations([]);
      return;
    }

    try {
      const items = await apiFetch<Conversation[]>(
        buildListPath(`/admin/tenants/${tenantId}/conversations`, {
          offset: options.offset ?? 0,
          q: debouncedInboxSearch,
        }),
      );
      setConversations((current) =>
        options.append ? [...current, ...items] : items,
      );
      if (
        items[0] &&
        !items.some(
          (conversation) => conversation.id === selectedConversationId,
        )
      ) {
        setSelectedConversationId(items[0].id);
      }
      if (!items.length) {
        setSelectedConversationId("");
      }
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshUnifiedInbox(
    tenantId = selectedTenant?.id,
    options: { offset?: number; append?: boolean } = {},
  ) {
    if (!tenantId) {
      setUnifiedInbox([]);
      setInboxHasMore(false);
      return;
    }

    try {
      const items = await apiFetch<UnifiedInboxItem[]>(
        buildListPath(`/admin/tenants/${tenantId}/inbox`, {
          offset: options.offset ?? 0,
          q: debouncedInboxSearch,
        }),
      );
      setUnifiedInbox((current) =>
        options.append ? [...current, ...items] : items,
      );
      setInboxHasMore(items.length === listPageSize);
      if (
        items[0] &&
        !items.some(
          (conversation) => conversation.id === selectedConversationId,
        )
      ) {
        setSelectedConversationId(items[0].id);
      }
    } catch {
      setUnifiedInbox([]);
      setInboxHasMore(false);
    }
  }

  async function refreshContacts(
    tenantId = selectedTenant?.id,
    options: { offset?: number; append?: boolean } = {},
  ) {
    if (!tenantId) {
      setContacts([]);
      setContactsHasMore(false);
      return;
    }

    try {
      const items = await apiFetch<ContactProfile[]>(
        buildListPath(`/admin/tenants/${tenantId}/contacts`, {
          offset: options.offset ?? 0,
          q: debouncedContactSearch,
        }),
      );
      setContacts((current) =>
        options.append ? [...current, ...items] : items,
      );
      setContactsHasMore(items.length === listPageSize);
    } catch {
      setContacts([]);
      setContactsHasMore(false);
    }
  }

  async function refreshConversationMessages(
    tenantId: string,
    conversationId: string,
  ) {
    try {
      const items = await apiFetch<ConversationMessage[]>(
        `/admin/tenants/${tenantId}/conversations/${conversationId}/messages`,
      );
      setConversationMessages(items);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshHandoffs(
    tenantId = selectedTenant?.id,
    options: { offset?: number; append?: boolean } = {},
  ) {
    if (!tenantId) {
      setHandoffs([]);
      setHandoffsHasMore(false);
      return;
    }

    try {
      const items = await apiFetch<Handoff[]>(
        buildListPath(`/admin/tenants/${tenantId}/handoffs`, {
          offset: options.offset ?? 0,
          q: debouncedInboxSearch,
        }),
      );
      setHandoffs((current) =>
        options.append ? [...current, ...items] : items,
      );
      setHandoffsHasMore(items.length === listPageSize);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshChannelConnections(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setChannelConnections([]);
      return;
    }

    try {
      const items = await apiFetch<ChannelConnection[]>(
        `/admin/tenants/${tenantId}/channel-connections`,
      );
      setChannelConnections(items);
      setChannelAccountDrafts(
        Object.fromEntries(
          items.map((item) => [item.channel, item.externalAccountId ?? ""]),
        ),
      );
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshWhatsappOperations(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setWhatsappTemplates([]);
      setWhatsappCompliance(null);
      return;
    }

    try {
      const [templates, compliance] = await Promise.all([
        apiFetch<WhatsappTemplate[]>(
          `/admin/tenants/${tenantId}/whatsapp/templates`,
        ),
        apiFetch<WhatsappCompliance>(
          `/admin/tenants/${tenantId}/whatsapp/compliance`,
        ),
      ]);
      setWhatsappTemplates(templates);
      setWhatsappCompliance(compliance);
    } catch {
      setWhatsappTemplates([]);
      setWhatsappCompliance(null);
    }
  }

  async function refreshWorkflowSuggestions(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setWorkflowSuggestions(null);
      return;
    }

    try {
      const result = await apiFetch<WorkflowSuggestionsResult>(
        `/admin/tenants/${tenantId}/workflows/suggestions`,
      );
      setWorkflowSuggestions(result);
    } catch {
      setWorkflowSuggestions(null);
    }
  }

  async function refreshTenantUsers(tenantId = selectedTenant?.id) {
    if (!tenantId || !canManageUsers(tenantId)) {
      setTenantUsers([]);
      setTenantInvites([]);
      return;
    }

    try {
      const [users, invites] = await Promise.all([
        apiFetch<TenantUser[]>(`/admin/tenants/${tenantId}/users`),
        apiFetch<TenantInvite[]>(`/admin/tenants/${tenantId}/invites`),
      ]);
      setTenantUsers(users);
      setTenantInvites(invites);
    } catch {
      setTenantUsers([]);
      setTenantInvites([]);
    }
  }

  async function refreshUnanswered(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setUnansweredQuestions([]);
      return;
    }

    try {
      const items = await apiFetch<UnansweredQuestion[]>(
        `/admin/tenants/${tenantId}/unanswered`,
      );
      setUnansweredQuestions(items);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function loadMoreKnowledge() {
    if (!selectedTenant) {
      return;
    }
    await refreshKnowledge(selectedTenant.id, {
      offset: knowledge.length,
      append: true,
    });
  }

  async function loadMoreInbox() {
    if (!selectedTenant) {
      return;
    }
    await Promise.all([
      refreshConversations(selectedTenant.id, {
        offset: conversations.length,
        append: true,
      }),
      refreshUnifiedInbox(selectedTenant.id, {
        offset: unifiedInbox.length,
        append: true,
      }),
    ]);
  }

  async function loadMoreContacts() {
    if (!selectedTenant) {
      return;
    }
    await refreshContacts(selectedTenant.id, {
      offset: contacts.length,
      append: true,
    });
  }

  async function loadMoreHandoffs() {
    if (!selectedTenant) {
      return;
    }
    await refreshHandoffs(selectedTenant.id, {
      offset: handoffs.length,
      append: true,
    });
  }

  async function createTenant(event: FormEvent) {
    event.preventDefault();
    if (!tenantName || !tenantSlug) {
      return;
    }

    setBusy(true);
    try {
      const tenant = await apiFetch<Tenant>("/admin/tenants", {
        method: "POST",
        body: JSON.stringify({
          name: tenantName,
          slug: tenantSlug,
          defaultLocale: tenantLocale,
          theme: currentTheme,
        }),
      });
      setTenants((current) => [tenant, ...current]);
      setSelectedTenantId(tenant.id);
      setTenantName("");
      setTenantSlug("");
      setStatus("Tenant created");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createSelfServiceProject(event: FormEvent) {
    event.preventDefault();
    if (!selfServiceProjectName) {
      return;
    }
    if (adminSession?.authType !== "user_session") {
      setStatus("Log in as a user before creating a self-service project.");
      return;
    }

    const slug = selfServiceProjectSlug || slugFromName(selfServiceProjectName);
    setBusy(true);
    try {
      const tenant = await apiFetch<Tenant>("/onboarding/projects", {
        method: "POST",
        body: JSON.stringify({
          name: selfServiceProjectName,
          slug,
          defaultLocale: "de-DE",
          theme: currentTheme,
        }),
      });
      setTenants((current) => [tenant, ...current]);
      setSelectedTenantId(tenant.id);
      setSelfServiceProjectName("");
      setSelfServiceProjectSlug("");
      setActiveTab("channels");
      await Promise.all([
        refreshOnboardingState(tenant.id),
        loadAvailablePhoneNumbers(tenant.id),
      ]);
      setStatus("Project created. Choose a phone number next.");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshOnboardingState(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setOnboardingState(null);
      return;
    }
    try {
      const state = await apiFetch<OnboardingState>(
        `/onboarding/tenants/${tenantId}/state`,
      );
      setOnboardingState(state);
    } catch {
      setOnboardingState(null);
    }
  }

  async function loadAvailablePhoneNumbers(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams({
        country: "DE",
        numberType: "local",
        limit: "24",
      });
      if (selfServiceLocality.trim()) {
        params.set("locality", selfServiceLocality.trim());
      }
      const result = await apiFetch<OnboardingPhoneNumbersResult>(
        `/onboarding/tenants/${tenantId}/phone-numbers?${params.toString()}`,
      );
      setAvailablePhoneNumbers(result.numbers);
      setOnboardingPrices({
        currency: result.currency,
        numberMonthlyPriceCents: result.numberMonthlyPriceCents,
        acceptedCallPriceCents: result.acceptedCallPriceCents,
      });
      setSelectedPhoneNumberId((current) =>
        result.numbers.some((number) => number.id === current)
          ? current
          : (result.numbers[0]?.id ?? ""),
      );
      setStatus(
        result.numbers.length
          ? "Available numbers loaded"
          : "No available numbers found",
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function reserveSelectedPhoneNumber() {
    if (!selectedTenant || !selectedPhoneNumberId) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch(
        `/onboarding/tenants/${selectedTenant.id}/phone-number-reservations`,
        {
          method: "POST",
          body: JSON.stringify({ numberId: selectedPhoneNumberId }),
        },
      );
      await refreshOnboardingState(selectedTenant.id);
      setStatus("Phone number reserved");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function startBillingCheckout() {
    if (!selectedTenant) {
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch<{ url: string }>(
        `/billing/tenants/${selectedTenant.id}/checkout-sessions`,
        {
          method: "POST",
          body: JSON.stringify({
            successUrl: `${window.location.origin}/?tenant=${selectedTenant.id}&billing=success`,
            cancelUrl: `${window.location.origin}/?tenant=${selectedTenant.id}&billing=cancel`,
          }),
        },
      );
      window.location.assign(result.url);
    } catch (error) {
      setStatus(readableError(error));
      setBusy(false);
    }
  }

  async function refreshTelephoneInventory() {
    if (!canManagePlatformBilling()) {
      return;
    }
    try {
      const numbers = await apiFetch<TelephoneNumberInventoryItem[]>(
        "/admin/telephone/numbers",
      );
      setTelephoneInventory(numbers);
    } catch {
      setTelephoneInventory([]);
    }
  }

  async function createTelephoneInventoryNumber(event: FormEvent) {
    event.preventDefault();
    if (!inventoryPhoneNumber || !canManagePlatformBilling()) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch<TelephoneNumberInventoryItem>("/admin/telephone/numbers", {
        method: "POST",
        body: JSON.stringify({
          provider: "easybell",
          phoneNumber: inventoryPhoneNumber,
          country: "DE",
          locality: inventoryLocality || null,
          numberType: "local",
          sipTarget: inventorySipTarget || null,
          metadata: { launchReady: Boolean(inventorySipTarget) },
        }),
      });
      setInventoryPhoneNumber("");
      setInventorySipTarget("");
      await refreshTelephoneInventory();
      setStatus("Phone number added to inventory");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveTenantSettings() {
    if (!canManageTenantSettings()) {
      setStatus("Your role cannot change tenant settings.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const updatedTenant = await apiFetch<Tenant>(
        `/admin/tenants/${selectedTenant.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            defaultLocale: tenantLocale,
            tone: tenantTone,
            confidenceThreshold,
            maxMessageLength,
            retentionDays,
            theme: currentTheme,
          }),
        },
      );
      setTenants((current) =>
        current.map((tenant) =>
          tenant.id === updatedTenant.id ? updatedTenant : tenant,
        ),
      );
      setStatus("Business settings saved");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  function updateAutomationSetting<Key extends keyof WidgetAutomationSettings>(
    key: Key,
    value: Required<WidgetAutomationSettings>[Key],
  ) {
    setAutomationSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function sendWeeklyReport() {
    if (!canManageTenantSettings()) {
      setStatus("Your role cannot send owner reports.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ sent: boolean; reason?: string }>(
        `/admin/tenants/${selectedTenant.id}/weekly-report`,
        {
          method: "POST",
        },
      );
      setStatus(
        result.sent
          ? "Weekly report sent"
          : `Weekly report not sent: ${result.reason ?? "not configured"}`,
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function addFaq(event: FormEvent) {
    event.preventDefault();
    if (!canManageKnowledge()) {
      setStatus("Your role cannot change approved knowledge.");
      return;
    }
    if (!selectedTenant || !question || !answer) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(`/admin/tenants/${selectedTenant.id}/knowledge/faqs`, {
        method: "POST",
        body: JSON.stringify({
          question,
          answer,
          tags: selectedTags,
        }),
      });
      setQuestion("");
      setAnswer("");
      setTagInput("faq");
      await Promise.all([
        refreshKnowledge(selectedTenant.id),
        refreshAnalytics(selectedTenant.id),
        refreshUnanswered(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus("Knowledge saved");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function scanWebsiteForKnowledge() {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot import approved knowledge.");
      return;
    }
    if (!selectedTenant || !siteUrl) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<WebsiteImportResult>(
        `/admin/tenants/${selectedTenant.id}/knowledge/import-website`,
        {
          method: "POST",
          body: JSON.stringify({
            url: siteUrl,
            maxFaqs: 6,
            maxPages: crawlMaxPages,
          }),
        },
      );
      setWebsiteImport(result);
      setStatus(`${result.suggestedFaqs.length} website FAQs suggested`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function uploadKnowledgeDocument() {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot upload knowledge documents.");
      return;
    }
    if (!selectedTenant || !knowledgeUploadFile) {
      return;
    }

    setBusy(true);
    try {
      const contentBase64 = await readFileAsBase64(knowledgeUploadFile);
      const result = await apiFetch<{ suggestions?: KnowledgeSuggestion[] }>(
        `/admin/tenants/${selectedTenant.id}/knowledge/uploads`,
        {
          method: "POST",
          body: JSON.stringify({
            fileName: knowledgeUploadFile.name,
            contentType: knowledgeUploadFile.type || "application/octet-stream",
            contentBase64,
            maxSuggestions: 8,
            suggestedTags: ["document", "upload"],
          }),
        },
      );
      setKnowledgeUploadFile(null);
      await Promise.all([
        refreshKnowledgeSuggestions(selectedTenant.id),
        refreshKnowledgeIngestionJobs(selectedTenant.id),
      ]);
      setStatus(
        `${result.suggestions?.length ?? 0} document suggestions queued`,
      );
    } catch (error) {
      await refreshKnowledgeIngestionJobs(selectedTenant.id);
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function scanInteractionsForKnowledge() {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot scan customer interactions.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{
        created: KnowledgeSuggestion[];
        skipped: number;
        scanned: number;
      }>(`/admin/tenants/${selectedTenant.id}/knowledge/suggestions/scan`, {
        method: "POST",
        body: JSON.stringify({ limit: 50 }),
      });
      await Promise.all([
        refreshKnowledgeSuggestions(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus(
        `${result.created.length} learning suggestions created from ${result.scanned} interaction signals`,
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function importSuggestedFaqs(
    suggestions = websiteImport?.suggestedFaqs ?? [],
  ) {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot import approved knowledge.");
      return;
    }
    if (!selectedTenant || !suggestions.length) {
      return;
    }

    setBusy(true);
    try {
      await Promise.all(
        suggestions.map((item) =>
          apiFetch(`/admin/tenants/${selectedTenant.id}/knowledge/faqs`, {
            method: "POST",
            body: JSON.stringify(item),
          }),
        ),
      );
      await Promise.all([
        refreshKnowledge(selectedTenant.id),
        refreshAnalytics(selectedTenant.id),
        refreshUnanswered(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus(`${suggestions.length} website FAQs imported`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function verifyWidgetInstall() {
    if (!canManageChannels()) {
      setStatus("Your role cannot run installation checks.");
      return;
    }
    if (!selectedTenant || !siteUrl) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<InstallCheckResult>(
        `/admin/tenants/${selectedTenant.id}/install-check`,
        {
          method: "POST",
          body: JSON.stringify({
            url: siteUrl,
            assistantId: selectedTenant.publicId,
            widgetUrl: defaultWidgetUrl,
          }),
        },
      );
      setInstallCheck(result);
      setStatus(result.installed ? "Widget installed" : "Widget not found");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveChannelConnection(
    connection: ChannelConnection,
    updates: Partial<Pick<ChannelConnection, "externalAccountId" | "status">>,
  ) {
    if (!canManageChannels()) {
      setStatus("Your role cannot change channel setup.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(
        `/admin/tenants/${selectedTenant.id}/channel-connections/${connection.channel}`,
        {
          method: "PUT",
          body: JSON.stringify({
            provider: connection.provider,
            externalAccountId:
              updates.externalAccountId ?? connection.externalAccountId ?? null,
            status: updates.status ?? connection.status,
            settings: connection.settings ?? {},
          }),
        },
      );
      await refreshChannelConnections(selectedTenant.id);
      setStatus(`${connection.label} saved`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveNewTelephoneNumberSetup() {
    if (!canManageChannels()) {
      setStatus("Your role cannot change telephone setup.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<TelephoneSetupResponse>(
        `/admin/tenants/${selectedTenant.id}/telephone/new-number`,
        {
          method: "POST",
          body: JSON.stringify({
            provider: newNumberProvider,
            requestedCountry: newNumberCountry.trim() || "DE",
            numberType: newNumberType,
            areaCode: newNumberAreaCode || undefined,
            locality: newNumberLocality || undefined,
            orderedNumber: orderedPhoneNumber || undefined,
            sipRegistrar: newNumberSipRegistrar || undefined,
            sipUsername: newNumberSipUsername || undefined,
            sipConfigured: newNumberSipConfigured,
            fallbackNumber: telephoneFallbackNumber || undefined,
            notes: telephoneNotes || undefined,
          }),
        },
      );
      setTelephoneInstructions(result.instructions ?? []);
      await refreshChannelConnections(selectedTenant.id);
      setStatus(
        orderedPhoneNumber && newNumberSipConfigured
          ? "New provider number marked connected"
          : "New provider number setup saved",
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCarrierForwardingSetup() {
    if (!canManageChannels()) {
      setStatus("Your role cannot change telephone setup.");
      return;
    }
    if (!selectedTenant || !forwardingExistingNumber || !forwardingAiNumber) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<TelephoneSetupResponse>(
        `/admin/tenants/${selectedTenant.id}/telephone/carrier-forwarding`,
        {
          method: "POST",
          body: JSON.stringify({
            provider: forwardingProvider,
            existingNumber: forwardingExistingNumber,
            aiNumber: forwardingAiNumber,
            carrierName: forwardingCarrierName || undefined,
            forwardingConfirmed,
            fallbackNumber: telephoneFallbackNumber || undefined,
            notes: telephoneNotes || undefined,
          }),
        },
      );
      setTelephoneInstructions(result.instructions ?? []);
      await refreshChannelConnections(selectedTenant.id);
      setStatus(
        forwardingConfirmed
          ? "Carrier forwarding marked connected"
          : "Carrier forwarding instructions saved",
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveSipByocSetup() {
    if (!canManageChannels()) {
      setStatus("Your role cannot change telephone setup.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<TelephoneSetupResponse>(
        `/admin/tenants/${selectedTenant.id}/telephone/sip-byoc`,
        {
          method: "POST",
          body: JSON.stringify({
            provider: sipProvider,
            carrierName: sipCarrierName || undefined,
            sipDomain: sipDomain || undefined,
            sipRegistrar: sipRegistrar || undefined,
            sipUsername: sipUsername || undefined,
            trunkSid: sipTrunkSid || undefined,
            inboundSipUri: sipInboundUri || undefined,
            publicNumber: sipPublicNumber || undefined,
            fallbackNumber: telephoneFallbackNumber || undefined,
            sipConfigured,
            notes: telephoneNotes || undefined,
          }),
        },
      );
      setTelephoneInstructions(result.instructions ?? []);
      await refreshChannelConnections(selectedTenant.id);
      setStatus(
        sipConfigured ? "SIP trunk marked connected" : "SIP trunk setup saved",
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveTelephoneRuntimeSettings() {
    if (!canManageChannels()) {
      setStatus("Your role cannot change telephone settings.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<TelephoneSetupResponse>(
        `/admin/tenants/${selectedTenant.id}/telephone/settings`,
        {
          method: "PUT",
          body: JSON.stringify(buildTelephoneSettingsPayload()),
        },
      );
      setTelephoneWarnings(result.warnings ?? []);
      await refreshChannelConnections(selectedTenant.id);
      setStatus("Telephone settings saved");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveTelephoneTestCall(
    testStatus: "pending" | "passed" | "failed",
  ) {
    if (!canManageChannels()) {
      setStatus("Your role cannot change telephone settings.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setTelephoneTestCallStatus(testStatus);
    if (testStatus === "passed") {
      setPhoneTestCallCompleted(true);
    }

    setBusy(true);
    try {
      const result = await apiFetch<TelephoneSetupResponse>(
        `/admin/tenants/${selectedTenant.id}/telephone/settings`,
        {
          method: "PUT",
          body: JSON.stringify(buildTelephoneSettingsPayload(testStatus)),
        },
      );
      setTelephoneWarnings(result.warnings ?? []);
      await refreshChannelConnections(selectedTenant.id);
      setStatus(
        testStatus === "passed"
          ? "Test call marked successful"
          : `Test call marked ${testStatus}`,
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshVoiceEdgeStatus() {
    if (!canManageChannels()) {
      setStatus("Your role cannot check telephone setup.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<TelephoneVoiceEdgeStatus>(
        `/admin/tenants/${selectedTenant.id}/telephone/voice-edge-status`,
      );
      setVoiceEdgeStatus(result);
      setStatus(`Voice edge is ${result.status}`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  function buildTelephoneSettingsPayload(testStatus = telephoneTestCallStatus) {
    const provider = currentTelephoneProvider();
    const testCallCompleted = testStatus === "passed" || phoneTestCallCompleted;
    return {
      provider,
      setupChecklist: {
        numberOrdered: phoneNumberOrdered,
        sipConfigured: phoneSipConfigured,
        testCallCompleted,
        fallbackSet: phoneFallbackSet || Boolean(telephoneFallbackNumber),
        disclosureConfirmed:
          phoneDisclosureConfirmed || Boolean(phoneDisclosureText.trim()),
      },
      businessHours: {
        mode: businessHoursMode,
        timezone: businessHoursTimezone,
        hours: businessHoursText,
        afterHoursAction,
      },
      handoffRules: {
        lowConfidence: handoffLowConfidence,
        urgentKeywords: handoffUrgentKeywords,
        officeHoursTransfer: handoffOfficeHoursTransfer,
        repeatedFailure: handoffRepeatedFailure,
        askBeforeTransfer: handoffAskBeforeTransfer,
      },
      gdpr: {
        disclosureText: phoneDisclosureText,
        recordingEnabled: phoneRecordingEnabled,
        storeTranscripts: phoneStoreTranscripts,
        transcriptRetentionDays: phoneTranscriptRetentionDays,
      },
      voiceQuality: {
        language: phoneVoiceLanguage,
        speakingStyle: phoneSpeakingStyle,
        maxAnswerLength: phoneMaxAnswerLength,
        askBeforeTransfer: handoffAskBeforeTransfer,
      },
      testCall: {
        status: testStatus,
        phoneNumber: telephoneTestCallNumber || undefined,
        notes: telephoneTestCallNotes || undefined,
      },
    };
  }

  function currentTelephoneProvider(): TelephoneProvider {
    const connectionProvider = normalizeTelephoneProviderUi(
      telephoneConnection?.provider,
    );
    if (telephoneConnection?.provider) {
      return connectionProvider;
    }
    if (telephoneSetupMode === "forwarding") {
      return forwardingProvider;
    }
    if (telephoneSetupMode === "sip_byoc") {
      return sipProvider;
    }
    return newNumberProvider;
  }

  async function saveWhatsappTemplate() {
    if (!canManageChannels()) {
      setStatus("Your role cannot change WhatsApp templates.");
      return;
    }
    if (!selectedTenant || !templateName || !templateBody) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(`/admin/tenants/${selectedTenant.id}/whatsapp/templates`, {
        method: "POST",
        body: JSON.stringify({
          name: templateName,
          language: templateLanguage,
          category: templateCategory,
          status: templateStatus,
          body: templateBody,
        }),
      });
      await refreshWhatsappOperations(selectedTenant.id);
      await refreshWorkflowSuggestions(selectedTenant.id);
      setStatus("WhatsApp template saved");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleLeadField(field: string) {
    setLeadCaptureFields((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field],
    );
  }

  function applyQuickReplyPreset(preset: "consultancy" | "lead" | "privacy") {
    if (preset === "lead") {
      setQuickReplies(
        [
          "Beratung anfragen",
          "Termin buchen",
          "Budget klären",
          "Use Case prüfen",
        ].join("\n"),
      );
      setLeadCaptureEnabled(true);
      return;
    }

    if (preset === "privacy") {
      setQuickReplies(
        [
          "Datenschutz klären",
          "Datenverarbeitung verstehen",
          "DSGVO Fragen",
          "Beratung anfragen",
        ].join("\n"),
      );
      setConsentEnabled(true);
      return;
    }

    setQuickReplies(defaultTheme.quickReplies.join("\n"));
    setReadinessEnabled(true);
    setLeadCaptureEnabled(true);
  }

  function draftFaqFromUnanswered(item: UnansweredQuestion) {
    setQuestion(item.question);
    setAnswer(suggestFaqAnswerFromUnanswered(item));
    setTagInput(item.suggestedTags.join(", "));
    setTestMessage(item.question);
    setActiveTab("knowledge");
    setStatus("FAQ draft prepared from unanswered question");
  }

  async function importFaqBlocks() {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot import approved knowledge.");
      return;
    }
    if (!selectedTenant || !importFaqs.length) {
      return;
    }

    setBusy(true);
    try {
      await Promise.all(
        importFaqs.map((item) =>
          apiFetch(`/admin/tenants/${selectedTenant.id}/knowledge/faqs`, {
            method: "POST",
            body: JSON.stringify({
              question: item.question,
              answer: item.answer,
              tags: selectedTags,
            }),
          }),
        ),
      );
      setImportText("");
      await Promise.all([
        refreshKnowledge(selectedTenant.id),
        refreshAnalytics(selectedTenant.id),
        refreshUnanswered(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus(`${importFaqs.length} FAQs imported`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  function startKnowledgeEdit(item: KnowledgeItem) {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot edit approved knowledge.");
      return;
    }
    setEditingKnowledgeId(item.id);
    setEditQuestion(getQuestion(item));
    setEditAnswer(getAnswer(item));
  }

  function cancelKnowledgeEdit() {
    setEditingKnowledgeId("");
    setEditQuestion("");
    setEditAnswer("");
  }

  async function saveKnowledgeEdit(item: KnowledgeItem) {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot edit approved knowledge.");
      return;
    }
    if (!selectedTenant || !editQuestion || !editAnswer) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(
        `/admin/tenants/${selectedTenant.id}/knowledge/${item.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            question: editQuestion,
            answer: editAnswer,
            tags: item.tags?.length ? item.tags : ["faq"],
          }),
        },
      );
      cancelKnowledgeEdit();
      await Promise.all([
        refreshKnowledge(selectedTenant.id),
        refreshAnalytics(selectedTenant.id),
        refreshUnanswered(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus("Knowledge updated");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteKnowledge(item: KnowledgeItem) {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot delete approved knowledge.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(
        `/admin/tenants/${selectedTenant.id}/knowledge/${item.id}`,
        {
          method: "DELETE",
        },
      );
      setConfirmDeleteItem(null);
      await Promise.all([
        refreshKnowledge(selectedTenant.id),
        refreshAnalytics(selectedTenant.id),
        refreshUnanswered(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus("Knowledge deleted");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  function startSuggestionEdit(item: KnowledgeSuggestion) {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot approve knowledge suggestions.");
      return;
    }
    setEditingSuggestionId(item.id);
    setSuggestionQuestionDraft(
      item.suggestedQuestion ?? item.suggestedTitle ?? "",
    );
    setSuggestionAnswerDraft(item.suggestedAnswer ?? "");
  }

  function cancelSuggestionEdit() {
    setEditingSuggestionId("");
    setSuggestionQuestionDraft("");
    setSuggestionAnswerDraft("");
  }

  async function approveKnowledgeSuggestion(item: KnowledgeSuggestion) {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot approve knowledge suggestions.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    const isEditing = editingSuggestionId === item.id;
    const payload = isEditing
      ? {
          question: suggestionQuestionDraft,
          answer: suggestionAnswerDraft,
          tags: item.suggestedTags,
        }
      : {};

    setBusy(true);
    try {
      await apiFetch(
        `/admin/tenants/${selectedTenant.id}/knowledge/suggestions/${item.id}/approve`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      cancelSuggestionEdit();
      await Promise.all([
        refreshKnowledge(selectedTenant.id),
        refreshKnowledgeSuggestions(selectedTenant.id),
        refreshAnalytics(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus("Knowledge suggestion approved");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function rejectKnowledgeSuggestion(item: KnowledgeSuggestion) {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot reject knowledge suggestions.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(
        `/admin/tenants/${selectedTenant.id}/knowledge/suggestions/${item.id}/reject`,
        {
          method: "POST",
          body: JSON.stringify({
            reviewNote: "Rejected in Knowledge review.",
          }),
        },
      );
      if (editingSuggestionId === item.id) {
        cancelSuggestionEdit();
      }
      await refreshKnowledgeSuggestions(selectedTenant.id);
      setStatus("Knowledge suggestion rejected");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function updateHandoff(
    handoff: Handoff,
    statusValue: Handoff["status"],
    assignedTo = handoff.assignedTo,
    pipelineStage?: LeadPipelineStage,
    note?: string,
  ) {
    if (!canManageLeads()) {
      setStatus("Your role cannot update leads or handoffs.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(
        `/admin/tenants/${selectedTenant.id}/handoffs/${handoff.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: statusValue,
            assignedTo:
              statusValue === "resolved"
                ? (assignedTo ?? "Assad Dar")
                : (assignedTo ?? null),
            pipelineStage,
            note,
          }),
        },
      );
      await Promise.all([
        refreshHandoffs(selectedTenant.id),
        refreshUnifiedInbox(selectedTenant.id),
        refreshAnalytics(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus("Handoff updated");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveSelectedLeadNote() {
    if (!selectedLead || !leadNote.trim()) {
      return;
    }
    await updateHandoff(
      selectedLead,
      selectedLead.status,
      selectedLead.assignedTo,
      getPipelineStage(selectedLead),
      leadNote.trim(),
    );
    setLeadNote("");
  }

  async function saveSelectedLeadFollowUp() {
    if (!selectedLead || !leadFollowUpDate) {
      return;
    }
    await updateHandoff(
      selectedLead,
      selectedLead.status,
      selectedLead.assignedTo,
      getPipelineStage(selectedLead),
      `Follow up on ${leadFollowUpDate}`,
    );
    setLeadFollowUpDate("");
  }

  async function testAssistant(event: FormEvent) {
    event.preventDefault();
    if (!canManageLeads()) {
      setStatus("Your role cannot run assistant tests.");
      return;
    }
    if (!selectedTenant || !testMessage) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ answer: TestAnswer }>(
        `/admin/tenants/${selectedTenant.id}/test-assistant`,
        {
          method: "POST",
          body: JSON.stringify({ message: testMessage }),
        },
      );
      setTestAnswer(result.answer);
      await Promise.all([
        refreshAnalytics(selectedTenant.id),
        refreshConversations(selectedTenant.id),
        refreshUnifiedInbox(selectedTenant.id),
        refreshHandoffs(selectedTenant.id),
        refreshUnanswered(selectedTenant.id),
      ]);
      setStatus("Assistant tested");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, label: string) {
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      // Track which label was copied so buttons can show a transient "Copied!"
      // state, then clear it after a couple of seconds.
      setCopiedSnippet(label);
      if (copiedResetTimer.current) {
        clearTimeout(copiedResetTimer.current);
      }
      copiedResetTimer.current = setTimeout(() => setCopiedSnippet(""), 2000);
      setStatus(`${label} copied`);
    } catch {
      setStatus("Copy failed");
    }
  }

  function openLeadDetail(handoff: Handoff) {
    setSelectedLeadId(handoff.id);
    setLeadNote("");
    setLeadFollowUpDate(getLeadFollowUpDate(handoff));
    setLeadReplyDraft(buildLeadReplyDraft(handoff, leadReplyTone, bookingUrl));
  }

  function prepareLeadReplyDraft(tone = leadReplyTone) {
    if (!selectedLead) {
      return;
    }
    setLeadReplyTone(tone);
    setLeadReplyDraft(buildLeadReplyDraft(selectedLead, tone, bookingUrl));
    setStatus("Reply draft prepared");
  }

  function downloadFollowUpCalendar(handoff: Handoff, date: string) {
    if (!date) {
      return;
    }
    const blob = new Blob([buildFollowUpIcs(handoff, date)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      getLeadDisplayName(handoff)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "lead"
    }-follow-up.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Follow-up calendar file downloaded");
  }

  function renderMetrics() {
    return (
      <>
        <DashboardMetrics
          loading={
            (busy || workspaceLoading) && !analytics && knowledge.length === 0
          }
          conversations={analytics?.conversations ?? 0}
          messages={analytics?.messages ?? 0}
          contacts={knownContactCount}
          leads={leadHandoffs.length}
          knowledge={analytics?.approvedKnowledge ?? knowledge.length}
          openHandoffs={analytics?.openHandoffs ?? openHandoffs.length}
          unanswered={unansweredCount}
          onOpenAnswers={() => setActiveTab("knowledge")}
          onOpenInbox={() => setActiveTab("leads")}
        />
        <AnalyticsPanel analytics={analytics} />
      </>
    );
  }

  function renderSetupChecklist() {
    return (
      <section className="panel setupPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <ClipboardCheck size={18} />
            <h2>Launch checklist</h2>
          </div>
          <span className="countPill">
            {completedSteps}/{setupSteps.length}
          </span>
        </div>
        <div className="progressTrack">
          <span
            style={{ width: `${(completedSteps / setupSteps.length) * 100}%` }}
          />
        </div>
        <div className="setupList">
          {setupSteps.map((step) => (
            <button
              data-done={step.done ? "true" : "false"}
              key={step.label}
              type="button"
              onClick={() => setActiveTab(step.tab)}
            >
              {step.done ? (
                <CheckCircle2 size={17} />
              ) : (
                <AlertCircle size={17} />
              )}
              <div>
                <strong>{step.label}</strong>
                <span>{step.done ? "Ready" : step.action}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderTodayPanel() {
    const activeAutomationCount = [
      automationSettings.ownerLeadEmailEnabled,
      automationSettings.visitorConfirmationEmailEnabled,
      automationSettings.autoQualifyReadinessEnabled,
      automationSettings.autoQualifyLeadDetailsEnabled,
      automationSettings.weeklySummaryEmailEnabled,
    ].filter(Boolean).length;

    return (
      <section className="panel todayPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <Sparkles size={18} />
            <h2>Today</h2>
          </div>
          <span className="countPill">
            {openLeads.length + unansweredQuestions.length + staleLeads.length}
          </span>
        </div>
        <div className="todayGrid">
          <button
            type="button"
            onClick={() => setActiveTab("leads")}
            data-alert={openLeads.length ? "true" : "false"}
          >
            <span>Follow up</span>
            <strong>{openLeads.length}</strong>
            <small>Open leads</small>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("leads")}
            data-alert={staleLeads.length ? "true" : "false"}
          >
            <span>Reminder</span>
            <strong>{staleLeads.length}</strong>
            <small>Stale leads</small>
          </button>
          <button type="button" onClick={() => setActiveTab("knowledge")}>
            <span>Knowledge</span>
            <strong>{unansweredQuestions.length}</strong>
            <small>FAQ drafts</small>
          </button>
          <button type="button" onClick={() => setActiveTab("settings")}>
            <span>Automation</span>
            <strong>{activeAutomationCount}/5</strong>
            <small>Rules active</small>
          </button>
        </div>
      </section>
    );
  }

  function renderProgressionPanel() {
    const unlockProgress = nextProductLevel
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((productScore - currentProductLevel.threshold) /
                Math.max(
                  1,
                  nextProductLevel.threshold - currentProductLevel.threshold,
                )) *
                100,
            ),
          ),
        )
      : 100;

    return (
      <section className="panel progressionPanel">
        <div className="progressionHero">
          <div>
            <span className="eyebrow">Operator level</span>
            <h2>{currentProductLevel.name}</h2>
            <p>{currentProductLevel.detail}</p>
          </div>
          <div className="levelScore">
            <span>Score</span>
            <strong>{productScore}</strong>
            <small>/100</small>
          </div>
        </div>
        <div className="unlockRow">
          <div>
            <span>
              {nextProductLevel
                ? `Next: ${nextProductLevel.name}`
                : "Max level reached"}
            </span>
            <strong>
              {nextProductLevel
                ? `${Math.max(0, nextProductLevel.threshold - productScore)} points to unlock`
                : "Keep the loop healthy"}
            </strong>
          </div>
          <div className="progressTrack large">
            <span style={{ width: `${unlockProgress}%` }} />
          </div>
        </div>
        <div className="levelTrack">
          {productLevels.map((level) => (
            <article
              data-active={
                level.name === currentProductLevel.name ? "true" : "false"
              }
              data-done={productScore >= level.threshold ? "true" : "false"}
              key={level.name}
            >
              <small>{level.threshold}</small>
              <strong>{level.name}</strong>
            </article>
          ))}
        </div>
        <div className="scoreGuideGrid">
          {scoreGuides.map((guide) => (
            <button
              className="scoreGuide"
              key={guide.label}
              type="button"
              onClick={() => setActiveTab(guide.tab)}
            >
              <span>{guide.label}</span>
              <strong>{guide.score}%</strong>
              <small>{guide.action}</small>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderCommandQueue() {
    const primaryCommand = commandQueue[0] ?? null;
    const secondaryCommands = commandQueue.slice(1, 7);

    return (
      <section className="panel commandPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <ClipboardCheck size={18} />
            <h2>Command queue</h2>
          </div>
          <span className="countPill">{commandQueue.length}</span>
        </div>
        {primaryCommand ? (
          <button
            className="primaryCommand"
            data-tone={primaryCommand.tone}
            type="button"
            onClick={() => setActiveTab(primaryCommand.tab)}
          >
            <span>{primaryCommand.source}</span>
            <strong>{primaryCommand.title}</strong>
            <small>{primaryCommand.detail}</small>
            <em>{primaryCommand.reward}</em>
          </button>
        ) : (
          <div className="emptyState compact">
            No urgent work. Run one fresh website test and keep the loop warm.
          </div>
        )}
        <div className="commandGrid">
          {secondaryCommands.map((action) => (
            <button
              className="actionItem"
              data-tone={action.tone}
              key={`${action.source}-${action.title}`}
              type="button"
              onClick={() => setActiveTab(action.tab)}
            >
              <span>{action.source}</span>
              <strong>{action.title}</strong>
              <small>{action.impact}</small>
              <em>{action.reward}</em>
            </button>
          ))}
        </div>
        {weakestScoreGuide ? (
          <button
            className="weakestGuide"
            type="button"
            onClick={() => setActiveTab(weakestScoreGuide.tab)}
          >
            <span>Best score lift</span>
            <strong>{weakestScoreGuide.label}</strong>
            <small>{weakestScoreGuide.action}</small>
          </button>
        ) : null}
      </section>
    );
  }

  function renderOperationalHealth() {
    const knowledgeGapCount =
      unansweredTopicGroups.length + missingKnowledgeChecks.length;

    return (
      <section className="panel operationalPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <BarChart3 size={18} />
            <h2>Operational health</h2>
          </div>
          <span className="countPill">{channelReadinessScore}% channels</span>
        </div>
        <div className="operationalGrid">
          <article data-alert={dueLeads.length ? "true" : "false"}>
            <span>Due follow-ups</span>
            <strong>{dueLeads.length}</strong>
            <small>Scheduled leads needing attention today</small>
          </article>
          <article data-alert={hotLeads.length ? "true" : "false"}>
            <span>Hot leads</span>
            <strong>{hotLeads.length}</strong>
            <small>At or above the qualification threshold</small>
          </article>
          <article>
            <span>Average lead score</span>
            <strong>{averageLeadScore}/100</strong>
            <small>Based on captured lead details</small>
          </article>
          <article data-alert={knowledgeGapCount ? "true" : "false"}>
            <span>Knowledge gaps</span>
            <strong>{knowledgeGapCount}</strong>
            <small>Missing topics and unanswered questions</small>
          </article>
        </div>
      </section>
    );
  }

  function readinessActionTab(checkId: string): TabKey {
    if (checkId.startsWith("provider.") || checkId.startsWith("voice.")) {
      return "channels";
    }
    if (checkId.startsWith("handoff.")) {
      return "leads";
    }
    if (checkId.startsWith("ai.")) {
      return "knowledge";
    }
    return "settings";
  }

  function renderProductionReadiness() {
    const score = productionReadiness?.score ?? 0;
    const statusLabel =
      productionReadiness?.status === "ready_for_beta"
        ? "Beta ready"
        : productionReadiness?.status === "needs_work"
          ? "Needs work"
          : productionReadiness
            ? "Not ready"
            : "Checking";
    const nextActions = productionReadiness?.summary.nextActions ?? [];

    return (
      <section className="panel operationalPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <ShieldCheck size={18} />
            <h2>Production readiness</h2>
          </div>
          <span
            className="countPill"
            data-tone={
              productionReadiness?.status === "ready_for_beta" ? "good" : "warn"
            }
          >
            {score}/100
          </span>
        </div>
        <div className="progressTrack">
          <span style={{ width: `${score}%` }} />
        </div>
        <div className="operationalGrid">
          <article
            data-alert={productionReadiness?.summary.failed ? "true" : "false"}
          >
            <span>Status</span>
            <strong>{statusLabel}</strong>
            <small>Production beta gate across the top 10 areas</small>
          </article>
          <article>
            <span>Passed</span>
            <strong>{productionReadiness?.summary.passed ?? 0}</strong>
            <small>Checks already satisfied</small>
          </article>
          <article
            data-alert={
              productionReadiness?.summary.warnings ? "true" : "false"
            }
          >
            <span>Warnings</span>
            <strong>{productionReadiness?.summary.warnings ?? 0}</strong>
            <small>Useful before launch</small>
          </article>
          <article
            data-alert={productionReadiness?.summary.failed ? "true" : "false"}
          >
            <span>Blockers</span>
            <strong>{productionReadiness?.summary.failed ?? 0}</strong>
            <small>Must resolve before production selling</small>
          </article>
        </div>
        <div className="nextActionList">
          {nextActions.length ? (
            nextActions.slice(0, 4).map((check) => (
              <button
                className="actionItem"
                data-tone={check.status === "fail" ? "urgent" : "warn"}
                key={check.id}
                type="button"
                onClick={() => setActiveTab(readinessActionTab(check.id))}
              >
                <span>{check.status}</span>
                <strong>{check.title}</strong>
                <small>{check.detail}</small>
              </button>
            ))
          ) : (
            <div className="emptyState compact">
              Production readiness has no open actions.
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderWorkflowSuggestions() {
    const suggestions = workflowSuggestions?.suggestions ?? [];

    return (
      <section className="panel actionPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <Sparkles size={18} />
            <h2>Automation recommendations</h2>
          </div>
          <span className="countPill">{suggestions.length}</span>
        </div>
        <div className="nextActionList">
          {suggestions.length ? (
            suggestions.slice(0, 6).map((suggestion) => (
              <button
                className="actionItem"
                data-tone={
                  suggestion.priority === "high"
                    ? "urgent"
                    : suggestion.priority === "medium"
                      ? "warn"
                      : "info"
                }
                key={suggestion.id}
                type="button"
                onClick={() =>
                  setActiveTab(
                    suggestion.category === "whatsapp" ? "channels" : "leads",
                  )
                }
              >
                <span>{suggestion.priority}</span>
                <strong>{suggestion.title}</strong>
                <small>{suggestion.detail}</small>
              </button>
            ))
          ) : (
            <div className="emptyState compact">
              No automation recommendations yet.
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderOverview() {
    return (
      <div className="workspaceStack">
        {renderMetrics()}
        {renderTodayPanel()}
        {renderProductionReadiness()}
        {renderProgressionPanel()}
        {renderCommandQueue()}
        {renderOperationalHealth()}
        <div className="overviewGrid">
          {renderSetupChecklist()}
          {renderWorkflowSuggestions()}

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <ShieldCheck size={18} />
                <h2>Business readiness</h2>
              </div>
              <span
                className="countPill"
                data-tone={missingKnowledgeChecks.length ? "warn" : "good"}
              >
                {missingKnowledgeChecks.length ? "Needs work" : "Ready"}
              </span>
            </div>
            <div className="readinessList">
              {businessKnowledgeChecks.map((check) => {
                const done = !missingKnowledgeChecks.some(
                  (missing) => missing.label === check.label,
                );
                return (
                  <article
                    data-done={done ? "true" : "false"}
                    key={check.label}
                  >
                    {done ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <AlertCircle size={16} />
                    )}
                    <span>{check.label}</span>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Inbox size={18} />
                <h2>Needs attention</h2>
              </div>
              <span className="countPill">{openHandoffs.length}</span>
            </div>
            <div className="compactList">
              {openHandoffs.length ? (
                openHandoffs.slice(0, 4).map((handoff) => (
                  <button
                    className="plainListButton"
                    key={handoff.id}
                    type="button"
                    onClick={() => setActiveTab("leads")}
                  >
                    <strong>{handoff.reason}</strong>
                    <span>{handoff.requesterMessage}</span>
                  </button>
                ))
              ) : (
                <div className="emptyState compact">No open handoffs.</div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <MessageSquare size={18} />
                <h2>Recent conversations</h2>
              </div>
              <span className="countPill">
                {analytics?.conversations ?? conversations.length}
              </span>
            </div>
            <div className="compactList">
              {conversations.length ? (
                conversations.slice(0, 4).map((conversation) => (
                  <button
                    className="plainListButton"
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      setSelectedConversationId(conversation.id);
                      setActiveTab("leads");
                    }}
                  >
                    <strong>{titleCase(conversation.channel)}</strong>
                    <span>{formatDate(conversation.createdAt)}</span>
                  </button>
                ))
              ) : (
                <div className="emptyState compact">No conversations yet.</div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <BarChart3 size={18} />
                <h2>Traffic funnel</h2>
              </div>
              <span className="countPill">
                {formatPercent(leadConversionRate)}
              </span>
            </div>
            <div className="funnelGrid">
              <article>
                <span>Widget opens</span>
                <strong>{widgetOpenCount}</strong>
              </article>
              <article>
                <span>Chat outcomes</span>
                <strong>{chatOutcomeCount}</strong>
              </article>
              <article>
                <span>Quick replies</span>
                <strong>{quickReplyCount}</strong>
              </article>
              <article>
                <span>CTA clicks</span>
                <strong>{ctaClickCount}</strong>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <BarChart3 size={18} />
                <h2>Answer quality</h2>
              </div>
              <span className="countPill">
                {formatPercent(100 - unansweredRate)}
              </span>
            </div>
            <div className="qualityRows">
              <article>
                <span>Answered</span>
                <strong>{answeredCount}</strong>
              </article>
              <article data-alert={unansweredCount ? "true" : "false"}>
                <span>Needs knowledge or human</span>
                <strong>{unansweredCount}</strong>
              </article>
              <article>
                <span>Lead captures</span>
                <strong>{leadHandoffs.length}</strong>
              </article>
              <article>
                <span>Won leads</span>
                <strong>{wonLeadCount}</strong>
              </article>
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderKnowledgeLoopPanel(canEditKnowledge: boolean) {
    const bestGap =
      unansweredTopicGroups[0]?.items[0] ?? unansweredQuestions[0];
    const openKnowledgeManager = () => {
      document
        .getElementById("knowledge-manager")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const openTestStudio = () => {
      if (bestGap && !testMessage) {
        setTestMessage(bestGap.question);
      }
      setActiveTab("settings");
      window.setTimeout(() => {
        document
          .getElementById("test-settings")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    };
    const loopSteps = [
      {
        label: "Find gap",
        done: Boolean(bestGap) || unansweredQuestions.length === 0,
        detail: bestGap
          ? `${unansweredQuestions.length} unanswered question${unansweredQuestions.length === 1 ? "" : "s"} waiting`
          : "No active customer gaps",
        action: () => bestGap && draftFaqFromUnanswered(bestGap),
        disabled: !bestGap || !canEditKnowledge,
      },
      {
        label: "Draft answer",
        done: Boolean(question && answer),
        detail:
          question && answer
            ? "Candidate FAQ ready"
            : "Use a real customer question",
        action: openKnowledgeManager,
        disabled: false,
      },
      {
        label: "Publish FAQ",
        done: knowledge.some(
          (item) =>
            question &&
            getQuestion(item).trim().toLowerCase() ===
              question.trim().toLowerCase(),
        ),
        detail: "Save it as approved knowledge",
        action: openKnowledgeManager,
        disabled: false,
      },
      {
        label: "Retest",
        done: Boolean(testAnswer),
        detail: testAnswer
          ? `${titleCase(testAnswer.status)} at ${Math.round(testAnswer.confidence * 100)}% confidence`
          : "Run the same question in Test",
        action: openTestStudio,
        disabled: !testMessage && !bestGap,
      },
    ];

    return (
      <section className="panel knowledgeLoopPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <Sparkles size={18} />
            <h2>Knowledge improvement loop</h2>
          </div>
          <span className="countPill">{answerQualityScore}% quality</span>
        </div>
        <div className="loopStepGrid">
          {loopSteps.map((step, index) => (
            <button
              className="loopStepCard"
              data-done={step.done ? "true" : "false"}
              disabled={step.disabled}
              key={step.label}
              type="button"
              onClick={step.action}
            >
              <small>{index + 1}</small>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </button>
          ))}
        </div>
        <div className="loopFocus">
          <div>
            <span>Current gap</span>
            <strong>
              {bestGap ? bestGap.question : "No unanswered questions right now"}
            </strong>
            <small>
              {bestGap
                ? `${titleCase(bestGap.reason)} from ${bestGap.channel}`
                : "Keep testing new buyer objections weekly."}
            </small>
          </div>
          <div className="rowActions">
            <button
              className="secondaryButton"
              type="button"
              disabled={!bestGap || !canEditKnowledge}
              onClick={() => bestGap && draftFaqFromUnanswered(bestGap)}
            >
              <Plus size={15} />
              Draft from gap
            </button>
            <button
              className="primaryButton"
              type="button"
              disabled={!testMessage && !bestGap}
              onClick={openTestStudio}
            >
              <MessageCircle size={15} />
              Open test
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderKnowledgeUploadsPanel(canEditKnowledge: boolean) {
    return (
      <section className="panel">
        <div className="panelHeader">
          <div className="panelTitle">
            <Upload size={18} />
            <h2>Document uploads</h2>
          </div>
          <span className="countPill">{knowledgeIngestionJobs.length}</span>
        </div>
        <div className="knowledgeTools">
          <label className="filePicker">
            <input
              key={knowledgeUploadFile?.name ?? "empty-upload"}
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,.pdf,text/*,application/pdf"
              disabled={!canEditKnowledge}
              onChange={(event) =>
                setKnowledgeUploadFile(event.target.files?.[0] ?? null)
              }
            />
            <span className="filePickerIcon">
              <Upload size={18} />
            </span>
            <span>
              <strong>{knowledgeUploadFile?.name ?? "Choose document"}</strong>
              <small>TXT, Markdown, CSV, JSON, or PDF</small>
            </span>
          </label>
          <button
            className="primaryButton"
            type="button"
            disabled={busy || !canEditKnowledge || !knowledgeUploadFile}
            onClick={uploadKnowledgeDocument}
          >
            <Upload size={15} />
            Upload
          </button>
        </div>
        {knowledgeIngestionJobs.length ? (
          <div className="suggestionStack">
            {knowledgeIngestionJobs.map((job) => (
              <article className="suggestionItem" key={job.id}>
                <strong>{job.fileName}</strong>
                <p>{job.error ?? titleCase(job.status)}</p>
                <div className="tagRow">
                  <small>{titleCase(job.status)}</small>
                  <small>{job.contentType}</small>
                  <small>{formatDate(job.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyState compact">No document jobs yet.</div>
        )}
      </section>
    );
  }

  function renderKnowledgeSuggestionsPanel(canEditKnowledge: boolean) {
    return (
      <section className="panel">
        <div className="panelHeader">
          <div className="panelTitle">
            <Sparkles size={18} />
            <h2>Brain suggestions</h2>
          </div>
          <div className="rowActions">
            <span className="countPill">{knowledgeSuggestions.length}</span>
            <button
              className="secondaryButton"
              type="button"
              disabled={busy || !canEditKnowledge}
              onClick={scanInteractionsForKnowledge}
            >
              <RefreshCw size={15} />
              Scan
            </button>
          </div>
        </div>
        {!knowledgeSuggestions.length ? (
          <div className="emptyState compact">
            No pending learning suggestions.
          </div>
        ) : (
          <div className="suggestionStack">
            {knowledgeSuggestions.map((item) => {
              const isEditing = editingSuggestionId === item.id;
              const confidence = Number(item.confidence);
              return (
                <article className="suggestionItem" key={item.id}>
                  {isEditing ? (
                    <div className="editStack">
                      <label className="field">
                        <span>Question</span>
                        <input
                          value={suggestionQuestionDraft}
                          disabled={!canEditKnowledge}
                          onChange={(event) =>
                            setSuggestionQuestionDraft(event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Answer</span>
                        <textarea
                          value={suggestionAnswerDraft}
                          disabled={!canEditKnowledge}
                          onChange={(event) =>
                            setSuggestionAnswerDraft(event.target.value)
                          }
                          rows={4}
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <strong>
                        {item.suggestedQuestion ??
                          item.suggestedTitle ??
                          "Untitled suggestion"}
                      </strong>
                      <p>
                        {item.suggestedAnswer ??
                          "Add an answer before approving this suggestion."}
                      </p>
                    </>
                  )}
                  <div className="tagRow">
                    <small>{titleCase(item.sourceType)}</small>
                    <small>{formatPercent(confidence * 100)} confidence</small>
                    {item.suggestedTags.map((tag) => (
                      <small key={tag}>{tag}</small>
                    ))}
                  </div>
                  <div className="rowActions">
                    {isEditing ? (
                      <>
                        <button
                          className="secondaryButton"
                          type="button"
                          disabled={busy}
                          onClick={cancelSuggestionEdit}
                        >
                          <X size={15} />
                          Cancel
                        </button>
                        <button
                          className="primaryButton"
                          type="button"
                          disabled={
                            busy ||
                            !canEditKnowledge ||
                            !suggestionQuestionDraft ||
                            !suggestionAnswerDraft
                          }
                          onClick={() => approveKnowledgeSuggestion(item)}
                        >
                          <CheckCircle2 size={15} />
                          Save approval
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="primaryButton"
                          type="button"
                          disabled={
                            busy ||
                            !canEditKnowledge ||
                            !item.suggestedAnswer ||
                            !(item.suggestedQuestion || item.suggestedTitle)
                          }
                          onClick={() => approveKnowledgeSuggestion(item)}
                        >
                          <CheckCircle2 size={15} />
                          Approve
                        </button>
                        <button
                          className="secondaryButton"
                          type="button"
                          disabled={busy || !canEditKnowledge}
                          onClick={() => startSuggestionEdit(item)}
                        >
                          <Save size={15} />
                          Edit
                        </button>
                        <button
                          className="dangerButton"
                          type="button"
                          disabled={busy || !canEditKnowledge}
                          onClick={() => rejectKnowledgeSuggestion(item)}
                        >
                          <X size={15} />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function renderKnowledge() {
    const canEditKnowledge = canManageKnowledge();
    return (
      <div className="workspaceStack">
        {renderKnowledgeLoopPanel(canEditKnowledge)}
        {renderKnowledgeUploadsPanel(canEditKnowledge)}
        {renderKnowledgeSuggestionsPanel(canEditKnowledge)}
        <section className="panel" id="knowledge-manager">
          <div className="panelHeader">
            <div className="panelTitle">
              <Database size={18} />
              <h2>Knowledge manager</h2>
            </div>
            <span className="countPill">{knowledge.length}</span>
          </div>
          {!canEditKnowledge ? (
            <div className="inlineNotice">
              <ShieldCheck size={16} />
              <span>Your role can review knowledge but not change it.</span>
            </div>
          ) : null}

          <div className="knowledgeTools">
            <label className="field searchField">
              <span>Search</span>
              <div className="inputIcon">
                <Search size={16} />
                <input
                  value={knowledgeSearch}
                  onChange={(event) => setKnowledgeSearch(event.target.value)}
                  placeholder="Question, answer, tag"
                />
              </div>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={knowledgeStatusFilter}
                onChange={(event) =>
                  setKnowledgeStatusFilter(
                    event.target.value as KnowledgeStatusFilter,
                  )
                }
              >
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="draft">Draft</option>
              </select>
            </label>
          </div>

          <form className="knowledgeForm enhanced" onSubmit={addFaq}>
            <label className="field">
              <span>Question</span>
              <input
                value={question}
                disabled={!canEditKnowledge}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Answer</span>
              <textarea
                value={answer}
                disabled={!canEditKnowledge}
                onChange={(event) => setAnswer(event.target.value)}
                rows={4}
              />
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                value={tagInput}
                disabled={!canEditKnowledge}
                onChange={(event) => setTagInput(event.target.value)}
              />
            </label>
            {answerWarnings.length ? (
              <div className="warningRow">
                {answerWarnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}
            <button
              className="primaryButton"
              disabled={busy || !canEditKnowledge || !question || !answer}
            >
              <Plus size={16} />
              Add FAQ
            </button>
          </form>
        </section>

        <div className="knowledgeGrid">
          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <BookOpen size={18} />
                <h2>Entries</h2>
              </div>
              <span className="countPill">{filteredKnowledge.length}</span>
            </div>
            <div className="knowledgeList expanded">
              {filteredKnowledge.length ? (
                filteredKnowledge.map((item) => {
                  const isEditing = editingKnowledgeId === item.id;
                  return (
                    <article className="knowledgeItem" key={item.id}>
                      {isEditing ? (
                        <div className="editStack">
                          <label className="field">
                            <span>Question</span>
                            <input
                              value={editQuestion}
                              disabled={!canEditKnowledge}
                              onChange={(event) =>
                                setEditQuestion(event.target.value)
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Answer</span>
                            <textarea
                              value={editAnswer}
                              disabled={!canEditKnowledge}
                              onChange={(event) =>
                                setEditAnswer(event.target.value)
                              }
                              rows={4}
                            />
                          </label>
                          <div className="rowActions">
                            <button
                              className="secondaryButton"
                              type="button"
                              disabled={busy}
                              onClick={cancelKnowledgeEdit}
                            >
                              <X size={15} />
                              Cancel
                            </button>
                            <button
                              className="primaryButton"
                              type="button"
                              disabled={
                                busy ||
                                !canEditKnowledge ||
                                !editQuestion ||
                                !editAnswer
                              }
                              onClick={() => saveKnowledgeEdit(item)}
                            >
                              <Save size={15} />
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <strong>{getQuestion(item)}</strong>
                            <span>{item.status}</span>
                          </div>
                          <p>{getAnswer(item)}</p>
                          <div className="tagRow">
                            {item.tags.map((tag) => (
                              <small key={tag}>{tag}</small>
                            ))}
                          </div>
                          <div className="rowActions">
                            <button
                              className="secondaryButton"
                              type="button"
                              disabled={!canEditKnowledge}
                              onClick={() => startKnowledgeEdit(item)}
                            >
                              <Save size={15} />
                              Edit
                            </button>
                            <button
                              className="dangerButton"
                              type="button"
                              disabled={!canEditKnowledge}
                              onClick={() => setConfirmDeleteItem(item)}
                            >
                              <Trash2 size={15} />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className="emptyState">No matching knowledge entries.</div>
              )}
            </div>
            {knowledgeHasMore ? (
              <button
                className="secondaryButton full"
                type="button"
                disabled={busy}
                onClick={loadMoreKnowledge}
              >
                <RefreshCw size={16} />
                Load more entries
              </button>
            ) : null}
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Upload size={18} />
                <h2>Import</h2>
              </div>
              <span className="countPill">
                {websiteImport?.suggestedFaqs.length ?? importFaqs.length}
              </span>
            </div>
            <label className="field">
              <span>Website URL</span>
              <input
                value={siteUrl}
                disabled={!canEditKnowledge}
                onChange={(event) => setSiteUrl(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Pages to scan</span>
              <input
                type="number"
                min="1"
                max="8"
                value={crawlMaxPages}
                disabled={!canEditKnowledge}
                onChange={(event) =>
                  setCrawlMaxPages(Number(event.target.value))
                }
              />
            </label>
            <button
              className="primaryButton full"
              disabled={
                busy || !canEditKnowledge || !selectedTenant || !siteUrl
              }
              type="button"
              onClick={scanWebsiteForKnowledge}
            >
              <Globe2 size={16} />
              Scan website
            </button>
            {websiteImport ? (
              <div className="suggestionStack">
                <div className="sourceSummary">
                  <strong>{websiteImport.title}</strong>
                  <span>
                    {websiteImport.detectedLanguage.toUpperCase()} ·{" "}
                    {websiteImport.statusCode}
                  </span>
                </div>
                {websiteImport.pagesScanned?.length ? (
                  <div className="crawlList">
                    {websiteImport.pagesScanned.map((page) => (
                      <span key={page.url}>
                        {page.statusCode} · {page.title}
                      </span>
                    ))}
                  </div>
                ) : null}
                {websiteImport.suggestedFaqs.map((item) => (
                  <article className="suggestionItem" key={item.question}>
                    <strong>{item.question}</strong>
                    <p>{item.answer}</p>
                    <div className="tagRow">
                      {item.tags.map((tag) => (
                        <small key={tag}>{tag}</small>
                      ))}
                    </div>
                    <button
                      className="secondaryButton"
                      type="button"
                      disabled={busy || !canEditKnowledge}
                      onClick={() => importSuggestedFaqs([item])}
                    >
                      <Plus size={15} />
                      Add
                    </button>
                  </article>
                ))}
                <button
                  className="secondaryButton full"
                  type="button"
                  disabled={
                    busy ||
                    !canEditKnowledge ||
                    !websiteImport.suggestedFaqs.length
                  }
                  onClick={() => importSuggestedFaqs()}
                >
                  <Upload size={16} />
                  Import all website FAQs
                </button>
              </div>
            ) : null}
            <div className="divider" />
            <label className="field">
              <span>Paste FAQs</span>
              <textarea
                value={importText}
                disabled={!canEditKnowledge}
                onChange={(event) => setImportText(event.target.value)}
                rows={8}
              />
            </label>
            <button
              className="secondaryButton full"
              disabled={busy || !canEditKnowledge || !importFaqs.length}
              type="button"
              onClick={importFaqBlocks}
            >
              <Upload size={16} />
              Import pasted FAQs
            </button>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <AlertCircle size={18} />
                <h2>Knowledge autopilot</h2>
              </div>
              <span className="countPill">{unansweredQuestions.length}</span>
            </div>
            {unansweredTopicGroups.length ? (
              <div className="topicGroupList">
                {unansweredTopicGroups.slice(0, 4).map((group) => {
                  const firstItem = group.items[0];
                  if (!firstItem) {
                    return null;
                  }
                  return (
                    <article key={group.label}>
                      <div>
                        <strong>{group.label}</strong>
                        <span>{group.items.length}</span>
                      </div>
                      <p>{firstItem.question}</p>
                      <button
                        className="secondaryButton"
                        type="button"
                        disabled={!canEditKnowledge}
                        onClick={() => draftFaqFromUnanswered(firstItem)}
                      >
                        <Plus size={15} />
                        Draft answer
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="emptyState compact">
                No repeated knowledge gaps detected.
              </div>
            )}
            <div className="divider" />
            <div className="suggestionStack">
              {unansweredQuestions.length ? (
                unansweredQuestions.slice(0, 8).map((item) => (
                  <article className="suggestionItem" key={item.id}>
                    <strong>{item.question}</strong>
                    <p>
                      {titleCase(item.reason)} · {item.channel} ·{" "}
                      {formatDate(item.createdAt)}
                    </p>
                    <div className="rowActions">
                      <button
                        className="secondaryButton"
                        type="button"
                        disabled={!canEditKnowledge}
                        onClick={() => draftFaqFromUnanswered(item)}
                      >
                        <Plus size={15} />
                        Draft FAQ
                      </button>
                      {item.conversationId ? (
                        <button
                          className="secondaryButton"
                          type="button"
                          onClick={() => {
                            setSelectedConversationId(
                              item.conversationId ?? "",
                            );
                            setActiveTab("leads");
                          }}
                        >
                          <Inbox size={15} />
                          Open chat
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="emptyState compact">
                  No unanswered customer questions.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderLeadActionCenter() {
    const queues = [
      {
        title: "Due today",
        detail: "Scheduled follow-ups",
        items: dueLeads,
        empty: "No due follow-ups.",
        tone: "alert",
      },
      {
        title: "Hot leads",
        detail: "High intent",
        items: hotLeads,
        empty: "No hot leads right now.",
        tone: "hot",
      },
      {
        title: "Waiting",
        detail: "Contacted or proposal",
        items: waitingLeads,
        empty: "Nothing waiting.",
        tone: "waiting",
      },
      {
        title: "New this week",
        detail: "Fresh opportunities",
        items: newLeadsThisWeek,
        empty: "No new leads this week.",
        tone: "fresh",
      },
    ];

    return (
      <section className="panel leadActionPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <Sparkles size={18} />
            <h2>Lead action center</h2>
          </div>
          <span className="countPill">
            {dueLeads.length + hotLeads.length + waitingLeads.length}
          </span>
        </div>
        <div className="leadActionGrid">
          {queues.map((queue) => (
            <article
              className="leadActionColumn"
              data-tone={queue.tone}
              key={queue.title}
            >
              <div>
                <strong>{queue.title}</strong>
                <span>{queue.detail}</span>
              </div>
              {queue.items.length ? (
                queue.items.slice(0, 4).map((handoff) => (
                  <button
                    className="leadActionItem"
                    key={`${queue.title}-${handoff.id}`}
                    type="button"
                    onClick={() => openLeadDetail(handoff)}
                  >
                    <span>
                      <strong>{getLeadDisplayName(handoff)}</strong>
                      <small>{formatDate(handoff.createdAt)}</small>
                    </span>
                    <em>{getLeadScore(handoff)}/100</em>
                    <small>{getLeadNextStep(handoff)}</small>
                  </button>
                ))
              ) : (
                <div className="emptyState compact">{queue.empty}</div>
              )}
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderLeads() {
    const canEditLeads = canManageLeads();
    const pipelineStageGroups = pipelineStages.map((stage, index) => ({
      ...stage,
      index,
      next: pipelineStages[index + 1],
      items: leadHandoffs.filter(
        (handoff) => getPipelineStage(handoff) === stage.key,
      ),
    }));

    return (
      <div className="workspaceStack">
        <section className="metricsGrid compactMetrics">
          <article className="metricCard">
            <UserCheck size={18} />
            <span>Total leads</span>
            <strong>{leadHandoffs.length}</strong>
          </article>
          <article
            className="metricCard"
            data-alert={openLeads.length ? "true" : "false"}
          >
            <Inbox size={18} />
            <span>Open follow-ups</span>
            <strong>{openLeads.length}</strong>
          </article>
          <article className="metricCard">
            <CheckCircle2 size={18} />
            <span>Resolved</span>
            <strong>
              {
                leadHandoffs.filter((handoff) => handoff.status === "resolved")
                  .length
              }
            </strong>
          </article>
          <article className="metricCard">
            <Sparkles size={18} />
            <span>Readiness</span>
            <strong>{readinessLeads.length}</strong>
          </article>
          <article
            className="metricCard"
            data-alert={staleLeads.length ? "true" : "false"}
          >
            <AlertCircle size={18} />
            <span>Stale</span>
            <strong>{staleLeads.length}</strong>
          </article>
          <article className="metricCard">
            <BarChart3 size={18} />
            <span>High intent</span>
            <strong>{highIntentLeads.length}</strong>
          </article>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <BarChart3 size={18} />
              <h2>Pipeline board</h2>
            </div>
            <span className="countPill">{wonLeadCount} won</span>
          </div>
          <div className="pipelineBoard">
            {pipelineStageGroups.map((stage) => (
              <article className="pipelineColumn" key={stage.key}>
                <header>
                  <span>{stage.label}</span>
                  <strong>{stage.items.length}</strong>
                </header>
                <div className="pipelineColumnList">
                  {stage.items.length ? (
                    stage.items.slice(0, 4).map((handoff) => {
                      const leadScore = getLeadScore(handoff);
                      return (
                        <div className="pipelineLeadCard" key={handoff.id}>
                          <button
                            type="button"
                            onClick={() => openLeadDetail(handoff)}
                          >
                            <strong>{getLeadDisplayName(handoff)}</strong>
                            <span>{getLeadNextStep(handoff)}</span>
                            <small>{formatDate(handoff.createdAt)}</small>
                          </button>
                          <div>
                            <em>{leadScore}/100</em>
                            {stage.next ? (
                              <button
                                className="textToggle"
                                type="button"
                                disabled={!canEditLeads}
                                onClick={() =>
                                  updateHandoff(
                                    handoff,
                                    handoff.status,
                                    handoff.assignedTo,
                                    stage.next?.key,
                                  )
                                }
                              >
                                Move to {stage.next.label}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="emptyState compact">
                      No {stage.label.toLowerCase()} leads.
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <UserCheck size={18} />
              <h2>Lead capture inbox</h2>
            </div>
            <span className="countPill">{leadHandoffs.length}</span>
          </div>
          <div className="leadGrid">
            {leadHandoffs.length ? (
              leadHandoffs.map((handoff) => {
                const details = parseLeadDetails(handoff.requesterMessage);
                const leadScore = getLeadScore(handoff);
                return (
                  <article className="leadCard" key={handoff.id}>
                    <div className="leadHeader">
                      <div>
                        <strong>{getLeadDisplayName(handoff)}</strong>
                        <span>{formatDate(handoff.createdAt)}</span>
                      </div>
                      <small data-status={handoff.status}>
                        {getPipelineStage(handoff)}
                      </small>
                    </div>
                    <dl>
                      {details.map((item) => (
                        <div key={`${handoff.id}-${item.label}`}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="leadScore">
                      <div>
                        <span>Lead score</span>
                        <strong>{leadScore}/100</strong>
                      </div>
                      <small>{getLeadNextStep(handoff)}</small>
                    </div>
                    {handoff.metadata?.automationReason ? (
                      <div className="automationBadge">
                        <Sparkles size={14} />
                        Auto-qualified:{" "}
                        {String(handoff.metadata.automationReason)}
                      </div>
                    ) : null}
                    <label className="field">
                      <span>Pipeline stage</span>
                      <select
                        value={getPipelineStage(handoff)}
                        disabled={!canEditLeads}
                        onChange={(event) =>
                          updateHandoff(
                            handoff,
                            handoff.status,
                            handoff.assignedTo,
                            event.target.value as LeadPipelineStage,
                          )
                        }
                      >
                        {pipelineStages.map((stage) => (
                          <option key={stage.key} value={stage.key}>
                            {stage.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rowActions">
                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={() => openLeadDetail(handoff)}
                      >
                        Details
                      </button>
                      <button
                        className="secondaryButton"
                        type="button"
                        disabled={
                          !canEditLeads || handoff.status === "in_progress"
                        }
                        onClick={() =>
                          updateHandoff(handoff, "in_progress", "Assad Dar")
                        }
                      >
                        In progress
                      </button>
                      <button
                        className="primaryButton"
                        type="button"
                        disabled={
                          !canEditLeads || handoff.status === "resolved"
                        }
                        onClick={() =>
                          updateHandoff(handoff, "resolved", "Assad Dar")
                        }
                      >
                        Resolve
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="emptyState">
                No leads yet. Enable lead capture in the widget settings and
                publish the widget on the website.
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderContacts() {
    return (
      <section className="panel">
        <div className="panelHeader">
          <div className="panelTitle">
            <UserCheck size={18} />
            <h2>Customer profiles</h2>
          </div>
          <span className="countPill">{contacts.length}</span>
        </div>
        <label className="field searchField listSearch">
          <span>Search contacts</span>
          <div className="inputIcon">
            <Search size={16} />
            <input
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Name, email, phone, company"
            />
          </div>
        </label>
        <div className="contactGrid">
          {contacts.length ? (
            contacts.map((contact) => {
              const memory = buildContactMemorySummary(
                contact,
                conversations,
                handoffs,
              );

              return (
                <article className="contactCard" key={contact.id}>
                  <div>
                    <strong>{memory.label}</strong>
                    <span>{memory.subtitle}</span>
                  </div>
                  <small>{memory.confidenceLabel}</small>
                  <div className="contactMemoryStats">
                    <article>
                      <span>Conversations</span>
                      <strong>{memory.conversationCount}</strong>
                    </article>
                    <article
                      data-alert={memory.openHandoffCount ? "true" : "false"}
                    >
                      <span>Handoffs</span>
                      <strong>{memory.openHandoffCount}</strong>
                    </article>
                    <article>
                      <span>Last seen</span>
                      <strong>
                        {memory.lastSeenAt
                          ? formatDate(memory.lastSeenAt)
                          : "No activity"}
                      </strong>
                    </article>
                  </div>
                  <div className="tagRow">
                    {[...memory.channels, ...memory.identifierLabels]
                      .slice(0, 4)
                      .map((key) => (
                        <small key={key}>{key}</small>
                      ))}
                  </div>
                  <div className="memoryAction">
                    <Sparkles size={14} />
                    <span>{memory.nextAction}</span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="emptyState compact">
              Contacts appear after website leads, WhatsApp messages, or calls.
            </div>
          )}
        </div>
        {contactsHasMore ? (
          <button
            className="secondaryButton full"
            type="button"
            disabled={busy}
            onClick={loadMoreContacts}
          >
            <RefreshCw size={16} />
            Load more contacts
          </button>
        ) : null}
      </section>
    );
  }

  function renderLeadDetailDrawer() {
    if (!selectedLead) {
      return null;
    }

    const canEditLeads = canManageLeads();
    const details = parseLeadDetails(selectedLead.requesterMessage);
    const email = getLeadContactEmail(selectedLead);
    const phone = getLeadContactPhone(selectedLead);
    const notes = selectedLead.metadata?.notes ?? [];
    const followUpDate = leadFollowUpDate || getLeadFollowUpDate(selectedLead);
    const replyBody = leadReplyDraft;
    const replySubject = `Re: Anfrage ${getLeadDisplayName(selectedLead)}`;
    const copilot = buildHandoffCopilotSummary(selectedLead);

    return (
      <div className="drawerBackdrop" role="presentation">
        <aside
          className="leadDrawer"
          role="dialog"
          aria-modal="true"
          aria-label="Lead details"
          tabIndex={-1}
          ref={leadDrawerRef}
        >
          <div className="drawerHeader">
            <div>
              <span>Lead detail</span>
              <strong>{getLeadDisplayName(selectedLead)}</strong>
            </div>
            <button
              className="iconButton neutral"
              type="button"
              aria-label="Close lead details"
              onClick={closeLeadDrawer}
            >
              <X size={18} />
            </button>
          </div>

          <div className="drawerBody">
            <div className="leadScore large">
              <div>
                <span>Lead score</span>
                <strong>{getLeadScore(selectedLead)}/100</strong>
              </div>
              <small>{getLeadNextStep(selectedLead)}</small>
            </div>

            <div className="handoffCopilotPanel compact">
              <div>
                <span>Copilot action</span>
                <strong>{copilot.suggestedAction}</strong>
              </div>
              <div>
                <span>Priority</span>
                <strong>{copilot.priority}</strong>
              </div>
              <div>
                <span>Owner</span>
                <strong>{copilot.owner}</strong>
              </div>
              {copilot.missingFields.length ? (
                <small>
                  Missing {copilot.missingFields.map(fieldLabel).join(", ")}
                </small>
              ) : null}
            </div>

            <div className="leadContactStrip">
              <article>
                <span>Email</span>
                <strong>{email || "Missing"}</strong>
              </article>
              <article>
                <span>Phone</span>
                <strong>{phone || "Missing"}</strong>
              </article>
              <article
                data-alert={
                  followUpDate &&
                  followUpDate <= new Date().toISOString().slice(0, 10)
                    ? "true"
                    : "false"
                }
              >
                <span>Follow-up</span>
                <strong>{followUpDate || "Not scheduled"}</strong>
              </article>
            </div>

            <div className="formGrid two">
              <label className="field">
                <span>Pipeline stage</span>
                <select
                  value={getPipelineStage(selectedLead)}
                  disabled={!canEditLeads}
                  onChange={(event) =>
                    updateHandoff(
                      selectedLead,
                      selectedLead.status,
                      selectedLead.assignedTo,
                      event.target.value as LeadPipelineStage,
                    )
                  }
                >
                  {pipelineStages.map((stage) => (
                    <option key={stage.key} value={stage.key}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Follow-up date</span>
                <input
                  type="date"
                  value={leadFollowUpDate}
                  disabled={!canEditLeads}
                  onChange={(event) => setLeadFollowUpDate(event.target.value)}
                />
              </label>
            </div>

            <div className="rowActions">
              <button
                className="secondaryButton"
                type="button"
                disabled={!canEditLeads}
                onClick={() =>
                  updateHandoff(
                    selectedLead,
                    "in_progress",
                    "Assad Dar",
                    "contacted",
                  )
                }
              >
                Contacted
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={!canEditLeads}
                onClick={() =>
                  updateHandoff(
                    selectedLead,
                    selectedLead.status,
                    selectedLead.assignedTo,
                    "qualified",
                  )
                }
              >
                Qualified
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={!canEditLeads}
                onClick={() =>
                  updateHandoff(
                    selectedLead,
                    selectedLead.status,
                    selectedLead.assignedTo,
                    "proposal",
                  )
                }
              >
                Proposal
              </button>
              <button
                className="primaryButton"
                type="button"
                disabled={!canEditLeads}
                onClick={() =>
                  updateHandoff(selectedLead, "resolved", "Assad Dar", "won")
                }
              >
                Won
              </button>
              <button
                className="dangerButton"
                type="button"
                disabled={!canEditLeads}
                onClick={() =>
                  updateHandoff(selectedLead, "resolved", "Assad Dar", "lost")
                }
              >
                Lost
              </button>
            </div>

            <dl className="detailList">
              {details.map((item) => (
                <div key={`${selectedLead.id}-${item.label}`}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>

            <div className="rowActions">
              {email ? (
                <a
                  className="secondaryButton linkButton"
                  href={buildMailtoHref(email, replySubject, replyBody)}
                >
                  <Send size={15} />
                  Email lead
                </a>
              ) : null}
              {bookingUrl ? (
                <a
                  className="secondaryButton linkButton"
                  href={bookingUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={15} />
                  Booking link
                </a>
              ) : null}
              <button
                className="secondaryButton"
                type="button"
                onClick={() =>
                  copyText(buildLeadSummary(selectedLead), "Lead summary")
                }
              >
                <Copy size={15} />
                Copy summary
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={!canEditLeads || !leadFollowUpDate}
                onClick={saveSelectedLeadFollowUp}
              >
                Save follow-up
              </button>
            </div>

            <section className="replyAssistant">
              <div className="panelHeader compact">
                <div className="panelTitle">
                  <Send size={18} />
                  <h2>Reply assistant</h2>
                </div>
                <div className="segmented">
                  {(["friendly", "formal", "short"] as const).map((tone) => (
                    <button
                      data-active={leadReplyTone === tone ? "true" : "false"}
                      key={tone}
                      type="button"
                      onClick={() => prepareLeadReplyDraft(tone)}
                    >
                      {titleCase(tone)}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="replyDraft"
                value={leadReplyDraft}
                onChange={(event) => setLeadReplyDraft(event.target.value)}
                rows={8}
              />
              <div className="rowActions">
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => prepareLeadReplyDraft()}
                >
                  <Sparkles size={15} />
                  Generate
                </button>
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => copyText(replyBody, "Reply draft")}
                >
                  <Copy size={15} />
                  Copy
                </button>
                {email ? (
                  <a
                    className="primaryButton linkButton"
                    href={buildMailtoHref(email, replySubject, replyBody)}
                  >
                    <Send size={15} />
                    Open email
                  </a>
                ) : null}
                <button
                  className="secondaryButton"
                  type="button"
                  disabled={!followUpDate}
                  onClick={() =>
                    downloadFollowUpCalendar(selectedLead, followUpDate)
                  }
                >
                  <ExternalLink size={15} />
                  Download .ics
                </button>
              </div>
            </section>

            <label className="field">
              <span>Note</span>
              <textarea
                value={leadNote}
                disabled={!canEditLeads}
                onChange={(event) => setLeadNote(event.target.value)}
                rows={3}
              />
            </label>
            <button
              className="primaryButton full"
              type="button"
              disabled={busy || !canEditLeads || !leadNote.trim()}
              onClick={saveSelectedLeadNote}
            >
              <Save size={16} />
              Save note
            </button>

            <div className="timelineList">
              <article>
                <span>Created</span>
                <strong>Lead captured</strong>
                <small>{formatDate(selectedLead.createdAt)}</small>
              </article>
              {followUpDate ? (
                <article
                  data-alert={
                    followUpDate <= new Date().toISOString().slice(0, 10)
                      ? "true"
                      : "false"
                  }
                >
                  <span>Follow-up</span>
                  <strong>{followUpDate}</strong>
                  <small>{getLeadNextStep(selectedLead)}</small>
                </article>
              ) : null}
              {notes.length ? (
                notes.map((note, index) => (
                  <article key={`${selectedLead.id}-note-${index}`}>
                    <span>Note</span>
                    <strong>{note.body}</strong>
                    <small>
                      {note.createdAt ? formatDate(note.createdAt) : "Saved"}
                    </small>
                  </article>
                ))
              ) : (
                <div className="emptyState compact">No notes yet.</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    );
  }

  function renderInbox() {
    const selectedMemory = selectedInboxItem?.contact
      ? buildContactMemorySummary(
          selectedInboxItem.contact,
          conversations,
          handoffs,
        )
      : null;

    return (
      <section className="panel inboxPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <Inbox size={18} />
            <h2>Conversation inbox</h2>
          </div>
          <div className="segmented">
            {(["all", "needs_human", "recent"] as InboxFilter[]).map(
              (filter) => (
                <button
                  data-active={inboxFilter === filter ? "true" : "false"}
                  key={filter}
                  type="button"
                  onClick={() => setInboxFilter(filter)}
                >
                  {titleCase(filter)}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="inboxGrid">
          <div>
            <label className="field searchField listSearch">
              <span>Search conversations</span>
              <div className="inputIcon">
                <Search size={16} />
                <input
                  value={inboxSearch}
                  onChange={(event) => setInboxSearch(event.target.value)}
                  placeholder="Name, channel, message, phone"
                />
              </div>
            </label>
            <div className="conversationList framed">
              {filteredInboxItems.length ? (
                filteredInboxItems.map((conversation) => (
                  <button
                    className={
                      conversation.id === selectedConversationId
                        ? "conversationButton active"
                        : "conversationButton"
                    }
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                  >
                    <strong>
                      {getContactDisplayName(
                        conversation.contact,
                        titleCase(conversation.channel),
                      )}
                    </strong>
                    <span>
                      {titleCase(conversation.channel)} ·{" "}
                      {getContactSubtitle(conversation.contact) ||
                        conversation.externalUserId ||
                        conversation.publicId}
                    </span>
                    <small>
                      {conversation.lastMessage?.content
                        ? conversation.lastMessage.content.slice(0, 90)
                        : formatDate(conversation.createdAt)}
                    </small>
                    {conversation.openHandoffs.length ? (
                      <em>{conversation.openHandoffs.length} handoff</em>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="emptyState compact">No conversations.</div>
              )}
            </div>
            {inboxHasMore ? (
              <button
                className="secondaryButton full"
                type="button"
                disabled={busy}
                onClick={loadMoreInbox}
              >
                <RefreshCw size={16} />
                Load more conversations
              </button>
            ) : null}
          </div>

          <div className="transcriptPane">
            {selectedConversation || selectedInboxItem ? (
              <>
                <div className="transcriptHeader">
                  <div>
                    <strong>
                      {getContactDisplayName(
                        selectedInboxItem?.contact,
                        selectedConversation?.publicId ?? "Conversation",
                      )}
                    </strong>
                    <span>
                      {titleCase(
                        selectedInboxItem?.channel ??
                          selectedConversation?.channel ??
                          "conversation",
                      )}{" "}
                      · {selectedInboxItem?.nextAction ?? "Monitor"}
                    </span>
                  </div>
                  <span>
                    {formatDate(
                      selectedInboxItem?.updatedAt ??
                        selectedConversation?.updatedAt ??
                        selectedConversation?.createdAt,
                    )}
                  </span>
                </div>
                {selectedInboxItem?.contact ? (
                  <div className="contactContextStrip">
                    <article>
                      <span>Email</span>
                      <strong>
                        {selectedInboxItem.contact.email ?? "Missing"}
                      </strong>
                    </article>
                    <article>
                      <span>Phone</span>
                      <strong>
                        {selectedInboxItem.contact.phone ?? "Missing"}
                      </strong>
                    </article>
                    <article>
                      <span>Company</span>
                      <strong>
                        {selectedInboxItem.contact.company ?? "Missing"}
                      </strong>
                    </article>
                  </div>
                ) : null}
                {selectedMemory ? (
                  <div className="contactMemoryPanel">
                    <div>
                      <span>Memory</span>
                      <strong>{selectedMemory.nextAction}</strong>
                    </div>
                    <div className="contactMemoryStats compact">
                      <article>
                        <span>Threads</span>
                        <strong>{selectedMemory.conversationCount}</strong>
                      </article>
                      <article
                        data-alert={
                          selectedMemory.openHandoffCount ? "true" : "false"
                        }
                      >
                        <span>Handoffs</span>
                        <strong>{selectedMemory.openHandoffCount}</strong>
                      </article>
                      <article>
                        <span>Known</span>
                        <strong>
                          {selectedMemory.missingFields.length
                            ? `${3 - selectedMemory.missingFields.length}/3`
                            : "3/3"}
                        </strong>
                      </article>
                    </div>
                    <div className="tagRow">
                      {[
                        ...selectedMemory.channels,
                        ...selectedMemory.identifierLabels,
                      ]
                        .slice(0, 5)
                        .map((tag) => (
                          <small key={tag}>{tag}</small>
                        ))}
                    </div>
                  </div>
                ) : null}
                {isTelephoneConversation(
                  selectedInboxItem,
                  selectedConversation,
                ) ? (
                  <div className="callDetailStrip">
                    <article>
                      <span>Caller</span>
                      <strong>
                        {selectedInboxItem?.externalUserId ??
                          selectedInboxItem?.contact?.phone ??
                          selectedConversation?.publicId ??
                          "Unknown"}
                      </strong>
                    </article>
                    <article>
                      <span>Messages</span>
                      <strong>
                        {selectedInboxItem?.messageCount ??
                          conversationMessages.length}
                      </strong>
                    </article>
                    <article>
                      <span>Confidence</span>
                      <strong>
                        {latestAnswerConfidence(conversationMessages)}
                      </strong>
                    </article>
                    <article>
                      <span>Handoff</span>
                      <strong>
                        {latestHandoffState(conversationMessages)}
                      </strong>
                    </article>
                    <article>
                      <span>Recording</span>
                      <strong>
                        {phoneRecordingEnabled ? "Enabled" : "Disabled"}
                      </strong>
                    </article>
                    <article>
                      <span>Retention</span>
                      <strong>{phoneTranscriptRetentionDays} days</strong>
                    </article>
                  </div>
                ) : null}
                <div className="messagePreview full">
                  {conversationMessages.length ? (
                    conversationMessages.map((message) => (
                      <p data-role={message.role} key={message.id}>
                        <span>{message.role}</span>
                        {message.content}
                      </p>
                    ))
                  ) : (
                    <div className="emptyState compact">
                      No messages loaded.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="emptyState">Select a conversation.</div>
            )}
          </div>
        </div>
      </section>
    );
  }

  function renderHandoffs() {
    const canEditLeads = canManageLeads();
    const copilotItems = filteredHandoffs.slice(0, 3).map((handoff) => ({
      handoff,
      summary: buildHandoffCopilotSummary(handoff),
    }));

    return (
      <section className="panel">
        <div className="panelHeader">
          <div className="panelTitle">
            <AlertCircle size={18} />
            <h2>Handoff workflow</h2>
          </div>
          <div className="segmented">
            {(
              ["open", "in_progress", "resolved", "all"] as HandoffFilter[]
            ).map((filter) => (
              <button
                data-active={handoffFilter === filter ? "true" : "false"}
                key={filter}
                type="button"
                onClick={() => setHandoffFilter(filter)}
              >
                {titleCase(filter)}
              </button>
            ))}
          </div>
        </div>

        {copilotItems.length ? (
          <div className="handoffCopilotGrid">
            {copilotItems.map(({ handoff, summary }) => (
              <article key={`copilot-${handoff.id}`}>
                <div>
                  <span>{summary.priority}</span>
                  <strong>{summary.suggestedAction}</strong>
                </div>
                <p>{getLeadDisplayName(handoff)}</p>
                <small>
                  {summary.nextStep} · {summary.owner}
                </small>
              </article>
            ))}
          </div>
        ) : null}

        <div className="handoffBoard">
          {filteredHandoffs.length ? (
            filteredHandoffs.map((handoff) => {
              const summary = buildHandoffCopilotSummary(handoff);

              return (
                <article className="handoffItem large" key={handoff.id}>
                  <div>
                    <strong>{handoff.reason}</strong>
                    <span data-status={handoff.status}>{handoff.status}</span>
                  </div>
                  <p>{handoff.requesterMessage}</p>
                  <div className="handoffMeta">
                    <small>{handoff.channel}</small>
                    <small>{formatDate(handoff.createdAt)}</small>
                    <small>Priority: {summary.priority}</small>
                    <small>Owner: {summary.owner}</small>
                  </div>
                  <div className="handoffNextAction">
                    <Sparkles size={15} />
                    <div>
                      <strong>{summary.suggestedAction}</strong>
                      <span>{summary.nextStep}</span>
                    </div>
                  </div>
                  {summary.missingFields.length ? (
                    <div className="warningRow block">
                      <span>
                        Missing{" "}
                        {summary.missingFields.map(fieldLabel).join(", ")}
                      </span>
                    </div>
                  ) : null}
                  <div className="rowActions">
                    <button
                      className="secondaryButton"
                      type="button"
                      disabled={
                        !canEditLeads || handoff.assignedTo === "Assad Dar"
                      }
                      onClick={() =>
                        updateHandoff(handoff, "open", "Assad Dar")
                      }
                    >
                      <UserCheck size={15} />
                      Assign
                    </button>
                    <button
                      className="secondaryButton"
                      type="button"
                      disabled={
                        !canEditLeads || handoff.status === "in_progress"
                      }
                      onClick={() =>
                        updateHandoff(
                          handoff,
                          "in_progress",
                          handoff.assignedTo ?? "Assad Dar",
                        )
                      }
                    >
                      In progress
                    </button>
                    <button
                      className="primaryButton"
                      type="button"
                      disabled={!canEditLeads || handoff.status === "resolved"}
                      onClick={() =>
                        updateHandoff(
                          handoff,
                          "resolved",
                          handoff.assignedTo ?? "Assad Dar",
                        )
                      }
                    >
                      Resolve
                    </button>
                    <button
                      className="dangerButton"
                      type="button"
                      disabled={!canEditLeads || handoff.status === "dismissed"}
                      onClick={() => updateHandoff(handoff, "dismissed")}
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="emptyState">No handoff requests in this view.</div>
          )}
        </div>
        {handoffsHasMore ? (
          <button
            className="secondaryButton full"
            type="button"
            disabled={busy}
            onClick={loadMoreHandoffs}
          >
            <RefreshCw size={16} />
            Load more handoffs
          </button>
        ) : null}
      </section>
    );
  }

  function renderTestStudio() {
    const canRunTests = canManageLeads();
    const scenarioGap = unansweredQuestions[0]?.question;
    const testScenarios = [
      {
        label: "Known answer",
        goal: "Assistant should answer from approved knowledge.",
        prompt: sampleQuestions[0] ?? "What services do you offer?",
        target: "answered",
      },
      {
        label: "Lead intent",
        goal: "Assistant should capture or recommend handoff.",
        prompt:
          "I want help automating our customer support process. Can we book a consultation?",
        target: "handoff",
      },
      {
        label: "Knowledge gap",
        goal: "Assistant should refuse or hand off if knowledge is missing.",
        prompt:
          scenarioGap ??
          "Do you provide fixed pricing for a full AI transformation program?",
        target: "refused",
      },
    ];
    const activeScenario = testScenarios.find(
      (scenario) => scenario.prompt === testMessage,
    );
    const scenarioPassed =
      activeScenario && testAnswer
        ? activeScenario.target === "handoff"
          ? testAnswer.handoffRecommended || testAnswer.status === "handoff"
          : testAnswer.status === activeScenario.target
        : false;
    const answerTrust = buildAnswerTrustSummary({
      answer: testAnswer,
      matchedKnowledge,
      missingKnowledgeCount: missingKnowledgeChecks.length,
      unansweredCount: unansweredQuestions.length,
      scenarioPassed: testAnswer && activeScenario ? scenarioPassed : undefined,
    });

    return (
      <div className="testStudioGrid">
        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Sparkles size={18} />
              <h2>Testing studio</h2>
            </div>
            <span
              className="countPill"
              data-tone={scenarioPassed ? "good" : undefined}
            >
              {testAnswer ? (scenarioPassed ? "Passed" : "Review") : "Play"}
            </span>
          </div>
          <div className="playModeGrid">
            {testScenarios.map((scenario) => (
              <button
                data-active={scenario.prompt === testMessage ? "true" : "false"}
                key={scenario.label}
                type="button"
                onClick={() => {
                  setTestMessage(scenario.prompt);
                  setTestAnswer(null);
                }}
              >
                <span>{scenario.label}</span>
                <strong>{scenario.target}</strong>
                <small>{scenario.goal}</small>
              </button>
            ))}
          </div>
          <div className="sampleGrid">
            {sampleQuestions.map((sample) => (
              <button
                className="secondaryButton"
                key={sample}
                type="button"
                onClick={() => {
                  setTestMessage(sample);
                  setTestAnswer(null);
                }}
              >
                {sample}
              </button>
            ))}
          </div>
          <form className="testRow large" onSubmit={testAssistant}>
            <input
              value={testMessage}
              disabled={!canRunTests}
              onChange={(event) => setTestMessage(event.target.value)}
              placeholder="Ask from approved knowledge"
            />
            <button
              className="iconButton"
              disabled={busy || !canRunTests || !testMessage}
              aria-label="Send test"
            >
              <Send size={18} />
            </button>
          </form>
          {testAnswer ? (
            <div
              className="answerBox"
              data-result={scenarioPassed ? "pass" : "review"}
            >
              <span>{testAnswer.status}</span>
              <p>{testAnswer.text}</p>
              <small>
                {testAnswer.intent} · {Math.round(testAnswer.confidence * 100)}%
                confidence
              </small>
              {activeScenario ? (
                <div className="scenarioOutcome">
                  <strong>
                    {scenarioPassed
                      ? "Scenario passed"
                      : "Scenario needs review"}
                  </strong>
                  <span>{activeScenario.goal}</span>
                </div>
              ) : null}
              <div className="rowActions">
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => setStatus("Answer marked good")}
                >
                  Good answer
                </button>
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => setActiveTab("knowledge")}
                >
                  Needs fix
                </button>
              </div>
            </div>
          ) : (
            <div className="emptyState compact">Test answers appear here.</div>
          )}
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Filter size={18} />
              <h2>Grounding</h2>
            </div>
          </div>
          {matchedKnowledge ? (
            <article className="knowledgeItem">
              <div>
                <strong>{getQuestion(matchedKnowledge)}</strong>
                <span>{matchedKnowledge.status}</span>
              </div>
              <p>{getAnswer(matchedKnowledge)}</p>
            </article>
          ) : (
            <div className="emptyState compact">No likely match yet.</div>
          )}
          {testAnswer?.handoffRecommended ||
          (testAnswer?.confidence ?? 1) < 0.5 ? (
            <div className="warningRow block">
              <span>
                Add or improve the matching FAQ before publishing this answer.
              </span>
            </div>
          ) : null}
          <div className="trustSignalPanel" data-tone={answerTrust.tone}>
            <div className="trustSignalHeader">
              <div>
                <span>Answer trust</span>
                <strong>{answerTrust.label}</strong>
              </div>
              <small>{answerTrust.recommendation}</small>
            </div>
            <div className="trustSignalList">
              {answerTrust.signals.map((signal) => (
                <article data-status={signal.status} key={signal.label}>
                  <span>{signal.label}</span>
                  <strong>{signal.detail}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderWidget() {
    const canEditSettings = canManageTenantSettings();
    const canEditChannels = canManageChannels();
    return (
      <div className="workspaceStack">
        <div className="widgetGrid">
          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Code2 size={18} />
                <h2>Install widget</h2>
              </div>
              <a
                className="externalLink"
                href={siteUrl || defaultSiteUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={15} />
                Open site
              </a>
            </div>
            <div className="platformTabs">
              {(
                ["html", "wordpress", "webflow", "shopify"] as WidgetPlatform[]
              ).map((platform) => (
                <button
                  data-active={widgetPlatform === platform ? "true" : "false"}
                  key={platform}
                  type="button"
                  onClick={() => setWidgetPlatform(platform)}
                >
                  {titleCase(platform)}
                </button>
              ))}
            </div>
            <pre className="snippet">
              {currentSnippet || "No tenant selected"}
            </pre>
            <div className="rowActions">
              <button
                className="primaryButton"
                disabled={!currentSnippet}
                type="button"
                data-copied={
                  copiedSnippet === `${titleCase(widgetPlatform)} snippet`
                    ? "true"
                    : "false"
                }
                onClick={() =>
                  copyText(
                    currentSnippet,
                    `${titleCase(widgetPlatform)} snippet`,
                  )
                }
              >
                {copiedSnippet === `${titleCase(widgetPlatform)} snippet` ? (
                  <>
                    <CheckCircle2 size={16} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    Copy snippet
                  </>
                )}
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={
                  busy || !canEditChannels || !selectedTenant || !siteUrl
                }
                onClick={verifyWidgetInstall}
              >
                <ShieldCheck size={16} />
                Verify install
              </button>
            </div>
            {installCheck ? (
              <div
                className="installResult"
                data-installed={installCheck.installed ? "true" : "false"}
              >
                {installCheck.installed ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                <div>
                  <strong>
                    {installCheck.installed
                      ? "Widget detected"
                      : "Widget missing"}
                  </strong>
                  <span>{installCheck.checkedUrl}</span>
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Sparkles size={18} />
                <h2>Live preview</h2>
              </div>
              <span className="countPill">{widgetLanguage.toUpperCase()}</span>
            </div>
            <div
              className="widgetPreview"
              style={{
                backgroundColor: widgetBackgroundColor,
                color: widgetTextColor,
              }}
            >
              <div
                className="previewHeader"
                style={{ backgroundColor: widgetPrimaryColor }}
              >
                <strong>{assistantName}</strong>
                <span>{selectedTenant?.name ?? "Assaddar AI"}</span>
              </div>
              <div className="previewMessages">
                <p>{widgetOpeningMessage}</p>
                {ctaLabel ? (
                  <a style={{ color: widgetPrimaryColor }}>{ctaLabel}</a>
                ) : null}
                <div className="previewQuickReplies">
                  {quickReplies
                    .split("\n")
                    .map((reply) => reply.trim())
                    .filter(Boolean)
                    .slice(0, 4)
                    .map((reply) => (
                      <span key={reply}>{reply}</span>
                    ))}
                </div>
              </div>
              {consentEnabled ? (
                <div className="previewNotice">
                  <strong>Consent</strong>
                  <span>{consentText}</span>
                </div>
              ) : null}
              {readinessEnabled ? (
                <div className="previewNotice">
                  <strong>AI readiness</strong>
                  <span>{readinessIntro}</span>
                </div>
              ) : null}
              {leadCaptureEnabled ? (
                <div className="previewLead">
                  <strong>{leadCaptureIntro}</strong>
                  <div className="previewFields">
                    {leadCaptureFields.slice(0, 5).map((field) => (
                      <span key={field}>{fieldLabel(field)}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              <button
                className="previewLauncher"
                style={{ backgroundColor: widgetPrimaryColor }}
                type="button"
              >
                {widgetLauncherLabel}
              </button>
            </div>
          </section>
        </div>

        <section className="panel portalPreviewPanel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Globe2 size={18} />
              <h2>Customer portal preview</h2>
            </div>
            <span
              className="countPill"
              data-tone={
                customerPortalPreview.score >= 80
                  ? "good"
                  : customerPortalPreview.score >= 50
                    ? "warn"
                    : undefined
              }
            >
              {customerPortalPreview.status}
            </span>
          </div>
          <div className="portalPreviewHero">
            <div>
              <span>Preview link</span>
              <strong>{customerPortalPreview.url}</strong>
            </div>
            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                copyText(customerPortalPreview.url, "Customer portal link")
              }
            >
              <Copy size={16} />
              Copy link
            </button>
          </div>
          <div className="portalModuleGrid">
            {customerPortalPreview.modules.map((module) => (
              <article
                data-done={module.done ? "true" : "false"}
                key={module.label}
              >
                {module.done ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                <div>
                  <strong>{module.label}</strong>
                  <span>{module.detail}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="memoryAction wide">
            <Sparkles size={14} />
            <span>{customerPortalPreview.primaryAction}</span>
          </div>
        </section>

        <div className="settingsGrid">
          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Layers size={18} />
                <h2>Theme editor</h2>
              </div>
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>Assistant name</span>
                <input
                  value={assistantName}
                  onChange={(event) => setAssistantName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Launcher label</span>
                <input
                  value={widgetLauncherLabel}
                  onChange={(event) =>
                    setWidgetLauncherLabel(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Primary color</span>
                <input
                  type="color"
                  value={widgetPrimaryColor}
                  onChange={(event) =>
                    setWidgetPrimaryColor(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Background</span>
                <input
                  type="color"
                  value={widgetBackgroundColor}
                  onChange={(event) =>
                    setWidgetBackgroundColor(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Text color</span>
                <input
                  type="color"
                  value={widgetTextColor}
                  onChange={(event) => setWidgetTextColor(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Position</span>
                <select
                  value={widgetPosition}
                  onChange={(event) =>
                    setWidgetPosition(
                      event.target.value as "bottom-right" | "bottom-left",
                    )
                  }
                >
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Opening message</span>
              <textarea
                value={widgetOpeningMessage}
                onChange={(event) =>
                  setWidgetOpeningMessage(event.target.value)
                }
                rows={3}
              />
            </label>
            <button
              className="primaryButton full"
              type="button"
              disabled={busy || !canEditSettings || !selectedTenant}
              onClick={saveTenantSettings}
            >
              <Save size={16} />
              Save widget settings
            </button>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <UserCheck size={18} />
                <h2>Lead capture</h2>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={leadCaptureEnabled}
                  onChange={(event) =>
                    setLeadCaptureEnabled(event.target.checked)
                  }
                />
                <span>Enabled</span>
              </label>
            </div>
            <label className="field">
              <span>Prompt</span>
              <textarea
                value={leadCaptureIntro}
                onChange={(event) => setLeadCaptureIntro(event.target.value)}
                rows={3}
              />
            </label>
            <div className="checkboxGrid">
              {leadFieldOptions.map((field) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={leadCaptureFields.includes(field)}
                    onChange={() => toggleLeadField(field)}
                  />
                  <span>{fieldLabel(field)}</span>
                </label>
              ))}
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>CTA label</span>
                <input
                  value={ctaLabel}
                  onChange={(event) => setCtaLabel(event.target.value)}
                />
              </label>
              <label className="field">
                <span>CTA URL</span>
                <input
                  value={ctaUrl}
                  onChange={(event) => setCtaUrl(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Booking URL</span>
                <input
                  value={bookingUrl}
                  onChange={(event) => setBookingUrl(event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <ShieldCheck size={18} />
                <h2>Consent and readiness</h2>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={consentEnabled}
                onChange={(event) => setConsentEnabled(event.target.checked)}
              />
              <span>Show consent notice</span>
            </label>
            <label className="field">
              <span>Consent text</span>
              <textarea
                value={consentText}
                onChange={(event) => setConsentText(event.target.value)}
                rows={3}
              />
            </label>
            <div className="presetRow" aria-label="Quick reply presets">
              <button
                className="secondaryButton"
                type="button"
                onClick={() => applyQuickReplyPreset("consultancy")}
              >
                Consultancy flow
              </button>
              <button
                className="secondaryButton"
                type="button"
                onClick={() => applyQuickReplyPreset("lead")}
              >
                Lead flow
              </button>
              <button
                className="secondaryButton"
                type="button"
                onClick={() => applyQuickReplyPreset("privacy")}
              >
                Privacy flow
              </button>
            </div>
            <label className="field">
              <span>Quick replies</span>
              <textarea
                value={quickReplies}
                onChange={(event) => setQuickReplies(event.target.value)}
                rows={4}
              />
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={readinessEnabled}
                onChange={(event) => setReadinessEnabled(event.target.checked)}
              />
              <span>Enable AI readiness check</span>
            </label>
            <label className="field">
              <span>Readiness intro</span>
              <textarea
                value={readinessIntro}
                onChange={(event) => setReadinessIntro(event.target.value)}
                rows={3}
              />
            </label>
          </section>
        </div>
      </div>
    );
  }

  function renderSelfServiceBillingPanel() {
    const reservedNumber = onboardingState?.activeReservation?.number ?? null;
    const assignedNumber = onboardingState?.assignedNumber ?? null;
    const billingStatus = onboardingState?.billingAccount?.status ?? "missing";
    const billingActive = billingStatus === "active";
    const hasReservedNumber = Boolean(reservedNumber || assignedNumber);

    return (
      <section className="panel selfServicePanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <ShoppingCart size={18} />
            <h2>Self-service number and billing</h2>
          </div>
          <span
            className="countPill"
            data-tone={billingActive ? "good" : "warn"}
          >
            {billingActive ? "Active" : titleCase(billingStatus)}
          </span>
        </div>

        <div className="phoneLineProgress" aria-hidden="true">
          <span data-active="true" />
          <span data-active={hasReservedNumber ? "true" : "false"} />
          <span data-active={billingActive ? "true" : "false"} />
          <span
            data-active={
              telephoneConnection?.status === "connected" ? "true" : "false"
            }
          />
        </div>

        <div className="selfServiceGrid">
          <article className="selfServiceStep">
            <strong>1. Choose number</strong>
            <span>
              {formatCents(onboardingPrices.numberMonthlyPriceCents)} per month,{" "}
              {formatCents(onboardingPrices.acceptedCallPriceCents)} per
              accepted call.
            </span>
            <div className="formGrid two">
              <label className="field">
                <span>Locality</span>
                <input
                  value={selfServiceLocality}
                  onChange={(event) =>
                    setSelfServiceLocality(event.target.value)
                  }
                  placeholder="Berlin"
                />
              </label>
              <button
                className="secondaryButton"
                type="button"
                disabled={busy || !selectedTenant}
                onClick={() => loadAvailablePhoneNumbers()}
              >
                <Search size={16} />
                Search
              </button>
            </div>
            <div className="numberChoiceGrid">
              {availablePhoneNumbers.length ? (
                availablePhoneNumbers.map((number) => (
                  <button
                    type="button"
                    key={number.id}
                    className="numberChoice"
                    data-active={
                      selectedPhoneNumberId === number.id ? "true" : "false"
                    }
                    onClick={() => setSelectedPhoneNumberId(number.id)}
                  >
                    <PhoneCall size={16} />
                    <span>{number.phoneNumber}</span>
                    <small>{number.locality ?? number.country}</small>
                  </button>
                ))
              ) : (
                <div className="emptyState compact">No numbers loaded.</div>
              )}
            </div>
            <button
              className="primaryButton"
              type="button"
              disabled={busy || !selectedPhoneNumberId || hasReservedNumber}
              onClick={reserveSelectedPhoneNumber}
            >
              <CheckCircle2 size={16} />
              Reserve number
            </button>
          </article>

          <article className="selfServiceStep">
            <strong>2. Activate billing</strong>
            <span>
              {assignedNumber?.phoneNumber ??
                reservedNumber?.phoneNumber ??
                "Reserve a number before checkout."}
            </span>
            <div className="billingStatusRows">
              <article data-ready={hasReservedNumber ? "true" : "false"}>
                <span>Number</span>
                <strong>{hasReservedNumber ? "Reserved" : "Missing"}</strong>
              </article>
              <article data-ready={billingActive ? "true" : "false"}>
                <span>Stripe</span>
                <strong>{billingActive ? "Paid" : "Checkout needed"}</strong>
              </article>
              <article
                data-ready={
                  telephoneConnection?.status === "connected" ? "true" : "false"
                }
              >
                <span>Routing</span>
                <strong>
                  {telephoneConnection?.status === "connected"
                    ? "Live"
                    : "Pending"}
                </strong>
              </article>
            </div>
            <button
              className="primaryButton"
              type="button"
              disabled={busy || !hasReservedNumber || billingActive}
              onClick={startBillingCheckout}
            >
              <ShoppingCart size={16} />
              Open Stripe checkout
            </button>
          </article>
        </div>

        {canManagePlatformBilling() ? renderTelephoneInventoryPanel() : null}
      </section>
    );
  }

  function renderTelephoneInventoryPanel() {
    return (
      <div className="inventoryPanel">
        <div className="panelTitle">
          <RadioTower size={18} />
          <h2>Number inventory</h2>
        </div>
        <form
          className="inventoryForm"
          onSubmit={createTelephoneInventoryNumber}
        >
          <label className="field">
            <span>Phone number</span>
            <input
              value={inventoryPhoneNumber}
              onChange={(event) => setInventoryPhoneNumber(event.target.value)}
              placeholder="+49301234567"
            />
          </label>
          <label className="field">
            <span>Locality</span>
            <input
              value={inventoryLocality}
              onChange={(event) => setInventoryLocality(event.target.value)}
              placeholder="Berlin"
            />
          </label>
          <label className="field">
            <span>SIP target</span>
            <input
              value={inventorySipTarget}
              onChange={(event) => setInventorySipTarget(event.target.value)}
              placeholder="sip:asst_xxx@voice-edge.example.com"
            />
          </label>
          <button
            className="secondaryButton"
            disabled={busy || !inventoryPhoneNumber}
          >
            <Plus size={16} />
            Add number
          </button>
        </form>
        <div className="inventoryList">
          {telephoneInventory.slice(0, 8).map((number) => (
            <article key={number.id}>
              <strong>{number.phoneNumber}</strong>
              <span>{number.locality ?? number.country}</span>
              <small data-status={number.status}>{number.status}</small>
            </article>
          ))}
          {!telephoneInventory.length ? (
            <div className="emptyState compact">No inventory loaded.</div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderChannels() {
    const canEditChannels = canManageChannels();
    return (
      <div className="workspaceStack">
        <section className="metricsGrid compactMetrics">
          <button
            className="metricCard metricButton"
            type="button"
            onClick={() => openChannelsSection("connect-channels")}
          >
            <Globe2 size={18} />
            <span>Channels</span>
            <strong>{channelConnections.length}</strong>
          </button>
          <button
            className="metricCard metricButton"
            type="button"
            onClick={() => openChannelsSection("connect-channels")}
          >
            <CheckCircle2 size={18} />
            <span>Connected</span>
            <strong>{connectedChannelCount}</strong>
          </button>
          <button
            className="metricCard metricButton"
            type="button"
            onClick={() => openChannelsSection("connect-channels")}
          >
            <MessageCircle size={18} />
            <span>Messaging ready</span>
            <strong>{messagingChannelsReady}</strong>
          </button>
          <button
            className="metricCard metricButton"
            data-alert={
              telephoneConnection?.status === "connected" ? "false" : "true"
            }
            type="button"
            onClick={() => openChannelsSection("telephone-channel-setup")}
          >
            <Inbox size={18} />
            <span>Telephone</span>
            <strong>
              {telephoneConnection?.status === "connected" ? "Ready" : "Setup"}
            </strong>
          </button>
        </section>

        <section className="panel channelLaunchPanel">
          <div className="panelHeader">
            <div className="panelTitle">
              <ClipboardCheck size={18} />
              <h2>Channel launch path</h2>
            </div>
            <span className="countPill">Recommended</span>
          </div>
          <div className="channelLaunchMap">
            <button
              data-step="1"
              type="button"
              onClick={() => openSettingsSection("widget-settings")}
            >
              <strong>Website first</strong>
              <span>Embed the assistant and capture the first leads.</span>
            </button>
            <button
              data-step="2"
              type="button"
              onClick={() => openChannelsSection("telephone-channel-setup")}
            >
              <strong>Telephone AI</strong>
              <span>
                Connect a provider number or SIP trunk and run test calls.
              </span>
            </button>
            <button
              data-step="3"
              type="button"
              onClick={() => openChannelsSection("connect-channels")}
            >
              <strong>Messaging and email</strong>
              <span>
                Add WhatsApp, Messenger, Instagram, Telegram, and Email.
              </span>
            </button>
          </div>
          {!canEditChannels ? (
            <div className="inlineNotice">
              <ShieldCheck size={16} />
              <span>Your role can review channels but not change setup.</span>
            </div>
          ) : null}
        </section>

        {renderSelfServiceBillingPanel()}

        {renderTelephoneSetup(telephoneConnection)}

        <section className="panel" id="connect-channels">
          <div className="panelHeader">
            <div className="panelTitle">
              <Globe2 size={18} />
              <h2>Connect channels</h2>
            </div>
            <span className="countPill">
              {channelConnections.length} available
            </span>
            <button
              className="secondaryButton"
              type="button"
              disabled={busy || !selectedTenant}
              onClick={() => refreshChannelConnections()}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          <div className="channelGrid">
            {channelConnections
              .filter((connection) => connection.channel !== "telephone")
              .map((connection, index) => {
                const webhook =
                  connection.assistantWebhookUrl ?? connection.webhookUrl ?? "";
                const connectionKey = [
                  connection.channel,
                  connection.provider,
                  connection.externalAccountId ?? "default",
                  webhook || "no-webhook",
                  index,
                ].join("-");
                const draftValue =
                  channelAccountDrafts[connection.channel] ??
                  connection.externalAccountId ??
                  "";
                const isWebsite = connection.channel === "website";
                const implementationGuide =
                  channelImplementationGuides[connection.channel];
                const details = channelExperienceDetails[connection.channel];
                return (
                  <article className="channelCard" key={connectionKey}>
                    <div className="channelCardHeader">
                      <div>
                        <strong>{connection.label}</strong>
                        <span>{connection.provider}</span>
                      </div>
                      <small data-status={connection.status}>
                        {connection.status}
                      </small>
                    </div>

                    <div className="channelIntro">
                      <small>{details.group}</small>
                      <p>{details.purpose}</p>
                      <strong>{channelNextAction(connection)}</strong>
                    </div>

                    <ol className="channelTutorial">
                      {details.tutorial.map((step) => (
                        <li key={`${connectionKey}-${step}`}>{step}</li>
                      ))}
                    </ol>

                    <div className="channelStepList">
                      {getChannelSetupSteps(connection, webhook).map((step) => (
                        <article
                          data-done={step.done ? "true" : "false"}
                          key={`${connectionKey}-${step.label}`}
                        >
                          {step.done ? (
                            <CheckCircle2 size={16} />
                          ) : (
                            <AlertCircle size={16} />
                          )}
                          <div>
                            <strong>{step.label}</strong>
                            <span>{step.detail}</span>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="channelStatusRows">
                      <article
                        data-ready={
                          channelCredentialReady(connection) ? "true" : "false"
                        }
                      >
                        <span>{channelCredentialLabel(connection)}</span>
                        <strong>{channelCredentialStatus(connection)}</strong>
                      </article>
                      <article
                        data-ready={
                          connection.externalAccountId || isWebsite
                            ? "true"
                            : "false"
                        }
                      >
                        <span>{channelAccountLabel(connection.channel)}</span>
                        <strong>
                          {connection.externalAccountId || isWebsite
                            ? "Set"
                            : "Missing"}
                        </strong>
                      </article>
                    </div>

                    {isWebsite ? (
                      <button
                        className="secondaryButton full"
                        type="button"
                        onClick={() => setActiveTab("settings")}
                      >
                        <Code2 size={15} />
                        Open widget setup
                      </button>
                    ) : (
                      <label className="field">
                        <span>{channelAccountLabel(connection.channel)}</span>
                        <input
                          value={draftValue}
                          placeholder={channelAccountPlaceholder(
                            connection.channel,
                          )}
                          disabled={!canEditChannels}
                          onChange={(event) =>
                            setChannelAccountDrafts((current) => ({
                              ...current,
                              [connection.channel]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    )}

                    {webhook ? (
                      <div className="webhookBox">
                        <span>Webhook URL</span>
                        <code>{webhook}</code>
                        <button
                          className="secondaryButton"
                          type="button"
                          onClick={() =>
                            copyText(webhook, `${connection.label} webhook`)
                          }
                        >
                          <Copy size={15} />
                          Copy
                        </button>
                      </div>
                    ) : null}

                    <div className="channelHint">
                      {channelSetupHint(connection)}
                    </div>

                    {isWebsite ? (
                      <a
                        className="channelGuideLink"
                        href="#widget-settings"
                        onClick={(event) => {
                          event.preventDefault();
                          openSettingsSection("widget-settings");
                        }}
                      >
                        <Code2 size={15} />
                        <span>Implementation guide</span>
                        <small>Widget setup</small>
                      </a>
                    ) : implementationGuide ? (
                      <a
                        className="channelGuideLink"
                        href={implementationGuide.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink size={15} />
                        <span>Implementation guide</span>
                        <small>{implementationGuide.label}</small>
                      </a>
                    ) : null}

                    {!isWebsite ? (
                      <div className="rowActions">
                        <button
                          className="primaryButton"
                          type="button"
                          disabled={busy || !canEditChannels}
                          onClick={() =>
                            saveChannelConnection(connection, {
                              externalAccountId: draftValue,
                              status: "connected",
                            })
                          }
                        >
                          <Save size={15} />
                          Save connected
                        </button>
                        <button
                          className="secondaryButton"
                          type="button"
                          disabled={busy || !canEditChannels}
                          onClick={() =>
                            saveChannelConnection(connection, {
                              status: "pending",
                            })
                          }
                        >
                          Pending
                        </button>
                        <button
                          className="dangerButton"
                          type="button"
                          disabled={busy || !canEditChannels}
                          onClick={() =>
                            saveChannelConnection(connection, {
                              status: "disabled",
                            })
                          }
                        >
                          Disable
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
          </div>
        </section>

        {renderWhatsappOperations()}
      </div>
    );
  }

  function renderTelephoneSetup(connection?: ChannelConnection) {
    const canEditChannels = canManageChannels();
    const voiceBridgeUrl =
      telephoneSettingString(connection, "voiceBridgeUrl") ??
      connection?.webhookUrl ??
      connection?.assistantWebhookUrl ??
      "";
    const sipTarget = telephoneSettingString(connection, "sipTarget") ?? "";
    const savedInstructions = Array.isArray(connection?.settings?.instructions)
      ? connection.settings.instructions.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const activeInstructions = telephoneInstructions.length
      ? telephoneInstructions
      : savedInstructions;
    const currentMode =
      typeof connection?.settings?.mode === "string"
        ? connection.settings.mode
        : "not_configured";
    const currentNumber =
      connection?.externalAccountId ??
      telephoneSettingString(connection, "phoneNumber") ??
      telephoneSettingString(connection, "aiNumber") ??
      telephoneSettingString(connection, "orderedNumber") ??
      telephoneSettingString(connection, "publicNumber") ??
      "";
    const modes: Array<{
      key: TelephoneSetupMode;
      label: string;
      detail: string;
      icon: typeof PhoneCall;
    }> = [
      {
        key: "new_number",
        label: "New number",
        detail: "Provider number",
        icon: ShoppingCart,
      },
      {
        key: "forwarding",
        label: "Existing number",
        detail: "Forward calls",
        icon: Link2,
      },
      {
        key: "sip_byoc",
        label: "SIP trunk",
        detail: "Provider/PBX",
        icon: Router,
      },
    ];
    const providerOptions: Array<{
      value: TelephoneProvider;
      label: string;
      detail: string;
    }> = [
      {
        value: "easybell",
        label: "easybell",
        detail: "German SIP trunk and numbers",
      },
      {
        value: "sipgate",
        label: "sipgate",
        detail: "German number and trunking provider",
      },
      {
        value: "peoplefone",
        label: "peoplefone",
        detail: "DACH/EU SIP trunk option",
      },
      {
        value: "custom_sip",
        label: "Custom SIP",
        detail: "Any customer PBX or SIP provider",
      },
    ];
    const activeWarnings = telephoneWarnings.length
      ? telephoneWarnings
      : buildTelephoneWarningsFromSettings(
          connection?.settings ?? {},
          connection,
        );
    const checklistItems: Array<{
      label: string;
      checked: boolean;
      onChange: (checked: boolean) => void;
    }> = [
      {
        label: "Number ordered or assigned",
        checked: phoneNumberOrdered,
        onChange: setPhoneNumberOrdered,
      },
      {
        label: "SIP trunk configured",
        checked: phoneSipConfigured,
        onChange: setPhoneSipConfigured,
      },
      {
        label: "Test call completed",
        checked: phoneTestCallCompleted,
        onChange: setPhoneTestCallCompleted,
      },
      {
        label: "Fallback number set",
        checked: phoneFallbackSet || Boolean(telephoneFallbackNumber),
        onChange: setPhoneFallbackSet,
      },
      {
        label: "AI disclosure confirmed",
        checked:
          phoneDisclosureConfirmed || Boolean(phoneDisclosureText.trim()),
        onChange: setPhoneDisclosureConfirmed,
      },
    ];
    const recentTelephoneConversations = inboxItems
      .filter((item) => item.channel === "telephone")
      .slice(0, 4);
    const voiceQuality = buildVoiceQualitySummary({
      connection,
      edgeStatus: voiceEdgeStatus,
      checklist: {
        numberOrdered: phoneNumberOrdered,
        sipConfigured: phoneSipConfigured,
        testCallCompleted: phoneTestCallCompleted,
        fallbackSet: phoneFallbackSet,
        disclosureConfirmed: phoneDisclosureConfirmed,
      },
      fallbackNumber: telephoneFallbackNumber,
      disclosureText: phoneDisclosureText,
      transcriptRetentionDays: phoneTranscriptRetentionDays,
      recentCallCount: recentTelephoneConversations.length,
    });

    return (
      <section
        className="panel telephoneSetupPanel"
        id="telephone-channel-setup"
      >
        <div className="panelHeader">
          <div className="panelTitle">
            <PhoneCall size={18} />
            <h2>Telephone AI setup</h2>
          </div>
          <span
            className="countPill"
            data-tone={connection?.status === "connected" ? "good" : "warn"}
          >
            {connection?.status ?? "pending"}
          </span>
        </div>

        <div className="telephoneSummary">
          <article>
            <span>Current mode</span>
            <strong>{formatTelephoneMode(currentMode)}</strong>
          </article>
          <article>
            <span>Provider</span>
            <strong>{telephoneProviderLabel(connection?.provider)}</strong>
          </article>
          <article>
            <span>Number</span>
            <strong>{currentNumber || "Not connected"}</strong>
          </article>
          <article
            data-alert={connection?.status === "connected" ? "false" : "true"}
          >
            <span>Call routing</span>
            <strong>
              {connection?.status === "connected" ? "Ready" : "Setup needed"}
            </strong>
          </article>
        </div>

        <div className="modeSelector" aria-label="Telephone setup mode">
          {modes.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                data-active={telephoneSetupMode === mode.key ? "true" : "false"}
                key={mode.key}
                type="button"
                onClick={() => setTelephoneSetupMode(mode.key)}
              >
                <Icon size={16} />
                <span>{mode.label}</span>
                <small>{mode.detail}</small>
              </button>
            );
          })}
        </div>

        {voiceBridgeUrl || sipTarget ? (
          <div className="webhookBox telephoneWebhook">
            {voiceBridgeUrl ? (
              <div className="telephoneEndpoint">
                <span>Railway voice bridge</span>
                <code>{voiceBridgeUrl}</code>
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => copyText(voiceBridgeUrl, "Voice bridge")}
                >
                  <Copy size={15} />
                  Copy
                </button>
              </div>
            ) : null}
            {sipTarget ? (
              <div className="telephoneEndpoint">
                <span>SIP target</span>
                <code>{sipTarget}</code>
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => copyText(sipTarget, "SIP target")}
                >
                  <Copy size={15} />
                  Copy
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="inlineNotice">
          <ShieldCheck size={16} />
          <span>
            The telephone provider supplies numbers and SIP routing only. The
            AI, inbox, summaries, and handoff logic stay inside Assaddar.
          </span>
        </div>

        <div className="telephonePolishGrid">
          <section className="telephoneControlPanel">
            <div className="miniPanelHeader">
              <strong>Setup checklist</strong>
              <button
                className="secondaryButton"
                type="button"
                disabled={busy || !canEditChannels || !selectedTenant}
                onClick={saveTelephoneRuntimeSettings}
              >
                <Save size={15} />
                Save
              </button>
            </div>
            <div className="checklistStack">
              {checklistItems.map((item) => (
                <label className="toggle" key={item.label}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => item.onChange(event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="telephoneControlPanel">
            <div className="miniPanelHeader">
              <strong>Voice edge</strong>
              <button
                className="secondaryButton"
                type="button"
                disabled={busy || !canEditChannels || !selectedTenant}
                onClick={refreshVoiceEdgeStatus}
              >
                <RefreshCw size={15} />
                Check
              </button>
            </div>
            <div
              className="voiceEdgeStatus"
              data-status={voiceEdgeStatus?.status ?? "unknown"}
            >
              <strong>{voiceEdgeStatus?.status ?? "Not checked"}</strong>
              <span>
                {voiceEdgeStatus?.url ??
                  telephoneSettingString(connection, "voiceBridgeUrl") ??
                  "No voice bridge URL yet"}
              </span>
              <small>
                {voiceEdgeStatus?.checkedAt
                  ? `Checked ${formatDate(voiceEdgeStatus.checkedAt)}`
                  : "Checks the Railway voice service health endpoint."}
              </small>
            </div>
          </section>

          <section className="telephoneControlPanel">
            <div className="miniPanelHeader">
              <strong>Voice quality</strong>
              <span>{voiceQuality.score}/100</span>
            </div>
            <div className="voiceQualityMeter" data-score={voiceQuality.label}>
              <strong>{voiceQuality.label}</strong>
              <span>{voiceQuality.recommendation}</span>
            </div>
            <div className="voiceQualityChecks">
              {voiceQuality.checks.slice(0, 6).map((check) => (
                <article
                  data-done={check.done ? "true" : "false"}
                  key={check.label}
                >
                  {check.done ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <AlertCircle size={14} />
                  )}
                  <span>{check.label}</span>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="providerGuideGrid">
          {providerOptions.map((provider) => (
            <a
              href={telephoneProviderGuideUrl(provider.value)}
              key={provider.value}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={15} />
              <span>{provider.label} guide</span>
            </a>
          ))}
        </div>

        {activeWarnings.length ? (
          <div className="telephoneWarnings">
            {activeWarnings.map((warning) => (
              <article data-level={warning.level} key={warning.title}>
                <AlertCircle size={15} />
                <div>
                  <strong>{warning.title}</strong>
                  <span>{warning.detail}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {telephoneSetupMode === "new_number" ? (
          <div className="telephoneFlow">
            <div className="providerOptionGrid">
              {providerOptions.map((provider) => (
                <button
                  data-selected={
                    newNumberProvider === provider.value ? "true" : "false"
                  }
                  key={provider.value}
                  type="button"
                  onClick={() => setNewNumberProvider(provider.value)}
                >
                  <strong>{provider.label}</strong>
                  <span>{provider.detail}</span>
                </button>
              ))}
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>Country</span>
                <input
                  maxLength={2}
                  value={newNumberCountry}
                  onChange={(event) =>
                    setNewNumberCountry(event.target.value.toUpperCase())
                  }
                />
              </label>
              <label className="field">
                <span>Number type</span>
                <select
                  value={newNumberType}
                  onChange={(event) =>
                    setNewNumberType(event.target.value as TelephoneNumberType)
                  }
                >
                  <option value="local">Local</option>
                  <option value="mobile">Mobile</option>
                  <option value="toll-free">Toll-free</option>
                </select>
              </label>
              <label className="field">
                <span>Area code</span>
                <input
                  placeholder="030"
                  value={newNumberAreaCode}
                  onChange={(event) => setNewNumberAreaCode(event.target.value)}
                />
              </label>
              <label className="field">
                <span>City or locality</span>
                <input
                  placeholder="Berlin"
                  value={newNumberLocality}
                  onChange={(event) => setNewNumberLocality(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Ordered number</span>
                <input
                  placeholder="+49301234567"
                  value={orderedPhoneNumber}
                  onChange={(event) =>
                    setOrderedPhoneNumber(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>SIP registrar</span>
                <input
                  placeholder="sip.easybell.de"
                  value={newNumberSipRegistrar}
                  onChange={(event) =>
                    setNewNumberSipRegistrar(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>SIP username</span>
                <input
                  placeholder="Provider SIP user"
                  value={newNumberSipUsername}
                  onChange={(event) =>
                    setNewNumberSipUsername(event.target.value)
                  }
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={newNumberSipConfigured}
                  onChange={(event) =>
                    setNewNumberSipConfigured(event.target.checked)
                  }
                />
                <span>Number and SIP routing are active</span>
              </label>
            </div>
            <button
              className="primaryButton"
              type="button"
              disabled={busy || !canEditChannels || !selectedTenant}
              onClick={saveNewTelephoneNumberSetup}
            >
              <Save size={16} />
              Save new number setup
            </button>
          </div>
        ) : null}

        {telephoneSetupMode === "forwarding" ? (
          <div className="telephoneFlow">
            <div className="providerOptionGrid">
              {providerOptions.map((provider) => (
                <button
                  data-selected={
                    forwardingProvider === provider.value ? "true" : "false"
                  }
                  key={provider.value}
                  type="button"
                  onClick={() => setForwardingProvider(provider.value)}
                >
                  <strong>{provider.label}</strong>
                  <span>{provider.detail}</span>
                </button>
              ))}
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>Existing business number</span>
                <input
                  placeholder="+49301234567"
                  value={forwardingExistingNumber}
                  onChange={(event) =>
                    setForwardingExistingNumber(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>AI destination number</span>
                <input
                  placeholder="+49307654321"
                  value={forwardingAiNumber}
                  onChange={(event) =>
                    setForwardingAiNumber(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Carrier or PBX</span>
                <input
                  placeholder="Telekom, Vodafone, 3CX..."
                  value={forwardingCarrierName}
                  onChange={(event) =>
                    setForwardingCarrierName(event.target.value)
                  }
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={forwardingConfirmed}
                  onChange={(event) =>
                    setForwardingConfirmed(event.target.checked)
                  }
                />
                <span>Forwarding is already active</span>
              </label>
            </div>
            <button
              className="primaryButton"
              type="button"
              disabled={
                busy ||
                !canEditChannels ||
                !selectedTenant ||
                !forwardingExistingNumber ||
                !forwardingAiNumber
              }
              onClick={saveCarrierForwardingSetup}
            >
              <Save size={16} />
              Save forwarding setup
            </button>
          </div>
        ) : null}

        {telephoneSetupMode === "sip_byoc" ? (
          <div className="telephoneFlow">
            <div className="providerOptionGrid">
              {providerOptions.map((provider) => (
                <button
                  data-selected={
                    sipProvider === provider.value ? "true" : "false"
                  }
                  key={provider.value}
                  type="button"
                  onClick={() => setSipProvider(provider.value)}
                >
                  <strong>{provider.label}</strong>
                  <span>{provider.detail}</span>
                </button>
              ))}
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>Carrier or PBX</span>
                <input
                  placeholder="Carrier, PBX, SIP provider"
                  value={sipCarrierName}
                  onChange={(event) => setSipCarrierName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>SIP domain</span>
                <input
                  placeholder="customer-pbx.example.com"
                  value={sipDomain}
                  onChange={(event) => setSipDomain(event.target.value)}
                />
              </label>
              <label className="field">
                <span>SIP registrar</span>
                <input
                  placeholder="sip.easybell.de"
                  value={sipRegistrar}
                  onChange={(event) => setSipRegistrar(event.target.value)}
                />
              </label>
              <label className="field">
                <span>SIP username</span>
                <input
                  placeholder="Provider SIP user"
                  value={sipUsername}
                  onChange={(event) => setSipUsername(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Trunk or account ID</span>
                <input
                  placeholder="Optional provider ID"
                  value={sipTrunkSid}
                  onChange={(event) => setSipTrunkSid(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Inbound SIP URI</span>
                <input
                  placeholder="sip:..."
                  value={sipInboundUri}
                  onChange={(event) => setSipInboundUri(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Public number</span>
                <input
                  placeholder="+49301234567"
                  value={sipPublicNumber}
                  onChange={(event) => setSipPublicNumber(event.target.value)}
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={sipConfigured}
                  onChange={(event) => setSipConfigured(event.target.checked)}
                />
                <span>SIP routing is already active</span>
              </label>
            </div>
            <div className="rowActions">
              <button
                className="primaryButton"
                type="button"
                disabled={busy || !canEditChannels || !selectedTenant}
                onClick={saveSipByocSetup}
              >
                <RadioTower size={16} />
                Save SIP trunk setup
              </button>
              <a
                className="secondaryButton linkButton"
                href="https://en.easybell.de/business/sip-trunks/"
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={15} />
                SIP guide
              </a>
            </div>
          </div>
        ) : null}

        <div className="formGrid two">
          <label className="field">
            <span>Fallback human number</span>
            <input
              placeholder="+491701234567"
              value={telephoneFallbackNumber}
              onChange={(event) =>
                setTelephoneFallbackNumber(event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>Internal notes</span>
            <input
              placeholder="Contract owner, porting date, routing notes..."
              value={telephoneNotes}
              onChange={(event) => setTelephoneNotes(event.target.value)}
            />
          </label>
        </div>

        <div className="telephoneRuntimeGrid">
          <section className="telephoneControlPanel">
            <div className="miniPanelHeader">
              <strong>Business hours</strong>
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>Mode</span>
                <select
                  value={businessHoursMode}
                  onChange={(event) =>
                    setBusinessHoursMode(
                      event.target.value as typeof businessHoursMode,
                    )
                  }
                >
                  <option value="always_on">Always on</option>
                  <option value="business_hours">Business hours</option>
                  <option value="after_hours_only">After hours only</option>
                </select>
              </label>
              <label className="field">
                <span>Timezone</span>
                <input
                  value={businessHoursTimezone}
                  onChange={(event) =>
                    setBusinessHoursTimezone(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Hours</span>
                <input
                  value={businessHoursText}
                  onChange={(event) => setBusinessHoursText(event.target.value)}
                />
              </label>
              <label className="field">
                <span>After hours</span>
                <select
                  value={afterHoursAction}
                  onChange={(event) =>
                    setAfterHoursAction(
                      event.target.value as typeof afterHoursAction,
                    )
                  }
                >
                  <option value="answer">Answer normally</option>
                  <option value="voicemail">Take voicemail</option>
                  <option value="callback">Offer callback</option>
                  <option value="transfer">Transfer to fallback</option>
                </select>
              </label>
            </div>
          </section>

          <section className="telephoneControlPanel">
            <div className="miniPanelHeader">
              <strong>Handoff rules</strong>
            </div>
            <div className="checklistStack">
              {[
                {
                  label: "Low confidence",
                  checked: handoffLowConfidence,
                  onChange: setHandoffLowConfidence,
                },
                {
                  label: "Urgent keywords",
                  checked: handoffUrgentKeywords,
                  onChange: setHandoffUrgentKeywords,
                },
                {
                  label: "Office-hours transfer",
                  checked: handoffOfficeHoursTransfer,
                  onChange: setHandoffOfficeHoursTransfer,
                },
                {
                  label: "Repeated failed answer",
                  checked: handoffRepeatedFailure,
                  onChange: setHandoffRepeatedFailure,
                },
                {
                  label: "Ask before transfer",
                  checked: handoffAskBeforeTransfer,
                  onChange: setHandoffAskBeforeTransfer,
                },
              ].map((item) => (
                <label className="toggle" key={item.label}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => item.onChange(event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="telephoneControlPanel">
            <div className="miniPanelHeader">
              <strong>GDPR phone settings</strong>
            </div>
            <label className="field">
              <span>Caller disclosure</span>
              <textarea
                rows={3}
                value={phoneDisclosureText}
                onChange={(event) => setPhoneDisclosureText(event.target.value)}
              />
            </label>
            <div className="formGrid two">
              <label className="field">
                <span>Transcript retention</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={phoneTranscriptRetentionDays}
                  onChange={(event) =>
                    setPhoneTranscriptRetentionDays(Number(event.target.value))
                  }
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={phoneRecordingEnabled}
                  onChange={(event) =>
                    setPhoneRecordingEnabled(event.target.checked)
                  }
                />
                <span>Call recording enabled</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={phoneStoreTranscripts}
                  onChange={(event) =>
                    setPhoneStoreTranscripts(event.target.checked)
                  }
                />
                <span>Store transcripts</span>
              </label>
            </div>
          </section>

          <section className="telephoneControlPanel">
            <div className="miniPanelHeader">
              <strong>Voice quality</strong>
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>Language</span>
                <input
                  value={phoneVoiceLanguage}
                  onChange={(event) =>
                    setPhoneVoiceLanguage(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Style</span>
                <select
                  value={phoneSpeakingStyle}
                  onChange={(event) =>
                    setPhoneSpeakingStyle(
                      event.target.value as typeof phoneSpeakingStyle,
                    )
                  }
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="concise">Concise</option>
                </select>
              </label>
              <label className="field">
                <span>Max answer length</span>
                <input
                  type="number"
                  min={160}
                  max={1200}
                  value={phoneMaxAnswerLength}
                  onChange={(event) =>
                    setPhoneMaxAnswerLength(Number(event.target.value))
                  }
                />
              </label>
            </div>
          </section>
        </div>

        <div className="telephoneTestCall">
          <div>
            <strong>Test call</strong>
            <span>
              Status: {titleCase(telephoneTestCallStatus)}. Place a real call
              after SIP routing is active.
            </span>
          </div>
          <label className="field">
            <span>Test caller number</span>
            <input
              placeholder="+491701234567"
              value={telephoneTestCallNumber}
              onChange={(event) =>
                setTelephoneTestCallNumber(event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>Result notes</span>
            <input
              placeholder="Answered, transcript saved, fallback checked..."
              value={telephoneTestCallNotes}
              onChange={(event) =>
                setTelephoneTestCallNotes(event.target.value)
              }
            />
          </label>
          <div className="rowActions">
            <button
              className="secondaryButton"
              type="button"
              disabled={busy || !canEditChannels || !selectedTenant}
              onClick={() => saveTelephoneTestCall("pending")}
            >
              Pending
            </button>
            <button
              className="primaryButton"
              type="button"
              disabled={busy || !canEditChannels || !selectedTenant}
              onClick={() => saveTelephoneTestCall("passed")}
            >
              <CheckCircle2 size={15} />
              Passed
            </button>
            <button
              className="dangerButton"
              type="button"
              disabled={busy || !canEditChannels || !selectedTenant}
              onClick={() => saveTelephoneTestCall("failed")}
            >
              Failed
            </button>
          </div>
        </div>

        {activeInstructions.length ? (
          <div className="instructionList">
            {activeInstructions.map((instruction) => (
              <article key={instruction}>
                <CheckCircle2 size={15} />
                <span>{instruction}</span>
              </article>
            ))}
          </div>
        ) : null}

        <div className="recentCallList">
          <div className="miniPanelHeader">
            <strong>Recent phone conversations</strong>
            <span>{recentTelephoneConversations.length}</span>
          </div>
          {recentTelephoneConversations.length ? (
            recentTelephoneConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  setActiveTab("leads");
                }}
              >
                <PhoneCall size={15} />
                <span>
                  {conversation.externalUserId ||
                    conversation.contact?.phone ||
                    conversation.publicId}
                </span>
                <small>
                  {conversation.lastMessage?.content
                    ? conversation.lastMessage.content.slice(0, 70)
                    : formatDate(conversation.createdAt)}
                </small>
              </button>
            ))
          ) : (
            <div className="emptyState compact">
              Calls will appear here after the voice edge sends turns to the
              Railway bridge.
            </div>
          )}
        </div>

        <div className="providerRoadmap">
          <article>
            <span>Provider role</span>
            <strong>Numbers and SIP only</strong>
            <p>
              The carrier provides regulated phone access; Assaddar owns the AI
              assistant, inbox, and customer workflow.
            </p>
          </article>
          <article>
            <span>Voice edge</span>
            <strong>Asterisk or FreeSWITCH</strong>
            <p>
              SIP/RTP media terminates on a voice edge, which calls the Railway
              voice bridge after transcription.
            </p>
          </article>
        </div>
      </section>
    );
  }

  function renderWhatsappOperations() {
    const canEditChannels = canManageChannels();
    const variables = extractTemplateVariablesFromBody(templateBody);

    return (
      <section className="panel">
        <div className="panelHeader">
          <div className="panelTitle">
            <MessageCircle size={18} />
            <h2>WhatsApp operations</h2>
          </div>
          <span
            className="countPill"
            data-tone={
              whatsappCompliance?.canUseFreeformReply ? "good" : "warn"
            }
          >
            {whatsappCompliance?.canUseFreeformReply
              ? "Window open"
              : "Template mode"}
          </span>
        </div>

        <div className="whatsappOpsGrid">
          <article className="opsCard">
            <span>24-hour response window</span>
            <strong>{formatWindowState(whatsappCompliance)}</strong>
            <small>
              Last inbound: {formatDate(whatsappCompliance?.lastInboundAt)}
            </small>
          </article>
          <article className="opsCard">
            <span>Approved templates</span>
            <strong>{whatsappCompliance?.templates.approved ?? 0}</strong>
            <small>
              {whatsappCompliance?.templates.total ?? whatsappTemplates.length}{" "}
              total
            </small>
          </article>
          <article
            className="opsCard"
            data-alert={
              whatsappCompliance?.templates.needsAttention ? "true" : "false"
            }
          >
            <span>Needs attention</span>
            <strong>{whatsappCompliance?.templates.needsAttention ?? 0}</strong>
            <small>Rejected or paused templates</small>
          </article>
        </div>

        <div className="templateGrid">
          <section className="templateEditor">
            <div className="panelHeader compact">
              <div className="panelTitle">
                <Save size={18} />
                <h2>Template editor</h2>
              </div>
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>Name</span>
                <input
                  value={templateName}
                  disabled={!canEditChannels}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Language</span>
                <input
                  value={templateLanguage}
                  disabled={!canEditChannels}
                  onChange={(event) => setTemplateLanguage(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Category</span>
                <select
                  value={templateCategory}
                  disabled={!canEditChannels}
                  onChange={(event) =>
                    setTemplateCategory(
                      event.target.value as WhatsappTemplate["category"],
                    )
                  }
                >
                  <option value="utility">Utility</option>
                  <option value="marketing">Marketing</option>
                  <option value="authentication">Authentication</option>
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={templateStatus}
                  disabled={!canEditChannels}
                  onChange={(event) =>
                    setTemplateStatus(
                      event.target.value as WhatsappTemplate["status"],
                    )
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="paused">Paused</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Body</span>
              <textarea
                value={templateBody}
                disabled={!canEditChannels}
                onChange={(event) => setTemplateBody(event.target.value)}
                rows={5}
              />
            </label>
            <div className="tagRow">
              {variables.length ? (
                variables.map((variable) => (
                  <small key={variable}>{variable}</small>
                ))
              ) : (
                <small>No variables</small>
              )}
            </div>
            <button
              className="primaryButton full"
              type="button"
              disabled={
                busy ||
                !canEditChannels ||
                !selectedTenant ||
                !templateName ||
                !templateBody
              }
              onClick={saveWhatsappTemplate}
            >
              <Save size={16} />
              Save template
            </button>
          </section>

          <section className="templateList">
            <div className="panelHeader compact">
              <div className="panelTitle">
                <MessageSquare size={18} />
                <h2>Templates</h2>
              </div>
              <span className="countPill">{whatsappTemplates.length}</span>
            </div>
            {whatsappTemplates.length ? (
              whatsappTemplates.map((template) => (
                <article className="templateCard" key={template.id}>
                  <div>
                    <strong>{template.name}</strong>
                    <span>
                      {template.language} · {template.category}
                    </span>
                  </div>
                  <small data-status={template.status}>{template.status}</small>
                  <p>{template.body}</p>
                  <button
                    className="secondaryButton"
                    type="button"
                    onClick={() => {
                      setTemplateName(template.name);
                      setTemplateLanguage(template.language);
                      setTemplateCategory(template.category);
                      setTemplateStatus(template.status);
                      setTemplateBody(template.body);
                    }}
                  >
                    Edit
                  </button>
                </article>
              ))
            ) : (
              <div className="emptyState compact">
                No WhatsApp templates yet. Start with a utility template for
                continuing conversations after 24 hours.
              </div>
            )}
          </section>

          <section className="templateList">
            <div className="panelHeader compact">
              <div className="panelTitle">
                <BarChart3 size={18} />
                <h2>Recent deliveries</h2>
              </div>
            </div>
            {whatsappCompliance?.recentDeliveries.length ? (
              whatsappCompliance.recentDeliveries
                .slice(0, 6)
                .map((delivery) => (
                  <article className="deliveryRow" key={delivery.id}>
                    <div>
                      <strong>{delivery.status}</strong>
                      <span>
                        {delivery.providerMessageId ?? "No provider id"}
                      </span>
                    </div>
                    <small>{formatDate(delivery.createdAt)}</small>
                    {delivery.detail ? <p>{delivery.detail}</p> : null}
                  </article>
                ))
            ) : (
              <div className="emptyState compact">
                WhatsApp delivery events will appear after live sends.
              </div>
            )}
          </section>
        </div>
      </section>
    );
  }

  function isTelephoneConversation(
    inboxItem?: UnifiedInboxItem | null,
    conversation?: Conversation | null,
  ) {
    return (inboxItem?.channel ?? conversation?.channel) === "telephone";
  }

  function latestAnswerConfidence(messages: ConversationMessage[]) {
    const answer = latestAnswerTrace(messages);
    const confidence = answer ? answer["confidence"] : undefined;
    return typeof confidence === "number" ? formatPercent(confidence) : "N/A";
  }

  function latestHandoffState(messages: ConversationMessage[]) {
    const answer = latestAnswerTrace(messages);
    const handoff = answer ? answer["handoffRecommended"] : undefined;
    if (typeof handoff === "boolean") {
      return handoff ? "Recommended" : "No";
    }
    return "N/A";
  }

  function latestAnswerTrace(messages: ConversationMessage[]) {
    for (const message of [...messages].reverse()) {
      const trace = settingRecord(message.trace);
      const answer = settingRecord(trace.answer);
      if (Object.keys(answer).length) {
        return answer;
      }
    }
    return null;
  }

  function currentTenantRole(tenantId = selectedTenant?.id) {
    if (adminSession?.authType === "admin_token") {
      return "platform_owner";
    }
    return adminSession?.memberships?.find(
      (membership) => membership.tenantId === tenantId,
    )?.role;
  }

  function canUseTenantRole(
    minimumRole: string,
    tenantId = selectedTenant?.id,
  ) {
    const role = currentTenantRole(tenantId);
    return role ? tenantRoleRank(role) >= tenantRoleRank(minimumRole) : false;
  }

  function canManageUsers(tenantId = selectedTenant?.id) {
    return canUseTenantRole("tenant_admin", tenantId);
  }

  function canManageTenantSettings() {
    return canUseTenantRole("tenant_admin");
  }

  function canManageKnowledge() {
    return canUseTenantRole("tenant_admin");
  }

  function canManageChannels() {
    return canUseTenantRole("tenant_admin");
  }

  function canManagePlatformBilling() {
    return (
      adminSession?.authType === "admin_token" ||
      adminSession?.user.role === "platform_owner"
    );
  }

  function canManageLeads() {
    return canUseTenantRole("operator");
  }

  function tenantRoleRank(role: string) {
    const ranks: Record<string, number> = {
      viewer: 10,
      operator: 20,
      tenant_admin: 30,
      tenant_owner: 40,
      platform_owner: 50,
    };
    return ranks[role] ?? 0;
  }

  function slugFromName(value: string) {
    return (
      value
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "new-project"
    );
  }

  function formatCents(value: number, currency = "EUR") {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
    }).format(value / 100);
  }

  function channelAccountLabel(channel: ChannelConnection["channel"]) {
    if (channel === "telephone") {
      return "Phone number or SIP trunk";
    }
    if (channel === "whatsapp") {
      return "WhatsApp phone number ID";
    }
    if (channel === "messenger") {
      return "Facebook Page ID";
    }
    if (channel === "instagram") {
      return "Instagram account ID";
    }
    if (channel === "telegram") {
      return "Bot username or bot ID";
    }
    if (channel === "email") {
      return "Support mailbox";
    }
    return "Account ID";
  }

  function channelAccountPlaceholder(channel: ChannelConnection["channel"]) {
    if (channel === "whatsapp") {
      return "WhatsApp phone number ID";
    }
    if (channel === "messenger") {
      return "Facebook Page ID";
    }
    if (channel === "instagram") {
      return "Instagram account ID";
    }
    if (channel === "telegram") {
      return "@your_bot or bot ID";
    }
    if (channel === "email") {
      return "support@example.com";
    }
    return "Account ID";
  }

  function channelCredentialLabel(connection: ChannelConnection) {
    if (connection.channel === "website") {
      return "Install";
    }
    if (connection.channel === "email") {
      return "Forwarding";
    }
    if (connection.channel === "telegram") {
      return "Bot token";
    }
    return "Credential";
  }

  function channelCredentialStatus(connection: ChannelConnection) {
    if (connection.channel === "website") {
      return "Ready";
    }
    if (connection.channel === "email") {
      return connection.externalAccountId ? "Ready" : "Setup";
    }
    return connection.credentialConfigured ? "Ready" : "Missing";
  }

  function channelCredentialReady(connection: ChannelConnection) {
    if (connection.channel === "website") {
      return true;
    }
    if (connection.channel === "email") {
      return Boolean(connection.externalAccountId);
    }
    return Boolean(connection.credentialConfigured);
  }

  function channelNextAction(connection: ChannelConnection) {
    if (connection.status === "disabled") {
      return "Enable the channel when you are ready to use it.";
    }
    if (connection.status === "connected") {
      return "Send a test message and watch the inbox.";
    }
    return channelExperienceDetails[connection.channel].nextAction;
  }

  function channelSetupHint(connection: ChannelConnection) {
    if (connection.channel === "telephone") {
      return "Use a phone provider for numbers/SIP only. Route calls into the Assaddar voice edge so the AI and inbox stay in this platform.";
    }
    if (connection.channel === "whatsapp") {
      return "Use the WhatsApp Cloud API phone number ID. The webhook accepts mapped account traffic or the assistant-specific URL.";
    }
    if (connection.channel === "messenger") {
      return "Use the Facebook Page ID and subscribe the app to messages on the Messenger webhook.";
    }
    if (connection.channel === "instagram") {
      return "Use the Instagram Professional account ID and subscribe the app to messaging webhooks.";
    }
    if (connection.channel === "telegram") {
      return "Create a bot in BotFather, paste the bot token during setup, then test private chat and controlled group replies.";
    }
    if (connection.channel === "email") {
      return "Forward a support mailbox to the platform address so customer emails become conversations in the same inbox.";
    }
    return "Website traffic is handled by the installed widget snippet.";
  }

  function getChannelSetupSteps(
    connection: ChannelConnection,
    webhook: string,
  ) {
    const isWebsite = connection.channel === "website";
    const implementationGuide = channelImplementationGuides[connection.channel];

    if (isWebsite) {
      return [
        {
          label: "Widget snippet",
          detail: selectedTenant
            ? "Assistant ID is ready"
            : "Select a tenant first",
          done: Boolean(selectedTenant),
        },
        {
          label: "Install on website",
          detail: installCheck?.installed
            ? "Widget detected on site"
            : "Paste the snippet in the website footer",
          done: Boolean(installCheck?.installed),
        },
        {
          label: "Verify",
          detail: "Use the install checker in Settings > Widget",
          done: Boolean(installCheck?.installed),
        },
      ];
    }

    if (connection.channel === "telegram") {
      return [
        {
          label: "Bot token",
          detail: connection.credentialConfigured
            ? "Bot token is stored securely"
            : "Paste the BotFather token in the Telegram setup flow",
          done: Boolean(connection.credentialConfigured),
        },
        {
          label: "Bot identity",
          detail: connection.externalAccountId
            ? "Bot mapped to this assistant"
            : "Save the bot username or ID",
          done: Boolean(connection.externalAccountId),
        },
        {
          label: "Webhook",
          detail: webhook
            ? "Use the assistant-specific callback"
            : "Callback URL is not available",
          done: Boolean(webhook),
        },
        {
          label: "Group mode",
          detail: "Answer mentions, /ask commands, and replies",
          done: true,
        },
      ];
    }

    if (connection.channel === "email") {
      return [
        {
          label: "Forwarding address",
          detail: "Platform inbound address will receive support mail",
          done: true,
        },
        {
          label: "Support mailbox",
          detail: connection.externalAccountId
            ? "Mailbox noted for this assistant"
            : "Add the mailbox customers already use",
          done: Boolean(connection.externalAccountId),
        },
        {
          label: "Forward mail",
          detail: "Forward the mailbox to the platform address",
          done: connection.status === "connected",
        },
        {
          label: "Test",
          detail: "Send a test email and confirm it appears in the inbox",
          done: connection.status === "connected",
        },
      ];
    }

    return [
      {
        label: "Provider credential",
        detail: connection.credentialConfigured
          ? "Environment secret is configured"
          : "Add the provider token in Railway",
        done: Boolean(connection.credentialConfigured),
      },
      {
        label: channelAccountLabel(connection.channel),
        detail: connection.externalAccountId
          ? "Account mapped to this assistant"
          : "Paste the account ID below",
        done: Boolean(connection.externalAccountId),
      },
      {
        label: "Webhook",
        detail: webhook
          ? "Copy this URL into the provider"
          : "Webhook is not available",
        done: Boolean(webhook),
      },
      {
        label: "Guide",
        detail: implementationGuide
          ? implementationGuide.label
          : "Follow the provider setup guide",
        done: Boolean(implementationGuide),
      },
      {
        label: "Connection",
        detail:
          connection.status === "connected"
            ? "Marked connected"
            : "Save as connected after provider test",
        done: connection.status === "connected",
      },
    ];
  }

  function renderAutomation() {
    const canEditSettings = canManageTenantSettings();
    const rules = [
      {
        key: "ownerLeadEmailEnabled" as const,
        title: "Notify owner on every lead",
        detail:
          "Sends the owner a structured email when a lead or readiness check is captured.",
        enabled: automationSettings.ownerLeadEmailEnabled,
      },
      {
        key: "visitorConfirmationEmailEnabled" as const,
        title: "Confirm receipt to visitor",
        detail:
          "Sends the visitor a short confirmation email when they provide an email address.",
        enabled: automationSettings.visitorConfirmationEmailEnabled,
      },
      {
        key: "autoQualifyReadinessEnabled" as const,
        title: "Qualify high readiness leads",
        detail: `Moves readiness leads to qualified at ${automationSettings.readinessQualificationScore}/100 or higher.`,
        enabled: automationSettings.autoQualifyReadinessEnabled,
      },
      {
        key: "autoQualifyLeadDetailsEnabled" as const,
        title: "Qualify complete lead forms",
        detail:
          "Moves leads with email, company, and budget or project context to qualified.",
        enabled: automationSettings.autoQualifyLeadDetailsEnabled,
      },
      {
        key: "weeklySummaryEmailEnabled" as const,
        title: "Weekly owner summary",
        detail:
          "Keeps a weekly report ready with leads, stale follow-ups, and missing knowledge.",
        enabled: automationSettings.weeklySummaryEmailEnabled,
      },
    ];

    return (
      <div className="workspaceStack">
        <section className="panel automationHero">
          <div className="panelHeader">
            <div className="panelTitle">
              <Sparkles size={18} />
              <h2>Automation Center</h2>
            </div>
            <span className="countPill">
              {rules.filter((rule) => rule.enabled).length}/{rules.length}{" "}
              active
            </span>
          </div>
          <div className="automationSummary">
            <article>
              <span>Qualified leads</span>
              <strong>{highIntentLeads.length}</strong>
            </article>
            <article data-alert={staleLeads.length ? "true" : "false"}>
              <span>Follow-up reminders</span>
              <strong>{staleLeads.length}</strong>
            </article>
            <article>
              <span>Booking CTA</span>
              <strong>{bookingUrl ? "Ready" : "Missing"}</strong>
            </article>
          </div>
        </section>

        <section className="panel playbookPreviewPanel">
          <div className="panelHeader">
            <div className="panelTitle">
              <ClipboardCheck size={18} />
              <h2>{playbookPreview.title}</h2>
            </div>
            <span
              className="countPill"
              data-tone={
                playbookPreview.completed === playbookPreview.total
                  ? "good"
                  : "warn"
              }
            >
              {playbookPreview.stage}
            </span>
          </div>
          <div className="playbookProgress">
            <strong>
              {playbookPreview.completed}/{playbookPreview.total}
            </strong>
            <span>Next: {playbookPreview.nextStep}</span>
          </div>
          <div className="playbookStepGrid">
            {playbookPreview.steps.map((step) => (
              <article
                data-done={step.done ? "true" : "false"}
                key={step.label}
              >
                {step.done ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                <div>
                  <strong>{step.label}</strong>
                  <span>{step.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="automationGrid">
          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Settings size={18} />
                <h2>Automation rules</h2>
              </div>
            </div>
            <div className="automationRuleList">
              {rules.map((rule) => (
                <article className="automationRule" key={rule.key}>
                  <div>
                    <strong>{rule.title}</strong>
                    <p>{rule.detail}</p>
                  </div>
                  <label className="ruleSwitch">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      disabled={!canEditSettings}
                      onChange={(event) =>
                        updateAutomationSetting(rule.key, event.target.checked)
                      }
                    />
                    <span>{rule.enabled ? "On" : "Off"}</span>
                  </label>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <UserCheck size={18} />
                <h2>Lead routing</h2>
              </div>
            </div>
            <div className="formGrid two">
              <label className="field">
                <span>Readiness threshold</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={automationSettings.readinessQualificationScore}
                  disabled={!canEditSettings}
                  onChange={(event) =>
                    updateAutomationSetting(
                      "readinessQualificationScore",
                      Number(event.target.value),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Stale after days</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={automationSettings.staleLeadReminderDays}
                  disabled={!canEditSettings}
                  onChange={(event) =>
                    updateAutomationSetting(
                      "staleLeadReminderDays",
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Booking URL</span>
              <input
                value={bookingUrl}
                disabled={!canEditSettings}
                onChange={(event) => setBookingUrl(event.target.value)}
                placeholder="https://cal.com/..."
              />
            </label>
            <div className="rowActions">
              <button
                className="primaryButton"
                type="button"
                disabled={busy || !canEditSettings || !selectedTenant}
                onClick={saveTenantSettings}
              >
                <Save size={16} />
                Save automation
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={busy || !canEditSettings || !selectedTenant}
                onClick={sendWeeklyReport}
              >
                <Send size={16} />
                Send weekly report
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={!bookingUrl}
                onClick={() => copyText(bookingUrl, "Booking URL")}
              >
                <Copy size={16} />
                Copy booking URL
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderSettings() {
    const canEditSettings = canManageTenantSettings();
    return (
      <div className="settingsGrid">
        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Sparkles size={18} />
              <h2>Assistant personality</h2>
            </div>
          </div>
          <div className="formGrid two">
            <label className="field">
              <span>Default language</span>
              <select
                value={tenantLocale}
                disabled={!canEditSettings}
                onChange={(event) => {
                  setTenantLocale(event.target.value);
                  setWidgetLanguage(event.target.value);
                }}
              >
                <option value="de">German</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field">
              <span>Tone</span>
              <select
                value={tenantTone}
                disabled={!canEditSettings}
                onChange={(event) =>
                  setTenantTone(
                    event.target.value as "friendly" | "neutral" | "formal",
                  )
                }
              >
                <option value="friendly">Friendly</option>
                <option value="neutral">Neutral</option>
                <option value="formal">Formal</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Assistant role</span>
            <textarea
              value={widgetOpeningMessage}
              disabled={!canEditSettings}
              onChange={(event) => setWidgetOpeningMessage(event.target.value)}
              rows={4}
            />
          </label>
          <button
            className="primaryButton full"
            type="button"
            disabled={busy || !canEditSettings || !selectedTenant}
            onClick={saveTenantSettings}
          >
            <Save size={16} />
            Save business profile
          </button>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <ShieldCheck size={18} />
              <h2>Safety and limits</h2>
            </div>
          </div>
          <div className="formGrid two">
            <label className="field">
              <span>Confidence threshold</span>
              <input
                type="number"
                min="0.05"
                max="0.95"
                step="0.01"
                value={confidenceThreshold}
                disabled={!canEditSettings}
                onChange={(event) =>
                  setConfidenceThreshold(Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Max message length</span>
              <input
                type="number"
                min="200"
                max="4000"
                value={maxMessageLength}
                disabled={!canEditSettings}
                onChange={(event) =>
                  setMaxMessageLength(Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>Retention days</span>
              <input
                type="number"
                min="1"
                max="3650"
                value={retentionDays}
                disabled={!canEditSettings}
                onChange={(event) =>
                  setRetentionDays(Number(event.target.value))
                }
              />
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Building2 size={18} />
              <h2>Tenant</h2>
            </div>
          </div>
          <div className="identityList">
            <article>
              <span>Name</span>
              <strong>{selectedTenant?.name ?? "No tenant selected"}</strong>
            </article>
            <article>
              <span>Slug</span>
              <strong>{selectedTenant?.slug ?? "-"}</strong>
            </article>
            <article>
              <span>Status</span>
              <strong>{selectedTenant?.status ?? "active"}</strong>
            </article>
            <article>
              <span>Assistant ID</span>
              <strong>{selectedTenant?.publicId ?? "-"}</strong>
            </article>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Globe2 size={18} />
              <h2>Admin access</h2>
            </div>
          </div>
          <label className="field">
            <span>API base</span>
            <input
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Bootstrap token</span>
            <div className="inputIcon">
              <KeyRound size={16} />
              <input
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                autoComplete="off"
              />
            </div>
          </label>
          <div className="identityList">
            <article>
              <span>Role</span>
              <strong>{adminSession?.user.role ?? "Owner"}</strong>
            </article>
            <article>
              <span>Session</span>
              <strong>
                {connectionAttempted
                  ? (adminSession?.user.email ?? "Connected")
                  : "Locked"}
              </strong>
            </article>
          </div>
          <button
            className="primaryButton full"
            disabled={busy || (!adminToken && !adminSession)}
            type="button"
            onClick={refreshTenants}
          >
            <RefreshCw size={16} />
            Reconnect
          </button>
          {adminSession ? (
            <button
              className="secondaryButton full"
              disabled={busy}
              type="button"
              onClick={logout}
            >
              <X size={16} />
              Logout
            </button>
          ) : null}
        </section>

        {renderProjectUsers()}
      </div>
    );
  }

  function renderProjectUsers() {
    const canEdit = canManageUsers();

    return (
      <section className="panel">
        <div className="panelHeader">
          <div className="panelTitle">
            <UserCheck size={18} />
            <h2>Project users</h2>
          </div>
          <span className="countPill">{tenantUsers.length}</span>
        </div>

        <div className="userList">
          {tenantUsers.length ? (
            tenantUsers.map((user) => (
              <article key={user.id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <small>{titleCase(user.role)}</small>
              </article>
            ))
          ) : (
            <div className="emptyState compact">
              No project users visible for this session.
            </div>
          )}
        </div>

        {canEdit ? (
          <>
            <form className="authManagementForm" onSubmit={createTenantUser}>
              <div className="formGrid two">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={newUserName}
                    onChange={(event) => setNewUserName(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Role</span>
                  <select
                    value={newUserRole}
                    onChange={(event) =>
                      setNewUserRole(event.target.value as TenantRole)
                    }
                  >
                    <option value="tenant_owner">Owner</option>
                    <option value="tenant_admin">Admin</option>
                    <option value="operator">Operator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    placeholder="Optional for invite-only users"
                  />
                </label>
              </div>
              <button className="primaryButton full" disabled={busy}>
                <Save size={16} />
                Save project user
              </button>
            </form>

            <form className="authManagementForm" onSubmit={createTenantInvite}>
              <div className="formGrid two">
                <label className="field">
                  <span>Invite email</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Invite role</span>
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value as TenantRole)
                    }
                  >
                    <option value="tenant_owner">Owner</option>
                    <option value="tenant_admin">Admin</option>
                    <option value="operator">Operator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
              </div>
              <button className="secondaryButton full" disabled={busy}>
                <Plus size={16} />
                Create invite link
              </button>
            </form>

            {lastInviteUrl ? (
              <div className="webhookBox">
                <span>Invite link</span>
                <code>{lastInviteUrl}</code>
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => copyText(lastInviteUrl, "Invite link")}
                >
                  <Copy size={15} />
                  Copy
                </button>
              </div>
            ) : null}

            {tenantInvites.length ? (
              <div className="inviteList">
                {tenantInvites.slice(0, 4).map((invite) => (
                  <article key={invite.id}>
                    <strong>{invite.email}</strong>
                    <span>
                      {titleCase(invite.roleName)} · {invite.status}
                    </span>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="inlineNotice">
            <ShieldCheck size={16} />
            <span>Your role cannot view or manage project users.</span>
          </div>
        )}
      </section>
    );
  }

  function openSettingsSection(sectionId: string) {
    setActiveTab("settings");
    window.setTimeout(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openChannelsSection(sectionId: string) {
    setActiveTab("channels");
    window.setTimeout(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function renderHome() {
    return (
      <div className="workspaceStack">
        <section className="workspaceIntro homeIntro">
          <div>
            <span className="eyebrow">Command center</span>
            <h2>One place to run the assistant</h2>
            <p>
              Track what needs attention, improve the assistant knowledge, and
              keep the website assistant ready for assad-dar.de.
            </p>
          </div>
          <div className="quickActionGrid">
            <button type="button" onClick={() => setActiveTab("leads")}>
              <UserCheck size={16} />
              Inbox
            </button>
            <button type="button" onClick={() => setActiveTab("knowledge")}>
              <Database size={16} />
              Answers
            </button>
            <button type="button" onClick={() => setActiveTab("channels")}>
              <Globe2 size={16} />
              Channels
            </button>
            <button type="button" onClick={() => setActiveTab("settings")}>
              <Settings size={16} />
              Setup
            </button>
          </div>
        </section>
        {renderOverview()}
      </div>
    );
  }

  function renderLeadsWorkspace() {
    return (
      <div className="workspaceStack">
        <section className="workspaceIntro">
          <div>
            <span className="eyebrow">Customer work</span>
            <h2>Leads, messages, and handoffs</h2>
            <p>
              Every customer conversation that needs human attention now lives
              here, so the owner can answer, assign, and resolve work without
              switching tabs.
            </p>
          </div>
          <div className="workspaceIntroStats">
            <article>
              <span>Open leads</span>
              <strong>{openLeads.length}</strong>
            </article>
            <article>
              <span>Conversations</span>
              <strong>{conversations.length}</strong>
            </article>
            <article>
              <span>Handoffs</span>
              <strong>{openHandoffs.length}</strong>
            </article>
          </div>
        </section>
        {renderLeadActionCenter()}
        {renderLeads()}
        <div className="leadSupportGrid">
          {renderInbox()}
          {renderHandoffs()}
        </div>
        {renderContacts()}
      </div>
    );
  }

  function renderSettingsWorkspace() {
    return (
      <div className="workspaceStack">
        <section className="workspaceIntro">
          <div>
            <span className="eyebrow">Configuration</span>
            <h2>Assistant setup, widget, automation, and testing</h2>
            <p>
              The setup tools are grouped here so users configure the system in
              one place instead of jumping between small technical tabs.
            </p>
          </div>
          <div className="quickActionGrid">
            <button
              type="button"
              onClick={() => openSettingsSection("business-settings")}
            >
              <Sparkles size={16} />
              Profile
            </button>
            <button
              type="button"
              onClick={() => openSettingsSection("widget-settings")}
            >
              <Code2 size={16} />
              Widget
            </button>
            <button
              type="button"
              onClick={() => openSettingsSection("automation-settings")}
            >
              <Sparkles size={16} />
              Automation
            </button>
            <button
              type="button"
              onClick={() => openSettingsSection("test-settings")}
            >
              <MessageCircle size={16} />
              Test
            </button>
          </div>
        </section>

        <div id="business-settings" className="settingsSection">
          {renderSettings()}
        </div>
        <div id="widget-settings" className="settingsSection">
          {renderWidget()}
        </div>
        <div id="automation-settings" className="settingsSection">
          {renderAutomation()}
        </div>
        <div id="test-settings" className="settingsSection">
          {renderTestStudio()}
        </div>
      </div>
    );
  }

  function renderProjectOnboarding() {
    const generatedSlug = slugFromName(selfServiceProjectName);
    const effectiveSlug = selfServiceProjectSlug || generatedSlug;
    const canCreateSelfService = adminSession?.authType === "user_session";

    return (
      <div className="onboardingWorkspace">
        <section className="panel onboardingHeroPanel">
          <div className="panelHeader">
            <div className="panelTitle">
              <PhoneCall size={18} />
              <h2>Start a phone AI project</h2>
            </div>
            <span className="countPill" data-tone="warn">
              {formatCents(onboardingPrices.numberMonthlyPriceCents)}/mo
            </span>
          </div>
          <div className="phoneLineProgress" aria-hidden="true">
            <span data-active="true" />
            <span data-active="true" />
            <span />
            <span />
          </div>
          <p className="mutedCopy">
            Create the project first, choose one available number, then continue
            to Stripe. Accepted calls are billed at{" "}
            {formatCents(onboardingPrices.acceptedCallPriceCents)} each.
          </p>
        </section>

        <section className="panel onboardingActionPanel">
          {canCreateSelfService ? (
            <form className="form" onSubmit={createSelfServiceProject}>
              <label className="field">
                <span>Project name</span>
                <input
                  value={selfServiceProjectName}
                  onChange={(event) =>
                    setSelfServiceProjectName(event.target.value)
                  }
                  placeholder="Muster GmbH Kundenservice"
                />
              </label>
              <label className="field">
                <span>Slug</span>
                <input
                  value={effectiveSlug}
                  onChange={(event) =>
                    setSelfServiceProjectSlug(slugFromName(event.target.value))
                  }
                  placeholder="muster-gmbh"
                />
              </label>
              <button
                className="primaryButton"
                disabled={busy || !selfServiceProjectName || !effectiveSlug}
              >
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Plus size={16} />
                )}
                Create project
              </button>
            </form>
          ) : (
            <div className="emptyState">
              <Building2 size={22} />
              <strong>Create a tenant from the sidebar</strong>
              <span>
                Bootstrap admins can create platform tenants with the New tenant
                form. User accounts get the guided self-service flow here.
              </span>
            </div>
          )}
        </section>

        <section className="panel onboardingChecklistPanel">
          <div className="setupList onboardingSetupList">
            {[
              ["Account", Boolean(adminSession), "Login is active"],
              ["Project", false, "Create a tenant workspace"],
              ["Number", false, "Reserve a German phone number"],
              ["Payment", false, "Activate the monthly plan"],
            ].map(([label, done, detail]) => (
              <article data-done={done ? "true" : "false"} key={String(label)}>
                {done ? <CheckCircle2 size={16} /> : <RadioTower size={16} />}
                <span>{label}</span>
                <small>{detail}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderActiveTab() {
    if (!selectedTenant) {
      return renderProjectOnboarding();
    }

    if (activeTab === "home") {
      return renderHome();
    }
    if (activeTab === "knowledge") {
      return renderKnowledge();
    }
    if (activeTab === "leads") {
      return renderLeadsWorkspace();
    }
    if (activeTab === "channels") {
      return renderChannels();
    }
    return renderSettingsWorkspace();
  }

  if (!connectionAttempted && !tenants.length) {
    return (
      <main className="authShell">
        <section className="authIntro">
          <span className="eyebrow">Assaddar AI Communication</span>
          <h1>Run every customer conversation from one clear workspace.</h1>
          <p>
            Website chat, phone calls, social messaging, lead handoffs, approved
            answers, and automation stay connected for the project owner and
            operators.
          </p>
          <div className="authIntroGrid">
            <article>
              <PhoneCall size={16} />
              <span>Telephone AI</span>
            </article>
            <article>
              <MessageCircle size={16} />
              <span>Omnichannel inbox</span>
            </article>
            <article>
              <Database size={16} />
              <span>Approved knowledge</span>
            </article>
          </div>
          <a className="secondaryButton linkButton" href="/landing">
            <ExternalLink size={16} />
            View product page
          </a>
        </section>
        <section className="authPanel">
          <div className="brand large">
            <span className="brandMark">
              <Bot size={22} />
            </span>
            <div>
              <strong>{APP_CONFIG.brand.name}</strong>
              <span>Consultancy assistant admin</span>
            </div>
          </div>

          {deepLink.inviteToken ? (
            <form className="authForm" onSubmit={acceptInvite}>
              <label className="field">
                <span>Name</span>
                <input
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  autoComplete="name"
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Password</span>
                <div className="inputIcon">
                  <KeyRound size={16} />
                  <input
                    type="password"
                    value={invitePassword}
                    onChange={(event) => setInvitePassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </label>
              <button
                className="primaryButton full"
                disabled={busy || !inviteName || !invitePassword}
              >
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                Accept invite
              </button>
              {status ? (
                <span className="status authStatus" data-tone={statusKind}>
                  {statusKind === "danger" ? (
                    <AlertCircle size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {status}
                </span>
              ) : null}
            </form>
          ) : (
            <>
              <div className="segmented authModeSwitch">
                <button
                  data-active={authMode === "login" ? "true" : "false"}
                  type="button"
                  onClick={() => setAuthMode("login")}
                >
                  User login
                </button>
                <button
                  data-active={authMode === "signup" ? "true" : "false"}
                  type="button"
                  onClick={() => setAuthMode("signup")}
                >
                  Register
                </button>
                <button
                  data-active={authMode === "admin_token" ? "true" : "false"}
                  type="button"
                  onClick={() => setAuthMode("admin_token")}
                >
                  Bootstrap token
                </button>
              </div>

              {authMode === "login" ? (
                <form className="authForm" onSubmit={loginWithPassword}>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      autoComplete="email"
                      autoFocus
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <div className="inputIcon">
                      <KeyRound size={16} />
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(event) =>
                          setLoginPassword(event.target.value)
                        }
                        autoComplete="current-password"
                      />
                    </div>
                  </label>
                  {showAdvancedConnection ? (
                    <label className="field">
                      <span>API base</span>
                      <input
                        value={apiBase}
                        onChange={(event) => setApiBase(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button
                    className="primaryButton full"
                    disabled={busy || !loginEmail || !loginPassword}
                  >
                    {busy ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    Login
                  </button>
                  <button
                    className="textToggle"
                    type="button"
                    onClick={() =>
                      setShowAdvancedConnection((current) => !current)
                    }
                  >
                    {showAdvancedConnection ? "Hide advanced" : "Advanced"}
                  </button>
                  {status ? (
                    <span className="status authStatus" data-tone={statusKind}>
                      {statusKind === "danger" ? (
                        <AlertCircle size={16} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {status}
                    </span>
                  ) : null}
                </form>
              ) : authMode === "signup" ? (
                <form className="authForm" onSubmit={signUpWithPassword}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={signupName}
                      onChange={(event) => setSignupName(event.target.value)}
                      autoComplete="name"
                      autoFocus
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(event) => setSignupEmail(event.target.value)}
                      autoComplete="email"
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <div className="inputIcon">
                      <KeyRound size={16} />
                      <input
                        type="password"
                        value={signupPassword}
                        onChange={(event) =>
                          setSignupPassword(event.target.value)
                        }
                        autoComplete="new-password"
                      />
                    </div>
                  </label>
                  {showAdvancedConnection ? (
                    <label className="field">
                      <span>API base</span>
                      <input
                        value={apiBase}
                        onChange={(event) => setApiBase(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button
                    className="primaryButton full"
                    disabled={
                      busy || !signupName || !signupEmail || !signupPassword
                    }
                  >
                    {busy ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    Create account
                  </button>
                  <button
                    className="textToggle"
                    type="button"
                    onClick={() =>
                      setShowAdvancedConnection((current) => !current)
                    }
                  >
                    {showAdvancedConnection ? "Hide advanced" : "Advanced"}
                  </button>
                  {status ? (
                    <span className="status authStatus" data-tone={statusKind}>
                      {statusKind === "danger" ? (
                        <AlertCircle size={16} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {status}
                    </span>
                  ) : null}
                </form>
              ) : (
                <form
                  className="authForm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void refreshTenants();
                  }}
                >
                  <label className="field">
                    <span>Bootstrap admin token</span>
                    <div className="inputIcon">
                      <KeyRound size={16} />
                      <input
                        type="password"
                        value={adminToken}
                        onChange={(event) => setAdminToken(event.target.value)}
                        autoComplete="off"
                        autoFocus
                      />
                    </div>
                  </label>
                  {showAdvancedConnection ? (
                    <label className="field">
                      <span>API base</span>
                      <input
                        value={apiBase}
                        onChange={(event) => setApiBase(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button
                    className="primaryButton full"
                    disabled={busy || !adminToken}
                  >
                    {busy ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    Enter admin
                  </button>
                  <button
                    className="textToggle"
                    type="button"
                    onClick={() =>
                      setShowAdvancedConnection((current) => !current)
                    }
                  >
                    {showAdvancedConnection ? "Hide advanced" : "Advanced"}
                  </button>
                  {status ? (
                    <span className="status authStatus" data-tone={statusKind}>
                      {statusKind === "danger" ? (
                        <AlertCircle size={16} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {status}
                    </span>
                  ) : null}
                </form>
              )}
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="shell" data-sidebar-open={sidebarOpen ? "true" : "false"}>
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebarOverlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <AdminSidebar
        adminSession={adminSession}
        adminToken={adminToken}
        apiBase={apiBase}
        busy={busy}
        selectedTenant={selectedTenant}
        showAdvancedConnection={showAdvancedConnection}
        tenantName={tenantName}
        tenantSlug={tenantSlug}
        tenants={tenants}
        onAdminTokenChange={setAdminToken}
        onApiBaseChange={setApiBase}
        onCloseSidebar={() => setSidebarOpen(false)}
        onCreateTenant={createTenant}
        onLogout={logout}
        onRefreshTenants={refreshTenants}
        onSelectTenant={(tenantId) => {
          setSelectedTenantId(tenantId);
          setSidebarOpen(false);
        }}
        onShowAdvancedConnectionChange={setShowAdvancedConnection}
        onTenantNameChange={setTenantName}
        onTenantSlugChange={setTenantSlug}
      />

      <section className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="iconButton neutral menuButton"
            aria-label="Open navigation"
            aria-controls="primary-sidebar"
            aria-expanded={sidebarOpen ? "true" : "false"}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="titleGroup">
            <span className="eyebrow">{activeTabLabel}</span>
            <h1>{selectedTenant?.name ?? "Launch setup"}</h1>
            <p>{activeTabDescription[activeTab]}</p>
          </div>
          <span
            className="status"
            data-tone={statusKind}
            role="status"
            aria-live="polite"
          >
            {statusKind === "danger" ? (
              <AlertCircle size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {status || "Ready"}
          </span>
        </header>

        <nav className="tabBar" aria-label="Workspace tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                data-active={activeTab === tab.key ? "true" : "false"}
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {renderActiveTab()}
      </section>

      {renderLeadDetailDrawer()}

      {confirmDeleteItem ? (
        <DeleteKnowledgeModal
          item={confirmDeleteItem}
          busy={busy}
          onCancel={() => setConfirmDeleteItem(null)}
          onConfirm={() => deleteKnowledge(confirmDeleteItem)}
        />
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
