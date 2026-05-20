"use client";

// Branded fallback for any error thrown inside the route segment. Next.js
// renders this automatically. Without it, runtime errors fall back to the
// default Vercel error page — which doesn't match the app and tells the user
// nothing useful.

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep a server-side trace via Vercel's runtime logs.
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="font-serif italic text-4xl text-navy mb-2">
          Something went wrong
        </h1>
        <p className="font-sans text-sm text-[var(--gray-600)] max-w-md">
          The page hit an unexpected error. You can try again, or go back to
          the dashboard.
        </p>
      </div>
      {error.digest && (
        <p className="font-mono text-xs text-[var(--gray-400)]">
          ref: {error.digest}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-[var(--r-sm)] bg-navy px-4 py-2 font-sans text-sm text-white transition-colors hover:bg-[var(--navy-mid)]"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-4 py-2 font-sans text-sm text-navy transition-colors hover:bg-navy-light"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
