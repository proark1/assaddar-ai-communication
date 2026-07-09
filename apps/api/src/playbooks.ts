import type { WidgetThemeInput } from "./schemas";

export type PlaybookFaq = {
  question: string;
  answer: string;
  tags: string[];
};

export type CommunicationPlaybook = {
  key: "assad_dar_ai_consultancy";
  version: string;
  title: string;
  description: string;
  theme: WidgetThemeInput;
  faqs: PlaybookFaq[];
};

export type PlaybookPreviewInput = {
  tenant?: {
    id: string;
    name: string;
    slug?: string | null;
    theme?: WidgetThemeInput | null;
  } | null;
  knowledge: Array<{
    id: string;
    title?: string | null;
    content?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  overwrite?: boolean;
};

export type PlaybookPreview = {
  playbookKey: CommunicationPlaybook["key"];
  version: string;
  title: string;
  status: "ready" | "needs_review";
  changes: Array<{
    type: "theme" | "faq";
    action: "create" | "skip" | "overwrite";
    label: string;
    detail: string;
  }>;
  summary: {
    create: number;
    skip: number;
    overwrite: number;
  };
};

export const ASSAD_DAR_AI_CONSULTANCY_PLAYBOOK: CommunicationPlaybook = {
  key: "assad_dar_ai_consultancy",
  version: "2026-07-09",
  title: "Assad Dar AI Consultancy",
  description:
    "Starter knowledge, widget copy, and trust settings for Assad Dar AI Consultancy.",
  theme: {
    primaryColor: "#a66e2f",
    backgroundColor: "#ffffff",
    textColor: "#16191e",
    assistantName: "Assad Dar AI",
    openingMessage:
      "Hallo, ich bin der KI-Assistent von Assad Dar. Wobei kann ich helfen?",
    language: "de-DE",
    launcherLabel: "KI-Assistent",
    leadCaptureEnabled: true,
    leadCaptureIntro:
      "Teilen Sie kurz Ihr Ziel, dann meldet sich Assad Dar mit dem passenden naechsten Schritt.",
    leadCaptureFields: [
      "name",
      "email",
      "company",
      "projectType",
      "budget",
      "timeline",
      "message",
    ],
    consentEnabled: true,
    consentText:
      "Ich bin ein KI-Assistent. Nachrichten werden verarbeitet, damit Assad Dar Ihre Anfrage beantworten kann.",
    readinessEnabled: true,
    readinessIntro:
      "Beantworten Sie ein paar Fragen, damit wir die KI- und Automatisierungsreife einschaetzen koennen.",
    quickReplies: [
      "Was bietet Assad Dar an?",
      "Ich moechte ein KI-Projekt starten",
      "Wie laeuft die Beratung ab?",
      "Termin buchen",
    ],
    automation: {
      ownerLeadEmailEnabled: true,
      visitorConfirmationEmailEnabled: true,
      autoQualifyReadinessEnabled: true,
      autoQualifyLeadDetailsEnabled: true,
      weeklySummaryEmailEnabled: true,
      staleLeadReminderDays: 3,
      readinessQualificationScore: 70,
    },
  },
  faqs: [
    {
      question: "Was macht Assad Dar AI Consultancy?",
      answer:
        "Assad Dar AI Consultancy hilft Unternehmen, KI-Assistenten, Automatisierungen und digitale Kommunikationsprozesse sicher und praktisch einzufuehren.",
      tags: ["services", "consultancy", "ai"],
    },
    {
      question: "Welche Projekte eignen sich fuer den Start?",
      answer:
        "Ein guter Start sind wiederkehrende Kundenfragen, Lead-Qualifizierung, interne Wissenssuche, Terminvorbereitung oder einfache Prozessautomatisierungen mit klarem Nutzen.",
      tags: ["getting-started", "projects", "automation"],
    },
    {
      question: "Wie laeuft ein Erstgespraech ab?",
      answer:
        "Im Erstgespraech klaeren wir Ziel, Ausgangslage, Datenquellen, Risiken und den kleinsten sinnvollen Pilot. Danach erhalten Sie eine konkrete Empfehlung fuer den naechsten Schritt.",
      tags: ["sales", "discovery", "process"],
    },
    {
      question: "Arbeitet die KI mit freigegebenem Wissen?",
      answer:
        "Ja. Antworten sollen auf freigegebenem Wissen und klaren Regeln basieren. Unsichere oder sensible Anfragen werden an einen Menschen uebergeben.",
      tags: ["trust", "knowledge", "safety"],
    },
    {
      question: "Kann ein Mensch uebernehmen?",
      answer:
        "Ja. Wenn eine Anfrage komplex, dringend oder nicht sicher beantwortbar ist, kann ein Handoff an Assad Dar oder das zustaendige Team erfolgen.",
      tags: ["handoff", "support", "human"],
    },
  ],
};

export function getPlaybook(key: string): CommunicationPlaybook | null {
  return key === ASSAD_DAR_AI_CONSULTANCY_PLAYBOOK.key
    ? ASSAD_DAR_AI_CONSULTANCY_PLAYBOOK
    : null;
}

export function buildPlaybookPreview(
  playbook: CommunicationPlaybook,
  input: PlaybookPreviewInput,
): PlaybookPreview {
  const existingQuestions = new Set(
    input.knowledge.map((item) =>
      String(item.metadata?.question ?? item.title ?? "")
        .trim()
        .toLowerCase(),
    ),
  );
  const hasTheme = Boolean(
    input.tenant?.theme && Object.keys(input.tenant.theme).length,
  );
  const changes: PlaybookPreview["changes"] = [
    {
      type: "theme",
      action: !hasTheme ? "create" : input.overwrite ? "overwrite" : "skip",
      label: "Widget and assistant theme",
      detail: !hasTheme
        ? "Apply consultancy widget defaults"
        : input.overwrite
          ? "Replace saved widget defaults"
          : "Saved tenant theme stays unchanged",
    },
    ...playbook.faqs.map((faq) => {
      const exists = existingQuestions.has(faq.question.toLowerCase());
      return {
        type: "faq" as const,
        action: exists ? ("skip" as const) : ("create" as const),
        label: faq.question,
        detail: exists ? "Already present" : "Create approved starter FAQ",
      };
    }),
  ];
  const summary = {
    create: changes.filter((change) => change.action === "create").length,
    skip: changes.filter((change) => change.action === "skip").length,
    overwrite: changes.filter((change) => change.action === "overwrite").length,
  };
  return {
    playbookKey: playbook.key,
    version: playbook.version,
    title: playbook.title,
    status: summary.create || summary.overwrite ? "ready" : "needs_review",
    changes,
    summary,
  };
}
