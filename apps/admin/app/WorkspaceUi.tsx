import type { ReactNode } from "react";

export type SummaryTileItem = {
  label: string;
  value: ReactNode;
  detail: string;
  tone?: "good" | "warn" | "neutral";
  onClick: () => void;
};

export function FocusSummaryGrid({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: SummaryTileItem[];
}) {
  return (
    <section className="focusSummaryGrid" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          className="summaryTile"
          data-tone={item.tone}
          key={item.label}
          type="button"
          onClick={item.onClick}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.detail}</small>
        </button>
      ))}
    </section>
  );
}

export function WorkspaceDisclosure({
  bodyClassName,
  children,
  detail,
  title,
}: {
  bodyClassName?: string;
  children: ReactNode;
  detail: ReactNode;
  title: string;
}) {
  return (
    <details className="workspaceDisclosure">
      <summary>
        <span>{title}</span>
        <small>{detail}</small>
      </summary>
      <div
        className={
          bodyClassName
            ? `workspaceDisclosureBody ${bodyClassName}`
            : "workspaceDisclosureBody"
        }
      >
        {children}
      </div>
    </details>
  );
}

export function InlineDisclosure({
  children,
  detail,
  title,
}: {
  children: ReactNode;
  detail: ReactNode;
  title: string;
}) {
  return (
    <details className="inlineDisclosure">
      <summary>
        <span>{title}</span>
        <small>{detail}</small>
      </summary>
      {children}
    </details>
  );
}

export type SectionSwitchItem<Id extends string> = {
  icon: ReactNode;
  id: Id;
  label: string;
};

export function SectionSwitch<Id extends string>({
  activeId,
  items,
  onSelect,
}: {
  activeId: Id;
  items: Array<SectionSwitchItem<Id>>;
  onSelect: (id: Id) => void;
}) {
  return (
    <div className="sectionSwitch">
      {items.map((item) => (
        <button
          data-active={activeId === item.id ? "true" : "false"}
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
