/**
 * Optional embedding provider abstraction for semantic retrieval.
 *
 * The platform runs in grounded keyword mode out of the box. When an
 * `OPENAI_API_KEY` is configured, `createEmbeddingProvider` returns a provider
 * that turns text into vectors so the answer engine can do hybrid
 * keyword + semantic search. Everything here is dormant without a key, so the
 * default behaviour (and tests) are unchanged.
 */

export const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingProvider = {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
};

export type EmbeddingProviderEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_EMBEDDING_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, model: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Embedding request failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    }
    const payload = (await response.json()) as {
      data?: Array<{ embedding: number[]; index: number }>;
    };
    const data = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
    return data.map((item) => item.embedding);
  }
}

/**
 * Build an embedding provider from environment configuration, or return `null`
 * when no provider is configured (keyword-only mode).
 */
export function createEmbeddingProvider(
  env: EmbeddingProviderEnv = process.env,
): EmbeddingProvider | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const model = env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  const baseUrl = env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  return new OpenAIEmbeddingProvider(apiKey, model, baseUrl);
}

/** Cosine similarity in [-1, 1]; used for in-memory scoring and tests. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
