import type { ReactNode } from "react";
import { CheckCircle2, PhoneCall, Send, TrendingUp } from "lucide-react";
import type { TenantAnalytics } from "./page-types";

function percent(rate: number | undefined): string {
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    return "—";
  }
  return `${Math.round(rate * 1000) / 10}%`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || seconds <= 0) {
    return "—";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * Quality- and health-oriented analytics for the tenant dashboard: how often the
 * assistant resolves requests itself, whether outbound replies are reaching
 * customers, and voice-call activity. All sections degrade gracefully when the
 * underlying metrics are absent (older API payloads).
 */
export function AnalyticsPanel({
  analytics,
}: {
  analytics: TenantAnalytics | null;
}) {
  if (!analytics) {
    return null;
  }
  const { quality, deliveries, voice, window } = analytics;

  return (
    <section className="analyticsPanel" aria-label="Performance analytics">
      {window ? (
        <p className="analyticsWindow">
          Last {window.days} days: {window.conversations} conversations,{" "}
          {window.messages} messages, {window.handoffs} handoffs
        </p>
      ) : null}
      <div className="analyticsGrid">
        <AnalyticsStat
          icon={<TrendingUp size={18} />}
          label="AI containment"
          value={percent(quality?.containmentRate)}
          hint={
            quality
              ? `${quality.answered}/${quality.total} answered by AI`
              : "No answered requests yet"
          }
        />
        <AnalyticsStat
          icon={<CheckCircle2 size={18} />}
          label="Handoff rate"
          value={percent(quality?.handoffRate)}
          hint={quality ? `${quality.handoff} escalated to a human` : undefined}
        />
        <AnalyticsStat
          icon={<Send size={18} />}
          label="Delivery failures"
          alert={Boolean(deliveries && deliveries.failed > 0)}
          value={percent(deliveries?.failureRate)}
          hint={
            deliveries
              ? `${deliveries.failed} failed of ${deliveries.sent + deliveries.failed} sent`
              : undefined
          }
        />
        {voice && voice.calls > 0 ? (
          <AnalyticsStat
            icon={<PhoneCall size={18} />}
            label="Voice calls"
            value={String(voice.calls)}
            hint={`avg ${formatDuration(voice.avgDurationSeconds)}`}
          />
        ) : null}
      </div>
    </section>
  );
}

function AnalyticsStat({
  icon,
  label,
  value,
  hint,
  alert = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string | undefined;
  alert?: boolean;
}) {
  return (
    <article className="analyticsStat" data-alert={alert ? "true" : "false"}>
      <div className="analyticsStatHeader">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}
