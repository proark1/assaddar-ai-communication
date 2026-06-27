import { describe, expect, it } from "vitest";
import {
  getAnswer,
  getQuestion,
  normalizeBaseUrl,
  parseFaqImport,
  parseTags,
  readableError,
  statusTone,
} from "../app/page-helpers";
import type { KnowledgeItem } from "../app/page-types";

function knowledge(overrides: Partial<KnowledgeItem>): KnowledgeItem {
  return {
    id: "k1",
    content: "",
    tags: [],
    status: "approved",
    ...overrides,
  } as KnowledgeItem;
}

describe("normalizeBaseUrl", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl("  https://api.example.com//  ")).toBe(
      "https://api.example.com",
    );
    expect(normalizeBaseUrl("https://api.example.com")).toBe(
      "https://api.example.com",
    );
  });
});

describe("statusTone", () => {
  it("returns neutral for empty status", () => {
    expect(statusTone("")).toBe("neutral");
  });
  it("flags error-like messages as danger", () => {
    expect(statusTone("Login rejected")).toBe("danger");
    expect(statusTone("API unreachable")).toBe("danger");
    expect(statusTone("Failed to save")).toBe("danger");
  });
  it("treats other messages as success", () => {
    expect(statusTone("Tenant created")).toBe("success");
  });
});

describe("getQuestion / getAnswer", () => {
  it("prefers metadata, falls back to title/content", () => {
    expect(getQuestion(knowledge({ metadata: { question: "Hours?" } }))).toBe(
      "Hours?",
    );
    expect(getQuestion(knowledge({ title: "Opening hours" }))).toBe(
      "Opening hours",
    );
    expect(getQuestion(knowledge({}))).toBe("Knowledge item");
    expect(getAnswer(knowledge({ metadata: { answer: "9-5" } }))).toBe("9-5");
    expect(getAnswer(knowledge({ content: "Mon-Fri" }))).toBe("Mon-Fri");
  });
});

describe("parseTags", () => {
  it("splits, lowercases, dedupes, and trims", () => {
    expect(parseTags("Sales, support , SALES")).toEqual(["sales", "support"]);
  });
  it("defaults to ['faq'] when empty", () => {
    expect(parseTags("   ")).toEqual(["faq"]);
  });
});

describe("parseFaqImport", () => {
  it("parses question/answer blocks separated by blank lines", () => {
    const result = parseFaqImport(
      "What are your hours?\nMon-Fri 9-5\n\nDo you ship?\nYes, worldwide.",
    );
    expect(result).toEqual([
      { question: "What are your hours?", answer: "Mon-Fri 9-5" },
      { question: "Do you ship?", answer: "Yes, worldwide." },
    ]);
  });
  it("drops blocks whose question or answer is too short", () => {
    expect(parseFaqImport("Hi\nyo")).toEqual([]);
  });
});

describe("readableError", () => {
  it("maps common failures to friendly copy", () => {
    expect(readableError(new Error("Failed to fetch"))).toMatch(/unreachable/i);
    expect(readableError(new Error("401 unauthorized"))).toMatch(/rejected/i);
    expect(readableError(new Error("404 not found"))).toMatch(/not found/i);
  });
  it("extracts error/message from JSON payloads", () => {
    expect(readableError(new Error('{"error":"Slug already exists."}'))).toBe(
      "Slug already exists.",
    );
  });
  it("handles non-Error values", () => {
    expect(readableError("boom")).toBe("Something went wrong.");
  });
});
