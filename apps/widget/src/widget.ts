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
  sentAt: number[];
  messages: StoredMessage[];
};

type StringKey =
  | "closeChat"
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
  | "intakeQuestionTag"
  | "intakeReadiness"
  | "intakeReadinessTag"
  | "intakeLead"
  | "intakeLeadTag"
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
    intakeQuestionTag: "Chat",
    intakeReadiness: "KI-Readiness prüfen",
    intakeReadinessTag: "Check",
    intakeLead: "Beratung anfragen",
    intakeLeadTag: "Kontakt",
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
    intakeQuestionTag: "Chat",
    intakeReadiness: "Check AI readiness",
    intakeReadinessTag: "Check",
    intakeLead: "Request a consultation",
    intakeLeadTag: "Contact",
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
    const primaryColor = config.theme.primaryColor ?? "#a66e2f";
    const backgroundColor = config.theme.backgroundColor ?? "#ffffff";
    const textColor = config.theme.textColor ?? "#16191e";
    const launcherLabel = config.theme.launcherLabel ?? "Chat";
    const assistantName = config.theme.assistantName ?? config.tenantName;
    const position = config.theme.position ?? "bottom-right";
    const leadFields = normalizeLeadFields(config.theme.leadCaptureFields);
    const leadCaptureAvailable =
      Boolean(config.theme.leadCaptureEnabled) && !state.leadCaptured;
    const consentVisible =
      Boolean(config.theme.consentEnabled) && !state.consentAccepted;
    const quickReplies = normalizeQuickReplies(config.theme.quickReplies);
    const hasQuickReplies = quickReplies.length > 0;
    const readinessAvailable =
      Boolean(config.theme.readinessEnabled) && !state.readinessCaptured;
    const modeChooserVisible =
      !consentVisible &&
      (hasQuickReplies || readinessAvailable || leadCaptureAvailable) &&
      !state.leadCaptured &&
      !state.readinessCaptured;
    const quickRepliesVisible =
      hasQuickReplies && !consentVisible && !modeChooserVisible;
    const readinessVisible =
      readinessAvailable &&
      !consentVisible &&
      !modeChooserVisible &&
      !hasQuickReplies;
    const leadCaptureVisible =
      leadCaptureAvailable &&
      !consentVisible &&
      !modeChooserVisible &&
      !readinessAvailable &&
      !hasQuickReplies;
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
        height: min(620px, calc(100vh - 92px));
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
      .header strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        line-height: 1.15;
      }
      .header span { display: block; font-size: 12px; opacity: 0.88; }
      .close {
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
      .messages {
        flex: 1 1 auto;
        min-height: 96px;
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
      .cta {
        display: inline-flex;
        align-self: flex-start;
        border-radius: 7px;
        background: rgba(166, 110, 47, 0.12);
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
	        min-width: 0;
	        overflow: hidden;
	        text-overflow: ellipsis;
	        white-space: nowrap;
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
        background: rgba(166, 110, 47, 0.12);
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
        box-shadow: 0 0 0 3px rgba(166, 110, 47, 0.16);
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
        box-shadow: 0 0 0 3px rgba(166, 110, 47, 0.16);
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
      @media (max-width: 520px) {
        .assaddar-shell { right: 10px; left: 10px; bottom: 10px; }
        .panel { width: 100%; height: min(560px, calc(100vh - 96px)); }
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
          <button class="close" type="button" aria-label="${escapeHtml(t("closeChat"))}">×</button>
        </div>
        <div class="messages" part="messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="${escapeHtml(t("messagesAriaLabel"))}"></div>
	        <div class="consent" data-visible="${consentVisible ? "true" : "false"}">
	          <p>${escapeHtml(config.theme.consentText ?? t("consentText"))}</p>
	          <button type="button">${escapeHtml(t("consentAccept"))}</button>
	        </div>
	        <div class="intake-modes" data-visible="${modeChooserVisible ? "true" : "false"}" role="group" aria-label="${escapeHtml(t("intakePrompt"))}">
	          <p>${escapeHtml(t("intakePrompt"))}</p>
	          <button type="button" data-mode="question" aria-label="${escapeHtml(t("intakeQuestion"))}"><span>${escapeHtml(t("intakeQuestion"))}</span><strong>${escapeHtml(t("intakeQuestionTag"))}</strong></button>
	          ${
              readinessAvailable
                ? `<button type="button" data-mode="readiness" aria-label="${escapeHtml(t("intakeReadiness"))}"><span>${escapeHtml(t("intakeReadiness"))}</span><strong>${escapeHtml(t("intakeReadinessTag"))}</strong></button>`
                : ""
            }
	          ${
              leadCaptureAvailable
                ? `<button type="button" data-mode="lead" aria-label="${escapeHtml(t("intakeLead"))}"><span>${escapeHtml(t("intakeLead"))}</span><strong>${escapeHtml(t("intakeLeadTag"))}</strong></button>`
                : ""
            }
	        </div>
	        <div class="quick-replies" data-visible="${quickRepliesVisible ? "true" : "false"}" role="group" aria-label="${escapeHtml(t("intakePrompt"))}">
	          ${quickReplies
              .map(
                (reply) =>
                  `<button type="button" data-action="${inferQuickReplyAction(reply)}" aria-label="${escapeHtml(reply)}">${escapeHtml(reply)}</button>`,
              )
              .join("")}
        </div>
        <form class="readiness-form" data-visible="${readinessVisible && !consentVisible ? "true" : "false"}" aria-label="${escapeHtml(t("readinessSubmit"))}">
          <p>${escapeHtml(config.theme.readinessIntro ?? t("readinessIntro"))}</p>
          <input name="goal" aria-label="${escapeHtml(t("readinessGoal"))}" placeholder="${escapeHtml(t("readinessGoal"))}" />
          <textarea name="processPain" rows="2" aria-label="${escapeHtml(t("readinessProcessPain"))}" placeholder="${escapeHtml(t("readinessProcessPain"))}"></textarea>
          <input name="systems" aria-label="${escapeHtml(t("readinessSystems"))}" placeholder="${escapeHtml(t("readinessSystems"))}" />
          <input name="timeline" aria-label="${escapeHtml(t("readinessTimeline"))}" placeholder="${escapeHtml(t("readinessTimeline"))}" />
          <input name="budget" aria-label="${escapeHtml(t("readinessBudget"))}" placeholder="${escapeHtml(t("readinessBudget"))}" />
          <button class="primary">${escapeHtml(t("readinessSubmit"))}</button>
        </form>
	        <form class="lead-form" data-visible="${leadCaptureVisible && !consentVisible ? "true" : "false"}" aria-label="${escapeHtml(t("leadSubmit"))}">
	          <strong>${escapeHtml(config.theme.leadCaptureIntro ?? t("leadIntro"))}</strong>
	          ${leadFields.map((field) => renderLeadField(field, t)).join("")}
          <button>${escapeHtml(t("leadSubmit"))}</button>
        </form>
        <form class="composer">
          <input maxlength="${config.limits.maxMessageLength}" autocomplete="off" aria-label="${escapeHtml(t("composerInputLabel"))}" placeholder="${escapeHtml(t("composerInputPlaceholder"))}" />
          <button type="submit" aria-label="${escapeHtml(t("sendMessage"))}">›</button>
        </form>
      </div>
      <button class="launcher" aria-label="${escapeHtml(launcherLabel)}" aria-haspopup="dialog" aria-expanded="false">${escapeHtml(launcherLabel)}</button>
    </div>
  `;

    const launcher = shadow.querySelector<HTMLButtonElement>(".launcher");
    const panel = shadow.querySelector<HTMLDivElement>(".panel");
    const close = shadow.querySelector<HTMLButtonElement>(".close");
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

    if (
      !launcher ||
      !panel ||
      !close ||
      !messages ||
      !consent ||
      !modeChooser ||
      !quickRepliesNode ||
      !readinessForm ||
      !leadForm ||
      !form ||
      !input ||
      !sendButton
    ) {
      throw new Error("Widget failed to initialize.");
    }

    const messagesEl = messages;
    const inputEl = input;
    const sendButtonEl = sendButton;
    const panelEl = panel;
    const launcherEl = launcher;

    drawMessages(messagesEl, state.messages, context.config.theme);

    function openPanel() {
      panelEl.classList.add("open");
      launcherEl.style.display = "none";
      launcherEl.setAttribute("aria-expanded", "true");
      if (window.matchMedia("(min-width: 641px)").matches) {
        inputEl.focus();
      }
      if (!state.openTracked) {
        state.openTracked = true;
        persistState(context.config.assistantId, state);
        void trackWidgetEvent(context, state, "widget_open");
      }
    }

    function closePanel() {
      panelEl.classList.remove("open");
      launcherEl.style.display = "inline-flex";
      launcherEl.setAttribute("aria-expanded", "false");
      launcherEl.focus();
    }

    launcher.addEventListener("click", openPanel);

    close.addEventListener("click", closePanel);

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    });

    consentButton?.addEventListener("click", () => {
      state.consentAccepted = true;
      persistState(context.config.assistantId, state);
      consent.dataset.visible = "false";
      if (
        quickReplyButtons.length ||
        (context.config.theme.readinessEnabled && !state.readinessCaptured) ||
        (context.config.theme.leadCaptureEnabled && !state.leadCaptured)
      ) {
        modeChooser.dataset.visible = "true";
        return;
      }
      if (quickReplyButtons.length) {
        quickRepliesNode.dataset.visible = "true";
      }
      if (
        readinessForm &&
        context.config.theme.readinessEnabled &&
        !state.readinessCaptured &&
        !quickReplyButtons.length
      ) {
        readinessForm.dataset.visible = "true";
      }
      if (
        leadForm &&
        context.config.theme.leadCaptureEnabled &&
        !state.leadCaptured
      ) {
        leadForm.dataset.visible = "true";
      }
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

    async function sendChatMessage(text: string) {
      if (!text || isClientRateLimited(state)) {
        return;
      }

      inputEl.value = "";
      sendButtonEl.disabled = true;
      state.messages.push({ role: "user", text });
      drawMessages(messagesEl, state.messages, context.config.theme);
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
        state.messages.push({ role: "assistant", text: response.reply });
        persistState(context.config.assistantId, state);
      } catch {
        state.messages.push({
          role: "assistant",
          text: t("chatError"),
        });
      } finally {
        sendButtonEl.disabled = false;
        drawMessages(messagesEl, state.messages, context.config.theme);
      }
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
      return stored;
    }

    return {
      visitorId: `visitor_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
      sentAt: [] as number[],
      messages: [
        { role: "assistant", text: openingMessage },
      ] as StoredMessage[],
    };
  }

  function readState(assistantId: string): WidgetState | null {
    try {
      const raw = window.localStorage.getItem(storageKey(assistantId));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as WidgetState;
    } catch {
      return null;
    }
  }

  function persistState(assistantId: string, state: WidgetState) {
    window.localStorage.setItem(storageKey(assistantId), JSON.stringify(state));
  }

  function storageKey(assistantId: string) {
    return `assaddar_widget_${assistantId}`;
  }

  function drawMessages(
    container: HTMLElement,
    messages: StoredMessage[],
    theme?: WidgetTheme,
  ) {
    container.innerHTML = messages
      .map(
        (message) =>
          `<div class="bubble ${message.role}">${escapeHtml(message.text)}</div>`,
      )
      .join("");
    const ctaUrl = getPrimaryCtaUrl(theme);
    if (ctaUrl && theme?.ctaLabel) {
      container.insertAdjacentHTML(
        "beforeend",
        `<a class="cta" href="${escapeHtml(ctaUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(theme.ctaLabel)}</a>`,
      );
    }
    container.scrollTop = container.scrollHeight;
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
    return Array.from(new Set(values)).slice(0, 8);
  }

  function renderLeadField(
    field: string,
    t: (key: StringKey, vars?: Record<string, string | number>) => string,
  ) {
    const label = escapeHtml(leadFieldLabel(field, t));
    if (field === "message") {
      return `<textarea name="${field}" rows="3" aria-label="${label}" placeholder="${label}"></textarea>`;
    }
    if (field === "contactPreference") {
      const email = escapeHtml(t("contactPreferenceEmail"));
      const phone = escapeHtml(t("contactPreferencePhone"));
      const videoCall = escapeHtml(t("contactPreferenceVideoCall"));
      return `<select name="${field}" aria-label="${label}"><option value="">${label}</option><option value="Email">${email}</option><option value="Phone">${phone}</option><option value="Video call">${videoCall}</option></select>`;
    }
    const inputType =
      field === "email" ? "email" : field === "phone" ? "tel" : "text";
    const required = field === "name" || field === "email" ? "required" : "";
    return `<input name="${field}" type="${inputType}" ${required} aria-label="${label}" placeholder="${label}" />`;
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
    try {
      await fetch(`${context.apiBase}/widget/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          assistantId: context.config.assistantId,
          conversationId: state.conversationId,
          visitorId: state.visitorId,
          pageUrl: window.location.href,
          eventType,
          metadata,
        }),
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
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt += 1) {
      try {
        const response = await fetch(url, init);
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
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Network error");
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
