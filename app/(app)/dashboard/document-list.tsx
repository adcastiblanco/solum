"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Spinner } from "@/components/spinner";

export type DocumentRow = {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "done" | "error";
  error_message: string | null;
  created_at: string;
};

function StatusBadge({
  status,
  errorMessage,
}: {
  status: DocumentRow["status"];
  errorMessage: string | null;
}) {
  const base =
    "inline-flex items-center rounded-[var(--r-sm)] px-2 py-0.5 font-mono text-xs uppercase tracking-wide";

  if (status === "error") {
    return (
      <span
        className={`${base} border border-[var(--gray-200)] bg-white text-navy cursor-help`}
        title={errorMessage ?? "Extraction failed"}
      >
        Error
      </span>
    );
  }

  return (
    <span className={`${base} bg-navy-light text-navy`}>{status}</span>
  );
}

function RetryButton({
  documentId,
  onRetry,
}: {
  documentId: string;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
    } catch {
      // surfaces back through the documents row on next poll
    } finally {
      onRetry();
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-navy transition-all duration-150 hover:bg-navy-light disabled:opacity-50"
    >
      {busy && <Spinner size={11} />}
      <span>{busy ? "Retrying" : "Retry"}</span>
    </button>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  // Fixed locale + UTC to keep server and client output identical and avoid
  // React hydration mismatches (error #418). The previous undefined locale
  // produced different strings between Node SSR and the user's browser.
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

export function DocumentList({
  documents,
  onRetry,
}: {
  documents: DocumentRow[];
  onRetry: () => void;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (documents.length === 0) {
    return (
      <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--gray-200)] bg-white px-8 py-16 text-center">
        <p className="font-serif italic text-2xl text-navy mb-2">
          No documents yet
        </p>
        <p className="font-sans text-sm text-[var(--gray-600)] max-w-md mx-auto">
          Upload a PDF using the button above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
      <table className="w-full text-left">
        <thead className="bg-[var(--gray-50)] text-[var(--gray-600)]">
          <tr>
            <th className="px-4 py-3 font-mono text-xs uppercase tracking-wide">
              File
            </th>
            <th className="px-4 py-3 font-mono text-xs uppercase tracking-wide">
              Status
            </th>
            <th className="px-4 py-3 font-mono text-xs uppercase tracking-wide">
              Uploaded
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const clickable = doc.status === "done";
            const isPending = pendingId === doc.id;
            return (
              <tr
                key={doc.id}
                onClick={() => {
                  if (!clickable || isPending) return;
                  setPendingId(doc.id);
                  // useTransition keeps the row interactive during the RSC
                  // navigation; loading.tsx fills the screen during the SSR.
                  startTransition(() => {
                    router.push(`/review/${doc.id}`);
                  });
                }}
                className={`border-t border-[var(--gray-100)] transition-colors ${
                  clickable
                    ? "cursor-pointer hover:bg-navy-light"
                    : "hover:bg-[var(--gray-50)]"
                } ${isPending ? "bg-navy-light" : ""}`}
              >
                <td className="px-4 py-3 font-sans text-sm text-navy">
                  <span className="inline-flex items-center gap-2">
                    {isPending && <Spinner size={12} />}
                    {doc.file_name}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={doc.status}
                      errorMessage={doc.error_message}
                    />
                    {doc.status === "error" && (
                      <RetryButton documentId={doc.id} onRetry={onRetry} />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--gray-600)]">
                  {formatTimestamp(doc.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
