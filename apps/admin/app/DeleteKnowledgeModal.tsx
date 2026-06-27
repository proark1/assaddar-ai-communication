"use client";

import { Trash2 } from "lucide-react";
import { useDialogA11y } from "./dashboard-hooks";
import { getQuestion } from "./page-helpers";
import type { KnowledgeItem } from "./page-types";

export function DeleteKnowledgeModal({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  item: KnowledgeItem;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogA11y(true, onCancel);
  return (
    <div className="modalBackdrop" role="presentation">
      <section
        className="modalPanel"
        role="dialog"
        aria-modal="true"
        aria-label="Delete knowledge"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="panelTitle">
          <Trash2 size={18} />
          <h2>Delete knowledge</h2>
        </div>
        <p>{getQuestion(item)}</p>
        <div className="rowActions">
          <button className="secondaryButton" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dangerButton"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
