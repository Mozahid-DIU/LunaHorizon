"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
  error: unknown;
  retry: () => void;
}

/** Replaces the root layout if it fails, so it brings its own document and plain styles. */
export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 40, background: "#04060e", color: "#eef1f8", fontFamily: "system-ui, sans-serif" }}>
        <h1>Something went wrong</h1>
        <p>LunaHorizon could not be shown, so no results are displayed. Please try again.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
