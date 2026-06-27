"use client";

import { useEffect } from "react";

/**
 * Last-resort global error boundary.
 *
 * Unlike `error.tsx`, this catches failures in the root layout itself, so it
 * must render its own `<html>` and `<body>` — the normal layout is not
 * available here, which also means `globals.css` is not guaranteed to be
 * applied. Styling is therefore inline and intentionally minimal.
 *
 * As with the route boundary, the raw error is never shown in production; we
 * expose only a generic message and the optional `error.digest`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f8f7f4",
          color: "#16191e",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <main
          role="alert"
          style={{
            width: "min(440px, 100%)",
            border: "1px solid #e4ded4",
            borderRadius: 8,
            background: "#ffffff",
            boxShadow:
              "0 1px 2px rgba(22, 25, 30, 0.04), 0 14px 34px -20px rgba(22, 25, 30, 0.28)",
            padding: 22,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.2 }}>
            Something went wrong
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              color: "#5f6671",
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            The dashboard failed to load. Please try again, or reload the page
            if the problem continues.
          </p>
          {error.digest ? (
            <p style={{ margin: "10px 0 0", color: "#5f6671", fontSize: 12 }}>
              Reference code: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              minHeight: 40,
              border: 0,
              borderRadius: 8,
              background: "#a66e2f",
              color: "#ffffff",
              padding: "0 16px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
