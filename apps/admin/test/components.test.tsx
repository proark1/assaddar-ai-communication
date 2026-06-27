import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastStack } from "../app/ToastStack";
import { DeleteKnowledgeModal } from "../app/DeleteKnowledgeModal";
import ErrorBoundary from "../app/error";
import type { KnowledgeItem, Toast } from "../app/page-types";

describe("ToastStack", () => {
  it("renders nothing when there are no toasts", () => {
    const { container } = render(
      <ToastStack toasts={[]} onDismiss={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each toast and dismisses on click", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const toasts: Toast[] = [{ id: 7, kind: "success", message: "Saved" }];
    render(<ToastStack toasts={toasts} onDismiss={onDismiss} />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});

describe("DeleteKnowledgeModal", () => {
  const item = {
    id: "k1",
    title: "",
    content: "",
    tags: [],
    status: "approved",
    metadata: { question: "What are your hours?" },
  } as KnowledgeItem;

  it("shows the question and wires confirm/cancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DeleteKnowledgeModal
        item={item}
        busy={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("What are your hours?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the delete button while busy", () => {
    render(
      <DeleteKnowledgeModal
        item={item}
        busy={true}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});

describe("error boundary", () => {
  it("renders a recovery UI and calls reset", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
