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
  Loader2,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
  consentEnabled?: boolean;
  consentText?: string;
  quickReplies?: string[];
  readinessEnabled?: boolean;
  readinessIntro?: string;
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
  externalUserId?: string | null;
  status: string;
  locale: string;
  createdAt: string;
  updatedAt?: string;
};

type ConversationMessage = {
  id: string;
  direction: string;
  role: string;
  content: string;
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
    notes?: Array<{ body: string; createdAt: string }>;
    [key: string]: unknown;
  };
  createdAt: string;
};

type TenantAnalytics = {
  conversations: number;
  messages: number;
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
  user: {
    email: string;
    name: string;
    role: "owner" | "admin" | "operator" | "viewer";
  };
  permissions: string[];
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

type TabKey =
  | "setup"
  | "overview"
  | "knowledge"
  | "leads"
  | "inbox"
  | "handoffs"
  | "test"
  | "widget"
  | "settings";

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

const productionApiBase = "https://assaddar-api-production.up.railway.app";
const defaultApiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? productionApiBase;
const defaultWidgetUrl =
  process.env.NEXT_PUBLIC_WIDGET_URL ??
  "https://assaddar-widget-production.up.railway.app/widget.js";
const defaultSiteUrl = "https://www.assad-dar.de/de";

const tabs: Array<{ key: TabKey; label: string; icon: typeof BarChart3 }> = [
  { key: "setup", label: "Setup", icon: ClipboardCheck },
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "knowledge", label: "Knowledge", icon: Database },
  { key: "leads", label: "Leads", icon: UserCheck },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "handoffs", label: "Handoffs", icon: AlertCircle },
  { key: "test", label: "Test", icon: MessageCircle },
  { key: "widget", label: "Widget", icon: Code2 },
  { key: "settings", label: "Settings", icon: Settings },
];

const sampleQuestions = [
  "Can you help us automate customer support?",
  "What kind of AI projects do you implement?",
  "Can we book a consultation?",
  "How do you handle data privacy?",
];

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
  "company",
  "projectType",
  "budget",
  "timeline",
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
    | "consentText"
    | "readinessIntro"
  >
> & {
  leadCaptureEnabled: boolean;
  leadCaptureFields: string[];
  consentEnabled: boolean;
  quickReplies: string[];
  readinessEnabled: boolean;
} = {
  primaryColor: "#2557d6",
  backgroundColor: "#ffffff",
  textColor: "#111827",
  launcherLabel: "AI Beratung",
  openingMessage:
    "Hallo, ich bin der Assaddar AI Assistent. Wie kann ich bei KI, Automatisierung oder Prozessberatung helfen?",
  language: "de",
  position: "bottom-right",
  assistantName: "Assaddar AI Consultant",
  leadCaptureEnabled: true,
  leadCaptureIntro:
    "Hinterlassen Sie kurz Ihre Daten, damit wir das passende KI-Projekt einschätzen können.",
  leadCaptureFields: ["name", "email", "company", "projectType", "budget"],
  ctaLabel: "Beratung anfragen",
  ctaUrl: "https://www.assad-dar.de/de",
  consentEnabled: true,
  consentText:
    "Dieser Assistent beantwortet Fragen mit freigegebenem Business-Wissen. Nachrichten koennen gespeichert werden, damit das Team nachfassen kann.",
  quickReplies: [
    "KI Beratung anfragen",
    "Use Case prüfen",
    "Datenschutz klären",
    "Termin buchen",
  ],
  readinessEnabled: true,
  readinessIntro:
    "Pruefen Sie kurz, ob Ihr Unternehmen bereit fuer ein sinnvolles KI-Automatisierungsprojekt ist.",
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
    return "Admin token rejected. Check the token and connect again.";
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
    company: "Company",
    projectType: "Project type",
    budget: "Budget",
    timeline: "Timeline",
    message: "Message",
  };
  return labels[value] ?? titleCase(value);
}

function mergeTheme(theme?: WidgetTheme) {
  return {
    ...defaultTheme,
    ...(theme ?? {}),
    leadCaptureFields: theme?.leadCaptureFields?.length
      ? theme.leadCaptureFields
      : defaultTheme.leadCaptureFields,
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

export default function DashboardPage() {
  const [apiBase, setApiBase] = useState(defaultApiBase);
  const [adminToken, setAdminToken] = useState("");
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
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
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [unansweredQuestions, setUnansweredQuestions] = useState<
    UnansweredQuestion[]
  >([]);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("setup");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeStatusFilter, setKnowledgeStatusFilter] =
    useState<KnowledgeStatusFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [handoffFilter, setHandoffFilter] = useState<HandoffFilter>("open");
  const [showAdvancedConnection, setShowAdvancedConnection] = useState(false);
  const [connectionAttempted, setConnectionAttempted] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] =
    useState<KnowledgeItem | null>(null);
  const [widgetPlatform, setWidgetPlatform] = useState<WidgetPlatform>("html");
  const [copiedSnippet, setCopiedSnippet] = useState("");
  const [siteUrl, setSiteUrl] = useState(defaultSiteUrl);
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
  const [tenantLocale, setTenantLocale] = useState(defaultTheme.language);
  const [tenantTone, setTenantTone] = useState<"friendly" | "neutral" | "formal">(
    "friendly",
  );
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.18);
  const [maxMessageLength, setMaxMessageLength] = useState(1200);
  const [retentionDays, setRetentionDays] = useState(365);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const normalizedApiBase = normalizeBaseUrl(apiBase);
  const selectedTenant = useMemo(
    () =>
      tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
    [selectedTenantId, tenants],
  );
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const openHandoffs = handoffs.filter((handoff) => handoff.status === "open");
  const leadHandoffs = handoffs.filter((handoff) =>
    ["lead_capture", "readiness_assessment"].includes(handoff.reason),
  );
  const openLeads = leadHandoffs.filter((handoff) => handoff.status === "open");
  const readinessLeads = handoffs.filter(
    (handoff) => handoff.reason === "readiness_assessment",
  );
  const unansweredCount = getUsageTotal(analytics, ["handoff", "refused"]);
  const answeredCount = getUsageTotal(analytics, ["answered"]);
  const handoffConversationIds = new Set(
    handoffs
      .filter((handoff) => handoff.status === "open")
      .map((handoff) => handoff.conversationId)
      .filter(Boolean),
  );
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
  };
  if (ctaLabel) {
    currentTheme.ctaLabel = ctaLabel;
  }
  if (ctaUrl) {
    currentTheme.ctaUrl = ctaUrl;
  }
  const statusKind = statusTone(status);

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

  const filteredHandoffs = handoffs.filter((handoff) => {
    if (handoffFilter === "all") {
      return true;
    }
    return handoff.status === handoffFilter;
  });

  const setupSteps = [
    {
      label: "Login",
      done: Boolean(adminToken),
      action: "Paste token",
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
      tab: "test" as TabKey,
    },
    {
      label: "Widget",
      done: Boolean(installCheck?.installed),
      action: "Verify install",
      tab: "widget" as TabKey,
    },
  ];
  const completedSteps = setupSteps.filter((step) => step.done).length;

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
    setConsentEnabled(theme.consentEnabled);
    setConsentText(theme.consentText);
    setQuickReplies(theme.quickReplies.join("\n"));
    setReadinessEnabled(theme.readinessEnabled);
    setReadinessIntro(theme.readinessIntro);
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

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${normalizedApiBase}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-admin-token": adminToken,
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
    if (!adminToken) {
      setStatus("Admin token required");
      return;
    }

    setBusy(true);
    try {
      const session = await apiFetch<AdminSession>("/admin/session");
      const nextTenants = await apiFetch<Tenant[]>("/admin/tenants");
      setAdminSession(session);
      setTenants(nextTenants);
      setConnectionAttempted(true);
      if (
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

  async function refreshWorkspace(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setKnowledge([]);
      setAnalytics(null);
      setConversations([]);
      setHandoffs([]);
      return;
    }

    await Promise.all([
      refreshKnowledge(tenantId),
      refreshAnalytics(tenantId),
      refreshConversations(tenantId),
      refreshHandoffs(tenantId),
      refreshUnanswered(tenantId),
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

  function toggleLeadField(field: string) {
    setLeadCaptureFields((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field],
    );
  }

  function draftFaqFromUnanswered(item: UnansweredQuestion) {
    setQuestion(item.question);
    setAnswer("");
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
    if (text) {
      await navigator.clipboard.writeText(text);
      setCopiedSnippet(label);
      setStatus(`${label} copied`);
    }
  }

  function renderMetrics() {
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

  function renderSetupWizard() {
    return (
      <div className="workspaceStack">
        <section className="panel launchWizard">
          <div className="panelHeader">
            <div className="panelTitle">
              <ClipboardCheck size={18} />
              <h2>Launch setup</h2>
            </div>
            <span className="countPill">
              {completedSteps}/{setupSteps.length}
            </span>
          </div>
          <div className="progressTrack large">
            <span
              style={{
                width: `${(completedSteps / setupSteps.length) * 100}%`,
              }}
            />
          </div>
          <div className="wizardSteps">
            {setupSteps.map((step, index) => (
              <button
                data-done={step.done ? "true" : "false"}
                key={step.label}
                type="button"
                onClick={() => setActiveTab(step.tab)}
              >
                <small>{index + 1}</small>
                <strong>{step.label}</strong>
                <span>{step.done ? "Complete" : step.action}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="quickStartGrid">
          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Sparkles size={18} />
                <h2>Assaddar starter pack</h2>
              </div>
            </div>
            <p className="mutedText">
              Add the approved consultancy baseline for services, process,
              privacy, pricing, and consultation capture.
            </p>
            <button
              className="primaryButton full"
              type="button"
              disabled={busy || !selectedTenant}
              onClick={importStarterKnowledge}
            >
              <Plus size={16} />
              Import starter FAQs
            </button>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Globe2 size={18} />
                <h2>Website check</h2>
              </div>
            </div>
            <label className="field">
              <span>Website URL</span>
              <input
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
              />
            </label>
            <div className="rowActions">
              <button
                className="secondaryButton"
                type="button"
                disabled={busy || !selectedTenant || !siteUrl}
                onClick={scanWebsiteForKnowledge}
              >
                <Upload size={16} />
                Import knowledge
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={busy || !selectedTenant || !siteUrl}
                onClick={verifyWidgetInstall}
              >
                <ShieldCheck size={16} />
                Verify widget
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
                <span>
                  {installCheck.installed
                    ? "Widget found on website"
                    : "Widget not detected yet"}
                </span>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  function renderOverview() {
    return (
      <div className="workspaceStack">
        {renderMetrics()}
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
                    onClick={() => setActiveTab("handoffs")}
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
                      setActiveTab("inbox");
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
                <h2>Answer quality</h2>
              </div>
              <span className="countPill">
                {answeredCount + unansweredCount}
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
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderKnowledge() {
    return (
      <div className="workspaceStack">
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
                <h2>Unanswered queue</h2>
              </div>
              <span className="countPill">{unansweredQuestions.length}</span>
            </div>
            <div className="suggestionStack">
              {unansweredQuestions.length ? (
                unansweredQuestions.slice(0, 8).map((item) => (
                  <article className="suggestionItem" key={item.id}>
                    <strong>{item.question}</strong>
                    <p>
                      {titleCase(item.reason)} · {item.channel} ·{" "}
                      {formatDate(item.createdAt)}
                    </p>
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => draftFaqFromUnanswered(item)}
                    >
                      <Plus size={15} />
                      Create FAQ draft
                    </button>
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

  function renderLeads() {
    return (
      <div className="workspaceStack">
        <section className="metricsGrid compactMetrics">
          <article className="metricCard">
            <UserCheck size={18} />
            <span>Total leads</span>
            <strong>{leadHandoffs.length}</strong>
          </article>
          <article className="metricCard" data-alert={openLeads.length ? "true" : "false"}>
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
                return (
                  <article className="leadCard" key={handoff.id}>
                    <div className="leadHeader">
                      <div>
                        <strong>
                          {details.find((item) => item.label === "Company")
                            ?.value ??
                            details.find((item) => item.label === "Name")
                              ?.value ??
                            "Website lead"}
                        </strong>
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
            {filteredConversations.length ? (
              filteredConversations.map((conversation) => (
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
                  <strong>{titleCase(conversation.channel)}</strong>
                  <span>
                    {conversation.externalUserId ?? conversation.publicId}
                  </span>
                  <small>{formatDate(conversation.createdAt)}</small>
                </button>
              ))
            ) : (
              <div className="emptyState compact">No conversations.</div>
            )}
          </div>

          <div className="transcriptPane">
            {selectedConversation ? (
              <>
                <div className="transcriptHeader">
                  <div>
                    <strong>{selectedConversation.publicId}</strong>
                    <span>
                      {titleCase(selectedConversation.channel)} ·{" "}
                      {selectedConversation.locale}
                    </span>
                  </div>
                  <span>{formatDate(selectedConversation.createdAt)}</span>
                </div>
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
                onClick={() =>
                  copyText(
                    currentSnippet,
                    `${titleCase(widgetPlatform)} snippet`,
                  )
                }
              >
                <Copy size={16} />
                {copiedSnippet ? "Copy again" : "Copy snippet"}
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
                onChange={(event) => setRetentionDays(Number(event.target.value))}
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
            disabled={busy || !adminToken}
            type="button"
            onClick={refreshTenants}
          >
            <RefreshCw size={16} />
            Reconnect
          </button>
        </section>
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

    if (activeTab === "setup") {
      return renderSetupWizard();
    }
    if (activeTab === "overview") {
      return renderOverview();
    }
    if (activeTab === "knowledge") {
      return renderKnowledge();
    }
    if (activeTab === "leads") {
      return renderLeads();
    }
    if (activeTab === "inbox") {
      return renderInbox();
    }
    if (activeTab === "handoffs") {
      return renderHandoffs();
    }
    if (activeTab === "test") {
      return renderTestStudio();
    }
    if (activeTab === "widget") {
      return renderWidget();
    }
    return renderSettings();
  }

  if (!adminToken || (!connectionAttempted && !tenants.length)) {
    return (
      <main className="authShell">
        <section className="authPanel">
          <div className="brand large">
            <span className="brandMark">
              <Bot size={22} />
            </span>
            <div>
              <strong>Assaddar AI</strong>
              <span>Consultancy assistant admin</span>
            </div>
          </div>
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
              onClick={() => setShowAdvancedConnection((current) => !current)}
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
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">
            <Bot size={20} />
          </span>
          <div>
            <strong>Assaddar AI</strong>
            <span>Communication Admin</span>
          </div>
        </div>

        <section className="sidebarSection">
          <div className="sectionTitle">
            <Globe2 size={16} />
            <span>Connection</span>
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
            disabled={busy || !adminToken}
            onClick={refreshTenants}
          >
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            {tenants.length ? "Refresh tenants" : "Connect"}
          </button>
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
                  onClick={() => setSelectedTenantId(tenant.id)}
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
          <div className="titleGroup">
            <span className="eyebrow">Workspace</span>
            <h1>{selectedTenant?.name ?? "Launch setup"}</h1>
            <p>
              {selectedTenant?.publicId ??
                "Connect, choose a tenant, add knowledge, and install the widget."}
            </p>
          </div>
          <span className="status" data-tone={statusKind}>
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

      {confirmDeleteItem ? (
        <div className="modalBackdrop" role="presentation">
          <section className="modalPanel" role="dialog" aria-modal="true">
            <div className="panelTitle">
              <Trash2 size={18} />
              <h2>Delete knowledge</h2>
            </div>
            <p>{getQuestion(confirmDeleteItem)}</p>
            <div className="rowActions">
              <button
                className="secondaryButton"
                type="button"
                onClick={() => setConfirmDeleteItem(null)}
              >
                Cancel
              </button>
              <button
                className="dangerButton"
                type="button"
                disabled={busy}
                onClick={() => deleteKnowledge(confirmDeleteItem)}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
