import type { DataFileError, DataFailure } from "@/lib/data/loader";

const MESSAGES: Record<DataFailure, string> = {
  missing: "A data file is missing.",
  network: "The data could not be downloaded. Check your connection.",
  timeout: "The data is taking too long to download.",
  invalid: "A data file failed its accuracy checks.",
  unavailable: "This site or date range cannot be calculated. Our data covers 2026 to 2030.",
};

interface DataNoticeProps {
  error: DataFileError;
  retry: () => void;
}

/** Shown in place of results whenever data cannot be trusted; no number is displayed. */
export function DataNotice({ error, retry }: DataNoticeProps) {
  return (
    <div className="message" role="alert">
      <h2>No results to show</h2>
      <p>{MESSAGES[error.kind]} We show nothing rather than a wrong number.</p>
      {error.kind !== "unavailable" && (
        <button type="button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
