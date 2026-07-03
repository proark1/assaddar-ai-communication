import { describe, expect, it } from "vitest";
import { createGeminiGroundedAnswerGenerator } from "../src";

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
