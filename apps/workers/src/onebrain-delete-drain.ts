// Drains the OneBrain delete outbox: for each captured record, ask OneBrain to
// erase the remote copy and mark the row done only once OneBrain confirms. A
// failed attempt stays pending for retry until it exhausts its attempt budget,
// so one broken record cannot block the queue. Kept dependency-injected so it is
// unit-testable without a database or a live OneBrain.

export type OneBrainDeleteOutboxItem = {
  id: string;
  sourceRef: string;
  attempts: number;
};

export type OneBrainDeleteDrainStore = {
  listPendingOneBrainDeletes(
    limit: number,
  ): Promise<OneBrainDeleteOutboxItem[]>;
  markOneBrainDeleteDone(id: string): Promise<void>;
  markOneBrainDeleteFailed(
    id: string,
    error: string,
    exhausted: boolean,
  ): Promise<void>;
};

export type OneBrainDeleteDrainProvider = {
  deleteRecord?(input: { sourceRef: string }): Promise<{ deleted: number }>;
};

export type OneBrainDeleteDrainResult = {
  processed: number;
  deleted: number;
  failed: number;
};

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_ATTEMPTS = 5;

export async function processOneBrainDeleteOutbox(
  store: OneBrainDeleteDrainStore,
  provider: OneBrainDeleteDrainProvider,
  options: {
    limit?: number;
    maxAttempts?: number;
    log?: (message: string) => void;
  } = {},
): Promise<OneBrainDeleteDrainResult> {
  if (!provider.deleteRecord) {
    return { processed: 0, deleted: 0, failed: 0 };
  }
  const limit = options.limit ?? DEFAULT_LIMIT;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const pending = await store.listPendingOneBrainDeletes(limit);

  let deleted = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      const result = await provider.deleteRecord({ sourceRef: row.sourceRef });
      await store.markOneBrainDeleteDone(row.id);
      deleted += result.deleted;
    } catch (error) {
      const exhausted = row.attempts + 1 >= maxAttempts;
      const message = error instanceof Error ? error.message : String(error);
      await store.markOneBrainDeleteFailed(row.id, message, exhausted);
      failed += 1;
      options.log?.(
        `delete failed for ${row.sourceRef}${exhausted ? " (exhausted)" : ""}: ${message}`,
      );
    }
  }
  return { processed: pending.length, deleted, failed };
}
