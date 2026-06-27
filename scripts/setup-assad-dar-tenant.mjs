const apiBaseUrl =
  process.env.API_BASE_URL ?? "https://assaddar-api-production.up.railway.app";
const adminToken = process.env.ADMIN_API_TOKEN;

if (!adminToken) {
  console.error("ADMIN_API_TOKEN is required.");
  process.exit(1);
}

const tenantSlug = "assad-dar-ai-consultancy";
const tenantInput = {
  name: "Assad Dar AI Consultancy",
  slug: tenantSlug,
  defaultLocale: "de",
  theme: {
    primaryColor: "#a66e2f",
    backgroundColor: "#ffffff",
    textColor: "#16191e",
    assistantName: "Assaddar AI Consultant",
    launcherLabel: "AI Beratung",
    openingMessage:
      "Hallo, ich bin der Assaddar AI Assistent. Ich helfe bei Fragen zu KI-Beratung, Automatisierung, Prozessen und der ASDAR Method.",
    language: "de",
    position: "bottom-right",
    leadCaptureEnabled: true,
    leadCaptureIntro:
      "Hinterlassen Sie kurz Ihre Daten, damit wir das passende KI-Projekt einschaetzen koennen.",
    leadCaptureFields: ["name", "email", "company", "projectType", "budget"],
    ctaLabel: "Beratung anfragen",
    ctaUrl: "https://www.assad-dar.de/de",
    bookingUrl: "https://www.assad-dar.de/de",
    consentEnabled: true,
    consentText:
      "Dieser Assistent beantwortet Fragen mit freigegebenem Business-Wissen. Nachrichten koennen gespeichert werden, damit das Team nachfassen kann.",
    quickReplies: [
      "KI Readiness pruefen",
      "Use Case pruefen",
      "Termin buchen",
      "Datenschutz klaeren",
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
  },
};

const faqs = [
  {
    question: "Was macht Assad Dar?",
    answer:
      "Assad Dar hilft Unternehmen, sinnvolle KI- und Automatisierungspotenziale zu erkennen, zu priorisieren und umzusetzen. Der Fokus liegt auf weniger manueller Arbeit, besseren Prozessen, nutzbaren Daten und pragmatischen Ergebnissen im täglichen Arbeitsalltag.",
    tags: ["assad-dar", "consultancy", "de", "services"],
  },
  {
    question: "Was ist die ASDAR Method?",
    answer:
      "Die ASDAR Method ist ein strukturierter Ansatz für KI- und Prozessvorhaben: Analysieren, Strukturieren, Digitalisieren, Automatisieren und Realisieren. Sie startet mit den bestehenden Abläufen und führt zu einer konkreten Roadmap mit umsetzbaren Automatisierungsfällen.",
    tags: ["assad-dar", "consultancy", "de", "method"],
  },
  {
    question: "Für wen ist das Angebot gedacht?",
    answer:
      "Das Angebot richtet sich an Unternehmen mit gewachsenen oder manuellen Prozessen, vielen E-Mails, Excel-Dateien, Dokumenten, wiederkehrenden Anfragen oder verteiltem Wissen. Es passt besonders für Mittelstand, regulierte Umfelder und Organisationen, die messbare Effizienz statt KI-Demos suchen.",
    tags: ["assad-dar", "consultancy", "de", "audience"],
  },
  {
    question: "Welche Ergebnisse liefert eine ASDAR Analyse?",
    answer:
      "Eine ASDAR Analyse liefert Klarheit über den Ist-Zustand, eine strukturierte Prozessübersicht, eine digitale Grundlage für Daten und Dokumente, eine priorisierte Liste von Automatisierungsfällen sowie eine Roadmap mit nächsten Umsetzungsschritten.",
    tags: ["assad-dar", "consultancy", "de", "outcomes"],
  },
  {
    question: "Welche Beispiele für KI und Automatisierung gibt es?",
    answer:
      "Typische Beispiele sind Angebots- und Proposal-Prozesse, Rechnungsverarbeitung, Sortierung von Anfragen und E-Mails, Wochenreports, Wissens- und Onboarding-Assistenten, Vertrags- und AGB-Prüfungen sowie Recruiting-Vorsortierung.",
    tags: ["assad-dar", "consultancy", "de", "examples"],
  },
  {
    question: "Welche Erfahrung bringt Assad Dar mit?",
    answer:
      "Assad Dar bringt 19 Jahre internationale Führungserfahrung an der Schnittstelle von IT und Business mit. Seine Erfahrung umfasst Rollen als Digital Lead bei Bayer, Director Global Digital Transformation bei Bionorica sowie Gründung und Führung von OYA Play und MoonGaming. Er hat mehr als 14 Millionen US-Dollar Kapital eingeworben und verbindet Konzern-Disziplin, Mittelstands-Pragmatismus und Gründer-Mentalität.",
    tags: ["assad-dar", "consultancy", "de", "experience"],
  },
  {
    question: "Welche Sprachen unterstützt Assad Dar?",
    answer:
      "Assad Dar arbeitet auf Deutsch und Englisch. Deutsch ist seine Muttersprache, Englisch spricht er fließend.",
    tags: ["assad-dar", "consultancy", "de", "languages"],
  },
  {
    question: "Wie kann ich Assad Dar kontaktieren?",
    answer:
      "Interessenten können Assad Dar per E-Mail unter assad.dar@gmail.com kontaktieren oder über die Website einen Termin beziehungsweise ein Erstgespräch anfragen.",
    tags: ["assad-dar", "consultancy", "de", "contact"],
  },
  {
    question: "What does Assad Dar do?",
    answer:
      "Assad Dar helps companies identify, prioritize, and implement practical AI and automation opportunities. The work focuses on reducing manual effort, improving business processes, making data usable, and creating measurable operating improvements.",
    tags: ["assad-dar", "consultancy", "en", "services"],
  },
  {
    question: "What is the ASDAR Method?",
    answer:
      "The ASDAR Method is a structured approach for AI and process transformation: Analyze, Structure, Digitalize, Automate, and Realize. It starts with existing workflows and turns them into a practical roadmap for implementation.",
    tags: ["assad-dar", "consultancy", "en", "method"],
  },
  {
    question: "Who is the offer for?",
    answer:
      "The offer is for organizations with manual or fragmented workflows, heavy email traffic, Excel-based processes, scattered documents, repeated requests, or knowledge that is hard to access. It is especially relevant for mid-sized companies, regulated environments, and teams that want measurable efficiency rather than AI demonstrations.",
    tags: ["assad-dar", "consultancy", "en", "audience"],
  },
  {
    question: "What outcomes do clients receive?",
    answer:
      "Clients receive a clear current-state view, a structured process overview, a digital basis for data and documents, a prioritized list of automation use cases, and a roadmap with concrete next steps.",
    tags: ["assad-dar", "consultancy", "en", "outcomes"],
  },
  {
    question: "Which use cases can be automated?",
    answer:
      "Typical use cases include proposals, invoice processing, inquiry and email sorting, weekly reporting, knowledge and onboarding assistants, contract or terms review, and recruiting pre-screening.",
    tags: ["assad-dar", "consultancy", "en", "examples"],
  },
  {
    question: "What experience does Assad Dar bring?",
    answer:
      "Assad Dar brings 19 years of international leadership experience at the intersection of IT and business. His background includes Bayer, Bionorica, OYA Play, and MoonGaming, more than 14 million US dollars raised, and hands-on work across AI-driven transformation, process architecture, commercial operating models, and digital business building.",
    tags: ["assad-dar", "consultancy", "en", "experience"],
  },
  {
    question: "Which languages are supported?",
    answer:
      "Assad Dar works in German and English. German is his native language and he is fluent in English.",
    tags: ["assad-dar", "consultancy", "en", "languages"],
  },
  {
    question: "How can I contact Assad Dar?",
    answer:
      "Prospects can contact Assad Dar by email at assad.dar@gmail.com or request an appointment or initial conversation through the website.",
    tags: ["assad-dar", "consultancy", "en", "contact"],
  },
];

async function apiFetch(path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}

async function main() {
  const tenants = await apiFetch("/admin/tenants");
  let tenant = tenants.find((item) => item.slug === tenantSlug);

  if (!tenant) {
    tenant = await apiFetch("/admin/tenants", {
      method: "POST",
      body: JSON.stringify(tenantInput),
    });
  } else {
    tenant = await apiFetch(`/admin/tenants/${tenant.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        defaultLocale: tenantInput.defaultLocale,
        tone: "friendly",
        confidenceThreshold: 0.18,
        maxMessageLength: 1200,
        retentionDays: 365,
        theme: tenantInput.theme,
      }),
    });
  }

  const knowledge = await apiFetch(`/admin/tenants/${tenant.id}/knowledge`);
  const existingQuestions = new Set(
    knowledge.map((item) => item.metadata?.question ?? item.title),
  );

  let added = 0;
  for (const faq of faqs) {
    if (existingQuestions.has(faq.question)) {
      continue;
    }

    await apiFetch(`/admin/tenants/${tenant.id}/knowledge/faqs`, {
      method: "POST",
      body: JSON.stringify(faq),
    });
    added += 1;
  }

  console.log("Assad Dar tenant ready:");
  console.log(`  tenant_id: ${tenant.id}`);
  console.log(`  public_assistant_id: ${tenant.publicId}`);
  console.log(`  faq_entries_added: ${added}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
