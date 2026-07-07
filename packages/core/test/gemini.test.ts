import { describe, expect, it } from "vitest";
import {
  createGeminiDraftAnswerGenerator,
  createGeminiGroundedAnswerGenerator,
} from "../src";

describe("createGeminiGroundedAnswerGenerator", () => {
  it("returns null when GEMINI_API_KEY is not configured", () => {
    expect(createGeminiGroundedAnswerGenerator({})).toBeNull();
  });

  it("writes a grounded answer with approved knowledge only", async () => {
    let requestedUrl = "";
    let requestBody: unknown;
    const fetchMock: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      expect(init?.headers).toMatchObject({ "x-goog-api-key": "key" });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "Telefonisch gesagt: Es startet bei 100 EUR." },
                ],
              },
            },
          ],
        }),
      );
    };

    const generator = createGeminiGroundedAnswerGenerator(
      {
        GEMINI_API_KEY: "key",
        GEMINI_TEXT_MODEL: "gemini-test",
        GEMINI_BASE_URL: "https://gemini.example.test",
      },
      { fetch: fetchMock },
    );

    const answer = await generator?.({
      question: "Was kostet das?",
      locale: "de-DE",
      intent: "prices",
      fallbackAnswer: "Es startet bei 100 EUR.",
      chunks: [
        {
          id: "chunk",
          tenantId: "tenant",
          documentId: "doc",
          sourceId: "source",
          title: "Preise",
          content: "Question: Was kostet das?\nAnswer: Es startet bei 100 EUR.",
          tags: ["faq"],
          metadata: { answer: "Es startet bei 100 EUR." },
          score: 1,
        },
      ],
    });

    expect(requestedUrl).toBe(
      "https://gemini.example.test/v1beta/models/gemini-test:generateContent",
    );
    expect(requestBody).toMatchObject({
      generationConfig: {
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });
    expect(JSON.stringify(requestBody)).toContain("Es startet bei 100 EUR");
    expect(JSON.stringify(requestBody)).toContain("__NO_GROUNDED_ANSWER__");
    expect(answer).toBe("Telefonisch gesagt: Es startet bei 100 EUR.");
  });
});

describe("createGeminiDraftAnswerGenerator", () => {
  it("returns null when GEMINI_API_KEY is not configured", () => {
    expect(createGeminiDraftAnswerGenerator({})).toBeNull();
  });

  it("drafts a review candidate from the question and business context", async () => {
    let requestBody: unknown;
    const fetchMock: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "Ja, wir liefern am Wochenende — [genaue Kosten bestätigen].",
                  },
                ],
              },
            },
          ],
        }),
      );
    };

    const generator = createGeminiDraftAnswerGenerator(
      { GEMINI_API_KEY: "key", GEMINI_TEXT_MODEL: "gemini-test" },
      { fetch: fetchMock },
    );

    const draft = await generator?.({
      question: "Liefern Sie am Wochenende?",
      locale: "de-DE",
      businessContext: "Beispiel Bäckerei",
    });

    // The prompt must frame this as a review draft, never a customer reply.
    const serialized = JSON.stringify(requestBody);
    expect(serialized).toContain("Beispiel Bäckerei");
    expect(serialized).toContain("__NO_DRAFT__");
    expect(draft).toBe(
      "Ja, wir liefern am Wochenende — [genaue Kosten bestätigen].",
    );
  });

  it("returns null when the model declines with the no-draft sentinel", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "__NO_DRAFT__" }] } }],
        }),
      );

    const generator = createGeminiDraftAnswerGenerator(
      { GEMINI_API_KEY: "key" },
      { fetch: fetchMock },
    );

    expect(await generator?.({ question: "Etwas sehr Obskures?" })).toBeNull();
  });
});
