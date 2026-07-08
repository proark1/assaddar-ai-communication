import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Inbox,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { formatDate, formatPercent, titleCase } from "./page-helpers";
import type { Conversation, Handoff } from "./page-types";
import { FocusSummaryGrid, type SummaryTileItem } from "./WorkspaceUi";

export type BusinessKnowledgeCheckItem = {
  label: string;
};

export function TodayFocusSummary({
  channelConnectionCount,
  channelReadinessScore,
  connectedChannelCount,
  knowledgeGapCount,
  onOpenChannels,
  onOpenKnowledge,
  onOpenLeads,
  onOpenSettings,
  openLeadCount,
  setupCompletion,
  staleLeadCount,
}: {
  channelConnectionCount: number;
  channelReadinessScore: number;
  connectedChannelCount: number;
  knowledgeGapCount: number;
  onOpenChannels: () => void;
  onOpenKnowledge: () => void;
  onOpenLeads: () => void;
  onOpenSettings: () => void;
  openLeadCount: number;
  setupCompletion: number;
  staleLeadCount: number;
}) {
  const leadWorkCount = openLeadCount + staleLeadCount;
  const setupSummary = setupCompletion >= 100 ? "Ready" : "Needs setup";
  const summaryItems: SummaryTileItem[] = [
    {
      label: "Work",
      value: leadWorkCount,
      detail: leadWorkCount ? "Leads need follow-up" : "No lead follow-up due",
      tone: leadWorkCount ? "warn" : "good",
      onClick: onOpenLeads,
    },
    {
      label: "Answers",
      value: knowledgeGapCount,
      detail:
        knowledgeGapCount > 0
          ? "Knowledge gaps to fill"
          : "No urgent answer gaps",
      tone: knowledgeGapCount > 0 ? "warn" : "good",
      onClick: onOpenKnowledge,
    },
    {
      label: "Channels",
      value: `${connectedChannelCount}/${channelConnectionCount || 1}`,
      detail:
        channelReadinessScore >= 100
          ? "Customer channels ready"
          : "Next channel needs setup",
      tone: channelReadinessScore >= 100 ? "good" : "neutral",
      onClick: onOpenChannels,
    },
    {
      label: "Setup",
      value: `${setupCompletion}%`,
      detail: setupSummary,
      tone: setupCompletion >= 100 ? "good" : "neutral",
      onClick: onOpenSettings,
    },
  ];

  return <FocusSummaryGrid ariaLabel="Today summary" items={summaryItems} />;
}

export function BusinessReadinessPanel({
  businessKnowledgeChecks,
  missingKnowledgeChecks,
}: {
  businessKnowledgeChecks: BusinessKnowledgeCheckItem[];
  missingKnowledgeChecks: BusinessKnowledgeCheckItem[];
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div className="panelTitle">
          <ShieldCheck size={18} />
          <h2>Business readiness</h2>
        </div>
        <span
          className="countPill"
          data-tone={missingKnowledgeChecks.length ? "warn" : "good"}
        >
          {missingKnowledgeChecks.length ? "Needs work" : "Ready"}
        </span>
      </div>
      <div className="readinessList">
        {businessKnowledgeChecks.map((check) => {
          const done = !missingKnowledgeChecks.some(
            (missing) => missing.label === check.label,
          );
          return (
            <article data-done={done ? "true" : "false"} key={check.label}>
              {done ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{check.label}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function NeedsAttentionPanel({
  openHandoffSummaryCount,
  openHandoffs,
  onOpenHandoff,
  onOpenTest,
  personalDataAccessDenied,
}: {
  openHandoffSummaryCount: number;
  openHandoffs: Handoff[];
  onOpenHandoff: (handoff: Handoff) => void;
  onOpenTest: () => void;
  personalDataAccessDenied: boolean;
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div className="panelTitle">
          <Inbox size={18} />
          <h2>Needs attention</h2>
        </div>
        <span className="countPill">{openHandoffSummaryCount}</span>
      </div>
      <div className="compactList">
        {openHandoffs.length ? (
          openHandoffs.slice(0, 4).map((handoff) => (
            <button
              className="plainListButton"
              key={handoff.id}
              type="button"
              onClick={() => onOpenHandoff(handoff)}
            >
              <strong>{handoff.reason}</strong>
              <span>{handoff.requesterMessage}</span>
            </button>
          ))
        ) : personalDataAccessDenied ? (
          <div className="emptyState compact">
            Handoffs are hidden for this session.
          </div>
        ) : (
          <button
            className="plainListButton"
            type="button"
            onClick={onOpenTest}
          >
            <strong>No open handoffs</strong>
            <span>Test a low-confidence question.</span>
          </button>
        )}
      </div>
    </section>
  );
}

export function RecentConversationsPanel({
  conversationSummaryCount,
  conversations,
  onOpenConversation,
  onOpenTest,
  personalDataAccessDenied,
}: {
  conversationSummaryCount: number;
  conversations: Conversation[];
  onOpenConversation: (conversation: Conversation) => void;
  onOpenTest: () => void;
  personalDataAccessDenied: boolean;
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div className="panelTitle">
          <MessageSquare size={18} />
          <h2>Recent conversations</h2>
        </div>
        <span className="countPill">{conversationSummaryCount}</span>
      </div>
      <div className="compactList">
        {conversations.length ? (
          conversations.slice(0, 4).map((conversation) => (
            <button
              className="plainListButton"
              key={conversation.id}
              type="button"
              onClick={() => onOpenConversation(conversation)}
            >
              <strong>{titleCase(conversation.channel)}</strong>
              <span>{formatDate(conversation.createdAt)}</span>
            </button>
          ))
        ) : personalDataAccessDenied ? (
          <div className="emptyState compact">
            Conversation list hidden for this session.
          </div>
        ) : (
          <button
            className="plainListButton"
            type="button"
            onClick={onOpenTest}
          >
            <strong>No conversations yet</strong>
            <span>Send a test message.</span>
          </button>
        )}
      </div>
    </section>
  );
}

export function TrafficFunnelPanel({
  chatOutcomeCount,
  ctaClickCount,
  leadConversionRate,
  quickReplyCount,
  widgetOpenCount,
}: {
  chatOutcomeCount: number;
  ctaClickCount: number;
  leadConversionRate: number;
  quickReplyCount: number;
  widgetOpenCount: number;
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div className="panelTitle">
          <BarChart3 size={18} />
          <h2>Traffic funnel</h2>
        </div>
        <span className="countPill">{formatPercent(leadConversionRate)}</span>
      </div>
      <div className="funnelGrid">
        <article>
          <span>Widget opens</span>
          <strong>{widgetOpenCount}</strong>
        </article>
        <article>
          <span>Chat outcomes</span>
          <strong>{chatOutcomeCount}</strong>
        </article>
        <article>
          <span>Quick replies</span>
          <strong>{quickReplyCount}</strong>
        </article>
        <article>
          <span>CTA clicks</span>
          <strong>{ctaClickCount}</strong>
        </article>
      </div>
    </section>
  );
}

export function AnswerQualityPanel({
  answeredCount,
  leadHandoffCount,
  unansweredCount,
  unansweredRate,
  wonLeadCount,
}: {
  answeredCount: number;
  leadHandoffCount: number;
  unansweredCount: number;
  unansweredRate: number;
  wonLeadCount: number;
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div className="panelTitle">
          <BarChart3 size={18} />
          <h2>Answer quality</h2>
        </div>
        <span className="countPill">{formatPercent(100 - unansweredRate)}</span>
      </div>
      <div className="qualityRows">
        <article>
          <span>Answered</span>
          <strong>{answeredCount}</strong>
        </article>
        <article data-alert={unansweredCount ? "true" : "false"}>
          <span>Needs knowledge or human</span>
          <strong>{unansweredCount}</strong>
        </article>
        <article>
          <span>Lead captures</span>
          <strong>{leadHandoffCount}</strong>
        </article>
        <article>
          <span>Won leads</span>
          <strong>{wonLeadCount}</strong>
        </article>
      </div>
    </section>
  );
}
