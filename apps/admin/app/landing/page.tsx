import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  Globe2,
  Inbox,
  MessageCircle,
  PhoneCall,
  RadioTower,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Assaddar AI Communication | AI customer communication platform",
  description:
    "A professional AI communication platform for website chat, telephone AI, WhatsApp, Messenger, lead handoffs, and approved answers.",
};

const channelCards = [
  {
    icon: Globe2,
    title: "Website assistant",
    text: "Answer visitors from approved knowledge, qualify leads, and guide them to booking or handoff.",
  },
  {
    icon: PhoneCall,
    title: "Telephone AI",
    text: "Connect a provider number or SIP trunk, run calls through the voice bridge, and save transcripts.",
  },
  {
    icon: MessageCircle,
    title: "Social messaging",
    text: "Bundle WhatsApp, Messenger, and Instagram into the same lead and handoff workflow.",
  },
];

const proofPoints = [
  "One inbox for chat, phone, and social conversations",
  "Approved Q&A knowledge instead of uncontrolled answers",
  "Human handoff, lead scoring, and follow-up reminders",
  "Railway pilot today, German infrastructure path later",
];

const workflowSteps = [
  {
    label: "Collect",
    title: "Bring every request into one place",
    text: "Website forms, assistant chats, phone calls, and social messages become structured conversations.",
  },
  {
    label: "Answer",
    title: "Use verified business knowledge",
    text: "The assistant answers from approved FAQs and flags gaps when a human should improve the knowledge base.",
  },
  {
    label: "Escalate",
    title: "Hand off when it matters",
    text: "Low confidence, urgent topics, and sales-ready leads move to the owner or operator with context.",
  },
  {
    label: "Improve",
    title: "Turn real questions into better automation",
    text: "Unanswered questions, call outcomes, and lead quality feed the next round of approved answers.",
  },
];

export default function LandingPage() {
  return (
    <main className="landingPage">
      <header className="landingNav">
        <Link className="landingBrand" href="/">
          <span className="brandMark">
            <Bot size={20} />
          </span>
          <span>Assaddar AI Communication</span>
        </Link>
        <nav aria-label="Landing navigation">
          <a href="#platform">Platform</a>
          <a href="#channels">Channels</a>
          <a href="#implementation">Implementation</a>
          <Link className="landingNavCta" href="/">
            Open admin
          </Link>
        </nav>
      </header>

      <section className="landingHero">
        <div className="landingHeroOverlay" />
        <div className="landingHeroContent">
          <span className="eyebrow">AI communication platform</span>
          <h1>Assaddar AI Communication</h1>
          <p>
            Sell, support, and qualify customers across website chat, telephone
            AI, WhatsApp, Messenger, and Instagram from one professional
            workspace.
          </p>
          <div className="landingHeroActions">
            <Link className="primaryButton linkButton" href="/">
              Open admin
              <ArrowRight size={16} />
            </Link>
            <a className="secondaryButton linkButton" href="#platform">
              See how it works
            </a>
          </div>
          <div className="landingHeroProof">
            {proofPoints.slice(0, 3).map((point) => (
              <span key={point}>
                <CheckCircle2 size={15} />
                {point}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="landingBand" id="platform">
        <div className="landingSectionHeader">
          <span className="eyebrow">Built for operators</span>
          <h2>
            A communication center that keeps the business owner in control.
          </h2>
          <p>
            The AI handles routine answers, while the admin gives humans a clear
            place to review leads, improve answers, and step in when needed.
          </p>
        </div>
        <div className="landingValueGrid">
          <article>
            <Inbox size={22} />
            <strong>Unified inbox</strong>
            <span>
              Conversations, leads, call transcripts, and handoffs are grouped
              by customer instead of scattered across tools.
            </span>
          </article>
          <article>
            <Database size={22} />
            <strong>Approved answers</strong>
            <span>
              The assistant is grounded in business-approved Q&A and highlights
              unanswered topics for review.
            </span>
          </article>
          <article>
            <Sparkles size={22} />
            <strong>Automation that stays practical</strong>
            <span>
              Lead emails, weekly summaries, stale-lead reminders, and readiness
              scoring reduce manual follow-up work.
            </span>
          </article>
        </div>
      </section>

      <section className="landingBand tinted" id="channels">
        <div className="landingSectionHeader">
          <span className="eyebrow">Omnichannel by design</span>
          <h2>
            Start with the website. Add phone and social channels when ready.
          </h2>
          <p>
            The platform separates regulated channel providers from the AI
            workflow, so numbers and messaging accounts can connect without
            giving up the central customer workspace.
          </p>
        </div>
        <div className="landingChannelGrid">
          {channelCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title}>
                <Icon size={24} />
                <strong>{card.title}</strong>
                <span>{card.text}</span>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landingWorkflow">
        <div className="landingSectionHeader">
          <span className="eyebrow">Workflow</span>
          <h2>From first question to qualified opportunity.</h2>
        </div>
        <div className="landingWorkflowGrid">
          {workflowSteps.map((step) => (
            <article key={step.label}>
              <span>{step.label}</span>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landingBand" id="implementation">
        <div className="landingSplit">
          <div>
            <span className="eyebrow">Implementation path</span>
            <h2>
              Pilot fast on Railway. Move sensitive workloads when proven.
            </h2>
            <p>
              Use Railway and API-based AI for the first customer tests. When
              the workflow is validated, move data-sensitive workloads to German
              infrastructure and connect an open-source model for grounded Q&A.
            </p>
          </div>
          <div className="landingChecklist">
            {proofPoints.map((point) => (
              <article key={point}>
                <ShieldCheck size={18} />
                <span>{point}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landingCta">
        <div>
          <span className="eyebrow">Ready for the first rollout</span>
          <h2>
            Launch the assistant, connect channels, and let the owner answer
            from one place.
          </h2>
        </div>
        <div className="landingCtaActions">
          <Link className="primaryButton linkButton" href="/">
            Open admin
            <ArrowRight size={16} />
          </Link>
          <a
            className="secondaryButton linkButton"
            href="https://www.assad-dar.de/de"
          >
            Visit assad-dar.de
          </a>
        </div>
      </section>

      <footer className="landingFooter">
        <span>Assaddar AI Communication</span>
        <span>
          <RadioTower size={14} />
          Website, phone, social, inbox, and automation.
        </span>
        <span>
          <UserCheck size={14} />
          Built for consultants and service teams.
        </span>
      </footer>
    </main>
  );
}
