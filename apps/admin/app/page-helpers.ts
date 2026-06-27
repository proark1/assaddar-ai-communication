import { BarChart3, Database, Globe2, Settings, UserCheck } from "lucide-react";
import { APP_CONFIG } from "./config";
import type {
  AdminDeepLink,
  ContactProfile,
  Handoff,
  HandoffFilter,
  KnowledgeItem,
  LeadPipelineStage,
  TabKey,
  TenantAnalytics,
  UnansweredQuestion,
  WhatsappCompliance,
  WidgetAutomationSettings,
  WidgetPlatform,
  WidgetTheme,
} from "./page-types";

// App-wide constants are consolidated in ./config (APP_CONFIG). These aliases
// keep the existing references throughout this file readable and unchanged.
export const defaultWidgetUrl = APP_CONFIG.api.widgetUrl;

export const tabs: Array<{
  key: TabKey;
  label: string;
  icon: typeof BarChart3;
}> = [
  { key: "home", label: "Today", icon: BarChart3 },
  { key: "leads", label: "Inbox", icon: UserCheck },
  { key: "knowledge", label: "Answers", icon: Database },
  { key: "channels", label: "Channels", icon: Globe2 },
  { key: "settings", label: "Setup", icon: Settings },
];

export const legacyTabMap: Record<string, TabKey> = {
  setup: "home",
  overview: "home",
  automation: "settings",
  inbox: "leads",
  handoffs: "leads",
  test: "settings",
  widget: "settings",
};

export const defaultTheme: Required<
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

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function statusTone(status: string) {
  if (!status) {
    return "neutral";
  }

  return /failed|required|error|unauthorized|forbidden|not found|not allowed|wrong|unreachable|rejected/i.test(
    status,
  )
    ? "danger"
    : "success";
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "No activity yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getQuestion(item: KnowledgeItem) {
  return item.metadata?.question ?? item.title ?? "Knowledge item";
}

export function getAnswer(item: KnowledgeItem) {
  return item.metadata?.answer ?? item.content;
}

export function getKnowledgeText(item: KnowledgeItem) {
  return `${getQuestion(item)} ${getAnswer(item)} ${item.tags.join(" ")}`;
}

export function parseTags(value: string) {
  const tags = value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return tags.length ? Array.from(new Set(tags)) : ["faq"];
}

export function parseFaqImport(value: string) {
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

export function readableError(error: unknown) {
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

export function getAnswerWarnings(
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

export function suggestFaqAnswerFromUnanswered(item: UnansweredQuestion) {
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

export function findBestKnowledgeMatch(
  message: string,
  items: KnowledgeItem[],
) {
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

export function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function fieldLabel(value: string) {
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

export function mergeTheme(theme?: WidgetTheme) {
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

export function getUsageTotal(
  analytics: TenantAnalytics | null,
  eventTypes: string[],
) {
  return (
    analytics?.usageByStatus
      .filter((event) => eventTypes.includes(event.eventType))
      .reduce((total, event) => total + event.total, 0) ?? 0
  );
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value)}%`;
}

export function rate(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

export function parseLeadDetails(message: string) {
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

export function getLeadDetailValue(handoff: Handoff, label: string) {
  const normalizedLabel = label.toLowerCase();
  return (
    parseLeadDetails(handoff.requesterMessage).find(
      (item) => item.label.toLowerCase() === normalizedLabel,
    )?.value ?? ""
  );
}

export function getLeadContactEmail(handoff: Handoff) {
  const emailDetail =
    parseLeadDetails(handoff.requesterMessage).find((item) =>
      item.label.toLowerCase().includes("email"),
    )?.value ?? "";
  return emailDetail.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ?? "";
}

export function getLeadContactPhone(handoff: Handoff) {
  return (
    parseLeadDetails(handoff.requesterMessage).find((item) =>
      item.label.toLowerCase().includes("phone"),
    )?.value ?? ""
  );
}

export function buildLeadSummary(handoff: Handoff) {
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

export function getLeadDisplayName(handoff: Handoff) {
  return (
    getLeadDetailValue(handoff, "Name") ||
    getLeadDetailValue(handoff, "Company") ||
    "Website lead"
  );
}

export function groupUnansweredQuestions(items: UnansweredQuestion[]) {
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

export function isLeadOlderThan(handoff: Handoff, days: number) {
  const createdAt = new Date(handoff.createdAt).getTime();
  if (!Number.isFinite(createdAt)) {
    return false;
  }
  return Date.now() - createdAt >= days * 24 * 60 * 60 * 1000;
}

export function isLeadRecent(handoff: Handoff, days: number) {
  const createdAt = new Date(handoff.createdAt).getTime();
  if (!Number.isFinite(createdAt)) {
    return false;
  }
  return Date.now() - createdAt <= days * 24 * 60 * 60 * 1000;
}

export function getLeadFollowUpDate(handoff: Handoff) {
  const notes = handoff.metadata?.notes ?? [];
  for (const note of [...notes].reverse()) {
    const match = note.body.match(/Follow up on (\d{4}-\d{2}-\d{2})/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "";
}

export function isFollowUpDue(handoff: Handoff) {
  const followUpDate = getLeadFollowUpDate(handoff);
  if (!followUpDate || ["resolved", "dismissed"].includes(handoff.status)) {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  return followUpDate <= today;
}

export function getLeadScore(handoff: Handoff) {
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

export function getLeadNextStep(handoff: Handoff) {
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

export function getContactDisplayName(
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

export function getContactSubtitle(contact?: ContactProfile | null) {
  return [contact?.email, contact?.phone, contact?.company]
    .filter(Boolean)
    .join(" · ");
}

export function formatWindowState(compliance: WhatsappCompliance | null) {
  if (!compliance?.lastInboundAt) {
    return "No inbound WhatsApp message yet";
  }
  if (compliance.canUseFreeformReply) {
    return `Freeform reply until ${formatDate(compliance.windowClosesAt)}`;
  }
  return "Template required for next reply";
}

export function extractTemplateVariablesFromBody(body: string) {
  return Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

export function buildLeadReplyDraft(
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

export function buildMailtoHref(email: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export function buildFollowUpIcs(handoff: Handoff, date: string) {
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

export function getPipelineStage(handoff: Handoff): LeadPipelineStage {
  return handoff.metadata?.pipelineStage ?? "new";
}

export function getPriority(handoff: Handoff) {
  const text = `${handoff.reason} ${handoff.requesterMessage}`.toLowerCase();

  if (/urgent|call|phone|complaint|angry|legal|privacy|dsgvo/.test(text)) {
    return "High";
  }
  if (handoff.status === "open") {
    return "Normal";
  }
  return "Low";
}

export function buildWidgetSnippets(
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

export function readAdminDeepLink(): AdminDeepLink {
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

export function isTabKey(value: string | null): value is TabKey {
  return tabs.some((tab) => tab.key === value);
}

export function normalizeTabKey(value: string | null): TabKey | undefined {
  if (!value) {
    return undefined;
  }
  if (isTabKey(value)) {
    return value;
  }
  return legacyTabMap[value];
}

export function isHandoffFilter(value: string): value is HandoffFilter {
  return ["open", "in_progress", "resolved", "all"].includes(value);
}
