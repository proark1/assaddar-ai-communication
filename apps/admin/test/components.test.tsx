import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastStack } from "../app/ToastStack";
import { DeleteKnowledgeModal } from "../app/DeleteKnowledgeModal";
import ErrorBoundary from "../app/error";
import { AnalyticsPanel } from "../app/AnalyticsPanel";
import { DashboardMetrics } from "../app/DashboardMetrics";
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

describe("DashboardMetrics", () => {
  const props = {
    loading: false,
    conversations: 47,
    messages: 127,
    calls: 9,
    contacts: 8,
    leads: 5,
    knowledge: 31,
    openHandoffs: 39,
    unanswered: 38,
  };

  it("surfaces calls as a dedicated card alongside the other counts", () => {
    render(<DashboardMetrics {...props} />);

    // Calls are tracked and shown explicitly (they also live inside
    // conversations/messages as the telephone channel).
    expect(screen.getByText("Calls")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    // Leads come from the privacy-safe aggregate, coherent with the others.
    expect(screen.getByText("Leads")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("47")).toBeInTheDocument();
    expect(screen.getByText("127")).toBeInTheDocument();
  });

  it("renders skeleton placeholders while loading", () => {
    const { container } = render(
      <DashboardMetrics {...props} loading={true} />,
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText("Calls")).not.toBeInTheDocument();
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

describe("AnalyticsPanel", () => {
  it("renders nothing without analytics", () => {
    const { container } = render(<AnalyticsPanel analytics={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows quality, delivery and voice metrics as percentages", () => {
    render(
      <AnalyticsPanel
        analytics={{
          conversations: 10,
          messages: 40,
          approvedKnowledge: 5,
          openHandoffs: 1,
          totalHandoffs: 3,
          usageByStatus: [],
          quality: {
            answered: 70,
            refused: 20,
            handoff: 10,
            total: 100,
            containmentRate: 0.7,
            refusalRate: 0.2,
            handoffRate: 0.1,
          },
          deliveries: {
            total: 12,
            sent: 10,
            failed: 2,
            skipped: 0,
            other: 0,
            failureRate: 0.167,
          },
          voice: {
            calls: 3,
            completed: 3,
            avgDurationSeconds: 95,
            lastCallAt: null,
          },
          window: { days: 30, conversations: 4, messages: 12, handoffs: 1 },
        }}
      />,
    );

    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("16.7%")).toBeInTheDocument();
    expect(screen.getByText("Voice calls")).toBeInTheDocument();
    expect(screen.getByText(/Last 30 days/)).toBeInTheDocument();
  });

  it("hides the voice stat when there are no calls", () => {
    render(
      <AnalyticsPanel
        analytics={{
          conversations: 1,
          messages: 1,
          approvedKnowledge: 0,
          openHandoffs: 0,
          totalHandoffs: 0,
          usageByStatus: [],
          voice: {
            calls: 0,
            completed: 0,
            avgDurationSeconds: null,
            lastCallAt: null,
          },
        }}
      />,
    );
    expect(screen.queryByText("Voice calls")).not.toBeInTheDocument();
  });
});
