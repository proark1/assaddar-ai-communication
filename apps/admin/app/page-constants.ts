import { APP_CONFIG } from "./config";
import type {
  AuthMode,
  ChannelConnection,
  LeadPipelineStage,
} from "./page-types";

// Static UI data extracted from page.tsx (the admin dashboard monolith) so the
// component file stays focused on behaviour. These are plain constants with no
// runtime dependency on component state.

export const channelImplementationGuides: Partial<
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

export const channelExperienceDetails: Record<
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

export const authModeOrder = ["login", "signup"] as const satisfies AuthMode[];
export const authModeTabIds: Record<(typeof authModeOrder)[number], string> = {
  login: "auth-login-tab",
  signup: "auth-signup-tab",
};

export const sampleQuestions = APP_CONFIG.sampleQuestions;

export const businessKnowledgeChecks = [
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

export const leadFieldOptions = [
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

export const pipelineStages: Array<{ key: LeadPipelineStage; label: string }> =
  [
    { key: "new", label: "New" },
    { key: "contacted", label: "Contacted" },
    { key: "qualified", label: "Qualified" },
    { key: "proposal", label: "Proposal" },
    { key: "won", label: "Won" },
    { key: "lost", label: "Lost" },
  ];

export const listPageSize = 50;
