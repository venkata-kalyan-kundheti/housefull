/**
 * components/ErrorBanner.tsx
 *
 * Error banner with exact string mappings according to Section 15.6.
 */

interface ErrorBannerProps {
  code?: string | null;
  message?: string | null;
  onRetry?: () => void;
  className?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  FILM_UNRESOLVED:
    "We could not find this film in the taste graph. Pick one of the closest matches below, or try another show.",
  QLOO_UNAVAILABLE:
    "The taste service is temporarily unavailable. Please try again in a minute.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  SHOW_ALREADY_STARTED: "This show has already started.",
  SHOW_NOT_FOUND: "That show no longer exists.",
};

export function ErrorBanner({
  code,
  message,
  onRetry,
  className = "",
}: ErrorBannerProps) {
  const displayMessage =
    (code && ERROR_MESSAGES[code]) ||
    message ||
    "Something went wrong. Please try again.";

  return (
    <div
      role="alert"
      className={`rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <svg
            className="h-5 w-5 text-red-600 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <div>
            <p className="font-medium text-red-950">{displayMessage}</p>
            {code && (
              <p className="mt-1 text-xs text-red-700/80 font-mono">
                Error code: {code}
              </p>
            )}
          </div>
        </div>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded bg-white px-3 py-1.5 text-xs font-semibold text-red-900 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
