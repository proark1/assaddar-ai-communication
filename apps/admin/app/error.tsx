"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

/**
 * Route-level error boundary for the admin dashboard.
 *
 * Next.js (app router) renders this automatically when a child Server/Client
 * Component throws during render, in a lifecycle method, or in a hook. It
 * replaces the white-screen crash with a recoverable, on-brand card:
 *  - "Try again" calls `reset()` to re-render the segment,
 *  - the reload link does a full document reload as a fallback.
 *
 * We never surface the raw error message or stack in production — only a
 * generic message plus the optional `error.digest` (a server-side hash Next.js
 * uses to correlate the client error with server logs). In development the real
 * message is shown to aid debugging.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the full error to the browser console (dev) / monitoring hooks.
    console.error(error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="emptyWorkspace" role="alert" aria-live="assertive">
      <section className="panel" style={{ width: "min(520px, 100%)" }}>
        <div className="panelTitle">
          <AlertCircle size={18} color="var(--danger)" />
          <h2>Something went wrong</h2>
        </div>
        <p className="mutedText" style={{ marginTop: 12 }}>
          The dashboard ran into an unexpected problem and couldn&apos;t finish
          rendering this view. Your data is safe — try again, and if the issue
          persists, reload the page.
        </p>
        {isDev && error.message ? (
          <pre className="snippet" style={{ marginTop: 12, textAlign: "left" }}>
            {error.message}
          </pre>
        ) : null}
        {error.digest ? (
          <p className="mutedText" style={{ marginTop: 12, fontSize: 12 }}>
            Reference code: <code>{error.digest}</code>
          </p>
        ) : null}
        <div className="rowActions" style={{ marginTop: 16 }}>
          <button
            className="secondaryButton"
            type="button"
            onClick={() => {
              // Force a full reload rather than a client-side navigation so a
              // corrupted client state is fully discarded.
              window.location.reload();
            }}
          >
            Reload page
          </button>
          <button
            className="primaryButton"
            type="button"
            onClick={() => reset()}
          >
            <RotateCcw size={16} />
            Try again
          </button>
        </div>
      </section>
    </div>
  );
}
