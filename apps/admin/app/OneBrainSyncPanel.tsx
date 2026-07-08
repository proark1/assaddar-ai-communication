import {
  AlertCircle,
  CheckCircle2,
  Database,
  ExternalLink,
  PauseCircle,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import type { OneBrainSyncStatus } from "./page-types";

type OneBrainSyncPanelProps = {
  status: OneBrainSyncStatus | null;
};

export function OneBrainSyncPanel({ status }: OneBrainSyncPanelProps) {
  const summary = getSummary(status);
  const latestFailure = status?.recentFailures[0];

  return (
    <section
      className="onebrainSyncPanel"
      data-tone={summary.tone}
      aria-label="OneBrain sync status"
    >
      <div className="onebrainSyncMain">
        <span className="onebrainSyncIcon">{summary.icon}</span>
        <div>
          <span>OneBrain sync</span>
          <strong>{summary.label}</strong>
          <small>{summary.detail}</small>
        </div>
      </div>
      <div className="onebrainSyncStats" aria-label="Sync counts">
        <SyncStat label="Synced" value={status?.stats.synced ?? 0} />
        <SyncStat label="Failed" value={status?.stats.failed ?? 0} />
        <SyncStat label="Total" value={status?.stats.total ?? 0} />
      </div>
      <div className="onebrainSyncMeta">
        {latestFailure ? (
          <span title={latestFailure.lastError ?? undefined}>
            {latestFailure.sourceType}:{" "}
            {latestFailure.lastError ?? "Sync failed"}
          </span>
        ) : (
          <span>
            {status?.lastSyncedAt ? "Last sync recorded" : "No sync rows yet"}
          </span>
        )}
        {status?.docsUrl ? (
          <a href={status.docsUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            Docs
          </a>
        ) : null}
      </div>
    </section>
  );
}

function SyncStat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function getSummary(status: OneBrainSyncStatus | null): {
  detail: string;
  icon: ReactNode;
  label: string;
  tone: "good" | "warn" | "danger" | "neutral";
} {
  if (!status) {
    return {
      detail: "Status loads with the selected workspace.",
      icon: <RefreshCw size={17} />,
      label: "Checking",
      tone: "neutral",
    };
  }
  if (status.readiness === "not_configured") {
    return {
      detail: "Add service URL and key before enabling sync.",
      icon: <AlertCircle size={17} />,
      label: "Not configured",
      tone: "warn",
    };
  }
  if (status.readiness === "disabled") {
    return {
      detail: "Credentials are present; scheduler is off.",
      icon: <PauseCircle size={17} />,
      label: "Ready, disabled",
      tone: "neutral",
    };
  }
  if (status.readiness === "failed") {
    return {
      detail: `${status.stats.failed} failed sync row${
        status.stats.failed === 1 ? "" : "s"
      }`,
      icon: <AlertCircle size={17} />,
      label: "Needs attention",
      tone: "danger",
    };
  }
  if (status.readiness === "synced") {
    return {
      detail: status.lastSyncedAt
        ? `Last sync ${formatDate(status.lastSyncedAt)}`
        : "Approved knowledge has synced.",
      icon: <CheckCircle2 size={17} />,
      label: "Sync healthy",
      tone: "good",
    };
  }
  return {
    detail: "Sync is enabled; waiting for the first successful row.",
    icon: <Database size={17} />,
    label: "Waiting for first sync",
    tone: "warn",
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
