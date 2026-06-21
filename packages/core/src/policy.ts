import type { AllowedIntent, BlockedTopic, TenantPolicy } from "./types";

export const DEFAULT_ALLOWED_INTENTS: AllowedIntent[] = [
  {
    name: "opening_hours",
    description: "Questions about when the business is open or closed.",
    keywords: ["open", "opening", "hours", "closed", "today", "tomorrow", "weekend", "holiday"],
    examples: ["When are you open?", "Are you open on Saturday?"],
    enabled: true
  },
  {
    name: "company_information",
    description: "Questions about the company, team, policies, or general business profile.",
    keywords: ["company", "business", "team", "about", "policy", "information", "who"],
    examples: ["Tell me about your company.", "Who are you?"],
    enabled: true
  },
  {
    name: "services",
    description: "Questions about services, products, availability, booking, or offers.",
    keywords: ["service", "services", "offer", "provide", "available", "book", "booking", "repair", "install"],
    examples: ["Do you offer repairs?", "Can I book an appointment?"],
    enabled: true
  },
  {
    name: "prices",
    description: "Questions about approved prices or billing details.",
    keywords: ["price", "prices", "cost", "fee", "fees", "quote", "billing", "invoice"],
    examples: ["How much does it cost?", "Do you publish prices?"],
    enabled: true
  },
  {
    name: "locations",
    description: "Questions about addresses, service areas, directions, and locations.",
    keywords: ["location", "locations", "address", "where", "near", "area", "directions"],
    examples: ["Where are you located?", "Which areas do you serve?"],
    enabled: true
  },
  {
    name: "faq",
    description: "Questions that match approved tenant FAQs.",
    keywords: ["can", "do", "does", "is", "are", "how", "what", "which"],
    examples: ["Can you help with this?", "What documents do I need?"],
    enabled: true
  },
  {
    name: "handoff",
    description: "Requests to contact a human.",
    keywords: ["human", "person", "agent", "call", "email", "contact", "callback", "message"],
    examples: ["Can a person call me?", "I want to contact support."],
    enabled: true
  }
];

export const DEFAULT_BLOCKED_TOPICS: BlockedTopic[] = [
  {
    name: "general_knowledge",
    terms: ["capital of", "homework", "essay", "write code", "programming help", "random question"],
    response: "I can only answer questions about this business.",
    enabled: true
  },
  {
    name: "medical_legal_financial_advice",
    terms: ["diagnose", "legal advice", "investment advice", "tax advice", "prescription"],
    response: "I cannot provide that kind of advice. I can help with approved business information or pass a message to the team.",
    enabled: true
  }
];

export function createDefaultTenantPolicy(tenantId: string): TenantPolicy {
  return {
    tenantId,
    allowedIntents: DEFAULT_ALLOWED_INTENTS,
    blockedTopics: DEFAULT_BLOCKED_TOPICS,
    confidenceThreshold: 0.18,
    maxMessageLength: 1200,
    defaultLocale: "en",
    tone: "friendly",
    escalation: {
      enabled: true,
      contactLabel: "team",
      createHandoffRequest: true
    }
  };
}
