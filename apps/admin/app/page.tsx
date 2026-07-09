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
  Eye,
  EyeOff,
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
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { APP_CONFIG } from "./config";
import { AdminSidebar } from "./AdminSidebar";
import { DeleteKnowledgeModal } from "./DeleteKnowledgeModal";
import { DashboardMetrics } from "./DashboardMetrics";
import { AnalyticsPanel } from "./AnalyticsPanel";
import {
  OperationalHealthPanel,
  ProductionReadinessPanel,
  SetupChecklistPanel,
} from "./LaunchHealthPanels";
import { OneBrainSyncPanel } from "./OneBrainSyncPanel";
import {
  AnswerQualityPanel,
  BusinessReadinessPanel,
  NeedsAttentionPanel,
  RecentConversationsPanel,
  TodayFocusSummary,
  TrafficFunnelPanel,
} from "./OverviewPerformancePanels";
import {
  FocusSummaryGrid,
  InlineDisclosure,
  SectionSwitch,
  WorkspaceDisclosure,
  type SectionSwitchItem,
} from "./WorkspaceUi";
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
  isForbiddenAccessError,
  readFileAsBase64,
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
  AuthMode,
} from "./page-types";
import { ToastStack } from "./ToastStack";
import {
  authModeOrder,
  authModeTabIds,
  businessKnowledgeChecks,
  channelExperienceDetails,
  channelImplementationGuides,
  leadFieldOptions,
  listPageSize,
  pipelineStages,
  sampleQuestions,
} from "./page-constants";

// App-wide constants are consolidated in ./config (APP_CONFIG). These aliases
// keep the existing references throughout this file readable and unchanged.
const defaultApiBase = APP_CONFIG.api.base;
const defaultSiteUrl = APP_CONFIG.siteUrl;

type SettingsSectionId =
  | "business-settings"
  | "widget-settings"
  | "number-settings"
  | "automation-settings"
  | "test-settings";

type ChannelsSectionId =
  | "channel-overview"
  | "telephone-channel-setup"
  | "connect-channels"
  | "whatsapp-operations";
export default function DashboardPage() {
  const [deepLink] = useState<AdminDeepLink>(() => readAdminDeepLink());
  const [apiBase, setApiBase] = useState(defaultApiBase);
  const [adminToken, setAdminToken] = useState("");
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [visibleSecrets, setVisibleSecrets] = useState({
    adminToken: false,
    invite: false,
    login: false,
    signup: false,
  });
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
  const [oneBrainSync, setOneBrainSync] =
    useState<DashboardBootstrap["oneBrainSync"]>(null);
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
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("business-settings");
  const [activeChannelsSection, setActiveChannelsSection] =
    useState<ChannelsSectionId>("channel-overview");
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
  const [lastPortalLink, setLastPortalLink] = useState("");
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
  const [personalDataAccessDenied, setPersonalDataAccessDenied] =
    useState(false);
  // Mobile navigation: toggles the sidebar into a slide-in drawer on small screens.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, pushToast, dismissToast } = useToasts();
  const copiedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceRefreshId = useRef(0);
  const inFlightGetRequests = useRef(new Map<string, Promise<unknown>>());
  const latestRequestIds = useRef<Record<string, number>>({});

  function beginLatestRequest(key: string) {
    const next = (latestRequestIds.current[key] ?? 0) + 1;
    latestRequestIds.current[key] = next;
    return next;
  }

  function isLatestRequest(key: string, id: number) {
    return latestRequestIds.current[key] === id;
  }
  const debouncedKnowledgeSearch = useDebouncedValue(knowledgeSearch);
  const debouncedInboxSearch = useDebouncedValue(inboxSearch);
  const debouncedContactSearch = useDebouncedValue(contactSearch);

  const normalizedApiBase = normalizeBaseUrl(apiBase);
  const selectedTenant = useMemo(
    () =>
      tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
    [selectedTenantId, tenants],
  );
  const selectedTenantMemberLoginEmail =
    selectedTenant?.slug === "assad-dar-ai-consultancy"
      ? "assad.dar@gmail.com"
      : "";
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
  const conversationSummaryCount =
    analytics?.conversations ?? conversations.length;
  const openHandoffSummaryCount =
    analytics?.openHandoffs ?? openHandoffs.length;
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
    conversationsCount: conversationSummaryCount,
    openHandoffsCount: openHandoffSummaryCount,
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
  type CommandTone = "urgent" | "warn" | "info";
  type CommandItem = {
    tone: CommandTone;
    title: string;
    detail: string;
    tab: TabKey;
    impact: string;
    reward: string;
    source: string;
    action?: () => void;
  };
  type ScoreGuide = {
    label: string;
    score: number;
    action: string;
    tab: TabKey;
    sectionId?: string | undefined;
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
          action: () => {
            setActiveTab("leads");
            openLeadDetail(openLeads[0]!);
          },
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
          action: () => {
            setActiveTab("leads");
            openLeadDetail(staleLeads[0]!);
          },
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
          action: () => {
            draftFaqFromUnanswered(unansweredQuestions[0]!);
            openWorkspaceSection("knowledge", "knowledge-manager");
          },
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
          action: () => openWorkspaceSection("knowledge", "knowledge-manager"),
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
          action: () => openWorkspaceSection("settings", "widget-settings"),
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
          action: () => openWorkspaceSection("settings", "widget-settings"),
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
          action: () =>
            openWorkspaceSection("channels", "telephone-channel-setup"),
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
          action: () => openWorkspaceSection("settings", "automation-settings"),
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
          action: () => openWorkspaceSection("settings", "test-settings"),
        }
      : null,
  ].filter(Boolean) as CommandItem[];

  const setupSteps = [
    {
      label: "Login",
      done: Boolean(adminToken || adminSession),
      action: "Sign in",
      tab: "settings" as TabKey,
      sectionId: "business-settings",
    },
    {
      label: "API connection",
      done: tenants.length > 0,
      action: "Connect",
      tab: "settings" as TabKey,
      sectionId: "business-settings",
    },
    {
      label: "Tenant",
      done: Boolean(selectedTenant),
      action: "Select tenant",
      tab: "settings" as TabKey,
      sectionId: "business-settings",
    },
    {
      label: "Business profile",
      done: Boolean(selectedTenant?.defaultLocale || selectedTenant?.theme),
      action: "Save settings",
      tab: "settings" as TabKey,
      sectionId: "business-settings",
    },
    {
      label: "Knowledge",
      done: knowledge.length > 0,
      action: "Add FAQ",
      tab: "knowledge" as TabKey,
      sectionId: "knowledge-manager",
    },
    {
      label: "Test answer",
      done: Boolean(testAnswer),
      action: "Run test",
      tab: "settings" as TabKey,
      sectionId: "test-settings",
    },
    {
      label: "Widget",
      done: Boolean(installCheck?.installed),
      action: "Verify install",
      tab: "settings" as TabKey,
      sectionId: "widget-settings",
    },
    {
      label: "Channels",
      done: connectedChannelCount > 1,
      action: "Connect phone or Meta",
      tab: "channels" as TabKey,
      sectionId: "connect-channels",
    },
    {
      label: "Automation",
      done: Boolean(
        automationSettings.ownerLeadEmailEnabled &&
        automationSettings.autoQualifyReadinessEnabled,
      ),
      action: "Review rules",
      tab: "settings" as TabKey,
      sectionId: "automation-settings",
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
      sectionId: "business-settings",
    },
    {
      label: "Answer quality",
      score: answerQualityScore,
      action:
        unansweredQuestions.length || missingKnowledgeChecks.length
          ? "Draft the next approved FAQ."
          : "Test fresh buyer questions weekly.",
      tab: "knowledge" as TabKey,
      sectionId: "knowledge-manager",
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
      sectionId:
        openLeads.length || staleLeads.length ? undefined : "test-settings",
    },
    {
      label: "Channel coverage",
      score: channelReadinessScore,
      action:
        channelReadinessScore >= 100
          ? "Monitor delivery and handoffs."
          : "Connect the next customer channel.",
      tab: "channels" as TabKey,
      sectionId: "connect-channels",
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
    action: () =>
      suggestion.category === "whatsapp"
        ? openWorkspaceSection("channels", "connect-channels")
        : setActiveTab("leads"),
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
    const persistedSipConfigured = settingBoolean(
      settings.sipConfigured,
      false,
    );

    setPhoneNumberOrdered(
      settingBoolean(
        checklist.numberOrdered,
        Boolean(telephoneConnection.externalAccountId),
      ),
    );
    setPhoneSipConfigured(
      settingBoolean(checklist.sipConfigured, persistedSipConfigured),
    );
    setNewNumberCountry(settingString(settings.requestedCountry) ?? "DE");
    const persistedNumberType = settingString(settings.numberType);
    setNewNumberType(
      persistedNumberType === "mobile" || persistedNumberType === "toll-free"
        ? persistedNumberType
        : "local",
    );
    setNewNumberAreaCode(settingString(settings.areaCode) ?? "");
    setNewNumberLocality(settingString(settings.locality) ?? "");
    setOrderedPhoneNumber(
      settingString(settings.orderedNumber) ??
        settingString(settings.phoneNumber) ??
        "",
    );
    setNewNumberSipRegistrar(settingString(settings.sipRegistrar) ?? "");
    setNewNumberSipUsername(settingString(settings.sipUsername) ?? "");
    setNewNumberSipConfigured(persistedSipConfigured);
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
        const error = new Error(
          body || `${response.status} ${response.statusText}`,
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
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
      const session = await apiFetch<AdminSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      setAdminToken("");
      window.sessionStorage.removeItem("assaddar_admin_token");
      window.localStorage.removeItem("assaddar_admin_token");
      setAdminSession(session);
      setConnectionAttempted(true);
      setLoginPassword("");
      const nextTenants = await apiFetch<Tenant[]>("/admin/tenants");
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

    setBusy(true);
    try {
      const session = await apiFetch<AdminSession>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          password: signupPassword,
        }),
      });
      setLoginEmail(signupEmail);
      setAdminToken("");
      window.sessionStorage.removeItem("assaddar_admin_token");
      window.localStorage.removeItem("assaddar_admin_token");
      setAdminSession(session);
      setConnectionAttempted(true);
      setSignupName("");
      setSignupEmail("");
      setSignupPassword("");
      const nextTenants = await apiFetch<Tenant[]>("/admin/tenants");
      setTenants(nextTenants);
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
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Local cleanup still matters even if the network request fails.
    } finally {
      setAdminSession(null);
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
      setOneBrainSync(null);
      setWorkflowSuggestions(null);
      setTenantUsers([]);
      setTenantInvites([]);
      setChannelAccountDrafts({});
      setWorkspaceLoading(false);
      setPersonalDataAccessDenied(false);
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
      setOneBrainSync(bootstrap.oneBrainSync);
      setUnansweredQuestions(bootstrap.unansweredQuestions);
      setWorkflowSuggestions(bootstrap.workflowSuggestions);
      setProductionReadiness(bootstrap.productionReadiness);
      setPersonalDataAccessDenied(false);
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
        if (isForbiddenAccessError(error)) {
          setPersonalDataAccessDenied(true);
          setConversations([]);
          setUnifiedInbox([]);
          setContacts([]);
          setHandoffs([]);
          setConversationMessages([]);
          setInboxHasMore(false);
          setContactsHasMore(false);
          setHandoffsHasMore(false);
          setSelectedConversationId("");
          setStatus("Conversation text is hidden for this session.");
          try {
            const result = await apiFetch<TenantAnalytics>(
              `/admin/tenants/${tenantId}/analytics`,
            );
            if (workspaceRefreshId.current === refreshId) {
              setAnalytics(result);
            }
          } catch {
            // The access notice is more useful here than a second aggregate error.
          }
        } else {
          setPersonalDataAccessDenied(false);
          setStatus(readableError(error));
        }
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
      beginLatestRequest("knowledge");
      setKnowledge([]);
      setKnowledgeHasMore(false);
      return;
    }

    const requestId = beginLatestRequest("knowledge");
    try {
      const items = await apiFetch<KnowledgeItem[]>(
        buildListPath(`/admin/tenants/${tenantId}/knowledge`, {
          offset: options.offset ?? 0,
          q: debouncedKnowledgeSearch,
          status: knowledgeStatusFilter,
        }),
      );
      if (!isLatestRequest("knowledge", requestId)) {
        return;
      }
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
      beginLatestRequest("knowledge-suggestions");
      setKnowledgeSuggestions([]);
      return;
    }

    const requestId = beginLatestRequest("knowledge-suggestions");
    try {
      const items = await apiFetch<KnowledgeSuggestion[]>(
        buildListPath(`/admin/tenants/${tenantId}/knowledge/suggestions`, {
          status: "pending",
        }),
      );
      if (!isLatestRequest("knowledge-suggestions", requestId)) {
        return;
      }
      setKnowledgeSuggestions(items);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshKnowledgeIngestionJobs(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      beginLatestRequest("knowledge-ingestion-jobs");
      setKnowledgeIngestionJobs([]);
      return;
    }

    const requestId = beginLatestRequest("knowledge-ingestion-jobs");
    try {
      const items = await apiFetch<KnowledgeIngestionJob[]>(
        buildListPath(`/admin/tenants/${tenantId}/knowledge/ingestion-jobs`, {
          limit: 8,
        }),
      );
      if (!isLatestRequest("knowledge-ingestion-jobs", requestId)) {
        return;
      }
      setKnowledgeIngestionJobs(items);
    } catch (error) {
      setStatus(readableError(error));
    }
  }

  async function refreshAnalytics(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      beginLatestRequest("analytics");
      setAnalytics(null);
      return;
    }

    const requestId = beginLatestRequest("analytics");
    try {
      const result = await apiFetch<TenantAnalytics>(
        `/admin/tenants/${tenantId}/analytics`,
      );
      if (!isLatestRequest("analytics", requestId)) {
        return;
      }
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
      beginLatestRequest("conversations");
      setConversations([]);
      return;
    }

    const requestId = beginLatestRequest("conversations");
    try {
      const items = await apiFetch<Conversation[]>(
        buildListPath(`/admin/tenants/${tenantId}/conversations`, {
          offset: options.offset ?? 0,
          q: debouncedInboxSearch,
        }),
      );
      if (!isLatestRequest("conversations", requestId)) {
        return;
      }
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
      setPersonalDataAccessDenied(false);
    } catch (error) {
      if (isForbiddenAccessError(error)) {
        setPersonalDataAccessDenied(true);
        setConversations([]);
        setSelectedConversationId("");
        setStatus("Conversation text is hidden for this session.");
      } else {
        setStatus(readableError(error));
      }
    }
  }

  async function refreshUnifiedInbox(
    tenantId = selectedTenant?.id,
    options: { offset?: number; append?: boolean } = {},
  ) {
    if (!tenantId) {
      beginLatestRequest("unified-inbox");
      setUnifiedInbox([]);
      setInboxHasMore(false);
      return;
    }

    const requestId = beginLatestRequest("unified-inbox");
    try {
      const items = await apiFetch<UnifiedInboxItem[]>(
        buildListPath(`/admin/tenants/${tenantId}/inbox`, {
          offset: options.offset ?? 0,
          q: debouncedInboxSearch,
        }),
      );
      if (!isLatestRequest("unified-inbox", requestId)) {
        return;
      }
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
      setPersonalDataAccessDenied(false);
    } catch (error) {
      setUnifiedInbox([]);
      setInboxHasMore(false);
      if (isForbiddenAccessError(error)) {
        setPersonalDataAccessDenied(true);
      }
    }
  }

  async function refreshContacts(
    tenantId = selectedTenant?.id,
    options: { offset?: number; append?: boolean } = {},
  ) {
    if (!tenantId) {
      beginLatestRequest("contacts");
      setContacts([]);
      setContactsHasMore(false);
      return;
    }

    const requestId = beginLatestRequest("contacts");
    try {
      const items = await apiFetch<ContactProfile[]>(
        buildListPath(`/admin/tenants/${tenantId}/contacts`, {
          offset: options.offset ?? 0,
          q: debouncedContactSearch,
        }),
      );
      if (!isLatestRequest("contacts", requestId)) {
        return;
      }
      setContacts((current) =>
        options.append ? [...current, ...items] : items,
      );
      setContactsHasMore(items.length === listPageSize);
      setPersonalDataAccessDenied(false);
    } catch (error) {
      setContacts([]);
      setContactsHasMore(false);
      if (isForbiddenAccessError(error)) {
        setPersonalDataAccessDenied(true);
      }
    }
  }

  async function refreshConversationMessages(
    tenantId: string,
    conversationId: string,
  ) {
    const requestId = beginLatestRequest("conversation-messages");
    try {
      const items = await apiFetch<ConversationMessage[]>(
        `/admin/tenants/${tenantId}/conversations/${conversationId}/messages`,
      );
      if (
        !isLatestRequest("conversation-messages", requestId) ||
        selectedConversationId !== conversationId
      ) {
        return;
      }
      setConversationMessages(items);
      setPersonalDataAccessDenied(false);
    } catch (error) {
      if (isForbiddenAccessError(error)) {
        setConversationMessages([]);
        setPersonalDataAccessDenied(true);
        setStatus("Conversation text is hidden for this session.");
      } else {
        setStatus(readableError(error));
      }
    }
  }

  async function refreshHandoffs(
    tenantId = selectedTenant?.id,
    options: { offset?: number; append?: boolean } = {},
  ) {
    if (!tenantId) {
      beginLatestRequest("handoffs");
      setHandoffs([]);
      setHandoffsHasMore(false);
      return;
    }

    const requestId = beginLatestRequest("handoffs");
    try {
      const items = await apiFetch<Handoff[]>(
        buildListPath(`/admin/tenants/${tenantId}/handoffs`, {
          offset: options.offset ?? 0,
          q: debouncedInboxSearch,
        }),
      );
      if (!isLatestRequest("handoffs", requestId)) {
        return;
      }
      setHandoffs((current) =>
        options.append ? [...current, ...items] : items,
      );
      setHandoffsHasMore(items.length === listPageSize);
      setPersonalDataAccessDenied(false);
    } catch (error) {
      if (isForbiddenAccessError(error)) {
        setPersonalDataAccessDenied(true);
        setHandoffs([]);
        setHandoffsHasMore(false);
        setStatus("Conversation text is hidden for this session.");
      } else {
        setStatus(readableError(error));
      }
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

  async function applyAssadPlaybook() {
    if (!canManageTenantSettings()) {
      setStatus("Your role cannot apply tenant playbooks.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{
        applied: { theme: boolean; faqs: number };
      }>(`/admin/tenants/${selectedTenant.id}/playbooks/apply`, {
        method: "POST",
        body: JSON.stringify({
          playbookKey: "assad_dar_ai_consultancy",
          confirmed: true,
          overwrite: false,
        }),
      });
      await refreshWorkspace(selectedTenant.id);
      setStatus(
        `Playbook applied: ${result.applied.faqs} FAQs, theme ${
          result.applied.theme ? "updated" : "unchanged"
        }`,
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createCustomerPortalLink() {
    if (!canManageTenantSettings()) {
      setStatus("Your role cannot create customer portal links.");
      return;
    }
    if (!selectedTenant || !selectedInboxItem) {
      setStatus("Select a conversation before creating a portal link.");
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ url: string; token: string }>(
        `/admin/tenants/${selectedTenant.id}/portal-links`,
        {
          method: "POST",
          body: JSON.stringify({
            conversationId: selectedInboxItem.id,
            contactId: selectedInboxItem.contact?.id ?? null,
            scope: "conversation",
            expiresInDays: 14,
          }),
        },
      );
      setLastPortalLink(result.url);
      await copyText(result.url, "Customer portal link");
      setStatus("Customer portal link created");
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

  async function draftKnowledgeSuggestionAnswer(item: KnowledgeSuggestion) {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot draft knowledge answers.");
      return;
    }
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const updated = await apiFetch<KnowledgeSuggestion>(
        `/admin/tenants/${selectedTenant.id}/knowledge/suggestions/${item.id}/draft`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      await refreshKnowledgeSuggestions(selectedTenant.id);
      // Open the editor prefilled with the AI draft so it is reviewed and edited
      // before it can be approved into the shared brain.
      startSuggestionEdit(updated);
      setStatus("Draft answer generated — review and edit before approving.");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function bulkDraftKnowledgeSuggestions() {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot draft knowledge answers.");
      return;
    }
    if (!selectedTenant) {
      return;
    }
    const suggestionIds = knowledgeSuggestions
      .filter(
        (item) =>
          !item.suggestedAnswer &&
          (item.suggestedQuestion || item.suggestedTitle),
      )
      .map((item) => item.id);
    if (!suggestionIds.length) {
      setStatus("No loaded suggestions need a draft.");
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ drafted: number; failed: number }>(
        `/admin/tenants/${selectedTenant.id}/knowledge/suggestions/bulk-draft`,
        {
          method: "POST",
          body: JSON.stringify({ suggestionIds }),
        },
      );
      await refreshKnowledgeSuggestions(selectedTenant.id);
      setStatus(`${result.drafted} drafts generated, ${result.failed} failed`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function bulkApproveKnowledgeSuggestions() {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot approve knowledge suggestions.");
      return;
    }
    if (!selectedTenant) {
      return;
    }
    const suggestionIds = knowledgeSuggestions
      .filter(
        (item) =>
          item.suggestedAnswer &&
          (item.suggestedQuestion || item.suggestedTitle),
      )
      .map((item) => item.id);
    if (!suggestionIds.length) {
      setStatus("No loaded suggestions are ready to approve.");
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ approved: number; failed: number }>(
        `/admin/tenants/${selectedTenant.id}/knowledge/suggestions/bulk-approve`,
        {
          method: "POST",
          body: JSON.stringify({ suggestionIds }),
        },
      );
      cancelSuggestionEdit();
      await Promise.all([
        refreshKnowledge(selectedTenant.id),
        refreshKnowledgeSuggestions(selectedTenant.id),
        refreshAnalytics(selectedTenant.id),
        refreshWorkflowSuggestions(selectedTenant.id),
      ]);
      setStatus(
        `${result.approved} suggestions approved, ${result.failed} failed`,
      );
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function bulkRejectKnowledgeSuggestions() {
    if (!canManageKnowledge()) {
      setStatus("Your role cannot reject knowledge suggestions.");
      return;
    }
    if (!selectedTenant || !knowledgeSuggestions.length) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ rejected: number; failed: number }>(
        `/admin/tenants/${selectedTenant.id}/knowledge/suggestions/bulk-reject`,
        {
          method: "POST",
          body: JSON.stringify({
            suggestionIds: knowledgeSuggestions.map((item) => item.id),
            reviewNote: "Rejected in bulk from Knowledge review.",
          }),
        },
      );
      cancelSuggestionEdit();
      await refreshKnowledgeSuggestions(selectedTenant.id);
      setStatus(
        `${result.rejected} suggestions rejected, ${result.failed} failed`,
      );
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
          calls={analytics?.voice?.calls ?? 0}
          contacts={knownContactCount}
          leads={analytics?.leads ?? leadHandoffs.length}
          knowledge={analytics?.approvedKnowledge ?? knowledge.length}
          openHandoffs={analytics?.openHandoffs ?? openHandoffs.length}
          unanswered={unansweredCount}
          onOpenAnswers={() =>
            openWorkspaceSection("knowledge", "knowledge-manager")
          }
          onOpenInbox={() => setActiveTab("leads")}
        />
        <AnalyticsPanel analytics={analytics} />
      </>
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
            onClick={() => runCommandAction(primaryCommand)}
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
        {secondaryCommands.length || weakestScoreGuide ? (
          <InlineDisclosure
            title="More actions"
            detail={`${secondaryCommands.length + (weakestScoreGuide ? 1 : 0)} available`}
          >
            <div className="commandGrid">
              {secondaryCommands.map((action) => (
                <button
                  className="actionItem"
                  data-tone={action.tone}
                  key={`${action.source}-${action.title}`}
                  type="button"
                  onClick={() => runCommandAction(action)}
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
                onClick={() =>
                  openWorkspaceSection(
                    weakestScoreGuide.tab,
                    weakestScoreGuide.sectionId,
                  )
                }
              >
                <span>Best score lift</span>
                <strong>{weakestScoreGuide.label}</strong>
                <small>{weakestScoreGuide.action}</small>
              </button>
            ) : null}
          </InlineDisclosure>
        ) : null}
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

  function readinessActionSection(checkId: string) {
    if (checkId.startsWith("provider.") || checkId.startsWith("voice.")) {
      return "telephone-channel-setup";
    }
    if (checkId.startsWith("ai.")) {
      return "knowledge-manager";
    }
    if (checkId.startsWith("handoff.")) {
      return undefined;
    }
    return "business-settings";
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
                  openWorkspaceSection(
                    suggestion.category === "whatsapp" ? "channels" : "leads",
                    suggestion.category === "whatsapp"
                      ? "connect-channels"
                      : undefined,
                  )
                }
              >
                <span>{suggestion.priority}</span>
                <strong>{suggestion.title}</strong>
                <small>{suggestion.detail}</small>
              </button>
            ))
          ) : (
            <button
              className="plainListButton"
              type="button"
              onClick={() =>
                openWorkspaceSection("settings", "automation-settings")
              }
            >
              <strong>No automation recommendations yet</strong>
              <span>Review automation rules.</span>
            </button>
          )}
        </div>
      </section>
    );
  }

  function renderOverview() {
    return (
      <div className="workspaceStack">
        {renderCommandQueue()}
        <TodayFocusSummary
          channelConnectionCount={channelConnections.length}
          channelReadinessScore={channelReadinessScore}
          connectedChannelCount={connectedChannelCount}
          knowledgeGapCount={
            unansweredTopicGroups.length + missingKnowledgeChecks.length
          }
          openLeadCount={openLeads.length}
          setupCompletion={setupCompletion}
          staleLeadCount={staleLeads.length}
          onOpenChannels={() => openChannelsSection("channel-overview")}
          onOpenKnowledge={() =>
            openWorkspaceSection("knowledge", "knowledge-manager")
          }
          onOpenLeads={() => setActiveTab("leads")}
          onOpenSettings={() => openSettingsSection("business-settings")}
        />

        <WorkspaceDisclosure
          title="Launch health"
          detail={`${setupCompletion}% setup / ${channelReadinessScore}% channels`}
          bodyClassName="launchHealthGrid"
        >
          <ProductionReadinessPanel
            productionReadiness={productionReadiness}
            onOpenCheck={(checkId) =>
              openWorkspaceSection(
                readinessActionTab(checkId),
                readinessActionSection(checkId),
              )
            }
          />
          <SetupChecklistPanel
            completedSteps={completedSteps}
            setupSteps={setupSteps}
            onOpenStep={(step) =>
              openWorkspaceSection(step.tab as TabKey, step.sectionId)
            }
          />
          <OperationalHealthPanel
            averageLeadScore={averageLeadScore}
            channelReadinessScore={channelReadinessScore}
            dueLeadsCount={dueLeads.length}
            hotLeadsCount={hotLeads.length}
            knowledgeGapCount={
              unansweredTopicGroups.length + missingKnowledgeChecks.length
            }
          />
        </WorkspaceDisclosure>

        <WorkspaceDisclosure
          title="Performance details"
          detail="Metrics, funnel, quality, and recommendations"
        >
          {renderMetrics()}
          {renderProgressionPanel()}
          <div className="overviewGrid">
            {renderWorkflowSuggestions()}
            <BusinessReadinessPanel
              businessKnowledgeChecks={businessKnowledgeChecks}
              missingKnowledgeChecks={missingKnowledgeChecks}
            />
            <NeedsAttentionPanel
              openHandoffSummaryCount={openHandoffSummaryCount}
              openHandoffs={openHandoffs}
              personalDataAccessDenied={personalDataAccessDenied}
              onOpenHandoff={(handoff) => {
                setActiveTab("leads");
                openLeadDetail(handoff);
              }}
              onOpenTest={() =>
                openWorkspaceSection("settings", "test-settings")
              }
            />
            <RecentConversationsPanel
              conversationSummaryCount={conversationSummaryCount}
              conversations={conversations}
              personalDataAccessDenied={personalDataAccessDenied}
              onOpenConversation={(conversation) => {
                setSelectedConversationId(conversation.id);
                setActiveTab("leads");
              }}
              onOpenTest={() =>
                openWorkspaceSection("settings", "test-settings")
              }
            />
            <TrafficFunnelPanel
              chatOutcomeCount={chatOutcomeCount}
              ctaClickCount={ctaClickCount}
              leadConversionRate={leadConversionRate}
              quickReplyCount={quickReplyCount}
              widgetOpenCount={widgetOpenCount}
            />
            <AnswerQualityPanel
              answeredCount={answeredCount}
              leadHandoffCount={leadHandoffs.length}
              unansweredCount={unansweredCount}
              unansweredRate={unansweredRate}
              wonLeadCount={wonLeadCount}
            />
          </div>
        </WorkspaceDisclosure>
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
            <h2>Suggested answers</h2>
          </div>
          <div className="rowActions">
            <span className="countPill">{knowledgeSuggestions.length}</span>
            <button
              className="secondaryButton"
              type="button"
              disabled={
                busy || !canEditKnowledge || !knowledgeSuggestions.length
              }
              onClick={bulkDraftKnowledgeSuggestions}
            >
              <Sparkles size={15} />
              Draft all
            </button>
            <button
              className="primaryButton"
              type="button"
              disabled={
                busy || !canEditKnowledge || !knowledgeSuggestions.length
              }
              onClick={bulkApproveKnowledgeSuggestions}
            >
              <CheckCircle2 size={15} />
              Approve all
            </button>
            <button
              className="dangerButton"
              type="button"
              disabled={
                busy || !canEditKnowledge || !knowledgeSuggestions.length
              }
              onClick={bulkRejectKnowledgeSuggestions}
            >
              <X size={15} />
              Reject all
            </button>
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
          <button
            className="plainListButton"
            type="button"
            disabled={busy || !canEditKnowledge}
            onClick={scanInteractionsForKnowledge}
          >
            <strong>No suggested answers yet</strong>
            <span>Scan recent conversations.</span>
          </button>
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
                        {!item.suggestedAnswer && (
                          <button
                            className="secondaryButton"
                            type="button"
                            disabled={
                              busy ||
                              !canEditKnowledge ||
                              !(item.suggestedQuestion || item.suggestedTitle)
                            }
                            onClick={() => draftKnowledgeSuggestionAnswer(item)}
                          >
                            <Sparkles size={15} />
                            Draft answer
                          </button>
                        )}
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
        <OneBrainSyncPanel status={oneBrainSync} />
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
                <h2>Knowledge gaps</h2>
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
              <button
                className="plainListButton"
                type="button"
                onClick={() =>
                  openWorkspaceSection("settings", "test-settings")
                }
              >
                <strong>No repeated knowledge gaps detected</strong>
                <span>Run a test question.</span>
              </button>
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
            <h2>Work now</h2>
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
              <h2>Captured leads</h2>
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
            ) : personalDataAccessDenied ? (
              <div className="emptyState">
                Lead details are hidden for this session.
              </div>
            ) : (
              <button
                className="plainListButton"
                type="button"
                onClick={() =>
                  openWorkspaceSection("settings", "widget-settings")
                }
              >
                <strong>No leads yet</strong>
                <span>Enable lead capture in widget settings.</span>
              </button>
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
              {personalDataAccessDenied
                ? "Contact profiles are hidden for this session."
                : "Contacts appear after website leads, WhatsApp messages, or calls."}
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
            <h2>Customer conversations</h2>
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
              ) : personalDataAccessDenied ? (
                <div className="emptyState compact">
                  Conversation list hidden for this session.
                </div>
              ) : (
                <button
                  className="plainListButton"
                  type="button"
                  onClick={() =>
                    openWorkspaceSection("settings", "test-settings")
                  }
                >
                  <strong>No conversations yet</strong>
                  <span>Send a test message.</span>
                </button>
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
                      <span>Audio</span>
                      <strong>Not stored</strong>
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
              <div className="emptyState">
                {personalDataAccessDenied
                  ? "Conversation transcripts are hidden for this session."
                  : "Select a conversation."}
              </div>
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
          ) : personalDataAccessDenied ? (
            <div className="emptyState">
              Handoff requests are hidden for this session.
            </div>
          ) : (
            <button
              className="plainListButton"
              type="button"
              onClick={() => openWorkspaceSection("settings", "test-settings")}
            >
              <strong>No handoff requests in this view</strong>
              <span>Test a question that should reach a human.</span>
            </button>
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
              <strong>{lastPortalLink || customerPortalPreview.url}</strong>
            </div>
            <button
              className="primaryButton"
              type="button"
              disabled={busy || !canEditSettings || !selectedInboxItem}
              onClick={createCustomerPortalLink}
            >
              <Link2 size={16} />
              Create
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                copyText(
                  lastPortalLink || customerPortalPreview.url,
                  "Customer portal link",
                )
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
    const channelSections: Array<SectionSwitchItem<ChannelsSectionId>> = [
      { id: "channel-overview", label: "Overview", icon: <Globe2 size={16} /> },
      {
        id: "telephone-channel-setup",
        label: "Telephone",
        icon: <PhoneCall size={16} />,
      },
      {
        id: "connect-channels",
        label: "Messaging",
        icon: <MessageCircle size={16} />,
      },
      {
        id: "whatsapp-operations",
        label: "WhatsApp",
        icon: <MessageSquare size={16} />,
      },
    ];

    const renderChannelOverview = () => (
      <>
        <FocusSummaryGrid
          ariaLabel="Channel summary"
          items={[
            {
              label: "Channels",
              value: channelConnections.length,
              detail: "Available customer channels",
              onClick: () => openChannelsSection("connect-channels"),
            },
            {
              label: "Connected",
              value: connectedChannelCount,
              detail: "Ready to receive messages",
              tone: connectedChannelCount ? "good" : "neutral",
              onClick: () => openChannelsSection("connect-channels"),
            },
            {
              label: "Messaging",
              value: messagingChannelsReady,
              detail: "WhatsApp, Messenger, Instagram, Telegram, Email",
              onClick: () => openChannelsSection("connect-channels"),
            },
            {
              label: "Telephone",
              value:
                telephoneConnection?.status === "connected" ? "Ready" : "Setup",
              detail: "Phone AI setup",
              tone:
                telephoneConnection?.status === "connected" ? "good" : "warn",
              onClick: () => openChannelsSection("telephone-channel-setup"),
            },
          ]}
        />

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

        {canManagePlatformBilling() ? (
          <WorkspaceDisclosure
            title="Billing and number inventory"
            detail="Platform-owner tools"
          >
            {renderSelfServiceBillingPanel()}
          </WorkspaceDisclosure>
        ) : null}
      </>
    );

    const renderChannelConnections = () => (
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

                  <details
                    className="channelSetupDetails"
                    open={isWebsite || connection.status !== "connected"}
                  >
                    <summary>
                      <span>Setup details</span>
                      <small>{channelNextAction(connection)}</small>
                    </summary>

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
                        onClick={() =>
                          openWorkspaceSection("settings", "widget-settings")
                        }
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
                  </details>
                </article>
              );
            })}
        </div>
      </section>
    );

    return (
      <div className="workspaceStack">
        <section className="workspaceIntro">
          <div>
            <span className="eyebrow">Channels</span>
            <h2>Connect one channel at a time</h2>
            <p>
              Start with the website assistant, then phone, then messaging.
              Technical setup stays inside each selected channel.
            </p>
          </div>
          <SectionSwitch
            activeId={activeChannelsSection}
            items={channelSections}
            onSelect={openChannelsSection}
          />
        </section>

        {activeChannelsSection === "channel-overview"
          ? renderChannelOverview()
          : null}
        {activeChannelsSection === "telephone-channel-setup"
          ? renderTelephoneSetup(telephoneConnection)
          : null}
        {activeChannelsSection === "connect-channels"
          ? renderChannelConnections()
          : null}
        {activeChannelsSection === "whatsapp-operations" ? (
          <div id="whatsapp-operations">{renderWhatsappOperations()}</div>
        ) : null}
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
    const liveTraffic = connection?.liveTraffic;
    const liveRecentCount = Math.max(
      liveTraffic?.recentConversationCount ?? 0,
      recentTelephoneConversations.length,
    );
    const liveTrafficSeen = Boolean(
      liveTraffic?.latestCallAt || liveRecentCount,
    );
    const latestLiveCallLabel = liveTraffic?.latestCallAt
      ? `Last ${formatDate(liveTraffic.latestCallAt)}`
      : liveRecentCount
        ? `${liveRecentCount} recent conversations`
        : "Waiting for first call";
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
          <div className="panelHeaderActions">
            <span
              className="countPill"
              data-tone={connection?.status === "connected" ? "good" : "warn"}
            >
              Setup {connection?.status ?? "pending"}
            </span>
            <span
              className="countPill"
              data-tone={liveTrafficSeen ? "good" : "warn"}
            >
              {liveTrafficSeen ? "Live traffic" : "No calls"}
            </span>
          </div>
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
            <span>Setup status</span>
            <strong>
              {connection?.status === "connected" ? "Ready" : "Pending"}
            </strong>
            <small>
              {phoneSipConfigured ? "SIP checked" : "SIP not checked"}
            </small>
          </article>
          <article data-alert={liveTrafficSeen ? "false" : "true"}>
            <span>Live traffic</span>
            <strong>{liveTrafficSeen ? "Seen" : "No calls yet"}</strong>
            <small>{latestLiveCallLabel}</small>
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
            <div className="inlineNotice">
              <ShieldCheck size={16} />
              <span>
                Phone calls currently save transcript messages. Raw audio
                recordings are not stored in this admin.
              </span>
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
                <span>Recording disclosure configured</span>
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
            <button
              className="primaryButton"
              type="button"
              disabled={busy || !canEditSettings}
              onClick={applyAssadPlaybook}
            >
              <ClipboardCheck size={15} />
              Apply
            </button>
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
            <span>API endpoint</span>
            <input
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Admin token</span>
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

  function normalizeSettingsSection(
    sectionId?: string,
  ): SettingsSectionId | undefined {
    if (
      sectionId === "business-settings" ||
      sectionId === "widget-settings" ||
      sectionId === "automation-settings" ||
      sectionId === "test-settings"
    ) {
      return sectionId;
    }
    return undefined;
  }

  function normalizeChannelsSection(
    sectionId?: string,
  ): ChannelsSectionId | undefined {
    if (
      sectionId === "telephone-channel-setup" ||
      sectionId === "connect-channels" ||
      sectionId === "whatsapp-operations"
    ) {
      return sectionId;
    }
    return sectionId === "channel-overview" ? sectionId : undefined;
  }

  function openWorkspaceSection(tab: TabKey, sectionId?: string) {
    setActiveTab(tab);
    if (tab === "settings") {
      setActiveSettingsSection(
        normalizeSettingsSection(sectionId) ?? "business-settings",
      );
    }
    if (tab === "channels") {
      setActiveChannelsSection(
        normalizeChannelsSection(sectionId) ?? "channel-overview",
      );
    }
    if (!sectionId) {
      return;
    }
    window.setTimeout(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openSettingsSection(sectionId: SettingsSectionId) {
    openWorkspaceSection("settings", sectionId);
  }

  function openChannelsSection(sectionId: ChannelsSectionId) {
    openWorkspaceSection("channels", sectionId);
  }

  function runCommandAction(action: CommandItem) {
    if (action.action) {
      action.action();
      return;
    }
    openWorkspaceSection(action.tab);
  }

  async function switchToProjectMemberLogin() {
    if (selectedTenantMemberLoginEmail) {
      setLoginEmail(selectedTenantMemberLoginEmail);
    }
    setAuthMode("login");
    await logout();
  }

  function renderPersonalDataAccessNotice() {
    if (!personalDataAccessDenied) {
      return null;
    }

    return (
      <div className="inlineNotice accessNotice" data-tone="warn">
        <ShieldCheck size={16} />
        <div className="inlineNoticeContent">
          <strong>Conversation text is restricted for this session.</strong>
          <span>
            The bootstrap token can load aggregate counts and setup, but
            messages, contacts, handoffs, and call transcripts require a real
            project-member login.
          </span>
          <span>
            {selectedTenantMemberLoginEmail
              ? `Log in with ${selectedTenantMemberLoginEmail} to view this project's plain-text transcripts.`
              : "Log in as a project member to view plain-text transcripts."}{" "}
            Raw audio recordings are not stored yet.
          </span>
        </div>
        {adminToken || adminSession?.authType === "admin_token" ? (
          <button
            className="secondaryButton accessNoticeAction"
            disabled={busy}
            type="button"
            onClick={() => void switchToProjectMemberLogin()}
          >
            <UserCheck size={15} />
            User login
          </button>
        ) : null}
      </div>
    );
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
            <button
              type="button"
              onClick={() =>
                openWorkspaceSection("knowledge", "knowledge-manager")
              }
            >
              <Database size={16} />
              Answers
            </button>
            <button
              type="button"
              onClick={() =>
                openWorkspaceSection("channels", "connect-channels")
              }
            >
              <Globe2 size={16} />
              Channels
            </button>
            <button
              type="button"
              onClick={() =>
                openWorkspaceSection("settings", "business-settings")
              }
            >
              <Settings size={16} />
              Setup
            </button>
          </div>
        </section>
        {renderPersonalDataAccessNotice()}
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
              <strong>{conversationSummaryCount}</strong>
            </article>
            <article>
              <span>Handoffs</span>
              <strong>{openHandoffSummaryCount}</strong>
            </article>
          </div>
        </section>
        {renderPersonalDataAccessNotice()}
        {renderLeadActionCenter()}
        <WorkspaceDisclosure
          title="Pipeline and captured leads"
          detail={`${leadHandoffs.length} total leads`}
        >
          {renderLeads()}
        </WorkspaceDisclosure>
        <WorkspaceDisclosure
          title="Conversations and handoffs"
          detail={`${conversations.length} conversations · ${openHandoffs.length} open handoffs`}
          bodyClassName="leadSupportGrid"
        >
          {renderInbox()}
          {renderHandoffs()}
        </WorkspaceDisclosure>
        <WorkspaceDisclosure
          title="Customer profiles"
          detail={`${contacts.length} known contacts`}
        >
          {renderContacts()}
        </WorkspaceDisclosure>
      </div>
    );
  }

  function renderSettingsWorkspace() {
    const settingsSections: Array<SectionSwitchItem<SettingsSectionId>> = [
      {
        id: "business-settings",
        label: "Profile",
        icon: <Sparkles size={16} />,
      },
      { id: "widget-settings", label: "Widget", icon: <Code2 size={16} /> },
      {
        id: "number-settings",
        label: "Numbers",
        icon: <PhoneCall size={16} />,
      },
      {
        id: "automation-settings",
        label: "Automation",
        icon: <Sparkles size={16} />,
      },
      { id: "test-settings", label: "Test", icon: <MessageCircle size={16} /> },
    ];

    return (
      <div className="workspaceStack">
        <section className="workspaceIntro">
          <div>
            <span className="eyebrow">Configuration</span>
            <h2>Setup in focused steps</h2>
            <p>
              Pick one area, make the change, then move to the next. Advanced
              controls stay out of the way until they are needed.
            </p>
          </div>
          <SectionSwitch
            activeId={activeSettingsSection}
            items={settingsSections}
            onSelect={openSettingsSection}
          />
        </section>

        {activeSettingsSection === "business-settings" ? (
          <div id="business-settings" className="settingsSection">
            {renderSettings()}
          </div>
        ) : null}
        {activeSettingsSection === "widget-settings" ? (
          <div id="widget-settings" className="settingsSection">
            {renderWidget()}
          </div>
        ) : null}
        {activeSettingsSection === "number-settings" ? (
          <div id="number-settings" className="settingsSection">
            {renderSelfServiceBillingPanel()}
          </div>
        ) : null}
        {activeSettingsSection === "automation-settings" ? (
          <div id="automation-settings" className="settingsSection">
            {renderAutomation()}
          </div>
        ) : null}
        {activeSettingsSection === "test-settings" ? (
          <div id="test-settings" className="settingsSection">
            {renderTestStudio()}
          </div>
        ) : null}
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

  function selectAuthMode(nextMode: (typeof authModeOrder)[number]) {
    setAuthMode(nextMode);
    window.setTimeout(() => {
      document.getElementById(authModeTabIds[nextMode])?.focus();
    }, 0);
  }

  function handleAuthModeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = Math.max(
      authModeOrder.indexOf(authMode as (typeof authModeOrder)[number]),
      0,
    );
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectAuthMode(
        authModeOrder[(currentIndex + 1) % authModeOrder.length] ?? "login",
      );
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectAuthMode(
        authModeOrder[
          (currentIndex - 1 + authModeOrder.length) % authModeOrder.length
        ] ?? "login",
      );
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      selectAuthMode(authModeOrder[0] ?? "login");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      selectAuthMode(authModeOrder[authModeOrder.length - 1] ?? "signup");
    }
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
            Learn about the product
          </a>
        </section>
        <section className="authPanel">
          <div className="brand large">
            <span className="brandMark">
              <Bot size={22} />
            </span>
            <div>
              <strong>{APP_CONFIG.brand.name}</strong>
              <span>Owner and operator login</span>
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
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <div className="inputIcon withAction">
                  <KeyRound size={16} />
                  <input
                    type={visibleSecrets.invite ? "text" : "password"}
                    value={invitePassword}
                    onChange={(event) => setInvitePassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    className="inputAction"
                    type="button"
                    aria-label={
                      visibleSecrets.invite
                        ? "Hide invite password"
                        : "Show invite password"
                    }
                    aria-pressed={visibleSecrets.invite}
                    onClick={() =>
                      setVisibleSecrets((current) => ({
                        ...current,
                        invite: !current.invite,
                      }))
                    }
                  >
                    {visibleSecrets.invite ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </label>
              <button className="primaryButton full" disabled={busy}>
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
              <div
                className="segmented authModeSwitch"
                role="group"
                aria-label="Authentication mode"
                onKeyDown={handleAuthModeKeyDown}
              >
                <button
                  id="auth-login-tab"
                  aria-pressed={authMode === "login"}
                  data-active={authMode === "login" ? "true" : "false"}
                  type="button"
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  id="auth-signup-tab"
                  aria-pressed={authMode === "signup"}
                  data-active={authMode === "signup" ? "true" : "false"}
                  type="button"
                  onClick={() => setAuthMode("signup")}
                >
                  Create account
                </button>
              </div>
              <button
                id="auth-admin-token-toggle"
                className="textToggle adminAccessToggle"
                type="button"
                onClick={() =>
                  setAuthMode((current) =>
                    current === "admin_token" ? "login" : "admin_token",
                  )
                }
              >
                {authMode === "admin_token"
                  ? "Use email login"
                  : "Advanced admin access"}
              </button>

              {authMode === "login" ? (
                <form
                  className="authForm"
                  id="auth-login-panel"
                  onSubmit={loginWithPassword}
                >
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      autoComplete="email"
                      autoFocus
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <div className="inputIcon withAction">
                      <KeyRound size={16} />
                      <input
                        type={visibleSecrets.login ? "text" : "password"}
                        value={loginPassword}
                        onChange={(event) =>
                          setLoginPassword(event.target.value)
                        }
                        autoComplete="current-password"
                        required
                      />
                      <button
                        className="inputAction"
                        type="button"
                        aria-label={
                          visibleSecrets.login
                            ? "Hide password"
                            : "Show password"
                        }
                        aria-pressed={visibleSecrets.login}
                        onClick={() =>
                          setVisibleSecrets((current) => ({
                            ...current,
                            login: !current.login,
                          }))
                        }
                      >
                        {visibleSecrets.login ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </label>
                  {showAdvancedConnection ? (
                    <label className="field">
                      <span>API endpoint</span>
                      <input
                        value={apiBase}
                        onChange={(event) => setApiBase(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button className="primaryButton full" disabled={busy}>
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
                    {showAdvancedConnection
                      ? "Hide API settings"
                      : "API settings"}
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
                <form
                  className="authForm"
                  id="auth-signup-panel"
                  onSubmit={signUpWithPassword}
                >
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={signupName}
                      onChange={(event) => setSignupName(event.target.value)}
                      autoComplete="name"
                      autoFocus
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(event) => setSignupEmail(event.target.value)}
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <div className="inputIcon withAction">
                      <KeyRound size={16} />
                      <input
                        type={visibleSecrets.signup ? "text" : "password"}
                        value={signupPassword}
                        onChange={(event) =>
                          setSignupPassword(event.target.value)
                        }
                        autoComplete="new-password"
                        required
                      />
                      <button
                        className="inputAction"
                        type="button"
                        aria-label={
                          visibleSecrets.signup
                            ? "Hide password"
                            : "Show password"
                        }
                        aria-pressed={visibleSecrets.signup}
                        onClick={() =>
                          setVisibleSecrets((current) => ({
                            ...current,
                            signup: !current.signup,
                          }))
                        }
                      >
                        {visibleSecrets.signup ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </label>
                  {showAdvancedConnection ? (
                    <label className="field">
                      <span>API endpoint</span>
                      <input
                        value={apiBase}
                        onChange={(event) => setApiBase(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button className="primaryButton full" disabled={busy}>
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
                    {showAdvancedConnection
                      ? "Hide API settings"
                      : "API settings"}
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
                  id="auth-admin-token-panel"
                  aria-labelledby="auth-admin-token-toggle"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void refreshTenants();
                  }}
                >
                  <label className="field">
                    <span>Bootstrap admin token</span>
                    <div className="inputIcon withAction">
                      <KeyRound size={16} />
                      <input
                        type={visibleSecrets.adminToken ? "text" : "password"}
                        value={adminToken}
                        onChange={(event) => setAdminToken(event.target.value)}
                        autoComplete="off"
                        autoFocus
                        required
                      />
                      <button
                        className="inputAction"
                        type="button"
                        aria-label={
                          visibleSecrets.adminToken
                            ? "Hide bootstrap token"
                            : "Show bootstrap token"
                        }
                        aria-pressed={visibleSecrets.adminToken}
                        onClick={() =>
                          setVisibleSecrets((current) => ({
                            ...current,
                            adminToken: !current.adminToken,
                          }))
                        }
                      >
                        {visibleSecrets.adminToken ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </label>
                  {showAdvancedConnection ? (
                    <label className="field">
                      <span>API endpoint</span>
                      <input
                        value={apiBase}
                        onChange={(event) => setApiBase(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button className="primaryButton full" disabled={busy}>
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
                    {showAdvancedConnection
                      ? "Hide API settings"
                      : "API settings"}
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
              <a className="authProductLink" href="/landing">
                <ExternalLink size={15} />
                Learn about the product
              </a>
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
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-controls="primary-sidebar"
            aria-expanded={sidebarOpen ? "true" : "false"}
            onClick={() => setSidebarOpen((current) => !current)}
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
