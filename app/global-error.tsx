"use client";

import { useEffect } from "react";

// Last-resort boundary: catches errors in the ROOT layout and any route
// outside the (app) group (landing, /demo, /login, legal pages). It replaces
// the whole document, so it must render its own <html>/<body> and can't rely
// on globals.css having loaded — styles are inlined against the teal palette.
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fbfbf9",
          color: "#18211f",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "26rem" }}>
          <div
            style={{
              width: 44,
              height: 44,
              margin: "0 auto",
              borderRadius: "9999px",
              background: "rgba(178,58,48,0.1)",
              color: "#b23a30",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
            }}
            aria-hidden
          >
            !
          </div>
          <h1
            style={{
              marginTop: "1.25rem",
              fontSize: "1.25rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Something went wrong.
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#5f6b69",
            }}
          >
            The page hit an unexpected error. Try again — if it keeps happening,
            head back to the home page.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.5rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "rgba(95,107,105,0.7)",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: "1.5rem",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                borderRadius: "0.5rem",
                background: "#114e54",
                color: "#fff",
                border: "none",
                padding: "0.625rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Plain <a>, not next/link: global-error replaces the root
                layout, so the router context isn't guaranteed here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: "0.5rem",
                border: "1px solid #e7e4dd",
                background: "#fff",
                color: "#18211f",
                padding: "0.625rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Back home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
