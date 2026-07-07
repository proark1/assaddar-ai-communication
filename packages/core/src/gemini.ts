import type {
  DraftAnswerGenerator,
  DraftAnswerInput,
  GroundedAnswerGenerator,
  GroundedAnswerInput,
} from "./types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_GEMINI_TEXT_MODEL = "gemini-3.5-flash";
const NO_GROUNDED_ANSWER = "__NO_GROUNDED_ANSWER__";
const NO_DRAFT_ANSWER = "__NO_DRAFT__";
const MAX_DRAFT_ANSWER_LENGTH = 1200;

export type GeminiGroundedAnswerEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_TEXT_MODEL?: string;
  GEMINI_BASE_URL?: string;
  GEMINI_ANSWER_TIMEOUT_MS?: string;
  GEMINI_TIMEOUT_MS?: string;
};

export type GeminiGroundedAnswerOptions = {
  fetch?: typeof fetch;
};

export function createGeminiGroundedAnswerGenerator(
  env: GeminiGroundedAnswerEnv = process.env,
  options: GeminiGroundedAnswerOptions = {},
): GroundedAnswerGenerator | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const model = env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_GEMINI_TEXT_MODEL;
  const baseUrl = (env.GEMINI_BASE_URL?.trim() || GEMINI_BASE_URL).replace(
    /\/$/,
    "",
  );
  const timeoutMs = readTimeoutMs(
    env.GEMINI_ANSWER_TIMEOUT_MS ?? env.GEMINI_TIMEOUT_MS,
    12_000,
  );
  const fetchImpl = options.fetch ?? fetch;

  return async (input) => {
    const response = await fetchImpl(geminiGenerateContentUrl(baseUrl, model), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "You are a strict customer-service answer writer. " +
                "Use only the approved business knowledge supplied by the system. " +
                `If the answer is not fully supported, return exactly ${NO_GROUNDED_ANSWER}. ` +
                "Do not invent prices, addresses, policies, guarantees, or capabilities. " +
                "Write a concise, natural phone answer in the caller's language. " +
                "Prefer one short sentence under 25 words unless the approved answer requires more.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildGroundedPrompt(input) }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 90,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Gemini grounded answer failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    }

    const payload = (await response.json()) as GenerateContentResponse;
    return extractGeminiText(payload);
  };
}

/**
 * Build a generator that drafts a CANDIDATE answer for a question the brain
 * could not answer, for a human to review. The output is explicitly NOT
 * grounded-only: the model may use general knowledge, but is instructed to hedge
 * uncertainty and never fabricate specific facts (prices, hours, legal terms).
 * The draft is never sent to a customer — it lands in the review queue and a
 * human must approve it before it becomes live knowledge.
 */
export function createGeminiDraftAnswerGenerator(
  env: GeminiGroundedAnswerEnv = process.env,
  options: GeminiGroundedAnswerOptions = {},
): DraftAnswerGenerator | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const model = env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_GEMINI_TEXT_MODEL;
  const baseUrl = (env.GEMINI_BASE_URL?.trim() || GEMINI_BASE_URL).replace(
    /\/$/,
    "",
  );
  const timeoutMs = readTimeoutMs(
    env.GEMINI_ANSWER_TIMEOUT_MS ?? env.GEMINI_TIMEOUT_MS,
    15_000,
  );
  const fetchImpl = options.fetch ?? fetch;

  return async (input) => {
    const response = await fetchImpl(geminiGenerateContentUrl(baseUrl, model), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "You draft a CANDIDATE answer for a human agent to review. " +
                "This text is NEVER sent directly to a customer and must be " +
                "approved by a person before use. Propose a helpful, plausible " +
                "answer to the question. Use the business context and related " +
                "knowledge when provided; you may draw on general knowledge for " +
                "the rest, but explicitly hedge anything you are unsure of " +
                "(e.g. 'likely', 'please confirm'). Never invent specific " +
                "prices, addresses, opening hours, legal terms, or guarantees — " +
                "use a bracketed placeholder like [confirm exact price] instead. " +
                `If you cannot propose anything useful, reply with exactly ${NO_DRAFT_ANSWER}. ` +
                "Answer in the question's language. Keep it concise.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildDraftPrompt(input) }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 320,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Gemini draft answer failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    }

    const payload = (await response.json()) as GenerateContentResponse;
    return sanitizeDraftAnswer(extractGeminiText(payload));
  };
}

function buildDraftPrompt(input: DraftAnswerInput) {
  const related = (input.relatedKnowledge ?? [])
    .map((entry, index) => {
      const title = entry.title ? `Title: ${entry.title}\n` : "";
      return `Related ${index + 1}\n${title}Content: ${entry.content}`.trim();
    })
    .join("\n\n---\n\n");

  return [
    input.businessContext ? `Business: ${input.businessContext}` : "",
    `Locale: ${input.locale ?? "de-DE"}`,
    `Question the assistant could not answer: ${input.question}`,
    related ? `Related approved knowledge (may be partial):\n${related}` : "",
    "",
    "Write only the draft answer for the reviewer.",
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeDraftAnswer(answer: string | null | undefined): string | null {
  const text = answer?.trim() ?? "";
  if (!text || text.includes(NO_DRAFT_ANSWER)) {
    return null;
  }
  return text.slice(0, MAX_DRAFT_ANSWER_LENGTH);
}

function geminiGenerateContentUrl(baseUrl: string, model: string) {
  const modelPath =
    model.startsWith("models/") || model.startsWith("tunedModels/")
      ? model
      : `models/${model}`;
  return `${baseUrl}/v1beta/${modelPath}:generateContent`;
}

function buildGroundedPrompt(input: GroundedAnswerInput) {
  const knowledge = input.chunks
    .map((chunk, index) => {
      const title = chunk.title ? `Title: ${chunk.title}\n` : "";
      const answer =
        typeof chunk.metadata.answer === "string" &&
        chunk.metadata.answer.trim()
          ? `Approved answer: ${chunk.metadata.answer.trim()}\n`
          : "";
      return [
        `Knowledge ${index + 1} (score ${chunk.score.toFixed(3)})`,
        title,
        answer,
        `Content: ${chunk.content}`,
      ]
        .join("\n")
        .trim();
    })
    .join("\n\n---\n\n");

  return [
    `Caller question: ${input.question}`,
    `Locale: ${input.locale ?? "de-DE"}`,
    `Intent: ${input.intent}`,
    `Fallback approved answer: ${input.fallbackAnswer}`,
    "Approved business knowledge:",
    knowledge,
    "",
    "Return only the final spoken answer. No citations, no bullet list unless the knowledge itself requires it.",
  ].join("\n");
}

function extractGeminiText(payload: GenerateContentResponse) {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function readTimeoutMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 60_000) {
    return fallback;
  }
  return Math.trunc(parsed);
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};
