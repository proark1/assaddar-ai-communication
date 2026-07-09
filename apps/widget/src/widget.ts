type WidgetTheme = {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  launcherLabel?: string;
  openingMessage?: string;
  language?: string;
  locale?: string;
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
};

type WidgetConfig = {
  assistantId: string;
  tenantName: string;
  defaultLocale: string;
  theme: WidgetTheme;
  limits: {
    maxMessageLength: number;
  };
};

type ChatResponse = {
  conversationId: string;
  status: "answered" | "refused" | "handoff";
  reply: string;
  handoffRecommended: boolean;
  // "human" when an operator has taken over the conversation: the AI stays
  // silent (empty reply) and the operator's replies arrive via polling.
  handledBy?: "ai" | "human";
};

type OperatorMessagesResponse = {
  messages: Array<{ id: string; text: string; createdAt: string }>;
};

type LeadCaptureResponse = {
  conversationId: string;
  status: "captured";
};

type ReadinessResponse = {
  conversationId: string;
  status: "captured";
  score: number;
  recommendation: string;
  qualified?: boolean;
  bookingUrl?: string;
};

type StoredMessage = {
  role: "assistant" | "user";
  text: string;
};

type WidgetState = {
  visitorId: string;
  conversationId?: string;
  consentAccepted?: boolean;
  leadCaptured?: boolean;
  readinessCaptured?: boolean;
  openTracked?: boolean;
  // True once an operator has taken over, so the "connected to our team" note is
  // only shown once.
  humanHandling?: boolean;
  // ISO timestamp of the newest operator reply already shown; the poll cursor.
  operatorCursor?: string;
  sentAt: number[];
  messages: StoredMessage[];
  updatedAt: number;
};

type WidgetViewState = {
  consentVisible: boolean;
  modeChooserVisible: boolean;
  quickRepliesVisible: boolean;
  readinessVisible: boolean;
  leadCaptureVisible: boolean;
};

type StringKey =
  | "closeChat"
  | "clearConversation"
  | "sendMessage"
  | "launcherAriaLabel"
  | "panelAriaLabel"
  | "messagesAriaLabel"
  | "composerInputLabel"
  | "composerInputPlaceholder"
  | "consentText"
  | "consentAccept"
  | "intakePrompt"
  | "intakeQuestion"
  | "intakeQuestionDetail"
  | "intakeQuestionTag"
  | "intakeReadiness"
  | "intakeReadinessDetail"
  | "intakeReadinessTag"
  | "intakeLead"
  | "intakeLeadDetail"
  | "intakeLeadTag"
  | "intakeCta"
  | "intakeCtaDetail"
  | "intakeCtaTag"
  | "readinessIntro"
  | "readinessGoal"
  | "readinessProcessPain"
  | "readinessSystems"
  | "readinessTimeline"
  | "readinessBudget"
  | "readinessSubmit"
  | "leadIntro"
  | "leadSubmit"
  | "modeReadinessReply"
  | "modeLeadReply"
  | "modeQuestionReply"
  | "readinessScore"
  | "readinessQualifiedBooking"
  | "readinessQualifiedNoBooking"
  | "readinessError"
  | "leadThanks"
  | "leadBooking"
  | "leadError"
  | "chatError"
  | "chatRateLimited"
  | "typing"
  | "humanConnected"
  | "openingMessage"
  | "leadFieldName"
  | "leadFieldEmail"
  | "leadFieldPhone"
  | "leadFieldCompany"
  | "leadFieldProjectType"
  | "leadFieldBudget"
  | "leadFieldTimeline"
  | "leadFieldContactPreference"
  | "leadFieldMessage"
  | "contactPreferenceEmail"
  | "contactPreferencePhone"
  | "contactPreferenceVideoCall"
  | "formRequiredField"
  | "formInvalidEmail";

type StringSet = Record<StringKey, string>;

const STRINGS: Record<string, StringSet> = {
  de: {
    closeChat: "Chat schließen",
    clearConversation: "Verlauf löschen",
    sendMessage: "Nachricht senden",
    launcherAriaLabel: "Chat öffnen",
    panelAriaLabel: "Chat-Fenster",
    messagesAriaLabel: "Nachrichtenverlauf",
    composerInputLabel: "Ihre Nachricht",
    composerInputPlaceholder: "Nachricht schreiben …",
    consentText:
      "Dieser Assistent nutzt freigegebene Geschäftsinformationen und speichert Nachrichten, damit das Team nachfassen kann.",
    consentAccept: "Akzeptieren",
    intakePrompt: "Was möchten Sie als Nächstes tun?",
    intakeQuestion: "Eine Frage stellen",
    intakeQuestionDetail: "Antwort aus freigegebenem Wissen erhalten.",
    intakeQuestionTag: "Chat",
    intakeReadiness: "KI-Readiness prüfen",
    intakeReadinessDetail: "In wenigen Fragen Projektchancen einschaetzen.",
    intakeReadinessTag: "Check",
    intakeLead: "Beratung anfragen",
    intakeLeadDetail: "Kontaktdaten senden und passend nachfassen lassen.",
    intakeLeadTag: "Kontakt",
    intakeCta: "Termin buchen",
    intakeCtaDetail: "Direkt einen passenden Beratungstermin oeffnen.",
    intakeCtaTag: "Termin",
    readinessIntro:
      "Prüfen Sie, ob Ihr Unternehmen bereit für ein sinnvolles KI-Automatisierungsprojekt ist.",
    readinessGoal: "Wichtigstes KI-Ziel",
    readinessProcessPain: "Aufwendigster manueller Prozess",
    readinessSystems: "Aktuelle Systeme, Tools oder Datenquellen",
    readinessTimeline: "Zeitrahmen",
    readinessBudget: "Budgetrahmen",
    readinessSubmit: "Readiness prüfen",
    leadIntro: "Hinterlassen Sie Ihre Daten und wir melden uns bei Ihnen.",
    leadSubmit: "Daten senden",
    modeReadinessReply:
      "Gerne. Beantworten Sie kurz die Fragen, dann schätze ich die KI-Readiness ein.",
    modeLeadReply:
      "Gerne. Hinterlassen Sie kurz Ihre Daten, dann kann Assad Dar passend nachfassen.",
    modeQuestionReply: "Stellen Sie Ihre Frage direkt hier im Chat.",
    readinessScore: "KI-Readiness-Score: {score}/100. {recommendation}",
    readinessQualifiedBooking:
      "Das sieht nach einem qualifizierten Use Case aus. Hier können Sie direkt einen Termin buchen: {url}",
    readinessQualifiedNoBooking:
      "Das sieht nach einem qualifizierten Use Case aus. Der nächste sinnvolle Schritt ist ein kurzes Erstgespräch.",
    readinessError:
      "Ich konnte den Readiness-Check gerade nicht absenden. Bitte versuchen Sie es später erneut.",
    leadThanks:
      "Danke. Ihre Anfrage ist angekommen und wird von Assad Dar geprüft.",
    leadBooking:
      "Wenn Sie möchten, können Sie auch direkt einen Termin buchen: {url}",
    leadError:
      "Ich konnte Ihre Daten gerade nicht senden. Bitte versuchen Sie es später erneut.",
    chatError:
      "Ich kann diese Nachricht gerade nicht senden. Bitte versuchen Sie es später erneut.",
    chatRateLimited:
      "Bitte warten Sie einen Moment, bevor Sie weitere Nachrichten senden.",
    typing: "Schreibt ...",
    humanConnected:
      "Sie sind jetzt mit unserem Team verbunden. Wir antworten hier in Kürze.",
    openingMessage: "Hallo, wie kann ich helfen?",
    leadFieldName: "Name",
    leadFieldEmail: "E-Mail",
    leadFieldPhone: "Telefon",
    leadFieldCompany: "Unternehmen",
    leadFieldProjectType: "Projektart",
    leadFieldBudget: "Budget",
    leadFieldTimeline: "Zeitrahmen",
    leadFieldContactPreference: "Bevorzugter Kontakt",
    leadFieldMessage: "Nachricht",
    contactPreferenceEmail: "E-Mail",
    contactPreferencePhone: "Telefon",
    contactPreferenceVideoCall: "Videoanruf",
    formRequiredField: "Bitte füllen Sie dieses Feld aus.",
    formInvalidEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
  },
  en: {
    closeChat: "Close chat",
    clearConversation: "Clear conversation",
    sendMessage: "Send message",
    launcherAriaLabel: "Open chat",
    panelAriaLabel: "Chat window",
    messagesAriaLabel: "Message history",
    composerInputLabel: "Your message",
    composerInputPlaceholder: "Write a message …",
    consentText:
      "This assistant uses approved business information and stores messages so the team can follow up.",
    consentAccept: "Accept",
    intakePrompt: "What would you like to do next?",
    intakeQuestion: "Ask a question",
    intakeQuestionDetail: "Get an answer from approved business knowledge.",
    intakeQuestionTag: "Chat",
    intakeReadiness: "Check AI readiness",
    intakeReadinessDetail: "Estimate project fit in a few focused questions.",
    intakeReadinessTag: "Check",
    intakeLead: "Request a consultation",
    intakeLeadDetail: "Send your details so the team can follow up.",
    intakeLeadTag: "Contact",
    intakeCta: "Book a consultation",
    intakeCtaDetail: "Open the booking page for a direct next step.",
    intakeCtaTag: "Book",
    readinessIntro:
      "Check whether your company is ready for a useful AI automation project.",
    readinessGoal: "Main AI goal",
    readinessProcessPain: "Most painful manual process",
    readinessSystems: "Current systems, tools, or data sources",
    readinessTimeline: "Timeline",
    readinessBudget: "Budget range",
    readinessSubmit: "Check readiness",
    leadIntro: "Leave your details and we will follow up.",
    leadSubmit: "Send details",
    modeReadinessReply:
      "Happy to help. Answer a few quick questions and I'll estimate your AI readiness.",
    modeLeadReply:
      "Happy to help. Leave your details and Assad Dar will follow up.",
    modeQuestionReply: "Ask your question right here in the chat.",
    readinessScore: "AI readiness score: {score}/100. {recommendation}",
    readinessQualifiedBooking:
      "This looks like a qualified use case. You can book a meeting directly here: {url}",
    readinessQualifiedNoBooking:
      "This looks like a qualified use case. The next sensible step is a short intro call.",
    readinessError:
      "I couldn't submit the readiness check right now. Please try again later.",
    leadThanks:
      "Thanks. Your request has arrived and will be reviewed by Assad Dar.",
    leadBooking: "If you'd like, you can also book a meeting directly: {url}",
    leadError:
      "I couldn't send your details right now. Please try again later.",
    chatError: "I can't send this message right now. Please try again later.",
    chatRateLimited: "Please wait a moment before sending more messages.",
    typing: "Typing ...",
    humanConnected:
      "You're now connected to our team. We'll reply here shortly.",
    openingMessage: "Hi, how can I help?",
    leadFieldName: "Name",
    leadFieldEmail: "Email",
    leadFieldPhone: "Phone",
    leadFieldCompany: "Company",
    leadFieldProjectType: "Project type",
    leadFieldBudget: "Budget",
    leadFieldTimeline: "Timeline",
    leadFieldContactPreference: "Contact preference",
    leadFieldMessage: "Message",
    contactPreferenceEmail: "Email",
    contactPreferencePhone: "Phone",
    contactPreferenceVideoCall: "Video call",
    formRequiredField: "Please fill out this field.",
    formInvalidEmail: "Please enter a valid email address.",
  },
};

const DEFAULT_LOCALE = "de";
const STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_STORED_MESSAGES = 50;
const MAX_STORED_MESSAGE_LENGTH = 4000;
// How often the widget polls for operator ("human takeover") replies while the
// panel is open.
const OPERATOR_POLL_INTERVAL_MS = 5000;

function resolveLocale(locale?: string) {
  if (!locale) {
    return DEFAULT_LOCALE;
  }
  const normalized = locale.toLowerCase().split("-")[0] ?? DEFAULT_LOCALE;
  return normalized in STRINGS ? normalized : DEFAULT_LOCALE;
}

function makeTranslator(locale?: string) {
  const resolved = resolveLocale(locale);
  const fallback = STRINGS[DEFAULT_LOCALE] as StringSet;
  const primary = STRINGS[resolved] ?? fallback;
  return (key: StringKey, vars?: Record<string, string | number>): string => {
    const template = primary[key] ?? fallback[key] ?? "";
    if (!vars) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
      name in vars ? String(vars[name]) : match,
    );
  };
}

void (() => {
  const currentScript = findWidgetScript();
  const assistantId = currentScript?.dataset.assistantId;
  const apiBase = currentScript?.dataset.apiUrl ?? "https://api.example.com";

  if (assistantId) {
    bootWidget(assistantId, apiBase).catch((error) => {
      console.error("[AssaddarWidget]", error);
    });
  }

  async function bootWidget(publicAssistantId: string, baseUrl: string) {
    if (
      document.querySelector(
        `[data-assaddar-widget-root="${publicAssistantId}"]`,
      )
    ) {
      return;
    }

    const config = await fetchJson<WidgetConfig>(
      `${baseUrl}/widget/config/${publicAssistantId}`,
    );
    const locale =
      config.theme.locale ?? config.theme.language ?? config.defaultLocale;
    const t = makeTranslator(locale);
    const root = document.createElement("div");
    root.dataset.assaddarWidgetRoot = publicAssistantId;
    root.lang = resolveLocale(locale);
    document.body.appendChild(root);

    const shadow = root.attachShadow({ mode: "open" });
    const state = createState(
      publicAssistantId,
      config.theme.openingMessage ?? t("openingMessage"),
    );
    render(shadow, {
      apiBase: baseUrl,
      config,
      state,
    });
  }

  function render(
    shadow: ShadowRoot,
    context: {
      apiBase: string;
      config: WidgetConfig;
      state: WidgetState;
    },
  ) {
    const { config, state } = context;
    const locale =
      config.theme.locale ?? config.theme.language ?? config.defaultLocale;
    const t = makeTranslator(locale);
    const primaryColor = sanitizeCssColor(config.theme.primaryColor, "#2f6f73");
    const backgroundColor = sanitizeCssColor(
      config.theme.backgroundColor,
      "#ffffff",
    );
    const textColor = sanitizeCssColor(config.theme.textColor, "#16191e");
    const launcherLabel = config.theme.launcherLabel ?? "Chat";
    const assistantName = config.theme.assistantName ?? config.tenantName;
    const position = config.theme.position ?? "bottom-right";
    const leadFields = normalizeLeadFields(config.theme.leadCaptureFields);
    const maxMessageLength = sanitizeMaxMessageLength(
      config.limits.maxMessageLength,
    );
    const quickReplies = normalizeQuickReplies(config.theme.quickReplies);
    const viewState = getWidgetViewState(config.theme, state, quickReplies);
    const shellSide =
      position === "bottom-left"
        ? "left: 20px; right: auto;"
        : "right: 20px; left: auto;";

    shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .assaddar-shell :focus-visible {
        outline: 2px solid ${primaryColor};
        outline-offset: 2px;
        border-radius: 4px;
      }
      .assaddar-shell .close:focus-visible,
      .assaddar-shell .reset-history:focus-visible,
      .assaddar-shell .composer button:focus-visible,
      .assaddar-shell .launcher:focus-visible {
        outline-color: #fff;
        box-shadow: 0 0 0 2px ${primaryColor};
      }
      .assaddar-shell {
        position: fixed;
        z-index: 2147483000;
        ${shellSide}
        bottom: 16px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: ${textColor};
      }
      .launcher {
        border: 0;
        border-radius: 999px;
        background: ${primaryColor};
        color: #fff;
        min-width: 52px;
        height: 44px;
        padding: 0 15px;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 14px 34px rgba(22, 25, 30, 0.22);
      }
      .panel {
        display: none;
        width: min(380px, calc(100vw - 28px));
        max-height: min(620px, calc(100vh - 92px));
        background: ${backgroundColor};
        border: 1px solid rgba(22, 25, 30, 0.14);
        border-radius: 10px;
        box-shadow: 0 18px 50px rgba(22, 25, 30, 0.22);
        overflow: hidden;
      }
      .panel.open { display: flex; flex-direction: column; }
      .header {
        min-height: 58px;
        padding: 12px 14px;
        background: ${primaryColor};
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .header > div { min-width: 0; }
      .header-actions {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 6px;
      }
      .header strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        line-height: 1.15;
      }
      .header span { display: block; font-size: 12px; opacity: 0.88; }
      .close,
      .reset-history {
        flex: 0 0 auto;
        border: 0;
        background: rgba(255,255,255,0.18);
        color: #fff;
        width: 32px;
        height: 32px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      .reset-history {
        font-size: 15px;
        font-weight: 800;
      }
      .messages {
        flex: 1 1 auto;
        min-height: 96px;
        max-height: min(460px, calc(100vh - 280px));
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        background: #f7f5f1;
      }
      .bubble {
        max-width: 86%;
        border-radius: 8px;
        padding: 10px 12px;
        line-height: 1.45;
        font-size: 14px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .bubble.assistant {
        align-self: flex-start;
        background: #fff;
        border: 1px solid rgba(22, 25, 30, 0.12);
      }
      .bubble.user {
        align-self: flex-end;
        background: ${primaryColor};
        color: #fff;
      }
      .bubble.typing {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: rgba(22, 25, 30, 0.72);
      }
      .typing-dots {
        display: inline-flex;
        gap: 3px;
      }
      .typing-dots span {
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: currentColor;
        animation: assaddarPulse 900ms ease-in-out infinite;
      }
      .typing-dots span:nth-child(2) { animation-delay: 120ms; }
      .typing-dots span:nth-child(3) { animation-delay: 240ms; }
      @keyframes assaddarPulse {
        0%, 100% { opacity: 0.35; transform: translateY(0); }
        50% { opacity: 1; transform: translateY(-2px); }
      }
      .cta {
        display: inline-flex;
        align-self: flex-start;
        border-radius: 7px;
        background: rgba(47, 111, 115, 0.12);
        color: ${primaryColor};
        padding: 8px 10px;
        text-decoration: none;
        font-size: 13px;
        font-weight: 800;
      }
      .lead-form {
        display: none;
        flex: 0 0 auto;
        gap: 8px;
        border-top: 1px solid rgba(22, 25, 30, 0.12);
        background: #fff;
        padding: 12px;
      }
      .lead-form[data-visible="true"] { display: grid; }
	      .consent,
	      .intake-modes,
	      .readiness-form,
	      .quick-replies {
        display: none;
        gap: 8px;
        border-top: 1px solid rgba(22, 25, 30, 0.12);
        background: #fff;
        padding: 10px 12px;
	      }
	      .consent[data-visible="true"],
	      .intake-modes[data-visible="true"],
	      .readiness-form[data-visible="true"],
	      .quick-replies[data-visible="true"] { display: grid; }
	      .consent p,
	      .intake-modes p,
	      .readiness-form p {
        margin: 0;
        color: ${textColor};
        font-size: 12px;
        line-height: 1.4;
	      }
	      .consent button,
	      .intake-modes button,
	      .quick-replies button,
	      .readiness-form button {
        border: 1px solid rgba(22, 25, 30, 0.14);
        border-radius: 6px;
        background: #fff;
        color: ${primaryColor};
        min-height: 34px;
	        cursor: pointer;
	        font-weight: 800;
	      }
	      .intake-modes {
	        flex: 0 0 auto;
	        grid-template-columns: 1fr;
	      }
	      .intake-modes button {
	        display: grid;
	        grid-template-columns: minmax(0, 1fr) auto;
	        align-items: center;
	        min-height: 42px;
	        padding: 8px 10px;
	        text-align: left;
	      }
	      .intake-modes button span {
	        display: grid;
	        gap: 2px;
	        min-width: 0;
	        overflow: hidden;
	      }
	      .intake-modes button b {
	        overflow: hidden;
	        color: ${textColor};
	        text-overflow: ellipsis;
	        white-space: nowrap;
	        font-size: 13px;
	      }
	      .intake-modes button small {
	        color: rgba(22, 25, 30, 0.66);
	        font-size: 11px;
	        font-weight: 700;
	        line-height: 1.25;
	      }
	      .intake-modes button strong {
	        color: ${primaryColor};
	        font-size: 12px;
	      }
	      .quick-replies {
        flex: 0 0 auto;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .readiness-form {
        flex: 0 0 auto;
        max-height: min(330px, calc(100vh - 320px));
        overflow: auto;
      }
      .quick-replies button {
        min-width: 0;
        overflow: hidden;
        padding: 7px 10px;
        text-overflow: initial;
        white-space: normal;
        line-height: 1.15;
        font-size: 12px;
      }
      .quick-replies button[data-action="readiness"],
      .quick-replies button[data-action="lead"] {
        background: rgba(47, 111, 115, 0.12);
      }
	      .readiness-form input,
	      .readiness-form textarea,
	      .lead-form select,
	      .lead-form strong {
        display: block;
        color: ${textColor};
        font-size: 13px;
      }
	      .lead-form input,
	      .lead-form textarea,
	      .lead-form select,
	      .readiness-form input,
	      .readiness-form textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(22, 25, 30, 0.18);
        border-radius: 6px;
        min-height: 38px;
        padding: 8px 10px;
        outline: none;
        font: inherit;
        font-size: 13px;
        resize: vertical;
      }
	      .lead-form input:focus,
	      .lead-form textarea:focus,
	      .lead-form select:focus,
	      .readiness-form input:focus,
	      .readiness-form textarea:focus {
        border-color: ${primaryColor};
        box-shadow: 0 0 0 3px rgba(47, 111, 115, 0.16);
      }
      .lead-form button,
      .readiness-form button.primary {
        border: 0;
        border-radius: 6px;
        background: ${primaryColor};
        color: #fff;
        min-height: 38px;
        cursor: pointer;
        font-weight: 800;
      }
      .lead-form button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .composer {
        flex: 0 0 auto;
        display: grid;
        grid-template-columns: 1fr 44px;
        gap: 8px;
        padding: 10px;
        border-top: 1px solid rgba(22, 25, 30, 0.12);
        background: #fff;
      }
      .composer input {
        border: 1px solid rgba(22, 25, 30, 0.18);
        border-radius: 6px;
        min-height: 42px;
        padding: 0 11px;
        outline: none;
        font-size: 14px;
      }
      .composer input:focus {
        border-color: ${primaryColor};
        box-shadow: 0 0 0 3px rgba(47, 111, 115, 0.16);
      }
      .composer button {
        width: 44px;
        border-radius: 6px;
        border: 0;
        background: ${primaryColor};
        color: #fff;
        cursor: pointer;
        font-size: 18px;
      }
      .composer button:disabled { opacity: 0.5; cursor: not-allowed; }
      .sr-status {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      @media (max-width: 520px) {
        .assaddar-shell { right: 10px; left: 10px; bottom: 10px; }
        .panel {
          width: 100%;
          max-height: min(640px, calc(100vh - 24px));
          border-radius: 10px;
        }
        .messages { max-height: min(380px, calc(100vh - 250px)); }
        .readiness-form { max-height: min(290px, calc(100vh - 318px)); }
        .launcher { float: right; }
      }
      @media (prefers-reduced-motion: reduce) {
        .assaddar-shell *,
        .assaddar-shell *::before,
        .assaddar-shell *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }
    </style>
    <div class="assaddar-shell">
      <div class="panel" part="panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("panelAriaLabel"))}" tabindex="-1">
        <div class="header">
          <div>
            <strong>${escapeHtml(assistantName)}</strong>
            <span>${escapeHtml(resolveLocale(locale).toUpperCase())}</span>
          </div>
          <div class="header-actions">
            <button class="reset-history" type="button" aria-label="${escapeHtml(t("clearConversation"))}" title="${escapeHtml(t("clearConversation"))}">↺</button>
            <button class="close" type="button" aria-label="${escapeHtml(t("closeChat"))}">×</button>
          </div>
        </div>
        <div class="messages" part="messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="${escapeHtml(t("messagesAriaLabel"))}"></div>
	        <div class="consent" data-visible="${viewState.consentVisible ? "true" : "false"}">
	          <p>${escapeHtml(config.theme.consentText ?? t("consentText"))}</p>
	          <button type="button">${escapeHtml(t("consentAccept"))}</button>
	        </div>
	        <div class="intake-modes" data-visible="${viewState.modeChooserVisible ? "true" : "false"}" role="group" aria-label="${escapeHtml(t("intakePrompt"))}">
	          <p>${escapeHtml(t("intakePrompt"))}</p>
	          <button type="button" data-mode="question" aria-label="${escapeHtml(t("intakeQuestion"))}"><span><b>${escapeHtml(t("intakeQuestion"))}</b><small>${escapeHtml(t("intakeQuestionDetail"))}</small></span><strong>${escapeHtml(t("intakeQuestionTag"))}</strong></button>
	          ${
              Boolean(config.theme.readinessEnabled) && !state.readinessCaptured
                ? `<button type="button" data-mode="readiness" aria-label="${escapeHtml(t("intakeReadiness"))}"><span><b>${escapeHtml(t("intakeReadiness"))}</b><small>${escapeHtml(t("intakeReadinessDetail"))}</small></span><strong>${escapeHtml(t("intakeReadinessTag"))}</strong></button>`
                : ""
            }
	          ${
              Boolean(config.theme.leadCaptureEnabled) && !state.leadCaptured
                ? `<button type="button" data-mode="lead" aria-label="${escapeHtml(t("intakeLead"))}"><span><b>${escapeHtml(t("intakeLead"))}</b><small>${escapeHtml(t("intakeLeadDetail"))}</small></span><strong>${escapeHtml(t("intakeLeadTag"))}</strong></button>`
                : ""
            }
	          ${
              getPrimaryCtaUrl(config.theme)
                ? `<button type="button" data-mode="cta" aria-label="${escapeHtml(t("intakeCta"))}"><span><b>${escapeHtml(t("intakeCta"))}</b><small>${escapeHtml(t("intakeCtaDetail"))}</small></span><strong>${escapeHtml(t("intakeCtaTag"))}</strong></button>`
                : ""
            }
	        </div>
	        <div class="quick-replies" data-visible="${viewState.quickRepliesVisible ? "true" : "false"}" role="group" aria-label="${escapeHtml(t("intakePrompt"))}">
	          ${quickReplies
              .map(
                (reply) =>
                  `<button type="button" data-action="${inferQuickReplyAction(reply)}" aria-label="${escapeHtml(reply)}">${escapeHtml(reply)}</button>`,
              )
              .join("")}
        </div>
        <form class="readiness-form" data-visible="${viewState.readinessVisible ? "true" : "false"}" aria-label="${escapeHtml(t("readinessSubmit"))}">
          <p>${escapeHtml(config.theme.readinessIntro ?? t("readinessIntro"))}</p>
          <input name="goal" aria-label="${escapeHtml(t("readinessGoal"))}" placeholder="${escapeHtml(t("readinessGoal"))}" />
          <textarea name="processPain" rows="2" aria-label="${escapeHtml(t("readinessProcessPain"))}" placeholder="${escapeHtml(t("readinessProcessPain"))}"></textarea>
          <input name="systems" aria-label="${escapeHtml(t("readinessSystems"))}" placeholder="${escapeHtml(t("readinessSystems"))}" />
          <input name="timeline" aria-label="${escapeHtml(t("readinessTimeline"))}" placeholder="${escapeHtml(t("readinessTimeline"))}" />
          <input name="budget" aria-label="${escapeHtml(t("readinessBudget"))}" placeholder="${escapeHtml(t("readinessBudget"))}" />
          <button class="primary">${escapeHtml(t("readinessSubmit"))}</button>
        </form>
	        <form class="lead-form" data-visible="${viewState.leadCaptureVisible ? "true" : "false"}" aria-label="${escapeHtml(t("leadSubmit"))}">
	          <strong>${escapeHtml(config.theme.leadCaptureIntro ?? t("leadIntro"))}</strong>
	          ${leadFields.map((field) => renderLeadField(field, t)).join("")}
          <button>${escapeHtml(t("leadSubmit"))}</button>
        </form>
        <form class="composer">
          <input maxlength="${maxMessageLength}" autocomplete="off" aria-label="${escapeHtml(t("composerInputLabel"))}" placeholder="${escapeHtml(t("composerInputPlaceholder"))}" />
          <button type="submit" aria-label="${escapeHtml(t("sendMessage"))}">›</button>
        </form>
        <div class="sr-status" role="status" aria-live="polite"></div>
      </div>
      <button class="launcher" aria-label="${escapeHtml(launcherLabel)}" aria-haspopup="dialog" aria-expanded="false">${escapeHtml(launcherLabel)}</button>
    </div>
  `;

    const launcher = shadow.querySelector<HTMLButtonElement>(".launcher");
    const panel = shadow.querySelector<HTMLDivElement>(".panel");
    const close = shadow.querySelector<HTMLButtonElement>(".close");
    const reset = shadow.querySelector<HTMLButtonElement>(".reset-history");
    const messages = shadow.querySelector<HTMLDivElement>(".messages");
    const consent = shadow.querySelector<HTMLDivElement>(".consent");
    const consentButton =
      shadow.querySelector<HTMLButtonElement>(".consent button");
    const modeChooser = shadow.querySelector<HTMLDivElement>(".intake-modes");
    const modeButtons = shadow.querySelectorAll<HTMLButtonElement>(
      ".intake-modes button",
    );
    const quickRepliesNode =
      shadow.querySelector<HTMLDivElement>(".quick-replies");
    const quickReplyButtons = shadow.querySelectorAll<HTMLButtonElement>(
      ".quick-replies button",
    );
    const readinessForm =
      shadow.querySelector<HTMLFormElement>(".readiness-form");
    const leadForm = shadow.querySelector<HTMLFormElement>(".lead-form");
    const form = shadow.querySelector<HTMLFormElement>(".composer");
    const input = shadow.querySelector<HTMLInputElement>(".composer input");
    const sendButton =
      shadow.querySelector<HTMLButtonElement>(".composer button");
    const statusNode = shadow.querySelector<HTMLDivElement>(".sr-status");

    if (
      !launcher ||
      !panel ||
      !close ||
      !reset ||
      !messages ||
      !consent ||
      !modeChooser ||
      !quickRepliesNode ||
      !readinessForm ||
      !leadForm ||
      !form ||
      !input ||
      !sendButton ||
      !statusNode
    ) {
      throw new Error("Widget failed to initialize.");
    }

    const messagesEl = messages;
    const inputEl = input;
    const sendButtonEl = sendButton;
    const panelEl = panel;
    const launcherEl = launcher;
    const statusEl = statusNode;

    drawMessages(messagesEl, state.messages, context.config.theme);

    function openPanel() {
      panelEl.classList.add("open");
      launcherEl.style.display = "none";
      launcherEl.setAttribute("aria-expanded", "true");
      focusBestTarget();
      if (!state.openTracked) {
        state.openTracked = true;
        persistState(context.config.assistantId, state);
        void trackWidgetEvent(context, state, "widget_open");
      }
      // Watch for operator ("human takeover") replies while the panel is open.
      startOperatorPolling();
    }

    function closePanel() {
      panelEl.classList.remove("open");
      launcherEl.style.display = "inline-flex";
      launcherEl.setAttribute("aria-expanded", "false");
      launcherEl.focus();
      stopOperatorPolling();
    }

    launcher.addEventListener("click", openPanel);

    close.addEventListener("click", closePanel);

    reset.addEventListener("click", () => {
      resetState(state, config.theme.openingMessage ?? t("openingMessage"));
      persistState(context.config.assistantId, state);
      render(shadow, context);
    });

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key === "Tab") {
        trapFocus(event, panelEl);
      }
    });

    consentButton?.addEventListener("click", () => {
      state.consentAccepted = true;
      persistState(context.config.assistantId, state);
      applyWidgetView(
        { consent, modeChooser, quickRepliesNode, readinessForm, leadForm },
        getWidgetViewState(context.config.theme, state, quickReplies),
      );
    });

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode ?? "question";
        modeChooser.dataset.visible = "false";
        quickRepliesNode.dataset.visible = "false";
        readinessForm.dataset.visible = "false";
        leadForm.dataset.visible = "false";
        void trackWidgetEvent(context, state, "intake_mode_selected", { mode });

        if (mode === "readiness") {
          readinessForm.dataset.visible = "true";
          state.messages.push({
            role: "assistant",
            text: t("modeReadinessReply"),
          });
          persistState(context.config.assistantId, state);
          drawMessages(messagesEl, state.messages, context.config.theme);
          return;
        }

        if (mode === "lead") {
          leadForm.dataset.visible = "true";
          state.messages.push({
            role: "assistant",
            text: t("modeLeadReply"),
          });
          persistState(context.config.assistantId, state);
          drawMessages(messagesEl, state.messages, context.config.theme);
          return;
        }

        if (mode === "cta") {
          const ctaUrl = getPrimaryCtaUrl(context.config.theme);
          if (ctaUrl) {
            void trackWidgetEvent(context, state, "cta_clicked", {
              label: context.config.theme.ctaLabel ?? t("intakeCta"),
              url: ctaUrl,
            });
            state.messages.push({
              role: "assistant",
              text: t("leadBooking", { url: ctaUrl }),
            });
            persistState(context.config.assistantId, state);
            drawMessages(messagesEl, state.messages, context.config.theme);
            window.open(ctaUrl, "_blank", "noopener,noreferrer");
            return;
          }
        }

        if (quickReplyButtons.length) {
          quickRepliesNode.dataset.visible = "true";
        }
        state.messages.push({
          role: "assistant",
          text: t("modeQuestionReply"),
        });
        persistState(context.config.assistantId, state);
        drawMessages(messagesEl, state.messages, context.config.theme);
        inputEl.focus();
      });
    });

    quickReplyButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const reply = button.textContent?.trim() ?? "";
        const action = button.dataset.action ?? "message";
        void trackWidgetEvent(context, state, "quick_reply_clicked", {
          reply,
          action,
        });

        if (action === "readiness") {
          modeChooser.dataset.visible = "false";
          quickRepliesNode.dataset.visible = "false";
          readinessForm.dataset.visible = "true";
          leadForm.dataset.visible = "false";
          state.messages.push({
            role: "assistant",
            text: t("modeReadinessReply"),
          });
          persistState(context.config.assistantId, state);
          drawMessages(messagesEl, state.messages, context.config.theme);
          return;
        }

        if (action === "lead") {
          modeChooser.dataset.visible = "false";
          quickRepliesNode.dataset.visible = "false";
          leadForm.dataset.visible = "true";
          readinessForm.dataset.visible = "false";
          state.messages.push({
            role: "assistant",
            text: t("modeLeadReply"),
          });
          persistState(context.config.assistantId, state);
          drawMessages(messagesEl, state.messages, context.config.theme);
          return;
        }

        const ctaUrl = getPrimaryCtaUrl(context.config.theme);
        if (action === "cta" && ctaUrl) {
          void trackWidgetEvent(context, state, "cta_clicked", {
            label: context.config.theme.ctaLabel ?? reply,
            url: ctaUrl,
          });
          window.open(ctaUrl, "_blank", "noopener,noreferrer");
          return;
        }

        void sendChatMessage(reply);
      });
    });

    readinessForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateForm(readinessForm, t)) {
        return;
      }
      const answers: Record<string, string> = {};
      const formData = new FormData(readinessForm);
      for (const [key, value] of formData.entries()) {
        answers[key] = String(value).trim();
      }
      if (!Object.values(answers).some(Boolean)) {
        return;
      }

      const button =
        readinessForm.querySelector<HTMLButtonElement>("button.primary");
      if (button) {
        button.disabled = true;
      }

      try {
        const response = await fetchJson<ReadinessResponse>(
          `${context.apiBase}/widget/readiness`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              assistantId: context.config.assistantId,
              conversationId: state.conversationId,
              visitorId: state.visitorId,
              pageUrl: window.location.href,
              answers,
            }),
          },
        );
        state.conversationId = response.conversationId;
        state.readinessCaptured = true;
        const readinessBookingUrl =
          response.bookingUrl ?? getPrimaryCtaUrl(context.config.theme);
        state.messages.push({
          role: "assistant",
          text: [
            t("readinessScore", {
              score: response.score,
              recommendation: response.recommendation,
            }),
            response.qualified
              ? readinessBookingUrl
                ? t("readinessQualifiedBooking", { url: readinessBookingUrl })
                : t("readinessQualifiedNoBooking")
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
        persistState(context.config.assistantId, state);
        readinessForm.dataset.visible = "false";
        drawMessages(messagesEl, state.messages, context.config.theme);
      } catch {
        state.messages.push({
          role: "assistant",
          text: t("readinessError"),
        });
        drawMessages(messagesEl, state.messages, context.config.theme);
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    });

    leadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateForm(leadForm, t)) {
        return;
      }
      const fields: Record<string, string> = {};
      const formData = new FormData(leadForm);
      for (const [key, value] of formData.entries()) {
        fields[key] = String(value).trim();
      }

      if (!Object.values(fields).some(Boolean)) {
        return;
      }

      const button = leadForm.querySelector<HTMLButtonElement>("button");
      if (button) {
        button.disabled = true;
      }

      try {
        const response = await fetchJson<LeadCaptureResponse>(
          `${context.apiBase}/widget/leads`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              assistantId: context.config.assistantId,
              conversationId: state.conversationId,
              visitorId: state.visitorId,
              pageUrl: window.location.href,
              fields,
            }),
          },
        );

        state.conversationId = response.conversationId;
        state.leadCaptured = true;
        const leadBookingUrl = getPrimaryCtaUrl(context.config.theme);
        state.messages.push({
          role: "assistant",
          text: [
            t("leadThanks"),
            leadBookingUrl ? t("leadBooking", { url: leadBookingUrl }) : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
        persistState(context.config.assistantId, state);
        leadForm.dataset.visible = "false";
        drawMessages(messagesEl, state.messages, context.config.theme);
      } catch {
        state.messages.push({
          role: "assistant",
          text: t("leadError"),
        });
        drawMessages(messagesEl, state.messages, context.config.theme);
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    });

    let operatorPollTimer: ReturnType<typeof setInterval> | undefined;

    function startOperatorPolling() {
      if (operatorPollTimer || !state.conversationId) {
        return;
      }
      // Poll once immediately so a reply that landed while the panel was closed
      // appears on open, then keep polling on an interval.
      void pollOperatorRepliesOnce();
      operatorPollTimer = setInterval(() => {
        void pollOperatorRepliesOnce();
      }, OPERATOR_POLL_INTERVAL_MS);
    }

    function stopOperatorPolling() {
      if (operatorPollTimer) {
        clearInterval(operatorPollTimer);
        operatorPollTimer = undefined;
      }
    }

    async function pollOperatorRepliesOnce() {
      const conversationId = state.conversationId;
      if (!conversationId) {
        return;
      }
      let response: OperatorMessagesResponse;
      try {
        const params = new URLSearchParams({
          assistantId: context.config.assistantId,
        });
        if (state.operatorCursor) {
          params.set("since", state.operatorCursor);
        }
        response = await fetchJson<OperatorMessagesResponse>(
          `${context.apiBase}/widget/conversations/${encodeURIComponent(
            conversationId,
          )}/messages?${params.toString()}`,
        );
      } catch {
        // A transient failure is fine; the next tick retries.
        return;
      }
      if (!response.messages.length) {
        return;
      }
      for (const message of response.messages) {
        state.messages.push({ role: "assistant", text: message.text });
        state.operatorCursor = message.createdAt;
      }
      state.humanHandling = true;
      persistState(context.config.assistantId, state);
      drawMessages(messagesEl, state.messages, context.config.theme);
    }

    async function sendChatMessage(text: string) {
      if (!text) {
        return;
      }
      if (isClientRateLimited(state)) {
        state.messages.push({ role: "assistant", text: t("chatRateLimited") });
        persistState(context.config.assistantId, state);
        drawMessages(messagesEl, state.messages, context.config.theme);
        return;
      }

      inputEl.value = "";
      inputEl.disabled = true;
      sendButtonEl.disabled = true;
      state.messages.push({ role: "user", text });
      statusEl.textContent = t("typing");
      drawMessages(
        messagesEl,
        state.messages,
        context.config.theme,
        t("typing"),
      );
      state.sentAt.push(Date.now());

      try {
        const response = await fetchJson<ChatResponse>(
          `${context.apiBase}/widget/chat`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              assistantId: context.config.assistantId,
              conversationId: state.conversationId,
              visitorId: state.visitorId,
              locale:
                context.config.theme.language ?? context.config.defaultLocale,
              message: text,
            }),
          },
        );

        state.conversationId = response.conversationId;
        if (response.handledBy === "human" && !state.humanHandling) {
          // A human has taken over; note it once. The AI sends no reply now, so
          // there is no assistant bubble to add — the operator's replies arrive
          // through polling below.
          state.humanHandling = true;
          state.messages.push({ role: "assistant", text: t("humanConnected") });
        }
        if (response.reply) {
          state.messages.push({ role: "assistant", text: response.reply });
        }
        persistState(context.config.assistantId, state);
        // Ensure we are watching for the operator's reply (the panel is open).
        startOperatorPolling();
      } catch {
        state.messages.push({
          role: "assistant",
          text: t("chatError"),
        });
      } finally {
        inputEl.disabled = false;
        sendButtonEl.disabled = false;
        statusEl.textContent = "";
        drawMessages(messagesEl, state.messages, context.config.theme);
        inputEl.focus();
      }
    }

    function focusBestTarget() {
      if (window.matchMedia("(min-width: 641px)").matches) {
        inputEl.focus();
        return;
      }
      panelEl.focus();
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void sendChatMessage(inputEl.value.trim());
    });
  }

  function createState(
    assistantId: string,
    openingMessage: string,
  ): WidgetState {
    const stored = readState(assistantId);
    if (stored) {
      if (!stored.messages.length) {
        stored.messages = [{ role: "assistant", text: openingMessage }];
      }
      return stored;
    }

    return createInitialState(openingMessage);
  }

  function createInitialState(openingMessage: string): WidgetState {
    return {
      visitorId: createVisitorId(),
      sentAt: [] as number[],
      messages: [
        { role: "assistant", text: openingMessage },
      ] as StoredMessage[],
      updatedAt: Date.now(),
    };
  }

  function createVisitorId() {
    if (typeof crypto.randomUUID === "function") {
      return `visitor_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    }

    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(10);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      return `visitor_${token}`;
    }

    return `visitor_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }

  function resetState(state: WidgetState, openingMessage: string) {
    const next = createInitialState(openingMessage);
    state.visitorId = next.visitorId;
    delete state.conversationId;
    delete state.consentAccepted;
    delete state.leadCaptured;
    delete state.readinessCaptured;
    delete state.openTracked;
    delete state.humanHandling;
    delete state.operatorCursor;
    state.sentAt = next.sentAt;
    state.messages = next.messages;
    state.updatedAt = next.updatedAt;
  }

  function getWidgetViewState(
    theme: WidgetTheme,
    state: WidgetState,
    quickReplies: string[],
  ): WidgetViewState {
    const leadCaptureAvailable =
      Boolean(theme.leadCaptureEnabled) && !state.leadCaptured;
    const consentVisible =
      Boolean(theme.consentEnabled) && !state.consentAccepted;
    const hasQuickReplies = quickReplies.length > 0;
    const readinessAvailable =
      Boolean(theme.readinessEnabled) && !state.readinessCaptured;
    const ctaAvailable = Boolean(getPrimaryCtaUrl(theme));
    const modeChooserVisible =
      !consentVisible &&
      (hasQuickReplies ||
        readinessAvailable ||
        leadCaptureAvailable ||
        ctaAvailable) &&
      !state.leadCaptured &&
      !state.readinessCaptured;

    return {
      consentVisible,
      modeChooserVisible,
      quickRepliesVisible:
        hasQuickReplies && !consentVisible && !modeChooserVisible,
      readinessVisible:
        readinessAvailable &&
        !consentVisible &&
        !modeChooserVisible &&
        !hasQuickReplies,
      leadCaptureVisible:
        leadCaptureAvailable &&
        !consentVisible &&
        !modeChooserVisible &&
        !readinessAvailable &&
        !hasQuickReplies,
    };
  }

  function applyWidgetView(
    nodes: {
      consent: HTMLElement;
      modeChooser: HTMLElement;
      quickRepliesNode: HTMLElement;
      readinessForm: HTMLElement;
      leadForm: HTMLElement;
    },
    viewState: WidgetViewState,
  ) {
    setVisible(nodes.consent, viewState.consentVisible);
    setVisible(nodes.modeChooser, viewState.modeChooserVisible);
    setVisible(nodes.quickRepliesNode, viewState.quickRepliesVisible);
    setVisible(nodes.readinessForm, viewState.readinessVisible);
    setVisible(nodes.leadForm, viewState.leadCaptureVisible);
  }

  function setVisible(element: HTMLElement, visible: boolean) {
    element.dataset.visible = visible ? "true" : "false";
  }

  function readState(assistantId: string): WidgetState | null {
    try {
      const raw = window.localStorage.getItem(storageKey(assistantId));
      if (!raw) {
        return null;
      }
      const state = normalizeStoredState(JSON.parse(raw));
      if (!state) {
        window.localStorage.removeItem(storageKey(assistantId));
        return null;
      }
      if (Date.now() - state.updatedAt > STATE_TTL_MS) {
        window.localStorage.removeItem(storageKey(assistantId));
        return null;
      }
      return state;
    } catch {
      return null;
    }
  }

  function persistState(assistantId: string, state: WidgetState) {
    state.messages = trimStoredMessages(state.messages);
    state.sentAt = state.sentAt.filter((value) => Number.isFinite(value));
    state.updatedAt = Date.now();
    try {
      window.localStorage.setItem(
        storageKey(assistantId),
        JSON.stringify(state),
      );
    } catch {
      // Local storage can be disabled or full; the live widget still works.
    }
  }

  function normalizeStoredState(value: unknown): WidgetState | null {
    if (!isRecord(value) || typeof value.visitorId !== "string") {
      return null;
    }
    const sentAt = Array.isArray(value.sentAt)
      ? value.sentAt.filter((item): item is number => Number.isFinite(item))
      : [];
    const messages = Array.isArray(value.messages)
      ? trimStoredMessages(
          value.messages.flatMap((item): StoredMessage[] => {
            if (
              !isRecord(item) ||
              (item.role !== "assistant" && item.role !== "user") ||
              typeof item.text !== "string"
            ) {
              return [];
            }
            return [{ role: item.role, text: item.text }];
          }),
        )
      : [];

    return {
      visitorId: value.visitorId,
      ...(typeof value.conversationId === "string"
        ? { conversationId: value.conversationId }
        : {}),
      ...(value.consentAccepted === true ? { consentAccepted: true } : {}),
      ...(value.leadCaptured === true ? { leadCaptured: true } : {}),
      ...(value.readinessCaptured === true ? { readinessCaptured: true } : {}),
      ...(value.openTracked === true ? { openTracked: true } : {}),
      ...(value.humanHandling === true ? { humanHandling: true } : {}),
      ...(typeof value.operatorCursor === "string"
        ? { operatorCursor: value.operatorCursor }
        : {}),
      sentAt,
      messages,
      updatedAt:
        typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
          ? value.updatedAt
          : Date.now(),
    };
  }

  function trimStoredMessages(messages: StoredMessage[]) {
    return messages.slice(-MAX_STORED_MESSAGES).map((message) => ({
      role: message.role,
      text: message.text.slice(0, MAX_STORED_MESSAGE_LENGTH),
    }));
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function storageKey(assistantId: string) {
    return `assaddar_widget_${assistantId}`;
  }

  function drawMessages(
    container: HTMLElement,
    messages: StoredMessage[],
    theme?: WidgetTheme,
    pendingText?: string,
  ) {
    const fragment = document.createDocumentFragment();
    for (const message of messages) {
      const bubble = document.createElement("div");
      bubble.className = `bubble ${message.role}`;
      bubble.textContent = message.text;
      fragment.appendChild(bubble);
    }

    if (pendingText) {
      const bubble = document.createElement("div");
      bubble.className = "bubble assistant typing";
      bubble.setAttribute("aria-label", pendingText);
      const label = document.createElement("span");
      label.textContent = pendingText;
      const dots = document.createElement("span");
      dots.className = "typing-dots";
      dots.setAttribute("aria-hidden", "true");
      dots.append(
        document.createElement("span"),
        document.createElement("span"),
        document.createElement("span"),
      );
      bubble.append(label, dots);
      fragment.appendChild(bubble);
    }

    const ctaUrl = getPrimaryCtaUrl(theme);
    if (ctaUrl && theme?.ctaLabel) {
      const cta = document.createElement("a");
      cta.className = "cta";
      cta.href = ctaUrl;
      cta.target = "_blank";
      cta.rel = "noreferrer noopener";
      cta.textContent = theme.ctaLabel;
      fragment.appendChild(cta);
    }

    container.replaceChildren(fragment);
    container.scrollTop = container.scrollHeight;
  }

  function trapFocus(event: KeyboardEvent, container: HTMLElement) {
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        [
          "button:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          "a[href]",
          '[tabindex]:not([tabindex="-1"])',
        ].join(","),
      ),
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const root = container.getRootNode();
    const active =
      root instanceof ShadowRoot ? root.activeElement : document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function getPrimaryCtaUrl(theme?: WidgetTheme) {
    return sanitizeUrl(theme?.bookingUrl ?? theme?.ctaUrl);
  }

  function normalizeLeadFields(fields?: string[]) {
    const defaults = [
      "name",
      "email",
      "company",
      "projectType",
      "timeline",
      "contactPreference",
    ];
    const values = fields?.length ? fields : defaults;
    return Array.from(
      new Set(
        values
          .map((field) => normalizeLeadFieldName(field))
          .filter((field): field is string => Boolean(field)),
      ),
    ).slice(0, 8);
  }

  function renderLeadField(
    field: string,
    t: (key: StringKey, vars?: Record<string, string | number>) => string,
  ) {
    const label = escapeHtml(leadFieldLabel(field, t));
    const fieldName = escapeHtml(field);
    if (field === "message") {
      return `<textarea name="${fieldName}" rows="3" aria-label="${label}" placeholder="${label}"></textarea>`;
    }
    if (field === "contactPreference") {
      const email = escapeHtml(t("contactPreferenceEmail"));
      const phone = escapeHtml(t("contactPreferencePhone"));
      const videoCall = escapeHtml(t("contactPreferenceVideoCall"));
      return `<select name="${fieldName}" aria-label="${label}"><option value="">${label}</option><option value="Email">${email}</option><option value="Phone">${phone}</option><option value="Video call">${videoCall}</option></select>`;
    }
    const inputType =
      field === "email" ? "email" : field === "phone" ? "tel" : "text";
    const required = field === "name" || field === "email" ? "required" : "";
    return `<input name="${fieldName}" type="${inputType}" ${required} aria-label="${label}" placeholder="${label}" />`;
  }

  function normalizeQuickReplies(replies?: string[]) {
    const defaults = [
      "KI Readiness prüfen",
      "Use Case prüfen",
      "Termin buchen",
      "Datenschutz klären",
      "Beratung anfragen",
    ];
    const values = replies?.length ? replies : defaults;
    return Array.from(
      new Set(values.map((reply) => reply.trim()).filter(Boolean)),
    ).slice(0, 8);
  }

  function inferQuickReplyAction(reply: string) {
    const text = reply.toLowerCase();
    if (/(readiness|bereit|prüfen|pruefen|use case|use-case)/.test(text)) {
      return "readiness";
    }
    if (/(beratung|anfragen|kontakt|angebot|budget|projekt)/.test(text)) {
      return "lead";
    }
    if (/(termin|call|buchen|meeting)/.test(text)) {
      return "cta";
    }
    return "message";
  }

  async function trackWidgetEvent(
    context: {
      apiBase: string;
      config: WidgetConfig;
    },
    state: WidgetState,
    eventType:
      | "widget_open"
      | "quick_reply_clicked"
      | "cta_clicked"
      | "intake_mode_selected",
    metadata: Record<string, unknown> = {},
  ) {
    const payload = JSON.stringify({
      assistantId: context.config.assistantId,
      conversationId: state.conversationId,
      visitorId: state.visitorId,
      pageUrl: window.location.href,
      eventType,
      metadata,
    });
    const url = `${context.apiBase}/widget/events`;

    try {
      if (navigator.sendBeacon) {
        const queued = navigator.sendBeacon(
          url,
          new Blob([payload], { type: "application/json" }),
        );
        if (queued) {
          return;
        }
      }

      await fetch(url, {
        method: "POST",
        keepalive: true,
        headers: {
          "content-type": "application/json",
        },
        body: payload,
      });
    } catch {
      // Analytics must never block the visitor experience.
    }
  }

  function leadFieldLabel(
    field: string,
    t: (key: StringKey, vars?: Record<string, string | number>) => string,
  ) {
    const labels: Record<string, StringKey> = {
      name: "leadFieldName",
      email: "leadFieldEmail",
      phone: "leadFieldPhone",
      company: "leadFieldCompany",
      projectType: "leadFieldProjectType",
      budget: "leadFieldBudget",
      timeline: "leadFieldTimeline",
      contactPreference: "leadFieldContactPreference",
      message: "leadFieldMessage",
    };
    const key = labels[field];
    if (key) {
      return t(key);
    }
    return field
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim();
  }

  // Surface inline browser validation (required fields, invalid email) before
  // hitting the network, with localized custom messages. Returns true when the
  // form is valid and submission may proceed.
  function validateForm(
    form: HTMLFormElement,
    t: (key: StringKey, vars?: Record<string, string | number>) => string,
  ): boolean {
    const controls = form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select");
    controls.forEach((control) => {
      control.setCustomValidity("");
      if (control.validity.valueMissing) {
        control.setCustomValidity(t("formRequiredField"));
      } else if (control.validity.typeMismatch) {
        control.setCustomValidity(t("formInvalidEmail"));
      }
    });
    return form.reportValidity();
  }

  function isClientRateLimited(state: WidgetState) {
    const now = Date.now();
    state.sentAt = state.sentAt.filter((value: number) => now - value < 60_000);
    return state.sentAt.length >= 10;
  }

  function delay(ms: number) {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  // Retry only transient failures: network errors (fetch rejects) and 5xx
  // server responses. 4xx responses are returned to the caller unchanged so
  // they are never retried, which keeps client-side rate limiting intact.
  async function fetchWithRetry(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    // Declared inside the function so they are initialised at call time.
    // fetchWithRetry is hoisted and runs during boot before a module/closure
    // const declared further down would be initialised (temporal dead zone).
    const MAX_FETCH_RETRIES = 2;
    const RETRY_BASE_DELAY_MS = 300;
    const FETCH_TIMEOUT_MS = 15_000;
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt += 1) {
      const timeout = createTimeoutSignal(init?.signal, FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          ...init,
          signal: timeout.signal,
        });
        if (response.status >= 500 && attempt < MAX_FETCH_RETRIES) {
          await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_FETCH_RETRIES) {
          await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
      } finally {
        timeout.clear();
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Network error");
  }

  function createTimeoutSignal(
    signal: AbortSignal | null | undefined,
    ms: number,
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeoutId = window.setTimeout(abort, ms);
    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener("abort", abort, { once: true });
    }
    return {
      signal: controller.signal,
      clear() {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener("abort", abort);
      },
    };
  }

  async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetchWithRetry(url, init);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return response.json() as Promise<T>;
  }

  function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
      const replacements: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return replacements[character] ?? character;
    });
  }

  const SAFE_LEAD_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

  function normalizeLeadFieldName(value: string): string | null {
    const trimmed = value.trim();
    if (!SAFE_LEAD_FIELD_NAME.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  function sanitizeMaxMessageLength(value: unknown) {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : 1200;
    if (!Number.isFinite(parsed)) {
      return 1200;
    }
    return Math.min(4000, Math.max(200, Math.trunc(parsed)));
  }

  function sanitizeCssColor(value: string | undefined, fallback: string) {
    const candidate = value?.trim();
    if (!candidate) {
      return fallback;
    }
    if (
      candidate.length > 64 ||
      /[<>{};]/.test(candidate) ||
      /\b(?:expression|url|import)\s*\(/i.test(candidate)
    ) {
      return fallback;
    }
    if (window.CSS?.supports?.("color", candidate)) {
      return candidate;
    }
    return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(candidate)
      ? candidate
      : fallback;
  }

  const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

  // Validate a theme/admin-provided URL against a protocol allow-list so that
  // javascript:, data:, vbscript: and similar payloads can never reach an href.
  // Returns the normalized URL when safe, otherwise null.
  function sanitizeUrl(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = new URL(trimmed, window.location.href);
      if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
        return null;
      }
      return parsed.href;
    } catch {
      return null;
    }
  }

  function findWidgetScript() {
    if (document.currentScript instanceof HTMLScriptElement) {
      return document.currentScript;
    }

    const scripts = document.querySelectorAll<HTMLScriptElement>(
      "script[data-assistant-id]",
    );
    return scripts[scripts.length - 1] ?? null;
  }
})();
