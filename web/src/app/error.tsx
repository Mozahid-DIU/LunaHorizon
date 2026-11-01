"use client";

import { useEffect } from "react";

interface ErrorPageProps {
  error: unknown;
  retry: () => void;
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="message" role="alert">
      <h1>Something went wrong</h1>
      <p>This page could not be shown, so no results are displayed. Please try again.</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
