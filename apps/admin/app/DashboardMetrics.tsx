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
      <MetricCard icon={<BarChart3 size={18} />} label="Conversations">
        {conversations}
      </MetricCard>
      <MetricCard icon={<MessageSquare size={18} />} label="Messages">
        {messages}
      </MetricCard>
      <MetricCard icon={<UserCheck size={18} />} label="Contacts">
        {contacts}
      </MetricCard>
      <MetricCard icon={<UserCheck size={18} />} label="Leads">
        {leads}
      </MetricCard>
      <MetricCard icon={<Database size={18} />} label="Knowledge">
        {knowledge}
      </MetricCard>
      <MetricCard
        alert={openHandoffs > 0}
        icon={<Inbox size={18} />}
        label="Open handoffs"
      >
        {openHandoffs}
      </MetricCard>
      <MetricCard
        alert={unanswered > 0}
        icon={<AlertCircle size={18} />}
        label="Unanswered"
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
}: {
  alert?: boolean;
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <article className="metricCard" data-alert={alert ? "true" : "false"}>
      {icon}
      <span>{label}</span>
      <strong>{children}</strong>
    </article>
  );
}
