import type { ReactNode } from "react";
import {
  AlertCircle,
  BarChart3,
  Database,
  Inbox,
  MessageSquare,
  UserCheck,
} from "lucide-react";

type DashboardMetricsProps = {
  loading: boolean;
  conversations: number;
  messages: number;
  contacts: number;
  leads: number;
  knowledge: number;
  openHandoffs: number;
  unanswered: number;
  onOpenAnswers?: () => void;
  onOpenInbox?: () => void;
};

export function DashboardMetrics({
  loading,
  conversations,
  messages,
  contacts,
  leads,
  knowledge,
  openHandoffs,
  unanswered,
  onOpenAnswers,
  onOpenInbox,
}: DashboardMetricsProps) {
  if (loading) {
    return (
      <section className="metricsGrid" aria-busy="true" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, index) => (
          <article className="metricCard skeletonCard" key={index}>
            <span className="skeleton skeletonIcon" />
            <span className="skeleton skeletonLabel" />
            <span className="skeleton skeletonValue" />
          </article>
        ))}
      </section>
    );
  }

  return (
    <section className="metricsGrid">
      <MetricCard
        icon={<BarChart3 size={18} />}
        label="Conversations"
        onClick={onOpenInbox}
      >
        {conversations}
      </MetricCard>
      <MetricCard
        icon={<MessageSquare size={18} />}
        label="Messages"
        onClick={onOpenInbox}
      >
        {messages}
      </MetricCard>
      <MetricCard
        icon={<UserCheck size={18} />}
        label="Contacts"
        onClick={onOpenInbox}
      >
        {contacts}
      </MetricCard>
      <MetricCard
        icon={<UserCheck size={18} />}
        label="Leads"
        onClick={onOpenInbox}
      >
        {leads}
      </MetricCard>
      <MetricCard
        icon={<Database size={18} />}
        label="Knowledge"
        onClick={onOpenAnswers}
      >
        {knowledge}
      </MetricCard>
      <MetricCard
        alert={openHandoffs > 0}
        icon={<Inbox size={18} />}
        label="Open handoffs"
        onClick={onOpenInbox}
      >
        {openHandoffs}
      </MetricCard>
      <MetricCard
        alert={unanswered > 0}
        icon={<AlertCircle size={18} />}
        label="Unanswered"
        onClick={onOpenAnswers}
      >
        {unanswered}
      </MetricCard>
    </section>
  );
}

function MetricCard({
  alert = false,
  children,
  icon,
  label,
  onClick,
}: {
  alert?: boolean;
  children: ReactNode;
  icon: ReactNode;
  label: string;
  onClick?: (() => void) | undefined;
}) {
  const content = (
    <>
      {icon}
      <span>{label}</span>
      <strong>{children}</strong>
    </>
  );

  if (onClick) {
    return (
      <button
        className="metricCard metricButton"
        data-alert={alert ? "true" : "false"}
        type="button"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <article className="metricCard" data-alert={alert ? "true" : "false"}>
      {content}
    </article>
  );
}
