-- Approximate-nearest-neighbour index for semantic knowledge retrieval.
-- Uses cosine distance (matches the `<=>` operator the repository queries with).
-- Safe to run before any embeddings exist; the index simply stays empty until
-- chunks are embedded (set OPENAI_API_KEY and run the embeddings.generate job).
set search_path = public, extensions;

create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks
  using hnsw (embedding vector_cosine_ops);
