import { describe, expect, it } from "vitest";
import {
  containsPhrase,
  normalizeText,
  stableKeywordScore,
  tokenize,
  tokenOverlapScore,
} from "../src";

describe("normalizeText", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeText("  hello   world \n\t ")).toBe("hello world");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeText("   \n  ")).toBe("");
  });
});

describe("tokenize", () => {
  it("lowercases, splits on non-alphanumerics, and drops 1-char tokens", () => {
    expect(tokenize("Hello, A World!")).toEqual(["hello", "world"]);
  });

  it("removes English stop words", () => {
    // "are", "you", "on", "the" are stop words; "open" survives.
    expect(tokenize("Are you open on the weekend?")).toEqual([
      "open",
      "weekend",
    ]);
  });

  it("removes German stop words and folds umlauts", () => {
    // "wann" -> "wann"; "sie" and "am" are German stop words.
    const tokens = tokenize("Wann sind Sie am Wochenende geöffnet?");
    expect(tokens).toContain("wann");
    expect(tokens).toContain("wochenende");
    // "geöffnet" -> umlaut folded to "geoeffnet"
    expect(tokens).toContain("geoeffnet");
    expect(tokens).not.toContain("sie");
    expect(tokens).not.toContain("am");
  });

  it("strips apostrophes inside words", () => {
    expect(tokenize("don't won't")).toEqual(["dont", "wont"]);
  });

  it("applies light stemming so plurals/gerunds match singular forms", () => {
    // "ies" -> "y", "ing" -> stem, trailing "s" dropped, "ed" dropped.
    expect(tokenize("queries")).toEqual(["query"]);
    expect(tokenize("running")).toEqual(["runn"]);
    expect(tokenize("prices")).toEqual(["price"]);
    expect(tokenize("booked")).toEqual(["book"]);
  });

  it("returns an empty array for empty/stop-word-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("the and or")).toEqual([]);
  });
});

describe("containsPhrase", () => {
  it("matches case-insensitively and returns the original phrase", () => {
    expect(
      containsPhrase("What is the CAPITAL of France?", ["capital of"]),
    ).toBe("capital of");
  });

  it("normalizes whitespace before matching", () => {
    expect(containsPhrase("legal   advice please", ["legal advice"])).toBe(
      "legal advice",
    );
  });

  it("returns null when no phrase matches", () => {
    expect(containsPhrase("our opening hours", ["capital of"])).toBeNull();
  });

  it("ignores empty phrases", () => {
    expect(containsPhrase("anything", [""])).toBeNull();
  });
});

describe("tokenOverlapScore", () => {
  it("is the fraction of query tokens found in the content", () => {
    // query tokens: ["open", "weekend"]; content has both -> 1.0
    expect(
      tokenOverlapScore("open weekend", "we are open on the weekend"),
    ).toBe(1);
  });

  it("scores partial overlap proportionally", () => {
    // query tokens: ["open", "weekend"]; content has only "open" -> 0.5
    expect(tokenOverlapScore("open weekend", "we are open today")).toBe(0.5);
  });

  it("returns 0 when the query has no usable tokens", () => {
    expect(tokenOverlapScore("the and", "anything here")).toBe(0);
  });

  it("returns 0 when nothing overlaps", () => {
    expect(tokenOverlapScore("prices cost", "opening hours weekend")).toBe(0);
  });
});

describe("stableKeywordScore", () => {
  it("counts matched keyword tokens over query token count", () => {
    // query tokens: ["open", "weekend"]; keyword "open" matches -> 0.5
    expect(stableKeywordScore("are you open weekend", ["open"])).toBe(0.5);
  });

  it("returns 0 with no keywords or no query tokens", () => {
    expect(stableKeywordScore("open weekend", [])).toBe(0);
    expect(stableKeywordScore("the and", ["open"])).toBe(0);
  });
});
