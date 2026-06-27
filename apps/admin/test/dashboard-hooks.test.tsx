import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useToasts } from "../app/dashboard-hooks";

describe("useToasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes toasts and ignores empty messages", () => {
    const { result } = renderHook(() => useToasts());

    act(() => result.current.pushToast("success", "Saved"));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.message).toBe("Saved");

    act(() => result.current.pushToast("danger", ""));
    expect(result.current.toasts).toHaveLength(1);
  });

  it("dismisses a toast by id", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.pushToast("success", "One"));
    const id = result.current.toasts[0]!.id;

    act(() => result.current.dismissToast(id));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("auto-dismisses after the timeout", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.pushToast("success", "Temp"));
    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(4300));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("keeps at most 4 toasts", () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      for (let i = 0; i < 6; i += 1) {
        result.current.pushToast("success", `m${i}`);
      }
    });
    expect(result.current.toasts.length).toBeLessThanOrEqual(4);
  });
});
