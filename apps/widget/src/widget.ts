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
  sentAt: number[];
  messages: StoredMessage[];
};

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
    const root = document.createElement("div");
    root.dataset.assaddarWidgetRoot = publicAssistantId;
    document.body.appendChild(root);

    const shadow = root.attachShadow({ mode: "open" });
    const state = createState(
      publicAssistantId,
      config.theme.openingMessage ?? "Hi, how can I help?",
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
    const primaryColor = config.theme.primaryColor ?? "#155eef";
    const backgroundColor = config.theme.backgroundColor ?? "#ffffff";
    const textColor = config.theme.textColor ?? "#172033";
    const launcherLabel = config.theme.launcherLabel ?? "Chat";
    const assistantName = config.theme.assistantName ?? config.tenantName;
    const position = config.theme.position ?? "bottom-right";
    const leadFields = normalizeLeadFields(config.theme.leadCaptureFields);
    const leadCaptureVisible =
      Boolean(config.theme.leadCaptureEnabled) && !state.leadCaptured;
    const consentVisible =
      Boolean(config.theme.consentEnabled) && !state.consentAccepted;
    const quickReplies = normalizeQuickReplies(config.theme.quickReplies);
    const readinessVisible =
      Boolean(config.theme.readinessEnabled) && !state.readinessCaptured;
    const shellSide =
      position === "bottom-left"
        ? "left: 20px; right: auto;"
        : "right: 20px; left: auto;";

    shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .assaddar-shell {
        position: fixed;
        z-index: 2147483000;
        ${shellSide}
        bottom: 20px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: ${textColor};
      }
      .launcher {
        border: 0;
        border-radius: 999px;
        background: ${primaryColor};
        color: #fff;
        min-width: 58px;
        height: 50px;
        padding: 0 18px;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 14px 34px rgba(16, 24, 40, 0.22);
      }
      .panel {
        display: none;
        width: min(372px, calc(100vw - 28px));
        height: min(620px, calc(100vh - 96px));
        background: ${backgroundColor};
        border: 1px solid rgba(23, 32, 51, 0.14);
        border-radius: 8px;
        box-shadow: 0 18px 50px rgba(16, 24, 40, 0.22);
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
      .header strong { display: block; font-size: 15px; }
      .header span { display: block; font-size: 12px; opacity: 0.88; }
      .close {
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
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        background: #f6f7f9;
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
        border: 1px solid rgba(23, 32, 51, 0.12);
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
        background: rgba(21, 94, 239, 0.1);
        color: ${primaryColor};
        padding: 8px 10px;
        text-decoration: none;
        font-size: 13px;
        font-weight: 800;
      }
      .lead-form {
        display: none;
        gap: 8px;
        border-top: 1px solid rgba(23, 32, 51, 0.12);
        background: #fff;
        padding: 12px;
      }
      .lead-form[data-visible="true"] { display: grid; }
      .consent,
      .readiness-form,
      .quick-replies {
        display: none;
        gap: 8px;
        border-top: 1px solid rgba(23, 32, 51, 0.12);
        background: #fff;
        padding: 10px 12px;
      }
      .consent[data-visible="true"],
      .readiness-form[data-visible="true"],
      .quick-replies[data-visible="true"] { display: grid; }
      .consent p,
      .readiness-form p {
        margin: 0;
        color: ${textColor};
        font-size: 12px;
        line-height: 1.4;
      }
      .consent button,
      .quick-replies button,
      .readiness-form button {
        border: 1px solid rgba(23, 32, 51, 0.14);
        border-radius: 6px;
        background: #fff;
        color: ${primaryColor};
        min-height: 34px;
        cursor: pointer;
        font-weight: 800;
      }
      .quick-replies {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .quick-replies button {
        min-width: 0;
        overflow: hidden;
        padding: 0 8px;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
      }
      .readiness-form input,
      .readiness-form textarea,
      .lead-form strong {
        display: block;
        color: ${textColor};
        font-size: 13px;
      }
      .lead-form input,
      .lead-form textarea,
      .readiness-form input,
      .readiness-form textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(23, 32, 51, 0.18);
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
      .readiness-form input:focus,
      .readiness-form textarea:focus {
        border-color: ${primaryColor};
        box-shadow: 0 0 0 3px rgba(21, 94, 239, 0.14);
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
        display: grid;
        grid-template-columns: 1fr 44px;
        gap: 8px;
        padding: 10px;
        border-top: 1px solid rgba(23, 32, 51, 0.12);
        background: #fff;
      }
      .composer input {
        border: 1px solid rgba(23, 32, 51, 0.18);
        border-radius: 6px;
        min-height: 42px;
        padding: 0 11px;
        outline: none;
        font-size: 14px;
      }
      .composer input:focus {
        border-color: ${primaryColor};
        box-shadow: 0 0 0 3px rgba(21, 94, 239, 0.14);
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
        .panel { width: 100%; height: min(620px, calc(100vh - 84px)); }
        .launcher { float: right; }
      }
    </style>
    <div class="assaddar-shell">
      <div class="panel" part="panel">
        <div class="header">
          <div>
            <strong>${escapeHtml(assistantName)}</strong>
            <span>${escapeHtml(config.defaultLocale.toUpperCase())}</span>
          </div>
          <button class="close" aria-label="Close chat">×</button>
        </div>
        <div class="messages" part="messages"></div>
        <div class="consent" data-visible="${consentVisible ? "true" : "false"}">
          <p>${escapeHtml(config.theme.consentText ?? "This assistant uses approved business information and stores messages so the team can follow up.")}</p>
          <button type="button">Accept</button>
        </div>
        <div class="quick-replies" data-visible="${quickReplies.length && !consentVisible ? "true" : "false"}">
          ${quickReplies.map((reply) => `<button type="button">${escapeHtml(reply)}</button>`).join("")}
        </div>
        <form class="readiness-form" data-visible="${readinessVisible && !consentVisible ? "true" : "false"}">
          <p>${escapeHtml(config.theme.readinessIntro ?? "Check whether your company is ready for a useful AI automation project.")}</p>
          <input name="goal" placeholder="Main AI goal" />
          <textarea name="processPain" rows="2" placeholder="Most painful manual process"></textarea>
          <input name="systems" placeholder="Current systems, tools, or data sources" />
          <input name="timeline" placeholder="Timeline" />
          <input name="budget" placeholder="Budget range" />
          <button class="primary">Check readiness</button>
        </form>
        <form class="lead-form" data-visible="${leadCaptureVisible && !consentVisible ? "true" : "false"}">
          <strong>${escapeHtml(config.theme.leadCaptureIntro ?? "Leave your details and we will follow up.")}</strong>
          ${leadFields
            .map((field) =>
              field === "message"
                ? `<textarea name="${field}" rows="3" placeholder="${escapeHtml(leadFieldLabel(field))}"></textarea>`
                : `<input name="${field}" ${field === "email" ? 'type="email"' : 'type="text"'} ${field === "name" || field === "email" ? "required" : ""} placeholder="${escapeHtml(leadFieldLabel(field))}" />`,
            )
            .join("")}
          <button>Send details</button>
        </form>
        <form class="composer">
          <input maxlength="${config.limits.maxMessageLength}" autocomplete="off" />
          <button aria-label="Send message">›</button>
        </form>
      </div>
      <button class="launcher">${escapeHtml(launcherLabel)}</button>
    </div>
  `;

    const launcher = shadow.querySelector<HTMLButtonElement>(".launcher");
    const panel = shadow.querySelector<HTMLDivElement>(".panel");
    const close = shadow.querySelector<HTMLButtonElement>(".close");
    const messages = shadow.querySelector<HTMLDivElement>(".messages");
    const consent = shadow.querySelector<HTMLDivElement>(".consent");
    const consentButton = shadow.querySelector<HTMLButtonElement>(".consent button");
    const quickReplyButtons =
      shadow.querySelectorAll<HTMLButtonElement>(".quick-replies button");
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

    drawMessages(messagesEl, state.messages, context.config.theme);

    launcher.addEventListener("click", () => {
      panel.classList.add("open");
      launcher.style.display = "none";
      inputEl.focus();
    });

    close.addEventListener("click", () => {
      panel.classList.remove("open");
      launcher.style.display = "inline-flex";
    });

    consentButton?.addEventListener("click", () => {
      state.consentAccepted = true;
      persistState(context.config.assistantId, state);
      consent.dataset.visible = "false";
      const quickRepliesNode = shadow.querySelector<HTMLDivElement>(".quick-replies");
      if (quickRepliesNode && quickReplyButtons.length) {
        quickRepliesNode.dataset.visible = "true";
      }
      if (readinessForm && context.config.theme.readinessEnabled && !state.readinessCaptured) {
        readinessForm.dataset.visible = "true";
      }
      if (leadForm && context.config.theme.leadCaptureEnabled && !state.leadCaptured) {
        leadForm.dataset.visible = "true";
      }
    });

    quickReplyButtons.forEach((button) => {
      button.addEventListener("click", () => {
        void sendChatMessage(button.textContent?.trim() ?? "");
      });
    });

    readinessForm.addEventListener("submit", async (event) => {
      event.preventDefault();
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
        state.messages.push({
          role: "assistant",
          text: `AI readiness score: ${response.score}/100. ${response.recommendation}`,
        });
        persistState(context.config.assistantId, state);
        readinessForm.dataset.visible = "false";
        drawMessages(messagesEl, state.messages, context.config.theme);
      } catch {
        state.messages.push({
          role: "assistant",
          text: "I couldn't submit the readiness check right now. Please try again later.",
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
        state.messages.push({
          role: "assistant",
          text: "Thanks. Your details were sent to the team.",
        });
        persistState(context.config.assistantId, state);
        leadForm.dataset.visible = "false";
        drawMessages(messagesEl, state.messages, context.config.theme);
      } catch {
        state.messages.push({
          role: "assistant",
          text: "I couldn't send your details right now. Please try again later.",
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
          text: "I can't send this message right now. Please try again later.",
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
    if (theme?.ctaUrl && theme.ctaLabel) {
      container.insertAdjacentHTML(
        "beforeend",
        `<a class="cta" href="${escapeHtml(theme.ctaUrl)}" target="_blank" rel="noreferrer">${escapeHtml(theme.ctaLabel)}</a>`,
      );
    }
    container.scrollTop = container.scrollHeight;
  }

  function normalizeLeadFields(fields?: string[]) {
    const defaults = ["name", "email", "company", "projectType", "timeline"];
    const values = fields?.length ? fields : defaults;
    return Array.from(new Set(values)).slice(0, 8);
  }

  function normalizeQuickReplies(replies?: string[]) {
    const defaults = [
      "KI Beratung anfragen",
      "Use Case prüfen",
      "Datenschutz klären",
      "Termin buchen",
    ];
    const values = replies?.length ? replies : defaults;
    return Array.from(new Set(values.map((reply) => reply.trim()).filter(Boolean))).slice(
      0,
      8,
    );
  }

  function leadFieldLabel(field: string) {
    const labels: Record<string, string> = {
      name: "Name",
      email: "Email",
      company: "Company",
      projectType: "Project type",
      budget: "Budget",
      timeline: "Timeline",
      message: "Message",
    };
    return (
      labels[field] ??
      field
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .trim()
    );
  }

  function isClientRateLimited(state: WidgetState) {
    const now = Date.now();
    state.sentAt = state.sentAt.filter((value: number) => now - value < 60_000);
    return state.sentAt.length >= 10;
  }

  async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
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
