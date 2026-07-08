import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react";
import type { ProductionReadinessResult } from "./page-types";

export type SetupChecklistStep = {
  action: string;
  done: boolean;
  label: string;
  sectionId?: string | undefined;
  tab: string;
};

export function SetupChecklistPanel({
  completedSteps,
  onOpenStep,
  setupSteps,
}: {
  completedSteps: number;
  onOpenStep: (step: SetupChecklistStep) => void;
  setupSteps: SetupChecklistStep[];
}) {
  return (
    <section className="panel setupPanel">
      <div className="panelHeader">
        <div className="panelTitle">
          <ClipboardCheck size={18} />
          <h2>Launch checklist</h2>
        </div>
        <span className="countPill">
          {completedSteps}/{setupSteps.length}
        </span>
      </div>
      <div className="progressTrack">
        <span
          style={{ width: `${(completedSteps / setupSteps.length) * 100}%` }}
        />
      </div>
      <div className="setupList">
        {setupSteps.map((step) => (
          <button
            data-done={step.done ? "true" : "false"}
            key={step.label}
            type="button"
            onClick={() => onOpenStep(step)}
          >
            {step.done ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
            <div>
              <strong>{step.label}</strong>
              <span>{step.done ? "Ready" : step.action}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function OperationalHealthPanel({
  averageLeadScore,
  channelReadinessScore,
  dueLeadsCount,
  hotLeadsCount,
  knowledgeGapCount,
}: {
  averageLeadScore: number;
  channelReadinessScore: number;
  dueLeadsCount: number;
  hotLeadsCount: number;
  knowledgeGapCount: number;
}) {
  return (
    <section className="panel operationalPanel">
      <div className="panelHeader">
        <div className="panelTitle">
          <BarChart3 size={18} />
          <h2>Operational health</h2>
        </div>
        <span className="countPill">{channelReadinessScore}% channels</span>
      </div>
      <div className="operationalGrid">
        <article data-alert={dueLeadsCount ? "true" : "false"}>
          <span>Due follow-ups</span>
          <strong>{dueLeadsCount}</strong>
          <small>Scheduled leads needing attention today</small>
        </article>
        <article data-alert={hotLeadsCount ? "true" : "false"}>
          <span>Hot leads</span>
          <strong>{hotLeadsCount}</strong>
          <small>At or above the qualification threshold</small>
        </article>
        <article>
          <span>Average lead score</span>
          <strong>{averageLeadScore}/100</strong>
          <small>Based on captured lead details</small>
        </article>
        <article data-alert={knowledgeGapCount ? "true" : "false"}>
          <span>Knowledge gaps</span>
          <strong>{knowledgeGapCount}</strong>
          <small>Missing topics and unanswered questions</small>
        </article>
      </div>
    </section>
  );
}

export function ProductionReadinessPanel({
  onOpenCheck,
  productionReadiness,
}: {
  onOpenCheck: (checkId: string) => void;
  productionReadiness: ProductionReadinessResult | null;
}) {
  const score = productionReadiness?.score ?? 0;
  const statusLabel =
    productionReadiness?.status === "ready_for_beta"
      ? "Beta ready"
      : productionReadiness?.status === "needs_work"
        ? "Needs work"
        : productionReadiness
          ? "Not ready"
          : "Checking";
  const nextActions = productionReadiness?.summary.nextActions ?? [];

  return (
    <section className="panel operationalPanel">
      <div className="panelHeader">
        <div className="panelTitle">
          <ShieldCheck size={18} />
          <h2>Production readiness</h2>
        </div>
        <span
          className="countPill"
          data-tone={
            productionReadiness?.status === "ready_for_beta" ? "good" : "warn"
          }
        >
          {score}/100
        </span>
      </div>
      <div className="progressTrack">
        <span style={{ width: `${score}%` }} />
      </div>
      <div className="operationalGrid">
        <article
          data-alert={productionReadiness?.summary.failed ? "true" : "false"}
        >
          <span>Status</span>
          <strong>{statusLabel}</strong>
          <small>Production beta gate across the top 10 areas</small>
        </article>
        <article>
          <span>Passed</span>
          <strong>{productionReadiness?.summary.passed ?? 0}</strong>
          <small>Checks already satisfied</small>
        </article>
        <article
          data-alert={productionReadiness?.summary.warnings ? "true" : "false"}
        >
          <span>Warnings</span>
          <strong>{productionReadiness?.summary.warnings ?? 0}</strong>
          <small>Useful before launch</small>
        </article>
        <article
          data-alert={productionReadiness?.summary.failed ? "true" : "false"}
        >
          <span>Blockers</span>
          <strong>{productionReadiness?.summary.failed ?? 0}</strong>
          <small>Must resolve before production selling</small>
        </article>
      </div>
      <div className="nextActionList">
        {nextActions.length ? (
          nextActions.slice(0, 4).map((check) => (
            <button
              className="actionItem"
              data-tone={check.status === "fail" ? "urgent" : "warn"}
              key={check.id}
              type="button"
              onClick={() => onOpenCheck(check.id)}
            >
              <span>{check.status}</span>
              <strong>{check.title}</strong>
              <small>{check.detail}</small>
            </button>
          ))
        ) : (
          <div className="emptyState compact">
            Production readiness has no open actions.
          </div>
        )}
      </div>
    </section>
  );
}
