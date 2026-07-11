import { describe, expect, it } from "vitest";
import {
  processOneBrainDeleteOutbox,
  type OneBrainDeleteOutboxItem,
} from "../src/onebrain-delete-drain";

function fakeStore(rows: OneBrainDeleteOutboxItem[]) {
  const done: string[] = [];
  const failed: Array<{ id: string; error: string; exhausted: boolean }> = [];
  return {
    store: {
      listPendingOneBrainDeletes: async () => rows,
      markOneBrainDeleteDone: async (id: string) => {
        done.push(id);
      },
      markOneBrainDeleteFailed: async (
        id: string,
        error: string,
        exhausted: boolean,
      ) => {
        failed.push({ id, error, exhausted });
      },
    },
    done,
    failed,
  };
}

describe("processOneBrainDeleteOutbox", () => {
  it("erases each pending record and marks it done", async () => {
    const { store, done } = fakeStore([
      { id: "1", sourceRef: "ref-1", attempts: 0 },
      { id: "2", sourceRef: "ref-2", attempts: 0 },
    ]);
    const erased: string[] = [];
    const provider = {
      deleteRecord: async ({ sourceRef }: { sourceRef: string }) => {
        erased.push(sourceRef);
        return { deleted: 1 };
      },
    };

    const result = await processOneBrainDeleteOutbox(store, provider);

    expect(result).toEqual({ processed: 2, deleted: 2, failed: 0 });
    expect(done).toEqual(["1", "2"]);
    expect(erased).toEqual(["ref-1", "ref-2"]);
  });

  it("keeps a failing row pending until it exhausts its attempts", async () => {
    const { store, failed } = fakeStore([
      { id: "1", sourceRef: "ref-1", attempts: 0 }, // 0+1 < 5 -> retry
      { id: "2", sourceRef: "ref-2", attempts: 4 }, // 4+1 >= 5 -> exhausted
    ]);
    const provider = {
      deleteRecord: async () => {
        throw new Error("boom");
      },
    };

    const result = await processOneBrainDeleteOutbox(store, provider, {
      maxAttempts: 5,
    });

    expect(result).toEqual({ processed: 2, deleted: 0, failed: 2 });
    expect(failed).toEqual([
      { id: "1", error: "boom", exhausted: false },
      { id: "2", error: "boom", exhausted: true },
    ]);
  });

  it("is a no-op when the provider cannot delete", async () => {
    const { store, done } = fakeStore([
      { id: "1", sourceRef: "ref-1", attempts: 0 },
    ]);
    const result = await processOneBrainDeleteOutbox(store, {});
    expect(result).toEqual({ processed: 0, deleted: 0, failed: 0 });
    expect(done).toEqual([]);
  });
});
