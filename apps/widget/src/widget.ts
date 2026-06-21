type WidgetTheme = {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  launcherLabel?: string;
  openingMessage?: string;
  language?: string;
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

type StoredMessage = {
  role: "assistant" | "user";
  text: string;
};

type WidgetState = {
  visitorId: string;
  conversationId?: string;
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

    shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .assaddar-shell {
        position: fixed;
        z-index: 2147483000;
        right: 20px;
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
      .panel.open { display: grid; grid-template-rows: auto 1fr auto; }
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
            <strong>${escapeHtml(config.tenantName)}</strong>
            <span>${escapeHtml(config.defaultLocale.toUpperCase())}</span>
          </div>
          <button class="close" aria-label="Close chat">×</button>
        </div>
        <div class="messages" part="messages"></div>
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
    const form = shadow.querySelector<HTMLFormElement>(".composer");
    const input = shadow.querySelector<HTMLInputElement>(".composer input");
    const sendButton =
      shadow.querySelector<HTMLButtonElement>(".composer button");

    if (
      !launcher ||
      !panel ||
      !close ||
      !messages ||
      !form ||
      !input ||
      !sendButton
    ) {
      throw new Error("Widget failed to initialize.");
    }

    drawMessages(messages, state.messages);

    launcher.addEventListener("click", () => {
      panel.classList.add("open");
      launcher.style.display = "none";
      input.focus();
    });

    close.addEventListener("click", () => {
      panel.classList.remove("open");
      launcher.style.display = "inline-flex";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || isClientRateLimited(state)) {
        return;
      }

      input.value = "";
      sendButton.disabled = true;
      state.messages.push({ role: "user", text });
      drawMessages(messages, state.messages);
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
        sendButton.disabled = false;
        drawMessages(messages, state.messages);
      }
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

  function drawMessages(container: HTMLElement, messages: StoredMessage[]) {
    container.innerHTML = messages
      .map(
        (message) =>
          `<div class="bubble ${message.role}">${escapeHtml(message.text)}</div>`,
      )
      .join("");
    container.scrollTop = container.scrollHeight;
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
