const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "please",
  "the",
  "this",
  "to",
  "we",
  "you",
  "your"
]);

const GERMAN_STOP_WORDS = [
  "aber",
  "als",
  "am",
  "an",
  "auch",
  "auf",
  "aus",
  "bei",
  "bin",
  "bis",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "ein",
  "eine",
  "einen",
  "einer",
  "eines",
  "er",
  "es",
  "fur",
  "fuer",
  "hat",
  "ich",
  "im",
  "in",
  "ist",
  "mit",
  "oder",
  "sie",
  "sind",
  "und",
  "vom",
  "von",
  "warum",
  "was",
  "welche",
  "welchem",
  "welchen",
  "welcher",
  "welches",
  "wer",
  "wie",
  "wir",
  "wo",
  "zu"
];

for (const word of GERMAN_STOP_WORDS) {
  STOP_WORDS.add(word);
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function tokenize(value: string): string[] {
  return normalizeForTokenization(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/i)
    .map(stemToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeForTokenization(value: string): string {
  return normalizeText(value)
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function containsPhrase(haystack: string, phrases: string[]): string | null {
  const normalizedHaystack = normalizeText(haystack).toLowerCase();
  for (const phrase of phrases) {
    const normalizedPhrase = normalizeText(phrase).toLowerCase();
    if (normalizedPhrase && normalizedHaystack.includes(normalizedPhrase)) {
      return phrase;
    }
  }

  return null;
}

export function tokenOverlapScore(query: string, content: string): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return 0;
  }

  const contentTokens = new Set(tokenize(content));
  let overlap = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / queryTokens.size;
}

export function stableKeywordScore(query: string, keywords: string[]): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0 || keywords.length === 0) {
    return 0;
  }

  let matches = 0;
  for (const keyword of keywords.flatMap(tokenize)) {
    if (queryTokens.has(keyword)) {
      matches += 1;
    }
  }

  return matches / Math.max(queryTokens.size, 1);
}

function stemToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("ing") && token.length > 5) {
    return token.slice(0, -3);
  }

  if (token.endsWith("ed") && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}
