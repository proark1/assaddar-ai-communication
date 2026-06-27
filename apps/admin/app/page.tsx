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

type Tenant = {
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

type WidgetTheme = {
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

type WidgetAutomationSettings = {
  ownerLeadEmailEnabled?: boolean;
  visitorConfirmationEmailEnabled?: boolean;
  autoQualifyReadinessEnabled?: boolean;
  autoQualifyLeadDetailsEnabled?: boolean;
  weeklySummaryEmailEnabled?: boolean;
  staleLeadReminderDays?: number;
  readinessQualificationScore?: number;
};

type KnowledgeItem = {
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

type Conversation = {
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

type ContactProfile = {
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

type UnifiedInboxItem = Conversation & {
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

type ConversationMessage = {
  id: string;
  direction: string;
  role: string;
  content: string;
  trace?: Record<string, unknown>;
  createdAt: string;
};

type Handoff = {
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

type TenantAnalytics = {
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
};

type WhatsappTemplate = {
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

type WhatsappCompliance = {
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

type WorkflowSuggestion = {
  id: string;
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  detail: string;
  actionLabel: string;
};

type WorkflowSuggestionsResult = {
  generatedAt: string;
  suggestions: WorkflowSuggestion[];
  counts: {
    suggestions: number;
    openHandoffs: number;
    contacts: number;
    whatsappTemplates: number;
  };
};

type WebsiteImportResult = {
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

type AdminSession = {
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

type TenantRole = "tenant_owner" | "tenant_admin" | "operator" | "viewer";

type TenantUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
  membershipStatus?: string;
};

type TenantInvite = {
  id: string;
  email: string;
  roleName: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

type UnansweredQuestion = {
  id: string;
  conversationId?: string | null;
  channel: string;
  reason: string;
  question: string;
  status: string;
  createdAt: string;
  suggestedTags: string[];
};

type ChannelConnection = {
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

type TelephoneSetupMode = "new_number" | "forwarding" | "sip_byoc";

type TelephoneProvider = "easybell" | "sipgate" | "peoplefone" | "custom_sip";

type TelephoneNumberType = "local" | "mobile" | "toll-free";

type TwilioNumberType = TelephoneNumberType;

type TwilioNumberCapabilities = {
  voice: boolean;
  sms: boolean;
  mms: boolean;
};

type TwilioAvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  locality?: string | null;
  region?: string | null;
  isoCountry?: string | null;
  capabilities: TwilioNumberCapabilities;
  monthlyPrice?: string | null;
  currency?: string | null;
};

type TwilioOwnedNumber = {
  sid?: string | null;
  phoneNumber?: string | null;
  friendlyName?: string | null;
  isoCountry?: string | null;
  capabilities: TwilioNumberCapabilities;
  voiceUrl?: string | null;
  voiceMethod?: string | null;
};

type TelephoneComplianceNotice = {
  level: string;
  title: string;
  detail: string;
};

type TwilioNumberSearchResult = {
  webhookUrl: string;
  pricing?: {
    currency: string | null;
    monthlyPrice: string | null;
    numberType: string;
  };
  compliance?: TelephoneComplianceNotice;
  numbers: TwilioAvailableNumber[];
};

type TwilioOwnedNumbersResult = {
  webhookUrl: string;
  numbers: TwilioOwnedNumber[];
};

type TelephoneSetupResponse = {
  connection: ChannelConnection;
  webhookUrl?: string;
  number?: TwilioOwnedNumber;
  instructions?: string[];
  compliance?: TelephoneComplianceNotice;
  warnings?: TelephoneSetupWarning[];
  sipTarget?: string;
};

type TelephoneSetupWarning = {
  level: "info" | "warn";
  title: string;
  detail: string;
};

type TelephoneVoiceEdgeStatus = {
  status: "online" | "degraded" | "offline";
  url: string;
  checkedAt: string;
  responseStatus?: number;
  detail?: string;
};

type InstallCheckResult = {
  checkedUrl: string;
  statusCode: number;
  installed: boolean;
  hasAssistantId: boolean;
  hasWidgetScript: boolean;
  hasApiUrl: boolean;
  evidence: string[];
};

type TestAnswer = {
  status: string;
  text: string;
  intent: string;
  confidence: number;
  handoffRecommended: boolean;
};

type ToastKind = "success" | "danger" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type TabKey = "home" | "leads" | "knowledge" | "channels" | "settings";

type KnowledgeStatusFilter = "all" | "approved" | "draft";
type InboxFilter = "all" | "needs_human" | "recent";
type HandoffFilter = "open" | "in_progress" | "resolved" | "all";
type WidgetPlatform = "html" | "wordpress" | "webflow" | "shopify";
type LeadPipelineStage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

// App-wide constants are consolidated in ./config (APP_CONFIG). These aliases
// keep the existing references throughout this file readable and unchanged.
const defaultApiBase = APP_CONFIG.api.base;
const defaultWidgetUrl = APP_CONFIG.api.widgetUrl;
const defaultSiteUrl = APP_CONFIG.siteUrl;

const tabs: Array<{ key: TabKey; label: string; icon: typeof BarChart3 }> = [
  { key: "home", label: "Today", icon: BarChart3 },
  { key: "leads", label: "Inbox", icon: UserCheck },
  { key: "knowledge", label: "Answers", icon: Database },
  { key: "channels", label: "Channels", icon: Globe2 },
  { key: "settings", label: "Setup", icon: Settings },
];

const legacyTabMap: Record<string, TabKey> = {
  setup: "home",
  overview: "home",
  automation: "settings",
  inbox: "leads",
  handoffs: "leads",
  test: "settings",
  widget: "settings",
};

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

const defaultTheme: Required<
  Pick<
    WidgetTheme,
    | "primaryColor"
    | "backgroundColor"
    | "textColor"
    | "launcherLabel"
    | "openingMessage"
    | "language"
    | "position"
    | "assistantName"
    | "leadCaptureIntro"
    | "ctaLabel"
    | "ctaUrl"
    | "bookingUrl"
    | "consentText"
    | "readinessIntro"
  >
> & {
  leadCaptureEnabled: boolean;
  leadCaptureFields: string[];
  consentEnabled: boolean;
  quickReplies: string[];
  readinessEnabled: boolean;
  automation: Required<WidgetAutomationSettings>;
} = {
  primaryColor: "#a66e2f",
  backgroundColor: "#ffffff",
  textColor: "#16191e",
  launcherLabel: "AI Beratung",
  openingMessage:
    "Hallo, ich bin der Assaddar AI Assistent. Wie kann ich bei KI, Automatisierung oder Prozessberatung helfen?",
  language: "de",
  position: "bottom-right",
  assistantName: "Assaddar AI Consultant",
  leadCaptureEnabled: true,
  leadCaptureIntro:
    "Hinterlassen Sie kurz Ihre Daten, damit wir das passende KI-Projekt einschätzen können.",
  leadCaptureFields: [
    "name",
    "email",
    "company",
    "projectType",
    "budget",
    "contactPreference",
  ],
  ctaLabel: "Beratung anfragen",
  ctaUrl: "https://www.assad-dar.de/de",
  bookingUrl: "https://www.assad-dar.de/de",
  consentEnabled: true,
  consentText:
    "Dieser Assistent beantwortet Fragen mit freigegebenem Business-Wissen. Nachrichten koennen gespeichert werden, damit das Team nachfassen kann.",
  quickReplies: [
    "KI Readiness prüfen",
    "Use Case prüfen",
    "Termin buchen",
    "Datenschutz klären",
    "Beratung anfragen",
  ],
  readinessEnabled: true,
  readinessIntro:
    "Pruefen Sie kurz, ob Ihr Unternehmen bereit fuer ein sinnvolles KI-Automatisierungsprojekt ist.",
  automation: {
    ownerLeadEmailEnabled: true,
    visitorConfirmationEmailEnabled: true,
    autoQualifyReadinessEnabled: true,
    autoQualifyLeadDetailsEnabled: true,
    weeklySummaryEmailEnabled: true,
    staleLeadReminderDays: 3,
    readinessQualificationScore: 70,
  },
};

const starterFaqs = [
  {
    question: "Was macht Assaddar AI Consultancy?",
    answer:
      "Assaddar AI Consultancy hilft kleinen und mittleren Unternehmen dabei, sinnvolle KI- und Automatisierungsprojekte zu identifizieren, zu planen und praktisch umzusetzen. Der Fokus liegt auf klaren Prozessen, messbarem Nutzen und einer sicheren Einführung im Unternehmen.",
    tags: ["assaddar", "services", "company"],
  },
  {
    question: "Welche KI-Projekte eignen sich fuer KMU?",
    answer:
      "Geeignete Projekte sind zum Beispiel Kundenservice-Automatisierung, interne Wissensassistenten, Dokumenten- und E-Mail-Prozesse, Angebotsvorbereitung, Reporting, Datenaufbereitung und wiederkehrende operative Workflows. Vor der Umsetzung wird priorisiert, was realistisch, wirtschaftlich und datenschutzkonform ist.",
    tags: ["services", "kmu", "automation"],
  },
  {
    question: "Wie startet ein Beratungsprojekt?",
    answer:
      "Ein Projekt startet mit einem kurzen Erstgespraech, einer Analyse der aktuellen Prozesse und einer priorisierten Roadmap. Danach werden ein klarer Use Case, die benoetigten Daten, technische Grenzen, Risiken und ein pragmatischer Umsetzungsplan definiert.",
    tags: ["process", "consultation", "lead-capture"],
  },
  {
    question: "Wie werden Datenschutz und Unternehmensdaten behandelt?",
    answer:
      "Datenschutz und vertrauliche Unternehmensdaten muessen vor jedem KI-Einsatz geklaert werden. Assaddar AI Consultancy arbeitet mit freigegebenen Informationen, vermeidet unnoetige Datenspeicherung und beruecksichtigt DSGVO-Anforderungen, Rollen, Zugriffe und technische Schutzmassnahmen.",
    tags: ["privacy", "dsgvo", "data"],
  },
  {
    question: "Kann ein Beratungsgespraech gebucht werden?",
    answer:
      "Ja. Interessenten koennen ihre Kontaktdaten, das Unternehmen, den Projektbedarf und den gewuenschten Zeitrahmen hinterlassen. Das Team prueft die Anfrage und meldet sich fuer ein passendes Beratungsgespraech.",
    tags: ["contact", "consultation", "lead-capture"],
  },
  {
    question: "Gibt es feste Preise?",
    answer:
      "Preise haengen vom Umfang, den vorhandenen Systemen, Datenschutzanforderungen und dem gewuenschten Ergebnis ab. Nach einer kurzen Analyse kann ein passendes Angebot oder ein sinnvoller erster Projektabschnitt vorgeschlagen werden.",
    tags: ["pricing", "budget", "offer"],
  },
];

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function statusTone(status: string) {
  if (!status) {
    return "neutral";
  }

  return /failed|required|error|unauthorized|forbidden|not found|not allowed|wrong|unreachable|rejected/i.test(
    status,
  )
    ? "danger"
    : "success";
}

function formatDate(value?: string | null) {
  if (!value) {
    return "No activity yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getQuestion(item: KnowledgeItem) {
  return item.metadata?.question ?? item.title ?? "Knowledge item";
}

function getAnswer(item: KnowledgeItem) {
  return item.metadata?.answer ?? item.content;
}

function getKnowledgeText(item: KnowledgeItem) {
  return `${getQuestion(item)} ${getAnswer(item)} ${item.tags.join(" ")}`;
}

function parseTags(value: string) {
  const tags = value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return tags.length ? Array.from(new Set(tags)) : ["faq"];
}

function parseFaqImport(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [rawQuestion, ...answerLines] = block.split("\n");
      return {
        question: rawQuestion?.trim() ?? "",
        answer: answerLines.join("\n").trim(),
      };
    })
    .filter((item) => item.question.length >= 3 && item.answer.length >= 3);
}

function readableError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Something went wrong.";

  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return "API unreachable. Check the API base or deploy status.";
  }
  if (/unauthorized|401|invalid token/i.test(raw)) {
    return "Login rejected. Check the email, password, or admin token.";
  }
  if (/origin not allowed|cors/i.test(raw)) {
    return "Browser origin is not allowed by the API.";
  }
  if (/not found|404/i.test(raw)) {
    return "Requested tenant data was not found.";
  }

  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? raw;
  } catch {
    return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
  }
}

function getAnswerWarnings(
  questionValue: string,
  answerValue: string,
  duplicate: boolean,
) {
  const warnings: string[] = [];

  if (duplicate) {
    warnings.push("Possible duplicate question");
  }
  if (questionValue.trim().length > 0 && questionValue.trim().length < 12) {
    warnings.push("Question is very short");
  }
  if (answerValue.trim().length > 0 && answerValue.trim().length < 40) {
    warnings.push("Answer may be too thin");
  }
  if (answerValue.length > 0 && !/[.!?]$/.test(answerValue.trim())) {
    warnings.push("Answer should read like a complete response");
  }

  return warnings;
}

function suggestFaqAnswerFromUnanswered(item: UnansweredQuestion) {
  const topic =
    item.suggestedTags.find(
      (tag) => !["unanswered", item.channel, item.reason].includes(tag),
    ) ?? item.reason;
  const readableTopic = titleCase(topic);

  return [
    `Aktuell ist dazu noch keine freigegebene Antwort hinterlegt. Vorschlag fuer ${readableTopic}:`,
    "Beschreiben Sie kurz, was Assaddar AI Consultancy in diesem Fall leisten kann, welche Informationen vom Kunden benoetigt werden, und wann ein Mensch das Gespraech uebernimmt.",
    `Ausgangsfrage: ${item.question}`,
  ].join("\n\n");
}

function findBestKnowledgeMatch(message: string, items: KnowledgeItem[]) {
  const terms = message
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/i)
    .filter((term) => term.length > 3);

  if (!terms.length) {
    return null;
  }

  let best: { item: KnowledgeItem; score: number } | null = null;
  for (const item of items) {
    const text = getKnowledgeText(item).toLowerCase();
    const score = terms.filter((term) => text.includes(term)).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score };
    }
  }

  return best?.item ?? null;
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldLabel(value: string) {
  const labels: Record<string, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    company: "Company",
    projectType: "Project type",
    budget: "Budget",
    timeline: "Timeline",
    contactPreference: "Contact preference",
    message: "Message",
  };
  return labels[value] ?? titleCase(value);
}

function mergeTheme(theme?: WidgetTheme) {
  return {
    ...defaultTheme,
    ...(theme ?? {}),
    bookingUrl: theme?.bookingUrl ?? theme?.ctaUrl ?? defaultTheme.bookingUrl,
    leadCaptureFields: theme?.leadCaptureFields?.length
      ? theme.leadCaptureFields
      : defaultTheme.leadCaptureFields,
    quickReplies: theme?.quickReplies?.length
      ? theme.quickReplies
      : defaultTheme.quickReplies,
    automation: {
      ...defaultTheme.automation,
      ...(theme?.automation ?? {}),
    },
  };
}

function getUsageTotal(
  analytics: TenantAnalytics | null,
  eventTypes: string[],
) {
  return (
    analytics?.usageByStatus
      .filter((event) => eventTypes.includes(event.eventType))
      .reduce((total, event) => total + event.total, 0) ?? 0
  );
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value)}%`;
}

function rate(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

function parseLeadDetails(message: string) {
  return message
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const [label, ...valueParts] = line.split(":");
      return {
        label: label?.trim() ?? "",
        value: valueParts.join(":").trim(),
      };
    })
    .filter((item) => item.label && item.value);
}

function getLeadDetailValue(handoff: Handoff, label: string) {
  const normalizedLabel = label.toLowerCase();
  return (
    parseLeadDetails(handoff.requesterMessage).find(
      (item) => item.label.toLowerCase() === normalizedLabel,
    )?.value ?? ""
  );
}

function getLeadContactEmail(handoff: Handoff) {
  const emailDetail =
    parseLeadDetails(handoff.requesterMessage).find((item) =>
      item.label.toLowerCase().includes("email"),
    )?.value ?? "";
  return emailDetail.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ?? "";
}

function getLeadContactPhone(handoff: Handoff) {
  return (
    parseLeadDetails(handoff.requesterMessage).find((item) =>
      item.label.toLowerCase().includes("phone"),
    )?.value ?? ""
  );
}

function buildLeadSummary(handoff: Handoff) {
  const details = parseLeadDetails(handoff.requesterMessage);
  return [
    `Lead: ${getLeadDisplayName(handoff)}`,
    `Score: ${getLeadScore(handoff)}/100`,
    `Stage: ${getPipelineStage(handoff)}`,
    `Status: ${handoff.status}`,
    `Created: ${formatDate(handoff.createdAt)}`,
    "",
    ...details.map((item) => `${item.label}: ${item.value}`),
  ].join("\n");
}

function getLeadDisplayName(handoff: Handoff) {
  return (
    getLeadDetailValue(handoff, "Name") ||
    getLeadDetailValue(handoff, "Company") ||
    "Website lead"
  );
}

function groupUnansweredQuestions(items: UnansweredQuestion[]) {
  const groups = new Map<
    string,
    {
      label: string;
      items: UnansweredQuestion[];
      tags: string[];
    }
  >();

  for (const item of items) {
    const label =
      item.suggestedTags.find(
        (tag) => !["unanswered", item.channel].includes(tag),
      ) ??
      item.reason ??
      "question";
    const key = label.toLowerCase();
    const existing = groups.get(key) ?? {
      label: titleCase(label),
      items: [],
      tags: item.suggestedTags,
    };
    existing.items.push(item);
    groups.set(key, existing);
  }

  return Array.from(groups.values()).sort(
    (left, right) => right.items.length - left.items.length,
  );
}

function isLeadOlderThan(handoff: Handoff, days: number) {
  const createdAt = new Date(handoff.createdAt).getTime();
  if (!Number.isFinite(createdAt)) {
    return false;
  }
  return Date.now() - createdAt >= days * 24 * 60 * 60 * 1000;
}

function isLeadRecent(handoff: Handoff, days: number) {
  const createdAt = new Date(handoff.createdAt).getTime();
  if (!Number.isFinite(createdAt)) {
    return false;
  }
  return Date.now() - createdAt <= days * 24 * 60 * 60 * 1000;
}

function getLeadFollowUpDate(handoff: Handoff) {
  const notes = handoff.metadata?.notes ?? [];
  for (const note of [...notes].reverse()) {
    const match = note.body.match(/Follow up on (\d{4}-\d{2}-\d{2})/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "";
}

function isFollowUpDue(handoff: Handoff) {
  const followUpDate = getLeadFollowUpDate(handoff);
  if (!followUpDate || ["resolved", "dismissed"].includes(handoff.status)) {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  return followUpDate <= today;
}

function getLeadScore(handoff: Handoff) {
  const details = parseLeadDetails(handoff.requesterMessage);
  const detailMap = new Map(
    details.map((item) => [item.label.toLowerCase(), item.value.toLowerCase()]),
  );
  const readinessScore = handoff.requesterMessage.match(
    /readiness score:\s*(\d+)/i,
  )?.[1];

  if (readinessScore) {
    return Math.min(100, Number(readinessScore));
  }

  let score = 35;
  if (detailMap.get("email")) {
    score += 15;
  }
  if (detailMap.get("phone")) {
    score += 8;
  }
  if (detailMap.get("company")) {
    score += 12;
  }
  if (detailMap.get("project type")) {
    score += 12;
  }
  if (detailMap.get("budget")) {
    score += 12;
  }
  if (detailMap.get("timeline")) {
    score += 8;
  }
  if (
    /(urgent|quarter|monat|soon|sofort|asap)/i.test(handoff.requesterMessage)
  ) {
    score += 6;
  }

  return Math.min(100, score);
}

function getLeadNextStep(handoff: Handoff) {
  const stage = getPipelineStage(handoff);
  const score = getLeadScore(handoff);

  if (stage === "new" && score >= 70) {
    return "Contact today";
  }
  if (stage === "new") {
    return "Qualify fit";
  }
  if (stage === "contacted") {
    return "Book discovery";
  }
  if (stage === "qualified") {
    return "Prepare proposal";
  }
  if (stage === "proposal") {
    return "Follow up";
  }
  return stage === "won" ? "Close loop" : "Archive";
}

function getContactDisplayName(
  contact?: ContactProfile | null,
  fallback = "Unknown contact",
) {
  return (
    contact?.displayName ||
    contact?.company ||
    contact?.email ||
    contact?.phone ||
    fallback
  );
}

function getContactSubtitle(contact?: ContactProfile | null) {
  return [contact?.email, contact?.phone, contact?.company]
    .filter(Boolean)
    .join(" · ");
}

function formatWindowState(compliance: WhatsappCompliance | null) {
  if (!compliance?.lastInboundAt) {
    return "No inbound WhatsApp message yet";
  }
  if (compliance.canUseFreeformReply) {
    return `Freeform reply until ${formatDate(compliance.windowClosesAt)}`;
  }
  return "Template required for next reply";
}

function extractTemplateVariablesFromBody(body: string) {
  return Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

function buildLeadReplyDraft(
  handoff: Handoff,
  tone: "friendly" | "formal" | "short",
  bookingUrl?: string,
) {
  const name =
    getLeadDetailValue(handoff, "Name") || getLeadDisplayName(handoff);
  const company = getLeadDetailValue(handoff, "Company");
  const project =
    getLeadDetailValue(handoff, "Project type") ||
    getLeadDetailValue(handoff, "Message") ||
    "Ihr KI- oder Automatisierungsprojekt";
  const budget = getLeadDetailValue(handoff, "Budget");
  const timeline = getLeadDetailValue(handoff, "Timeline");
  const greeting = tone === "formal" ? `Guten Tag ${name},` : `Hallo ${name},`;
  const signoff =
    tone === "formal"
      ? "Mit freundlichen Gruessen\nAssad Dar"
      : "Viele Gruesse\nAssad Dar";
  const contextLine = company
    ? `Danke fuer Ihre Anfrage fuer ${company}.`
    : "Danke fuer Ihre Anfrage.";
  const projectLine =
    tone === "short"
      ? `Ich habe den Bedarf gesehen: ${project}.`
      : `Ich habe den beschriebenen Bedarf gesehen: ${project}. Das klingt nach einem sinnvollen Ausgangspunkt fuer ein kurzes Erstgespraech.`;
  const qualifierLine = [
    budget ? `Budget: ${budget}.` : "",
    timeline ? `Zeitplan: ${timeline}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const bookingLine = bookingUrl
    ? `Hier koennen Sie direkt einen passenden Termin buchen: ${bookingUrl}`
    : "Wenn es passt, schlage ich als naechsten Schritt ein kurzes Erstgespraech vor.";

  return [
    greeting,
    "",
    contextLine,
    projectLine,
    qualifierLine,
    bookingLine,
    "",
    signoff,
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n");
}

function buildMailtoHref(email: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

function buildFollowUpIcs(handoff: Handoff, date: string) {
  const start = date.replaceAll("-", "");
  const title = `Follow up: ${getLeadDisplayName(handoff)}`;
  const description = buildLeadSummary(handoff).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Assaddar AI//Lead Follow Up//EN",
    "BEGIN:VEVENT",
    `UID:${handoff.id}@assaddar-ai`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")}`,
    `DTSTART;VALUE=DATE:${start}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function getPipelineStage(handoff: Handoff): LeadPipelineStage {
  return handoff.metadata?.pipelineStage ?? "new";
}

function getPriority(handoff: Handoff) {
  const text = `${handoff.reason} ${handoff.requesterMessage}`.toLowerCase();

  if (/urgent|call|phone|complaint|angry|legal|privacy|dsgvo/.test(text)) {
    return "High";
  }
  if (handoff.status === "open") {
    return "Normal";
  }
  return "Low";
}

function buildWidgetSnippets(
  platform: WidgetPlatform,
  assistantId: string,
  apiBase: string,
) {
  const script = `<script src="${defaultWidgetUrl}" data-assistant-id="${assistantId}" data-api-url="${apiBase}" async></script>`;

  if (platform === "wordpress") {
    return `<!-- Add before </body> in your WordPress theme or insert with a header/footer plugin. -->\n${script}`;
  }
  if (platform === "webflow") {
    return `<!-- Webflow Project Settings > Custom Code > Footer Code -->\n${script}`;
  }
  if (platform === "shopify") {
    return `<!-- Shopify theme.liquid, before </body> -->\n${script}`;
  }

  return script;
}

type AdminDeepLink = {
  tenantId?: string;
  tab?: TabKey;
  handoffId?: string;
  conversationId?: string;
  inviteToken?: string;
};

function readAdminDeepLink(): AdminDeepLink {
  if (typeof window === "undefined") {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get("tab");
  const deepLink: AdminDeepLink = {};
  const tenantId = params.get("tenantId");
  const handoffId = params.get("handoffId");
  const conversationId = params.get("conversationId");
  const inviteToken = params.get("invite");
  if (tenantId) {
    deepLink.tenantId = tenantId;
  }
  const normalizedTab = normalizeTabKey(rawTab);
  if (normalizedTab) {
    deepLink.tab = normalizedTab;
  }
  if (handoffId) {
    deepLink.handoffId = handoffId;
  }
  if (conversationId) {
    deepLink.conversationId = conversationId;
  }
  if (inviteToken) {
    deepLink.inviteToken = inviteToken;
  }
  return deepLink;
}

function isTabKey(value: string | null): value is TabKey {
  return tabs.some((tab) => tab.key === value);
}

function normalizeTabKey(value: string | null): TabKey | undefined {
  if (!value) {
    return undefined;
  }
  if (isTabKey(value)) {
    return value;
  }
  return legacyTabMap[value];
}

function isHandoffFilter(value: string): value is HandoffFilter {
  return ["open", "in_progress", "resolved", "all"].includes(value);
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibility helper for modal/drawer dialogs.
 *
 * While `active` is true it:
 *  - moves focus into the dialog (first focusable element, falling back to the
 *    container itself),
 *  - traps Tab / Shift+Tab focus inside the dialog,
 *  - closes the dialog on Escape via `onClose`,
 *  - restores focus to the previously-focused element when it closes.
 */
function useDialogA11y(
  active: boolean,
  onClose: () => void,
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    const container = ref.current;
    previousFocus.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      if (!container) {
        return;
      }
      const focusable =
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const firstFocusable = focusable[0];
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        container.focus();
      }
    };
    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !container) {
        return;
      }
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const previous = previousFocus.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [active, onClose]);

  return ref;
}

/** In-memory toast queue with auto-dismiss. */
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const pushToast = useCallback(
    (kind: ToastKind, message: string) => {
      if (!message) {
        return;
      }
      const id =
        Date.now() +
        Math.floor(Math.random() * 1000) +
        Object.keys(timers.current).length;
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      timers.current[id] = setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }
  return (
    <div className="toastStack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          className="toast"
          key={toast.id}
          data-kind={toast.kind}
          role="status"
        >
          {toast.kind === "danger" ? (
            <AlertCircle size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            className="toastClose"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [deepLink] = useState<AdminDeepLink>(() => readAdminDeepLink());
  const [apiBase, setApiBase] = useState(defaultApiBase);
  const [adminToken, setAdminToken] = useState("");
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "admin_token">("login");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tagInput, setTagInput] = useState("faq");
  const [importText, setImportText] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testAnswer, setTestAnswer] = useState<TestAnswer | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
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
  const [twilioSearchCountry, setTwilioSearchCountry] = useState("DE");
  const [twilioNumberType, setTwilioNumberType] =
    useState<TwilioNumberType>("local");
  const [twilioSearchLocality, setTwilioSearchLocality] = useState("");
  const [twilioSearchContains, setTwilioSearchContains] = useState("");
  const [twilioNumberSearch, setTwilioNumberSearch] =
    useState<TwilioNumberSearchResult | null>(null);
  const [twilioOwnedNumbers, setTwilioOwnedNumbers] = useState<
    TwilioOwnedNumber[]
  >([]);
  const [existingTwilioNumber, setExistingTwilioNumber] = useState("");
  const [existingTwilioSid, setExistingTwilioSid] = useState("");
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
  const [telephoneCompliance, setTelephoneCompliance] =
    useState<TelephoneComplianceNotice | null>(null);
  const [unansweredQuestions, setUnansweredQuestions] = useState<
    UnansweredQuestion[]
  >([]);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeStatusFilter, setKnowledgeStatusFilter] =
    useState<KnowledgeStatusFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [handoffFilter, setHandoffFilter] = useState<HandoffFilter>("open");
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
  // Mobile navigation: toggles the sidebar into a slide-in drawer on small screens.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, pushToast, dismissToast } = useToasts();
  const copiedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedApiBase = normalizeBaseUrl(apiBase);
  const selectedTenant = useMemo(
    () =>
      tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
    [selectedTenantId, tenants],
  );
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const handoffConversationIds = new Set(
    handoffs
      .filter((handoff) => handoff.status === "open")
      .map((handoff) => handoff.conversationId)
      .filter(Boolean),
  );
  const inboxItems: UnifiedInboxItem[] = unifiedInbox.length
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
      }));
  const selectedInboxItem =
    inboxItems.find(
      (conversation) => conversation.id === selectedConversationId,
    ) ?? null;
  const openHandoffs = handoffs.filter((handoff) => handoff.status === "open");
  const leadHandoffs = handoffs.filter((handoff) =>
    ["lead_capture", "readiness_assessment"].includes(handoff.reason),
  );
  const openLeads = leadHandoffs.filter((handoff) => handoff.status === "open");
  const readinessLeads = handoffs.filter(
    (handoff) => handoff.reason === "readiness_assessment",
  );
  const selectedLead =
    leadHandoffs.find((handoff) => handoff.id === selectedLeadId) ?? null;
  const closeLeadDrawer = useCallback(() => setSelectedLeadId(""), []);
  // Focus trap + Escape-to-close + focus restore for the lead details drawer.
  const leadDrawerRef = useDialogA11y(Boolean(selectedLead), closeLeadDrawer);
  const staleLeads = leadHandoffs.filter(
    (handoff) =>
      ["open", "in_progress"].includes(handoff.status) &&
      isLeadOlderThan(handoff, automationSettings.staleLeadReminderDays),
  );
  const highIntentLeads = leadHandoffs.filter(
    (handoff) =>
      getLeadScore(handoff) >= automationSettings.readinessQualificationScore ||
      ["qualified", "proposal"].includes(getPipelineStage(handoff)),
  );
  const dueLeads = leadHandoffs.filter(isFollowUpDue);
  const hotLeads = leadHandoffs.filter(
    (handoff) =>
      !["resolved", "dismissed"].includes(handoff.status) &&
      getLeadScore(handoff) >= automationSettings.readinessQualificationScore,
  );
  const waitingLeads = leadHandoffs.filter(
    (handoff) =>
      !["resolved", "dismissed"].includes(handoff.status) &&
      ["contacted", "proposal"].includes(getPipelineStage(handoff)),
  );
  const newLeadsThisWeek = leadHandoffs.filter((handoff) =>
    isLeadRecent(handoff, 7),
  );
  const averageLeadScore = leadHandoffs.length
    ? Math.round(
        leadHandoffs.reduce(
          (total, handoff) => total + getLeadScore(handoff),
          0,
        ) / leadHandoffs.length,
      )
    : 0;
  const connectedChannelCount = channelConnections.filter(
    (connection) =>
      connection.status === "connected" || connection.channel === "website",
  ).length;
  const knownContactCount = analytics?.contacts ?? contacts.length;
  const telephoneConnection = channelConnections.find(
    (connection) => connection.channel === "telephone",
  );
  const metaChannelsReady = channelConnections.filter(
    (connection) =>
      ["whatsapp", "messenger", "instagram"].includes(connection.channel) &&
      connection.status === "connected" &&
      connection.credentialConfigured,
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

  const filteredKnowledge = knowledge.filter((item) => {
    const text = getKnowledgeText(item).toLowerCase();
    const matchesSearch =
      !knowledgeSearch || text.includes(knowledgeSearch.toLowerCase());
    const matchesStatus =
      knowledgeStatusFilter === "all" || item.status === knowledgeStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const filteredConversations = conversations.filter((conversation) => {
    if (inboxFilter === "needs_human") {
      return handoffConversationIds.has(conversation.id);
    }
    if (inboxFilter === "recent") {
      const createdAt = new Date(conversation.createdAt).getTime();
      return Date.now() - createdAt < 1000 * 60 * 60 * 24 * 7;
    }
    return true;
  });
  const filteredInboxItems = inboxItems.filter((conversation) => {
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
  });

  const filteredHandoffs = handoffs.filter((handoff) => {
    if (handoffFilter === "all") {
      return true;
    }
    return handoff.status === handoffFilter;
  });
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
  const wonLeadCount = leadHandoffs.filter(
    (handoff) => getPipelineStage(handoff) === "won",
  ).length;
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
        }
      : null,
    staleLeads.length
      ? {
          tone: "urgent",
          title: "Stale lead follow-up",
          detail: `${staleLeads.length} lead${staleLeads.length === 1 ? "" : "s"} older than ${automationSettings.staleLeadReminderDays} days.`,
          tab: "leads" as TabKey,
        }
      : null,
    unansweredQuestions.length
      ? {
          tone: "urgent",
          title: "Answer unanswered questions",
          detail: `${unansweredQuestions.length} question${unansweredQuestions.length === 1 ? "" : "s"} can become approved FAQs.`,
          tab: "knowledge" as TabKey,
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
        }
      : null,
    !installCheck?.installed
      ? {
          tone: "warn",
          title: "Verify website widget",
          detail: "Run the install check after every website or widget deploy.",
          tab: "settings" as TabKey,
        }
      : null,
    !leadCaptureEnabled
      ? {
          tone: "warn",
          title: "Enable lead capture",
          detail: "Lead capture is currently off for the widget.",
          tab: "settings" as TabKey,
        }
      : null,
    !telephoneConnection?.externalAccountId
      ? {
          tone: "info",
          title: "Connect telephone",
          detail: "Add a provider number, forwarding setup, or SIP trunk.",
          tab: "channels" as TabKey,
        }
      : null,
    !automationSettings.visitorConfirmationEmailEnabled
      ? {
          tone: "info",
          title: "Enable visitor confirmation",
          detail: "Visitors can receive a clear email after submitting a lead.",
          tab: "settings" as TabKey,
        }
      : null,
    conversations.length === 0
      ? {
          tone: "info",
          title: "Run a live website test",
          detail:
            "Open the site widget, ask a real question, and confirm it lands here.",
          tab: "settings" as TabKey,
        }
      : null,
  ].filter(Boolean) as Array<{
    tone: "urgent" | "warn" | "info";
    title: string;
    detail: string;
    tab: TabKey;
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
    const savedToken = window.localStorage.getItem("assaddar_admin_token");
    const savedApiBase = window.localStorage.getItem("assaddar_api_base");
    const savedSiteUrl = window.localStorage.getItem("assaddar_site_url");

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
      window.localStorage.setItem("assaddar_admin_token", adminToken);
    }
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
  }, [selectedTenant?.id]);

  useEffect(() => {
    if (selectedTenant?.id) {
      void refreshWorkspace(selectedTenant.id);
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

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${normalizedApiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(adminToken ? { "x-admin-token": adminToken } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `${response.status} ${response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
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
      return;
    }

    await Promise.all([
      refreshKnowledge(tenantId),
      refreshAnalytics(tenantId),
      refreshConversations(tenantId),
      refreshUnifiedInbox(tenantId),
      refreshContacts(tenantId),
      refreshHandoffs(tenantId),
      refreshChannelConnections(tenantId),
      refreshWhatsappOperations(tenantId),
      refreshUnanswered(tenantId),
      refreshWorkflowSuggestions(tenantId),
      refreshTenantUsers(tenantId),
    ]);
  }

  async function refreshKnowledge(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setKnowledge([]);
      return;
    }

    try {
      const items = await apiFetch<KnowledgeItem[]>(
        `/admin/tenants/${tenantId}/knowledge`,
      );
      setKnowledge(items);
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

  async function refreshConversations(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setConversations([]);
      return;
    }

    try {
      const items = await apiFetch<Conversation[]>(
        `/admin/tenants/${tenantId}/conversations`,
      );
      setConversations(items);
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

  async function refreshUnifiedInbox(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setUnifiedInbox([]);
      return;
    }

    try {
      const items = await apiFetch<UnifiedInboxItem[]>(
        `/admin/tenants/${tenantId}/inbox`,
      );
      setUnifiedInbox(items);
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
    }
  }

  async function refreshContacts(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setContacts([]);
      return;
    }

    try {
      const items = await apiFetch<ContactProfile[]>(
        `/admin/tenants/${tenantId}/contacts`,
      );
      setContacts(items);
    } catch {
      setContacts([]);
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

  async function refreshHandoffs(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setHandoffs([]);
      return;
    }

    try {
      const items = await apiFetch<Handoff[]>(
        `/admin/tenants/${tenantId}/handoffs`,
      );
      setHandoffs(items);
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
    if (!tenantId) {
      setTenantUsers([]);
      setTenantInvites([]);
      return;
    }

    try {
      const [users, invites] = await Promise.all([
        apiFetch<TenantUser[]>(`/admin/tenants/${tenantId}/users`),
        canManageUsers()
          ? apiFetch<TenantInvite[]>(`/admin/tenants/${tenantId}/invites`)
          : Promise.resolve([]),
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

  async function saveTenantSettings() {
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
      await refreshWorkspace(selectedTenant.id);
      setStatus("Knowledge saved");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function importStarterKnowledge() {
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      await Promise.all(
        starterFaqs.map((item) =>
          apiFetch(`/admin/tenants/${selectedTenant.id}/knowledge/faqs`, {
            method: "POST",
            body: JSON.stringify(item),
          }),
        ),
      );
      await refreshWorkspace(selectedTenant.id);
      setStatus(`${starterFaqs.length} consultancy FAQs imported`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function scanWebsiteForKnowledge() {
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

  async function importSuggestedFaqs(
    suggestions = websiteImport?.suggestedFaqs ?? [],
  ) {
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
      await refreshWorkspace(selectedTenant.id);
      setStatus(`${suggestions.length} website FAQs imported`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function verifyWidgetInstall() {
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

  async function searchTwilioNumbers() {
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const query = new URLSearchParams({
        country: twilioSearchCountry.trim() || "DE",
        numberType: twilioNumberType,
        limit: "12",
      });
      if (twilioSearchLocality.trim()) {
        query.set("locality", twilioSearchLocality.trim());
      }
      if (twilioSearchContains.trim()) {
        query.set("contains", twilioSearchContains.trim());
      }

      const result = await apiFetch<TwilioNumberSearchResult>(
        `/admin/tenants/${selectedTenant.id}/telephone/twilio/search?${query.toString()}`,
      );
      setTwilioNumberSearch(result);
      setTelephoneCompliance(result.compliance ?? null);
      setStatus(`${result.numbers.length} Twilio numbers found`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadTwilioOwnedNumbers() {
    if (!selectedTenant) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<TwilioOwnedNumbersResult>(
        `/admin/tenants/${selectedTenant.id}/telephone/twilio/numbers`,
      );
      setTwilioOwnedNumbers(result.numbers);
      setStatus(`${result.numbers.length} Twilio account numbers loaded`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function purchaseTwilioNumber(number: TwilioAvailableNumber) {
    if (!selectedTenant || !number.phoneNumber) {
      return;
    }
    const confirmed = window.confirm(
      `Buy ${number.phoneNumber} in Twilio and connect it to this assistant? Twilio may bill the monthly number fee immediately.`,
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<TelephoneSetupResponse>(
        `/admin/tenants/${selectedTenant.id}/telephone/twilio/purchase`,
        {
          method: "POST",
          body: JSON.stringify({
            phoneNumber: number.phoneNumber,
            numberType: twilioNumberType,
            friendlyName: `${selectedTenant.name} AI phone`,
          }),
        },
      );
      if (result.number?.phoneNumber) {
        setForwardingAiNumber(result.number.phoneNumber);
      }
      setTelephoneCompliance(result.compliance ?? telephoneCompliance);
      await refreshChannelConnections(selectedTenant.id);
      setStatus(`${number.phoneNumber} bought and connected`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function connectExistingTwilioNumber() {
    if (!selectedTenant || (!existingTwilioNumber && !existingTwilioSid)) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<TelephoneSetupResponse>(
        `/admin/tenants/${selectedTenant.id}/telephone/twilio/connect-existing`,
        {
          method: "POST",
          body: JSON.stringify({
            phoneNumber: existingTwilioNumber || undefined,
            phoneNumberSid: existingTwilioSid || undefined,
            numberType: twilioNumberType,
          }),
        },
      );
      if (result.number?.phoneNumber) {
        setForwardingAiNumber(result.number.phoneNumber);
      }
      await refreshChannelConnections(selectedTenant.id);
      setStatus("Existing Twilio number connected");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveNewTelephoneNumberSetup() {
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
    setActiveTab("knowledge");
    setStatus("FAQ draft prepared from unanswered question");
  }

  async function importFaqBlocks() {
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
      await refreshWorkspace(selectedTenant.id);
      setStatus(`${importFaqs.length} FAQs imported`);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  function startKnowledgeEdit(item: KnowledgeItem) {
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
      await refreshWorkspace(selectedTenant.id);
      setStatus("Knowledge updated");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteKnowledge(item: KnowledgeItem) {
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
      await refreshWorkspace(selectedTenant.id);
      setStatus("Knowledge deleted");
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
      await refreshWorkspace(selectedTenant.id);
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
      await refreshWorkspace(selectedTenant.id);
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
    // First load (fetching with nothing cached yet): show shimmer placeholders
    // instead of a row of zeros so the dashboard does not look empty/broken.
    if (busy && !analytics && knowledge.length === 0) {
      return (
        <section className="metricsGrid" aria-busy="true" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, index) => (
            <article className="metricCard skeletonCard" key={index}>
              <span className="skeleton skeletonIcon" />
              <span className="skeleton skeletonLabel" />
              <span className="skeleton skeletonValue" />
            </article>
          ))}
        </section>
      );
    }
    return (
      <section className="metricsGrid">
        <article className="metricCard">
          <BarChart3 size={18} />
          <span>Conversations</span>
          <strong>{analytics?.conversations ?? 0}</strong>
        </article>
        <article className="metricCard">
          <MessageSquare size={18} />
          <span>Messages</span>
          <strong>{analytics?.messages ?? 0}</strong>
        </article>
        <article className="metricCard">
          <UserCheck size={18} />
          <span>Contacts</span>
          <strong>{knownContactCount}</strong>
        </article>
        <article className="metricCard">
          <UserCheck size={18} />
          <span>Leads</span>
          <strong>{leadHandoffs.length}</strong>
        </article>
        <article className="metricCard">
          <Database size={18} />
          <span>Knowledge</span>
          <strong>{analytics?.approvedKnowledge ?? knowledge.length}</strong>
        </article>
        <article
          className="metricCard"
          data-alert={openHandoffs.length ? "true" : "false"}
        >
          <Inbox size={18} />
          <span>Open handoffs</span>
          <strong>{analytics?.openHandoffs ?? openHandoffs.length}</strong>
        </article>
        <article
          className="metricCard"
          data-alert={unansweredCount ? "true" : "false"}
        >
          <AlertCircle size={18} />
          <span>Unanswered</span>
          <strong>{unansweredCount}</strong>
        </article>
      </section>
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

  function renderOperationalHealth() {
    const knowledgeGapCount =
      unansweredTopicGroups.length + missingKnowledgeChecks.length;
    const channelReadiness = channelConnections.length
      ? Math.round((connectedChannelCount / channelConnections.length) * 100)
      : 0;

    return (
      <section className="panel operationalPanel">
        <div className="panelHeader">
          <div className="panelTitle">
            <BarChart3 size={18} />
            <h2>Operational health</h2>
          </div>
          <span className="countPill">{channelReadiness}% channels</span>
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
        {renderOperationalHealth()}
        {renderTodayPanel()}
        {renderWorkflowSuggestions()}
        <section className="panel actionPanel">
          <div className="panelHeader">
            <div className="panelTitle">
              <ClipboardCheck size={18} />
              <h2>Next actions</h2>
            </div>
            <span className="countPill">{nextActions.length}</span>
          </div>
          <div className="nextActionList">
            {nextActions.length ? (
              nextActions.slice(0, 5).map((action) => (
                <button
                  className="actionItem"
                  data-tone={action.tone}
                  key={action.title}
                  type="button"
                  onClick={() => setActiveTab(action.tab)}
                >
                  <span>{action.tone}</span>
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </button>
              ))
            ) : (
              <div className="emptyState compact">
                No urgent work. Keep testing new website questions weekly.
              </div>
            )}
          </div>
        </section>
        <div className="overviewGrid">
          {renderSetupChecklist()}

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
              <span className="countPill">{conversations.length}</span>
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

  function renderKnowledge() {
    return (
      <div className="workspaceStack">
        {renderProjectUsers()}

        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Database size={18} />
              <h2>Knowledge manager</h2>
            </div>
            <span className="countPill">{knowledge.length}</span>
          </div>

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
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Answer</span>
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={4}
              />
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                value={tagInput}
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
              disabled={busy || !question || !answer}
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
                              onChange={(event) =>
                                setEditQuestion(event.target.value)
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Answer</span>
                            <textarea
                              value={editAnswer}
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
                              disabled={busy || !editQuestion || !editAnswer}
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
                              onClick={() => startKnowledgeEdit(item)}
                            >
                              <Save size={15} />
                              Edit
                            </button>
                            <button
                              className="dangerButton"
                              type="button"
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
                onChange={(event) =>
                  setCrawlMaxPages(Number(event.target.value))
                }
              />
            </label>
            <button
              className="primaryButton full"
              disabled={busy || !selectedTenant || !siteUrl}
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
                      disabled={busy}
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
                  disabled={busy || !websiteImport.suggestedFaqs.length}
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
                onChange={(event) => setImportText(event.target.value)}
                rows={8}
              />
            </label>
            <button
              className="secondaryButton full"
              disabled={busy || !importFaqs.length}
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
              <h2>Pipeline</h2>
            </div>
          </div>
          <div className="pipelineGrid">
            {pipelineStages.map((stage) => (
              <article key={stage.key}>
                <span>{stage.label}</span>
                <strong>
                  {
                    leadHandoffs.filter(
                      (handoff) => getPipelineStage(handoff) === stage.key,
                    ).length
                  }
                </strong>
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
                        disabled={handoff.status === "in_progress"}
                        onClick={() =>
                          updateHandoff(handoff, "in_progress", "Assad Dar")
                        }
                      >
                        In progress
                      </button>
                      <button
                        className="primaryButton"
                        type="button"
                        disabled={handoff.status === "resolved"}
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
        <div className="contactGrid">
          {contacts.length ? (
            contacts.slice(0, 12).map((contact) => (
              <article className="contactCard" key={contact.id}>
                <div>
                  <strong>{getContactDisplayName(contact)}</strong>
                  <span>{getContactSubtitle(contact) || "No details yet"}</span>
                </div>
                <small>{contact.confidence ?? 0}% match</small>
                <div className="tagRow">
                  {Object.keys(contact.identifiers ?? {})
                    .slice(0, 4)
                    .map((key) => (
                      <small key={key}>{titleCase(key)}</small>
                    ))}
                </div>
              </article>
            ))
          ) : (
            <div className="emptyState compact">
              Contacts appear after website leads, WhatsApp messages, or calls.
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderLeadDetailDrawer() {
    if (!selectedLead) {
      return null;
    }

    const details = parseLeadDetails(selectedLead.requesterMessage);
    const email = getLeadContactEmail(selectedLead);
    const phone = getLeadContactPhone(selectedLead);
    const notes = selectedLead.metadata?.notes ?? [];
    const followUpDate = leadFollowUpDate || getLeadFollowUpDate(selectedLead);
    const replyBody = leadReplyDraft;
    const replySubject = `Re: Anfrage ${getLeadDisplayName(selectedLead)}`;

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
                  onChange={(event) => setLeadFollowUpDate(event.target.value)}
                />
              </label>
            </div>

            <div className="rowActions">
              <button
                className="secondaryButton"
                type="button"
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
                onClick={() =>
                  updateHandoff(selectedLead, "resolved", "Assad Dar", "won")
                }
              >
                Won
              </button>
              <button
                className="dangerButton"
                type="button"
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
                disabled={!leadFollowUpDate}
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
                onChange={(event) => setLeadNote(event.target.value)}
                rows={3}
              />
            </label>
            <button
              className="primaryButton full"
              type="button"
              disabled={busy || !leadNote.trim()}
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

        <div className="handoffBoard">
          {filteredHandoffs.length ? (
            filteredHandoffs.map((handoff) => (
              <article className="handoffItem large" key={handoff.id}>
                <div>
                  <strong>{handoff.reason}</strong>
                  <span data-status={handoff.status}>{handoff.status}</span>
                </div>
                <p>{handoff.requesterMessage}</p>
                <div className="handoffMeta">
                  <small>{handoff.channel}</small>
                  <small>{formatDate(handoff.createdAt)}</small>
                  <small>Priority: {getPriority(handoff)}</small>
                  <small>Owner: {handoff.assignedTo ?? "Unassigned"}</small>
                </div>
                <div className="rowActions">
                  <button
                    className="secondaryButton"
                    type="button"
                    disabled={handoff.assignedTo === "Assad Dar"}
                    onClick={() => updateHandoff(handoff, "open", "Assad Dar")}
                  >
                    <UserCheck size={15} />
                    Assign
                  </button>
                  <button
                    className="secondaryButton"
                    type="button"
                    disabled={handoff.status === "in_progress"}
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
                    disabled={handoff.status === "resolved"}
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
                    disabled={handoff.status === "dismissed"}
                    onClick={() => updateHandoff(handoff, "dismissed")}
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="emptyState">No handoff requests in this view.</div>
          )}
        </div>
      </section>
    );
  }

  function renderTestStudio() {
    return (
      <div className="testStudioGrid">
        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Sparkles size={18} />
              <h2>Testing studio</h2>
            </div>
          </div>
          <div className="sampleGrid">
            {sampleQuestions.map((sample) => (
              <button
                className="secondaryButton"
                key={sample}
                type="button"
                onClick={() => setTestMessage(sample)}
              >
                {sample}
              </button>
            ))}
          </div>
          <form className="testRow large" onSubmit={testAssistant}>
            <input
              value={testMessage}
              onChange={(event) => setTestMessage(event.target.value)}
              placeholder="Ask from approved knowledge"
            />
            <button
              className="iconButton"
              disabled={busy || !testMessage}
              aria-label="Send test"
            >
              <Send size={18} />
            </button>
          </form>
          {testAnswer ? (
            <div className="answerBox">
              <span>{testAnswer.status}</span>
              <p>{testAnswer.text}</p>
              <small>
                {testAnswer.intent} · {Math.round(testAnswer.confidence * 100)}%
                confidence
              </small>
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
        </section>
      </div>
    );
  }

  function renderWidget() {
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
                disabled={busy || !selectedTenant || !siteUrl}
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
              disabled={busy || !selectedTenant}
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

  function renderChannels() {
    return (
      <div className="workspaceStack">
        <section className="metricsGrid compactMetrics">
          <article className="metricCard">
            <Globe2 size={18} />
            <span>Channels</span>
            <strong>{channelConnections.length}</strong>
          </article>
          <article className="metricCard">
            <CheckCircle2 size={18} />
            <span>Connected</span>
            <strong>{connectedChannelCount}</strong>
          </article>
          <article className="metricCard">
            <MessageCircle size={18} />
            <span>Meta ready</span>
            <strong>{metaChannelsReady}</strong>
          </article>
          <article
            className="metricCard"
            data-alert={
              telephoneConnection?.status === "connected" ? "false" : "true"
            }
          >
            <Inbox size={18} />
            <span>Telephone</span>
            <strong>
              {telephoneConnection?.status === "connected" ? "Ready" : "Setup"}
            </strong>
          </article>
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
            <article data-step="1">
              <strong>Website first</strong>
              <span>Embed the assistant and capture the first leads.</span>
            </article>
            <article data-step="2">
              <strong>Telephone AI</strong>
              <span>
                Connect a provider number or SIP trunk and run test calls.
              </span>
            </article>
            <article data-step="3">
              <strong>Social inbox</strong>
              <span>
                Add WhatsApp, Messenger, and Instagram once workflows are clear.
              </span>
            </article>
          </div>
        </section>

        {renderTelephoneSetup(telephoneConnection)}

        <section className="panel">
          <div className="panelHeader">
            <div className="panelTitle">
              <Globe2 size={18} />
              <h2>Other channel setup</h2>
            </div>
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
              .map((connection) => {
                const webhook =
                  connection.assistantWebhookUrl ?? connection.webhookUrl ?? "";
                const draftValue =
                  channelAccountDrafts[connection.channel] ??
                  connection.externalAccountId ??
                  "";
                const isWebsite = connection.channel === "website";
                const implementationGuide =
                  channelImplementationGuides[connection.channel];
                return (
                  <article className="channelCard" key={connection.channel}>
                    <div className="channelCardHeader">
                      <div>
                        <strong>{connection.label}</strong>
                        <span>{connection.provider}</span>
                      </div>
                      <small data-status={connection.status}>
                        {connection.status}
                      </small>
                    </div>

                    <div className="channelStepList">
                      {getChannelSetupSteps(connection, webhook).map((step) => (
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

                    <div className="channelStatusRows">
                      <article
                        data-ready={
                          connection.credentialConfigured ? "true" : "false"
                        }
                      >
                        <span>Credential</span>
                        <strong>
                          {connection.credentialConfigured
                            ? "Ready"
                            : "Missing"}
                        </strong>
                      </article>
                      <article
                        data-ready={
                          connection.externalAccountId || isWebsite
                            ? "true"
                            : "false"
                        }
                      >
                        <span>Account ID</span>
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
                          disabled={busy}
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
                          disabled={busy}
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
                          disabled={busy}
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

    return (
      <section className="panel telephoneSetupPanel">
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
                disabled={busy || !selectedTenant}
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
                disabled={busy || !selectedTenant}
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
              disabled={busy || !selectedTenant}
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
                busy || !forwardingExistingNumber || !forwardingAiNumber
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
                disabled={busy}
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
              disabled={busy || !selectedTenant}
              onClick={() => saveTelephoneTestCall("pending")}
            >
              Pending
            </button>
            <button
              className="primaryButton"
              type="button"
              disabled={busy || !selectedTenant}
              onClick={() => saveTelephoneTestCall("passed")}
            >
              <CheckCircle2 size={15} />
              Passed
            </button>
            <button
              className="dangerButton"
              type="button"
              disabled={busy || !selectedTenant}
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
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Language</span>
                <input
                  value={templateLanguage}
                  onChange={(event) => setTemplateLanguage(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Category</span>
                <select
                  value={templateCategory}
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
                busy || !selectedTenant || !templateName || !templateBody
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

  function telephoneSettingString(
    connection: ChannelConnection | undefined,
    key: string,
  ) {
    const value = connection?.settings?.[key];
    return typeof value === "string" ? value : undefined;
  }

  function formatTelephoneMode(value: string) {
    const labels: Record<string, string> = {
      purchased_twilio: "Purchased Twilio number",
      existing_twilio: "Existing Twilio number",
      new_number_provider: "Provider number",
      carrier_forwarding: "Carrier forwarding",
      sip_byoc: "SIP trunk",
      not_configured: "Not configured",
    };
    return labels[value] ?? value.replace(/_/g, " ");
  }

  function telephoneProviderLabel(provider: string | undefined) {
    const labels: Record<string, string> = {
      easybell: "easybell",
      sipgate: "sipgate",
      peoplefone: "peoplefone",
      custom_sip: "Custom SIP",
      twilio: "Twilio",
    };
    return provider ? (labels[provider] ?? provider) : "Not selected";
  }

  function normalizeTelephoneProviderUi(
    provider: string | undefined,
  ): TelephoneProvider {
    if (
      provider === "easybell" ||
      provider === "sipgate" ||
      provider === "peoplefone" ||
      provider === "custom_sip"
    ) {
      return provider;
    }
    return "easybell";
  }

  function telephoneProviderGuideUrl(provider: TelephoneProvider) {
    const guides: Record<TelephoneProvider, string> = {
      easybell: "https://en.easybell.de/business/sip-trunks/",
      sipgate:
        "https://teamhelp.sipgate.co.uk/integrations-and-connections/using-sipgate-trunking/what-is-sipgate-trunking",
      peoplefone: "https://support.peoplefone.com/en-che/peoplefone-sip-trunk/",
      custom_sip: "https://www.asterisk.org/sip-trunking-for-asterisk/",
    };
    return guides[provider];
  }

  function settingRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  function settingString(value: unknown) {
    return typeof value === "string" ? value : undefined;
  }

  function settingBoolean(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
  }

  function settingNumber(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback;
  }

  function settingTestCallStatus(value: string | undefined) {
    if (value === "pending" || value === "passed" || value === "failed") {
      return value;
    }
    return "not_started";
  }

  function settingBusinessHoursMode(value: string | undefined) {
    if (
      value === "business_hours" ||
      value === "after_hours_only" ||
      value === "always_on"
    ) {
      return value;
    }
    return "always_on";
  }

  function settingAfterHoursAction(value: string | undefined) {
    if (
      value === "voicemail" ||
      value === "callback" ||
      value === "transfer" ||
      value === "answer"
    ) {
      return value;
    }
    return "answer";
  }

  function settingSpeakingStyle(value: string | undefined) {
    if (
      value === "friendly" ||
      value === "concise" ||
      value === "professional"
    ) {
      return value;
    }
    return "professional";
  }

  function buildTelephoneWarningsFromSettings(
    settings: Record<string, unknown>,
    connection?: ChannelConnection,
  ): TelephoneSetupWarning[] {
    const checklist = settingRecord(settings.setupChecklist);
    const gdpr = settingRecord(settings.gdpr);
    const testCall = settingRecord(settings.testCall);
    const warnings: TelephoneSetupWarning[] = [];
    if (
      !settingBoolean(
        checklist.numberOrdered,
        Boolean(connection?.externalAccountId),
      )
    ) {
      warnings.push({
        level: "warn",
        title: "Number not confirmed",
        detail: "Confirm the provider number or forwarding destination.",
      });
    }
    if (!settingBoolean(checklist.sipConfigured, false)) {
      warnings.push({
        level: "warn",
        title: "SIP routing pending",
        detail: "Route the provider trunk or PBX to the voice edge.",
      });
    }
    if (
      !settingBoolean(checklist.testCallCompleted, false) &&
      settingString(testCall.status) !== "passed"
    ) {
      warnings.push({
        level: "warn",
        title: "Test call missing",
        detail: "Complete a live call test before publishing the number.",
      });
    }
    if (
      !settingBoolean(checklist.fallbackSet, false) &&
      !settingString(settings.fallbackNumber)
    ) {
      warnings.push({
        level: "info",
        title: "Fallback number missing",
        detail: "Add a human fallback number for transfer and emergencies.",
      });
    }
    if (
      !settingBoolean(checklist.disclosureConfirmed, false) &&
      !settingString(gdpr.disclosureText)
    ) {
      warnings.push({
        level: "warn",
        title: "AI disclosure missing",
        detail: "Add the disclosure callers hear before AI processing starts.",
      });
    }
    return warnings;
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

  function formatMonthlyNumberPrice(
    amount: string | null | undefined,
    currency: string | null | undefined,
  ) {
    if (!amount) {
      return "Price check";
    }
    return `${amount} ${currency ?? ""}/mo`.trim();
  }

  function canManageUsers() {
    if (adminSession?.authType === "admin_token") {
      return true;
    }
    const role = adminSession?.memberships?.find(
      (membership) => membership.tenantId === selectedTenant?.id,
    )?.role;
    return role
      ? tenantRoleRank(role) >= tenantRoleRank("tenant_admin")
      : false;
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
    return "Account ID";
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

        <div className="automationGrid">
          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Settings size={18} />
                <h2>Playbooks</h2>
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
                onChange={(event) => setBookingUrl(event.target.value)}
                placeholder="https://cal.com/..."
              />
            </label>
            <div className="rowActions">
              <button
                className="primaryButton"
                type="button"
                disabled={busy || !selectedTenant}
                onClick={saveTenantSettings}
              >
                <Save size={16} />
                Save automation
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={busy || !selectedTenant}
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
              onChange={(event) => setWidgetOpeningMessage(event.target.value)}
              rows={4}
            />
          </label>
          <button
            className="primaryButton full"
            type="button"
            disabled={busy || !selectedTenant}
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
              No project users yet. Create the first project owner with the
              admin token.
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
            <span>Your role can view users but not create or invite them.</span>
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

  function renderActiveTab() {
    if (!selectedTenant) {
      return (
        <section className="emptyWorkspace">
          <Bot size={28} />
          <h2>No tenant selected</h2>
          {renderSetupChecklist()}
        </section>
      );
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
                  data-active={authMode === "admin_token" ? "true" : "false"}
                  type="button"
                  onClick={() => setAuthMode("admin_token")}
                >
                  Admin token
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
              ) : (
                <form
                  className="authForm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void refreshTenants();
                  }}
                >
                  <label className="field">
                    <span>Admin token</span>
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
      <aside className="sidebar" id="primary-sidebar">
        <div className="brand">
          <span className="brandMark">
            <Bot size={20} />
          </span>
          <div>
            <strong>{APP_CONFIG.brand.name}</strong>
            <span>Communication Admin</span>
          </div>
          <button
            type="button"
            className="iconButton neutral sidebarClose"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <section className="sidebarSection">
          <div className="sectionTitle">
            <Globe2 size={16} />
            <span>Access</span>
          </div>

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

          <button
            className="textToggle"
            type="button"
            onClick={() => setShowAdvancedConnection((current) => !current)}
          >
            {showAdvancedConnection ? "Hide advanced" : "Advanced"}
          </button>

          {showAdvancedConnection ? (
            <label className="field">
              <span>API base</span>
              <input
                value={apiBase}
                onChange={(event) => setApiBase(event.target.value)}
              />
            </label>
          ) : null}

          <div
            className="connectionState"
            data-state={tenants.length ? "connected" : "idle"}
          >
            {tenants.length ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertCircle size={15} />
            )}
            <span>
              {tenants.length
                ? `${tenants.length} tenants loaded`
                : "Not connected"}
            </span>
          </div>

          <button
            className="primaryButton full"
            disabled={busy || (!adminToken && !adminSession)}
            onClick={refreshTenants}
          >
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            {tenants.length ? "Refresh tenants" : "Connect"}
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

          <a className="sidebarProductLink" href="/landing">
            <ExternalLink size={15} />
            Product page
          </a>
        </section>

        <section className="sidebarSection grow">
          <div className="sectionTitle">
            <Building2 size={16} />
            <span>Tenants</span>
            <span className="countPill">{tenants.length}</span>
          </div>

          <div className="tenantList">
            {tenants.length ? (
              tenants.map((tenant) => (
                <button
                  className={
                    tenant.id === selectedTenant?.id
                      ? "tenantButton active"
                      : "tenantButton"
                  }
                  key={tenant.id}
                  onClick={() => {
                    setSelectedTenantId(tenant.id);
                    setSidebarOpen(false);
                  }}
                >
                  <Building2 size={16} />
                  <span>{tenant.name}</span>
                  <small>{tenant.slug}</small>
                </button>
              ))
            ) : (
              <div className="emptyState compact">Connect to load tenants.</div>
            )}
          </div>
        </section>

        <details className="newTenant">
          <summary>
            <Plus size={16} />
            New tenant
          </summary>
          <form className="form" onSubmit={createTenant}>
            <label className="field">
              <span>Name</span>
              <input
                value={tenantName}
                onChange={(event) => setTenantName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Slug</span>
              <input
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
              />
            </label>
            <button className="secondaryButton" disabled={busy || !adminToken}>
              <Plus size={16} />
              Create tenant
            </button>
          </form>
        </details>
      </aside>

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

function DeleteKnowledgeModal({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  item: KnowledgeItem;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogA11y(true, onCancel);
  return (
    <div className="modalBackdrop" role="presentation">
      <section
        className="modalPanel"
        role="dialog"
        aria-modal="true"
        aria-label="Delete knowledge"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="panelTitle">
          <Trash2 size={18} />
          <h2>Delete knowledge</h2>
        </div>
        <p>{getQuestion(item)}</p>
        <div className="rowActions">
          <button className="secondaryButton" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dangerButton"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
