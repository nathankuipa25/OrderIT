"use client";

import { useEffect } from "react";

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
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f6f7f9",
          color: "#1c1f26",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 20, maxWidth: 320 }}>
          OrderIT hit an unexpected error. Try reloading the page.
        </div>
        <button
          onClick={() => reset()}
          style={{
            background: "#0f2340",
            color: "#fff",
            fontWeight: 600,
            border: "none",
            borderRadius: 12,
            height: 48,
            padding: "0 24px",
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
